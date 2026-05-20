"use client";

import { fmtEURshort, fmtPctNoSign } from "@/lib/format";

export type HBarRow = {
  label: string;
  value: number;
  yoyValue?: number | null;
};

type Props = {
  rows: HBarRow[];
  format?: (n: number) => string;
  accentTop?: boolean;
};

export function HBarChart({
  rows,
  format = fmtEURshort,
  accentTop = true,
}: Props) {
  const max = Math.max(
    ...rows.map((r) => Math.max(r.value, r.yoyValue ?? 0)),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r, i) => {
        const pct = (r.value / (max || 1)) * 100;
        const yoyPct = r.yoyValue ? (r.yoyValue / (max || 1)) * 100 : null;
        const isTop = i === 0 && accentTop;
        const delta = r.yoyValue ? (r.value - r.yoyValue) / r.yoyValue : null;
        return (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 110px",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--fg-primary)",
                fontWeight: 500,
              }}
            >
              {r.label}
            </div>
            <div
              style={{
                position: "relative",
                height: 14,
                background: "var(--bg-subtle)",
                borderRadius: 2,
                overflow: "visible",
              }}
            >
              <div
                style={{
                  width: pct + "%",
                  height: "100%",
                  background: isTop ? "var(--color-coral)" : "var(--color-dark)",
                  transition: "width 400ms ease",
                  borderRadius: 2,
                }}
              />
              {yoyPct !== null && (
                <div
                  title={`N-1 : ${format(r.yoyValue ?? 0)}`}
                  style={{
                    position: "absolute",
                    top: -2,
                    bottom: -2,
                    left: `calc(${yoyPct}% - 1px)`,
                    width: 2,
                    background: "var(--fg-tertiary)",
                    borderRadius: 1,
                  }}
                />
              )}
            </div>
            <div
              style={{
                textAlign: "right",
                fontFamily: "var(--font-body)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--fg-primary)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500 }}>{format(r.value)}</div>
              {delta !== null ? (
                <div
                  className={
                    "lm-delta " +
                    (delta > 0 ? "pos" : delta < 0 ? "neg" : "neu")
                  }
                  style={{ fontSize: 10, fontWeight: 500, marginTop: 1 }}
                >
                  {delta > 0 ? "↑" : delta < 0 ? "↓" : "·"}{" "}
                  {fmtPctNoSign(Math.abs(delta))}{" "}
                  <span style={{ color: "var(--fg-tertiary)", fontWeight: 400 }}>
                    N-1
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--fg-tertiary)",
                    marginTop: 1,
                  }}
                >
                  nouveau
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 4,
          fontFamily: "var(--font-body)",
          fontSize: 10,
          color: "var(--fg-tertiary)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 6,
              background: "var(--color-coral)",
              display: "inline-block",
              borderRadius: 1,
            }}
          />
          Période courante
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 2,
              height: 12,
              background: "var(--fg-tertiary)",
              display: "inline-block",
            }}
          />
          Repère N-1
        </div>
      </div>
    </div>
  );
}
