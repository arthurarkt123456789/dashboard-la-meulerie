import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ApiticSale } from "./raw-types";

// ────────────────────────────────────────────────────────────────────────
// Filesystem cache for sales-per-fiscal-date.
// Closed days are immutable → cached forever.
// Today (current fiscal date in Europe/Paris) has a short TTL.
// ────────────────────────────────────────────────────────────────────────

const CACHE_DIR =
  process.env.APITIC_CACHE_DIR || path.join(process.cwd(), ".cache", "apitic");
const TODAY_TTL_MS = 60 * 1000;

function fileFor(accountId: string, date: string): string {
  return path.join(CACHE_DIR, accountId, `${date}.json`);
}

function todayInParis(): string {
  // YYYY-MM-DD in Europe/Paris
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

type CacheEntry = {
  fetchedAt: number;
  sales: ApiticSale[];
};

export async function readSalesCache(
  accountId: string,
  date: string,
): Promise<ApiticSale[] | null> {
  const file = fileFor(accountId, date);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;
    const isToday = date === todayInParis();
    if (isToday && Date.now() - entry.fetchedAt > TODAY_TTL_MS) {
      return null; // stale
    }
    return entry.sales;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return null;
    if (e.code === "EACCES" || e.code === "EROFS") return null;
    throw err;
  }
}

export async function writeSalesCache(
  accountId: string,
  date: string,
  sales: ApiticSale[],
): Promise<void> {
  const file = fileFor(accountId, date);
  const entry: CacheEntry = { fetchedAt: Date.now(), sales };
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(entry), "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // Read-only fs (Vercel, etc.) — silently skip. Reads will just miss.
    if (e.code === "EACCES" || e.code === "EROFS" || e.code === "EPERM") return;
    throw err;
  }
}

/**
 * Convenience: read from cache or call the fetcher and persist.
 * `force` bypasses the cache (used for the live-today refresh path).
 */
export async function getOrFetchSales(
  accountId: string,
  date: string,
  fetcher: () => Promise<ApiticSale[]>,
  options: { force?: boolean } = {},
): Promise<ApiticSale[]> {
  if (!options.force) {
    const hit = await readSalesCache(accountId, date);
    if (hit !== null) return hit;
  }
  const fresh = await fetcher();
  await writeSalesCache(accountId, date, fresh);
  return fresh;
}
