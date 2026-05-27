"use client";

import { useMemo, useState } from "react";
import { fmtEURshort, fmtPctNoSign } from "@/lib/format";
import type { PaymentSplit, PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { Donut } from "./charts/Donut";
import { LineChart } from "./charts/LineChart";
import { GranularityToggle } from "./GranularityToggle";
import type { AmountMode } from "./AmountModeToggle";

const COLORS = [
  "var(--color-coral)",
  "var(--color-dark)",
  "var(--color-warm-gray-dim)",
  "var(--color-warm-gray-mid)",
];

const METHODS = ["Carte bancaire", "Virement", "Espèces", "Tickets resto"] as const;
const KEYS = ["cb", "virement", "especes", "ticketsResto"] as const;

type BucketRow = {
  date: string;
  cb: number | null;
  virement: number | null;
  especes: number | null;
  ticketsResto: number | null;
};

function bucketByDay(daily: StoreDaily[]): BucketRow[] {
  return daily.map((d) => {
    const total =
      (d.cbAmount ?? 0) + (d.virementAmount ?? 0) +
      (d.especesAmount ?? 0) + (d.ticketsRestoAmount ?? 0);
    if (total <= 0) return { date: d.date, cb: null, virement: null, especes: null, ticketsResto: null };
    return {
      date: d.date,
      cb: (d.cbAmount ?? 0) / total,
      virement: (d.virementAmount ?? 0) / total,
      especes: (d.especesAmount ?? 0) / total,
      ticketsResto: (d.ticketsRestoAmount ?? 0) / total,
    };
  });
}

function bucketByWeek(daily: StoreDaily[]): BucketRow[] {
  const byWeek = new Map<string, { cb: number; vir: number; esp: number; tr: number }>();
  for (const d of daily) {
    const dt = new Date(`${d.date}T00:00:00Z`);
    const dow = dt.getUTCDay();
    dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    const k = dt.toISOString().slice(0, 10);
    const acc = byWeek.get(k) ?? { cb: 0, vir: 0, esp: 0, tr: 0 };
    acc.cb += d.cbAmount ?? 0;
    acc.vir += d.virementAmount ?? 0;
    acc.esp += d.especesAmount ?? 0;
    acc.tr += d.ticketsRestoAmount ?? 0;
    byWeek.set(k, acc);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { cb, vir, esp, tr }]) => {
      const total = cb + vir + esp + tr;
      if (total <= 0) return { date, cb: null, virement: null, especes: null, ticketsResto: null };
      return { date, cb: cb / total, virement: vir / total, especes: esp / total, ticketsResto: tr / total };
    });
}

export function PaymentsCard({
  payments,
  amountMode = "TTC",
  daily,
  period,
}: {
  payments: PaymentSplit[];
  amountMode?: AmountMode;
  daily?: StoreDaily[];
  period?: PeriodSelection;
}) {
  const isHT = amountMode === "HT";
  const allowWeekly = (daily?.length ?? 0) > 14;
  const [granularity, setGranularity] = useState<"day" | "week">("day");

  const paymentChartData = useMemo((): BucketRow[] | null => {
    if (!daily || !period || daily.length < 2) return null;
    return granularity === "week" ? bucketByWeek(daily) : bucketByDay(daily);
  }, [daily, period, granularity]);

  const hasChart = paymentChartData !== null && paymentChartData.some(
    (d) => d.cb !== null || d.virement !== null,
  );

  return (
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
      {/* Donut + legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 32, flexShrink: 0 }}>
        <Donut data={payments} size={160} thickness={22} colors={COLORS} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {payments.map((p, i) => (
            <div key={p.method} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, background: COLORS[i], borderRadius: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: 13 }}>
                <div style={{ color: "var(--fg-primary)", fontWeight: 500 }}>{p.method}</div>
                <div style={{ color: "var(--fg-tertiary)", fontSize: 11, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  {(() => { const v = isHT ? p.amountHT : p.amount; return v ? fmtEURshort(v) : ""; })()}
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
                {fmtPctNoSign(p.share)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Evolution chart */}
      {hasChart && paymentChartData && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--fg-secondary)",
              fontWeight: 500,
            }}>
              Évolution
            </div>
            {allowWeekly && (
              <GranularityToggle value={granularity} onChange={(g) => setGranularity(g as "day" | "week")} />
            )}
          </div>
          <LineChart
            data={paymentChartData}
            series={METHODS.map((m, i) => ({ key: KEYS[i], label: m, color: COLORS[i] }))}
            period={period}
            granularity={granularity}
            height={200}
            yFormat={(n) => Math.round(n * 100) + " %"}
            highlightLast={false}
          />
        </div>
      )}
    </div>
  );
}
