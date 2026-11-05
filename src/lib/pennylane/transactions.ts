import "server-only";

const PENNYLANE_BASE = "https://app.pennylane.com/api/external/v2";

export type BankTransaction = {
  id: string;
  date: string;          // YYYY-MM-DD
  amount: number;        // negative = outflow (bank debit)
  description: string;
  ledgerAccountNumber: string | null;
  ledgerAccountName: string | null;
};

export async function fetchBankTransactions(
  token: string,
  minDate: string,
  maxDate: string,
): Promise<BankTransaction[]> {
  const params = new URLSearchParams({ min_date: minDate, max_date: maxDate });
  params.set("page[per_page]", "200");

  const res = await fetch(`${PENNYLANE_BASE}/bank_transactions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pennylane bank_transactions ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json() as Record<string, unknown>;
  const rawRows: unknown[] =
    (Array.isArray(json.bank_transactions) ? json.bank_transactions : null) ??
    (Array.isArray(json.items) ? json.items : null) ??
    (Array.isArray(json.data) ? json.data : null) ??
    [];

  const toNum = (v: unknown) =>
    typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
  const toStr = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? v : String(v ?? "");

  return rawRows
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      // Category group: might be nested under group/groups[0]/directly on row
      const group =
        (row.group as Record<string, unknown> | null) ??
        (Array.isArray(row.groups) ? (row.groups[0] as Record<string, unknown> | null) : null);

      const catNum =
        toStr(group?.account_number ?? group?.ledger_account_number ?? row.ledger_account_number ?? "") || null;
      const catName =
        toStr(group?.account_name ?? group?.label ?? group?.short_label ?? row.ledger_account_name ?? "") || null;

      return {
        id: toStr(row.id ?? ""),
        date: toStr(row.date ?? row.transaction_date ?? row.created_at ?? "").slice(0, 10),
        amount: toNum(row.amount ?? row.currency_amount ?? 0),
        description: toStr(
          row.wording ?? row.description ?? row.label ?? row.name ?? row.memo ?? "",
        ),
        ledgerAccountNumber: catNum,
        ledgerAccountName: catName,
      };
    })
    .filter((tx) => tx.date.length === 10);
}
