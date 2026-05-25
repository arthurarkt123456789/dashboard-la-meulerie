"use client";

import { useEffect, useRef, useState, useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { fmtEUR, fmtEURshort } from "@/lib/format";
import { Card } from "./Card";
import { periodToSelectedMonths, periodToFinancialRange } from "@/lib/pennylane/periods";

// ─── Types ────────────────────────────────────────────────────────────────────

type CostMonth = {
  month: string;
  coutMatiere: number;
  masseSalariale: number;
  chargesExploitation: number;
  remboursementCapital: number;
  interetsEmprunt: number;
  error?: string;
};

type EnrichedMonth = CostMonth & {
  ca: number;
  effectiveMS: number;
  msIsEstimated: boolean;
  ebitda: number;
  ebitdaIsEstimated: boolean;
  netDispo: number;
  hasData: boolean;
};

type Agg = {
  label: string;
  ca: number;
  coutMatiere: number;
  effectiveMS: number;
  msIsEstimated: boolean;
  chargesExploitation: number;
  remboursementCapital: number;
  interetsEmprunt: number;
  ebitda: number;
  ebitdaIsEstimated: boolean;
  netDispo: number;
};

type Props = { storeId: string; daily: StoreDaily[]; period: PeriodSelection; openedDate?: string };

// ─── Palette ──────────────────────────────────────────────────────────────────
// Exactly the same tokens as the rest of the dashboard:
//   dark (#2A2A2A), coral (#FF4433), amber (#D4820A = --status-warning), green (#2D8A4E)

const COLORS = {
  cm:       "#2A2A2A",  // --color-dark   (dominant base cost)
  ms:       "#FF4433",  // --color-coral  (main accent, same as CA line)
  ch:       "#D4820A",  // --status-warning amber
  marge:    "#2D8A4E",  // --status-success green
  margeNeg: "#C03020",  // dark coral (costs > CA)
};
const TARGETS = { cm: 45, ms: 20, ch: 15 } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMon(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "short" })
    .format(new Date(y, mo - 1))
    .replace(".", "");
}

function fmtMonLong(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(y, mo - 1),
  );
}

function niceMax(raw: number): { max: number; step: number } {
  if (raw <= 0) return { max: 1000, step: 250 };
  const roughStep = raw / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const factor = roughStep / mag >= 5 ? 5 : roughStep / mag >= 2 ? 2 : 1;
  const step = factor * mag;
  return { max: Math.ceil(raw / step) * step, step };
}

// ─── Shared tooltip ───────────────────────────────────────────────────────────

