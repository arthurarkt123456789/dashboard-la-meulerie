// Pure metric helpers — operate on the StoreDaily contract.
// Mirrors the proto's sumPeriod / sumPrev / sumYoY / periodMetrics /
// consolidatedPeriodMetrics, ported with TypeScript types and no side effects.

import type {
  FormuleStats,
  PaymentSplit,
  PeriodKey,
  PeriodSelection,
  Product,
  Store,
  StoreDaily,
} from "./apitic/types";

export const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "hier",
  "7d": "sur 7 jours",
  "30d": "sur 30 jours",
  "90d": "sur 90 jours",
};

const FR_MONTHS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const FR_MONTHS_SHORT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

export function periodLabelFor(selection: PeriodSelection): string {
  if (selection.kind === "preset") return PERIOD_LABELS[selection.key];
  if (selection.kind === "month") {
    return `en ${FR_MONTHS_LONG[selection.month - 1]} ${selection.year}`;
  }
  if (selection.kind === "range") {
    const f = formatShortISO(selection.from);
    const t = formatShortISO(selection.to);
    return `du ${f} au ${t}`;
  }
  if (selection.kind === "prev-fiscal-year") {
    const fy = currentFiscalYearEnd();
    return `exercice ${fy - 2}–${fy - 1}`;
  }
  // fiscal-year-todate
  const fy = currentFiscalYearEnd();
  return `exercice ${fy - 1}–${fy} à date`;
}

function formatShortISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${FR_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Fiscal year end (the calendar year in which Sep 30 falls). For a today
 * between Jan-Sep we're still in FY ending this calendar year. Between Oct-Dec
 * we're already in next FY.
 */
export function currentFiscalYearEnd(now: Date = new Date()): number {
  const y = now.getUTCFullYear();
  // Use Europe/Paris month — fiscal start is Oct 1 Paris-local
  const monthFR = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      month: "2-digit",
    }).format(now),
  );
  return monthFR >= 10 ? y + 1 : y;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Returns the slice of daily entries whose `date` lies in [from, to] inclusive. */
function sliceByDate(daily: StoreDaily[], from: string, to: string): StoreDaily[] {
  return daily.filter((d) => d.date >= from && d.date <= to);
}

function subtractDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function rangeForSelection(
  selection: PeriodSelection,
  todayISO: string,
): { from: string; to: string; days: number } {
  if (selection.kind === "preset") {
    const days = PERIOD_DAYS[selection.key];
    const from = subtractDays(todayISO, days - 1);
    return { from, to: todayISO, days };
  }
  if (selection.kind === "month") {
    const { year, month } = selection;
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
    const days = daysInMonth(year, month);
    return { from, to, days };
  }
  if (selection.kind === "range") {
    const { from, to } = selection;
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return { from, to, days };
  }
  const fy = currentFiscalYearEnd(new Date(`${todayISO}T12:00:00Z`));
  if (selection.kind === "prev-fiscal-year") {
    const from = `${fy - 2}-10-01`;
    const to = `${fy - 1}-09-30`;
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return { from, to, days };
  }
  // fiscal-year-todate: Oct 1 of the prior calendar year (relative to FY end)
  // → today (last available fiscal day, i.e. `todayISO`).
  const from = `${fy - 1}-10-01`;
  const to = todayISO;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return { from, to, days };
}

