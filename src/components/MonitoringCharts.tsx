"use client";

import { useQuery } from "@tanstack/react-query";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { Card } from "./Card";
import { LineChart, type LineSeries, type LinePoint } from "./charts/LineChart";
import type { MonitoringResponse } from "@/app/api/monitoring/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const SERIES_COLORS = [
  "var(--color-coral)",
  "#2563EB",
  "#059669",
  "#9333EA",
];

const MAX_DAYS = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end && dates.length < MAX_DAYS) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

const pctFmt = (n: number) => n.toFixed(1).replace(".", ",") + " %";
const countFmt = (n: number) => Math.round(n).toString();

// Builds per-day ratio data (numerator + denominator), buckets them together,
// then computes the ratio from the bucketed sums so weekly/monthly views are correct.
function buildRatioData(
  days: string[],
  storeIds: string[],
  getNumDen: (storeId: string, date: string) => { num: number | null; den: number | null },
  granularity: Granularity,
): LinePoint[] {
  const raw = days.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const id of storeIds) {
      const { num, den } = getNumDen(id, date);
      row[id + "__num"] = num;
      row[id + "__den"] = den;
    }
    return row as LinePoint;
  });

  const bucketed = maybeBucket(raw, granularity);

  return bucketed.map((row) => {
    const result: LinePoint = { date: row.date };
    for (const id of storeIds) {
      const num = row[id + "__num"] as number | null;
      const den = row[id + "__den"] as number | null;
      result[id] = num !== null && den !== null && den > 0
        ? Math.round((num / den) * 1000) / 10
        : null;
    }
    return result;
  });
}

// Builds absolute count data (weekly view sums correctly via maybeBucket).
function buildCountData(
  days: string[],
  storeIds: string[],
  getValue: (storeId: string, date: string) => number | null,
  granularity: Granularity,
): LinePoint[] {
  const raw = days.map((date) => {
    const row: LinePoint = { date };
    for (const id of storeIds) row[id] = getValue(id, date);
    return row;
  });
  return maybeBucket(raw, granularity);
}

// ─── Loading / Error placeholders ─────────────────────────────────────────────

function ChartPlaceholder({ text, height = 160 }: { text: string; height?: number }) {
  return (
    <div style={{
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--fg-tertiary)",
      fontSize: 13,
      fontFamily: "var(--font-body)",
    }}>
      {text}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  stores: StoreData[];
  period: PeriodSelection;
  granularity: Granularity;
};

