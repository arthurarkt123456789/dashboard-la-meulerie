"use client";

import { useEffect, useRef, useState } from "react";
import { roll7 } from "@/lib/smoothing";
import { fmtEURshort, formatDateLabel, formatDateLong } from "@/lib/format";
import type { StoreDaily, PeriodSelection } from "@/lib/apitic/types";

type Props = {
  daily: StoreDaily[];
  period: PeriodSelection;
  isHT: boolean;
  height?: number;
};

export function StackedCategoryChart({ daily, period, isHT, height = 300 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(960);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(400, e.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = daily.length;

  if (n === 0) return null;

  const frVals = daily.map((d) => (isHT ? (d.fromagerieCAHT ?? 0) : d.fromagerieCA));
  const snVals = daily.map((d) => (isHT ? (d.snackingCAHT ?? 0) : d.snackingCA));
  const epVals = daily.map((d) => (isHT ? (d.epicerieCAHT ?? 0) : (d.epicerieCA ?? 0)));
  const mrVals = daily.map((d) => (isHT ? (d.merchCAHT ?? 0) : (d.merchCA ?? 0)));

  const hasEp = epVals.some((v) => v > 0);
  const hasMr = mrVals.some((v) => v > 0);

  const frMA = roll7(frVals);
  const snMA = roll7(snVals);
  const epMA = hasEp ? roll7(epVals) : null;
  const mrMA = hasMr ? roll7(mrVals) : null;

  const maxTotal = Math.max(
    ...daily.map((_, i) => frVals[i] + snVals[i] + epVals[i] + mrVals[i]),
    1,
  );

  const barStep = innerW / n;
  const barW = Math.max(1, barStep * 0.78);
  const xCenter = (i: number) => PAD.left + (i + 0.5) * barStep;
  const yAt = (v: number) => PAD.top + innerH * (1 - v / maxTotal);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxTotal);
  const labelEvery =
    n > 60 ? Math.ceil(n / 10) : n > 30 ? Math.ceil(n / 8) : n > 14 ? 3 : 1;

  function buildMAPath(components: (number | null)[][]): string {
    let path = "";
    let inSeg = false;
    for (let i = 0; i < n; i++) {
      let cum = 0;
      let valid = true;
      for (const comp of components) {
        const v = comp[i];
        if (v === null) {
          valid = false;
          break;
        }
        cum += v;
      }
      if (!valid) {
        inSeg = false;
        continue;
      }
      path += ` ${inSeg ? "L" : "M"} ${xCenter(i).toFixed(1)} ${yAt(cum).toFixed(1)}`;
      inSeg = true;
    }
    return path;
  }

  const frPath = buildMAPath([frMA]);
  const snPath = buildMAPath([frMA, snMA]);
  const epPath = epMA ? buildMAPath([frMA, snMA, epMA]) : "";
  const mrPath = mrMA
    ? epMA
      ? buildMAPath([frMA, snMA, epMA, mrMA])
      : buildMAPath([frMA, snMA, mrMA])
    : "";

  const legendItems = [
    { label: "Fromagerie", color: "var(--color-dark)" },
    { label: "Snacking", color: "var(--color-coral)" },
    ...(hasEp ? [{ label: "Épicerie", color: "#1A5EA8" }] : []),
    ...(hasMr ? [{ label: "Merch", color: "#7C3AED" }] : []),
  ];

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg
        width={w}
        height={height}
        style={{ display: "block" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const idx = Math.floor((e.clientX - rect.left - PAD.left) / barStep);
          setHover(idx >= 0 && idx < n ? idx : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines + Y-axis labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--border-light)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : "2 3"}
            />
            {i > 0 && (
              <text
                x={PAD.left - 10}
                y={yAt(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--fg-tertiary)"
                style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-body)" }}
              >
                {fmtEURshort(t)}
              </text>
            )}
          </g>
        ))}

        {/* Stacked bars */}
        {daily.map((d, i) => {
          const cx = xCenter(i);
          const bx = cx - barW / 2;
          const segs = [
            { val: frVals[i], color: "var(--color-dark)" },
            { val: snVals[i], color: "var(--color-coral)" },
            ...(hasEp ? [{ val: epVals[i], color: "#1A5EA8" }] : []),
            ...(hasMr ? [{ val: mrVals[i], color: "#7C3AED" }] : []),
          ];
          let baseline = 0;
          return (
            <g key={d.date}>
              {segs.map(({ val, color }) => {
                if (val <= 0) {
                  baseline += val;
                  return null;
                }
                const barH = (val / maxTotal) * innerH;
                const barY = PAD.top + innerH - ((baseline + val) / maxTotal) * innerH;
                baseline += val;
                return (
                  <rect
                    key={color}
                    x={bx}
                    y={barY}
                    width={barW}
                    height={barH}
                    fill={color}
                    opacity={hover !== null && hover !== i ? 0.55 : 1}
                  />
                );
              })}
            </g>
          );
        })}

        {/* 7-day MA lines */}
        {frPath && (
          <path
            d={frPath}
            fill="none"
            stroke="var(--color-dark)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {snPath && (
          <path
            d={snPath}
            fill="none"
            stroke="var(--color-coral)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {epPath && (
          <path
            d={epPath}
            fill="none"
            stroke="#1A5EA8"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {mrPath && (
          <path
            d={mrPath}
            fill="none"
            stroke="#7C3AED"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Hover crosshair */}
        {hover !== null && (
          <line
            x1={xCenter(hover)}
            x2={xCenter(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--fg-primary)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.4"
          />
        )}

        {/* X-axis labels */}
        {daily.map((d, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          return (
            <text
              key={i}
              x={xCenter(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-tertiary)"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {formatDateLabel(d.date, period)}
            </text>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hover !== null && (() => {
        const d = daily[hover];
        const fr = frVals[hover];
        const sn = snVals[hover];
        const ep = epVals[hover];
        const mr = mrVals[hover];
        const total = fr + sn + ep + mr;
        const leftRaw = xCenter(hover) + 12;
        const left = Math.min(w - 185, Math.max(0, leftRaw));

        return (
          <div
            style={{
              position: "absolute",
              left,
              top: 8,
              background: "var(--color-dark)",
              color: "var(--fg-inverted)",
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              lineHeight: 1.5,
              pointerEvents: "none",
              fontFamily: "var(--font-body)",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ opacity: 0.7, marginBottom: 4, fontSize: 11 }}>
              {formatDateLong(d.date)}
              {d.partial && (
                <span style={{ color: "var(--color-coral)", marginLeft: 6 }}>
                  · en cours
                </span>
              )}
            </div>
            {[
              { label: "Fromagerie", color: "var(--color-dark)", val: fr },
              { label: "Snacking", color: "var(--color-coral)", val: sn },
              ...(hasEp ? [{ label: "Épicerie", color: "#1A5EA8", val: ep }] : []),
              ...(hasMr ? [{ label: "Merch", color: "#7C3AED", val: mr }] : []),
            ].map(({ label, color, val }) => (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: color,
                    display: "inline-block",
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                  {fmtEURshort(val)}
                </span>
              </div>
            ))}
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.15)",
                marginTop: 4,
                paddingTop: 4,
                display: "flex",
                gap: 8,
              }}
            >
              <span style={{ flex: 1, opacity: 0.7 }}>Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {fmtEURshort(total)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 6,
          paddingLeft: PAD.left,
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--fg-secondary)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {legendItems.map(({ label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                background: color,
                display: "inline-block",
                borderRadius: 1,
              }}
            />
            {label}
          </div>
        ))}
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.6 }}
        >
          <svg width="16" height="8" style={{ display: "inline-block" }}>
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="currentColor"
              strokeWidth="1.75"
            />
          </svg>
          <span>Moy. 7j</span>
        </div>
      </div>
    </div>
  );
}
