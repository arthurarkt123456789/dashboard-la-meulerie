"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreDaily } from "@/lib/apitic/types";
import { fmtEURshort } from "@/lib/format";

const FISCAL_MONTH_CALENDARS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MONTH_LABELS = ["Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Jul", "Aoû", "Sep"];

interface FiscalMonth {
  label: string;
  prevCA: number;
  curCA: number;
  projCA: number;
  isActual: boolean;
  isCurrent: boolean;
  prevNoData: boolean; // N-1 month predates earliest available APITIC data
  yoyPct: number | null;
}

const FR_MONTHS_LONG = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

function buildFiscalData(daily: StoreDaily[], todayISO: string, isHT: boolean) {
  const todayYear = parseInt(todayISO.slice(0, 4), 10);
  const todayMonth = parseInt(todayISO.slice(5, 7), 10);
  const curFYEnd = todayMonth >= 10 ? todayYear + 1 : todayYear;
  const prevFYEnd = curFYEnd - 1;

  // Earliest date for which we actually have APITIC data (ignoring closed days)
  const firstRealDay = daily.find((d) => !d.closed && d.ca > 0)?.date ?? daily[0]?.date ?? todayISO;
  const firstDataYM = firstRealDay.slice(0, 7); // e.g. "2025-03"

  const byYM = new Map<string, number>();
  for (const d of daily) {
    if (d.closed) continue;
    const ym = d.date.slice(0, 7);
    byYM.set(ym, (byYM.get(ym) ?? 0) + (isHT ? (d.caHT ?? 0) : d.ca));
  }

  const months: FiscalMonth[] = FISCAL_MONTH_CALENDARS.map((cm, i) => {
    const prevCY = cm >= 10 ? prevFYEnd - 1 : prevFYEnd;
    const curCY = cm >= 10 ? curFYEnd - 1 : curFYEnd;
    const mm = String(cm).padStart(2, "0");
    const prevYM = `${prevCY}-${mm}`;
    const curYM = `${curCY}-${mm}`;
    const monthStart = `${curCY}-${mm}-01`;
    const lastDay = new Date(curCY, cm, 0).getDate();
    const monthEnd = `${curCY}-${mm}-${String(lastDay).padStart(2, "0")}`;
    const isFuture = monthStart > todayISO;
    const isPast = monthEnd < todayISO;
    const isCurrent = !isFuture && !isPast;
    // N-1 month ends before our first data point → no data, not a 0 CA
    const prevMonthEnd = `${prevCY}-${mm}-${String(new Date(prevCY, cm, 0).getDate()).padStart(2, "0")}`;
    const prevNoData = prevMonthEnd < firstDataYM + "-01";
    return {
      label: MONTH_LABELS[i],
      prevCA: prevNoData ? 0 : (byYM.get(prevYM) ?? 0),
      curCA: isPast ? (byYM.get(curYM) ?? 0) : 0,
      projCA: 0,
      isActual: isPast,
      isCurrent,
      prevNoData,
      yoyPct: null,
    };
  });

  // Only months where N-1 is available can contribute to the YoY average
  const completed = months.filter((m) => m.isActual && !m.prevNoData && m.prevCA > 0);
  const avgYoY =
    completed.length > 0
      ? completed.reduce((s, m) => s + (m.curCA - m.prevCA) / m.prevCA, 0) / completed.length
      : 0;

  for (const m of months) {
    if (m.isActual && !m.prevNoData && m.prevCA > 0) {
      m.yoyPct = (m.curCA - m.prevCA) / m.prevCA;
    }
    if (!m.isActual && !m.prevNoData && m.prevCA > 0) {
      m.projCA = m.prevCA * (1 + avgYoY);
      m.yoyPct = avgYoY;
    }
  }

  const totalPrev = months.filter((m) => !m.prevNoData).reduce((s, m) => s + m.prevCA, 0);
  const actualMonths = months.filter((m) => m.isActual);
  const totalActual = actualMonths.reduce((s, m) => s + m.curCA, 0);
  const totalProj = months.reduce((s, m) => s + (m.isActual ? m.curCA : m.projCA), 0);
  const hasPrevData = totalPrev > 0;

  // Human-readable first data month label, e.g. "mars 2025"
  const firstDataMonthIdx = parseInt(firstDataYM.slice(5, 7), 10) - 1;
  const firstDataYear = parseInt(firstDataYM.slice(0, 4), 10);
  const firstDataLabel = `${FR_MONTHS_LONG[firstDataMonthIdx]} ${firstDataYear}`;
  const prevPartial = months.some((m) => m.prevNoData);

  return {
    months,
    avgYoY,
    totalPrev,
    totalActual,
    totalProj,
    curFYEnd,
    prevFYEnd,
    actualMonthsCount: actualMonths.length,  // total months with real FY cur data
    completedCount: completed.length,         // months with N-1 available (for projection)
    hasPrevData,
    prevPartial,
    firstDataLabel,
  };
}

