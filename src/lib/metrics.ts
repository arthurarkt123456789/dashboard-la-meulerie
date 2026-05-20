// Pure metric helpers — operate on the StoreDaily contract.
// Mirrors the proto's sumPeriod / sumPrev / sumYoY / periodMetrics /
// consolidatedPeriodMetrics, ported with TypeScript types and no side effects.

import type { PaymentSplit, PeriodKey, Product, Store, StoreDaily } from "./apitic/types";

export const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "aujourd'hui",
  "7d": "sur 7 jours",
  "30d": "sur 30 jours",
  "90d": "sur 90 jours",
};

type PeriodSum = {
  ca: number;
  tx: number;
  avgTicket: number;
  fromagerieCA: number;
  snackingCA: number;
  slice: StoreDaily[];
};

export function sumPeriod(daily: StoreDaily[], days: number): PeriodSum {
  const slice = daily.slice(-days);
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
  const fromagerieCA = slice.reduce((s, d) => s + d.fromagerieCA, 0);
  const snackingCA = slice.reduce((s, d) => s + d.snackingCA, 0);
  return { ca, tx, fromagerieCA, snackingCA, avgTicket: tx ? ca / tx : 0, slice };
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
): {
  ca: number;
  tx: number;
  avgTicket: number;
  available: boolean;
  slice: StoreDaily[];
} {
  const offset = 365;
  const start = daily.length - days - offset;
  if (start < 0) return { ca: 0, tx: 0, avgTicket: 0, available: false, slice: [] };
  const slice = daily.slice(start, start + days);
  const available = slice.length === days && !slice.some((d) => d.closed);
  const ca = slice.reduce((s, d) => s + d.ca, 0);
  const tx = slice.reduce((s, d) => s + d.tx, 0);
  return { ca, tx, avgTicket: tx ? ca / tx : 0, available, slice };
}

export type StoreMetrics = PeriodSum & {
  caDelta: number;
  txDelta: number;
  ticketDelta: number;
  yoyAvailable: boolean;
  yoyCaDelta: number;
  yoyTxDelta: number;
  yoyTicketDelta: number;
  yoyCa: number;
  yoyTx: number;
  yoyTicket: number;
  yoySlice: StoreDaily[];
  days: number;
};

export function periodMetrics(daily: StoreDaily[], period: PeriodKey): StoreMetrics {
  const days = PERIOD_DAYS[period];
  const cur = sumPeriod(daily, days);
  const prev = sumPrev(daily, days);
  const yoy = sumYoY(daily, days);
  const caDelta = prev.ca ? (cur.ca - prev.ca) / prev.ca : 0;
  const txDelta = prev.tx ? (cur.tx - prev.tx) / prev.tx : 0;
  const ticketDelta = prev.avgTicket ? (cur.avgTicket - prev.avgTicket) / prev.avgTicket : 0;
  const yoyCaDelta = yoy.available && yoy.ca ? (cur.ca - yoy.ca) / yoy.ca : 0;
  const yoyTxDelta = yoy.available && yoy.tx ? (cur.tx - yoy.tx) / yoy.tx : 0;
  const yoyTicketDelta =
    yoy.available && yoy.avgTicket ? (cur.avgTicket - yoy.avgTicket) / yoy.avgTicket : 0;
  return {
    ...cur,
    caDelta,
    txDelta,
    ticketDelta,
    yoyAvailable: yoy.available,
    yoyCaDelta,
    yoyTxDelta,
    yoyTicketDelta,
    yoyCa: yoy.ca,
    yoyTx: yoy.tx,
    yoyTicket: yoy.avgTicket,
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
  const caDelta = prev.ca ? (cur.ca - prev.ca) / prev.ca : 0;
  const txDelta = prev.tx ? (cur.tx - prev.tx) / prev.tx : 0;
  const ticketDelta = prev.avgTicket ? (cur.avgTicket - prev.avgTicket) / prev.avgTicket : 0;

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
    yoyAvailable,
    yoyCaDelta,
    yoyTxDelta,
    yoyTicketDelta,
    yoyCa: yoyScope,
    yoyTx: yoyTxScope,
    yoyTicket: yoyTicketScope,
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
          tx: d.tx,
          avgTicket: 0,
          fromagerieCA: d.fromagerieCA,
          snackingCA: d.snackingCA,
          partial: d.partial,
        });
      } else {
        existing.ca += d.ca;
        existing.tx += d.tx;
        existing.fromagerieCA += d.fromagerieCA;
        existing.snackingCA += d.snackingCA;
        if (d.partial) existing.partial = true;
      }
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, avgTicket: d.tx ? d.ca / d.tx : 0 }));
}

export function consolidateProducts(perStore: Product[][]): Product[] {
  const map = new Map<string, Product>();
  for (const list of perStore) {
    for (const p of list) {
      const existing = map.get(p.name);
      if (!existing) {
        map.set(p.name, {
          ...p,
          unitsToday: p.unitsToday,
          units7d: p.units7d,
          units30d: p.units30d,
          revenue7d: p.revenue7d,
          revenue30d: p.revenue30d,
        });
      } else {
        existing.unitsToday += p.unitsToday;
        existing.units7d += p.units7d;
        existing.units30d += p.units30d;
        existing.revenue7d += p.revenue7d;
        existing.revenue30d += p.revenue30d;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue30d - a.revenue30d);
}

export function consolidatePayments(
  perStore: { daily: StoreDaily[]; payments: PaymentSplit[] }[],
): PaymentSplit[] {
  const map = new Map<string, { method: PaymentSplit["method"]; amount: number }>();
  for (const { daily, payments } of perStore) {
    const todayCA = daily[daily.length - 1]?.ca ?? 0;
    for (const p of payments) {
      const existing = map.get(p.method);
      const amount = todayCA * p.share;
      if (!existing) map.set(p.method, { method: p.method, amount });
      else existing.amount += amount;
    }
  }
  const all = Array.from(map.values());
  const total = all.reduce((s, x) => s + x.amount, 0);
  return all.map((p) => ({ method: p.method, share: total ? p.amount / total : 0, amount: p.amount }));
}
