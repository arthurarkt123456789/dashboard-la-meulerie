import "server-only";
import {
  lastClosedMonth as _lastClosedMonth,
  firstDayOfMonth as _firstDayOfMonth,
  lastDayOfMonth as _lastDayOfMonth,
  getPastMonths as _getPastMonths,
  periodToFinancialRange as _periodToFinancialRange,
} from "./periods";

// ─────────────────────────────────────────────────────────────────────────────
// Pennylane API client — Trial Balance
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://app.pennylane.com/api/external/v2";

// Re-export period helpers so server routes can import from a single place.
export const lastClosedMonth = _lastClosedMonth;
export const getPastMonths = _getPastMonths;
export const periodToFinancialRange = _periodToFinancialRange;

export type TrialBalanceLine = {
  ledger_account_number: string;
  ledger_account_name: string;
  debit: number;
  credit: number;
  balance: number; // debit - credit (positive = debit balance)
};

// ─── Config ──────────────────────────────────────────────────────────────────

export function getPennylaneConfig(storeId: string): { token: string; companyId: string } | null {
  const id = storeId.toUpperCase();
  const token = process.env[`PENNYLANE_TOKEN_${id}`];
  const companyId = process.env[`PENNYLANE_COMPANY_${id}`];
  if (!token || !companyId) return null;
  return { token, companyId };
}

function inRange(account: string, prefix: string): boolean {
  return account.startsWith(prefix);
}

// ─── API fetch ───────────────────────────────────────────────────────────────

export type FetchResult = {
  lines: TrialBalanceLine[];
  diag: { topKeys: string[]; rowCount: number; firstRowKeys: string[] };
};

export async function fetchTrialBalance(
  token: string,
  periodStart: string,
  periodEnd: string,
): Promise<FetchResult> {
  const params = new URLSearchParams({
    period_start: periodStart,
    period_end: periodEnd,
    limit: "1000",
  });

  const lines: TrialBalanceLine[] = [];
  let cursor: string | null = null;
  let diag = { topKeys: [] as string[], rowCount: 0, firstRowKeys: [] as string[] };

  do {
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${BASE}/trial_balance?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pennylane trial_balance ${res.status}: ${body}`);
    }
    const json = await res.json() as Record<string, unknown>;

    // v2 2026 API returns { items: [...], has_more, next_cursor }
    // older versions returned { trial_balance: [...] }
    const rawRows: unknown[] =
      (Array.isArray(json.items) ? json.items : null) ??
      (Array.isArray(json.trial_balance) ? json.trial_balance : null) ??
      (Array.isArray((json as Record<string, Record<string, unknown>>).data?.trial_balance)
        ? (json as Record<string, Record<string, unknown[]>>).data.trial_balance
        : null) ??
      (Array.isArray(json.data) ? (json.data as unknown[]) : null) ??
      [];

    if (!cursor) {
      diag = {
        topKeys: Object.keys(json),
        rowCount: rawRows.length,
        firstRowKeys: rawRows[0] ? Object.keys(rawRows[0] as object) : [],
      };
      console.log(
        `[Pennylane] ${periodStart}→${periodEnd}:`,
        `${rawRows.length} rows, keys=[${diag.topKeys.join(",")}]`,
        rawRows.length ? `rowKeys=[${diag.firstRowKeys.join(",")}]` : "(empty)",
      );
    }

    for (const raw of rawRows) {
      const row = raw as Record<string, unknown>;
      const accountNumber = String(
        row.ledger_account_number ?? row.account_number ?? row.number ?? "",
      );
      const accountName = String(
        row.ledger_account_name ?? row.account_name ?? row.label ?? row.name ?? "",
      );
      const toNum = (v: unknown) =>
        typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
      const debit = toNum(row.debit ?? row.debit_amount ?? row.debit_sum ?? row.debits);
      const credit = toNum(row.credit ?? row.credit_amount ?? row.credit_sum ?? row.credits);
      lines.push({ ledger_account_number: accountNumber, ledger_account_name: accountName, debit, credit, balance: debit - credit });
    }
    // v2 2026: has_more + next_cursor at root level; older: meta.next_cursor
    const hasMeta = json.meta as { next_cursor?: string } | undefined;
    cursor = json.has_more === false
      ? null
      : (json.next_cursor as string | undefined) ?? hasMeta?.next_cursor ?? null;
  } while (cursor);

  return { lines, diag };
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export type CostData = {
  coutMatiere: number;         // 60x — achats / coût matière
  masseSalariale: number;      // 64x — charges de personnel
  chargesExploitation: number; // 61x + 62x + 63x — autres charges
  remboursementCapital: number; // 16x debit — remboursements de capital
  interetsEmprunt: number;      // 661x — intérêts des emprunts
};

export function aggregateFromLines(lines: TrialBalanceLine[]): CostData {
  let coutMatiere = 0;
  let masseSalariale = 0;
  let chargesExploitation = 0;
  let remboursementCapital = 0;
  let interetsEmprunt = 0;

  for (const line of lines) {
    const n = line.ledger_account_number;
    // Expense accounts (6xx): use balance = net debit movement for the period.
    // Credit notes / returns reduce the balance, giving the true net expense.
    // Loan repayment (16x): use raw debit to capture gross repayments
    // (not net of new borrowings, which would reduce the amount).
    if (inRange(n, "60")) coutMatiere += Math.max(0, line.balance);
    else if (inRange(n, "61") || inRange(n, "62") || inRange(n, "63")) chargesExploitation += Math.max(0, line.balance);
    else if (inRange(n, "64")) masseSalariale += Math.max(0, line.balance);
    else if (inRange(n, "16")) remboursementCapital += line.debit;
    else if (inRange(n, "661")) interetsEmprunt += Math.max(0, line.balance);
  }

  return {
    coutMatiere: Math.round(coutMatiere * 100) / 100,
    masseSalariale: Math.round(masseSalariale * 100) / 100,
    chargesExploitation: Math.round(chargesExploitation * 100) / 100,
    remboursementCapital: Math.round(remboursementCapital * 100) / 100,
    interetsEmprunt: Math.round(interetsEmprunt * 100) / 100,
  };
}

export type FinancialData = CostData & {
  period: { start: string; end: string };
  ebitda: number;
  chargesFinancieres: number;
  netDispo: number;
};

export async function getFinancialData(
  storeId: string,
  ca: number,
  periodStart: string,
  periodEnd: string,
): Promise<FinancialData> {
  const config = getPennylaneConfig(storeId);
  if (!config) throw new Error(`No Pennylane config for store: ${storeId}`);

  const { lines } = await fetchTrialBalance(config.token, periodStart, periodEnd);
  const costs = aggregateFromLines(lines);

  const ebitda = ca - costs.coutMatiere - costs.masseSalariale - costs.chargesExploitation;
  const netDispo = ebitda - costs.remboursementCapital - costs.interetsEmprunt;

  return {
    period: { start: periodStart, end: periodEnd },
    ...costs,
    ebitda: Math.round(ebitda * 100) / 100,
    chargesFinancieres: costs.interetsEmprunt,
    netDispo: Math.round(netDispo * 100) / 100,
  };
}

