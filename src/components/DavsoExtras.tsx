"use client";

import { useMemo } from "react";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { rangeForSelection } from "@/lib/metrics";
import { bucketByWeek } from "@/lib/bucketing";
import { useStoreData } from "@/lib/queries";
import { Card } from "./Card";
import { KPICard } from "./KPICard";
import { DualLineChart } from "./charts/DualLineChart";
import { LineChart } from "./charts/LineChart";
import { HBarChart } from "./charts/HBarChart";
import type { AmountMode } from "./AmountModeToggle";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function roll7(arr: (number | null)[]): (number | null)[] {
  return arr.map((_, i) => {
    const win = arr.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v !== null);
    return win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
}

type Props = {
  store: StoreData;
  period: PeriodSelection;
  amountMode: AmountMode;
};

export function DavsoExtras({ store, period, amountMode }: Props) {
  const allStores = useStoreData();
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

  // Compute previous period window
  const periodDays = slice.length || 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -periodDays);
  const prevSlice = useMemo(
    () => store.daily.filter((d) => d.date >= prevFrom && d.date <= prevTo && !d.closed),
    [store.daily, prevFrom, prevTo],
  );

  // ── KPI : Part formules ──────────────────────────────────────────────────
  const formulesCA = useMemo(
    () => slice.reduce((s, d) => s + (isHT ? (d.grilledCAHT ?? 0) + (d.baguetteCAHT ?? 0) : (d.grilledCA ?? 0) + (d.baguetteCA ?? 0)), 0),
    [slice, isHT],
  );
  const snackingCA = useMemo(
    () => slice.reduce((s, d) => s + (isHT ? (d.snackingCAHT ?? 0) : d.snackingCA), 0),
    [slice, isHT],
  );
  const partFormules = snackingCA > 0 ? formulesCA / snackingCA : null;

  const prevFormulasCA = prevSlice.reduce((s, d) => s + (isHT ? (d.grilledCAHT ?? 0) + (d.baguetteCAHT ?? 0) : (d.grilledCA ?? 0) + (d.baguetteCA ?? 0)), 0);
  const prevSnackingCA = prevSlice.reduce((s, d) => s + (isHT ? (d.snackingCAHT ?? 0) : d.snackingCA), 0);
  const prevPartFormules = prevSnackingCA > 0 ? prevFormulasCA / prevSnackingCA : null;
  const partFormulesDelta = partFormules !== null && prevPartFormules !== null && prevPartFormules > 0
    ? (partFormules - prevPartFormules) / prevPartFormules
    : null;

  // ── KPI : Taux tickets mixtes ────────────────────────────────────────────
  const totalTx = slice.reduce((s, d) => s + d.tx, 0);
  const fromTx = slice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const snkTx = slice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  const mixteTx = Math.max(0, fromTx + snkTx - totalTx);
  const hasMixteData = fromTx + snkTx > 0;
  const tauxMixte = hasMixteData && totalTx > 0 ? mixteTx / totalTx : null;

  const prevTotalTx = prevSlice.reduce((s, d) => s + d.tx, 0);
  const prevFromTx = prevSlice.reduce((s, d) => s + (d.fromagerieTx ?? 0), 0);
  const prevSnkTx = prevSlice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
  const prevMixteTx = Math.max(0, prevFromTx + prevSnkTx - prevTotalTx);
  const prevTauxMixte = prevTotalTx > 0 && (prevFromTx + prevSnkTx) > 0 ? prevMixteTx / prevTotalTx : null;
  const mixteDelta = tauxMixte !== null && prevTauxMixte !== null && prevTauxMixte > 0
    ? (tauxMixte - prevTauxMixte) / prevTauxMixte
    : null;

  // ── Chart : Panier × Transactions (7j rolling) ──────────────────────────
  const dynChartData = useMemo(() => {
    const panierRaw = allDays.map((d) =>
      !d.closed && d.tx > 0 ? (isHT ? (d.caHT ?? 0) : d.ca) / d.tx : null,
    );
    const txRaw = allDays.map((d) => (!d.closed && d.tx > 0 ? d.tx : null));
    const panierSmooth = roll7(panierRaw);
    const txSmooth = roll7(txRaw);
    return allDays.map((d, i) => ({
      date: d.date,
      left: panierSmooth[i],
      right: txSmooth[i],
    }));
  }, [allDays, isHT]);

  // ── Chart : Taux tickets mixtes (time series) ────────────────────────────
  const mixteChartData = useMemo(() => {
    if (!hasMixteData) return [];
    const raw = allDays.map((d) => {
      if (d.closed || d.tx === 0) return null;
      const m = Math.max(0, (d.fromagerieTx ?? 0) + (d.snackingTx ?? 0) - d.tx);
      return (m / d.tx) * 100;
    });
    const smoothed = roll7(raw);
    return allDays.map((d, i) => ({
      date: d.date,
      mixte_raw: raw[i],
      mixte: smoothed[i],
    }));
  }, [allDays, hasMixteData]);

  // ── Chart : Part formules hebdo ──────────────────────────────────────────
  const formulesWeekly = useMemo(() => {
    const rows = slice.map((d) => ({
      date: d.date,
      formulesCA: isHT ? (d.grilledCAHT ?? 0) + (d.baguetteCAHT ?? 0) : (d.grilledCA ?? 0) + (d.baguetteCA ?? 0),
      snackingCA: isHT ? (d.snackingCAHT ?? 0) : d.snackingCA,
      snackingTx: d.snackingTx ?? 0,
      formuleTx: (d.grilledUnits ?? 0) + (d.baguetteUnits ?? 0),
    }));
    const weekly = bucketByWeek(rows);
    return weekly.map((w) => ({
      date: w.date,
      left: w.snackingCA > 0 ? (w.formulesCA / w.snackingCA) * 100 : null,
      right: w.snackingTx > 0 ? (w.formuleTx / w.snackingTx) * 100 : null,
    }));
  }, [slice, isHT]);

  // ── Table : Produits en déclin ───────────────────────────────────────────
  const productsDeclin = useMemo(() => {
    return store.topProducts
      .filter((p) => {
        if (!p.units30d || p.units30d < 10) return false;
        return (p.units7d / 7) < (p.units30d / 30) * 0.8;
      })
      .sort((a, b) => (a.units7d / 7) / (a.units30d / 30) - (b.units7d / 7) / (b.units30d / 30))
      .slice(0, 6);
  }, [store.topProducts]);

  // ── CA/h inter-boutiques ─────────────────────────────────────────────────
  const storesCaPerHour = useMemo(() => {
    if (!allStores.data) return [];
    return allStores.data
      .map((s) => {
        const openH = s.hourly.filter((h) => h.ca > 0);
        if (!openH.length) return null;
        const avgDailyCA = s.hourly.reduce((sum, h) => sum + h.ca, 0);
        return { label: s.name, storeId: s.id, value: Math.round(avgDailyCA / openH.length) };
      })
      .filter((x): x is { label: string; storeId: string; value: number } => x !== null)
      .sort((a, b) => b.value - a.value);
  }, [allStores.data]);

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
      {/* ── Séparateur ────────────────────────────────────────────────── */}
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
          Analyses avancées
        </span>
        <span style={{
          fontSize: 11,
          color: "var(--fg-tertiary)",
          fontFamily: "var(--font-body)",
        }}>
          Indicateurs demandés par l'équipe · données APITIC
        </span>
      </div>

      {/* ── Nouveaux KPIs ─────────────────────────────────────────────── */}
      <div style={{
        gridColumn: "1 / -1",
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 12,
      }}>
        {partFormules !== null ? (
          <KPICard
            label="Part formules"
            value={(partFormules * 100).toFixed(1).replace(".", ",")}
            suffix="% du CA snacking"
            delta={partFormulesDelta ?? undefined}
          />
        ) : (
          <div className="lm-card lm-kpi">
            <span className="lm-label">Part formules</span>
            <div style={{ fontSize: 13, color: "var(--fg-tertiary)", marginTop: 12 }}>
              Données de formules insuffisantes
            </div>
          </div>
        )}

        {hasMixteData && tauxMixte !== null ? (
          <KPICard
            label="Taux tickets mixtes"
            value={(tauxMixte * 100).toFixed(1).replace(".", ",")}
            suffix="% des tickets"
            delta={mixteDelta ?? undefined}
            yoyNote="tickets fromagerie + snacking"
          />
        ) : (
          <div className="lm-card lm-kpi">
            <span className="lm-label">Taux tickets mixtes</span>
            <div style={{ fontSize: 13, color: "var(--fg-tertiary)", marginTop: 12 }}>
              Données par segment insuffisantes
            </div>
          </div>
        )}

        {/* Spacer — 3e colonne vide intentionnelle */}
        <div />
      </div>

      {/* ── Dynamique client ──────────────────────────────────────────── */}
      <Card
        title="Panier moyen × Transactions"
        subtitle={`Moyenne lissée 7j · ${isHT ? "HT" : "TTC"} · jours ouverts uniquement`}
        span={2}
      >
        <div style={{
          display: "flex", gap: 16, marginBottom: 10,
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--fg-secondary)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "#8A4A0C", display: "inline-block", borderRadius: 1 }} />
            Panier moyen (axe G)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: "2px dashed #1A5EA8", display: "inline-block" }} />
            Transactions/j (axe D)
          </div>
        </div>
        <DualLineChart
          data={dynChartData}
          leftLabel="Panier moyen"
          rightLabel="Transactions/j"
          leftColor="#8A4A0C"
          rightColor="#1A5EA8"
          leftFormat={(n) => n.toFixed(2).replace(".", ",") + " €"}
          rightFormat={(n) => Math.round(n) + " tx"}
          height={220}
          period={period}
          granularity="day"
        />
        {cle("Si le panier baisse et les transactions montent → montée en volume mais perte de valeur. Si les deux baissent ensemble → signal structurel à traiter en priorité.")}
      </Card>

      {hasMixteData ? (
        <Card
          title="Taux de tickets mixtes"
          subtitle="% tickets avec snacking + fromagerie · moy. 7j glissante"
        >
          <LineChart
            data={mixteChartData}
            series={[
              { key: "mixte_raw", label: "Taux brut", color: "rgba(72,64,168,0.28)" },
              { key: "mixte", label: "Moy. 7j", color: "#4840A8" },
            ]}
            height={220}
            period={period}
            yFormat={(n) => Math.round(n) + "%"}
          />
          {cle("KPI central du concept. En dessous de 15 % → les deux activités coexistent sans se nourrir. Au-dessus de 25 % → le cross-selling fonctionne.")}
        </Card>
      ) : (
        <Card title="Taux de tickets mixtes" subtitle="Indisponible">
          <div style={{ padding: "20px 0", color: "var(--fg-tertiary)", fontSize: 13, fontFamily: "var(--font-body)" }}>
            Les données de tickets par segment ne sont pas disponibles pour cette période.
          </div>
        </Card>
      )}

      {/* ── Part formules hebdo ───────────────────────────────────────── */}
      {formulesWeekly.length >= 3 && (
        <Card
          title="Part des formules lunch"
          subtitle="Évolution hebdomadaire · % CA snacking / % tickets snacking"
          span={2}
        >
          <div style={{
            display: "flex", gap: 16, marginBottom: 10,
            fontFamily: "var(--font-body)", fontSize: 12,
            color: "var(--fg-secondary)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "#0F6E52", display: "inline-block", borderRadius: 1 }} />
              % CA snacking (axe G)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 0, borderTop: "2px dashed #1C1B18", display: "inline-block", opacity: 0.5 }} />
              % tickets snacking (axe D)
            </div>
          </div>
          <DualLineChart
            data={formulesWeekly}
            leftLabel="% CA snacking"
            rightLabel="% tickets snacking"
            leftColor="#0F6E52"
            rightColor="#1C1B18"
            leftFormat={(n) => n.toFixed(1).replace(".", ",") + "%"}
            rightFormat={(n) => n.toFixed(1).replace(".", ",") + "%"}
            height={200}
            period={period}
            granularity="week"
          />
          {cle("Si % CA > % tickets → les formules ont un panier supérieur à la moyenne snacking (bon signe). Une convergence des deux courbes indique une bonne santé du mix.")}
        </Card>
      )}

      {/* ── Produits en déclin ────────────────────────────────────────── */}
      {productsDeclin.length > 0 && (
        <Card title="Produits en déclin" subtitle="Taux de vente 7j vs moyenne 30j · −20 % min.">
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 52px 52px 40px",
              gap: "0 10px",
              padding: "4px 20px 6px",
              borderBottom: "1px solid var(--border-light)",
            }}>
              {["Produit", "7j/j", "30j/j", "↕"].map((h) => (
                <div key={h} style={{
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  color: "var(--fg-tertiary)",
                  textAlign: h === "Produit" ? "left" : "right",
                }}>
                  {h}
                </div>
              ))}
            </div>
            {productsDeclin.map((p, i) => {
              const r30 = p.units30d / 30;
              const r7 = p.units7d / 7;
              const ratio = r30 > 0 ? r7 / r30 : 0;
              return (
                <div key={p.name} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 52px 52px 40px",
                  gap: "0 10px",
                  padding: "10px 20px",
                  borderBottom: i < productsDeclin.length - 1 ? "1px solid var(--border-light)" : "none",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{p.category}</div>
                  </div>
                  <div style={{ fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--fg-secondary)" }}>
                    {r7.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--fg-secondary)" }}>
                    {r30.toFixed(1)}
                  </div>
                  <div style={{
                    fontSize: 13, textAlign: "right", fontWeight: 700,
                    color: ratio < 0.65 ? "var(--color-coral)" : "var(--fg-secondary)",
                  }}>
                    {ratio < 0.65 ? "↓↓" : "↓"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── CA/h inter-boutiques ─────────────────────────────────────── */}
      {storesCaPerHour.length > 0 && (
        <Card
          title="CA par heure d'ouverture effective"
          subtitle="4 boutiques · CA horaire moyen · 30 derniers jours · données APITIC"
          span={3}
        >
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}>
            {storesCaPerHour.map((s, i) => {
              const isCurrentStore = s.storeId === store.id;
              const isTop = i === 0;
              const isBottom = i === storesCaPerHour.length - 1;
              return (
                <div key={s.label} style={{
                  background: isCurrentStore ? "rgba(200,40,26,0.06)" : "var(--bg-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 14px",
                  border: isCurrentStore ? "1px solid rgba(200,40,26,0.2)" : "1px solid var(--border-light)",
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.04em", color: "var(--fg-secondary)", marginBottom: 6,
                  }}>
                    {s.label}
                    {isCurrentStore && (
                      <span style={{ marginLeft: 6, color: "var(--color-coral)", fontWeight: 400 }}>← ici</span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22, fontWeight: 500,
                    color: isTop ? "#226B16" : isBottom ? "#8A4A0C" : "var(--fg-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {s.value}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "var(--fg-tertiary)", marginLeft: 3 }}>€/h</span>
                  </div>
                </div>
              );
            })}
          </div>
          <HBarChart rows={storesCaPerHour} format={(n) => Math.round(n) + " €/h"} />
          {cle("Le CA brut favorise mécaniquement les boutiques aux horaires les plus larges. Le CA/h ouverture effective est le seul indicateur de productivité comparable entre adresses.")}
        </Card>
      )}
    </>
  );
}
