"use client";

import { useQuery } from "@tanstack/react-query";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { Card } from "./Card";
import { LineChart, type LineSeries } from "./charts/LineChart";
import type { MonitoringResponse } from "@/app/api/monitoring/route";

const SERIES_COLORS = [
  "var(--color-coral)",
  "#2563EB",
  "#059669",
  "#9333EA",
];

const pctFormat = (n: number) => n.toFixed(1).replace(".", ",") + " %";

type Props = {
  stores: StoreData[];
  period: PeriodSelection;
};

export function MonitoringCharts({ stores, period }: Props) {
  const todayISO = stores[0]?.daily[stores[0].daily.length - 1]?.date ?? "";
  const { from, to } = rangeForSelection(period, todayISO);

  const { data, isLoading, isError } = useQuery<MonitoringResponse>({
    queryKey: ["monitoring", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`monitoring ${res.status}`);
      return res.json() as Promise<MonitoringResponse>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const series: LineSeries[] = stores.map((s, i) => ({
    key: s.id,
    label: s.name,
    color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
  }));

  // ── Chart 1: % espèces ────────────────────────────────────────────────
  // Built from StoreDaily.especesAmount — no monitoring API needed.
  const especesData = (() => {
    const dateRange = datesInRange(from, to);
    return dateRange.map((date) => {
      const row: { date: string; [k: string]: string | number | null } = { date };
      for (const store of stores) {
        const day = store.daily.find((d) => d.date === date);
        if (!day || day.closed || day.ca <= 0) {
          row[store.id] = null;
        } else {
          row[store.id] = Math.round(((day.especesAmount ?? 0) / day.ca) * 1000) / 10;
        }
      }
      return row;
    });
  })();

  // ── Chart 2: % tickets annulés ────────────────────────────────────────
  // Requires monitoring API data.
  const cancelledData = (() => {
    if (!data) return null;
    const byStore: Record<string, Record<string, { cancelledTx: number }>> = {};
    for (const s of data.stores) {
      byStore[s.id] = {};
      for (const d of s.daily) byStore[s.id][d.date] = d;
    }

    const dateRange = datesInRange(from, to);
    return dateRange.map((date) => {
      const row: { date: string; [k: string]: string | number | null } = { date };
      for (const store of stores) {
        const day = store.daily.find((d) => d.date === date);
        const cancelled = byStore[store.id]?.[date]?.cancelledTx ?? 0;
        if (!day || day.closed) {
          row[store.id] = null;
        } else {
          const total = day.tx + cancelled;
          row[store.id] = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;
        }
      }
      return row;
    });
  })();

  return (
    <>
      <Card
        title="% paiements en espèces"
        subtitle="Par boutique · détection anomalies"
        span={2}
      >
        <LineChart
          data={especesData}
          series={series}
          height={220}
          period={period}
          granularity="day"
          yFormat={pctFormat}
          showLegend={false}
          highlightLast={false}
        />
      </Card>

      <Card
        title="% tickets annulés"
        subtitle="Par boutique · annulés / (validés + annulés)"
        span={2}
      >
        {isLoading && (
          <div style={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg-tertiary)",
            fontSize: 13,
            fontFamily: "var(--font-body)",
          }}>
            Chargement des annulations…
          </div>
        )}
        {isError && (
          <div style={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg-tertiary)",
            fontSize: 13,
            fontFamily: "var(--font-body)",
          }}>
            Données indisponibles
          </div>
        )}
        {cancelledData && (
          <LineChart
            data={cancelledData}
            series={series}
            height={220}
            period={period}
            granularity="day"
            yFormat={pctFormat}
            showLegend={false}
            highlightLast={false}
          />
        )}
      </Card>
    </>
  );
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const MAX = 60;
  while (cur <= end && dates.length < MAX) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}
