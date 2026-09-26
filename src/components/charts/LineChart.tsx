"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  fmtEURshort,
  formatDateLabel,
  formatDateLong,
  formatMonthLabel,
} from "@/lib/format";
import type { PeriodKey, PeriodSelection } from "@/lib/apitic/types";
import type { Granularity } from "@/lib/bucketing";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  /** Render the line dashed with reduced opacity. Used for N-1 overlays. */
  dashed?: boolean;
};

export type LinePoint = {
  date: string;
  partial?: boolean;
  [seriesKey: string]: string | number | boolean | null | undefined;
};

type YoyPoint = { date: string; ca: number };

type Props = {
  data: LinePoint[];
  series?: LineSeries[];
  /** Additional series drawn as colored bars behind the main area (compare mode). */
  bars?: LineSeries[];
  yoyData?: YoyPoint[] | null;
  height?: number;
  period?: PeriodKey | PeriodSelection;
  granularity?: Granularity;
  showLegend?: boolean;
  yFormat?: (n: number) => string;
  highlightLast?: boolean;
  /** Key in data points holding the Uber Eats portion (drawn as green area at bottom). Only used for single-series area mode. */
  uberEatsKey?: string;
};

export function LineChart({
  data,
  series = [{ key: "ca", label: "CA", color: "var(--fg-accent)" }],
  bars,
  yoyData = null,
  height = 280,
  period = "7d",
  granularity = "day",
  showLegend = false,
  yFormat = fmtEURshort,
  highlightLast = true,
  uberEatsKey,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const gradIdBase = useId();

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const allVals: number[] = [];
  for (const d of data) {
    for (const s of series) {
      const v = d[s.key];
      if (typeof v === "number") allVals.push(v);
    }
    if (bars) {
      for (const b of bars) {
        const v = d[b.key];
        if (typeof v === "number") allVals.push(v);
      }
    }
  }
  if (yoyData) for (const d of yoyData) allVals.push(d.ca || 0);

  const max = allVals.length ? Math.max(...allVals) : 1;
  const min = 0;
  const range = max - min || 1;
  const steps = 4;
  const ticks: number[] = [];
  for (let i = 0; i <= steps; i++) ticks.push(min + (range * i) / steps);

  const xAt = (i: number) =>
    PAD.left + (i / Math.max(1, data.length - 1)) * innerW;
  const yAt = (v: number) =>
    PAD.top + innerH - ((v - min) / range) * innerH;

  const labelEvery =
    data.length > 30 ? Math.ceil(data.length / 8) : data.length > 14 ? 3 : 1;

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg
        width={w}
        height={height}
        style={{ display: "block" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const idx = Math.round(((x - PAD.left) / innerW) * (data.length - 1));
          if (idx >= 0 && idx < data.length) setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--border-light)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "0" : "2 3"}
            />
            <text
              x={PAD.left - 10}
              y={yAt(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--fg-tertiary)"
              style={{
                fontVariantNumeric: "tabular-nums",
                fontFamily: "var(--font-body)",
              }}
            >
              {yFormat(t)}
            </text>
          </g>
        ))}

        {/* N-1 dashed overlay (single-series only) */}
        {yoyData && series.length === 1 && yoyData.length >= 2 && (
          <path
            d={
              "M " +
              yoyData
                .slice(0, data.length)
                .map((d, i) => `${xAt(i)} ${yAt(d.ca || 0)}`)
                .join(" L ")
            }
            fill="none"
            stroke="var(--fg-tertiary)"
            strokeWidth="1.25"
            strokeDasharray="4 3"
            opacity="0.7"
          />
        )}

        {/* Compare bars — behind main area */}
        {bars && (() => {
          const barW = Math.max(3, (innerW / Math.max(1, data.length)) * 0.45);
          return bars.map((b) => (
            <g key={b.key} opacity={0.45}>
              {data.map((d, i) => {
                const v = d[b.key];
                if (typeof v !== "number" || v <= 0) return null;
                const bH = Math.max(1, ((v - min) / range) * innerH);
                return (
                  <rect
                    key={i}
                    x={xAt(i) - barW / 2}
                    y={yAt(v)}
                    width={barW}
                    height={bH}
                    fill={b.color}
                    rx={1}
                  />
                );
              })}
            </g>
          ));
        })()}

        {/* Uber Eats — green area at bottom (0→ue) + dark green stroke line */}
        {uberEatsKey && series.length === 1 && (() => {
          const hasAnyUE = data.some((d) => {
            const ue = d[uberEatsKey];
            return typeof ue === "number" && ue > 0;
          });
          if (!hasAnyUE) return null;
          let ueLine = ""; let ueInSeg = false;
          let ueAreaPath = "";
          data.forEach((d, i) => {
            const ue = d[uberEatsKey];
            const ueVal = typeof ue === "number" ? Math.max(0, ue) : 0;
            const x = xAt(i); const y = yAt(ueVal);
            ueAreaPath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
            if (ueVal > 0) {
              ueLine += !ueInSeg ? ` M ${x} ${y}` : ` L ${x} ${y}`;
              ueInSeg = true;
            } else { ueInSeg = false; }
          });
          ueAreaPath += ` L ${xAt(data.length - 1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`;
          const ueGradId = `${gradIdBase}-ue`;
          return (
            <g>
              <defs>
                <linearGradient id={ueGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#08C167" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#08C167" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={ueAreaPath} fill={`url(#${ueGradId})`} />
              <path d={ueLine} fill="none" stroke="#08C167" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })()}

        {/* series — main line + area (area closes along UE bottom when applicable) */}
        {series.map((s, sIdx) => {
          let linePath = "";
          let inSegment = false;
          let firstPt: [number, number] | null = null;
          let lastPt: [number, number] | null = null;
          data.forEach((d, i) => {
            const v = d[s.key];
            if (typeof v !== "number") { inSegment = false; return; }
            const cmd = inSegment ? "L" : "M";
            const x = xAt(i); const y = yAt(v);
            linePath += ` ${cmd} ${x} ${y}`;
            inSegment = true;
            if (!firstPt) firstPt = [x, y];
            lastPt = [x, y];
          });
          if (!firstPt || !lastPt) return null;
          const isDashed = s.dashed === true;
          let areaPath: string | null = null;
          if (series.length === 1 && !isDashed) {
            if (uberEatsKey) {
              // Close along UE values so the main area shows only the "boutique" portion
              let bottomPath = "";
              for (let j = data.length - 1; j >= 0; j--) {
                const ue = data[j][uberEatsKey];
                const ueVal = typeof ue === "number" ? Math.max(0, ue) : 0;
                bottomPath += ` L ${xAt(j)} ${yAt(ueVal)}`;
              }
              areaPath = linePath + bottomPath + " Z";
            } else {
              areaPath = linePath + ` L ${lastPt[0]} ${yAt(0)} L ${firstPt[0]} ${yAt(0)} Z`;
            }
          }
          const gradId = `${gradIdBase}-s${sIdx}`;
          return (
            <g key={s.key} opacity={isDashed ? 0.7 : 1}>
              {areaPath && (
                <>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill={`url(#${gradId})`} />
                </>
              )}
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth={isDashed ? "1.25" : "1.75"}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={isDashed ? "4 3" : undefined}
              />
              {highlightLast && !isDashed && (
                <circle
                  cx={lastPt[0]}
                  cy={lastPt[1]}
                  r="3.5"
                  fill="white"
                  stroke={s.color}
                  strokeWidth="1.75"
                />
              )}
            </g>
          );
        })}

        {/* x-axis labels */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={i}
              x={xAt(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg-tertiary)"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {formatDateLabel(d.date, period, granularity)}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hover !== null && (
          <g>
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--fg-primary)"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.4"
            />
            {series.map((s) => {
              const v = data[hover][s.key];
              if (typeof v !== "number") return null;
              return (
                <circle key={s.key} cx={xAt(hover)} cy={yAt(v)} r="4" fill="white" stroke={s.color} strokeWidth="2" />
              );
            })}
            {bars && bars.map((b) => {
              const v = data[hover][b.key];
              if (typeof v !== "number" || v <= 0) return null;
              return (
                <circle key={b.key} cx={xAt(hover)} cy={yAt(v)} r="3" fill={b.color} opacity={0.8} />
              );
            })}
            {yoyData && yoyData[hover] && (
              <circle cx={xAt(hover)} cy={yAt(yoyData[hover].ca || 0)} r="3" fill="var(--fg-tertiary)" />
            )}
          </g>
        )}
      </svg>

      {hover !== null && (
        <Tooltip
          data={data}
          series={series}
          bars={bars}
          yoyData={yoyData}
          hover={hover}
          w={w}
          innerW={innerW}
          padLeft={PAD.left}
          yFormat={yFormat}
          granularity={granularity}
          uberEatsKey={uberEatsKey}
        />
      )}

      {(showLegend || bars) && (
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
          }}
        >
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 2, background: s.color, display: "inline-block" }} />
              {s.label}
            </div>
          ))}
          {bars && bars.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 8, background: b.color, display: "inline-block", borderRadius: 1, opacity: 0.7 }} />
              {b.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tooltip({
  data,
  series,
  bars,
  yoyData,
  hover,
  w,
  innerW,
  padLeft,
  yFormat,
  granularity,
  uberEatsKey,
}: {
  data: LinePoint[];
  series: LineSeries[];
  bars?: LineSeries[];
  yoyData: YoyPoint[] | null;
  hover: number;
  w: number;
  innerW: number;
  padLeft: number;
  yFormat: (n: number) => string;
  granularity: Granularity;
  uberEatsKey?: string;
}) {
  const left = Math.min(
    w - 200,
    Math.max(0, (hover / Math.max(1, data.length - 1)) * innerW + padLeft + 12),
  );
  const tooltipStyle: CSSProperties = {
    position: "absolute",
    left,
    top: 8,
    background: "var(--color-dark)",
    color: "var(--fg-inverted)",
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    fontSize: 12,
    lineHeight: 1.4,
    pointerEvents: "none",
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    boxShadow: "var(--shadow-md)",
  };
  const point = data[hover];
  return (
    <div style={tooltipStyle}>
      <div style={{ opacity: 0.7, marginBottom: 4, fontSize: 11 }}>
        {granularity === "month"
          ? formatMonthLabel(point.date)
          : (granularity === "week" ? "Semaine du " : "") +
            formatDateLong(point.date)}
        {point.partial && (
          <span style={{ color: "var(--color-coral)", marginLeft: 6 }}>
            · en cours
          </span>
        )}
      </div>
      {series.map((s) => {
        const v = point[s.key];
        if (typeof v !== "number") {
          return (
            <div
              key={s.key}
              style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.5 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: s.color,
                  display: "inline-block",
                  borderRadius: 1,
                }}
              />
              <span style={{ flex: 1 }}>{s.label}</span>
              <span style={{ fontStyle: "italic" }}>fermé</span>
            </div>
          );
        }
        return (
          <div
            key={s.key}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                background: s.color,
                display: "inline-block",
                borderRadius: 1,
              }}
            />
            <span style={{ flex: 1 }}>{s.label}</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 500,
              }}
            >
              {yFormat(v)}
            </span>
          </div>
        );
      })}
      {uberEatsKey && (() => {
        const ca = point[series[0]?.key];
        const ue = point[uberEatsKey];
        if (typeof ca !== "number" || typeof ue !== "number" || ue <= 0) return null;
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, opacity: 0.85 }}>
              <span style={{ width: 8, height: 8, background: "var(--fg-inverted-muted)", display: "inline-block", borderRadius: 1 }} />
              <span style={{ flex: 1 }}>C.A. Boutique</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{yFormat(ca - ue)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ width: 8, height: 8, background: "#08C167", display: "inline-block", borderRadius: 1 }} />
              <span style={{ flex: 1 }}>Uber Eats</span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, color: "#6ee7b7" }}>{yFormat(ue)}</span>
            </div>
          </>
        );
      })()}
      {bars && bars.map((b) => {
        const v = point[b.key];
        if (typeof v !== "number") return null;
        return (
          <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, opacity: 0.85 }}>
            <span style={{ width: 8, height: 8, background: b.color, display: "inline-block", borderRadius: 1 }} />
            <span style={{ flex: 1 }}>{b.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{typeof v === "number" ? yFormat(v) : "—"}</span>
          </div>
        );
      })}
      {yoyData && yoyData[hover] && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 2,
            opacity: 0.8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 2,
              background: "var(--fg-inverted-muted)",
              display: "inline-block",
            }}
          />
          <span style={{ flex: 1 }}>N-1</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {yFormat(yoyData[hover].ca || 0)}
          </span>
        </div>
      )}
    </div>
  );
}
