import "server-only";

const BASE = "https://app.pennylane.com/api/external/v2";

export type BankAccount = { id: number; name: string; balance: number };

export type RawTransaction = {
  id: number;
  amount: number; // positive = inflow, negative = outflow
  date: string; // YYYY-MM-DD
  label: string;
  categories: { id: number; label: string }[];
  outstanding_balance: number; // 0 = matched to accounting entry
};

export type CategoryFlow = {
  label: string;
  amount: number;
  direction: "in" | "out";
  justified: boolean;
};

export type MonthCashflow = {
  month: string; // YYYY-MM
  inflows: number;
  outflows: number;
  net: number;
  categoryBreakdown: CategoryFlow[];
};

async function pennylaneList<T>(
  token: string,
  path: string,
  extraParams: Record<string, string> = {},
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < 500; i++) {
    const p = new URLSearchParams({ limit: "500", ...extraParams });
    if (cursor) p.set("cursor", cursor);

    const res = await fetch(`${BASE}/${path}?${p}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2500));
      i--;
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pennylane ${path} ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    items.push(...((Array.isArray(json.items) ? json.items : []) as T[]));
    if (!json.has_more || !json.next_cursor) break;
    cursor = json.next_cursor as string;
  }

  return items;
}

export async function fetchBankAccounts(token: string): Promise<BankAccount[]> {
  const raw = await pennylaneList<Record<string, unknown>>(token, "bank_accounts");
  return raw.map((a) => ({
    id: Number(a.id),
    name: String(a.name ?? ""),
    balance: parseFloat(String(a.balance ?? "0")) || 0,
  }));
}

export async function fetchTransactions(
  token: string,
  fromDate: string,
  toDate: string,
): Promise<RawTransaction[]> {
  const filter = JSON.stringify([
    { field: "date", operator: "gteq", value: fromDate },
    { field: "date", operator: "lteq", value: toDate },
  ]);
  const raw = await pennylaneList<Record<string, unknown>>(token, "transactions", { filter });

  return raw.map((t) => ({
    id: Number(t.id),
    amount: parseFloat(String(t.amount ?? "0")) || 0,
    date: String(t.date ?? ""),
    label: String(t.label ?? ""),
    categories: Array.isArray(t.categories)
      ? (t.categories as Record<string, unknown>[]).map((c) => ({
          id: Number(c.id),
          label: String(c.label ?? ""),
        }))
      : [],
    outstanding_balance: parseFloat(String(t.outstanding_balance ?? "0")) || 0,
  }));
}

export function buildMonthlyCashflow(
  transactions: RawTransaction[],
  months: { month: string; start: string; end: string }[],
): MonthCashflow[] {
  const monthSet = new Set(months.map((m) => m.month));
  const byMonth = new Map<string, RawTransaction[]>(months.map((m) => [m.month, []]));

  for (const t of transactions) {
    const ym = t.date.slice(0, 7);
    if (monthSet.has(ym)) byMonth.get(ym)!.push(t);
  }

  return months.map((m) => {
    const txns = byMonth.get(m.month) ?? [];
    let inflows = 0;
    let outflows = 0;

    // Track per-category: { in_j, in_u, out_j, out_u } (justified vs unjustified)
    const catMap = new Map<string, { in_j: number; in_u: number; out_j: number; out_u: number }>();

    for (const t of txns) {
      const catLabel = t.categories.length > 0 ? t.categories[0].label : "Inconnue";
      // Inflows: justified if categorized (card remittances are legitimate)
      // Outflows: justified if fully matched to an accounting entry (outstanding_balance ≈ 0)
      const justified =
        t.amount > 0 ? t.categories.length > 0 : Math.abs(t.outstanding_balance) < 0.01;

      const c = catMap.get(catLabel) ?? { in_j: 0, in_u: 0, out_j: 0, out_u: 0 };
      if (t.amount > 0) {
        inflows += t.amount;
        if (justified) c.in_j += t.amount;
        else c.in_u += t.amount;
      } else if (t.amount < 0) {
        outflows += Math.abs(t.amount);
        if (justified) c.out_j += Math.abs(t.amount);
        else c.out_u += Math.abs(t.amount);
      }
      catMap.set(catLabel, c);
    }

    const categoryBreakdown: CategoryFlow[] = [];
    for (const [label, c] of catMap.entries()) {
      const inTotal = c.in_j + c.in_u;
      const outTotal = c.out_j + c.out_u;
      if (inTotal > 0.01) {
        categoryBreakdown.push({
          label,
          amount: Math.round(inTotal * 100) / 100,
          direction: "in",
          justified: c.in_j >= inTotal * 0.9,
        });
      }
      if (outTotal > 0.01) {
        categoryBreakdown.push({
          label,
          amount: Math.round(outTotal * 100) / 100,
          direction: "out",
          justified: c.out_j >= outTotal * 0.9,
        });
      }
    }
    categoryBreakdown.sort((a, b) => b.amount - a.amount);

    return {
      month: m.month,
      inflows: Math.round(inflows * 100) / 100,
      outflows: Math.round(outflows * 100) / 100,
      net: Math.round((inflows - outflows) * 100) / 100,
      categoryBreakdown,
    };
  });
}