function TooltipBox({ style, children }: { style: CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute",
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
      zIndex: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

function ColorDot({ color }: { color: string }) {
  return (
    <span style={{
      width: 8, height: 8, background: color,
      display: "inline-block", borderRadius: 1, flexShrink: 0,
    }} />
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ items }: { items: { color: string; label: string; dash?: boolean }[] }) {
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
      {items.map(({ color, label, dash }) => (
        <div key={label} style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "var(--fg-secondary)", fontFamily: "var(--font-body)",
        }}>
          <svg width={18} height={12} style={{ flexShrink: 0 }}>
            {dash
              ? <line x1={0} y1={6} x2={18} y2={6} stroke={color} strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
              : <rect x={0} y={2} width={18} height={8} rx={2} fill={color} />}
          </svg>
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── Chart 1 : Décomposition du CA (stacked bars) ────────────────────────────

function StackedCaChart({
  months,
  selectedKeys,
  periodLabel,
}: {
  months: EnrichedMonth[];
  selectedKeys: string[];
  periodLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Filter to selected period — same logic as the CA line chart (rangeForSelection).
  // Fall back to all available months when selection covers nothing (edge case).
  const allPts = months.filter((m) => m.hasData);
  const filtered = allPts.filter((m) => selectedKeys.includes(m.month));
  const pts = filtered.length > 0 ? filtered : allPts;
  if (pts.length === 0) return null;

  const H = 260;
  const PAD = { top: 16, right: 16, bottom: 28, left: 60 };
  const IW = w - PAD.left - PAD.right;
  const IH = H - PAD.top - PAD.bottom;
  const n = pts.length;

  const rawMax = Math.max(
    ...pts.map((m) => Math.max(m.ca, m.coutMatiere + m.effectiveMS + m.chargesExploitation)),
    1,
  );
  const { max: yMax, step } = niceMax(rawMax * 1.08);
  const gridLevels: number[] = [];
  for (let v = 0; v <= yMax * 1.02; v += step) gridLevels.push(v);

  const hOf = (v: number) => Math.max((v / yMax) * IH, 0);
  const yOf = (v: number) => PAD.top + IH - (v / yMax) * IH;

  const slotW = IW / n;
  const barW = Math.min(slotW * 0.65, 72);
  const barXCenter = (i: number) => PAD.left + i * slotW + slotW / 2;
  const barXLeft = (i: number) => barXCenter(i) - barW / 2;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.floor((x - PAD.left) / slotW);
    setHover(idx >= 0 && idx < n ? idx : null);
  }

  void periodLabel; // consumed by the parent card subtitle

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg
        width={w} height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines + Y labels */}
        {gridLevels.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} x2={w - PAD.right}
              y1={yOf(v)} y2={yOf(v)}
              stroke="var(--border-light)"
              strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : "2 3"}
            />
            <text
              x={PAD.left - 8} y={yOf(v) + 4}
              textAnchor="end" fontSize={11}
              fill="var(--fg-tertiary)"
              style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}
            >
              {fmtEURshort(v)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {pts.map((m, i) => {
          const x = barXLeft(i);
          const xc = barXCenter(i);
          const hasCa = m.ca > 0;
          const dimmed = hover !== null && hover !== i;

          const segments: { val: number; color: string }[] = [
            { val: m.coutMatiere,         color: COLORS.cm },
            { val: m.effectiveMS,         color: COLORS.ms },
            { val: m.chargesExploitation, color: COLORS.ch },
          ];

          let curBottom = PAD.top + IH;
          const rects = segments.map(({ val, color }) => {
            const h = hOf(val);
            curBottom -= h;
            return (
              <rect key={color} x={x} y={curBottom} width={barW} height={h}
                fill={color} opacity={dimmed ? 0.3 : 0.88} />
            );
          });

          let margeRect = null;
          if (hasCa) {
            const marge = m.ebitda;
            const h = hOf(Math.abs(marge));
            if (marge >= 0) {
              curBottom -= h;
              margeRect = <rect x={x} y={curBottom} width={barW} height={h}
                fill={COLORS.marge} opacity={dimmed ? 0.3 : 1} />;
            } else {
              margeRect = <rect x={x} y={curBottom - h} width={barW} height={h}
                fill={COLORS.margeNeg} opacity={dimmed ? 0.2 : 0.75} />;
            }
          }

          return (
            <g key={m.month}>
              {rects}
              {margeRect}

              {/* CA marker line */}
              {hasCa && (
                <line
                  x1={x} x2={x + barW}
                  y1={yOf(m.ca)} y2={yOf(m.ca)}
                  stroke="var(--fg-primary)" strokeWidth={1.5}
                  opacity={dimmed ? 0.15 : 0.5}
                />
              )}

              {/* No-CA dashed outline */}
              {!hasCa && (
                <rect x={x} y={curBottom} width={barW} height={PAD.top + IH - curBottom}
                  fill="none" stroke="var(--fg-tertiary)" strokeWidth={1}
                  strokeDasharray="4 3" opacity={dimmed ? 0.2 : 0.4} />
              )}

              {/* X label */}
              <text
                x={xc} y={H - 5}
                textAnchor="middle" fontSize={11}
                fill="var(--fg-tertiary)"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {fmtMon(m.month)}
              </text>

              {/* Hover crosshair */}
              {hover === i && (
                <line
                  x1={xc} x2={xc}
                  y1={PAD.top} y2={PAD.top + IH}
                  stroke="var(--fg-primary)" strokeWidth={1}
                  strokeDasharray="2 3" opacity={0.3}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hover !== null && (() => {
        const m = pts[hover];
        const xc = barXCenter(hover);
        const hasCa = m.ca > 0;
        const pct = (v: number) =>
          hasCa ? ` · ${((v / m.ca) * 100).toFixed(1).replace(".", ",")}%` : "";
        const left = xc + 12 + 210 > w ? xc - 12 - 210 : xc + 12;
        return (
          <TooltipBox style={{ left, top: 8 }}>
            <div style={{ opacity: 0.7, marginBottom: 4, fontSize: 11, textTransform: "capitalize" }}>
              {fmtMonLong(m.month)}
              {m.msIsEstimated && <span style={{ color: "#fbbf24", marginLeft: 6 }}>· MS estimée</span>}
            </div>
            {hasCa && (
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <span style={{ flex: 1, opacity: 0.8 }}>CA</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {fmtEURshort(m.ca)}
                </span>
              </div>
            )}
            {([
              { label: "Coût matière",    val: m.coutMatiere,         color: COLORS.cm },
              { label: "Masse salariale", val: m.effectiveMS,         color: COLORS.ms },
              { label: "Charges",         val: m.chargesExploitation, color: COLORS.ch },
            ] as { label: string; val: number; color: string }[]).map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ColorDot color={color} />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtEURshort(val)}{pct(val)}
                </span>
              </div>
            ))}
            {hasCa && (() => {
              const marge = m.ebitda;
              const c = marge >= 0 ? "#86efac" : "#fca5a5";
              return (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginTop: 4, paddingTop: 4,
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                }}>
                  <ColorDot color={marge >= 0 ? COLORS.marge : COLORS.margeNeg} />
                  <span style={{ flex: 1 }}>Marge</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: c }}>
                    {fmtEURshort(marge)}{pct(marge)}
                  </span>
                </div>
              );
            })()}
          </TooltipBox>
        );
      })()}
    </div>
  );
}

