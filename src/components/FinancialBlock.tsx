"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { fmtEUR } from "@/lib/format";
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
  ebitdaPct: number;
  netDispo: number;
  netDispoPct: number;
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
  ebitdaPct: number;
  netDispoPct: number;
};

type Props = { storeId: string; daily: StoreDaily[]; period: PeriodSelection };

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  cm:       "#3b82f6",  // bleu  — coût matière
  ms:       "#8b5cf6",  // violet — masse salariale
  ch:       "#f97316",  // orange — charges d'exploitation
  marge:    "#16a34a",  // vert  — marge / EBITDA
  margeNeg: "#ef4444",  // rouge — EBITDA négatif
  grid:     "rgba(0,0,0,0.07)",
  axis:     "#A8A8A6",
};

const TARGETS = { cm: 45, ms: 20, ch: 15 } as const;

// ─── Shared SVG helpers ───────────────────────────────────────────────────────

function fmtMon(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "short" })
    .format(new Date(y, mo - 1))
    .replace(".", "");
}

function fmtK(v: number) {
  return Math.abs(v) >= 1000
    ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace(".", ",") + "k"
    : String(Math.round(v));
}

// ─── Legend row ───────────────────────────────────────────────────────────────

function Legend({ items }: { items: { color: string; label: string; dash?: boolean }[] }) {
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
      {items.map(({ color, label, dash }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-secondary)", fontFamily: "var(--font-body)" }}>
          <svg width={18} height={12} style={{ flexShrink: 0 }}>
            {dash
              ? <line x1={0} y1={6} x2={18} y2={6} stroke={color} strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
              : <rect x={0} y={2} width={18} height={8} rx={2} fill={color} />
            }
          </svg>
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── Chart 1 : Décomposition du CA (stacked bars) ────────────────────────────

function StackedCaChart({ months }: { months: EnrichedMonth[] }) {
  const pts = months.filter((m) => m.hasData);
  if (pts.length === 0) return null;

  const VW = 1000, H = 260, PL = 60, PR = 16, PT = 16, PB = 36;
  const IW = VW - PL - PR, IH = H - PT - PB;
  const n = pts.length;

  // Y scale: max of (CA, total costs) across all months, +10% headroom
  const yMax = Math.max(
    ...pts.map((m) => Math.max(m.ca, m.coutMatiere + m.effectiveMS + m.chargesExploitation)),
    1,
  ) * 1.12;

  const hOf = (v: number) => (v / yMax) * IH;
  const yOf = (v: number) => PT + IH - (v / yMax) * IH;

  const slotW = IW / n;
  const barW  = Math.min(slotW * 0.62, 80);
  const barX  = (i: number) => PL + i * slotW + (slotW - barW) / 2;

  // Y grid
  const raw = yMax / 4;
  const step = raw >= 20000 ? 20000 : raw >= 10000 ? 10000 : raw >= 5000 ? 5000 : 2000;
  const gridLevels: number[] = [];
  for (let v = 0; v <= yMax; v += step) gridLevels.push(v);

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden>
      {/* Grid */}
      {gridLevels.map((v) => (
        <g key={v}>
          <line x1={PL} x2={VW - PR} y1={yOf(v)} y2={yOf(v)}
            stroke={v === 0 ? "rgba(0,0,0,0.15)" : C.grid}
            strokeDasharray={v === 0 ? undefined : "3 3"} />
          <text x={PL - 7} y={yOf(v) + 4} textAnchor="end" fontSize={17}
            fill={C.axis} fontFamily="monospace">{fmtK(v)}€</text>
        </g>
      ))}

      {/* Bars */}
      {pts.map((m, i) => {
        const hasCa = m.ca > 0;
        const x = barX(i);
        const segments = [
          { val: m.coutMatiere,        color: C.cm    },
          { val: m.effectiveMS,        color: C.ms    },
          { val: m.chargesExploitation, color: C.ch   },
        ];

        // Stack from bottom up
        let curY = PT + IH;
        const rects = segments.map(({ val, color }) => {
          const h = hOf(val);
          curY -= h;
          return (
            <rect key={color} x={x} y={curY} width={barW} height={Math.max(h, 0)}
              fill={color} opacity={hasCa ? 0.9 : 0.55} />
          );
        });

        // Marge segment (only when CA known)
        let margeRect = null;
        if (hasCa) {
          const marge = m.ca - m.coutMatiere - m.effectiveMS - m.chargesExploitation;
          const h = Math.abs(hOf(marge));
          if (marge >= 0) {
            curY -= h;
            margeRect = <rect x={x} y={curY} width={barW} height={Math.max(h, 0)} fill={C.marge} />;
          } else {
            // Costs exceed CA: red overflow above the stack
            margeRect = <rect x={x} y={curY - h} width={barW} height={Math.max(h, 0)} fill={C.margeNeg} opacity={0.7} />;
          }
        }

        return (
          <g key={m.month}>
            {rects}
            {margeRect}
            {/* CA marker line */}
            {hasCa && (
              <line x1={x} x2={x + barW} y1={yOf(m.ca)} y2={yOf(m.ca)}
                stroke="#2A2A2A" strokeWidth={1.5} />
            )}
            {/* Dashed border when no CA */}
            {!hasCa && (
              <rect x={x} y={curY} width={barW} height={PT + IH - curY}
                fill="none" stroke="#A8A8A6" strokeWidth={1} strokeDasharray="4 3" />
            )}
            {/* X label */}
            <text x={x + barW / 2} y={H - 5} textAnchor="middle" fontSize={18}
              fill={C.axis} fontFamily="sans-serif">{fmtMon(m.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Chart 2 : Ratios / CA avec objectifs ─────────────────────────────────────

function RatioChart({ months }: { months: EnrichedMonth[] }) {
  const pts = months.filter((m) => m.hasData && m.ca > 0);
  if (pts.length < 2) return (
    <p style={{ fontSize: 13, color: "var(--fg-tertiary)", fontFamily: "var(--font-body)", padding: "12px 0" }}>
      CA non disponible — le graphique s'affichera dès la synchronisation APITIC.
    </p>
  );

  const VW = 1000, H = 240, PL = 44, PR = 96, PT = 16, PB = 32;
  const IW = VW - PL - PR, IH = H - PT - PB;
  const n = pts.length;

  const Y_MAX = 65;
  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * IW : IW / 2);
  const yOf = (pct: number) => PT + IH - (pct / Y_MAX) * IH;

  const ratios = pts.map((m) => ({
    month: m.month,
    cm: (m.coutMatiere / m.ca) * 100,
    ms: (m.effectiveMS / m.ca) * 100,
    ch: (m.chargesExploitation / m.ca) * 100,
    msEst: m.msIsEstimated,
  }));

  const series = [
    { key: "cm" as const, color: C.cm,   target: TARGETS.cm, label: "obj. CM"     },
    { key: "ms" as const, color: C.ms,   target: TARGETS.ms, label: "obj. MS"     },
    { key: "ch" as const, color: C.ch,   target: TARGETS.ch, label: "obj. Charges" },
  ];

  const gridLevels = [0, 10, 20, 30, 40, 50, 60];

  const makePath = (key: "cm" | "ms" | "ch") =>
    ratios.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden>
      {/* Y grid */}
      {gridLevels.map((v) => (
        <g key={v}>
          <line x1={PL} x2={VW - PR + 4} y1={yOf(v)} y2={yOf(v)}
            stroke={v === 0 ? "rgba(0,0,0,0.15)" : C.grid}
            strokeDasharray={v === 0 ? undefined : "3 3"} />
          <text x={PL - 6} y={yOf(v) + 4} textAnchor="end" fontSize={17}
            fill={C.axis} fontFamily="monospace">{v}%</text>
        </g>
      ))}

      {/* Target reference lines */}
      {series.map(({ color, target, label }) => (
        <g key={label}>
          <line x1={PL} x2={VW - PR + 4} y1={yOf(target)} y2={yOf(target)}
            stroke={color} strokeWidth={1.5} strokeDasharray="7 4" opacity={0.45} />
          <text x={VW - PR + 10} y={yOf(target) + 4} fontSize={16}
            fill={color} fontFamily="var(--font-body)" opacity={0.75} fontWeight="500">
            {label} {target}%
          </text>
        </g>
      ))}

      {/* Actual lines */}
      {series.map(({ key, color }) => (
        <path key={key} d={makePath(key)} fill="none"
          stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}

      {/* Dots */}
      {series.map(({ key, color }) =>
        ratios.map((d, i) => (
          <circle key={`${key}-${i}`} cx={xOf(i)} cy={yOf(d[key])} r={4.5}
            fill="white" stroke={color} strokeWidth={2} />
        ))
      )}

      {/* X labels */}
      {ratios.map((d, i) => (
        <text key={i} x={xOf(i)} y={H - 5} textAnchor="middle" fontSize={18}
          fill={C.axis} fontFamily="sans-serif">{fmtMon(d.month)}</text>
      ))}
    </svg>
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
          color: estimated ? "var(--status-warning)" : "var(--fg-secondary)",
          fontFamily: "var(--font-body)",
        }}>
          {label}
          {sub && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{sub}</span>}
          {estimated && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--status-warning)" }}> est.</span>}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {pct && !bold && (
            <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums" }}>{pct}</span>
          )}
          <span style={{
            fontFamily: "var(--font-display)", fontSize: bold ? 15 : 13,
            fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums",
            color: color ?? (estimated ? "var(--status-warning)" : "var(--fg-primary)"),
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
      <Row label="Coût matière"         sub="60x"    val={agg.coutMatiere} />
      <Row label="Masse salariale"       sub="64x"    val={agg.effectiveMS} estimated={agg.msIsEstimated} />
      <Row label="Charges d'exploitation" sub="61-63x" val={agg.chargesExploitation} />
      {hasCA && (
        <>
          <Row label="EBITDA" val={agg.ebitda} bold separator estimated={agg.ebitdaIsEstimated}
            color={agg.ebitdaIsEstimated ? "var(--status-warning)" : agg.ebitda >= 0 ? "var(--status-success)" : "var(--color-coral)"} />
          <Row label="Remb. capital"      sub="16x"  val={agg.remboursementCapital} />
          <Row label="Intérêts emprunt"   sub="661x" val={agg.interetsEmprunt} />
          <Row label="NET DISPO" val={agg.netDispo} bold separator estimated={agg.ebitdaIsEstimated}
            color={agg.ebitdaIsEstimated ? "var(--status-warning)" : agg.netDispo >= 0 ? "var(--status-success)" : "var(--color-coral)"} />
        </>
      )}
      {!hasCA && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--fg-tertiary)", fontFamily: "var(--font-body)" }}>
          EBITDA disponible dès synchronisation du CA APITIC
        </div>
      )}
      {agg.msIsEstimated && (
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--status-warning)", fontFamily: "var(--font-body)" }}>
          ~ MS estimée sur la moyenne des mois disponibles
        </p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FinancialBlock({ storeId, daily, period }: Props) {
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
        ...m, ca, effectiveMS, msIsEstimated, ebitda, ebitdaIsEstimated: msIsEstimated,
        ebitdaPct: ca > 0 ? (ebitda / ca) * 100 : 0,
        netDispo, netDispoPct: ca > 0 ? (netDispo / ca) * 100 : 0, hasData,
      };
    });
  }, [data, monthlyCA, estimatedMS]);

  const selectedKeys  = useMemo(() => periodToSelectedMonths(period), [period]);
  const periodLabel   = useMemo(() => periodToFinancialRange(period).label, [period]);

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
    const label = sel.length === 1
      ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(sel[0].month + "-01"))
      : `${fmtMon(sel[0].month)} → ${fmtMon(sel[sel.length - 1].month)} ${sel[sel.length - 1].month.slice(0, 4)}`;
    return {
      label, ca, coutMatiere: cm, effectiveMS: ms, msIsEstimated: msEst,
      chargesExploitation: ch, remboursementCapital: rc, interetsEmprunt: ie,
      ebitda, ebitdaIsEstimated: msEst, netDispo: net,
      ebitdaPct: ca > 0 ? (ebitda / ca) * 100 : 0,
      netDispoPct: ca > 0 ? (net / ca) * 100 : 0,
    };
  }, [months, selectedKeys]);

  const pennylaneTag = <span className="lm-tag">Pennylane</span>;

  if (isLoading) {
    return (
      <>
        <div className="lm-card" style={{ gridColumn: "1 / -1", minHeight: 200 }}><div className="lm-card-body padded"><div className="lm-skeleton" style={{ height: 160 }} /></div></div>
        <div className="lm-card" style={{ gridColumn: "span 2", minHeight: 160 }}><div className="lm-card-body padded"><div className="lm-skeleton" style={{ height: 120 }} /></div></div>
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
      {/* ── Chart 1 : Décomposition du CA ─── full width */}
      <div className="lm-card" style={{ gridColumn: "1 / -1" }}>
        <div className="lm-card-head">
          <div>
            <h3 className="lm-card-title">Décomposition du C.A.</h3>
            <div className="lm-card-subtitle">Coût matière · Masse salariale · Charges · Marge — 12 derniers mois</div>
          </div>
          {pennylaneTag}
        </div>
        <div className="lm-card-body padded">
          <Legend items={[
            { color: C.cm,    label: "Coût matière (60x)" },
            { color: C.ms,    label: "Masse salariale (64x)" },
            { color: C.ch,    label: "Charges d'exploitation (61-63x)" },
            { color: C.marge, label: "Marge (EBITDA)" },
          ]} />
          <StackedCaChart months={months} />
        </div>
      </div>

      {/* ── Chart 2 : Ratios / CA + objectifs ─── 2 colonnes */}
      <Card
        title="Ratios / C.A. et objectifs"
        subtitle={`Obj. matière ${TARGETS.cm}% · MS ${TARGETS.ms}% · Charges ${TARGETS.ch}%`}
        span={2}
        action={pennylaneTag}
      >
        <div style={{ padding: "4px 20px 20px" }}>
          <Legend items={[
            { color: C.cm, label: "Coût matière",           dash: false },
            { color: C.ms, label: "Masse salariale",        dash: false },
            { color: C.ch, label: "Charges d'exploitation", dash: false },
          ]} />
          <RatioChart months={months} />
        </div>
      </Card>

      {/* ── P&L détail période ─── 1 colonne */}
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
