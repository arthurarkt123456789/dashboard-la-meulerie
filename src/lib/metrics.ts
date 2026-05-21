// Pure metric helpers — operate on the StoreDaily contract.
// Mirrors the proto's sumPeriod / sumPrev / sumYoY / periodMetrics /
// consolidatedPeriodMetrics, ported with TypeScript types and no side effects.

import type {
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
  // fiscal-year-todate
  const fy = currentFiscalYearEnd();
  return `exercice ${fy - 1}–${fy} à date`;
}

function formatShortISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${FR_MONTHS_LONG[d.getUTCMonth()].slice(0, 4)}. ${d.getUTCFullYear()}`;
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
  // fiscal-year-todate: Oct 1 of the prior calendar year (relative to FY end)
  // → today (last available fiscal day, i.e. `todayISO`).
  const fy = currentFiscalYearEnd(new Date(`${todayISO}T12:00:00Z`));
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
  const fromagerieTx = slice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const snackingTx = slice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  return {
    ca,
    caHT,
    tx,
    fromagerieCA,
    fromagerieCAHT,
    snackingCA,
    snackingCAHT,
    fromagerieTx,
    snackingTx,
    avgTicket: tx ? ca / tx : 0,
    avgTicketHT: tx ? caHT / tx : 0,
    avgTicketFromagerie: fromagerieTx ? fromagerieCA / fromagerieTx : 0,
    avgTicketFromagerieHT: fromagerieTx ? fromagerieCAHT / fromagerieTx : 0,
    avgTicketSnacking: snackingTx ? snackingCA / snackingTx : 0,
    avgTicketSnackingHT: snackingTx ? snackingCAHT / snackingTx : 0,
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
  fromagerieTx: number;
  snackingTx: number;
  avgTicketFromagerie: number;
  avgTicketFromagerieHT: number;
  avgTicketSnacking: number;
  avgTicketSnackingHT: number;
  slice: StoreDaily[];
};

export function sumPeriod(daily: StoreDaily[], days: number): PeriodSum {
  const slice = daily.slice(-days);
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const caHT = slice.reduce((s, d) => s + (d.caHT ?? 0), 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
  const fromagerieCA = slice.reduce((s, d) => s + d.fromagerieCA, 0);
  const fromagerieCAHT = slice.reduce((s, d) => s + (d.fromagerieCAHT ?? 0), 0);
  const snackingCA = slice.reduce((s, d) => s + d.snackingCA, 0);
  const snackingCAHT = slice.reduce((s, d) => s + (d.snackingCAHT ?? 0), 0);
  const fromagerieTx = slice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const snackingTx = slice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  return {
    ca,
    caHT,
    tx,
    fromagerieCA,
    fromagerieCAHT,
    snackingCA,
    snackingCAHT,
    fromagerieTx,
    snackingTx,
    avgTicket: tx ? ca / tx : 0,
    avgTicketHT: tx ? caHT / tx : 0,
    avgTicketFromagerie: fromagerieTx ? fromagerieCA / fromagerieTx : 0,
    avgTicketFromagerieHT: fromagerieTx ? fromagerieCAHT / fromagerieTx : 0,
    avgTicketSnacking: snackingTx ? snackingCA / snackingTx : 0,
    avgTicketSnackingHT: snackingTx ? snackingCAHT / snackingTx : 0,
    slice,
  };
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
  const available = slice.length === days && !slice.some((d) => d.closed);
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const caHT = slice.reduce((s, d) => s + (d.caHT ?? 0), 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
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
  yoyAvailable: boolean;
  yoyCaDelta: number;
  yoyTxDelta: number;
  yoyTicketDelta: number;
  yoyCa: number;
  yoyCaHT: number;
  yoyTx: number;
  yoyTicket: number;
  yoyTicketHT: number;
  yoySlice: StoreDaily[];
  days: number;
};

export function periodMetrics(daily: StoreDaily[], period: PeriodKey): StoreMetrics {
  const days = PERIOD_DAYS[period];
  return periodMetricsFromRange(daily, days);
}

/**
 * For a selection, returns the N-1 offset:
 *  - "month" / "fiscal-year-todate": 365 (calendar-aligned — same month/FY)
 *  - "preset" / "range": 364 (52 weeks — keeps day-of-week aligned)
 */
function yoyOffsetForSelection(selection: PeriodSelection): number {
  if (selection.kind === "month") return 365;
  if (selection.kind === "fiscal-year-todate") return 365;
  return 364;
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
): StoreMetrics {
  if (selection.kind === "preset") return periodMetrics(daily, selection.key);
  const todayISO = daily[daily.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
  const { from, to, days } = rangeForSelection(selection, todayISO);
  const yoyOffset = yoyOffsetForSelection(selection);
  const curSlice = sliceByDate(daily, from, to);
  const prevTo = subtractDays(from, 1);
  const prevFrom = subtractDays(from, days);
  const prevSlice = sliceByDate(daily, prevFrom, prevTo);
  const yoyFrom = subtractDays(from, yoyOffset);
  const yoyTo = subtractDays(to, yoyOffset);
  const yoySlice = sliceByDate(daily, yoyFrom, yoyTo);
  const yoyAvailable =
    yoySlice.length === days && !yoySlice.some((d) => d.closed);

  const cur = sumRange(curSlice);
  const prev = sumRange(prevSlice);
  const yoy = sumRange(yoySlice);

  const caDelta = prev.ca ? (cur.ca - prev.ca) / prev.ca : 0;
  const txDelta = prev.tx ? (cur.tx - prev.tx) / prev.tx : 0;
  const ticketDelta = prev.avgTicket
    ? (cur.avgTicket - prev.avgTicket) / prev.avgTicket
    : 0;
  const ticketFromagerieDelta = prev.avgTicketFromagerie
    ? (cur.avgTicketFromagerie - prev.avgTicketFromagerie) /
      prev.avgTicketFromagerie
    : 0;
  const ticketSnackingDelta = prev.avgTicketSnacking
    ? (cur.avgTicketSnacking - prev.avgTicketSnacking) / prev.avgTicketSnacking
    : 0;
  const yoyCaDelta = yoyAvailable && yoy.ca ? (cur.ca - yoy.ca) / yoy.ca : 0;
  const yoyTxDelta = yoyAvailable && yoy.tx ? (cur.tx - yoy.tx) / yoy.tx : 0;
  const yoyTicketDelta =
    yoyAvailable && yoy.avgTicket
      ? (cur.avgTicket - yoy.avgTicket) / yoy.avgTicket
      : 0;

  return {
    ...cur,
    caDelta,
    txDelta,
    ticketDelta,
    ticketFromagerieDelta,
    ticketSnackingDelta,
    yoyAvailable,
    yoyCaDelta,
    yoyTxDelta,
    yoyTicketDelta,
    yoyCa: yoy.ca,
    yoyCaHT: yoy.caHT,
    yoyTx: yoy.tx,
    yoyTicket: yoy.avgTicket,
    yoyTicketHT: yoy.avgTicketHT,
    yoySlice,
    days,
  };
}

export function consolidatedPeriodMetricsForSelection(
  consolidatedDaily: StoreDaily[],
  perStore: { store: Store; daily: StoreDaily[] }[],
  selection: PeriodSelection,
): ConsolidatedMetrics {
  if (selection.kind === "preset") {
    return consolidatedPeriodMetrics(consolidatedDaily, perStore, selection.key);
  }
  const todayISO =
    consolidatedDaily[consolidatedDaily.length - 1]?.date ??
    new Date().toISOString().slice(0, 10);
  const { from, to, days } = rangeForSelection(selection, todayISO);

  const curSlice = sliceByDate(consolidatedDaily, from, to);
  const prevFrom = subtractDays(from, days);
  const prevTo = subtractDays(from, 1);
  const prevSlice = sliceByDate(consolidatedDaily, prevFrom, prevTo);

  const cur = sumRange(curSlice);
  const prev = sumRange(prevSlice);

  const caDelta = prev.ca ? (cur.ca - prev.ca) / prev.ca : 0;
  const txDelta = prev.tx ? (cur.tx - prev.tx) / prev.tx : 0;
  const ticketDelta = prev.avgTicket
    ? (cur.avgTicket - prev.avgTicket) / prev.avgTicket
    : 0;
  const ticketFromagerieDelta = prev.avgTicketFromagerie
    ? (cur.avgTicketFromagerie - prev.avgTicketFromagerie) /
      prev.avgTicketFromagerie
    : 0;
  const ticketSnackingDelta = prev.avgTicketSnacking
    ? (cur.avgTicketSnacking - prev.avgTicketSnacking) / prev.avgTicketSnacking
    : 0;

  // Périmètre constant: a store qualifies if its N-1 slice for the same
  // window had complete data (no `closed` day). Offset matches the per-store
  // metric (52 weeks for daily-grain selections, 365 for monthly/FY).
  const yoyOffset = yoyOffsetForSelection(selection);
  const yoyFrom = subtractDays(from, yoyOffset);
  const yoyTo = subtractDays(to, yoyOffset);
  const eligible = perStore.filter(({ daily }) => {
    const s = sliceByDate(daily, yoyFrom, yoyTo);
    return s.length === days && !s.some((d) => d.closed);
  });
  let curScope = 0;
  let yoyScope = 0;
  let curTxScope = 0;
  let yoyTxScope = 0;
  for (const { daily } of eligible) {
    const cs = sliceByDate(daily, from, to);
    const ys = sliceByDate(daily, yoyFrom, yoyTo);
    curScope += cs.reduce((s, d) => s + d.ca, 0);
    yoyScope += ys.reduce((s, d) => s + d.ca, 0);
    curTxScope += cs.reduce((s, d) => s + d.tx, 0);
    yoyTxScope += ys.reduce((s, d) => s + d.tx, 0);
  }
  const yoyAvailable = eligible.length > 0;
  const yoyCaDelta = yoyAvailable && yoyScope ? (curScope - yoyScope) / yoyScope : 0;
  const yoyTxDelta = yoyAvailable && yoyTxScope ? (curTxScope - yoyTxScope) / yoyTxScope : 0;
  const curTicketScope = curTxScope ? curScope / curTxScope : 0;
  const yoyTicketScope = yoyTxScope ? yoyScope / yoyTxScope : 0;
  const yoyTicketDelta =
    yoyAvailable && yoyTicketScope
      ? (curTicketScope - yoyTicketScope) / yoyTicketScope
      : 0;
  const excludedStores = perStore
    .filter(({ store }) => !eligible.some((e) => e.store.id === store.id))
    .map(({ store }) => store.name);

  return {
    ...cur,
    caDelta,
    txDelta,
    ticketDelta,
    ticketFromagerieDelta,
    ticketSnackingDelta,
    yoyAvailable,
    yoyCaDelta,
    yoyTxDelta,
    yoyTicketDelta,
    yoyCa: yoyScope,
    yoyCaHT: 0,
    yoyTx: yoyTxScope,
    yoyTicket: yoyTicketScope,
    yoyTicketHT: 0,
    yoySlice: [],
    days,
    scopeStores: eligible.length,
    totalStores: perStore.length,
    excludedStores,
    curScope,
  };
}

function periodMetricsFromRange(daily: StoreDaily[], days: number): StoreMetrics {
  const cur = sumPeriod(daily, days);
  const prev = sumPrev(daily, days);
  const yoy = sumYoY(daily, days);
  // P-1 segment baskets
  const prevSlice = daily.slice(daily.length - days * 2, daily.length - days);
  const prevFromagerieCA = prevSlice.reduce((s, d) => s + d.fromagerieCA, 0);
  const prevSnackingCA = prevSlice.reduce((s, d) => s + d.snackingCA, 0);
  const prevFromagerieTx = prevSlice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const prevSnackingTx = prevSlice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  const prevAvgFromagerie = prevFromagerieTx ? prevFromagerieCA / prevFromagerieTx : 0;
  const prevAvgSnacking = prevSnackingTx ? prevSnackingCA / prevSnackingTx : 0;
  const caDelta = prev.ca ? (cur.ca - prev.ca) / prev.ca : 0;
  const txDelta = prev.tx ? (cur.tx - prev.tx) / prev.tx : 0;
  const ticketDelta = prev.avgTicket ? (cur.avgTicket - prev.avgTicket) / prev.avgTicket : 0;
  const ticketFromagerieDelta = prevAvgFromagerie
    ? (cur.avgTicketFromagerie - prevAvgFromagerie) / prevAvgFromagerie
    : 0;
  const ticketSnackingDelta = prevAvgSnacking
    ? (cur.avgTicketSnacking - prevAvgSnacking) / prevAvgSnacking
    : 0;
  const yoyCaDelta = yoy.available && yoy.ca ? (cur.ca - yoy.ca) / yoy.ca : 0;
  const yoyTxDelta = yoy.available && yoy.tx ? (cur.tx - yoy.tx) / yoy.tx : 0;
  const yoyTicketDelta =
    yoy.available && yoy.avgTicket ? (cur.avgTicket - yoy.avgTicket) / yoy.avgTicket : 0;
  return {
    ...cur,
    caDelta,
    txDelta,
    ticketDelta,
    ticketFromagerieDelta,
    ticketSnackingDelta,
    yoyAvailable: yoy.available,
    yoyCaDelta,
    yoyTxDelta,
    yoyTicketDelta,
    yoyCa: yoy.ca,
    yoyCaHT: yoy.caHT,
    yoyTx: yoy.tx,
    yoyTicket: yoy.avgTicket,
    yoyTicketHT: yoy.avgTicketHT,
    yoySlice: yoy.slice,
    days,
  };
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
): ConsolidatedMetrics {
  const days = PERIOD_DAYS[period];
  const cur = sumPeriod(consolidatedDaily, days);
  const prev = sumPrev(consolidatedDaily, days);
  const prevSlice = consolidatedDaily.slice(
    consolidatedDaily.length - days * 2,
    consolidatedDaily.length - days,
  );
  const prevFromagerieCA = prevSlice.reduce((s, d) => s + d.fromagerieCA, 0);
  const prevSnackingCA = prevSlice.reduce((s, d) => s + d.snackingCA, 0);
  const prevFromagerieTx = prevSlice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const prevSnackingTx = prevSlice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  const prevAvgFromagerie = prevFromagerieTx ? prevFromagerieCA / prevFromagerieTx : 0;
  const prevAvgSnacking = prevSnackingTx ? prevSnackingCA / prevSnackingTx : 0;
  const caDelta = prev.ca ? (cur.ca - prev.ca) / prev.ca : 0;
  const txDelta = prev.tx ? (cur.tx - prev.tx) / prev.tx : 0;
  const ticketDelta = prev.avgTicket ? (cur.avgTicket - prev.avgTicket) / prev.avgTicket : 0;
  const ticketFromagerieDelta = prevAvgFromagerie
    ? (cur.avgTicketFromagerie - prevAvgFromagerie) / prevAvgFromagerie
    : 0;
  const ticketSnackingDelta = prevAvgSnacking
    ? (cur.avgTicketSnacking - prevAvgSnacking) / prevAvgSnacking
    : 0;

  const eligible = perStore.filter(({ daily }) => sumYoY(daily, days).available);

  let curScope = 0;
  let yoyScope = 0;
  let curTxScope = 0;
  let yoyTxScope = 0;
  for (const { daily } of eligible) {
    const c = sumPeriod(daily, days);
    const y = sumYoY(daily, days);
    curScope += c.ca;
    yoyScope += y.ca;
    curTxScope += c.tx;
    yoyTxScope += y.tx;
  }
  const yoyAvailable = eligible.length > 0;
  const yoyCaDelta = yoyAvailable && yoyScope ? (curScope - yoyScope) / yoyScope : 0;
  const yoyTxDelta = yoyAvailable && yoyTxScope ? (curTxScope - yoyTxScope) / yoyTxScope : 0;
  const curTicketScope = curTxScope ? curScope / curTxScope : 0;
  const yoyTicketScope = yoyTxScope ? yoyScope / yoyTxScope : 0;
  const yoyTicketDelta =
    yoyAvailable && yoyTicketScope
      ? (curTicketScope - yoyTicketScope) / yoyTicketScope
      : 0;

  const excludedStores = perStore
    .filter(({ store }) => !eligible.some((e) => e.store.id === store.id))
    .map(({ store }) => store.name);

  return {
    ...cur,
    caDelta,
    txDelta,
    ticketDelta,
    ticketFromagerieDelta,
    ticketSnackingDelta,
    yoyAvailable,
    yoyCaDelta,
    yoyTxDelta,
    yoyTicketDelta,
    yoyCa: yoyScope,
    yoyCaHT: 0,
    yoyTx: yoyTxScope,
    yoyTicket: yoyTicketScope,
    yoyTicketHT: 0,
    yoySlice: [],
    days,
    scopeStores: eligible.length,
    totalStores: perStore.length,
    excludedStores,
    curScope,
  };
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
          fromagerieTx: d.fromagerieTx ?? 0,
          snackingTx: d.snackingTx ?? 0,
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
        existing.fromagerieTx = (existing.fromagerieTx ?? 0) + (d.fromagerieTx ?? 0);
        existing.snackingTx = (existing.snackingTx ?? 0) + (d.snackingTx ?? 0);
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
        // Promote unit to "au poids" if any store sells it by weight.
        if (p.unit === "au poids") existing.unit = "au poids";
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue30d - a.revenue30d);
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