// ─── Chart 2 : Ratios / CA avec objectifs ─────────────────────────────────────

function RatioChart({
  months,
  selectedKeys,
  openingMonth,
}: {
  months: EnrichedMonth[];
  selectedKeys: string[];
  openingMonth?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const pts = months.filter((m) => m.hasData && m.ca > 0 && m.month !== openingMonth);

  if (pts.length < 2) {
    return (
      <p style={{ fontSize: 13, color: "var(--fg-tertiary)", fontFamily: "var(--font-body)", padding: "12px 0" }}>
        Données insuffisantes — le graphique s'affiche à partir de 2 mois avec C.A. connu.
      </p>
    );
  }

  const H = 240;
  const PAD = { top: 16, right: 112, bottom: 28, left: 48 };
  const IW = w - PAD.left - PAD.right;
  const IH = H - PAD.top - PAD.bottom;
  const n = pts.length;
  const Y_MAX = 70;

  const xAt = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * IW : IW / 2);
  const yAt = (pct: number) => PAD.top + IH - (pct / Y_MAX) * IH;

  const ratios = pts.map((m) => ({
    month: m.month,
    cm: (m.coutMatiere / m.ca) * 100,
    ms: (m.effectiveMS / m.ca) * 100,
    ch: (m.chargesExploitation / m.ca) * 100,
    msEst: m.msIsEstimated,
    isSel: selectedKeys.length === 0 || selectedKeys.includes(m.month),
  }));

  const hasSel = ratios.some((d) => d.isSel) && ratios.some((d) => !d.isSel);

  const series = [
    { key: "cm" as const, color: COLORS.cm,  label: "Coût matière",  target: TARGETS.cm, tLabel: `obj. matière ${TARGETS.cm}%`  },
    { key: "ms" as const, color: COLORS.ms,  label: "MS",            target: TARGETS.ms, tLabel: `obj. MS ${TARGETS.ms}%`        },
    { key: "ch" as const, color: COLORS.ch,  label: "Charges",       target: TARGETS.ch, tLabel: `obj. charges ${TARGETS.ch}%`   },
  ];

  // Build path segments: full opacity for selected, low opacity for others
  const makePath = (key: "cm" | "ms" | "ch") =>
    ratios
      .map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`)
      .join(" ");

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round(((x - PAD.left) / IW) * (n - 1));
    setHover(idx >= 0 && idx < n ? idx : null);
  }

  const gridLevels = [0, 10, 20, 30, 40, 50, 60];

  // Selection band for ratio chart
  const selXs = ratios.reduce<number[]>((acc, d, i) => {
    if (d.isSel) acc.push(xAt(i));
    return acc;
  }, []);
  const bandX1 = selXs.length > 0 ? selXs[0] - (IW / (n - 1)) * 0.4 : 0;
  const bandX2 = selXs.length > 0 ? selXs[selXs.length - 1] + (IW / (n - 1)) * 0.4 : 0;

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg
        width={w} height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Selection band */}
        {hasSel && selXs.length > 0 && (
          <rect
            x={bandX1} y={PAD.top}
            width={Math.max(bandX2 - bandX1, 0)} height={IH}
            fill="rgba(0,0,0,0.035)" rx={3}
          />
        )}

        {/* Y grid */}
        {gridLevels.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} x2={w - PAD.right + 4}
              y1={yAt(v)} y2={yAt(v)}
              stroke="var(--border-light)" strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : "2 3"}
            />
            <text
              x={PAD.left - 8} y={yAt(v) + 4}
              textAnchor="end" fontSize={11}
              fill="var(--fg-tertiary)"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {v}%
            </text>
          </g>
        ))}

        {/* Target reference lines + labels */}
        {series.map(({ color, target, tLabel }) => (
          <g key={tLabel}>
            <line
              x1={PAD.left} x2={w - PAD.right + 4}
              y1={yAt(target)} y2={yAt(target)}
              stroke={color} strokeWidth={1.25} strokeDasharray="5 4" opacity={0.35}
            />
            <text
              x={w - PAD.right + 10} y={yAt(target) + 4}
              fontSize={10} fill={color}
              style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
              opacity={0.7}
            >
              {tLabel}
            </text>
          </g>
        ))}

        {/* Lines — full path, opacity differentiated per-segment via clipPath alternative */}
        {series.map(({ key, color }) => (
          <path
            key={key}
            d={makePath(key)}
            fill="none" stroke={color} strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round"
            opacity={1}
          />
        ))}

        {/* Dots: selected = filled, others = ghost */}
        {series.map(({ key, color }) =>
          ratios.map((d, i) => {
            const isSel = !hasSel || d.isSel;
            return (
              <circle
                key={`${key}-${i}`}
                cx={xAt(i)} cy={yAt(d[key])}
                r={isSel ? 3.5 : 2.5}
                fill={isSel ? "white" : "var(--bg-subtle)"}
                stroke={color}
                strokeWidth={isSel ? 1.75 : 1}
                opacity={isSel ? 1 : 0.35}
              />
            );
          })
        )}

        {/* Hover crosshair + dots */}
        {hover !== null && (
          <g>
            <line
              x1={xAt(hover)} x2={xAt(hover)}
              y1={PAD.top} y2={PAD.top + IH}
              stroke="var(--fg-primary)" strokeWidth={1}
              strokeDasharray="2 3" opacity={0.35}
            />
            {series.map(({ key, color }) => (
              <circle
                key={key}
                cx={xAt(hover)} cy={yAt(ratios[hover][key])}
                r={4.5} fill="white" stroke={color} strokeWidth={2}
              />
            ))}
          </g>
        )}

        {/* X labels */}
        {ratios.map((d, i) => {
          const every = n > 12 ? Math.ceil(n / 8) : 1;
          if (i % every !== 0 && i !== n - 1) return null;
          return (
            <text
              key={i}
              x={xAt(i)} y={H - 5}
              textAnchor="middle" fontSize={11}
              fill={(!hasSel || d.isSel) ? "var(--fg-secondary)" : "var(--fg-tertiary)"}
              fontWeight={hasSel && d.isSel ? 500 : 400}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {fmtMon(d.month)}
            </text>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hover !== null && (() => {
        const d = ratios[hover];
        const left = Math.min(w - PAD.right - 10, Math.max(0, xAt(hover) + 12));
        return (
          <TooltipBox style={{ left, top: 8 }}>
            <div style={{ opacity: 0.7, marginBottom: 4, fontSize: 11, textTransform: "capitalize" }}>
              {fmtMonLong(d.month)}
              {d.msEst && <span style={{ color: "#fbbf24", marginLeft: 6 }}>· MS estimée</span>}
            </div>
            {series.map(({ key, color, label, target }) => {
              const val = d[key];
              const delta = val - target;
              const dc = delta > 4 ? "#fca5a5" : delta < -4 ? "#86efac" : "rgba(255,255,255,0.45)";
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ColorDot color={color} />
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {val.toFixed(1).replace(".", ",")}%
                  </span>
                  <span style={{ fontSize: 10, color: dc, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1).replace(".", ",")}pp
                  </span>
                </div>
              );
            })}
          </TooltipBox>
        );
      })()}
    </div>
  );
}

// ─── P&L detail ───────────────────────────────────────────────────────────────

function PLDetail({ agg }: { agg: Agg }) {
  const hasCA = agg.ca > 0;

  function Row({ label, sub, val, estimated, bold, separator, color }: {
    label: string; sub?: string; val: number; estimated?: boolean;
    bold?: boolean; separator?: boolean; color?: string;
  }) {
    const pct = hasCA && val !== 0 ? ((val / agg.ca) * 100).toFixed(1) + "%" : null;
    return (
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: separator ? "10px 0 4px" : "5px 0",
        borderTop: separator ? "1px solid var(--border-light)" : undefined,
        marginTop: separator ? 4 : 0,
      }}>
        <span style={{
          fontSize: bold ? 13 : 12, fontWeight: bold ? 600 : 400,
          color: estimated ? "var(--color-coral)" : "var(--fg-secondary)",
          fontFamily: "var(--font-body)",
        }}>
          {label}
          {sub && <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>{sub}</span>}
          {estimated && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--color-coral)" }}>est.</span>}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {pct && !bold && (
            <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums" }}>{pct}</span>
          )}
          <span style={{
            fontFamily: "var(--font-display)", fontSize: bold ? 15 : 13,
            fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums",
            color: color ?? (estimated ? "var(--color-coral)" : "var(--fg-primary)"),
          }}>
            {estimated ? "~ " : ""}{fmtEUR(val)}
          </span>
          {pct && bold && (
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums" }}>{pct}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      {hasCA && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-primary)", marginBottom: 10, fontFamily: "var(--font-body)" }}>
          CA · {fmtEUR(agg.ca)}
        </div>
      )}
      <Row label="Coût matière"           sub="60x"    val={agg.coutMatiere} />
      <Row label="Masse salariale"         sub="64x"    val={agg.effectiveMS} estimated={agg.msIsEstimated} />
      <Row label="Charges d'exploitation"  sub="61-63x" val={agg.chargesExploitation} />
      {hasCA && (
        <>
          <Row label="EBITDA" val={agg.ebitda} bold separator estimated={agg.ebitdaIsEstimated}
            color={agg.ebitdaIsEstimated ? "var(--color-coral)" : agg.ebitda >= 0 ? "var(--status-success)" : "var(--color-coral)"} />
          <Row label="Remb. capital"      sub="16x"  val={agg.remboursementCapital} />
          <Row label="Intérêts emprunt"   sub="661x" val={agg.interetsEmprunt} />
          <Row label="NET DISPO" val={agg.netDispo} bold separator estimated={agg.ebitdaIsEstimated}
            color={agg.ebitdaIsEstimated ? "var(--color-coral)" : agg.netDispo >= 0 ? "var(--status-success)" : "var(--color-coral)"} />
        </>
      )}
      {!hasCA && (
        <div style={{
          marginTop: 10, padding: "8px 10px", background: "var(--bg-subtle)",
          borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--fg-tertiary)", fontFamily: "var(--font-body)",
        }}>
          EBITDA disponible dès synchronisation du CA APITIC
        </div>
      )}
      {agg.msIsEstimated && (
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--color-coral)", fontFamily: "var(--font-body)" }}>
          ~ MS estimée sur la moyenne des mois disponibles
        </p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FinancialBlock({ storeId, daily, period, openedDate }: Props) {
  const { data, isLoading, error } = useQuery<{ months: CostMonth[] }>({
    queryKey: ["financial-monthly", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/financial/monthly?storeId=${storeId}&months=12`);
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? res.statusText);
      return res.json() as Promise<{ months: CostMonth[] }>;
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const monthlyCA = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of daily) {
      const m = d.date.slice(0, 7);
      map[m] = (map[m] ?? 0) + d.ca;
    }
    return map;
  }, [daily]);

  const estimatedMS = useMemo(() => {
    if (!data) return 0;
    const valid = data.months.filter((m) => m.masseSalariale > 0 && m.coutMatiere > 0);
    return valid.length > 0 ? valid.reduce((s, m) => s + m.masseSalariale, 0) / valid.length : 0;
  }, [data]);

  const months = useMemo<EnrichedMonth[]>(() => {
    if (!data) return [];
    return data.months.map((m) => {
      const ca = monthlyCA[m.month] ?? 0;
      const hasOther = m.coutMatiere + m.chargesExploitation > 1;
      const msIsEstimated = m.masseSalariale === 0 && estimatedMS > 0 && hasOther;
      const effectiveMS = msIsEstimated ? estimatedMS : m.masseSalariale;
      const ebitda = ca - m.coutMatiere - effectiveMS - m.chargesExploitation;
      const netDispo = ebitda - m.remboursementCapital - m.interetsEmprunt;
      const hasData = m.coutMatiere + m.masseSalariale + m.chargesExploitation > 1 || msIsEstimated;
      return {
        ...m, ca, effectiveMS, msIsEstimated,
        ebitda, ebitdaIsEstimated: msIsEstimated,
        netDispo, hasData,
      };
    });
  }, [data, monthlyCA, estimatedMS]);

  // Period-derived selection
  const selectedKeys = useMemo(() => periodToSelectedMonths(period), [period]);
  const periodLabel  = useMemo(() => periodToFinancialRange(period).label, [period]);

  // Opening month: derived from prop when available, else first daily row with CA > 0.
  // Excluded from the ratio chart to avoid distorted ratios on a partial first month.
  const openingMonth = useMemo(() => {
    if (openedDate && openedDate < "2099") return openedDate.slice(0, 7);
    return daily.find((d) => d.ca > 0)?.date.slice(0, 7) ?? undefined;
  }, [openedDate, daily]);

  const agg = useMemo<Agg | null>(() => {
    let sel = months.filter((m) => selectedKeys.includes(m.month) && m.hasData);
    if (sel.length === 0) sel = months.filter((m) => m.hasData).slice(-1);
    if (sel.length === 0) return null;
    const ca = sel.reduce((s, m) => s + m.ca, 0);
    const cm = sel.reduce((s, m) => s + m.coutMatiere, 0);
    const ms = sel.reduce((s, m) => s + m.effectiveMS, 0);
    const ch = sel.reduce((s, m) => s + m.chargesExploitation, 0);
    const rc = sel.reduce((s, m) => s + m.remboursementCapital, 0);
    const ie = sel.reduce((s, m) => s + m.interetsEmprunt, 0);
    const msEst = sel.some((m) => m.msIsEstimated);
    const ebitda = ca - cm - ms - ch;
    const net = ebitda - rc - ie;
    const label =
      sel.length === 1
        ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
            new Date(sel[0].month + "-01"),
          )
        : `${fmtMon(sel[0].month)} → ${fmtMon(sel[sel.length - 1].month)} ${sel[sel.length - 1].month.slice(0, 4)}`;
    return {
      label, ca, coutMatiere: cm, effectiveMS: ms, msIsEstimated: msEst,
      chargesExploitation: ch, remboursementCapital: rc, interetsEmprunt: ie,
      ebitda, ebitdaIsEstimated: msEst, netDispo: net,
    };
  }, [months, selectedKeys]);

  const pennylaneTag = <span className="lm-tag">Pennylane</span>;

  if (isLoading) {
    return (
      <>
        <div className="lm-card" style={{ gridColumn: "1 / -1", minHeight: 200 }}>
          <div className="lm-card-body padded"><div className="lm-skeleton" style={{ height: 160 }} /></div>
        </div>
        <div className="lm-card" style={{ gridColumn: "span 2", minHeight: 160 }}>
          <div className="lm-card-body padded"><div className="lm-skeleton" style={{ height: 120 }} /></div>
        </div>
        <div className="lm-card" style={{ minHeight: 160 }} />
      </>
    );
  }

  if (error) {
    const msg = (error as Error).message.includes("No Pennylane config")
      ? "Intégration Pennylane non configurée."
      : `Erreur : ${(error as Error).message}`;
    return (
      <div className="lm-card" style={{ gridColumn: "1 / -1" }}>
        <div className="lm-card-body padded">
          <p style={{ fontSize: 13, color: "var(--status-error)", fontFamily: "var(--font-body)" }}>{msg}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Chart 1 : Décomposition du C.A. — full width */}
      <div className="lm-card" style={{ gridColumn: "1 / -1" }}>
        <div className="lm-card-head">
          <div>
            <h3 className="lm-card-title">Décomposition du C.A.</h3>
            <div className="lm-card-subtitle">
              Coût matière · Masse salariale · Charges · Marge — {periodLabel}
            </div>
          </div>
          {pennylaneTag}
        </div>
        <div className="lm-card-body padded">
          <Legend items={[
            { color: COLORS.cm,    label: "Coût matière (60x)" },
            { color: COLORS.ms,    label: "Masse salariale (64x)" },
            { color: COLORS.ch,    label: "Charges d'exploitation (61-63x)" },
            { color: COLORS.marge, label: "Marge (EBITDA)" },
          ]} />
          <StackedCaChart months={months} selectedKeys={selectedKeys} periodLabel={periodLabel} />
        </div>
      </div>

      {/* Chart 2 : Ratios / C.A. + objectifs — 2 colonnes */}
      <Card
        title="Ratios / C.A. et objectifs"
        subtitle={`Obj. matière ${TARGETS.cm}% · MS ${TARGETS.ms}% · Charges ${TARGETS.ch}%`}
        span={2}
        action={pennylaneTag}
      >
        <div style={{ padding: "4px 20px 20px" }}>
          <Legend items={[
            { color: COLORS.cm, label: "Coût matière",           dash: false },
            { color: COLORS.ms, label: "Masse salariale",        dash: false },
            { color: COLORS.ch, label: "Charges d'exploitation", dash: false },
          ]} />
          <RatioChart months={months} selectedKeys={selectedKeys} openingMonth={openingMonth} />
        </div>
      </Card>

      {/* P&L détail période — 1 colonne */}
      <Card
        title="Pilotage financier"
        subtitle={agg?.label ?? periodLabel}
        action={pennylaneTag}
      >
        <div style={{ padding: "0 20px 20px" }}>
          {agg
            ? <PLDetail agg={agg} />
            : <p style={{ color: "var(--fg-tertiary)", fontSize: 13, fontFamily: "var(--font-body)" }}>Aucune donnée.</p>
          }
        </div>
      </Card>
    </>
  );
}