function sumRange(slice: StoreDaily[]): PeriodSum {
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const caHT = slice.reduce((s, d) => s + (d.caHT ?? 0), 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
  const fromagerieCA = slice.reduce((s, d) => s + d.fromagerieCA, 0);
  const fromagerieCAHT = slice.reduce((s, d) => s + (d.fromagerieCAHT ?? 0), 0);
  const snackingCA = slice.reduce((s, d) => s + d.snackingCA, 0);
  const snackingCAHT = slice.reduce((s, d) => s + (d.snackingCAHT ?? 0), 0);
  const epicerieCA = slice.reduce((s, d) => s + (d.epicerieCA ?? 0), 0);
  const epicerieCAHT = slice.reduce((s, d) => s + (d.epicerieCAHT ?? 0), 0);
  const merchCA = slice.reduce((s, d) => s + (d.merchCA ?? 0), 0);
  const merchCAHT = slice.reduce((s, d) => s + (d.merchCAHT ?? 0), 0);
  const fromagerieTx = slice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const snackingTx = slice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  const epicerieTx = slice.reduce((s, d) => s + (d.epicerieTx ?? 0), 0);
  const merchTx = slice.reduce((s, d) => s + (d.merchTx ?? 0), 0);
  const margeHT = slice.reduce((s, d) => s + (d.margeHT ?? 0), 0);
  const margeFromagerieHT = slice.reduce((s, d) => s + (d.margeFromagerieHT ?? 0), 0);
  const margeSnackingHT = slice.reduce((s, d) => s + (d.margeSnackingHT ?? 0), 0);
  const margeEpicerieHT = slice.reduce((s, d) => s + (d.margeEpicerieHT ?? 0), 0);
  const margeMerchHT = slice.reduce((s, d) => s + (d.margeMerchHT ?? 0), 0);
  const margeCoveredCAHT = slice.reduce((s, d) => s + (d.margeCoveredCAHT ?? 0), 0);
  const margeCoveredFromagerieCAHT = slice.reduce((s, d) => s + (d.margeCoveredFromagerieCAHT ?? 0), 0);
  const margeCoveredSnackingCAHT = slice.reduce((s, d) => s + (d.margeCoveredSnackingCAHT ?? 0), 0);
  const margeCoveredEpicerieCAHT = slice.reduce((s, d) => s + (d.margeCoveredEpicerieCAHT ?? 0), 0);
  const margeCoveredMerchCAHT = slice.reduce((s, d) => s + (d.margeCoveredMerchCAHT ?? 0), 0);
  return {
    ca,
    caHT,
    tx,
    fromagerieCA,
    fromagerieCAHT,
    snackingCA,
    snackingCAHT,
    epicerieCA,
    epicerieCAHT,
    merchCA,
    merchCAHT,
    fromagerieTx,
    snackingTx,
    epicerieTx,
    merchTx,
    margeHT,
    margeFromagerieHT,
    margeSnackingHT,
    margeEpicerieHT,
    margeMerchHT,
    margeCoveredCAHT,
    margeCoveredFromagerieCAHT,
    margeCoveredSnackingCAHT,
    margeCoveredEpicerieCAHT,
    margeCoveredMerchCAHT,
    avgTicket: tx ? ca / tx : 0,
    avgTicketHT: tx ? caHT / tx : 0,
    avgTicketFromagerie: fromagerieTx ? fromagerieCA / fromagerieTx : 0,
    avgTicketFromagerieHT: fromagerieTx ? fromagerieCAHT / fromagerieTx : 0,
    avgTicketSnacking: snackingTx ? snackingCA / snackingTx : 0,
    avgTicketSnackingHT: snackingTx ? snackingCAHT / snackingTx : 0,
    avgTicketEpicerie: epicerieTx ? epicerieCA / epicerieTx : 0,
    avgTicketEpicerieHT: epicerieTx ? epicerieCAHT / epicerieTx : 0,
    avgTicketMerch: merchTx ? merchCA / merchTx : 0,
    avgTicketMerchHT: merchTx ? merchCAHT / merchTx : 0,
    slice,
  };
}

type PeriodSum = {
  ca: number;
  caHT: number;
  tx: number;
  avgTicket: number;
  avgTicketHT: number;
  fromagerieCA: number;
  fromagerieCAHT: number;
  snackingCA: number;
  snackingCAHT: number;
  epicerieCA: number;
  epicerieCAHT: number;
  merchCA: number;
  merchCAHT: number;
  fromagerieTx: number;
  snackingTx: number;
  epicerieTx: number;
  merchTx: number;
  margeHT: number;
  margeFromagerieHT: number;
  margeSnackingHT: number;
  margeEpicerieHT: number;
  margeMerchHT: number;
  margeCoveredCAHT: number;
  margeCoveredFromagerieCAHT: number;
  margeCoveredSnackingCAHT: number;
  margeCoveredEpicerieCAHT: number;
  margeCoveredMerchCAHT: number;
  avgTicketFromagerie: number;
  avgTicketFromagerieHT: number;
  avgTicketSnacking: number;
  avgTicketSnackingHT: number;
  avgTicketEpicerie: number;
  avgTicketEpicerieHT: number;
  avgTicketMerch: number;
  avgTicketMerchHT: number;
  slice: StoreDaily[];
};


export type MetricMode = "HT" | "TTC";

type Summable = Pick<
  PeriodSum,
  | "ca" | "caHT" | "tx"
  | "fromagerieCA" | "fromagerieCAHT" | "fromagerieTx"
  | "snackingCA" | "snackingCAHT" | "snackingTx"
  | "epicerieCA" | "epicerieCAHT" | "epicerieTx"
  | "merchCA" | "merchCAHT" | "merchTx"
  | "margeHT" | "margeCoveredCAHT"
>;

/**
 * Single source of truth for every relative delta shown in the UI.
 * The delta is computed on the same base as the displayed amount (HT or TTC).
 * If HT is missing on either side (old rows without caHT), both sides fall
 * back to TTC so the comparison stays like-for-like.
 */
function relDelta(curHT: number, curTTC: number, baseHT: number, baseTTC: number, mode: MetricMode): number {
  const useHT = mode === "HT" && curHT > 0 && baseHT > 0;
  const c = useHT ? curHT : curTTC;
  const b = useHT ? baseHT : baseTTC;
  return b ? (c - b) / b : 0;
}

function ticketDeltaOf(
  curHT: number, curTTC: number, curTx: number,
  baseHT: number, baseTTC: number, baseTx: number,
  mode: MetricMode,
): number {
  if (!curTx || !baseTx) return 0;
  return relDelta(curHT / curTx, curTTC / curTx, baseHT / baseTx, baseTTC / baseTx, mode);
}

function margeRate(s: { margeHT: number; margeCoveredCAHT: number }): number | null {
  return s.margeCoveredCAHT > 0 ? s.margeHT / s.margeCoveredCAHT : null;
}

function computeDeltas(cur: Summable, prev: Summable, yoy: Summable, yoyAvailable: boolean, mode: MetricMode) {
  const y = yoyAvailable;
  const curRate = margeRate(cur);
  const prevRate = margeRate(prev);
  const yoyRate = margeRate(yoy);
  const margeDeltaAvailable = curRate !== null && prevRate !== null;
  const yoyMargeAvailable = y && curRate !== null && yoyRate !== null;
  return {
    caDelta: relDelta(cur.caHT, cur.ca, prev.caHT, prev.ca, mode),
    txDelta: prev.tx ? (cur.tx - prev.tx) / prev.tx : 0,
    ticketDelta: ticketDeltaOf(cur.caHT, cur.ca, cur.tx, prev.caHT, prev.ca, prev.tx, mode),
    ticketFromagerieDelta: ticketDeltaOf(cur.fromagerieCAHT, cur.fromagerieCA, cur.fromagerieTx, prev.fromagerieCAHT, prev.fromagerieCA, prev.fromagerieTx, mode),
    ticketSnackingDelta: ticketDeltaOf(cur.snackingCAHT, cur.snackingCA, cur.snackingTx, prev.snackingCAHT, prev.snackingCA, prev.snackingTx, mode),
    ticketEpicerieDelta: ticketDeltaOf(cur.epicerieCAHT, cur.epicerieCA, cur.epicerieTx, prev.epicerieCAHT, prev.epicerieCA, prev.epicerieTx, mode),
    ticketMerchDelta: ticketDeltaOf(cur.merchCAHT, cur.merchCA, cur.merchTx, prev.merchCAHT, prev.merchCA, prev.merchTx, mode),
    margeDelta: margeDeltaAvailable ? (curRate as number) - (prevRate as number) : 0,
    margeDeltaAvailable,
    yoyCaDelta: y ? relDelta(cur.caHT, cur.ca, yoy.caHT, yoy.ca, mode) : 0,
    yoyTxDelta: y && yoy.tx ? (cur.tx - yoy.tx) / yoy.tx : 0,
    yoyTicketDelta: y ? ticketDeltaOf(cur.caHT, cur.ca, cur.tx, yoy.caHT, yoy.ca, yoy.tx, mode) : 0,
    yoyMargeDelta: yoyMargeAvailable ? (curRate as number) - (yoyRate as number) : 0,
    yoyMargeAvailable,
    yoyTicketFromagerieDelta: y ? ticketDeltaOf(cur.fromagerieCAHT, cur.fromagerieCA, cur.fromagerieTx, yoy.fromagerieCAHT, yoy.fromagerieCA, yoy.fromagerieTx, mode) : 0,
    yoyTicketSnackingDelta: y ? ticketDeltaOf(cur.snackingCAHT, cur.snackingCA, cur.snackingTx, yoy.snackingCAHT, yoy.snackingCA, yoy.snackingTx, mode) : 0,
    yoyTicketEpicerieDelta: y ? ticketDeltaOf(cur.epicerieCAHT, cur.epicerieCA, cur.epicerieTx, yoy.epicerieCAHT, yoy.epicerieCA, yoy.epicerieTx, mode) : 0,
    yoyTicketMerchDelta: y ? ticketDeltaOf(cur.merchCAHT, cur.merchCA, cur.merchTx, yoy.merchCAHT, yoy.merchCA, yoy.merchTx, mode) : 0,
  };
}

/**
 * N-1 revenue of a category on the same base (HT or TTC) as the current value
 * it is compared to. Old rows without HT are converted with the period's own
 * HT/TTC ratio so the comparison never mixes HT with TTC.
 */
function yoyCategoryCA(
  yoy: PeriodSum,
  cur: PeriodSum,
  mode: MetricMode,
): { fromagerie: number; snacking: number; epicerie: number; merch: number } {
  if (mode === "TTC") {
    return { fromagerie: yoy.fromagerieCA, snacking: yoy.snackingCA, epicerie: yoy.epicerieCA, merch: yoy.merchCA };
  }
  const ratio = yoy.ca > 0 && yoy.caHT > 0 ? yoy.caHT / yoy.ca : cur.ca > 0 && cur.caHT > 0 ? cur.caHT / cur.ca : 1;
  const ht = (h: number, ttc: number) => (h > 0 ? h : ttc * ratio);
  return {
    fromagerie: ht(yoy.fromagerieCAHT, yoy.fromagerieCA),
    snacking: ht(yoy.snackingCAHT, yoy.snackingCA),
    epicerie: ht(yoy.epicerieCAHT, yoy.epicerieCA),
    merch: ht(yoy.merchCAHT, yoy.merchCA),
  };
}

export function sumPeriod(daily: StoreDaily[], days: number): PeriodSum {
  return sumRange(daily.slice(-days));
}

export function sumPrev(
  daily: StoreDaily[],
  days: number,
): { ca: number; tx: number; avgTicket: number; slice: StoreDaily[] } {
  const start = daily.length - days * 2;
  const slice = daily.slice(start, start + days);
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
  return { ca, tx, avgTicket: tx ? ca / tx : 0, slice };
}

export function sumYoY(
  daily: StoreDaily[],
  days: number,
  offsetDays = 364, // 52 weeks → keeps day-of-week alignment
): {
  ca: number;
  caHT: number;
  tx: number;
  avgTicket: number;
  avgTicketHT: number;
  available: boolean;
  slice: StoreDaily[];
} {
  const offset = offsetDays;
  const start = daily.length - days - offset;
  if (start < 0)
    return {
      ca: 0,
      caHT: 0,
      tx: 0,
      avgTicket: 0,
      avgTicketHT: 0,
      available: false,
      slice: [],
    };
  const slice = daily.slice(start, start + days);
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const caHT = slice.reduce((s, d) => s + (d.caHT ?? 0), 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
  // "Available" means the slice has the expected length, no day is flagged
  // closed, AND there's actually some revenue. The last clause catches the
  // case where the operator's openedDate override extends history into a
  // range where APITIC has no real data — every row sums to 0 and comparing
  // to it would be meaningless.
  const available =
    slice.length === days && !slice.some((d) => d.closed) && ca > 0;
  return {
    ca,
    caHT,
    tx,
    avgTicket: tx ? ca / tx : 0,
    avgTicketHT: tx ? caHT / tx : 0,
    available,
    slice,
  };
}

export type StoreMetrics = PeriodSum & {
  caDelta: number;
  txDelta: number;
  ticketDelta: number;
  ticketFromagerieDelta: number;
  ticketSnackingDelta: number;
  ticketEpicerieDelta: number;
  ticketMerchDelta: number;
  margeDelta: number;
  /** false when cost data is missing on either side: hide the delta. */
  margeDeltaAvailable: boolean;
  yoyMargeAvailable: boolean;
  yoyAvailable: boolean;
  yoyCaDelta: number;
  yoyTxDelta: number;
  yoyTicketDelta: number;
  yoyMargeDelta: number;
  yoyCa: number;
  yoyCaHT: number;
  yoyTx: number;
  yoyTicket: number;
  yoyTicketHT: number;
  yoySlice: StoreDaily[];
  days: number;
  // Per-segment yoy deltas
  yoyTicketFromagerieDelta: number;
  yoyTicketSnackingDelta: number;
  yoyTicketEpicerieDelta: number;
  yoyTicketMerchDelta: number;
  /** N-1 category revenue, on the same base (HT/TTC) as the requested mode. */
  yoyFromagerieCA: number;
  yoySnackingCA: number;
  yoyEpicerieCA: number;
  yoyMerchCA: number;
  yoyFromagerieTx: number;
  yoySnackingTx: number;
  yoyEpicerieTx: number;
  yoyMerchTx: number;
};

export function periodMetrics(daily: StoreDaily[], period: PeriodKey, mode: MetricMode = "TTC"): StoreMetrics {
  const days = PERIOD_DAYS[period];
  return periodMetricsFromRange(daily, days, mode);
}

/**
 * The one rule for "N-1" across the whole dashboard (KPIs, charts, mobile):
 *  - rolling windows, custom ranges and months: 364 days (52 weeks), so each
 *    day is compared to the same weekday one year earlier;
 *  - fiscal years: 365 days (calendar-aligned, Oct 1 → Sep 30).
 * Every component must call this instead of hardcoding 364/365.
 */
export function yoyOffsetForSelection(selection: PeriodSelection): number {
  if (selection.kind === "fiscal-year-todate") return 365;
  if (selection.kind === "prev-fiscal-year") return 365;
  return 364;
}


/**
 * P-1 window ("vs. période préc."). A period still in progress is compared to
 * the same number of elapsed days at the start of the previous period, never
 * to a full previous period.
 */
function prevWindowFor(
  selection: PeriodSelection,
  from: string,
  days: number,
  effectiveDays: number,
): { prevFrom: string; prevTo: string } {
  if (selection.kind === "month") {
    const pm = selection.month === 1 ? 12 : selection.month - 1;
    const py = selection.month === 1 ? selection.year - 1 : selection.year;
    const len = Math.min(effectiveDays, daysInMonth(py, pm));
    return { prevFrom: `${py}-${pad(pm)}-01`, prevTo: `${py}-${pad(pm)}-${pad(len)}` };
  }
  const prevFrom = subtractDays(from, days);
  return { prevFrom, prevTo: subtractDays(from, days - effectiveDays + 1) };
}

function elapsedDays(from: string, effectiveTo: string): number {
  return (
    Math.round(
      (new Date(`${effectiveTo}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1
  );
}

/**
 * Like periodMetrics but for an arbitrary selection (preset / month / custom
 * range / fiscal-year-todate). P-1 = same-length window immediately before.
 * N-1 = same window one year back, with day-of-week alignment for daily-grain
 * selections (preset, range) and calendar alignment for monthly/fiscal views.
 */
export function periodMetricsForSelection(
  daily: StoreDaily[],
  selection: PeriodSelection,
  mode: MetricMode = "TTC",
): StoreMetrics {
  if (selection.kind === "preset") return periodMetrics(daily, selection.key, mode);
  const todayISO = daily[daily.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
  const { from, to, days } = rangeForSelection(selection, todayISO);
  const yoyOffset = yoyOffsetForSelection(selection);
  const curSlice = sliceByDate(daily, from, to);
  // Period still in progress (current month): compare to the same number of
  // elapsed days, for P-1 as well as for N-1.
  const effectiveTo = to > todayISO ? todayISO : to;
  const effectiveDays = elapsedDays(from, effectiveTo);
  const { prevFrom, prevTo } = prevWindowFor(selection, from, days, effectiveDays);
  const prevSlice = sliceByDate(daily, prevFrom, prevTo);

  const yoyFrom = subtractDays(from, yoyOffset);
  const yoyTo = subtractDays(effectiveTo, yoyOffset);
  const yoySlice = sliceByDate(daily, yoyFrom, yoyTo);
  const yoyAvailable =
    yoySlice.length === effectiveDays &&
    !yoySlice.some((d) => d.closed) &&
    yoySlice.reduce((s, d) => s + d.ca, 0) > 0;

  const cur = sumRange(curSlice);
  const prev = sumRange(prevSlice);
  const yoy = sumRange(yoySlice);

  const deltas = computeDeltas(cur, prev, yoy, yoyAvailable, mode);

  return {
    ...cur,
    ...deltas,
    yoyAvailable,
    yoyCa: yoy.ca,
    yoyCaHT: yoy.caHT,
    yoyTx: yoy.tx,
    yoyTicket: yoy.avgTicket,
    yoyTicketHT: yoy.avgTicketHT,
    yoySlice,
    days: effectiveDays,
    yoyFromagerieCA: yoyCategoryCA(yoy, cur, mode).fromagerie,
    yoySnackingCA: yoyCategoryCA(yoy, cur, mode).snacking,
    yoyEpicerieCA: yoyCategoryCA(yoy, cur, mode).epicerie,
    yoyMerchCA: yoyCategoryCA(yoy, cur, mode).merch,
    yoyFromagerieTx: yoy.fromagerieTx,
    yoySnackingTx: yoy.snackingTx,
    yoyEpicerieTx: yoy.epicerieTx,
    yoyMerchTx: yoy.merchTx,
  };
}

export function consolidatedPeriodMetricsForSelection(
  consolidatedDaily: StoreDaily[],
  perStore: { store: Store; daily: StoreDaily[] }[],
  selection: PeriodSelection,
  mode: MetricMode = "TTC",
): ConsolidatedMetrics {
  if (selection.kind === "preset") {
    return consolidatedPeriodMetrics(consolidatedDaily, perStore, selection.key, mode);
  }
  const todayISO =
    consolidatedDaily[consolidatedDaily.length - 1]?.date ??
    new Date().toISOString().slice(0, 10);
  const { from, to, days } = rangeForSelection(selection, todayISO);
  // Same rule as the per-store metric: a period still in progress is compared
  // to the same number of elapsed days one year back.
  const effectiveTo = to > todayISO ? todayISO : to;
  const effectiveDays = elapsedDays(from, effectiveTo);
  const { prevFrom, prevTo } = prevWindowFor(selection, from, days, effectiveDays);
  const yoyOffset = yoyOffsetForSelection(selection);
  return consolidatedFromWindows(
    consolidatedDaily,
    perStore,
    {
      from,
      to,
      prevFrom,
      prevTo,
      yoyFrom: subtractDays(from, yoyOffset),
      yoyTo: subtractDays(effectiveTo, yoyOffset),
    },
    effectiveDays,
    (yoySlice) =>
      yoySlice.length === effectiveDays &&
      !yoySlice.some((d) => d.closed) &&
      yoySlice.reduce((s, d) => s + d.ca, 0) > 0,
    mode,
  );
}

type Windows = {
  from: string; to: string;
  prevFrom: string; prevTo: string;
  yoyFrom: string; yoyTo: string;
};

/**
 * Shared implementation for every consolidated view.
 *  - P-1 deltas: whole network, current window vs the window just before.
 *  - N-1 deltas: "périmètre constant", restricted to stores whose N-1 window is
 *    complete, using the exact same eligibility rule as the per-store metric.
 */
function consolidatedFromWindows(
  consolidatedDaily: StoreDaily[],
  perStore: { store: Store; daily: StoreDaily[] }[],
  win: Windows,
  days: number,
  isEligible: (yoySlice: StoreDaily[]) => boolean,
  mode: MetricMode,
): ConsolidatedMetrics {
  const cur = sumRange(sliceByDate(consolidatedDaily, win.from, win.to));
  const prev = sumRange(sliceByDate(consolidatedDaily, win.prevFrom, win.prevTo));

  const eligible = perStore.filter(({ daily }) =>
    isEligible(sliceByDate(daily, win.yoyFrom, win.yoyTo)),
  );
  const curScope = sumRange(
    eligible.flatMap(({ daily }) => sliceByDate(daily, win.from, win.to)),
  );
  const yoyScope = sumRange(
    eligible.flatMap(({ daily }) => sliceByDate(daily, win.yoyFrom, win.yoyTo)),
  );
  const yoyAvailable = eligible.length > 0 && yoyScope.ca > 0;

  const p = computeDeltas(cur, prev, cur, false, mode);
  const y = computeDeltas(curScope, curScope, yoyScope, yoyAvailable, mode);

  const excludedStores = perStore
    .filter(({ store }) => !eligible.some((e) => e.store.id === store.id))
    .map(({ store }) => store.name);

  return {
    ...cur,
    caDelta: p.caDelta,
    txDelta: p.txDelta,
    ticketDelta: p.ticketDelta,
    ticketFromagerieDelta: p.ticketFromagerieDelta,
    ticketSnackingDelta: p.ticketSnackingDelta,
    ticketEpicerieDelta: p.ticketEpicerieDelta,
    ticketMerchDelta: p.ticketMerchDelta,
    margeDelta: p.margeDelta,
    margeDeltaAvailable: p.margeDeltaAvailable,
    yoyAvailable,
    yoyCaDelta: y.yoyCaDelta,
    yoyTxDelta: y.yoyTxDelta,
    yoyTicketDelta: y.yoyTicketDelta,
    yoyMargeDelta: y.yoyMargeDelta,
    yoyMargeAvailable: y.yoyMargeAvailable,
    yoyTicketFromagerieDelta: y.yoyTicketFromagerieDelta,
    yoyTicketSnackingDelta: y.yoyTicketSnackingDelta,
    yoyTicketEpicerieDelta: y.yoyTicketEpicerieDelta,
    yoyTicketMerchDelta: y.yoyTicketMerchDelta,
    yoyCa: yoyScope.ca,
    yoyCaHT: yoyScope.caHT,
    yoyTx: yoyScope.tx,
    yoyTicket: yoyScope.avgTicket,
    yoyTicketHT: yoyScope.avgTicketHT,
    yoySlice: [],
    days,
    scopeStores: eligible.length,
    totalStores: perStore.length,
    excludedStores,
    curScope: mode === "HT" && curScope.caHT > 0 ? curScope.caHT : curScope.ca,
    yoyFromagerieCA: yoyCategoryCA(yoyScope, curScope, mode).fromagerie,
    yoySnackingCA: yoyCategoryCA(yoyScope, curScope, mode).snacking,
    yoyEpicerieCA: yoyCategoryCA(yoyScope, curScope, mode).epicerie,
    yoyMerchCA: yoyCategoryCA(yoyScope, curScope, mode).merch,
    yoyFromagerieTx: yoyScope.fromagerieTx,
    yoySnackingTx: yoyScope.snackingTx,
    yoyEpicerieTx: yoyScope.epicerieTx,
    yoyMerchTx: yoyScope.merchTx,
  };
}

function periodMetricsFromRange(daily: StoreDaily[], days: number, mode: MetricMode = "TTC"): StoreMetrics {
  // Date-based windows for the three periods (current, P-1, N-1) so that the
  // per-store and consolidated views always compare the exact same days.
  const todayISO = daily[daily.length - 1]?.date ?? "";
  const win = presetWindows(todayISO, days);
  const cur = sumRange(todayISO ? sliceByDate(daily, win.from, win.to) : []);
  const prev = sumRange(todayISO ? sliceByDate(daily, win.prevFrom, win.prevTo) : []);
  const yoySlice = todayISO ? sliceByDate(daily, win.yoyFrom, win.yoyTo) : [];
  const yoyFull = sumRange(yoySlice);
  const yoyAvailable = presetYoyAvailable(yoySlice, days);
  const deltas = computeDeltas(cur, prev, yoyFull, yoyAvailable, mode);
  return {
    ...cur,
    ...deltas,
    yoyAvailable,
    yoyCa: yoyFull.ca,
    yoyCaHT: yoyFull.caHT,
    yoyTx: yoyFull.tx,
    yoyTicket: yoyFull.avgTicket,
    yoyTicketHT: yoyFull.avgTicketHT,
    yoySlice,
    days,
    yoyFromagerieCA: yoyCategoryCA(yoyFull, cur, mode).fromagerie,
    yoySnackingCA: yoyCategoryCA(yoyFull, cur, mode).snacking,
    yoyEpicerieCA: yoyCategoryCA(yoyFull, cur, mode).epicerie,
    yoyMerchCA: yoyCategoryCA(yoyFull, cur, mode).merch,
    yoyFromagerieTx: yoyFull.fromagerieTx,
    yoySnackingTx: yoyFull.snackingTx,
    yoyEpicerieTx: yoyFull.epicerieTx,
    yoyMerchTx: yoyFull.merchTx,
  };
}

/** Windows for a preset of `days` days ending on `todayISO`. N-1 = 52 weeks back (same weekdays). */
function presetWindows(todayISO: string, days: number) {
  return {
    from: subtractDays(todayISO, days - 1),
    to: todayISO,
    prevFrom: subtractDays(todayISO, days * 2 - 1),
    prevTo: subtractDays(todayISO, days),
    yoyFrom: subtractDays(todayISO, days - 1 + 364),
    yoyTo: subtractDays(todayISO, 364),
  };
}

/** Same N-1 eligibility rule for a single store and for the consolidated scope. */
function presetYoyAvailable(yoySlice: StoreDaily[], days: number): boolean {
  return (
    yoySlice.length === days &&
    !yoySlice.some((d) => d.closed) &&
    yoySlice.reduce((s, d) => s + d.ca, 0) > 0
  );
}

export type ConsolidatedMetrics = StoreMetrics & {
  scopeStores: number;
  totalStores: number;
  excludedStores: string[];
  curScope: number;
};

/**
 * Consolidated metrics with "périmètre constant" YoY: only stores that have
 * complete data over the N-1 window are included in the YoY scope.
 */
export function consolidatedPeriodMetrics(
  consolidatedDaily: StoreDaily[],
  perStore: { store: Store; daily: StoreDaily[] }[],
  period: PeriodKey,
  mode: MetricMode = "TTC",
): ConsolidatedMetrics {
  const days = PERIOD_DAYS[period];
  const todayISO = consolidatedDaily[consolidatedDaily.length - 1]?.date ?? "";
  return consolidatedFromWindows(
    consolidatedDaily,
    perStore,
    presetWindows(todayISO, days),
    days,
    (yoySlice) => presetYoyAvailable(yoySlice, days),
    mode,
  );
}

// ────────────────────────────────────────────────────────────────────────
// Aggregations across stores (consolidated views)
// ────────────────────────────────────────────────────────────────────────

export function consolidateDaily(perStore: StoreDaily[][]): StoreDaily[] {
  const byDate = new Map<string, StoreDaily>();
  for (const daily of perStore) {
    for (const d of daily) {
      const existing = byDate.get(d.date);
      if (!existing) {
        byDate.set(d.date, {
          date: d.date,
          ca: d.ca,
          caHT: d.caHT ?? 0,
          tx: d.tx,
          avgTicket: 0,
          avgTicketHT: 0,
          fromagerieCA: d.fromagerieCA,
          fromagerieCAHT: d.fromagerieCAHT ?? 0,
          snackingCA: d.snackingCA,
          snackingCAHT: d.snackingCAHT ?? 0,
          epicerieCA: d.epicerieCA ?? 0,
          epicerieCAHT: d.epicerieCAHT ?? 0,
          merchCA: d.merchCA ?? 0,
          merchCAHT: d.merchCAHT ?? 0,
          fromagerieTx: d.fromagerieTx ?? 0,
          snackingTx: d.snackingTx ?? 0,
          epicerieTx: d.epicerieTx ?? 0,
          merchTx: d.merchTx ?? 0,
          margeHT: d.margeHT ?? 0,
          margeFromagerieHT: d.margeFromagerieHT ?? 0,
          margeSnackingHT: d.margeSnackingHT ?? 0,
          margeEpicerieHT: d.margeEpicerieHT ?? 0,
          margeMerchHT: d.margeMerchHT ?? 0,
          margeCoveredCAHT: d.margeCoveredCAHT ?? 0,
          margeCoveredFromagerieCAHT: d.margeCoveredFromagerieCAHT ?? 0,
          margeCoveredSnackingCAHT: d.margeCoveredSnackingCAHT ?? 0,
          margeCoveredEpicerieCAHT: d.margeCoveredEpicerieCAHT ?? 0,
          margeCoveredMerchCAHT: d.margeCoveredMerchCAHT ?? 0,
          grilledUnits: d.grilledUnits ?? 0,
          grilledCA: d.grilledCA ?? 0,
          grilledCAHT: d.grilledCAHT ?? 0,
          baguetteUnits: d.baguetteUnits ?? 0,
          baguetteCA: d.baguetteCA ?? 0,
          baguetteCAHT: d.baguetteCAHT ?? 0,
          cbAmount: d.cbAmount ?? 0,
          virementAmount: d.virementAmount ?? 0,
          especesAmount: d.especesAmount ?? 0,
          ticketsRestoAmount: d.ticketsRestoAmount ?? 0,
          uberEatsCa: d.uberEatsCa ?? 0,
          uberEatsTx: d.uberEatsTx ?? 0,
          partial: d.partial,
        });
      } else {
        existing.ca += d.ca;
        existing.caHT = (existing.caHT ?? 0) + (d.caHT ?? 0);
        existing.tx += d.tx;
        existing.fromagerieCA += d.fromagerieCA;
        existing.fromagerieCAHT = (existing.fromagerieCAHT ?? 0) + (d.fromagerieCAHT ?? 0);
        existing.snackingCA += d.snackingCA;
        existing.snackingCAHT = (existing.snackingCAHT ?? 0) + (d.snackingCAHT ?? 0);
        existing.epicerieCA = (existing.epicerieCA ?? 0) + (d.epicerieCA ?? 0);
        existing.epicerieCAHT = (existing.epicerieCAHT ?? 0) + (d.epicerieCAHT ?? 0);
        existing.merchCA = (existing.merchCA ?? 0) + (d.merchCA ?? 0);
        existing.merchCAHT = (existing.merchCAHT ?? 0) + (d.merchCAHT ?? 0);
        existing.fromagerieTx = (existing.fromagerieTx ?? 0) + (d.fromagerieTx ?? 0);
        existing.snackingTx = (existing.snackingTx ?? 0) + (d.snackingTx ?? 0);
        existing.epicerieTx = (existing.epicerieTx ?? 0) + (d.epicerieTx ?? 0);
        existing.merchTx = (existing.merchTx ?? 0) + (d.merchTx ?? 0);
        existing.margeHT = (existing.margeHT ?? 0) + (d.margeHT ?? 0);
        existing.margeFromagerieHT = (existing.margeFromagerieHT ?? 0) + (d.margeFromagerieHT ?? 0);
        existing.margeSnackingHT = (existing.margeSnackingHT ?? 0) + (d.margeSnackingHT ?? 0);
        existing.margeEpicerieHT = (existing.margeEpicerieHT ?? 0) + (d.margeEpicerieHT ?? 0);
        existing.margeMerchHT = (existing.margeMerchHT ?? 0) + (d.margeMerchHT ?? 0);
        existing.margeCoveredCAHT = (existing.margeCoveredCAHT ?? 0) + (d.margeCoveredCAHT ?? 0);
        existing.margeCoveredFromagerieCAHT = (existing.margeCoveredFromagerieCAHT ?? 0) + (d.margeCoveredFromagerieCAHT ?? 0);
        existing.margeCoveredSnackingCAHT = (existing.margeCoveredSnackingCAHT ?? 0) + (d.margeCoveredSnackingCAHT ?? 0);
        existing.margeCoveredEpicerieCAHT = (existing.margeCoveredEpicerieCAHT ?? 0) + (d.margeCoveredEpicerieCAHT ?? 0);
        existing.margeCoveredMerchCAHT = (existing.margeCoveredMerchCAHT ?? 0) + (d.margeCoveredMerchCAHT ?? 0);
        existing.grilledUnits = (existing.grilledUnits ?? 0) + (d.grilledUnits ?? 0);
        existing.grilledCA = (existing.grilledCA ?? 0) + (d.grilledCA ?? 0);
        existing.grilledCAHT = (existing.grilledCAHT ?? 0) + (d.grilledCAHT ?? 0);
        existing.baguetteUnits = (existing.baguetteUnits ?? 0) + (d.baguetteUnits ?? 0);
        existing.baguetteCA = (existing.baguetteCA ?? 0) + (d.baguetteCA ?? 0);
        existing.baguetteCAHT = (existing.baguetteCAHT ?? 0) + (d.baguetteCAHT ?? 0);
        existing.cbAmount = (existing.cbAmount ?? 0) + (d.cbAmount ?? 0);
        existing.virementAmount = (existing.virementAmount ?? 0) + (d.virementAmount ?? 0);
        existing.especesAmount = (existing.especesAmount ?? 0) + (d.especesAmount ?? 0);
        existing.ticketsRestoAmount = (existing.ticketsRestoAmount ?? 0) + (d.ticketsRestoAmount ?? 0);
        existing.uberEatsCa = (existing.uberEatsCa ?? 0) + (d.uberEatsCa ?? 0);
        existing.uberEatsTx = (existing.uberEatsTx ?? 0) + (d.uberEatsTx ?? 0);
        if (d.partial) existing.partial = true;
      }
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      avgTicket: d.tx ? d.ca / d.tx : 0,
      avgTicketHT: d.tx ? (d.caHT ?? 0) / d.tx : 0,
    }));
}

export function consolidateProducts(perStore: Product[][]): Product[] {
  const map = new Map<string, Product>();
  for (const list of perStore) {
    for (const p of list) {
      const existing = map.get(p.name);
      if (!existing) {
        map.set(p.name, { ...p });
      } else {
        existing.unitsToday += p.unitsToday;
        existing.units7d += p.units7d;
        existing.units30d += p.units30d;
        existing.revenue7d += p.revenue7d;
        existing.revenue30d += p.revenue30d;
        existing.revenue7dHT = (existing.revenue7dHT ?? 0) + (p.revenue7dHT ?? 0);
        existing.revenue30dHT = (existing.revenue30dHT ?? 0) + (p.revenue30dHT ?? 0);
        existing.units90d = (existing.units90d ?? 0) + (p.units90d ?? 0);
        existing.revenue90d = (existing.revenue90d ?? 0) + (p.revenue90d ?? 0);
        existing.revenue90dHT = (existing.revenue90dHT ?? 0) + (p.revenue90dHT ?? 0);
        // Promote unit to "au poids" if any store sells it by weight.
        if (p.unit === "au poids") existing.unit = "au poids";
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue30d - a.revenue30d);
}

export function consolidateFormules(perStore: FormuleStats[]): FormuleStats {
  if (perStore.length === 0) {
    return {
      endDate: "",
      days: 30,
      byKind: {
        grilled: { units: 0, ca: 0, caHT: 0 },
        baguette: { units: 0, ca: 0, caHT: 0 },
      },
      snackingCA: 0,
      snackingCAHT: 0,
      snackingTx: 0,
    };
  }
  const out: FormuleStats = {
    endDate: perStore[0].endDate,
    days: perStore[0].days,
    byKind: {
      grilled: { units: 0, ca: 0, caHT: 0 },
      baguette: { units: 0, ca: 0, caHT: 0 },
    },
    snackingCA: 0,
    snackingCAHT: 0,
    snackingTx: 0,
  };
  for (const s of perStore) {
    if (s.endDate > out.endDate) out.endDate = s.endDate;
    for (const k of ["grilled", "baguette"] as const) {
      out.byKind[k].units += s.byKind[k].units;
      out.byKind[k].ca += s.byKind[k].ca;
      out.byKind[k].caHT += s.byKind[k].caHT;
    }
    out.snackingCA += s.snackingCA;
    out.snackingCAHT += s.snackingCAHT;
    out.snackingTx += s.snackingTx;
  }
  return out;
}

export function consolidatePayments(
  perStore: { daily: StoreDaily[]; payments: PaymentSplit[] }[],
): PaymentSplit[] {
  const map = new Map<
    string,
    { method: PaymentSplit["method"]; amount: number; amountHT: number }
  >();
  for (const { daily, payments } of perStore) {
    // Use the same 30-day window that buildPayments aggregated for shares.
    const window = daily.slice(-30);
    const windowTTC = window.reduce((s, d) => s + d.ca, 0);
    const windowHT = window.reduce((s, d) => s + (d.caHT ?? 0), 0);
    const htRatio = windowTTC > 0 ? windowHT / windowTTC : 1;
    for (const p of payments) {
      const existing = map.get(p.method);
      const amountTTC = p.amount ?? 0;
      const amountHT = p.amountHT ?? amountTTC * htRatio;
      if (!existing) {
        map.set(p.method, { method: p.method, amount: amountTTC, amountHT });
      } else {
        existing.amount += amountTTC;
        existing.amountHT += amountHT;
      }
    }
  }
  const all = Array.from(map.values());
  const total = all.reduce((s, x) => s + x.amount, 0);
  return all.map((p) => ({
    method: p.method,
    share: total ? p.amount / total : 0,
    amount: p.amount,
    amountHT: p.amountHT,
  }));
}

// ────────────────────────────────────────────────────────────────────────
// Period-aware cards (same computation for a store and for the network)
// ────────────────────────────────────────────────────────────────────────

/** Formules lunch over exactly the days of `slice` (the selected period). */
export function formulesFromSlice(slice: StoreDaily[]): FormuleStats {
  const sum = (f: (d: StoreDaily) => number) => slice.reduce((s, d) => s + f(d), 0);
  return {
    endDate: slice[slice.length - 1]?.date ?? "",
    days: slice.length,
    byKind: {
      grilled: {
        units: sum((d) => d.grilledUnits ?? 0),
        ca: sum((d) => d.grilledCA ?? 0),
        caHT: sum((d) => d.grilledCAHT ?? 0),
      },
      baguette: {
        units: sum((d) => d.baguetteUnits ?? 0),
        ca: sum((d) => d.baguetteCA ?? 0),
        caHT: sum((d) => d.baguetteCAHT ?? 0),
      },
    },
    snackingCA: sum((d) => d.snackingCA),
    snackingCAHT: sum((d) => d.snackingCAHT ?? 0),
    snackingTx: sum((d) => d.snackingTx ?? 0),
  };
}

/** Payment split over exactly the days of `slice` (the selected period). */
export function paymentsFromSlice(slice: StoreDaily[]): PaymentSplit[] {
  const sum = (f: (d: StoreDaily) => number) => slice.reduce((s, d) => s + f(d), 0);
  const totalTTC = sum((d) => d.ca);
  const totalHT = sum((d) => d.caHT ?? 0);
  const htRatio = totalTTC > 0 ? totalHT / totalTTC : 1;
  const amounts: [PaymentSplit["method"], number][] = [
    ["Carte bancaire", sum((d) => d.cbAmount ?? 0)],
    ["Virement", sum((d) => d.virementAmount ?? 0)],
    ["Espèces", sum((d) => d.especesAmount ?? 0)],
    ["Tickets resto", sum((d) => d.ticketsRestoAmount ?? 0)],
  ];
  const total = amounts.reduce((s, [, v]) => s + v, 0);
  return amounts.map(([method, amount]) => ({
    method,
    share: total > 0 ? amount / total : 0,
    amount,
    amountHT: amount * htRatio,
  }));
}
