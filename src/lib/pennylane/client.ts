import "server-only";

// ─────────────────────────────────────────────────────────────────────────────
// Pennylane API client — Trial Balance
//
// Env vars (one set per store that has Pennylane enabled):
//   PENNYLANE_TOKEN_DAVSO      — developer token (trial_balance:readonly scope)
//   PENNYLANE_COMPANY_DAVSO    — numeric company ID visible in the URL
//
// Add more stores later: PENNYLANE_TOKEN_ENDOUME, etc.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://app.pennylane.com/api/external/v2";

export type TrialBalanceLine = {
  ledger_account_number: string;
  ledger_account_name: string;
  debit: number;
  credit: number;
  balance: number; // debit - credit (positive = debit balance)
};

export type FinancialPeriod = {
  year: number;
  month: number; // 1..12
};

// ─── Account ranges ──────────────────────────────────────────────────────────

function inRange(account: string, prefix: string): boolean {
  return account.startsWith(prefix);
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function getPennylaneConfig(storeId: string): { token: string; companyId: string } | null {
  const id = storeId.toUpperCase();
  const token = process.env[`PENNYLANE_TOKEN_${id}`];
  const companyId = process.env[`PENNYLANE_COMPANY_${id}`];
  if (!token || !companyId) return null;
  return { token, companyId };
}

// ─── API fetch ───────────────────────────────────────────────────────────────

async function fetchTrialBalance(
  token: string,
  periodStart: string,
  periodEnd: string,
): Promise<TrialBalanceLine[]> {
  const params = new URLSearchParams({
    period_start: periodStart,
    period_end: periodEnd,
    limit: "1000",
    use_2026_api_changes: "true",
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
      trial_balance: {
        ledger_account_number: string;
        ledger_account_name: string;
        debit: string;
        credit: string;
      }[];
      meta?: { next_cursor?: string };
    };
    for (const row of json.trial_balance ?? []) {
      const debit = parseFloat(row.debit) || 0;
      const credit = parseFloat(row.credit) || 0;
      lines.push({
        ledger_account_number: row.ledger_account_number,
        ledger_account_name: row.ledger_account_name,
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

export type FinancialData = {
  period: { start: string; end: string };
  // P&L components (€ TTC amounts from trial balance)
  coutMatiere: number;         // 60x — purchases / COGS
  masseSalariale: number;      // 64x — payroll
  chargesExploitation: number; // 61x + 62x + 63x — other opex
  // Debt service (cash out, not P&L)
  remboursementCapital: number; // 16x debit movements
  interetsEmprunt: number;      // 661x debit movements
  // Computed
  ebitda: number;               // CA − coutMatiere − masseSalariale − chargesExploitation
  chargesFinancieres: number;   // interetsEmprunt (alias for display)
  netDispo: number;             // ebitda − remboursementCapital − interetsEmprunt
};

export async function getFinancialData(
  storeId: string,
  ca: number,         // CA TTC for the same period, from APITIC
  periodStart: string,
  periodEnd: string,
): Promise<FinancialData> {
  const config = getPennylaneConfig(storeId);
  if (!config) throw new Error(`No Pennylane config for store: ${storeId}`);

  const lines = await fetchTrialBalance(config.token, periodStart, periodEnd);

  let coutMatiere = 0;
  let masseSalariale = 0;
  let chargesExploitation = 0;
  let remboursementCapital = 0;
  let interetsEmprunt = 0;

  for (const line of lines) {
    const n = line.ledger_account_number;
    // Charges are debit-balance accounts in French GAAP (PCG)
    const amount = line.debit; // use raw debit movements for charges

    if (inRange(n, "60")) coutMatiere += amount;
    else if (inRange(n, "61") || inRange(n, "62") || inRange(n, "63")) chargesExploitation += amount;
    else if (inRange(n, "64")) masseSalariale += amount;
    else if (inRange(n, "16")) remboursementCapital += line.debit; // capital repayment
    else if (inRange(n, "661")) interetsEmprunt += amount;
  }

  const ebitda = ca - coutMatiere - masseSalariale - chargesExploitation;
  const netDispo = ebitda - remboursementCapital - interetsEmprunt;

  return {
    period: { start: periodStart, end: periodEnd },
    coutMatiere: Math.round(coutMatiere * 100) / 100,
    masseSalariale: Math.round(masseSalariale * 100) / 100,
    chargesExploitation: Math.round(chargesExploitation * 100) / 100,
    remboursementCapital: Math.round(remboursementCapital * 100) / 100,
    interetsEmprunt: Math.round(interetsEmprunt * 100) / 100,
    ebitda: Math.round(ebitda * 100) / 100,
    chargesFinancieres: Math.round(interetsEmprunt * 100) / 100,
    netDispo: Math.round(netDispo * 100) / 100,
  };
}

// ─── Period helpers ───────────────────────────────────────────────────────────

/** Last day of a month, ISO string. */
function lastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

/** First day of a month, ISO string. */
function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Returns the last closed month (the one before the current Paris month).
 * "Closed" = the month is fully in the past.
 */
export function lastClosedMonth(): { start: string; end: string } {
  const now = new Date();
  const parisStr = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const [y, m] = parisStr.split("-").map(Number);
  // go one month back
  const month = m === 1 ? 12 : m - 1;
  const year = m === 1 ? y - 1 : y;
  return {
    start: firstDayOfMonth(year, month),
    end: lastDayOfMonth(year, month),
  };
}

/**
 * Maps a dashboard PeriodSelection to Pennylane period_start / period_end.
 * Falls back to lastClosedMonth() for presets < 30d or current-month selections.
 */
export function periodToFinancialRange(
  period: { kind: string; key?: string; year?: number; month?: number; from?: string; to?: string },
): { start: string; end: string; label: string; fallback: boolean } {
  // 7-day preset → last closed month
  if (period.kind === "preset" && period.key === "7d") {
    return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
  }

  // Specific month
  if (period.kind === "month" && period.year && period.month) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isCurrent = period.year === currentYear && period.month === currentMonth;
    if (isCurrent) {
      return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
    }
    const start = firstDayOfMonth(period.year, period.month);
    const end = lastDayOfMonth(period.year, period.month);
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
      .format(new Date(start));
    return { start, end, label, fallback: false };
  }

  // 30d / 90d presets → last 1 or 3 closed months
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

  // Date range or fiscal-year-todate → use from/to as-is
  if (period.kind === "range" && period.from && period.to) {
    return { start: period.from, end: period.to, label: "période sélectionnée", fallback: false };
  }

  // Fiscal year to date → Oct 1 of current FY to last closed month
  if (period.kind === "fiscal-year-todate") {
    const lcm = lastClosedMonth();
    const [y] = lcm.end.split("-").map(Number);
    const fyStart = lcm.end >= `${y}-10-01` ? `${y}-10-01` : `${y - 1}-10-01`;
    return { start: fyStart, end: lcm.end, label: "exercice en cours (mois clôturés)", fallback: false };
  }

  return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
}
