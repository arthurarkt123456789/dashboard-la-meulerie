"use client";

import { useMemo } from "react";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { roll7 } from "@/lib/smoothing";
import { Card } from "./Card";
import { KPICard } from "./KPICard";
import { LineChart } from "./charts/LineChart";
import type { AmountMode } from "./AmountModeToggle";
import { fmtEUR } from "@/lib/format";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Props = {
  store: StoreData;
  period: PeriodSelection;
  amountMode: AmountMode;
};

export function LossesView({ store, period, amountMode }: Props) {
  const isHT = amountMode === "HT";
  const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
  const { from, to } = rangeForSelection(period, todayISO);

  const slice = useMemo(
    () => store.daily.filter((d) => d.date >= from && d.date <= to && !d.closed),
    [store.daily, from, to],
  );

  const allDays = useMemo(
    () => store.daily.filter((d) => d.date >= from && d.date <= to),
    [store.daily, from, to],
  );

  const periodDays = slice.length || 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -periodDays);
  const prevSlice = useMemo(
    () => store.daily.filter((d) => d.date >= prevFrom && d.date <= prevTo && !d.closed),
    [store.daily, prevFrom, prevTo],
  );

  const hasLossData = slice.some((d) => (d.pertesAmount ?? 0) > 0);

  const separator = (
    <div style={{
      gridColumn: "1 / -1",
      display: "flex",
      alignItems: "center",
      gap: 16,
      paddingTop: 28,
      marginTop: 4,
      borderTop: "2px solid var(--fg-primary)",
    }}>
      <span style={{
        fontFamily: "var(--font-display)",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: "var(--fg-primary)",
      }}>
        Suivi des pertes
      </span>
      <span style={{
        fontSize: 11,
        color: "var(--fg-tertiary)",
        fontFamily: "var(--font-body)",
      }}>
        {hasLossData
          ? "Tickets annulés · 90 derniers jours · données APITIC /sales/cancelled"
          : "Données non disponibles pour cette période"}
      </span>
    </div>
  );

  if (!hasLossData) {
    return <>{separator}</>;
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalPertes = slice.reduce(
    (s, d) => s + (isHT ? (d.pertesAmountHT ?? 0) : (d.pertesAmount ?? 0)), 0,
  );
  const totalCA = slice.reduce((s, d) => s + (isHT ? d.caHT : d.ca), 0);
  const tauxPerte = totalCA > 0 ? totalPertes / totalCA : null;
  const totalPertesTx = slice.reduce((s, d) => s + (d.pertesTx ?? 0), 0);
  const totalPertesUnits = slice.reduce((s, d) => s + (d.pertesUnits ?? 0), 0);

  const prevPertes = prevSlice.reduce(
    (s, d) => s + (isHT ? (d.pertesAmountHT ?? 0) : (d.pertesAmount ?? 0)), 0,
  );
  const prevCA = prevSlice.reduce((s, d) => s + (isHT ? d.caHT : d.ca), 0);
  const prevTauxPerte = prevCA > 0 ? prevPertes / prevCA : null;

  const pertesDelta = prevPertes > 0 ? (totalPertes - prevPertes) / prevPertes : null;
  const tauxDelta =
    tauxPerte !== null && prevTauxPerte !== null && prevTauxPerte > 0
      ? (tauxPerte - prevTauxPerte) / prevTauxPerte
      : null;


  // ── Chart : évolution journalière ─────────────────────────────────────────
  const lossChartData = useMemo(() => {
    const raw = allDays.map((d) =>
      d.closed ? null : (isHT ? (d.pertesAmountHT ?? null) : (d.pertesAmount ?? null)),
    );
    const smoothed = roll7(raw);
    return allDays.map((d, i) => ({
      date: d.date,
      pertes_raw: raw[i],
      pertes: smoothed[i],
    }));
  }, [allDays, isHT]);

  // ── Chart : taux de perte quotidien ──────────────────────────────────────
  const tauxChartData = useMemo(() => {
    const raw = allDays.map((d) => {
      if (d.closed || d.ca === 0) return null;
      const pertes = isHT ? (d.pertesAmountHT ?? null) : (d.pertesAmount ?? null);
      const ca = isHT ? d.caHT : d.ca;
      return pertes !== null && ca > 0 ? (pertes / ca) * 100 : null;
    });
    const smoothed = roll7(raw);
    return allDays.map((d, i) => ({
      date: d.date,
      taux_raw: raw[i],
      taux: smoothed[i],
    }));
  }, [allDays, isHT]);

  const cle = (text: string) => (
    <div style={{
      marginTop: 12, paddingTop: 12,
      borderTop: "1px solid var(--border-light)",
      fontSize: 11, color: "var(--fg-tertiary)",
      fontFamily: "var(--font-body)", lineHeight: 1.6,
    }}>
      <strong style={{ color: "var(--fg-secondary)" }}>Clé de lecture : </strong>
      {text}
    </div>
  );

  return (
    <>
      {separator}

      {/* ── KPI cards ──────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: "1 / -1",
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 12,
      }}>
        <KPICard
          label="Pertes totales"
          value={fmtEUR(totalPertes)}
          suffix={isHT ? "HT" : "TTC"}
          delta={pertesDelta ?? undefined}
          deltaLabel="vs. période préc. — ↓ = amélioration"
        />

        {tauxPerte !== null ? (
          <KPICard
            label="Taux de perte"
            value={(tauxPerte * 100).toFixed(2).replace(".", ",")}
            suffix="% du CA"
            delta={tauxDelta ?? undefined}
            deltaLabel="vs. période préc. — ↓ = amélioration"
          />
        ) : (
          <div className="lm-card lm-kpi">
            <span className="lm-label">Taux de perte</span>
            <div style={{ fontSize: 13, color: "var(--fg-tertiary)", marginTop: 12 }}>
              Données insuffisantes
            </div>
          </div>
        )}

        <KPICard
          label="Tickets annulés"
          value={String(totalPertesTx)}
          suffix={`tickets · ${totalPertesUnits} lignes`}
        />
      </div>

      {/* ── Chart : montant journalier ──────────────────────────────────── */}
      <Card
        title="Évolution des pertes"
        subtitle={`Montant journalier · moyenne lissée 7j · ${isHT ? "HT" : "TTC"}`}
        span={2}
      >
        <div style={{
          display: "flex", gap: 16, marginBottom: 10,
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--fg-secondary)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "rgba(212,130,10,0.4)", display: "inline-block", borderRadius: 1 }} />
            Pertes brutes/j
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "#D4820A", display: "inline-block", borderRadius: 1 }} />
            Moyenne 7j
          </div>
        </div>
        <LineChart
          data={lossChartData}
          series={[
            { key: "pertes_raw", label: "Pertes brutes/j", color: "rgba(212,130,10,0.35)" },
            { key: "pertes", label: "Moy. 7j", color: "#D4820A" },
          ]}
          height={220}
          period={period}
          yFormat={(n) => Math.round(n) + " €"}
        />
        {cle("Une hausse durable de la moy. 7j signale un problème de gestion des stocks ou de traçabilité. Surveiller les pics du lundi (invendus du weekend, surtout fromagerie).")}
      </Card>

      {/* ── Chart : taux de perte ────────────────────────────────────────── */}
      <Card
        title="Taux de perte quotidien"
        subtitle="% pertes / CA · moyenne glissante 7j"
      >
        <LineChart
          data={tauxChartData}
          series={[
            { key: "taux_raw", label: "Taux brut", color: "rgba(225,29,72,0.25)" },
            { key: "taux", label: "Moy. 7j", color: "#E11D48" },
          ]}
          height={220}
          period={period}
          yFormat={(n) => n.toFixed(2).replace(".", ",") + "%"}
        />
        {cle("Objectif < 2 % du CA. Au-delà de 3 % → audit de la chaîne d'approvisionnement recommandé.")}
      </Card>

    </>
  );
}
