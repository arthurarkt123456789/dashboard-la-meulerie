import type { PeriodSelection } from "@/lib/apitic/types";

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function lastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

export function firstDayOfMonth(year: number, month: number): string {
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
  return { start: firstDayOfMonth(year, month), end: lastDayOfMonth(year, month) };
}

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
  if (period.kind === "preset" && (period.key === "7d" || period.key === "today")) {
    return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
  }

  if (period.kind === "month" && period.year && period.month) {
    const now = new Date();
    const isCurrent = period.year === now.getFullYear() && period.month === now.getMonth() + 1;
    if (isCurrent) return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
    const start = firstDayOfMonth(period.year, period.month);
    const end = lastDayOfMonth(period.year, period.month);
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(start));
    return { start, end, label, fallback: false };
  }

  if (period.kind === "preset") {
    const months = period.key === "90d" ? 3 : 1;
    const lcm = lastClosedMonth();
    const [y, m] = lcm.start.split("-").map(Number);
    const fm = m - months + 1 <= 0 ? m - months + 1 + 12 : m - months + 1;
    const fy = m - months + 1 <= 0 ? y - 1 : y;
    const start = firstDayOfMonth(fy, fm);
    const label = months === 1 ? "dernier mois clôturé" : `${months} derniers mois clôturés`;
    return { start, end: lcm.end, label, fallback: false };
  }

  if (period.kind === "range" && period.from && period.to) {
    const lcm = lastClosedMonth();
    return { start: period.from, end: period.to <= lcm.end ? period.to : lcm.end, label: "période sélectionnée", fallback: false };
  }

  if (period.kind === "fiscal-year-todate") {
    const lcm = lastClosedMonth();
    const [y] = lcm.end.split("-").map(Number);
    const fyStart = lcm.end >= `${y}-10-01` ? `${y}-10-01` : `${y - 1}-10-01`;
    return { start: fyStart, end: lcm.end, label: "exercice en cours (mois clôturés)", fallback: false };
  }

  return { ...lastClosedMonth(), label: "dernier mois clôturé", fallback: true };
}

/** YYYY-MM strings covered by the period, capped at last closed month, oldest first. */
export function periodToSelectedMonths(period: PeriodSelection): string[] {
  const lcm = lastClosedMonth();
  const lcmYM = lcm.start.slice(0, 7);

  function ymRange(startYM: string, endYM: string): string[] {
    const months: string[] = [];
    let [y, m] = startYM.split("-").map(Number);
    const [ey, em] = endYM.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      if (ym <= lcmYM) months.push(ym);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  if (period.kind === "preset") {
    if (period.key === "today" || period.key === "7d" || period.key === "30d") return [lcmYM];
    if (period.key === "90d") return getPastMonths(3).map((p) => p.month);
  }

  if (period.kind === "month") {
    const now = new Date();
    const isCurrent = period.year === now.getFullYear() && period.month === now.getMonth() + 1;
    if (isCurrent) return [lcmYM];
    return [`${period.year}-${String(period.month).padStart(2, "0")}`];
  }

  if (period.kind === "range") {
    return ymRange(period.from.slice(0, 7), period.to.slice(0, 7));
  }

  if (period.kind === "fiscal-year-todate") {
    const [y] = lcm.end.split("-").map(Number);
    const fyStartYM = lcm.end >= `${y}-10-01` ? `${y}-10` : `${y - 1}-10`;
    return ymRange(fyStartYM, lcmYM);
  }

  return [lcmYM];
}
