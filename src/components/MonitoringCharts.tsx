"use client";

import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { Card } from "./Card";
import { GranularityToggle } from "./GranularityToggle";
import { LegendInline } from "./LegendInline";
import { LineChart, type LineSeries, type LinePoint } from "./charts/LineChart";

const SERIES_COLORS = [
  "var(--color-coral)",
  "#2563EB",
  "#059669",
  "#9333EA",
];

const MAX_DAYS = 60;
const pctFmt = (n: number) => n.toFixed(1).replace(".", ",") + " %";

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

// Buckets ratio data correctly: sum numerators + denominators, then divide.
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

  const series: LineSeries[] = stores.map((s, i) => ({
    key: s.id,
    label: s.name,
    color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
  }));

  const days = datesInRange(from, to);

  const dailyByStore = new Map<string, Map<string, typeof stores[0]["daily"][0]>>();
  for (const s of stores) {
    const m = new Map<string, typeof s.daily[0]>();
    for (const d of s.daily) m.set(d.date, d);
    dailyByStore.set(s.id, m);
  }

  const especesData = buildRatioData(days, storeIds, (id, date) => {
    const day = dailyByStore.get(id)?.get(date);
    if (!day || day.closed || day.ca <= 0) return { num: null, den: null };
    return { num: day.especesAmount ?? 0, den: day.ca };
  }, granularity);

  return (
    <Card
      title="% paiements en espèces"
      subtitle={`Par boutique · ${periodLabel}`}
      action={
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
      }
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
  );
}
