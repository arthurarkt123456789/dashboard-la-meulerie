"use client";

import { useQuery } from "@tanstack/react-query";
import type { PeriodSelection } from "@/lib/apitic/types";
import { fmtEUR } from "@/lib/format";

type FinancialData = {
  period: { start: string; end: string };
  coutMatiere: number;
  masseSalariale: number;
  chargesExploitation: number;
  remboursementCapital: number;
  interetsEmprunt: number;
  ebitda: number;
  netDispo: number;
  periodLabel: string;
  fallback: boolean;
};

type Props = {
  storeId: string;
  period: PeriodSelection;
  caTTC: number; // CA for the selected period, from APITIC
};

function periodToParams(period: PeriodSelection): Record<string, string> {
  if (period.kind === "preset") return { kind: "preset", key: period.key };
  if (period.kind === "month") return { kind: "month", year: String(period.year), month: String(period.month) };
  if (period.kind === "range") return { kind: "range", from: period.from, to: period.to };
  if (period.kind === "fiscal-year-todate") return { kind: "fiscal-year-todate" };
  return { kind: "preset", key: "30d" };
}

function Row({
  label,
  value,
  sub,
  bold,
  color,
  indent,
}: {
  label: string;
  value: number;
  sub?: string;
  bold?: boolean;
  color?: string;
  indent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        paddingLeft: indent ? 14 : 0,
      }}
    >
      <div>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: bold ? 13 : 12,
            fontWeight: bold ? 600 : 400,
            color: color ?? "var(--fg-primary)",
          }}
        >
          {label}
        </span>
        {sub && (
          <span style={{ fontSize: 10, color: "var(--fg-tertiary)", marginLeft: 6 }}>
            {sub}
          </span>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 700 : 500,
          color: color ?? "var(--fg-primary)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {fmtEUR(value)}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />;
}

export function FinancialBlock({ storeId, period, caTTC }: Props) {
  const params = periodToParams(period);
  const qs = new URLSearchParams({ storeId, ca: String(Math.round(caTTC)), ...params });

  const { data, isLoading, error } = useQuery<FinancialData>({
    queryKey: ["financial", storeId, qs.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/financial?${qs}`);
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const bgColor = "#1a2332";
  const fgMuted = "rgba(255,255,255,0.55)";
  const fgMain = "#f0f4f8";
  const accent = "#4ade80";   // vert pour NET DISPO positif
  const danger = "#f87171";   // rouge si négatif

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        background: bgColor,
        borderRadius: "var(--radius-lg, 12px)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
            Données financières
          </div>
          {data && (
            <div style={{ fontSize: 11, color: fgMuted, marginTop: 2 }}>
              {data.periodLabel}
              {data.fallback && (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>
                  · données comptables non disponibles pour la période courte sélectionnée
                </span>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: fgMuted,
            background: "rgba(255,255,255,0.07)",
            padding: "3px 8px",
            borderRadius: 4,
          }}
        >
          Pennylane
        </div>
      </div>

      {isLoading && (
        <div style={{ color: fgMuted, fontSize: 13, fontFamily: "var(--font-body)" }}>
          Chargement…
        </div>
      )}

      {error && (
        <div style={{ color: danger, fontSize: 12, fontFamily: "var(--font-body)" }}>
          {(error as Error).message.includes("No Pennylane config")
            ? "Intégration Pennylane non configurée pour ce magasin."
            : `Erreur Pennylane : ${(error as Error).message}`}
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 40px" }}>
          {/* Left column: P&L waterfall */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row label="Chiffre d'affaires" value={caTTC} bold color={fgMain} />
            <Divider />
            <Row label="Coût matière" value={-data.coutMatiere} indent color={fgMuted} sub="60x" />
            <Row label="Masse salariale" value={-data.masseSalariale} indent color={fgMuted} sub="64x" />
            <Row label="Charges d'exploitation" value={-data.chargesExploitation} indent color={fgMuted} sub="61-63x" />
            <Divider />
            <Row
              label="EBITDA"
              value={data.ebitda}
              bold
              color={data.ebitda >= 0 ? fgMain : danger}
            />
          </div>

          {/* Right column: debt service → NET DISPO */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row label="EBITDA" value={data.ebitda} bold color={fgMain} />
            <Divider />
            <Row label="Remboursement capital" value={-data.remboursementCapital} indent color={fgMuted} sub="16x" />
            <Row label="Intérêts d'emprunt" value={-data.interetsEmprunt} indent color={fgMuted} sub="661x" />
            <Divider />
            <Row
              label="NET DISPO"
              value={data.netDispo}
              bold
              color={data.netDispo >= 0 ? accent : danger}
            />
          </div>
        </div>
      )}
    </div>
  );
}
