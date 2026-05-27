"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { fmtEURshort } from "@/lib/format";

const FR_DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
// Mon=1 … Sat=6; skip Sun (usually closed)
const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

type Props = {
  daily: StoreDaily[];
  period: PeriodSelection;
  isHT: boolean;
  height?: number;
};

type DayStats = {
  dow: number;
  label: string;
  avgCA: number;
  avgFromagerie: number;
  avgSnacking: number;
  avgEpicerie: number;
  avgTx: number;
  n: number;
};

export function WeekdayChart({ daily, period, isHT, height = 220 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => {
      for (const entry of e) setW(Math.max(260, entry.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const stats = useMemo<DayStats[]>(() => {
    if (!daily.length) return [];
    const todayISO = daily[daily.length - 1].date;
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = daily.filter((d) => d.date >= from && d.date <= to && !d.closed && d.tx > 0);

    return WORKING_DAYS.map((dow) => {
      const days = slice.filter((d) => new Date(`${d.date}T00:00:00`).getDay() === dow);
      if (!days.length) return null;
      const n = days.length;
      const avgCA = days.reduce((s, d) => s + (isHT ? (d.caHT ?? 0) : d.ca), 0) / n;
      const avgFrm = days.reduce((s, d) => s + (isHT ? (d.fromagerieCAHT ?? 0) : d.fromagerieCA), 0) / n;
      const avgSnk = days.reduce((s, d) => s + (isHT ? (d.snackingCAHT ?? 0) : d.snackingCA), 0) / n;
      const avgEpi = Math.max(0, avgCA - avgFrm - avgSnk);
      const avgTx = days.reduce((s, d) => s + d.tx, 0) / n;
      return { dow, label: FR_DAYS[dow], avgCA, avgFromagerie: avgFrm, avgSnacking: avgSnk, avgEpicerie: avgEpi, avgTx, n };
    }).filter((x): x is DayStats => x !== null);
  }, [daily, period, isHT]);

  if (!stats.length) return null;

  const PAD = { top: 28, right: 16, bottom: 36, left: 12 };
  const innerH = height - PAD.top - PAD.bottom;
  const maxCA = Math.max(...stats.map((s) => s.avgCA)) * 1.08 || 1;

  const barCount = stats.length;
  const slotW = (w - PAD.left - PAD.right) / barCount;
  const barW = Math.min(slotW * 0.58, 52);

  const xCenter = (i: number) => PAD.left + i * slotW + slotW / 2;
  const yFor = (v: number) => PAD.top + innerH - (v / maxCA) * innerH;

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      {/* Legend */}
      <div style={{
        display: "flex", gap: 14, marginBottom: 10,
        fontFamily: "var(--font-body)", fontSize: 11,
        color: "var(--fg-secondary)",
      }}>
        {[
          { color: "var(--color-dark)", label: "Fromagerie" },
          { color: "var(--color-coral)", label: "Snacking" },
          { color: "#1A5EA8", label: "Épicerie/Boissons" },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 1, display: "inline-block" }} />
            {s.label}
          </div>
        ))}
      </div>

      <svg
        width={w}
        height={height}
        style={{ display: "block" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - PAD.left;
          const i = Math.floor(x / slotW);
          if (i >= 0 && i < stats.length) setHover(i);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y gridline at 50% */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD.top + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y} y2={y}
                stroke="var(--border-light)" strokeWidth="1" strokeDasharray="2 3" />
              <text x={w - PAD.right + 4} y={y + 4} fontSize="9" fill="var(--fg-tertiary)"
                style={{ fontFamily: "var(--font-body)" }}>
                {fmtEURshort(maxCA * frac)}
              </text>
            </g>
          );
        })}

        {stats.map((s, i) => {
          const cx = xCenter(i);
          const x0 = cx - barW / 2;
          const isH = hover === i;

          const hFrm = (s.avgFromagerie / maxCA) * innerH;
          const hSnk = (s.avgSnacking / maxCA) * innerH;
          const hEpi = (s.avgEpicerie / maxCA) * innerH;
          const totalH = hFrm + hSnk + hEpi;

          const yEpi = PAD.top + innerH - totalH;
          const ySnk = yEpi + hEpi;
          const yFrm = ySnk + hSnk;

          return (
            <g key={s.dow} opacity={hover !== null && !isH ? 0.55 : 1}>
              {/* Épicerie (top) */}
              {hEpi > 0.5 && (
                <rect x={x0} y={yEpi} width={barW} height={hEpi}
                  fill="#1A5EA8" rx={1} />
              )}
              {/* Snacking */}
              {hSnk > 0.5 && (
                <rect x={x0} y={ySnk} width={barW} height={hSnk}
                  fill="var(--color-coral)" rx={0} />
              )}
              {/* Fromagerie (bottom) */}
              {hFrm > 0.5 && (
                <rect x={x0} y={yFrm} width={barW} height={hFrm}
                  fill="var(--color-dark)" rx={0}
                  style={{ borderRadius: "0 0 1px 1px" }} />
              )}

              {/* CA label on top */}
              <text x={cx} y={yEpi - 4} textAnchor="middle" fontSize="10"
                fill={isH ? "var(--fg-primary)" : "var(--fg-secondary)"}
                style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums", fontWeight: isH ? 600 : 400 }}>
                {fmtEURshort(s.avgCA)}
              </text>

              {/* Day label */}
              <text x={cx} y={height - 20} textAnchor="middle" fontSize="12"
                fill={isH ? "var(--fg-primary)" : "var(--fg-secondary)"}
                style={{ fontFamily: "var(--font-body)", fontWeight: isH ? 600 : 400 }}>
                {s.label}
              </text>

              {/* TX count */}
              <text x={cx} y={height - 7} textAnchor="middle" fontSize="10"
                fill="var(--fg-tertiary)"
                style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(s.avgTx)} tx · {s.n}j
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hover !== null && (() => {
        const s = stats[hover];
        const cx = xCenter(hover);
        const tipLeft = Math.min(w - 180, Math.max(0, cx - 75));
        return (
          <div style={{
            position: "absolute", left: tipLeft, top: 0,
            background: "var(--color-dark)", color: "var(--fg-inverted)",
            padding: "8px 12px", borderRadius: "var(--radius-sm)",
            fontSize: 12, lineHeight: 1.7, pointerEvents: "none",
            fontFamily: "var(--font-body)", whiteSpace: "nowrap",
            boxShadow: "var(--shadow-md)",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.label} · {s.n} jours</div>
            {[
              { label: "CA total", val: fmtEURshort(s.avgCA), color: "transparent" },
              { label: "Fromagerie", val: fmtEURshort(s.avgFromagerie), color: "var(--color-dark)", border: "1px solid rgba(255,255,255,0.4)" },
              { label: "Snacking", val: fmtEURshort(s.avgSnacking), color: "var(--color-coral)" },
              { label: "Épicerie", val: fmtEURshort(s.avgEpicerie), color: "#1A5EA8" },
              { label: "Transactions", val: Math.round(s.avgTx) + " tx", color: "transparent" },
              { label: "Panier moy.", val: s.avgTx > 0 ? (s.avgCA / s.avgTx).toFixed(2).replace(".", ",") + " €" : "—", color: "transparent" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {color !== "transparent" ? (
                  <span style={{ width: 8, height: 8, background: color, display: "inline-block", borderRadius: 1 }} />
                ) : (
                  <span style={{ width: 8 }} />
                )}
                <span style={{ flex: 1, color: "rgba(255,255,255,0.7)" }}>{label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
