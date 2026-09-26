import "server-only";
import { getSql, isConfigured, ready } from "./apitic/db";

export type UberEatsRow = {
  date: string;      // YYYY-MM-DD
  salesTtc: number;  // € TTC ("Ventes" column)
  ticketCount: number; // ("Commandes" column)
};

// Livraison/emporter → TVA 10%
export const UE_VAT_RATE = 0.10;

// ─── CSV parsing ───────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  const r = raw.trim().replace(/^"|"$/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  const dmY = r.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, "0")}-${dmY[1].padStart(2, "0")}`;
  return null;
}

function parseAmount(raw: string): number {
  let s = raw.trim().replace(/^"|"$/g, "").replace(/[€$£  ]/g, "");
  if (s.includes(",") && s.includes(".")) {
    // "1.234,56" → dot=thousands, comma=decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    const afterComma = s.slice(s.lastIndexOf(",") + 1);
    s = afterComma.length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  return parseFloat(s) || 0;
}

/** Parse the Uber Eats CSV export (semicolon or comma separated). */
export function parseUberEatsCSV(csvText: string): UberEatsRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));

  const dateIdx = header.findIndex((h) => h === "Date de début" || h === "Date de fin");
  const ventesIdx = header.findIndex((h) => h === "Ventes");
  const commandesIdx = header.findIndex((h) => h === "Commandes");

  if (ventesIdx === -1) throw new Error("Colonne 'Ventes' introuvable dans le CSV");
  if (dateIdx === -1) throw new Error("Colonne 'Date de début' introuvable dans le CSV");

  const rows: UberEatsRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(sep);
    const date = parseDate(cols[dateIdx] ?? "");
    if (!date) continue;
    const salesTtc = Math.round(parseAmount(cols[ventesIdx] ?? "0") * 100) / 100;
    const ticketCount = commandesIdx >= 0 ? Math.round(parseAmount(cols[commandesIdx] ?? "0")) : 0;
    if (salesTtc > 0) rows.push({ date, salesTtc, ticketCount });
  }
  return rows;
}

// ─── DB read/write ─────────────────────────────────────────────────────────

async function ensureTable(): Promise<void> {
  // Called lazily; ready() also creates it but may not have run yet if
  // the caller bypasses the main schema init path.
  await ready();
}

export async function saveUberEatsRows(
  storeId: string,
  rows: UberEatsRow[],
): Promise<{ saved: number }> {
  if (rows.length === 0) return { saved: 0 };

  if (!isConfigured()) {
    return fsSave(storeId, rows);
  }

  await ensureTable();
  const sql = getSql();
  for (const row of rows) {
    await sql`
      insert into uber_eats_imports (store_id, date, sales_ttc, ticket_count, imported_at)
      values (${storeId}, ${row.date}::date, ${row.salesTtc}, ${row.ticketCount}, now())
      on conflict (store_id, date) do update
        set sales_ttc = excluded.sales_ttc,
            ticket_count = excluded.ticket_count,
            imported_at = now()
    `;
  }
  return { saved: rows.length };
}

export async function getUberEatsForStore(
  storeId: string,
  from: string,
  to: string,
): Promise<Map<string, UberEatsRow>> {
  const result = new Map<string, UberEatsRow>();

  if (!isConfigured()) {
    const fsRows = await fsLoad(storeId);
    for (const row of fsRows) {
      if (row.date >= from && row.date <= to) result.set(row.date, row);
    }
    return result;
  }

  await ensureTable();
  const sql = getSql();
  try {
    const rows = await sql<{ date: string; sales_ttc: string; ticket_count: number }[]>`
      select date::text, sales_ttc::text, ticket_count
      from uber_eats_imports
      where store_id = ${storeId}
        and date >= ${from}::date
        and date <= ${to}::date
    `;
    for (const row of rows) {
      result.set(row.date, {
        date: row.date,
        salesTtc: parseFloat(row.sales_ttc),
        ticketCount: row.ticket_count,
      });
    }
  } catch {
    // Table not yet created — return empty
  }
  return result;
}

export async function listUberEatsByMonth(storeId: string): Promise<
  { month: string; totalSales: number; days: number }[]
> {
  if (!isConfigured()) {
    const rows = await fsLoad(storeId);
    return summariseByMonth(rows);
  }

  await ensureTable();
  const sql = getSql();
  try {
    const rows = await sql<{ date: string; sales_ttc: string }[]>`
      select date::text, sales_ttc::text
      from uber_eats_imports
      where store_id = ${storeId}
      order by date
    `;
    return summariseByMonth(
      rows.map((r) => ({ date: r.date, salesTtc: parseFloat(r.sales_ttc), ticketCount: 0 })),
    );
  } catch {
    return [];
  }
}

function summariseByMonth(
  rows: UberEatsRow[],
): { month: string; totalSales: number; days: number }[] {
  const byMonth = new Map<string, { totalSales: number; days: number }>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const existing = byMonth.get(month) ?? { totalSales: 0, days: 0 };
    existing.totalSales += row.salesTtc;
    existing.days += 1;
    byMonth.set(month, existing);
  }
  return Array.from(byMonth.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

// ─── Filesystem fallback (no DATABASE_URL) ─────────────────────────────────

async function cacheFile(storeId: string): Promise<string> {
  const path = await import("path");
  const dir = process.env.APITIC_CACHE_DIR ?? ".cache/apitic";
  return path.join(dir, `uber_eats_${storeId}.json`);
}

async function fsLoad(storeId: string): Promise<UberEatsRow[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(await cacheFile(storeId), "utf8");
    return JSON.parse(raw) as UberEatsRow[];
  } catch {
    return [];
  }
}

async function fsSave(storeId: string, rows: UberEatsRow[]): Promise<{ saved: number }> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const file = await cacheFile(storeId);
  const dir = path.dirname(file);
  const existing = await fsLoad(storeId);
  const map = new Map(existing.map((r) => [r.date, r]));
  for (const row of rows) map.set(row.date, row);
  const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(sorted));
  return { saved: rows.length };
}
