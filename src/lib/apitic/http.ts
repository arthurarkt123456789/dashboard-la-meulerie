import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import type { ApiticTokenResponse } from "./raw-types";

// APITIC's busier accounts (Malmousque, République) regularly take 20–60s
// to establish a connection. Node's global fetch (also undici under the
// hood) uses a 10s default connect timeout that Next.js's fetch wrapper
// doesn't let us override globally. Use undici's fetch directly with our
// own Agent so the dispatcher actually applies.
const apiticAgent = new Agent({
  connect: { timeout: 60_000 },
  headersTimeout: 120_000,
  bodyTimeout: 120_000,
  keepAliveTimeout: 30_000,
});

// ────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────

function getConfig() {
  const baseUrl = process.env.APITIC_BASE_URL;
  const email = process.env.APITIC_EMAIL;
  const password = process.env.APITIC_PASSWORD;
  if (!baseUrl || !email || !password) {
    throw new ApiticConfigError(
      "APITIC_BASE_URL, APITIC_EMAIL and APITIC_PASSWORD must be set.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, password };
}

// ────────────────────────────────────────────────────────────────────────
// Typed errors
// ────────────────────────────────────────────────────────────────────────

export class ApiticConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiticConfigError";
  }
}

export class ApiticBlackoutError extends Error {
  constructor(public readonly windowLabel: string) {
    super(`APITIC blackout window: ${windowLabel}`);
    this.name = "ApiticBlackoutError";
  }
}

export class ApiticHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string | null,
  ) {
    super(message);
    this.name = "ApiticHttpError";
  }
}

// ────────────────────────────────────────────────────────────────────────
// Blackout windows (Europe/Paris time)
// Doc: 05:00-06:00, 11:30-14:30, 18:30-22:30 CET
// ────────────────────────────────────────────────────────────────────────

const BLACKOUTS: { start: number; end: number; label: string }[] = [
  { start: 5 * 60, end: 6 * 60, label: "05:00–06:00 CET" },
  { start: 11 * 60 + 30, end: 14 * 60 + 30, label: "11:30–14:30 CET" },
  { start: 18 * 60 + 30, end: 22 * 60 + 30, label: "18:30–22:30 CET" },
];

/** Returns the blackout label if we're currently in one, null otherwise. */
export function currentBlackout(now: Date = new Date()): string | null {
  // The doc says "CET" but APITIC's actual blackouts track Paris wall-clock
  // time (CEST in summer). Observed empirically: 503 on /token at 11:53 Paris
  // CEST in May, i.e. inside the lunch window if interpreted as Paris time.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minOfDay = hour * 60 + minute;
  const hit = BLACKOUTS.find((b) => minOfDay >= b.start && minOfDay < b.end);
  return hit ? hit.label : null;
}

// ────────────────────────────────────────────────────────────────────────
// Token cache
// ────────────────────────────────────────────────────────────────────────

type TokenState = {
  token: string;
  expiresAt: number; // epoch ms
};

let cachedToken: TokenState | null = null;
let inflightToken: Promise<TokenState> | null = null;

async function fetchToken(): Promise<TokenState> {
  const { baseUrl, email, password } = getConfig();
  const res = await undiciFetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    dispatcher: apiticAgent,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => null);
    throw new ApiticHttpError(
      `POST /token failed: ${res.status}`,
      res.status,
      body,
    );
  }
  const json = (await res.json()) as ApiticTokenResponse;
  // expired_at is "YYYY-MM-DD HH:mm:ss". Parse as UTC (their docs aren't clear
  // about tz; UTC is the safest assumption — if wrong we just refresh sooner).
  const expiresAt = parseApiticDate(json.access_token_expired_at);
  return { token: json.access_token, expiresAt };
}

async function getToken(): Promise<string> {
  // refresh 60s before actual expiry
  const SAFETY = 60_000;
  if (cachedToken && cachedToken.expiresAt - SAFETY > Date.now()) {
    return cachedToken.token;
  }
  if (!inflightToken) {
    inflightToken = fetchToken()
      .then((t) => {
        cachedToken = t;
        return t;
      })
      .finally(() => {
        inflightToken = null;
      });
  }
  const t = await inflightToken;
  return t.token;
}

function parseApiticDate(s: string): number {
  // "YYYY-MM-DD HH:mm:ss" → epoch ms (treated as UTC)
  const iso = s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now() + 5 * 60 * 1000;
}

// ────────────────────────────────────────────────────────────────────────
// Rate limiter — concurrency cap (10 in-flight)
// The 10 req/s rate is enforced server-side; we just throttle concurrency
// and rely on retry-on-429 for bursts.
// ────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 8;
let inflight = 0;
const queue: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (inflight < MAX_CONCURRENT) {
    inflight++;
    return;
  }
  await new Promise<void>((resolve) => {
    queue.push(() => {
      inflight++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  inflight--;
  const next = queue.shift();
  if (next) next();
}

// ────────────────────────────────────────────────────────────────────────
// Core authed fetch with retry on 429, blackout guard, slot acquisition
// ────────────────────────────────────────────────────────────────────────

type FetchOpts = {
  /** Skip the blackout guard. Useful for `/token` which presumably stays available. */
  ignoreBlackout?: boolean;
  /** Max attempts on transient errors (429, 5xx). Default 3. */
  maxAttempts?: number;
};

export async function apiticFetch(
  path: string,
  opts: FetchOpts = {},
): Promise<unknown> {
  const ignoreBlackout = opts.ignoreBlackout ?? false;
  const maxAttempts = opts.maxAttempts ?? 3;

  if (!ignoreBlackout) {
    const window = currentBlackout();
    if (window) throw new ApiticBlackoutError(window);
  }

  const { baseUrl } = getConfig();

  await acquireSlot();
  try {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const token = await getToken();
      const res = await undiciFetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        dispatcher: apiticAgent,
      });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 401 && attempt === 1) {
        // token may have been revoked — force a refresh and retry once
        cachedToken = null;
        continue;
      }
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
        lastError = new ApiticHttpError(
          `${path} ${res.status}`,
          res.status,
          null,
        );
        continue;
      }
      const body = await res.text().catch(() => null);
      throw new ApiticHttpError(
        `GET ${path} failed: ${res.status}`,
        res.status,
        body,
      );
    }
    throw lastError ?? new ApiticHttpError("retries exhausted", 0, null);
  } finally {
    releaseSlot();
  }
}
