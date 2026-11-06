import "server-only";

// Lecture paginée de toutes les transactions bancaires Pennylane (API v2, GET /transactions).
// Le token doit avoir le scope transactions:readonly.

const PENNYLANE_BASE = "https://app.pennylane.com/api/external/v2";

export type RawBankTx = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // négatif = sortie
  label: string;
  bankAccountId: string | null;
  categorized: boolean;
};

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.cents !== undefined) return Number(o.cents) / 100;
    return toNum(o.amount ?? o.value ?? 0);
  }
  return 0;
};
const toStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

function parseRow(raw: unknown): RawBankTx | null {
  const row = raw as Record<string, unknown>;
  const date = toStr(row.date ?? row.transaction_date ?? row.settlement_date ?? "").slice(0, 10);
  if (date.length !== 10) return null;
  const bank = row.bank_account as Record<string, unknown> | undefined;
  const categories = Array.isArray(row.categories) ? row.categories : [];
  return {
    id: toStr(row.id),
    date,
    amount: toNum(row.amount ?? row.currency_amount ?? 0),
    label: toStr(row.label ?? row.wording ?? row.description ?? row.name ?? ""),
    bankAccountId: toStr(row.bank_account_id ?? bank?.id ?? "") || null,
    categorized: typeof row.categorized === "boolean" ? row.categorized : categories.length > 0,
  };
}

async function fetchPage(
  token: string,
  path: string,
  params: URLSearchParams,
): Promise<{ rows: unknown[]; next: string | null; status: number }> {
  const res = await fetch(`${PENNYLANE_BASE}/${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Pennylane ${path} ${res.status}: ${body.slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as Record<string, unknown>;
  const rows: unknown[] =
    (Array.isArray(json.items) ? json.items : null) ??
    (Array.isArray(json.transactions) ? json.transactions : null) ??
    (Array.isArray(json.bank_transactions) ? json.bank_transactions : null) ??
    (Array.isArray(json.data) ? (json.data as unknown[]) : null) ??
    [];
  const meta = json.meta as { next_cursor?: string } | undefined;
  const next = json.has_more === false ? null : ((json.next_cursor as string | undefined) ?? meta?.next_cursor ?? null);
  return { rows, next, status: res.status };
}

/**
 * Toutes les transactions entre minDate et maxDate inclus.
 * Essaie /transactions avec filtre DSL, puis sans filtre (tri -date, arrêt local), puis /bank_transactions.
 */
export async function fetchAllTransactions(
  token: string,
  minDate: string,
  maxDate: string,
  opts: { maxPages?: number } = {},
): Promise<RawBankTx[]> {
  const maxPages = opts.maxPages ?? 80;
  const attempts: { path: string; build: () => URLSearchParams; localStop: boolean }[] = [
    {
      path: "transactions",
      build: () => {
        const p = new URLSearchParams();
        p.set("limit", "100");
        p.set(
          "filter",
          JSON.stringify([
            { field: "date", operator: "gteq", value: minDate },
            { field: "date", operator: "lteq", value: maxDate },
          ]),
        );
        return p;
      },
      localStop: false,
    },
    {
      path: "transactions",
      build: () => {
        const p = new URLSearchParams();
        p.set("limit", "100");
        p.set("sort", "-date");
        return p;
      },
      localStop: true,
    },
    {
      path: "bank_transactions",
      build: () => {
        const p = new URLSearchParams({ min_date: minDate, max_date: maxDate });
        p.set("page[per_page]", "200");
        return p;
      },
      localStop: false,
    },
  ];

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      const out: RawBankTx[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      let stop = false;
      do {
        const params = attempt.build();
        if (cursor) params.set("cursor", cursor);
        const page = await fetchPage(token, attempt.path, params);
        pages++;
        for (const raw of page.rows) {
          const tx = parseRow(raw);
          if (!tx) continue;
          if (attempt.localStop && tx.date < minDate) {
            stop = true;
            continue;
          }
          if (tx.date < minDate || tx.date > maxDate) continue;
          if (seen.has(tx.id)) continue;
          seen.add(tx.id);
          out.push(tx);
        }
        cursor = stop || page.rows.length === 0 ? null : page.next;
      } while (cursor && pages < maxPages);
      console.log(`[pennylane/tx] ${attempt.path}: ${out.length} tx, ${pages} page(s) (${minDate} → ${maxDate})`);
      return out.sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      lastErr = err as Error;
      const status = (err as { status?: number }).status;
      // 401/403 : problème de scope, inutile d'essayer les variantes.
      if (status === 401 || status === 403) throw err;
      console.warn(`[pennylane/tx] ${attempt.path} échec, variante suivante:`, lastErr.message);
    }
  }
  throw lastErr ?? new Error("Pennylane transactions: aucune variante n'a répondu");
}
