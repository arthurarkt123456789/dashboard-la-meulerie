import "server-only";

// File d'attente partagée pour l'API Pennylane : 2 requêtes en vol maximum, 350 ms minimum
// entre deux départs, reprise automatique sur 429 et 5xx (Retry-After respecté).

const MAX_IN_FLIGHT = 2;
const MIN_GAP_MS = 350;
const MAX_RETRIES = 6;

let inFlight = 0;
let lastStart = 0;
const waiters: (() => void)[] = [];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function acquire(): Promise<void> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inFlight++;
  const wait = lastStart + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
}

function release() {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

export class PennylaneHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PennylaneHttpError";
    this.status = status;
  }
}

/** fetch Pennylane avec limitation de débit et reprise. Lève PennylaneHttpError si la réponse n'est pas 2xx. */
export async function pennylaneFetch(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  for (;;) {
    await acquire();
    let res: Response;
    try {
      res = await fetch(url, { ...init, cache: "no-store" });
    } catch (err) {
      release();
      if (attempt >= MAX_RETRIES) throw err;
      attempt++;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    release();
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 600 * 2 ** attempt;
      attempt++;
      console.warn(`[pennylane] ${res.status} sur ${url.split("?")[0]} : nouvel essai dans ${delay} ms (${attempt}/${MAX_RETRIES})`);
      await res.text().catch(() => "");
      await sleep(delay);
      continue;
    }
    const body = await res.text().catch(() => "");
    throw new PennylaneHttpError(res.status, `Pennylane ${new URL(url).pathname.replace("/api/external/v2/", "")} ${res.status}: ${body.slice(0, 200)}`);
  }
}
