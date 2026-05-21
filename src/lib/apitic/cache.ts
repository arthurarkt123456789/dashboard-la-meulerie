import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ApiticSale } from "./raw-types";
import { getSql, isConfigured, ready } from "./db";

// ────────────────────────────────────────────────────────────────────────
// Cache for sales-per-fiscal-date.
// Primary: Postgres (via DATABASE_URL — Railway/Supabase/etc.)
// Fallback: filesystem (.cache/apitic/{account}/{date}.json) for local dev
//          when no DATABASE_URL is configured.
//
// Closed days are immutable → cached forever.
// Today (current fiscal date in Europe/Paris) has a short TTL.
// ────────────────────────────────────────────────────────────────────────

const FS_CACHE_DIR =
  process.env.APITIC_CACHE_DIR || path.join(process.cwd(), ".cache", "apitic");
const TODAY_TTL_MS = 60 * 1000;

function fsFileFor(accountId: string, date: string): string {
  return path.join(FS_CACHE_DIR, accountId, `${date}.json`);
}

function todayInParis(): string {
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

type CacheRow = {
  fetched_at: Date;
  sales: ApiticSale[] | string;
};

// postgres lib doesn't auto-parse jsonb when `prepare: false` is set (which
// we need for pgbouncer transaction pooler compatibility). So jsonb values
// arrive as strings. Parse defensively.
function parseSales(raw: ApiticSale[] | string | null | undefined): ApiticSale[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ApiticSale[];
    } catch {
      return [];
    }
  }
  return raw;
}

// ────────────────────────────────────────────────────────────────────────
// Postgres backend
// ────────────────────────────────────────────────────────────────────────

