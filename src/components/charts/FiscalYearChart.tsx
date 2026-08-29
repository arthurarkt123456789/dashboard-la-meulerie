"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreDaily } from "@/lib/apitic/types";
import { fmtEURshort } from "@/lib/format";

const FISCAL_MONTH_CALENDARS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MONTH_LABELS = ["Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Jul", "Aoû", "Sep"];
const FR_MONTHS_LONG = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

interface FiscalMonth {
  label: string;
  // N-1
  prevCA: number;
  prevNoData: boolean;
  // Current FY
  curCA: number;       // actual CA (completed months)
  curActualCA: number; // actual CA so far (current partial month)
  projCA: number;      // projected full-month CA (current month from rate; future from N-1×YoY)
  isActual: boolean;   // completed past month with real CA > 0
  isCurrent: boolean;
  isFuture: boolean;
  yoyPct: number | null;
}

function buildFiscalData(daily: StoreDaily[], todayISO: string, isHT: boolean) {
  const todayYear = parseInt(todayISO.slice(0, 4), 10);
  const todayMonth = parseInt(todayISO.slice(5, 7), 10);
  const todayDay = parseInt(todayISO.slice(8, 10), 10);
  const curFYEnd = todayMonth >= 10 ? todayYear + 1 : todayYear;
  const prevFYEnd = curFYEnd - 1;

  // Earliest date with actual revenue
  const firstRealDay =
    daily.find((d) => !d.closed && d.ca > 0)?.date ?? daily[0]?.date ?? todayISO;
  const firstDataYM = firstRealDay.slice(0, 7);

  // Monthly CA sums (skip closed/no-revenue days)
  const byYM = new Map<string, number>();
  for (const d of daily) {
    if (d.closed) continue;
    const ym = d.date.slice(0, 7);
    const val = isHT
      ? d.caHT != null ? d.caHT : d.ca / 1.1  // fallback if caHT absent
      : d.ca;
    byYM.set(ym, (byYM.get(ym) ?? 0) + val);
  }

  // Pass 1 — raw month data (no projections yet)
  type Raw = FiscalMonth & { daysInMonth: number };
  const raw: Raw[] = FISCAL_MONTH_CALENDARS.map((cm, i) => {
    const prevCY = cm >= 10 ? prevFYEnd - 1 : prevFYEnd;
    const curCY = cm >= 10 ? curFYEnd - 1 : curFYEnd;
    const mm = String(cm).padStart(2, "0");
    const daysInMonth = new Date(curCY, cm, 0).getDate();
    const monthStart = `${curCY}-${mm}-01`;
    const monthEnd = `${curCY}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
    const isFuture = monthStart > todayISO;
    const isPast = monthEnd < todayISO;
    const isCurrent = !isFuture && !isPast;

    // N-1: month in previous FY
    const prevMonthEnd = `${prevCY}-${mm}-${String(new Date(prevCY, cm, 0).getDate()).padStart(2, "0")}`;
    const prevNoData = prevMonthEnd < firstDataYM + "-01";
    const prevCA = prevNoData ? 0 : (byYM.get(`${prevCY}-${mm}`) ?? 0);

    // Current FY: only count as "actual" if the month is past AND has real data
    const rawCA = byYM.get(`${curCY}-${mm}`) ?? 0;
    const isActual = isPast && rawCA > 0;

    return {
      label: MONTH_LABELS[i],
      prevCA,
      prevNoData,
      curCA: isActual ? rawCA : 0,
      curActualCA: isCurrent ? rawCA : 0,
      projCA: 0,
      isActual,
      isCurrent,
      isFuture,
      yoyPct: null,
      daysInMonth,
    };
  });

  // YoY average from completed months that have both N-1 and actual data
  const completedWithN1 = raw.filter((m) => m.isActual && !m.prevNoData && m.prevCA > 0);
  const avgYoY =
    completedWithN1.length > 0
      ? completedWithN1.reduce((s, m) => s + (m.curCA - m.prevCA) / m.prevCA, 0) /
        completedWithN1.length
      : 0;

  // Pass 2 — projections
  const months: FiscalMonth[] = raw.map((m) => {
    const out: FiscalMonth = { ...m };

    if (m.isActual && !m.prevNoData && m.prevCA > 0) {
      // Completed month: real YoY
      out.yoyPct = (m.curCA - m.prevCA) / m.prevCA;
    }

    if (m.isCurrent) {
      if (m.curActualCA > 0 && todayDay > 0) {
        // Project from actual daily rate × days in month
        out.projCA = (m.curActualCA / todayDay) * m.daysInMonth;
        if (!m.prevNoData && m.prevCA > 0) {
          out.yoyPct = (out.projCA - m.prevCA) / m.prevCA;
        }
      } else if (!m.prevNoData && m.prevCA > 0) {
        // Fallback: N-1 × avgYoY
        out.projCA = m.prevCA * (1 + avgYoY);
        out.yoyPct = avgYoY;
      }
    }

    if (m.isFuture && !m.prevNoData && m.prevCA > 0) {
      out.projCA = m.prevCA * (1 + avgYoY);
      out.yoyPct = avgYoY;
    }

    return out;
  });

  const actualMonths = months.filter((m) => m.isActual);
  const currentM = months.find((m) => m.isCurrent);
  const totalPrev = months.filter((m) => !m.prevNoData).reduce((s, m) => s + m.prevCA, 0);
  const totalActual = actualMonths.reduce((s, m) => s + m.curCA, 0);
  const totalActualWithCurrent = totalActual + (currentM?.curActualCA ?? 0);
  const totalProj = months.reduce((s, m) => {
    if (m.isActual) return s + m.curCA;
    if (m.isCurrent) return s + (m.projCA || m.curActualCA);
    return s + m.projCA;
  }, 0);

  const hasPrevData = totalPrev > 0;
  const prevPartial = months.some((m) => m.prevNoData);
  const firstDataMonthIdx = parseInt(firstDataYM.slice(5, 7), 10) - 1;
  const firstDataYear = parseInt(firstDataYM.slice(0, 4), 10);
  const firstDataLabel = `${FR_MONTHS_LONG[firstDataMonthIdx]} ${firstDataYear}`;

  return {
    months,
    avgYoY,
    totalPrev,
    totalActual,
    totalActualWithCurrent,
    totalProj,
    curFYEnd,
    prevFYEnd,
    actualMonthsCount: actualMonths.length,
    completedCount: completedWithN1.length,
    hasPrevData,
    prevPartial,
    firstDataLabel,
    currentMonth: currentM ?? null,
  };
}

function fmtPctShort(v: number): string {
  const abs = Math.abs(v * 100);
  const s = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  return (v >= 0 ? "+" : "−") + s.replace(".", ",") + "%";
}

type Props = {
  daily: StoreDaily[];
  todayISO: string;
  isHT: boolean;
};

export function FiscalYearChart({ daily, todayISO, isHT }: Props) {
  const chartDivRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(520);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = chartDivRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setChartW(Math.max(260, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const {
    months,
    avgYoY,
    totalPrev,
    totalActual,
    totalActualWithCurrent,
    totalProj,
    curFYEnd,
    prevFYEnd,
    actualMonthsCount,
    completedCount,
    hasPrevData,
    prevPartial,
    firstDataLabel,
    currentMonth,
  } = buildFiscalData(daily, todayISO, isHT);

  const suffix = isHT ? "€ HT" : "€ TTC";
  const height = 250;
  const PAD = { top: 38, right: 8, bottom: 26, left: 52 };
  const innerW = chartW - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const allCAs = months.flatMap((m) => [
    m.prevCA,
    m.isActual ? m.curCA : m.isCurrent ? (m.projCA || m.curActualCA) : m.projCA,
  ]);
  const maxCA = Math.max(...allCAs, 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCA);

  const groupW = innerW / 12;
  const barW = Math.max(3, groupW * 0.37);
  const barGap = 2;

  const yAt = (v: number) => PAD.top + innerH - (v / maxCA) * innerH;
  const bH = (v: number) => Math.max(0, (v / maxCA) * innerH);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    const idx = Math.floor(x / groupW);
    setHoverIdx(idx >= 0 && idx < 12 ? idx : null);
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* Bar chart */}
      <div ref={chartDivRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <svg
          width={chartW}
          height={height}
          style={{ display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <pattern id="fy-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-coral)" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* Y gridlines */}
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

          {/* Legend */}
          <g transform={`translate(${PAD.left}, 0)`}>
            <rect x={0} y={6} width={8} height={8} fill="var(--fg-tertiary)" opacity={0.35} rx={1} />
            <text x={12} y={14} fontSize={9} fill="var(--fg-tertiary)" style={{ fontFamily: "var(--font-body)" }}>
              Ex. {prevFYEnd - 1}–{prevFYEnd}
            </text>
            <rect x={82} y={6} width={8} height={8} fill="var(--color-coral)" opacity={0.85} rx={1} />
            <text x={94} y={14} fontSize={9} fill="var(--fg-tertiary)" style={{ fontFamily: "var(--font-body)" }}>
              Ex. {curFYEnd - 1}–{curFYEnd} réalisé
            </text>
            <rect x={190} y={6} width={8} height={8} fill="url(#fy-hatch)" rx={1} />
            <text x={202} y={14} fontSize={9} fill="var(--fg-tertiary)" style={{ fontFamily: "var(--font-body)" }}>
              Projeté
            </text>
          </g>

          {/* Bars */}
          {months.map((m, i) => {
            const cx = PAD.left + i * groupW;
            const barsX = cx + (groupW - 2 * barW - barGap) / 2;
            const prevX = barsX;
            const curX = barsX + barW + barGap;
            const isHov = hoverIdx === i;
            const midX = cx + groupW / 2;

            // Current FY: what to display in the bar
            const displayCA = m.isActual
              ? m.curCA
              : m.isCurrent
              ? (m.projCA || m.curActualCA)
              : m.projCA;
            const isProj = !m.isActual;
            const topY = Math.min(
              m.prevCA > 0 ? yAt(m.prevCA) : height,
              displayCA > 0 ? yAt(displayCA) : height,
            );

            return (
              <g key={i} opacity={isHov ? 1 : 0.88}>
                {/* N-1 bar or N/D indicator */}
                {m.prevNoData ? (
                  <line
                    x1={prevX + 1} y1={PAD.top + innerH - 10}
                    x2={prevX + barW - 1} y2={PAD.top + innerH - 10}
                    stroke="var(--fg-tertiary)" strokeWidth={1}
                    opacity={0.2} strokeDasharray="2 2"
                  />
                ) : m.prevCA > 0 ? (
                  <rect
                    x={prevX} y={yAt(m.prevCA)} width={barW} height={bH(m.prevCA)}
                    fill="var(--fg-tertiary)" opacity={0.3} rx={1}
                  />
                ) : null}

                {/* Current FY bar */}
                {displayCA > 0 && (
                  <>
                    {/* For current month: show actual portion solid + projected as hatched on top */}
                    {m.isCurrent && m.curActualCA > 0 && m.projCA > m.curActualCA ? (
                      <>
                        <rect
                          x={curX} y={yAt(m.projCA)} width={barW} height={bH(m.projCA - m.curActualCA)}
                          fill="url(#fy-hatch)" rx={1}
                        />
                        <rect
                          x={curX} y={yAt(m.curActualCA)} width={barW} height={bH(m.curActualCA)}
                          fill="var(--color-coral)" opacity={0.85} rx={1}
                        />
                      </>
                    ) : (
                      <rect
                        x={curX} y={yAt(displayCA)} width={barW} height={bH(displayCA)}
                        fill={isProj ? "url(#fy-hatch)" : "var(--color-coral)"}
                        opacity={isProj ? 1 : 0.85}
                        rx={1}
                      />
                    )}
                  </>
                )}

                {/* % vs N-1 label */}
                {m.yoyPct !== null && !m.prevNoData && displayCA > 0 && (
                  <text
                    x={midX} y={topY - 4}
                    textAnchor="middle" fontSize={8} fontWeight={500}
                    fill={m.yoyPct >= 0 ? "#16a34a" : "#dc2626"}
                    opacity={m.isActual ? 1 : 0.75}
                    style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtPctShort(m.yoyPct)}
                  </text>
                )}

                {/* Month label */}
                <text
                  x={midX} y={height - 6}
                  textAnchor="middle" fontSize={9}
                  fill={isHov ? "var(--fg-primary)" : "var(--fg-tertiary)"}
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* HTML Tooltip */}
        {hoverIdx !== null && (() => {
          const m = months[hoverIdx];
          const cx = PAD.left + hoverIdx * groupW + groupW / 2;
          const left = Math.min(chartW - 152, Math.max(0, cx - 66));
          const displayCA = m.isActual ? m.curCA : m.isCurrent ? (m.projCA || m.curActualCA) : m.projCA;
          return (
            <div style={{
              position: "absolute", left, top: 8,
              background: "var(--color-dark)", color: "var(--fg-inverted)",
              padding: "8px 10px", borderRadius: "var(--radius-sm)",
              fontSize: 11, lineHeight: 1.5, pointerEvents: "none",
              fontFamily: "var(--font-body)", whiteSpace: "nowrap",
              boxShadow: "var(--shadow-md)", minWidth: 148,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>
                {m.label}
                {m.isCurrent && " · en cours"}
                {m.isFuture && " · proj."}
              </div>
              {m.prevNoData ? (
                <div style={{ opacity: 0.55, fontSize: 10, fontStyle: "italic" }}>N-1 non disponible</div>
              ) : m.prevCA > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: 0.75 }}>
                  <span>N-1</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(m.prevCA)}</span>
                </div>
              ) : null}
              {m.isActual && m.curCA > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>Réalisé</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(m.curCA)}</span>
                </div>
              )}
              {m.isCurrent && m.curActualCA > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Réalisé à date</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(m.curActualCA)}</span>
                  </div>
                  {m.projCA > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: 0.8 }}>
                      <span>Proj. fin mois</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(m.projCA)}</span>
                    </div>
                  )}
                </>
              )}
              {m.isFuture && displayCA > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: 0.8 }}>
                  <span>Projeté</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtEURshort(displayCA)}</span>
                </div>
              )}
              {m.yoyPct !== null && !m.prevNoData && (
                <div style={{
                  marginTop: 4, paddingTop: 4,
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
      <div style={{ width: 172, flexShrink: 0, fontFamily: "var(--font-body)" }}>
        {/* N-1 FY */}
        <div style={{ marginBottom: 16 }}>
          <div className="lm-label" style={{ fontSize: 10, marginBottom: 8 }}>
            Ex. {prevFYEnd - 1}–{prevFYEnd}
          </div>
          {hasPrevData ? (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 3 }}>
                {prevPartial ? `Réalisé dès ${firstDataLabel}` : "Total réalisé"}
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
                color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
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

        {/* Current FY */}
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 16 }}>
          <div className="lm-label" style={{ fontSize: 10, marginBottom: 8 }}>
            Ex. {curFYEnd - 1}–{curFYEnd}
          </div>

          <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 3 }}>
            {actualMonthsCount} mois complets
            {currentMonth ? " + 1 en cours" : ""}
          </div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
            color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
          }}>
            {fmtEURshort(totalActualWithCurrent)}
          </div>
          <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 1, marginBottom: 12 }}>
            réalisé à date · {suffix}
          </div>

          {totalProj > totalActualWithCurrent && (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 3 }}>
                Projection fin d'ex.
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
                color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
              }}>
                {fmtEURshort(totalProj)}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 1, marginBottom: 8 }}>
                {suffix}
              </div>
              {hasPrevData && completedCount > 0 && (
                <>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: avgYoY >= 0 ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                    color: avgYoY >= 0 ? "#16a34a" : "#dc2626",
                    borderRadius: 4, padding: "3px 7px", fontSize: 11, fontWeight: 600,
                  }}>
                    {fmtPctShort(avgYoY)} YoY
                  </div>
                  <div style={{ fontSize: 9, color: "var(--fg-tertiary)", marginTop: 5, lineHeight: 1.4 }}>
                    Taux sur {completedCount}m avec N-1 · mois en cours : taux journalier × jours restants · mois futurs : N-1 × {(1 + avgYoY).toFixed(2).replace(".", ",")}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
