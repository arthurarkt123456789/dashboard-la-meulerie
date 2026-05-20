"use client";

import { fmtEUR } from "@/lib/format";
import type { StoreHourly } from "@/lib/apitic/types";

type Props = { hourly: StoreHourly[]; height?: number };

export function HourlyBars({ hourly, height = 100 }: Props) {
  const max = Math.max(...hourly.map((h) => h.ca)) || 1;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height,
        paddingBottom: 18,
        position: "relative",
      }}
    >
      {hourly.map((h) => {
        const pct = (h.ca / max) * 100;
        return (
          <div
            key={h.hour}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              height: "100%",
              justifyContent: "flex-end",
              position: "relative",
            }}
          >
            <div
              title={`${h.hour}h — ${fmtEUR(h.ca)}`}
              style={{
                width: "100%",
                height: pct + "%",
                minHeight: 2,
                background: h.done ? "var(--color-dark)" : "var(--border-light)",
                borderRadius: "1px 1px 0 0",
                transition: "height 300ms ease",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -18,
                fontFamily: "var(--font-body)",
                fontSize: 10,
                color: "var(--fg-tertiary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {h.hour}h
            </div>
          </div>
        );
      })}
    </div>
  );
}
