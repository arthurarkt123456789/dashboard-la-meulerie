"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { fmtEUR, fmtEURshort } from "@/lib/format";
import { LineChart } from "./charts/LineChart";
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

// ─── Monthly table ────────────────────────────────────────────────────────────

function MonthTable({ months, selectedKeys }: { months: EnrichedMonth[]; selectedKeys: string[] }) {
  const pts = months.filter((m) => m.hasData);
  if (pts.length === 0) return null;

  const fmtK = (v: number) =>
    Math.abs(v) >= 1000
      ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace(".", ",") + "k"
      : String(Math.round(v));

  const fmtMon = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", { month: "short" })
      .format(new Date(y, mo - 1))
      .replace(".", "");
  };

  const thBase: React.CSSProperties = {
    padding: "0 10px 10px",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.04em",
    color: "var(--fg-tertiary)",
    textAlign: "right",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border-light)",
  };
  const tdBase: React.CSSProperties = {
    padding: "8px 10px",
    textAlign: "right",
    fontFamily: "var(--font-display)",
    fontSize: 14,
    fontVariantNumeric: "tabular-nums",
    borderBottom: "1px solid var(--border-light)",
    whiteSpace: "nowrap",
  };
  const labelBase: React.CSSProperties = {
    padding: "8px 10px 8px 0",
    fontSize: 12,
    color: "var(--fg-secondary)",
    fontFamily: "var(--font-body)",
    borderBottom: "1px solid var(--border-light)",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto", marginTop: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...thBase, textAlign: "left", padding: "0 10px 10px 0" }} />
            {pts.map((m) => {
              const isSel = selectedKeys.includes(m.month);
              return (
                <th key={m.month} style={{
                  ...thBase,
                  color: isSel ? "var(--fg-primary)" : "var(--fg-tertiary)",
                  fontWeight: isSel ? 700 : 500,
                }}>
                  {fmtMon(m.month)}
                  {isSel && (
                    <div style={{ height: 2, background: "var(--color-coral)", borderRadius: 1, marginTop: 4 }} />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* Coût matière */}
          <tr>
            <td style={{ ...labelBase }}>Coût matière <span style={{ fontSize: 10, opacity: 0.6 }}>60x</span></td>
            {pts.map((m) => (
              <td key={m.month} style={{ ...tdBase, color: "var(--fg-primary)" }}>
                {fmtK(m.coutMatiere)} €
                {m.ca > 0 && <div style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>{((m.coutMatiere / m.ca) * 100).toFixed(1)}%</div>}
              </td>
            ))}
          </tr>

          {/* Masse salariale */}
          <tr>
            <td style={{ ...labelBase }}>Masse salariale <span style={{ fontSize: 10, opacity: 0.6 }}>64x</span></td>
            {pts.map((m) => (
              <td key={m.month} style={{
                ...tdBase,
                color: m.msIsEstimated ? "var(--status-warning)" : "var(--fg-primary)",
              }}>
                {m.msIsEstimated ? "~" : ""}{fmtK(m.effectiveMS)} €
                {m.ca > 0 && <div style={{ fontSize: 11, color: m.msIsEstimated ? "var(--status-warning)" : "var(--fg-tertiary)", fontWeight: 400 }}>{((m.effectiveMS / m.ca) * 100).toFixed(1)}%</div>}
              </td>
            ))}
          </tr>

          {/* Charges */}
          <tr>
            <td style={{ ...labelBase }}>Charges <span style={{ fontSize: 10, opacity: 0.6 }}>61-63x</span></td>
            {pts.map((m) => (
              <td key={m.month} style={{ ...tdBase, color: "var(--fg-primary)" }}>
                {fmtK(m.chargesExploitation)} €
                {m.ca > 0 && <div style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>{((m.chargesExploitation / m.ca) * 100).toFixed(1)}%</div>}
              </td>
            ))}
          </tr>

          {/* EBITDA — only if any month has CA */}
          {pts.some((m) => m.ca > 0) && (
            <tr>
              <td style={{ ...labelBase, fontWeight: 600, color: "var(--fg-primary)", borderTop: "2px solid var(--border-medium)" }}>
                EBITDA
              </td>
              {pts.map((m) => {
                const color = m.ca === 0
                  ? "var(--fg-tertiary)"
                  : m.ebitdaIsEstimated
                  ? "var(--status-warning)"
                  : m.ebitda >= 0
                  ? "var(--status-success)"
                  : "var(--color-coral)";
                return (
                  <td key={m.month} style={{ ...tdBase, fontWeight: 600, color, borderTop: "2px solid var(--border-medium)" }}>
                    {m.ca === 0 ? "—" : (
                      <>
                        {m.ebitdaIsEstimated ? "~" : ""}{fmtK(m.ebitda)} €
                        <div style={{ fontSize: 11, fontWeight: 400 }}>{m.ebitdaPct.toFixed(1)}%</div>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
      {pts.some((m) => m.msIsEstimated) && (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--status-warning)", fontFamily: "var(--font-body)" }}>
          ~ Masse salariale estimée sur la moyenne des mois disponibles
        </p>
      )}
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
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: separator ? "10px 0 4px" : "6px 0",
        borderTop: separator ? "1px solid var(--border-light)" : undefined,
        marginTop: separator ? 4 : 0,
      }}>
        <span style={{
          fontSize: bold ? 13 : 12,
          fontWeight: bold ? 600 : 400,
          color: estimated ? "var(--status-warning)" : "var(--fg-secondary)",
          fontFamily: "var(--font-body)",
        }}>
          {label}
          {sub && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{sub}</span>}
          {estimated && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--status-warning)" }}> est.</span>}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {pct && !bold && (
            <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
              {pct}
            </span>
          )}
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: bold ? 16 : 13,
            fontWeight: bold ? 700 : 500,
            fontVariantNumeric: "tabular-nums",
            color: color ?? (estimated ? "var(--status-warning)" : "var(--fg-primary)"),
          }}>
            {estimated ? "~ " : ""}{fmtEUR(val)}
          </span>
          {pct && bold && (
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {pct}
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      {hasCA && (
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--fg-primary)",
          marginBottom: 12,
          fontFamily: "var(--font-body)",
        }}>
          CA · {fmtEUR(agg.ca)}
        </div>
      )}

      <Row label="Coût matière" sub="60x" val={agg.coutMatiere} />
      <Row label="Masse salariale" sub="64x" val={agg.effectiveMS} estimated={agg.msIsEstimated} />
      <Row label="Charges d'exploitation" sub="61-63x" val={agg.chargesExploitation} />

      {hasCA && (
        <>
          <Row
            label="EBITDA" val={agg.ebitda} bold separator
            estimated={agg.ebitdaIsEstimated}
            color={agg.ebitdaIsEstimated ? "var(--status-warning)" : agg.ebitda >= 0 ? "var(--status-success)" : "var(--color-coral)"}
          />
          <Row label="Remb. capital" sub="16x" val={agg.remboursementCapital} />
          <Row label="Intérêts emprunt" sub="661x" val={agg.interetsEmprunt} />
          <Row
            label="NET DISPO" val={agg.netDispo} bold separator
            estimated={agg.ebitdaIsEstimated}
            color={agg.ebitdaIsEstimated ? "var(--status-warning)" : agg.netDispo >= 0 ? "var(--status-success)" : "var(--color-coral)"}
          />
        </>
      )}

      {!hasCA && (
        <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--fg-tertiary)", fontFamily: "var(--font-body)" }}>
          EBITDA et NET DISPO disponibles dès synchronisation du CA APITIC
        </div>
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

  const selectedKeys = useMemo(() => periodToSelectedMonths(period), [period]);
  const periodLabel = useMemo(() => periodToFinancialRange(period).label, [period]);

  const agg = useMemo<Agg | null>(() => {
    let sel = months.filter((m) => selectedKeys.includes(m.month) && m.hasData);
    if (sel.length === 0) sel = months.filter((m) => m.hasData).slice(-1);
    if (sel.length === 0) return null;
    const ca = sel.reduce((s, m) => s + m.ca, 0);
    const coutMatiere = sel.reduce((s, m) => s + m.coutMatiere, 0);
    const effectiveMS = sel.reduce((s, m) => s + m.effectiveMS, 0);
    const msIsEstimated = sel.some((m) => m.msIsEstimated);
    const chargesExploitation = sel.reduce((s, m) => s + m.chargesExploitation, 0);
    const remboursementCapital = sel.reduce((s, m) => s + m.remboursementCapital, 0);
    const interetsEmprunt = sel.reduce((s, m) => s + m.interetsEmprunt, 0);
    const ebitda = ca - coutMatiere - effectiveMS - chargesExploitation;
    const netDispo = ebitda - remboursementCapital - interetsEmprunt;
    const label = sel.length === 1
      ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
          .format(new Date(sel[0].month + "-01"))
      : `${new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(sel[0].month + "-01"))} → ${new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(new Date(sel[sel.length - 1].month + "-01"))}`;
    return { label, ca, coutMatiere, effectiveMS, msIsEstimated, chargesExploitation, remboursementCapital, interetsEmprunt, ebitda, ebitdaIsEstimated: msIsEstimated, netDispo, ebitdaPct: ca > 0 ? (ebitda / ca) * 100 : 0, netDispoPct: ca > 0 ? (netDispo / ca) * 100 : 0 };
  }, [months, selectedKeys]);

  // LineChart data: % of CA per month (only months where CA is known)
  const chartData = useMemo(() =>
    months.filter((m) => m.hasData && m.ca > 0).map((m) => ({
      date: m.month + "-01",
      coutMatiere: Math.round((m.coutMatiere / m.ca) * 1000) / 10,
      masseSalariale: Math.round((m.effectiveMS / m.ca) * 1000) / 10,
    })),
  [months]);

  const pennylaneTag = (
    <span className="lm-tag">Pennylane</span>
  );

  if (isLoading) {
    return (
      <>
        <Card title="Coût matière & Masse salariale" subtitle="Chargement…" span={2} action={pennylaneTag}>
          <div style={{ height: 160 }} />
        </Card>
        <Card title="Pilotage financier" subtitle="Chargement…" action={pennylaneTag}>
          <div style={{ height: 160 }} />
        </Card>
      </>
    );
  }

  if (error) {
    const msg = (error as Error).message.includes("No Pennylane config")
      ? "Intégration Pennylane non configurée pour ce magasin."
      : `Erreur : ${(error as Error).message}`;
    return (
      <Card title="Données financières" subtitle={msg} span={2} action={pennylaneTag}>
        <div />
      </Card>
    );
  }

  return (
    <>
      {/* Evolution chart + monthly table */}
      <Card
        title="Coût matière & Masse salariale"
        subtitle="Évolution mensuelle · 12 derniers mois"
        span={2}
        action={pennylaneTag}
      >
        <LineChart
          data={chartData}
          series={[
            { key: "coutMatiere", label: "Coût matière (60x)", color: "#3b82f6" },
            { key: "masseSalariale", label: "Masse salariale (64x)", color: "#8b5cf6" },
          ]}
          height={200}
          granularity="month"
          showLegend
          yFormat={(n) => n.toFixed(1) + "%"}
        />
        <div style={{ padding: "0 20px 20px" }}>
          <MonthTable months={months} selectedKeys={selectedKeys} />
        </div>
      </Card>

      {/* P&L detail for selected period */}
      <Card
        title="Pilotage financier"
        subtitle={agg ? agg.label : periodLabel}
        action={pennylaneTag}
      >
        <div style={{ padding: "0 20px 20px" }}>
          {agg
            ? <PLDetail agg={agg} />
            : <p style={{ color: "var(--fg-tertiary)", fontSize: 13, fontFamily: "var(--font-body)" }}>Aucune donnée disponible.</p>
          }
        </div>
      </Card>
    </>
  );
}
