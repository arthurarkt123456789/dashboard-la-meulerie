"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { StoreDaily } from "@/lib/apitic/types";
import { fmtEUR, fmtEURshort } from "@/lib/format";

type DayData = {
  day: number;
  date: string;
  isFuture: boolean;
  ca: number | null;
  snackingCA: number;
  snackingCAHT: number;
  n1ca: number | null;
  n1snackingCA: number | null;
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type Props = {
  daily: StoreDaily[];
  todayISO: string;
  isHT: boolean;
  storeColor: string;
};

export function MonthDailyBars({ daily, todayISO, isHT, storeColor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [lockedDay, setLockedDay] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(400, e.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const year = Number(todayISO.slice(0, 4));
  const month = Number(todayISO.slice(5, 7));
  const todayDay = Number(todayISO.slice(8, 10));
  const daysCount = daysInMonth(year, month);

  const dailyByDate = useMemo(
    () => new Map(daily.map((d) => [d.date, d])),
    [daily],
  );

  const days = useMemo<DayData[]>(() => {
    return Array.from({ length: daysCount }, (_, i) => {
      const day = i + 1;
      const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
      const real = dailyByDate.get(dateStr);
      const isFuture = day > todayDay;

      const n1d = new Date(`${dateStr}T00:00:00Z`);
      n1d.setUTCDate(n1d.getUTCDate() - 364);
      const n1DateStr = n1d.toISOString().slice(0, 10);
      const n1real = dailyByDate.get(n1DateStr);

      const caVal = real && !real.closed
        ? (isHT ? real.caHT ?? 0 : real.ca)
        : null;
      const n1caVal = n1real && !n1real.closed
        ? (isHT ? n1real.caHT ?? 0 : n1real.ca)
        : null;

      return {
        day,
        date: dateStr,
        isFuture,
        ca: isFuture ? null : caVal,
        snackingCA: real?.snackingCA ?? 0,
        snackingCAHT: real?.snackingCAHT ?? 0,
        n1ca: n1caVal,
        n1snackingCA: n1real?.snackingCA ?? null,
      };
    });
  }, [daily, dailyByDate, year, month, daysCount, todayDay, isHT]);

  // Summary stats
  const realized = days.filter((d) => !d.isFuture && d.ca !== null);
  const totalCA = realized.reduce((s, d) => s + (d.ca ?? 0), 0);
  const totalN1Partial = realized.reduce((s, d) => s + (d.n1ca ?? 0), 0);
  const totalN1Full = days.reduce((s, d) => s + (d.n1ca ?? 0), 0);
  const growth = totalN1Partial > 0 ? (totalCA / totalN1Partial - 1) : null;
  const daysRealized = realized.length;

  // Chart layout
  const PAD = { top: 12, right: 16, bottom: 32, left: 56 };
  const H = 220;
  const innerW = w - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allVals = days.flatMap((d) => [d.ca ?? 0, d.n1ca ?? 0]).filter((v) => v > 0);
  const maxVal = allVals.length ? Math.max(...allVals) * 1.1 : 1;

  const slotW = innerW / daysCount;
  const barW = Math.max(2, slotW * 0.38);
  const barGap = Math.max(1, slotW * 0.05);

  function xCenter(i: number) { return PAD.left + (i + 0.5) * slotW; }
  function yAt(v: number) { return PAD.top + innerH - (v / maxVal) * innerH; }
  function bh(v: number) { return Math.max(1, (v / maxVal) * innerH); }

  const labelEvery = daysCount > 20 ? 5 : 1;

  const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const monthName = FR_MONTHS[month - 1];

  const tickVals = [0.25, 0.5, 0.75, 1.0].map((f) => maxVal * f);

  // Active day: locked takes priority over hovered
  const activeDay = lockedDay ?? hoveredDay;
  const activeData = activeDay !== null ? days[activeDay - 1] : null;

  function dayIndexFromX(svgElement: SVGSVGElement, clientX: number): number | null {
    const rect = svgElement.getBoundingClientRect();
    const x = clientX - rect.left - PAD.left;
    const idx = Math.floor(x / slotW);
    if (idx >= 0 && idx < daysCount) return idx;
    return null;
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const idx = dayIndexFromX(e.currentTarget, e.clientX);
    setHoveredDay(idx !== null ? days[idx].day : null);
  }

  function handleMouseLeave() {
    setHoveredDay(null);
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const idx = dayIndexFromX(e.currentTarget, e.clientX);
    if (idx === null) return;
    const clickedDay = days[idx].day;
    setLockedDay((prev) => prev === clickedDay ? null : clickedDay);
  }

  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      {/* Summary bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 3 }}>
            Réalisé · {daysRealized}/{daysCount} j
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
            {fmtEUR(totalCA)}
          </div>
        </div>
        {totalN1Partial > 0 && (
          <>
            <div style={{ borderLeft: "1px solid var(--border-light)", alignSelf: "stretch" }} />
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 3 }}>
                N-1 même période ({daysRealized} j)
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {fmtEUR(totalN1Partial)}
              </div>
            </div>
          </>
        )}
        {totalN1Full > 0 && totalN1Full !== totalN1Partial && (
          <>
            <div style={{ borderLeft: "1px solid var(--border-light)", alignSelf: "stretch" }} />
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 3 }}>
                C.A. N-1 mois complet
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums", opacity: 0.65 }}>
                {fmtEUR(totalN1Full)}
              </div>
            </div>
          </>
        )}
        {growth !== null && (
          <>
            <div style={{ borderLeft: "1px solid var(--border-light)", alignSelf: "stretch" }} />
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 3 }}>
                Croissance
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: growth >= 0 ? "#08C167" : "#DC2626",
              }}>
                {growth >= 0 ? "+" : ""}{(growth * 100).toFixed(1).replace(".", ",")} %
              </div>
            </div>
          </>
        )}

        {/* Detail panel — hovered or locked day */}
        {activeData && (
          <div style={{
            marginLeft: "auto",
            background: lockedDay !== null ? "var(--bg-subtle)" : "var(--color-white)",
            border: `1px solid ${lockedDay !== null ? storeColor : "var(--border-light)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "8px 14px",
            fontSize: 12,
            color: "var(--fg-secondary)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            transition: "border-color 0.1s",
          }}>
            <span style={{ fontWeight: 600, color: "var(--fg-primary)" }}>
              {activeData.day} {monthName}
              {lockedDay !== null && <span style={{ fontSize: 10, color: "var(--fg-tertiary)", marginLeft: 4 }}>🔒</span>}
            </span>
            <span>
              CA :{" "}
              <strong style={{ color: activeData.isFuture ? "var(--fg-tertiary)" : storeColor, fontVariantNumeric: "tabular-nums" }}>
                {activeData.ca !== null ? fmtEUR(activeData.ca) : "—"}
              </strong>
            </span>
            {activeData.n1ca !== null && (
              <span>
                N-1 :{" "}
                <strong style={{ color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtEUR(activeData.n1ca)}
                </strong>
              </span>
            )}
            {!activeData.isFuture && activeData.ca !== null && activeData.ca > 0 && (
              <span>
                Snacking :{" "}
                <strong style={{ color: "var(--color-coral)", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round((isHT ? activeData.snackingCAHT : activeData.snackingCA) / activeData.ca * 100)} %
                </strong>
              </span>
            )}
            {activeData.n1ca !== null && activeData.ca !== null && activeData.n1ca > 0 && (
              <span>
                vs N-1 :{" "}
                <strong style={{
                  color: activeData.ca >= activeData.n1ca ? "#08C167" : "#DC2626",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {activeData.ca >= activeData.n1ca ? "+" : ""}
                  {((activeData.ca / activeData.n1ca - 1) * 100).toFixed(0)} %
                </strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* SVG bar chart */}
      <div ref={ref} style={{ width: "100%", position: "relative" }}>
        <svg
          width={w} height={H}
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          {/* Y grid + labels */}
          {tickVals.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left} x2={w - PAD.right} y1={yAt(v)} y2={yAt(v)}
                stroke="var(--border-light)" strokeWidth={1} strokeDasharray="2 3"
              />
              <text x={PAD.left - 8} y={yAt(v) + 4} textAnchor="end" fontSize={11}
                fill="var(--fg-tertiary)"
                style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
                {fmtEURshort(v)}
              </text>
            </g>
          ))}

          {/* Bottom axis */}
          <line x1={PAD.left} x2={w - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH}
            stroke="var(--border-light)" strokeWidth={1} />

          {/* Bars */}
          {days.map((d, i) => {
            const xc = xCenter(i);
            const isActive = d.day === activeDay;
            const x1 = xc - barGap / 2 - barW;
            const x2 = xc + barGap / 2;

            return (
              <g key={d.day}>
                {/* Hover / lock highlight */}
                {isActive && (
                  <rect
                    x={PAD.left + i * slotW + 1} y={PAD.top}
                    width={slotW - 2} height={innerH}
                    fill={storeColor} opacity={lockedDay !== null ? 0.1 : 0.06} rx={2}
                  />
                )}

                {/* Current year bar (past days only) */}
                {!d.isFuture && d.ca !== null && d.ca > 0 && (
                  <rect
                    x={x1} y={yAt(d.ca)} width={barW} height={bh(d.ca)}
                    fill={storeColor} rx={1}
                    opacity={isActive ? 1 : 0.82}
                  />
                )}

                {/* N-1 bar — grey filled for both past and future */}
                {d.n1ca !== null && d.n1ca > 0 && (
                  <rect
                    x={d.isFuture ? xc - barW / 2 : x2}
                    y={yAt(d.n1ca)} width={barW} height={bh(d.n1ca)}
                    fill="var(--fg-tertiary)"
                    rx={1}
                    opacity={d.isFuture ? 0.15 : 0.22}
                  />
                )}

                {/* Today vertical marker */}
                {d.day === todayDay && (
                  <line
                    x1={xc} x2={xc} y1={PAD.top} y2={PAD.top + innerH}
                    stroke={storeColor} strokeWidth={1} strokeDasharray="3 2" opacity={0.45}
                  />
                )}

                {/* X label */}
                {(d.day === 1 || d.day % labelEvery === 0 || d.day === daysCount) && (
                  <text
                    x={xc} y={H - 6}
                    textAnchor="middle" fontSize={10}
                    fill={d.day === todayDay ? storeColor : "var(--fg-tertiary)"}
                    fontWeight={d.day === todayDay ? 600 : 400}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {d.day}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 6, paddingLeft: PAD.left, fontSize: 11, color: "var(--fg-secondary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 8, background: storeColor, display: "inline-block", borderRadius: 2, opacity: 0.85 }} />
            Ce mois
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 8, background: "var(--fg-tertiary)", display: "inline-block", borderRadius: 2, opacity: 0.22 }} />
            N-1 (±364 j)
          </div>
          <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginLeft: 4 }}>
            Survoler pour le détail · cliquer pour verrouiller
          </div>
        </div>
      </div>
    </div>
  );
}
