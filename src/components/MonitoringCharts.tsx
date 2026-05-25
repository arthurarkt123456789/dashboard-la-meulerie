"use client";

import { useQuery } from "@tanstack/react-query";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { Card } from "./Card";
import { GranularityToggle } from "./GranularityToggle";
import { LegendInline } from "./LegendInline";
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

// Stores raw numerators + denominators, buckets them (so weekly sums are
// on raw counts, not percentages), then computes the ratio from bucketed sums.
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
  periodLabel: string;
  granularity: Granularity;
  allowWeekly: boolean;
  allowMonth: boolean;
  onGranularity: (g: Granularity) => void;
};

export function MonitoringCharts({
  stores,
  period,
  periodLabel,
  granularity,
  allowWeekly,
  allowMonth,
  onGranularity,
}: Props) {
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
    retry: false,
  });

  const series: LineSeries[] = stores.map((s, i) => ({
    key: s.id,
    label: s.name,
    color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
  }));

  const days = datesInRange(from, to);

  // ── Lookup indexes ────────────────────────────────────────────────────────
  const dailyByStore = new Map<string, Map<string, typeof stores[0]["daily"][0]>>();
  for (const s of stores) {
    const m = new Map<string, typeof s.daily[0]>();
    for (const d of s.daily) m.set(d.date, d);
    dailyByStore.set(s.id, m);
  }

  const monByStore = new Map<string, Map<string, NonNullable<typeof data>["stores"][0]["daily"][0]>>();
  if (data && !data.blackout) {
    for (const s of data.stores) {
      const m = new Map<string, typeof s.daily[0]>();
      for (const d of s.daily) m.set(d.date, d);
      monByStore.set(s.id, m);
    }
  }

  // ── Chart 1: % espèces ─────────────────────────────────────────────────
  const especesData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed || day.ca <= 0) return { num: null, den: null };
    return { num: day.especesAmount ?? 0, den: day.ca };
  }, granularity);

  // ── Charts 2-5 from monitoring API ────────────────────────────────────
  const ticketsCountData = buildCountData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed) return null;
    return monByStore.get(id)?.get(date)?.cancelledTx ?? 0;
  }, granularity);

  const ticketsPctData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed) return { num: null, den: null };
    const cancelled = monByStore.get(id)?.get(date)?.cancelledTx ?? 0;
    return { num: cancelled, den: day.tx + cancelled };
  }, granularity);

  const amountPctData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed || day.ca <= 0) return { num: null, den: null };
    const cancelled = monByStore.get(id)?.get(date)?.cancelledAmount ?? 0;
    return { num: cancelled, den: day.ca + cancelled };
  }, granularity);

  const linesCountData = buildCountData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed) return null;
    return monByStore.get(id)?.get(date)?.cancelledLines ?? 0;
  }, granularity);

  const isBlackout = !!data?.blackout;
  const cancelledUnavailable = isLoading || isError || isBlackout;
  const cancelledPlaceholder = isBlackout
    ? `Indisponible · fenêtre APITIC ${data.blackout}`
    : isLoading ? "Chargement des annulations…"
    : "Données indisponibles";

  const chartAction = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {allowWeekly && (
        <GranularityToggle
          value={granularity}
          onChange={onGranularity}
          allowMonth={allowMonth}
        />
      )}
      <LegendInline series={series} />
    </div>
  );

  return (
    <>
      {/* ── % Espèces — same visual as CA chart ──────────────────────────── */}
      <Card
        title="% paiements en espèces"
        subtitle={`Par boutique · ${periodLabel}`}
        action={chartAction}
        span={2}
      >
        <LineChart
          data={especesData}
          series={series}
          height={280}
          period={period}
          granularity={granularity}
          yFormat={pctFmt}
          highlightLast={false}
        />
      </Card>

      {/* ── Tickets annulés ─────────────────────────────────────────────── */}
      <Card title="Tickets annulés — nombre" subtitle="Par boutique">
        {cancelledUnavailable ? (
          <ChartPlaceholder text={cancelledPlaceholder} />
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

      <Card title="Tickets annulés — % transactions" subtitle="Annulés / (soldés + annulés)">
        {cancelledUnavailable ? (
          <ChartPlaceholder text={cancelledPlaceholder} />
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
        {cancelledUnavailable ? (
          <ChartPlaceholder text={cancelledPlaceholder} height={200} />
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

      {/* ── Produits annulés ────────────────────────────────────────────── */}
      <Card
        title="Produits annulés — lignes"
        subtitle="Nombre de lignes dans les tickets annulés · par boutique"
        span={2}
      >
        {cancelledUnavailable ? (
          <ChartPlaceholder text={cancelledPlaceholder} height={200} />
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
