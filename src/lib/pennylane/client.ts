import "server-only";

// ─────────────────────────────────────────────────────────────────────────────
// Pennylane API client — Trial Balance
//
// Env vars (one set per store that has Pennylane enabled):
//   PENNYLANE_TOKEN_DAVSO      — developer token (trial_balance:readonly scope)
//   PENNYLANE_COMPANY_DAVSO    — numeric company ID visible in the URL
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://app.pennylane.com/api/external/v2";

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

export async function fetchTrialBalance(
  token: string,
  periodStart: string,
  periodEnd: string,
): Promise<TrialBalanceLine[]> {
  const params = new URLSearchParams({
    period_start: periodStart,
    period_end: periodEnd,
    limit: "1000",
  });

  const lines: TrialBalanceLine[] = [];
  let cursor: string | null = null;

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
    const json = await res.json() as {
      trial_balance?: {
        ledger_account_number?: string;
        ledger_account_name?: string;
        debit?: string | number;
        credit?: string | number;
      }[];
      meta?: { next_cursor?: string };
    };
    for (const row of json.trial_balance ?? []) {
      // Handle both string ("1234.56") and numeric (1234.56) formats
      const debit = typeof row.debit === "string" ? parseFloat(row.debit) || 0 : (row.debit ?? 0);
      const credit = typeof row.credit === "string" ? parseFloat(row.credit) || 0 : (row.credit ?? 0);
      lines.push({
        ledger_account_number: row.ledger_account_number ?? "",
        ledger_account_name: row.ledger_account_name ?? "",
        debit,
        credit,
        balance: debit - credit,
      });
    }
    cursor = json.meta?.next_cursor ?? null;
  } while (cursor);

  return lines;
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

  const lines = await fetchTrialBalance(config.token, periodStart, periodEnd);
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

// ─── Period helpers ───────────────────────────────────────────────────────────

function lastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function lastClosedMonth(): { start: string; end: string } {
  const now = new Date();
  const parisStr = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const [y, m] = parisStr.split("-").map(Number);
  const month = m === 1 ? 12 : m - 1;
  const year = m === 1 ? y - 1 : y;
  return {
    start: firstDayOfMonth(year, month),
    end: lastDayOfMonth(year, month),
  };
}

/** Returns the last N closed months in chronological order (oldest first). */
export function getPastMonths(n: number): Array<{ month: string; start: string; end: string }> {
  const lcm = lastClosedMonth();
  const [lcmYear, lcmMonth] = lcm.start.split("-").map(Number);
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    let m = lcmMonth - i;
    let y = lcmYear;
    while (m <= 0) { m += 12; y--; }
    const start = firstDayOfMonth(y, m);
    const end = lastDayOfMonth(y, m);
    result.push({ month: start.slice(0, 7), start, end });
  }
  return result;
}

export function periodToFinancialRange(
  period: { kind: string; key?: string; year?: number; month?: number; from?: string; to?: string },
): { start: string; end: string; label: string; fallback: boolean } {
  if (period.kind === "preset" && period.key === "7d") {
    return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
  }

  if (period.kind === "month" && period.year && period.month) {
    const now = new Date();
    const isCurrent = period.year === now.getFullYear() && period.month === now.getMonth() + 1;
    if (isCurrent) {
      return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
    }
    const start = firstDayOfMonth(period.year, period.month);
    const end = lastDayOfMonth(period.year, period.month);
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
      .format(new Date(start));
    return { start, end, label, fallback: false };
  }

  if (period.kind === "preset") {
    const months = period.key === "90d" ? 3 : 1;
    const lcm = lastClosedMonth();
    const [y, m] = lcm.start.split("-").map(Number);
    const fromMonth = m - months + 1 <= 0 ? m - months + 1 + 12 : m - months + 1;
    const fromYear = m - months + 1 <= 0 ? y - 1 : y;
    const start = firstDayOfMonth(fromYear, fromMonth);
    const label = months === 1 ? "dernier mois clôturé" : `${months} derniers mois clôturés`;
    return { start, end: lcm.end, label, fallback: false };
  }

  if (period.kind === "range" && period.from && period.to) {
    return { start: period.from, end: period.to, label: "période sélectionnée", fallback: false };
  }

  if (period.kind === "fiscal-year-todate") {
    const lcm = lastClosedMonth();
    const [y] = lcm.end.split("-").map(Number);
    const fyStart = lcm.end >= `${y}-10-01` ? `${y}-10-01` : `${y - 1}-10-01`;
    return { start: fyStart, end: lcm.end, label: "exercice en cours (mois clôturés)", fallback: false };
  }

  return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
}
