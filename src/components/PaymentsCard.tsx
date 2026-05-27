"use client";

import { useMemo } from "react";
import { fmtEURshort, fmtPctNoSign } from "@/lib/format";
import type { PaymentSplit, PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { Donut } from "./charts/Donut";
import { LineChart } from "./charts/LineChart";
import { roll7 } from "@/lib/smoothing";
import type { AmountMode } from "./AmountModeToggle";

const COLORS = [
  "var(--color-coral)",
  "var(--color-dark)",
  "var(--color-warm-gray-dim)",
  "var(--color-warm-gray-mid)",
];

const METHODS = ["Carte bancaire", "Virement", "Espèces", "Tickets resto"] as const;

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

  const paymentChartData = useMemo(() => {
    if (!daily || !period || daily.length < 3) return null;
    const raw = daily.map((d) => {
      const total =
        (d.cbAmount ?? 0) +
        (d.virementAmount ?? 0) +
        (d.especesAmount ?? 0) +
        (d.ticketsRestoAmount ?? 0);
      if (total <= 0) {
        return { date: d.date, cb: null, virement: null, especes: null, ticketsResto: null };
      }
      return {
        date: d.date,
        cb: (d.cbAmount ?? 0) / total,
        virement: (d.virementAmount ?? 0) / total,
        especes: (d.especesAmount ?? 0) / total,
        ticketsResto: (d.ticketsRestoAmount ?? 0) / total,
      };
    });
    const cbMA = roll7(raw.map((d) => d.cb));
    const virMA = roll7(raw.map((d) => d.virement));
    const espMA = roll7(raw.map((d) => d.especes));
    const trMA = roll7(raw.map((d) => d.ticketsResto));
    return raw.map((d, i) => ({
      date: d.date,
      cb: cbMA[i],
      virement: virMA[i],
      especes: espMA[i],
      ticketsResto: trMA[i],
    }));
  }, [daily, period]);

  const hasChart = paymentChartData !== null && paymentChartData.some((d) => d.cb !== null);

  return (
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
      {/* Donut + legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 32, flexShrink: 0 }}>
        <Donut data={payments} size={160} thickness={22} colors={COLORS} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {payments.map((p, i) => (
            <div
              key={p.method}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: COLORS[i],
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: 13 }}>
                <div style={{ color: "var(--fg-primary)", fontWeight: 500 }}>
                  {p.method}
                </div>
                <div
                  style={{
                    color: "var(--fg-tertiary)",
                    fontSize: 11,
                    marginTop: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {(() => {
                    const v = isHT ? p.amountHT : p.amount;
                    return v ? fmtEURshort(v) : "";
                  })()}
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 18,
                  color: "var(--fg-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtPctNoSign(p.share)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Evolution chart */}
      {hasChart && paymentChartData && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--fg-secondary)",
            fontWeight: 500,
            marginBottom: 8,
          }}>
            Évolution · moy. 7j
          </div>
          <LineChart
            data={paymentChartData}
            series={METHODS.map((m, i) => ({
              key: ["cb", "virement", "especes", "ticketsResto"][i],
              label: m,
              color: COLORS[i],
            }))}
            period={period}
            height={200}
            yFormat={(n) => Math.round(n * 100) + " %"}
            highlightLast={false}
          />
        </div>
      )}
    </div>
  );
}