async function readPg(
  accountId: string,
  date: string,
): Promise<ApiticSale[] | null> {
  await ready();
  const sql = getSql();
  const rows = await sql<CacheRow[]>`
    select fetched_at, sales
    from apitic_sales_cache
    where account_id = ${accountId} and date = ${date}
    limit 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  const isToday = date === todayInParis();
  if (isToday && Date.now() - new Date(row.fetched_at).getTime() > TODAY_TTL_MS) {
    return null;
  }
  return parseSales(row.sales);
}

async function writePg(
  accountId: string,
  date: string,
  sales: ApiticSale[],
): Promise<void> {
  await ready();
  const sql = getSql();
  // postgres lib's .json() expects a JSON-object/array type; ApiticSale[] is
  // structurally fine but the index-signature constraint is strict. Stringify
  // and cast to jsonb explicitly.
  const payload = JSON.stringify(sales);
  await sql`
    insert into apitic_sales_cache (account_id, date, fetched_at, sales)
    values (${accountId}, ${date}, now(), ${payload}::jsonb)
    on conflict (account_id, date) do update
      set fetched_at = excluded.fetched_at,
          sales = excluded.sales
  `;
}

// ────────────────────────────────────────────────────────────────────────
// Filesystem backend (fallback / local dev)
// ────────────────────────────────────────────────────────────────────────

type FsCacheEntry = { fetchedAt: number; sales: ApiticSale[] };

async function readFs(
  accountId: string,
  date: string,
): Promise<ApiticSale[] | null> {
  try {
    const raw = await fs.readFile(fsFileFor(accountId, date), "utf-8");
    const entry = JSON.parse(raw) as FsCacheEntry;
    const isToday = date === todayInParis();
    if (isToday && Date.now() - entry.fetchedAt > TODAY_TTL_MS) return null;
    return entry.sales;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT" || e.code === "EACCES" || e.code === "EROFS") {
      return null;
    }
    throw err;
  }
}

async function writeFs(
  accountId: string,
  date: string,
  sales: ApiticSale[],
): Promise<void> {
  const file = fsFileFor(accountId, date);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({ fetchedAt: Date.now(), sales } satisfies FsCacheEntry),
      "utf-8",
    );
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EACCES" || e.code === "EROFS" || e.code === "EPERM") return;
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public surface
// ────────────────────────────────────────────────────────────────────────

export async function readSalesCache(
  accountId: string,
  date: string,
): Promise<ApiticSale[] | null> {
  if (isConfigured()) {
    try {
      return await readPg(accountId, date);
    } catch (err) {
      console.warn(
        `[apitic-cache] PG read failed, falling back to fs: ${(err as Error).message}`,
      );
      return readFs(accountId, date);
    }
  }
  return readFs(accountId, date);
}

export async function writeSalesCache(
  accountId: string,
  date: string,
  sales: ApiticSale[],
): Promise<void> {
  if (isConfigured()) {
    try {
      await writePg(accountId, date, sales);
      return;
    } catch (err) {
      console.warn(
        `[apitic-cache] PG write failed, falling back to fs: ${(err as Error).message}`,
      );
    }
  }
  await writeFs(accountId, date, sales);
}

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

// ────────────────────────────────────────────────────────────────────────
// Bulk helper for chunked bootstrap — returns which dates are already cached
// so the aggregator can avoid touching APITIC for them.
// ────────────────────────────────────────────────────────────────────────

export async function listCachedDates(
  accountId: string,
  dates: string[],
): Promise<Set<string>> {
  if (!isConfigured()) {
    const set = new Set<string>();
    await Promise.all(
      dates.map(async (d) => {
        try {
          await fs.access(fsFileFor(accountId, d));
          set.add(d);
        } catch {
          /* not cached */
        }
      }),
    );
    return set;
  }
  await ready();
  const sql = getSql();
  const rows = await sql<{ date: string }[]>`
    select to_char(date, 'YYYY-MM-DD') as date
    from apitic_sales_cache
    where account_id = ${accountId}
      and date = any(${dates}::date[])
  `;
  return new Set(rows.map((r) => r.date));
}

// ────────────────────────────────────────────────────────────────────────
// Reference data cache (products / categories / payment_means)
// Survives APITIC blackouts so the segment routing stays accurate even
// when live fetches are rejected.
// ────────────────────────────────────────────────────────────────────────

type RefKind = "products" | "categories" | "payment_means";
// Reference data is essentially immutable (products/categories edited
// occasionally, but their IDs are stable). Cache for a week so we rarely
// re-fetch — and crucially, never expire mid-blackout when APITIC is
// completely unreachable (even /token is 503).
const REF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function readRefs<T>(
  accountId: string,
  kind: RefKind,
): Promise<{ data: T[]; ageMs: number } | null> {
  if (!isConfigured()) return null;
  try {
    await ready();
    const sql = getSql();
    const rows = await sql<
      { fetched_at: Date; data: T[] | string }[]
    >`
      select fetched_at, data
      from apitic_refs_cache
      where account_id = ${accountId} and kind = ${kind}
      limit 1
    `;
    if (rows.length === 0) return null;
    const row = rows[0];
    const parsed: T[] =
      typeof row.data === "string"
        ? (JSON.parse(row.data) as T[])
        : (row.data as T[]);
    return {
      data: parsed,
      ageMs: Date.now() - new Date(row.fetched_at).getTime(),
    };
  } catch (err) {
    console.warn(`[apitic-cache] readRefs ${kind} failed: ${(err as Error).message}`);
    return null;
  }
}

export async function writeRefs<T>(
  accountId: string,
  kind: RefKind,
  data: T[],
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await ready();
    const sql = getSql();
    const payload = JSON.stringify(data);
    await sql`
      insert into apitic_refs_cache (account_id, kind, fetched_at, data)
      values (${accountId}, ${kind}, now(), ${payload}::jsonb)
      on conflict (account_id, kind) do update
        set fetched_at = excluded.fetched_at,
            data = excluded.data
    `;
  } catch (err) {
    console.warn(
      `[apitic-cache] writeRefs ${kind} failed: ${(err as Error).message}`,
    );
  }
}

/**
 * Read-cache-first wrapper: fetch live if no fresh cache, return stale on
 * failure so blackouts/network issues don't blank the data. Returns null
 * only when there's no cache at all AND the fetch fails.
 */
export async function getOrFetchRefs<T>(
  accountId: string,
  kind: RefKind,
  fetcher: () => Promise<T[]>,
): Promise<T[]> {
  const cached = await readRefs<T>(accountId, kind);
  if (cached && cached.ageMs < REF_TTL_MS) return cached.data;
  try {
    const fresh = await fetcher();
    await writeRefs(accountId, kind, fresh);
    return fresh;
  } catch (err) {
    if (cached) {
      console.warn(
        `[apitic-cache] live ${kind} fetch failed (${(err as Error).message}); serving stale cache (age ${Math.round(cached.ageMs / 60000)} min)`,
      );
      return cached.data;
    }
    throw err;
  }
}

/**
 * Batched read: returns a Map<dateISO, ApiticSale[]> for every cached date
 * in `dates`. Missing keys mean not cached. Today is excluded — callers
 * should always fetch today live.
 */
export async function readSalesCacheBatch(
  accountId: string,
  dates: string[],
): Promise<Map<string, ApiticSale[]>> {
  const result = new Map<string, ApiticSale[]>();
  if (dates.length === 0) return result;
  if (!isConfigured()) {
    await Promise.all(
      dates.map(async (d) => {
        const hit = await readFs(accountId, d);
        if (hit !== null) result.set(d, hit);
      }),
    );
    return result;
  }
  await ready();
  const sql = getSql();
  const rows = await sql<{ date: string; sales: ApiticSale[] | string }[]>`
    select to_char(date, 'YYYY-MM-DD') as date, sales
    from apitic_sales_cache
    where account_id = ${accountId}
      and date = any(${dates}::date[])
  `;
  for (const row of rows) result.set(row.date, parseSales(row.sales));
  return result;
}
