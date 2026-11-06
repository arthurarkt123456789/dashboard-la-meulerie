import "server-only";
import { pennylaneFetch } from "./throttle";

// Écritures comptables Pennylane v2 : lignes d'écriture (compte PCG) et plan de comptes.
// Scopes : ledger_entries:readonly, ledger_accounts:readonly.

const BASE = "https://app.pennylane.com/api/external/v2";

export type LedgerLine = {
  id: string;
  entryId: string;
  date: string; // YYYY-MM-DD
  label: string;
  debit: number;
  credit: number;
  accountId: string;
  accountNumber: string; // ex. "613200", "401SCOTTO", "512000"
};

export type LedgerAccount = { id: string; number: string; label: string };

const toNum = (v: unknown): number => (typeof v === "number" ? v : parseFloat(String(v ?? "0").replace(",", ".")) || 0);
const toStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

async function getPage(token: string, path: string, params: URLSearchParams) {
  const res = await pennylaneFetch(`${BASE}/${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  const rows: unknown[] =
    (Array.isArray(json.items) ? json.items : null) ??
    (Array.isArray(json.ledger_entry_lines) ? json.ledger_entry_lines : null) ??
    (Array.isArray(json.ledger_accounts) ? json.ledger_accounts : null) ??
    (Array.isArray(json.data) ? (json.data as unknown[]) : null) ??
    [];
  const meta = json.meta as { next_cursor?: string } | undefined;
  const next = json.has_more === false ? null : ((json.next_cursor as string | undefined) ?? meta?.next_cursor ?? null);
  return { rows, next };
}

function parseLine(raw: unknown): LedgerLine | null {
  const r = raw as Record<string, unknown>;
  const acc = (r.ledger_account ?? {}) as Record<string, unknown>;
  const entry = (r.ledger_entry ?? {}) as Record<string, unknown>;
  const date = toStr(r.date ?? entry.date ?? "").slice(0, 10);
  const accountId = toStr(acc.id ?? r.ledger_account_id ?? "");
  if (!accountId) return null;
  return {
    id: toStr(r.id),
    entryId: toStr(entry.id ?? r.ledger_entry_id ?? ""),
    date,
    label: toStr(r.label ?? entry.label ?? ""),
    debit: toNum(r.debit),
    credit: toNum(r.credit),
    accountId,
    accountNumber: toStr(acc.number ?? r.ledger_account_number ?? ""),
  };
}

/** Toutes les lignes d'écriture entre deux dates (pagination par curseur, 100/page). */
export async function fetchLedgerEntryLines(
  token: string,
  minDate: string,
  maxDate: string,
  opts: { maxPages?: number } = {},
): Promise<LedgerLine[]> {
  const maxPages = opts.maxPages ?? 250;
  const out: LedgerLine[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set(
      "filter",
      JSON.stringify([
        { field: "date", operator: "gteq", value: minDate },
        { field: "date", operator: "lteq", value: maxDate },
      ]),
    );
    if (cursor) params.set("cursor", cursor);
    const page = await getPage(token, "ledger_entry_lines", params);
    pages++;
    for (const raw of page.rows) {
      const l = parseLine(raw);
      if (l) out.push(l);
    }
    cursor = page.rows.length ? page.next : null;
  } while (cursor && pages < maxPages);
  console.log(`[pennylane/ledger] ${out.length} lignes, ${pages} page(s) (${minDate} → ${maxDate})`);
  return out;
}

/** Plan de comptes : id → numéro + libellé. */
export async function fetchLedgerAccounts(token: string): Promise<LedgerAccount[]> {
  const out: LedgerAccount[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (cursor) params.set("cursor", cursor);
    const page = await getPage(token, "ledger_accounts", params);
    pages++;
    for (const raw of page.rows) {
      const r = raw as Record<string, unknown>;
      const id = toStr(r.id);
      if (!id) continue;
      out.push({ id, number: toStr(r.number ?? r.formatted_number ?? ""), label: toStr(r.label ?? r.name ?? "") });
    }
    cursor = page.rows.length ? page.next : null;
  } while (cursor && pages < 60);
  return out;
}

/** Date courte compatible avec la lecture au premier chargement si les lignes sont nombreuses. */
export const LEDGER_WINDOW_MONTHS = 8;
