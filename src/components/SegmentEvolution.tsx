"use client";

import { useMemo, useState } from "react";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { roll7 } from "@/lib/smoothing";
import { Card } from "./Card";
import { LineChart, type LineSeries } from "./charts/LineChart";
import { LegendInline } from "./LegendInline";
import { GranularityToggle } from "./GranularityToggle";
import { N1Toggle } from "./N1Toggle";
import type { AmountMode } from "./AmountModeToggle";

type Props = {
  /** Source daily series (consolidated across stores OR single store). */
  daily: StoreDaily[];
  period: PeriodSelection;
  amountMode: AmountMode;
  allowWeekly: boolean;
  allowMonth: boolean;
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
  /** If true, N-1 data is available — toggle is enabled. */
  yoyAvailable: boolean;
};

function subtractDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function SegmentEvolution({
  daily,
  period,
  amountMode,
  allowWeekly,
  allowMonth,
  granularity,
  onGranularity,
  yoyAvailable,
}: Props) {
  const [showN1, setShowN1] = useState(false);
  const [smooth, setSmooth] = useState(false);
  const isHT = amountMode === "HT";
  const yoyOffsetDays =
    period.kind === "month" || period.kind === "fiscal-year-todate" ? 365 : 364;

  const lineData = useMemo(() => {
    if (daily.length === 0) return [];
    const todayISO = daily[daily.length - 1].date;
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = daily.filter((d) => d.date >= from && d.date <= to);

    return slice.map((d) => {
      const fromagerie = isHT ? d.fromagerieCAHT ?? 0 : d.fromagerieCA;
      const snacking = isHT ? d.snackingCAHT ?? 0 : d.snackingCA;
      const row: {
        date: string;
        partial?: boolean;
        [k: string]: string | number | boolean | null | undefined;
      } = {
        date: d.date,
        partial: d.partial,
        fromagerie: d.closed ? null : fromagerie,
        snacking: d.closed ? null : snacking,
      };
      if (showN1) {
        const yoyDate = subtractDaysISO(d.date, yoyOffsetDays);
        const yoyDay = daily.find((dd) => dd.date === yoyDate);
        if (yoyDay && !yoyDay.closed) {
          row.fromagerie__yoy = isHT ? yoyDay.fromagerieCAHT ?? 0 : yoyDay.fromagerieCA;
          row.snacking__yoy = isHT ? yoyDay.snackingCAHT ?? 0 : yoyDay.snackingCA;
        } else {
          row.fromagerie__yoy = null;
          row.snacking__yoy = null;
        }
      }
      return row;
    });
  }, [daily, period, isHT, showN1, yoyOffsetDays]);

  const series: LineSeries[] = useMemo(() => {
    const base: LineSeries[] = [
      { key: "fromagerie", label: "Fromagerie", color: "var(--color-dark)" },
      { key: "snacking", label: "Snacking", color: "var(--color-coral)" },
    ];
    if (!showN1) return base;
    return [
      ...base,
      {
        key: "fromagerie__yoy",
        label: "Fromagerie N-1",
        color: "var(--color-dark)",
        dashed: true,
      },
      {
        key: "snacking__yoy",
        label: "Snacking N-1",
        color: "var(--color-coral)",
        dashed: true,
      },
    ];
  }, [showN1]);

  const smoothedData = useMemo(() => {
    if (!smooth || granularity !== "day") return lineData;
    const keys = ["fromagerie", "snacking", ...(showN1 ? ["fromagerie__yoy", "snacking__yoy"] : [])];
    const smoothed = { ...Object.fromEntries(keys.map((k) => [k, roll7(lineData.map((d) => {
      const v = d[k];
      return typeof v === "number" ? v : null;
    }))])) };
    return lineData.map((d, i) => ({
      ...d,
      ...Object.fromEntries(keys.map((k) => [k, smoothed[k][i]])),
    }));
  }, [lineData, smooth, granularity, showN1]);

  const chartData = useMemo(
    () => maybeBucket(smoothedData, granularity),
    [smoothedData, granularity],
  );

  return (
    <Card
      title="Évolution Fromagerie / Snacking"
      subtitle={`Montants ${isHT ? "HT" : "TTC"}${smooth && granularity === "day" ? " · moy. 7j" : ""}`}
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {allowWeekly && (
            <GranularityToggle
              value={granularity}
              onChange={onGranularity}
              allowMonth={allowMonth}
            />
          )}
          <N1Toggle value={showN1} onChange={setShowN1} disabled={!yoyAvailable} />
          <button
            className={"lm-seg-btn" + (smooth ? " active" : "")}
            style={{ fontSize: 11, padding: "2px 8px", lineHeight: "20px" }}
            onClick={() => setSmooth((v) => !v)}
            title="Moyenne glissante 7 jours"
          >
            ~7j
          </button>
          <LegendInline series={series.filter((s) => !s.dashed)} />
        </div>
      }
      span={2}
    >
      <LineChart
        data={chartData}
        series={series}
        height={260}
        period={period}
        granularity={granularity}
      />
    </Card>
  );
}
