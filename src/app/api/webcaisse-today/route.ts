import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// UUID → our internal store ID
const ACCOUNT_MAP: Record<string, string> = {
  "033711eca5ca84f82b31c92d6456ac48": "malmousque",
  "e33a95762a358c3893af6d71ebd823f2": "davso",
  "ed3a3872726b31b359f7b889ec04dc3e": "endoume",
  "0401b95b044be70b94bf4d0264f1a209": "republique",
};

export type WebcaisseStore = {
  ca: number;
  caHT: number;
  tx: number;
  name: string;
};

export type WebcaisseTodayResponse = {
  date: string;
  fetchedAt: string;
  stores: Record<string, WebcaisseStore>;
  global: { ca: number; caHT: number; tx: number };
  tokenExpiresAt: string | null;
};

// ── Token cache (module-level: survives between requests in the same process) ─
let tokenCache: { value: string; expiresAt: number } | null = null;

function decodeExp(jwt: string): number | null {
  try {
    const payload = JSON.parse(
      atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Known WebCaisse auth endpoints — tried in order until one succeeds
const AUTH_ENDPOINTS = [
  "https://api3.web-caisse.com/v1/auth/login",
  "https://api3.web-caisse.com/v1/apibusiness/auth/login",
  "https://api3.web-caisse.com/v1/users/login",
  "https://api3.web-caisse.com/v1/apibusiness/users/login",
];

async function loginWithCredentials(
  email: string,
  password: string,
): Promise<string | null> {
  for (const url of AUTH_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://apibusiness.web-caisse.com",
          Referer: "https://apibusiness.web-caisse.com/",
        },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const token =
          (data.token as string | undefined) ??
          (data.access_token as string | undefined) ??
          (data.jwt as string | undefined) ??
          (data.authToken as string | undefined);
        if (token) {
          console.log(`[webcaisse] auto-login succeeded via ${url}`);
          return token;
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

// Refresh threshold: re-login when < 2 days remain on the current token
const REFRESH_MS = 2 * 86_400_000;

async function getToken(): Promise<string | null> {
  const now = Date.now();

  // Use cached token if it has > 2 days left
  if (tokenCache && tokenCache.expiresAt - now > REFRESH_MS) {
    return tokenCache.value;
  }

  // Attempt credential-based auto-refresh
  const email = process.env.WEBCAISSE_EMAIL;
  const password = process.env.WEBCAISSE_PASSWORD;
  if (email && password) {
    const fresh = await loginWithCredentials(email, password);
    if (fresh) {
      const expiresAt = decodeExp(fresh) ?? now + 30 * 86_400_000;
      tokenCache = { value: fresh, expiresAt };
      return fresh;
    }
    // Login failed — fall through to static token
    console.warn("[webcaisse] credential login failed, falling back to WEBCAISSE_TOKEN");
  }

  // Fall back to static env var (set manually on Railway)
  const envToken = process.env.WEBCAISSE_TOKEN;
  if (envToken) {
    const expiresAt = decodeExp(envToken) ?? now + 86_400_000;
    tokenCache = { value: envToken, expiresAt };
    return envToken;
  }

  return null;
}

export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json(
      { error: "WEBCAISSE_TOKEN not configured" },
      { status: 503 },
    );
  }

  const today = new Date()
    .toLocaleString("sv-SE", { timeZone: "Europe/Paris" })
    .slice(0, 10);

  let upstream: Response;
  try {
    upstream = await fetch(
      "https://api3.web-caisse.com/v1/apibusiness/global-data",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://apibusiness.web-caisse.com",
          Referer: "https://apibusiness.web-caisse.com/",
        },
        body: JSON.stringify({ from: today, to: today, type: "period", previous: false }),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Network error reaching web-caisse" },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    // Token may have been rejected — clear cache so next request re-logins
    if (upstream.status === 401 || upstream.status === 403) {
      tokenCache = null;
    }
    return NextResponse.json(
      { error: "Web-caisse API error", status: upstream.status },
      { status: 502 },
    );
  }

  const data = await upstream.json();

  const stores: Record<string, WebcaisseStore> = {};
  for (const [uuid, account] of Object.entries(
    data.accounts as Record<string, Record<string, unknown>>,
  )) {
    const storeId = ACCOUNT_MAP[uuid];
    if (!storeId) continue;
    stores[storeId] = {
      ca: (account.turnoverTtc as number) ?? 0,
      caHT: (account.turnoverHt as number) ?? 0,
      tx: (account.salesTotal as number) ?? 0,
      name: (account.name as string) ?? storeId,
    };
  }

  const tokenExpiresAt = tokenCache?.expiresAt
    ? new Date(tokenCache.expiresAt).toISOString()
    : null;

  const response: WebcaisseTodayResponse = {
    date: today,
    fetchedAt: new Date().toISOString(),
    stores,
    global: {
      ca: data.global?.turnoverTtc ?? 0,
      caHT: data.global?.turnoverHt ?? 0,
      tx: data.global?.salesTotal ?? 0,
    },
    tokenExpiresAt,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