export function MonitoringCharts({ stores, period, granularity }: Props) {
  const todayISO = stores[0]?.daily[stores[0].daily.length - 1]?.date ?? "";
  const { from, to } = rangeForSelection(period, todayISO);
  const storeIds = stores.map((s) => s.id);

  const { data, isLoading, isError } = useQuery<MonitoringResponse>({
    queryKey: ["monitoring", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`monitoring ${res.status}`);
      return res.json() as Promise<MonitoringResponse>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const series: LineSeries[] = stores.map((s, i) => ({
    key: s.id,
    label: s.name,
    color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
  }));

  const days = datesInRange(from, to);

  // ── Index for fast lookup ──────────────────────────────────────────────────
  const dailyByStore = new Map<string, Map<string, (typeof stores[0]["daily"][0])>>();
  for (const s of stores) {
    const m = new Map<string, typeof s.daily[0]>();
    for (const d of s.daily) m.set(d.date, d);
    dailyByStore.set(s.id, m);
  }

  const monByStore = new Map<string, Map<string, NonNullable<typeof data>["stores"][0]["daily"][0]>>();
  if (data) {
    for (const s of data.stores) {
      const m = new Map<string, typeof s.daily[0]>();
      for (const d of s.daily) m.set(d.date, d);
      monByStore.set(s.id, m);
    }
  }

  // ── Chart 1: % espèces ────────────────────────────────────────────────────
  const especesData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed || day.ca <= 0) return { num: null, den: null };
    return { num: day.especesAmount ?? 0, den: day.ca };
  }, granularity);

  // ── Chart 2: tickets annulés — nombre ─────────────────────────────────────
  const ticketsCountData = buildCountData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed) return null;
    const mon = monByStore.get(id)?.get(date);
    return mon?.cancelledTx ?? 0;
  }, granularity);

  // ── Chart 3: tickets annulés — % transactions ─────────────────────────────
  const ticketsPctData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed) return { num: null, den: null };
    const mon = monByStore.get(id)?.get(date);
    const cancelled = mon?.cancelledTx ?? 0;
    const total = day.tx + cancelled;
    return { num: cancelled, den: total };
  }, granularity);

  // ── Chart 4: montant annulé — % du CA ────────────────────────────────────
  const amountPctData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed || day.ca <= 0) return { num: null, den: null };
    const mon = monByStore.get(id)?.get(date);
    const cancelled = mon?.cancelledAmount ?? 0;
    const total = day.ca + cancelled;
    return { num: cancelled, den: total };
  }, granularity);

  // ── Chart 5: produits annulés — nombre de lignes ──────────────────────────
  const linesCountData = buildCountData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed) return null;
    const mon = monByStore.get(id)?.get(date);
    return mon?.cancelledLines ?? 0;
  }, granularity);

  const isLoadingMonitoring = isLoading;
  const isErrorMonitoring = isError;

  return (
    <>
      {/* ── Espèces ──────────────────────────────────────────────────────── */}
      <Card
        title="% paiements en espèces"
        subtitle="Par boutique · évolution"
        span={2}
      >
        <LineChart
          data={especesData}
          series={series}
          height={200}
          period={period}
          granularity={granularity}
          yFormat={pctFmt}
          highlightLast={false}
        />
      </Card>

      {/* ── Tickets annulés ─────────────────────────────────────────────── */}
      <Card
        title="Tickets annulés — nombre"
        subtitle="Par boutique"
      >
        {isLoadingMonitoring ? (
          <ChartPlaceholder text="Chargement…" />
        ) : isErrorMonitoring ? (
          <ChartPlaceholder text="Données indisponibles" />
        ) : (
          <LineChart
            data={ticketsCountData}
            series={series}
            height={200}
            period={period}
            granularity={granularity}
            yFormat={countFmt}
            highlightLast={false}
          />
        )}
      </Card>

      <Card
        title="Tickets annulés — % transactions"
        subtitle="Annulés / (soldés + annulés)"
      >
        {isLoadingMonitoring ? (
          <ChartPlaceholder text="Chargement…" />
        ) : isErrorMonitoring ? (
          <ChartPlaceholder text="Données indisponibles" />
        ) : (
          <LineChart
            data={ticketsPctData}
            series={series}
            height={200}
            period={period}
            granularity={granularity}
            yFormat={pctFmt}
            highlightLast={false}
          />
        )}
      </Card>

      {/* ── Montant annulé ──────────────────────────────────────────────── */}
      <Card
        title="Montant annulé — % du CA"
        subtitle="Valeur annulée / (CA + annulé)"
        span={2}
      >
        {isLoadingMonitoring ? (
          <ChartPlaceholder text="Chargement…" />
        ) : isErrorMonitoring ? (
          <ChartPlaceholder text="Données indisponibles" />
        ) : (
          <LineChart
            data={amountPctData}
            series={series}
            height={200}
            period={period}
            granularity={granularity}
            yFormat={pctFmt}
            highlightLast={false}
          />
        )}
      </Card>

      {/* ── Produits annulés (lignes) ────────────────────────────────────── */}
      <Card
        title="Produits annulés — nombre de lignes"
        subtitle="Lignes de produits dans les tickets annulés"
        span={2}
      >
        {isLoadingMonitoring ? (
          <ChartPlaceholder text="Chargement…" />
        ) : isErrorMonitoring ? (
          <ChartPlaceholder text="Données indisponibles" />
        ) : (
          <LineChart
            data={linesCountData}
            series={series}
            height={200}
            period={period}
            granularity={granularity}
            yFormat={countFmt}
            highlightLast={false}
          />
        )}
      </Card>
    </>
  );
}