function fmtPctShort(v: number): string {
  const abs = Math.abs(v * 100);
  const s = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  return (v >= 0 ? "+" : "−") + s.replace(".", ",") + "%";
}

type TooltipData = {
  month: FiscalMonth;
  x: number;
};

type Props = {
  daily: StoreDaily[];
  todayISO: string;
  isHT: boolean;
};

export function FiscalYearChart({ daily, todayISO, isHT }: Props) {
  const chartDivRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(520);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    const el = chartDivRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setChartW(Math.max(260, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { months, avgYoY, totalPrev, totalActual, totalProj, curFYEnd, prevFYEnd, actualMonthsCount, completedCount, hasPrevData, prevPartial, firstDataLabel } =
    buildFiscalData(daily, todayISO, isHT);

  const suffix = isHT ? "€ HT" : "€ TTC";
  const height = 240;
  const PAD = { top: 36, right: 8, bottom: 26, left: 52 };
  const innerW = chartW - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const allCAs = months.flatMap((m) => [m.prevCA, m.isActual ? m.curCA : m.projCA]);
  const maxCA = Math.max(...allCAs, 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCA);

  const groupW = innerW / 12;
  const barW = Math.max(3, groupW * 0.37);
  const barGap = 2;

  const yAt = (v: number) => PAD.top + innerH - (v / maxCA) * innerH;
  const barH = (v: number) => Math.max(0, (v / maxCA) * innerH);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    const idx = Math.floor(x / groupW);
    if (idx >= 0 && idx < 12) {
      const cx = PAD.left + idx * groupW + groupW / 2;
      setTooltip({ month: months[idx], x: cx });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* Chart */}
      <div ref={chartDivRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <svg
          width={chartW}
          height={height}
          style={{ display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <pattern id="fy-proj-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-coral)" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* Y gridlines + labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left} x2={chartW - PAD.right}
                y1={yAt(t)} y2={yAt(t)}
                stroke="var(--border-light)" strokeWidth={1}
                strokeDasharray={i === 0 ? undefined : "2 3"}
              />
              {t > 0 && (
                <text
                  x={PAD.left - 6} y={yAt(t) + 4}
                  textAnchor="end" fontSize={10} fill="var(--fg-tertiary)"
                  style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtEURshort(t)}
                </text>
              )}
            </g>
          ))}

          {/* Legend line */}
          <g transform={`translate(${PAD.left}, 0)`}>
            <rect x={0} y={6} width={8} height={8} fill="var(--fg-tertiary)" opacity={0.35} rx={1} />
            <text x={12} y={14} fontSize={9} fill="var(--fg-tertiary)" style={{ fontFamily: "var(--font-body)" }}>
              Ex. {prevFYEnd - 1}–{prevFYEnd}
            </text>
            <rect x={80} y={6} width={8} height={8} fill="var(--color-coral)" opacity={0.85} rx={1} />
            <text x={92} y={14} fontSize={9} fill="var(--fg-tertiary)" style={{ fontFamily: "var(--font-body)" }}>
              Ex. {curFYEnd - 1}–{curFYEnd} réalisé
            </text>
            <rect x={186} y={6} width={8} height={8} fill="url(#fy-proj-hatch)" rx={1} />
            <text x={198} y={14} fontSize={9} fill="var(--fg-tertiary)" style={{ fontFamily: "var(--font-body)" }}>
              Projeté
            </text>
          </g>

          {/* Bars */}
          {months.map((m, i) => {
            const cx = PAD.left + i * groupW;
            const barsStartX = cx + (groupW - 2 * barW - barGap) / 2;
            const prevX = barsStartX;
            const curX = barsStartX + barW + barGap;
            const curCAVal = m.isActual ? m.curCA : m.projCA;
            const curH = barH(curCAVal);
            const prevH2 = barH(m.prevCA);
            const topY = Math.min(m.prevCA > 0 ? yAt(m.prevCA) : height, curCAVal > 0 ? yAt(curCAVal) : height);
            const isHovered = tooltip?.month === m;
            const midX = cx + groupW / 2;

            return (
              <g key={i} opacity={isHovered ? 1 : 0.88}>
                {/* Prev FY bar — or N/D indicator */}
                {m.prevNoData ? (
                  <>
                    <line
                      x1={prevX + 1} y1={PAD.top + innerH - 12} x2={prevX + barW - 1} y2={PAD.top + innerH - 12}
                      stroke="var(--fg-tertiary)" strokeWidth={1} opacity={0.25} strokeDasharray="2 2"
                    />
                  </>
                ) : m.prevCA > 0 ? (
                  <rect
                    x={prevX} y={yAt(m.prevCA)} width={barW} height={prevH2}
                    fill="var(--fg-tertiary)" opacity={0.3} rx={1}
                  />
                ) : null}
                {/* Current FY bar */}
                {curCAVal > 0 && (
                  <rect
                    x={curX} y={yAt(curCAVal)} width={barW} height={curH}
                    fill={m.isActual ? "var(--color-coral)" : "url(#fy-proj-hatch)"}
                    opacity={m.isActual ? 0.85 : 1}
                    rx={1}
                  />
                )}
                {/* % label — only when N-1 available */}
                {m.yoyPct !== null && !m.prevNoData && curCAVal > 0 && (
                  <text
                    x={midX}
                    y={topY - 4}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={500}
                    fill={m.yoyPct >= 0 ? "#16a34a" : "#dc2626"}
                    opacity={m.isActual ? 1 : 0.7}
                    style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtPctShort(m.yoyPct)}
                  </text>
                )}
                {/* Month label */}
                <text
                  x={cx + groupW / 2} y={height - 6}
                  textAnchor="middle" fontSize={9}
                  fill={isHovered ? "var(--fg-primary)" : "var(--fg-tertiary)"}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* HTML Tooltip */}
        {tooltip && (() => {
          const m = tooltip.month;
          const curCAVal = m.isActual ? m.curCA : m.projCA;
          const left = Math.min(chartW - 148, Math.max(0, tooltip.x - 64));
          return (
            <div style={{
              position: "absolute",
              left,
              top: 8,
              background: "var(--color-dark)",
              color: "var(--fg-inverted)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              fontSize: 11,
              lineHeight: 1.5,
              pointerEvents: "none",
              fontFamily: "var(--font-body)",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow-md)",
              minWidth: 140,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                {m.label} {m.isActual ? "" : m.isCurrent ? "· en cours" : "· proj."}
              </div>
              {m.prevNoData ? (
                <div style={{ opacity: 0.55, fontSize: 10, fontStyle: "italic" }}>N-1 non disponible</div>
              ) : m.prevCA > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: 0.75 }}>
                  <span>N-1</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(m.prevCA)}</span>
                </div>
              ) : null}
              {curCAVal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{m.isActual ? "Réalisé" : "Projeté"}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(curCAVal)}</span>
                </div>
              )}
              {m.yoyPct !== null && (
                <div style={{
                  marginTop: 4,
                  paddingTop: 4,
                  borderTop: "1px solid rgba(255,255,255,0.15)",
                  color: m.yoyPct >= 0 ? "#86efac" : "#fca5a5",
                  fontWeight: 500,
                }}>
                  {fmtPctShort(m.yoyPct)} vs N-1{!m.isActual ? " (proj.)" : ""}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Summary panel */}
      <div style={{ width: 170, flexShrink: 0, fontFamily: "var(--font-body)" }}>
        {/* Previous FY */}
        <div style={{ marginBottom: 16 }}>
          <div
            className="lm-label"
            style={{ fontSize: 10, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            Ex. {prevFYEnd - 1}–{prevFYEnd}
          </div>
          {hasPrevData ? (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 3 }}>
                {prevPartial ? `Réalisé (dès ${firstDataLabel})` : "Total réalisé"}
              </div>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--fg-secondary)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}>
                {fmtEURshort(totalPrev)}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 1 }}>
                {prevPartial ? `données partielles · ${suffix}` : suffix}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--fg-tertiary)", fontStyle: "italic" }}>
              Pas de données N-1
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 16 }}>
          {/* Current FY */}
          <div
            className="lm-label"
            style={{ fontSize: 10, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            Ex. {curFYEnd - 1}–{curFYEnd}
          </div>

          <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 3 }}>
            Réalisé · {actualMonthsCount} mois
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--fg-primary)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
          }}>
            {fmtEURshort(totalActual)}
          </div>
          <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 1, marginBottom: 12 }}>{suffix}</div>

          {hasPrevData && completedCount > 0 && (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 3 }}>
                Projection fin d'ex.
              </div>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--fg-primary)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}>
                {fmtEURshort(totalProj)}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 1, marginBottom: 8 }}>{suffix}</div>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: avgYoY >= 0 ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                color: avgYoY >= 0 ? "#16a34a" : "#dc2626",
                borderRadius: 4,
                padding: "3px 7px",
                fontSize: 11,
                fontWeight: 600,
              }}>
                {fmtPctShort(avgYoY)} YoY
              </div>
              <div style={{ fontSize: 9, color: "var(--fg-tertiary)", marginTop: 5, lineHeight: 1.4 }}>
                {completedCount} mois avec comparaison N-1 disponible.
                Mois restants : CA N-1 × {(1 + avgYoY).toFixed(2).replace(".", ",")}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
