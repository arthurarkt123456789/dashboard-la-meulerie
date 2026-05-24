"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { StoreDaily } from "@/lib/apitic/types";
import { fmtEUR } from "@/lib/format";

type CostMonth = {
  month: string; // "2026-04"
  coutMatiere: number;
  masseSalariale: number;
  chargesExploitation: number;
  remboursementCapital: number;
  interetsEmprunt: number;
  error?: string;
  _diag?: {
    topKeys?: string[];
    rowCount?: number;
    firstRowKeys?: string[];
  };
};

type MonthlyResponse = { months: CostMonth[] };

type EnrichedMonth = CostMonth & {
  ca: number;
  ebitda: number;
  ebitdaPct: number;
  netDispo: number;
  netDispoPct: number;
  hasData: boolean;
};

type Props = {
  storeId: string;
  daily: StoreDaily[];
};

// ─── Trend chart ──────────────────────────────────────────────────────────────

function TrendChart({ months }: { months: EnrichedMonth[] }) {
  const pts = months.filter((m) => m.hasData && m.ca > 0);
  if (pts.length < 2) return null;

  const VW = 1000;
  const H = 170;
  const PL = 52; // pad left (Y labels)
  const PR = 16;
  const PT = 18;
  const PB = 34; // pad bottom (X labels)
  const IW = VW - PL - PR;
  const IH = H - PT - PB;
  const n = pts.length;

  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * IW : IW / 2);

  const vals = pts.flatMap((d) => [d.ebitdaPct, d.netDispoPct]);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const yMin = Math.floor((Math.min(0, rawMin) - 3) / 5) * 5;
  const yMax = Math.ceil((Math.max(5, rawMax) + 3) / 5) * 5;
  const yOf = (v: number) => PT + IH - ((v - yMin) / (yMax - yMin)) * IH;

  const gridLevels: number[] = [];
  for (let v = yMin; v <= yMax; v += 5) gridLevels.push(v);

  const makePath = (key: "ebitdaPct" | "netDispoPct") =>
    pts.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(" ");

  const fmtMon = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", { month: "short" })
      .format(new Date(y, mo - 1))
      .replace(".", "");
  };

  return (
    <div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 8, flexWrap: "wrap" }}>
        {[
          { color: "#4ade80", label: "EBITDA %", dash: false },
          { color: "#93c5fd", label: "NET DISPO %", dash: true },
        ].map(({ color, label, dash }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            <svg width={24} height={12} style={{ overflow: "visible", flexShrink: 0 }}>
              <line
                x1={0}
                y1={6}
                x2={24}
                y2={6}
                stroke={color}
                strokeWidth={2.5}
                strokeDasharray={dash ? "5 3" : undefined}
                strokeLinecap="round"
              />
              {!dash && <circle cx={12} cy={6} r={3.5} fill={color} />}
            </svg>
            {label}
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${VW} ${H}`}
        style={{ width: "100%", display: "block" }}
        aria-hidden="true"
      >
        {/* Horizontal grid + Y labels */}
        {gridLevels.map((v) => {
          const y = yOf(v);
          return (
            <g key={v}>
              <line
                x1={PL}
                x2={VW - PR}
                y1={y}
                y2={y}
                stroke={v === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.06)"}
                strokeDasharray={v === 0 ? undefined : "4 4"}
              />
              <text
                x={PL - 7}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.38)"
                fontSize={19}
                fontFamily="monospace"
              >
                {v}%
              </text>
            </g>
          );
        })}

        {/* NET DISPO line (behind EBITDA) */}
        <path
          d={makePath("netDispoPct")}
          fill="none"
          stroke="#93c5fd"
          strokeWidth={2}
          strokeDasharray="9 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* EBITDA line */}
        <path
          d={makePath("ebitdaPct")}
          fill="none"
          stroke="#4ade80"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* EBITDA dots */}
        {pts.map((d, i) => (
          <circle
            key={i}
            cx={xOf(i)}
            cy={yOf(d.ebitdaPct)}
            r={5}
            fill="#4ade80"
          />
        ))}

        {/* X-axis month labels */}
        {pts.map((d, i) => (
          <text
            key={i}
            x={xOf(i)}
            y={H - 5}
            textAnchor="middle"
            fill="rgba(255,255,255,0.4)"
            fontSize={20}
            fontFamily="sans-serif"
          >
            {fmtMon(d.month)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Ratio bar ────────────────────────────────────────────────────────────────

function RatioBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
      <div
        style={{
          flex: 1,
          height: 3,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          minWidth: 38,
          textAlign: "right",
        }}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

function Sep() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "8px 0" }} />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FinancialBlock({ storeId, daily }: Props) {
  const { data, isLoading, error } = useQuery<MonthlyResponse>({
    queryKey: ["financial-monthly", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/financial/monthly?storeId=${storeId}&months=12`);
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      return res.json();
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

  // Merge Pennylane costs with APITIC CA
  const months = useMemo<EnrichedMonth[]>(() => {
    if (!data) return [];
    return data.months.map((m) => {
      const ca = monthlyCA[m.month] ?? 0;
      const ebitda = ca - m.coutMatiere - m.masseSalariale - m.chargesExploitation;
      const netDispo = ebitda - m.remboursementCapital - m.interetsEmprunt;
      const hasData = m.coutMatiere + m.masseSalariale + m.chargesExploitation > 1;
      return {
        ...m,
        ca,
        ebitda,
        ebitdaPct: ca > 0 ? (ebitda / ca) * 100 : 0,
        netDispo,
        netDispoPct: ca > 0 ? (netDispo / ca) * 100 : 0,
        hasData,
      };
    });
  }, [data, monthlyCA]);

  // Latest month with accounting data (CA from APITIC is a bonus for EBITDA)
  const latest = months.filter((m) => m.hasData).at(-1);

  const fgMuted = "rgba(255,255,255,0.5)";
  const fgMain = "#f0f4f8";
  const accent = "#4ade80";
  const danger = "#f87171";

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        background: "#111b27",
        borderRadius: "var(--radius-lg, 12px)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        borderTop: "2px solid rgba(74,222,128,0.15)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: fgMuted,
            }}
          >
            Données financières · Pilotage mensuel
          </div>
          <div style={{ fontSize: 11, color: fgMuted, marginTop: 3 }}>
            EBITDA et NET DISPO · 12 derniers mois clôturés
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: fgMuted,
            background: "rgba(255,255,255,0.07)",
            padding: "3px 8px",
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          Pennylane
        </div>
      </div>

      {isLoading && (
        <div style={{ color: fgMuted, fontSize: 13 }}>
          Chargement des données comptables…
        </div>
      )}

      {error && (
        <div style={{ color: danger, fontSize: 12 }}>
          {(error as Error).message.includes("No Pennylane config")
            ? "Intégration Pennylane non configurée pour ce magasin."
            : `Erreur Pennylane : ${(error as Error).message}`}
        </div>
      )}

      {months.length > 0 && (
        <>
          {/* Trend chart */}
          <TrendChart months={months} />

          {!months.some((m) => m.hasData) && (() => {
            const diag = months.at(-1)?._diag;
            return (
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
                  Aucune donnée comptable trouvée dans Pennylane pour les 12 derniers mois.
                </div>
                {diag && (
                  <div style={{
                    fontFamily: "monospace", fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    background: "rgba(255,255,255,0.04)",
                    padding: "8px 10px", borderRadius: 6,
                  }}>
                    <div>Réponse Pennylane · {diag.rowCount ?? "?"} ligne(s)</div>
                    {diag.topKeys && <div>Clés reçues : {diag.topKeys.join(", ") || "aucune"}</div>}
                    {diag.firstRowKeys && diag.firstRowKeys.length > 0 && (
                      <div>Champs d&apos;une ligne : {diag.firstRowKeys.join(", ")}</div>
                    )}
                    {diag.rowCount === 0 && (
                      <div style={{ marginTop: 4, color: "rgba(255,255,255,0.55)" }}>
                        → Aucune écriture saisie pour cette période dans Pennylane,
                        ou le plan ne donne pas accès à trial_balance.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Latest month breakdown */}
          {latest && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: fgMuted,
                  marginBottom: 14,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {fmtMonth(latest.month)} — détail
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 40px" }}>
                {/* Left: coûts */}
                <div>
                  {latest.ca > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: fgMain, marginBottom: 12 }}>
                      CA · {fmtEUR(latest.ca)}
                    </div>
                  )}

                  {(
                    [
                      { label: "Coût matière", val: latest.coutMatiere, color: "#60a5fa", sub: "60x" },
                      { label: "Masse salariale", val: latest.masseSalariale, color: "#818cf8", sub: "64x" },
                      { label: "Charges d'exploitation", val: latest.chargesExploitation, color: "#a78bfa", sub: "61-63x" },
                    ] as const
                  ).map(({ label, val, color, sub }) => (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 12, color: fgMuted }}>
                          {label}{" "}
                          <span style={{ fontSize: 10, opacity: 0.6 }}>{sub}</span>
                        </span>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: fgMain }}>
                          {fmtEUR(val)}
                        </span>
                      </div>
                      <RatioBar pct={latest.ca > 0 ? (val / latest.ca) * 100 : 0} color={color} />
                    </div>
                  ))}

                  {latest.ca > 0 && (
                    <>
                      <Sep />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: fgMain }}>EBITDA</span>
                        <div>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: latest.ebitda >= 0 ? accent : danger }}>
                            {fmtEUR(latest.ebitda)}
                          </span>
                          <span style={{ fontSize: 11, color: fgMuted, marginLeft: 6 }}>
                            {latest.ebitdaPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Right: dette → NET DISPO (seulement si CA dispo) */}
                <div>
                  {latest.ca > 0 ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, color: fgMain, marginBottom: 12 }}>
                        EBITDA · {fmtEUR(latest.ebitda)}
                      </div>

                      {(
                        [
                          { label: "Remb. capital", val: latest.remboursementCapital, sub: "16x" },
                          { label: "Intérêts d'emprunt", val: latest.interetsEmprunt, sub: "661x" },
                        ] as const
                      ).map(({ label, val, sub }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                          <span style={{ fontSize: 12, color: fgMuted }}>
                            {label}{" "}
                            <span style={{ fontSize: 10, opacity: 0.6 }}>{sub}</span>
                          </span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: fgMuted }}>
                            − {fmtEUR(val)}
                          </span>
                        </div>
                      ))}

                      <Sep />

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: fgMain }}>NET DISPO</span>
                        <div>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: latest.netDispo >= 0 ? accent : danger }}>
                            {fmtEUR(latest.netDispo)}
                          </span>
                          <span style={{ fontSize: 11, color: fgMuted, marginLeft: 6 }}>
                            {latest.netDispoPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
                        EBITDA = CA − coût matière − masse salariale − charges
                        <br />
                        NET DISPO = EBITDA − remboursement capital − intérêts
                      </div>
                    </>
                  ) : (
                    <>
                      {(
                        [
                          { label: "Remb. capital", val: latest.remboursementCapital, sub: "16x" },
                          { label: "Intérêts d'emprunt", val: latest.interetsEmprunt, sub: "661x" },
                        ] as const
                      ).map(({ label, val, sub }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                          <span style={{ fontSize: 12, color: fgMuted }}>
                            {label}{" "}
                            <span style={{ fontSize: 10, opacity: 0.6 }}>{sub}</span>
                          </span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: fgMuted }}>
                            {fmtEUR(val)}
                          </span>
                        </div>
                      ))}
                      <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                        EBITDA et NET DISPO disponibles dès que le CA APITIC est synchronisé.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(y, mo - 1),
  );
}
