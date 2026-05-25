"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormuleStats, PaymentMethod, PaymentSplit, PeriodSelection, StoreData } from "@/lib/apitic/types";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { GranularityToggle } from "./GranularityToggle";
import { N1Toggle } from "./N1Toggle";
import { SegmentEvolution } from "./SegmentEvolution";
import { FormulesCard } from "./FormulesCard";
import type { AmountMode } from "./AmountModeToggle";
import {
  periodLabelFor,
  periodMetricsForSelection,
  rangeForSelection,
} from "@/lib/metrics";
import { fmtEUR, fmtNum } from "@/lib/format";
import { Card } from "./Card";
import { KPICard } from "./KPICard";
import { BasketBreakdown } from "./BasketBreakdown";
import { LineChart } from "./charts/LineChart";
import { HourlyBars } from "./charts/HourlyBars";
import { TopProducts } from "./TopProducts";
import { PaymentsCard } from "./PaymentsCard";
import { SegmentSplit } from "./SegmentSplit";
import { SegmentFilterInline, useSegmentFilter } from "./SegmentFilter";
import { BootstrapButton } from "./BootstrapButton";
import { FinancialBlock } from "./FinancialBlock";

type Props = {
  store: StoreData;
  period: PeriodSelection;
  today: Date;
  amountMode: AmountMode;
};

function granularityAllowed(period: PeriodSelection): boolean {
  if (period.kind === "month") return true;
  if (period.kind === "fiscal-year-todate") return true;
  if (period.kind === "range") return true;
  if (period.kind === "preset") return period.key === "30d" || period.key === "90d";
  return false;
}

function monthGranularityAllowed(period: PeriodSelection): boolean {
  if (period.kind === "fiscal-year-todate") return true;
  if (period.kind === "preset") return period.key === "90d";
  if (period.kind === "range") return true;
  return false;
}

function defaultGranularity(period: PeriodSelection): Granularity {
  if (period.kind === "fiscal-year-todate") return "month";
  if (period.kind === "preset" && period.key === "90d") return "week";
  return "day";
}

