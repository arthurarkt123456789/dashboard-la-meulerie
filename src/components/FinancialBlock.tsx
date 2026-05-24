"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { fmtEUR } from "@/lib/format";
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

type Aggregate = {
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
  monthCount: number;
};

type Props = {
  storeId: string;
  daily: StoreDaily[];
  period: PeriodSelection;
};

// ─── Colors ───────────────────────────────────────────────────────────────────

const C_CM = "#60a5fa";       // coût matière
const C_MS = "#818cf8";       // masse salariale (real)
const C_EST = "#fbbf24";      // estimated values
const C_EBITDA = "#4ade80";   // ebitda positive
const C_NEG = "#f87171";      // negative
const C_MUTED = "rgba(255,255,255,0.45)";
const C_MAIN = "#f0f4f8";
const C_BORDER = "rgba(255,255,255,0.08)";

// ─── Cost Evolution Chart ─────────────────────────────────────────────────────

function CostEvolutionChart({ months }: { months: EnrichedMonth[] }) {
  const pts = months.filter((m) => m.hasData);
  if (pts.length < 2) return null;

  const VW = 1000;
  const H = 180;
  const PL = 70;
  const PR = 16;
  const PT = 16;
  const PB = 32;
  const IW = VW - PL - PR;
  const IH = H - PT - PB;
  const n = pts.length;

  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * IW : IW / 2);

  const allVals = pts.flatMap((d) => [d.coutMatiere, d.effectiveMS]);
  const rawMax = Math.max(...allVals, 1000);
  const yMax = Math.ceil(rawMax / 5000) * 5000;
  const yOf = (v: number) => PT + IH - (v / yMax) * IH;

  const gridLevels: number[] = [];
  const step = yMax <= 20000 ? 5000 : yMax <= 50000 ? 10000 : 20000;
  for (let v = 0; v <= yMax; v += step) gridLevels.push(v);

  const fmtY = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);

  const fmtMon = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", { month: "short" })
      .format(new Date(y, mo - 1))
      .replace(".", "");
  };

  const makePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");

  const cmPath = makePath(pts.map((d) => d.coutMatiere));
  const msPath = makePath(pts.map((d) => d.effectiveMS));

  return (
    <div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { color: C_CM, label: "Coût matière (60x)", dash: false },
          { color: C_MS, label: "Masse salariale (64x)", dash: false },
          { color: C_EST, label: "Masse salariale estimée", dash: true },
        ].map(({ color, label, dash }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C_MUTED }}>
            <svg width={24} height={12} style={{ overflow: "visible", flexShrink: 0 }}>
              <line x1={0} y1={6} x2={24} y2={6} stroke={color} strokeWidth={2.5}
                strokeDasharray={dash ? "5 3" : undefined} strokeLinecap="round" />
              {!dash && <circle cx={12} cy={6} r={3} fill={color} />}
            </svg>
            {label}
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${VW} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden="true">
        {/* Grid */}
        {gridLevels.map((v) => (
          <g key={v}>
            <line x1={PL} x2={VW - PR} y1={yOf(v)} y2={yOf(v)}
              stroke={v === 0 ? "rgba(255,255,255,0.2)" : C_BORDER}
              strokeDasharray={v === 0 ? undefined : "4 4"} />
            <text x={PL - 7} y={yOf(v)} textAnchor="end" dominantBaseline="middle"
              fill="rgba(255,255,255,0.35)" fontSize={18} fontFamily="monospace">
              {fmtY(v)}€
            </text>
          </g>
        ))}

        {/* Masse salariale line — segmented by estimated/real */}
        {pts.map((d, i) => {
          if (i === 0) return null;
          const prev = pts[i - 1];
          const color = d.msIsEstimated || prev.msIsEstimated ? C_EST : C_MS;
          const dash = d.msIsEstimated || prev.msIsEstimated ? "8 4" : undefined;
          return (
            <line key={`ms-${i}`}
              x1={xOf(i - 1).toFixed(1)} y1={yOf(prev.effectiveMS).toFixed(1)}
              x2={xOf(i).toFixed(1)} y2={yOf(d.effectiveMS).toFixed(1)}
              stroke={color} strokeWidth={2.5} strokeDasharray={dash} strokeLinecap="round" />
          );
        })}

        {/* Coût matière line */}
        <path d={cmPath} fill="none" stroke={C_CM} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots — coût matière */}
        {pts.map((d, i) => (
          <circle key={`cm-${i}`} cx={xOf(i)} cy={yOf(d.coutMatiere)} r={4} fill={C_CM} />
        ))}

        {/* Dots — masse salariale */}
        {pts.map((d, i) => (
          d.msIsEstimated
            ? <circle key={`ms-${i}`} cx={xOf(i)} cy={yOf(d.effectiveMS)} r={4}
                fill="none" stroke={C_EST} strokeWidth={2} />
            : <circle key={`ms-${i}`} cx={xOf(i)} cy={yOf(d.effectiveMS)} r={4} fill={C_MS} />
        ))}

        {/* X labels */}
        {pts.map((d, i) => (
          <text key={`x-${i}`} x={xOf(i)} y={H - 4} textAnchor="middle"
            fill="rgba(255,255,255,0.38)" fontSize={18} fontFamily="sans-serif">
            {fmtMon(d.month)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Sep() {
  return <div style={{ height: 1, background: C_BORDER, margin: "10px 0" }} />;
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(y, mo - 1));
}

function AmtEst({ val, estimated }: { val: number; estimated?: boolean }) {
  return (
    <span style={{
      fontFamily: "var(--font-display)",
      fontSize: 13,
      fontVariantNumeric: "tabular-nums",
      color: estimated ? C_EST : C_MAIN,
    }}>
      {estimated ? "~ " : ""}{fmtEUR(val)}
    </span>
  );
}

function RatioBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: C_MUTED, minWidth: 38, textAlign: "right" }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Period detail ────────────────────────────────────────────────────────────

function PeriodDetail({ agg }: { agg: Aggregate }) {
  const hasCA = agg.ca > 0;
  const ebitdaColor = agg.ebitda >= 0 ? C_EBITDA : C_NEG;
  const netDispoColor = agg.netDispo >= 0 ? C_EBITDA : C_NEG;

  const costs = [
    { label: "Coût matière", sub: "60x", val: agg.coutMatiere, estimated: false, color: C_CM },
    { label: "Masse salariale", sub: "64x", val: agg.effectiveMS, estimated: agg.msIsEstimated, color: agg.msIsEstimated ? C_EST : C_MS },
    { label: "Charges d'exploitation", sub: "61-63x", val: agg.chargesExploitation, estimated: false, color: "#a78bfa" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 40px" }}>
      {/* Left: coûts → EBITDA */}
      <div>
        {hasCA && (
          <div style={{ fontSize: 12, fontWeight: 600, color: C_MAIN, marginBottom: 14 }}>
            CA · {fmtEUR(agg.ca)}
          </div>
        )}

        {costs.map(({ label, sub, val, estimated, color }) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12, color: estimated ? C_EST : C_MUTED }}>
                {label} <span style={{ fontSize: 10, opacity: 0.6 }}>{sub}</span>
                {estimated && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>est.</span>}
              </span>
              <AmtEst val={val} estimated={estimated} />
            </div>
            {hasCA && <RatioBar pct={(val / agg.ca) * 100} color={color} />}
          </div>
        ))}

        <Sep />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: agg.ebitdaIsEstimated ? C_EST : C_MAIN }}>
            EBITDA{agg.ebitdaIsEstimated ? " ~" : ""}
          </span>
          {hasCA ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: agg.ebitdaIsEstimated ? C_EST : ebitdaColor }}>
                {agg.ebitdaIsEstimated ? "~ " : ""}{fmtEUR(agg.ebitda)}
              </span>
              <span style={{ fontSize: 11, color: C_MUTED }}>{agg.ebitdaPct.toFixed(1)}%</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: C_MUTED }}>CA non disponible</span>
          )}
        </div>
      </div>

      {/* Right: EBITDA → NET DISPO */}
      <div>
        {hasCA ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: agg.ebitdaIsEstimated ? C_EST : C_MAIN, marginBottom: 14 }}>
              EBITDA · {agg.ebitdaIsEstimated ? "~ " : ""}{fmtEUR(agg.ebitda)}
            </div>

            {[
              { label: "Remb. capital", sub: "16x", val: agg.remboursementCapital },
              { label: "Intérêts d'emprunt", sub: "661x", val: agg.interetsEmprunt },
            ].map(({ label, sub, val }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: C_MUTED }}>
                  {label} <span style={{ fontSize: 10, opacity: 0.6 }}>{sub}</span>
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: C_MUTED }}>
                  − {fmtEUR(val)}
                </span>
              </div>
            ))}

            <Sep />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: agg.ebitdaIsEstimated ? C_EST : C_MAIN }}>
                NET DISPO{agg.ebitdaIsEstimated ? " ~" : ""}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: agg.ebitdaIsEstimated ? C_EST : netDispoColor }}>
                  {agg.ebitdaIsEstimated ? "~ " : ""}{fmtEUR(agg.netDispo)}
                </span>
                <span style={{ fontSize: 11, color: C_MUTED }}>{agg.netDispoPct.toFixed(1)}%</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {[
              { label: "Remb. capital", sub: "16x", val: agg.remboursementCapital },
              { label: "Intérêts d'emprunt", sub: "661x", val: agg.interetsEmprunt },
            ].map(({ label, sub, val }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: C_MUTED }}>
                  {label} <span style={{ fontSize: 10, opacity: 0.6 }}>{sub}</span>
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: C_MUTED }}>
                  {fmtEUR(val)}
                </span>
              </div>
            ))}
          </>
        )}

        {agg.msIsEstimated && (
          <div style={{ marginTop: 16, fontSize: 10, color: C_EST, opacity: 0.8, lineHeight: 1.5 }}>
            ~ Masse salariale estimée sur la moyenne des mois disponibles
          </div>
        )}

        {!hasCA && (
          <div style={{ marginTop: 12, fontSize: 10, color: C_MUTED, lineHeight: 1.5 }}>
            EBITDA et NET DISPO s'afficheront dès que le CA APITIC est synchronisé
          </div>
        )}
      </div>
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

  // Monthly CA from APITIC daily data
  const monthlyCA = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of daily) {
      const m = d.date.slice(0, 7);
      map[m] = (map[m] ?? 0) + d.ca;
    }
    return map;
  }, [daily]);

  // Average real masseSalariale — used to estimate missing months
  const estimatedMS = useMemo(() => {
    if (!data) return 0;
    const valid = data.months.filter((m) => m.masseSalariale > 0 && m.coutMatiere > 0);
    return valid.length > 0 ? valid.reduce((s, m) => s + m.masseSalariale, 0) / valid.length : 0;
  }, [data]);

  const months = useMemo<EnrichedMonth[]>(() => {
    if (!data) return [];
    return data.months.map((m) => {
      const ca = monthlyCA[m.month] ?? 0;
      const hasOtherData = m.coutMatiere + m.chargesExploitation > 1;
      const msIsEstimated = m.masseSalariale === 0 && estimatedMS > 0 && hasOtherData;
      const effectiveMS = msIsEstimated ? estimatedMS : m.masseSalariale;
      const ebitda = ca - m.coutMatiere - effectiveMS - m.chargesExploitation;
      const netDispo = ebitda - m.remboursementCapital - m.interetsEmprunt;
      const hasData = m.coutMatiere + m.masseSalariale + m.chargesExploitation > 1 || msIsEstimated;
      return {
        ...m,
        ca,
        effectiveMS,
        msIsEstimated,
        ebitda,
        ebitdaIsEstimated: msIsEstimated,
        ebitdaPct: ca > 0 ? (ebitda / ca) * 100 : 0,
        netDispo,
        netDispoPct: ca > 0 ? (netDispo / ca) * 100 : 0,
        hasData,
      };
    });
  }, [data, monthlyCA, estimatedMS]);

  // Which months correspond to the selected period
  const selectedMonthKeys = useMemo(() => periodToSelectedMonths(period), [period]);

  // Period label
  const periodLabel = useMemo(() => periodToFinancialRange(period).label, [period]);

  // Aggregate selected months (fallback to latest with data)
  const agg = useMemo<Aggregate | null>(() => {
    let selected = months.filter((m) => selectedMonthKeys.includes(m.month) && m.hasData);
    if (selected.length === 0) selected = months.filter((m) => m.hasData).slice(-1);
    if (selected.length === 0) return null;

    const ca = selected.reduce((s, m) => s + m.ca, 0);
    const coutMatiere = selected.reduce((s, m) => s + m.coutMatiere, 0);
    const effectiveMS = selected.reduce((s, m) => s + m.effectiveMS, 0);
    const msIsEstimated = selected.some((m) => m.msIsEstimated);
    const chargesExploitation = selected.reduce((s, m) => s + m.chargesExploitation, 0);
    const remboursementCapital = selected.reduce((s, m) => s + m.remboursementCapital, 0);
    const interetsEmprunt = selected.reduce((s, m) => s + m.interetsEmprunt, 0);
    const ebitda = ca - coutMatiere - effectiveMS - chargesExploitation;
    const netDispo = ebitda - remboursementCapital - interetsEmprunt;

    const aggLabel =
      selected.length === 1
        ? fmtMonth(selected[0].month)
        : `${fmtMonth(selected[0].month)} → ${fmtMonth(selected[selected.length - 1].month)}`;

    return {
      label: aggLabel,
      ca,
      coutMatiere,
      effectiveMS,
      msIsEstimated,
      chargesExploitation,
      remboursementCapital,
      interetsEmprunt,
      ebitda,
      ebitdaIsEstimated: msIsEstimated,
      netDispo,
      ebitdaPct: ca > 0 ? (ebitda / ca) * 100 : 0,
      netDispoPct: ca > 0 ? (netDispo / ca) * 100 : 0,
      monthCount: selected.length,
    };
  }, [months, selectedMonthKeys]);

  return (
    <div
      className="lm-card"
      style={{ gridColumn: "1 / -1" }}
    >
      {/* Header */}
      <div className="lm-card-head">
        <div>
          <h3 className="lm-card-title">Données financières · Pilotage mensuel</h3>
          <div className="lm-card-subtitle">
            Évolution 12 mois · focus {periodLabel}
          </div>
        </div>
        <div className="lm-card-action">
          <span style={{
            fontSize: 10,
            color: C_MUTED,
            background: "rgba(255,255,255,0.07)",
            padding: "3px 8px",
            borderRadius: 4,
          }}>
            Pennylane
          </span>
        </div>
      </div>

      <div className="lm-card-body padded">
        {isLoading && (
          <div style={{ color: C_MUTED, fontSize: 13 }}>Chargement des données comptables…</div>
        )}

        {error && (
          <div style={{ color: C_NEG, fontSize: 12 }}>
            {(error as Error).message.includes("No Pennylane config")
              ? "Intégration Pennylane non configurée pour ce magasin."
              : `Erreur Pennylane : ${(error as Error).message}`}
          </div>
        )}

        {months.length > 0 && !isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Evolution chart */}
            <CostEvolutionChart months={months} />

            {!months.some((m) => m.hasData) && (
              <div style={{ color: C_MUTED, fontSize: 12 }}>
                Aucune donnée comptable trouvée dans Pennylane pour les 12 derniers mois.
              </div>
            )}

            {/* Period detail */}
            {agg && (
              <div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C_MUTED,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 16,
                  paddingTop: 8,
                  borderTop: `1px solid ${C_BORDER}`,
                }}>
                  {agg.label}{agg.monthCount > 1 ? ` · ${agg.monthCount} mois` : ""}
                </div>
                <PeriodDetail agg={agg} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
