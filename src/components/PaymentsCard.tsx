"use client";

import { fmtEURshort, fmtPctNoSign } from "@/lib/format";
import type { PaymentSplit } from "@/lib/apitic/types";
import { Donut } from "./charts/Donut";

const COLORS = [
  "var(--color-coral)",
  "var(--color-dark)",
  "var(--color-warm-gray-dim)",
  "var(--color-warm-gray-mid)",
];

export function PaymentsCard({ payments }: { payments: PaymentSplit[] }) {
  return (
    <div className="lm-payments" style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <Donut data={payments} size={160} thickness={22} colors={COLORS} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
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
            <div
              style={{
                flex: 1,
                fontFamily: "var(--font-body)",
                fontSize: 13,
              }}
            >
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
                {p.amount ? fmtEURshort(p.amount) : ""}
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
  );
}