export function StoreView({ store, period, today, amountMode }: Props) {
  const [segmentFilter] = useSegmentFilter();
  const allowWeekly = granularityAllowed(period);
  const allowMonth = monthGranularityAllowed(period);
  const [granularity, setGranularity] = useState<Granularity>(
    defaultGranularity(period),
  );
  useEffect(() => {
    setGranularity(defaultGranularity(period));
  }, [period]);
  const effectiveGranularity: Granularity = allowWeekly
    ? granularity === "month" && !allowMonth
      ? "week"
      : granularity
    : "day";
  const isHT = amountMode === "HT";
  const [showN1, setShowN1] = useState(true);

  const m = useMemo(
    () => periodMetricsForSelection(store.daily, period),
    [store.daily, period],
  );
  const sparkValues = store.daily
    .slice(-14)
    .map((d) => (isHT ? d.caHT ?? 0 : d.ca));
  const periodLabel = periodLabelFor(period);

  const lineData = useMemo(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    return store.daily
      .filter((d) => d.date >= from && d.date <= to)
      .map((d) => ({
        ...d,
        ca: isHT ? d.caHT ?? 0 : d.ca,
      }));
  }, [store.daily, period, isHT]);

  const chartData = useMemo(
    () => maybeBucket(lineData, effectiveGranularity),
    [lineData, effectiveGranularity],
  );
  const yoyChartData = useMemo(() => {
    if (!m.yoyAvailable) return null;
    const days = m.days;
    // Use the same offset as the metrics layer (364 for daily-grain, 365 for
    // monthly/fiscal-year). Computed from the selection kind.
    const offset =
      period.kind === "month" || period.kind === "fiscal-year-todate"
        ? 365
        : 364;
    const start = store.daily.length - days - offset;
    const raw = store.daily.slice(start, start + days).map((d, i) => ({
      date: lineData[i]?.date ?? d.date,
      ca: isHT ? d.caHT ?? 0 : d.ca,
    }));
    return maybeBucket(raw, effectiveGranularity);
  }, [m.yoyAvailable, m.days, store.daily, lineData, effectiveGranularity, isHT, period]);
  // Formule and payment stats computed from the period's daily slice so they
  // react to the date selector instead of always showing "30 derniers jours".
  const periodFormules = useMemo<FormuleStats>(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = store.daily.filter((d) => d.date >= from && d.date <= to && !d.closed);
    return {
      endDate: slice[slice.length - 1]?.date ?? "",
      days: slice.length,
      byKind: {
        grilled: {
          units: slice.reduce((s, d) => s + (d.grilledUnits ?? 0), 0),
          ca: slice.reduce((s, d) => s + (d.grilledCA ?? 0), 0),
          caHT: slice.reduce((s, d) => s + (d.grilledCAHT ?? 0), 0),
        },
        baguette: {
          units: slice.reduce((s, d) => s + (d.baguetteUnits ?? 0), 0),
          ca: slice.reduce((s, d) => s + (d.baguetteCA ?? 0), 0),
          caHT: slice.reduce((s, d) => s + (d.baguetteCAHT ?? 0), 0),
        },
      },
      snackingCA: slice.reduce((s, d) => s + d.snackingCA, 0),
      snackingCAHT: slice.reduce((s, d) => s + (d.snackingCAHT ?? 0), 0),
      snackingTx: slice.reduce((s, d) => s + (d.snackingTx ?? 0), 0),
    };
  }, [store.daily, period]);

  const periodPayments = useMemo<PaymentSplit[]>(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = store.daily.filter((d) => d.date >= from && d.date <= to && !d.closed);
    const totalTTC = slice.reduce((s, d) => s + d.ca, 0);
    const totalHT = slice.reduce((s, d) => s + (d.caHT ?? 0), 0);
    const htRatio = totalTTC > 0 ? totalHT / totalTTC : 1;
    const amounts: Record<PaymentMethod, number> = {
      "Carte bancaire": slice.reduce((s, d) => s + (d.cbAmount ?? 0), 0),
      "Virement": slice.reduce((s, d) => s + (d.virementAmount ?? 0), 0),
      "Espèces": slice.reduce((s, d) => s + (d.especesAmount ?? 0), 0),
      "Tickets resto": slice.reduce((s, d) => s + (d.ticketsRestoAmount ?? 0), 0),
    };
    const total = Object.values(amounts).reduce((s, v) => s + v, 0);
    return (["Carte bancaire", "Virement", "Espèces", "Tickets resto"] as PaymentMethod[]).map(
      (method) => ({
        method,
        share: total > 0 ? amounts[method] / total : 0,
        amount: amounts[method],
        amountHT: amounts[method] * htRatio,
      }),
    );
  }, [store.daily, period]);

  const openedDate = new Date(store.openedDate + "T00:00:00");
  const monthsOpen = Math.round(
    (today.getTime() - openedDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  const openSinceLabel =
    monthsOpen < 12
      ? `Ouvert depuis ${monthsOpen} mois`
      : `Ouvert depuis ${store.opened}`;

  const yoyNote = m.yoyAvailable ? "vs N-1" : "N-1 indisponible";

  const peakHour = store.hourly.reduce(
    (a, b) => (b.ca > a.ca ? b : a),
    store.hourly[0],
  );
  const doneHours = store.hourly.filter((h) => h.done);
  const avgTxPerHour = doneHours.length
    ? Math.round(doneHours.reduce((s, h) => s + h.tx, 0) / doneHours.length)
    : 0;

  return (
    <div className="lm-grid">
      <div className="lm-store-head" style={{ gridColumn: "1 / -1" }}>
        <div>
          <h2 className="lm-store-title">{store.fullName}</h2>
          <div className="lm-store-meta">
            <span>{store.address}</span>
            <span className="lm-dot">·</span>
            <span>{openSinceLabel}</span>
            {!m.yoyAvailable && (
              <>
                <span className="lm-dot">·</span>
                <BootstrapButton storeId={store.id} />
              </>
            )}
          </div>
        </div>
        <div className="lm-store-status">
          <span className="lm-status-dot" />
          <span>Données arrêtées au dernier fiscal jour</span>
        </div>
      </div>

      <div className="lm-kpis">
        <KPICard
          label={"CA " + periodLabel}
          value={fmtEUR(isHT ? m.caHT : m.ca).replace(" €", "")}
          suffix={isHT ? "€ HT" : "€ TTC"}
          delta={m.caDelta}
          yoyDelta={m.yoyAvailable ? m.yoyCaDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          yoyNote={yoyNote}
          spark={sparkValues}
          sparkColor="var(--color-coral)"
          accent
        />
        <KPICard
          label="Transactions"
          value={fmtNum(m.tx)}
          delta={m.txDelta}
          yoyDelta={m.yoyAvailable ? m.yoyTxDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          yoyNote={yoyNote}
          spark={store.daily.slice(-14).map((d) => d.tx)}
        />
        <BasketBreakdown
          global={{ value: isHT ? m.avgTicketHT : m.avgTicket, delta: m.ticketDelta }}
          fromagerie={{
            value: isHT ? m.avgTicketFromagerieHT : m.avgTicketFromagerie,
            delta: m.ticketFromagerieDelta,
          }}
          snacking={{
            value: isHT ? m.avgTicketSnackingHT : m.avgTicketSnacking,
            delta: m.ticketSnackingDelta,
          }}
          suffix={isHT ? "€ HT" : "€ TTC"}
        />
        <KPICard
          label="CA / jour moyen"
          value={fmtEUR(
            m.days ? (isHT ? m.caHT : m.ca) / m.days : 0,
          ).replace(" €", "")}
          suffix={isHT ? "€ HT" : "€ TTC"}
          yoyNote={
            m.days > 1 ? `sur ${m.days} jours de la période` : "période"
          }
        />
      </div>

      <Card
        title="Évolution du chiffre d'affaires"
        subtitle={
          periodLabel +
          (m.yoyAvailable && showN1 ? " · N-1 en pointillé" : "")
        }
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {allowWeekly && (
              <GranularityToggle
                value={granularity}
                onChange={setGranularity}
                allowMonth={allowMonth}
              />
            )}
            <N1Toggle
              value={showN1}
              onChange={setShowN1}
              disabled={!m.yoyAvailable}
            />
          </div>
        }
        span={2}
      >
        <LineChart
          data={chartData}
          series={[
            {
              key: "ca",
              label: `CA ${new Date().getFullYear()}`,
              color: "var(--color-coral)",
            },
          ]}
          yoyData={showN1 ? yoyChartData : null}
          height={280}
          period={period}
          granularity={effectiveGranularity}
        />
      </Card>

      <Card
        title="Affluence intraday"
        subtitle="CA moyen par heure · 30 derniers jours"
      >
        <HourlyBars hourly={store.hourly} height={140} />
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--border-light)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <div>
            <div className="lm-label" style={{ fontSize: 10 }}>
              Pic moyen
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                color: "var(--fg-primary)",
              }}
            >
              {peakHour.hour}h–{peakHour.hour + 1}h
            </div>
          </div>
          <div>
            <div className="lm-label" style={{ fontSize: 10 }}>
              Tx/heure moy.
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 600,
                marginTop: 4,
                color: "var(--fg-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {avgTxPerHour}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Répartition Fromagerie / Snacking"
        subtitle={`${periodLabel} · ${isHT ? "HT" : "TTC"}`}
      >
        <SegmentSplit
          fromagerie={isHT ? m.fromagerieCAHT : m.fromagerieCA}
          snacking={isHT ? m.snackingCAHT : m.snackingCA}
          suffix={isHT ? "€ HT" : "€ TTC"}
        />
      </Card>

      <SegmentEvolution
        daily={store.daily}
        period={period}
        amountMode={amountMode}
        allowWeekly={allowWeekly}
        allowMonth={allowMonth}
        granularity={effectiveGranularity}
        onGranularity={setGranularity}
        yoyAvailable={m.yoyAvailable}
      />

      <Card
        title="Top produits"
        subtitle={`Classement ${isHT ? "HT" : "TTC"} · ${periodLabel}`}
        action={<SegmentFilterInline />}
        span={2}
      >
        <TopProducts
          products={store.topProducts}
          period={period}
          segmentFilter={segmentFilter}
          amountMode={amountMode}
        />
      </Card>

      <Card
        title="Moyens de paiement"
        subtitle={`${periodLabel} · ${isHT ? "HT" : "TTC"}`}
      >
        <PaymentsCard payments={periodPayments} amountMode={amountMode} />
      </Card>

      <Card
        title="Formules lunch"
        subtitle={`${periodLabel} · part du CA et tickets snacking`}
      >
        <FormulesCard formules={periodFormules} amountMode={amountMode} />
      </Card>

      {(store.id === "davso" || store.id === "malmousque") && (
        <FinancialBlock storeId={store.id} daily={store.daily} period={period} />
      )}
    </div>
  );
}
