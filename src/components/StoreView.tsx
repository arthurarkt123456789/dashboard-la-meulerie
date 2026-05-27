"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormuleStats, PaymentMethod, PaymentSplit, PeriodSelection, StoreData } from "@/lib/apitic/types";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { GranularityToggle } from "./GranularityToggle";
import { N1Toggle } from "./N1Toggle";
import { StackedCategoryChart } from "./charts/StackedCategoryChart";
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
import { MarginBreakdown } from "./MarginBreakdown";
import { LineChart } from "./charts/LineChart";
import { HourlyBars } from "./charts/HourlyBars";
import { TopProducts } from "./TopProducts";
import { PaymentsCard } from "./PaymentsCard";
import { SegmentSplit } from "./SegmentSplit";
import { CategorySplit } from "./CategorySplit";
import { SegmentFilterInline, useSegmentFilter } from "./SegmentFilter";
import { BootstrapButton } from "./BootstrapButton";
import { FinancialBlock } from "./FinancialBlock";
import { DavsoExtras } from "./DavsoExtras";
import { WeekdayChart } from "./WeekdayChart";
import { useStoreData } from "@/lib/queries";
import { roll7 } from "@/lib/smoothing";

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
  const [smoothCA, setSmoothCA] = useState(false);

  const m = useMemo(
    () => periodMetricsForSelection(store.daily, period),
    [store.daily, period],
  );
  const sparkValues = useMemo(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = store.daily.filter((d) => d.date >= from && d.date <= to);
    if (period.kind === "fiscal-year-todate") {
      const byMonth = new Map<string, number>();
      for (const d of slice) {
        const k = d.date.slice(0, 7);
        byMonth.set(k, (byMonth.get(k) ?? 0) + (isHT ? d.caHT ?? 0 : d.ca));
      }
      return Array.from(byMonth.values());
    }
    if (period.kind === "preset" && period.key === "90d") {
      const byWeek = new Map<string, number>();
      for (const d of slice) {
        const dt = new Date(`${d.date}T00:00:00Z`);
        const dow = dt.getUTCDay();
        dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
        const k = dt.toISOString().slice(0, 10);
        byWeek.set(k, (byWeek.get(k) ?? 0) + (isHT ? d.caHT ?? 0 : d.ca));
      }
      return Array.from(byWeek.values());
    }
    return slice.map((d) => (isHT ? d.caHT ?? 0 : d.ca));
  }, [store.daily, period, isHT]);

  const txSparkValues = useMemo(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = store.daily.filter((d) => d.date >= from && d.date <= to);
    if (period.kind === "fiscal-year-todate") {
      const byMonth = new Map<string, number>();
      for (const d of slice) {
        const k = d.date.slice(0, 7);
        byMonth.set(k, (byMonth.get(k) ?? 0) + d.tx);
      }
      return Array.from(byMonth.values());
    }
    if (period.kind === "preset" && period.key === "90d") {
      const byWeek = new Map<string, number>();
      for (const d of slice) {
        const dt = new Date(`${d.date}T00:00:00Z`);
        const dow = dt.getUTCDay();
        dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
        const k = dt.toISOString().slice(0, 10);
        byWeek.set(k, (byWeek.get(k) ?? 0) + d.tx);
      }
      return Array.from(byWeek.values());
    }
    return slice.map((d) => d.tx);
  }, [store.daily, period]);
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

  const chartData = useMemo(() => {
    const bucketed = maybeBucket(lineData, effectiveGranularity);
    if (!smoothCA || effectiveGranularity !== "day") return bucketed;
    const smoothed = roll7(bucketed.map((d) => (typeof d.ca === "number" ? d.ca : null)));
    return bucketed.map((d, i) => ({ ...d, ca: smoothed[i] }));
  }, [lineData, effectiveGranularity, smoothCA]);

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
    const bucketed = maybeBucket(raw, effectiveGranularity);
    if (!smoothCA || effectiveGranularity !== "day") return bucketed;
    const smoothed = roll7(bucketed.map((d) => d.ca ?? null));
    return bucketed.map((d, i) => ({ ...d, ca: smoothed[i] ?? 0 }));
  }, [m.yoyAvailable, m.days, store.daily, lineData, effectiveGranularity, isHT, period, smoothCA]);
  // Shared daily slice for the selected period — reused by formules, payments, and charts.
  const periodSlice = useMemo(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    return store.daily.filter((d) => d.date >= from && d.date <= to && !d.closed);
  }, [store.daily, period]);

  const periodFormules = useMemo<FormuleStats>(() => {
    const slice = periodSlice;
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
  }, [periodSlice]);

  const periodPayments = useMemo<PaymentSplit[]>(() => {
    const slice = periodSlice;
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
  }, [periodSlice]);



  const peakHour = store.hourly.reduce(
    (a, b) => (b.ca > a.ca ? b : a),
    store.hourly[0],
  );
  const doneHours = store.hourly.filter((h) => h.done);
  const avgTxPerHour = doneHours.length
    ? Math.round(doneHours.reduce((s, h) => s + h.tx, 0) / doneHours.length)
    : 0;

  // ── Network comparison & advanced KPI metrics ──────────────────────────
  const allStores = useStoreData();

  const networkComparisons = useMemo(() => {
    const empty = { caPerDay: null, totalCA: null, totalTx: null, avgBasket: null, caRank: null, txRank: null };
    if (!allStores.data?.length) return empty;
    const todayISO2 = store.daily[store.daily.length - 1]?.date ?? "";
    const { from: f, to: t } = rangeForSelection(period, todayISO2);
    const caVals: number[] = [];
    const basketVals: number[] = [];
    let sumCA = 0;
    let sumTx = 0;
    const storeCAs: { id: string; ca: number }[] = [];
    const storeTxs: { id: string; tx: number }[] = [];
    for (const s of allStores.data) {
      const sl = s.daily.filter((d) => d.date >= f && d.date <= t && !d.closed);
      if (!sl.length) continue;
      const ca = isHT ? sl.reduce((a, d) => a + (d.caHT ?? 0), 0) : sl.reduce((a, d) => a + d.ca, 0);
      const tx = sl.reduce((a, d) => a + d.tx, 0);
      sumCA += ca;
      sumTx += tx;
      caVals.push(ca / sl.length);
      storeCAs.push({ id: s.id, ca });
      storeTxs.push({ id: s.id, tx });
      if (tx > 0) basketVals.push(ca / tx);
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const sortedCA = [...storeCAs].sort((a, b) => b.ca - a.ca);
    const sortedTx = [...storeTxs].sort((a, b) => b.tx - a.tx);
    const caRankIdx = sortedCA.findIndex((x) => x.id === store.id);
    const txRankIdx = sortedTx.findIndex((x) => x.id === store.id);
    return {
      caPerDay: avg(caVals),
      totalCA: sumCA || null,
      totalTx: sumTx || null,
      avgBasket: avg(basketVals),
      caRank: caRankIdx >= 0 ? caRankIdx + 1 : null,
      txRank: txRankIdx >= 0 ? txRankIdx + 1 : null,
    };
  }, [allStores.data, store.daily, store.id, period, isHT]);

  const networkAvgCaPerDay = networkComparisons.caPerDay;

  const stdDev = useMemo(() => {
    const todayISO2 = store.daily[store.daily.length - 1]?.date ?? "";
    const { from: f, to: t } = rangeForSelection(period, todayISO2);
    const openDays = store.daily.filter(
      (d) => d.date >= f && d.date <= t && !d.closed && d.tx > 0,
    );
    if (openDays.length < 2) return null;
    const vals = openDays.map((d) => (isHT ? (d.avgTicketHT ?? 0) : d.avgTicket));
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
  }, [store.daily, period, isHT]);

  const epicerieCAShare = useMemo(() => {
    const totalCA = isHT ? m.caHT : m.ca;
    const epicerieCA = isHT ? m.epicerieCAHT : m.epicerieCA;
    if (!totalCA || !epicerieCA) return null;
    return epicerieCA / totalCA;
  }, [m, isHT]);

  const trendComparison = useMemo(() => {
    const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
    const openCaPerDay = (slice: typeof store.daily) => {
      const open = slice.filter((d) => !d.closed && d.tx > 0);
      return open.length ? open.reduce((s, d) => s + (isHT ? d.caHT ?? 0 : d.ca), 0) / open.length : 0;
    };
    const openTxPerDay = (slice: typeof store.daily) => {
      const open = slice.filter((d) => !d.closed && d.tx > 0);
      return open.length ? open.reduce((s, d) => s + d.tx, 0) / open.length : 0;
    };

    let trendLabel = "";
    let refCaPerDay = 0;
    let refTxPerDay = 0;

    if (period.kind === "preset") {
      const refDays = period.key === "7d" ? 30 : period.key === "30d" ? 90 : 365;
      const labels: Record<string, string> = { "7d": "vs. moy. 30j", "30d": "vs. moy. 90j", "90d": "vs. moy. 12 mois" };
      trendLabel = labels[period.key] ?? "";
      const refSlice = store.daily.slice(-refDays);
      refCaPerDay = openCaPerDay(refSlice);
      refTxPerDay = openTxPerDay(refSlice);
    } else if (period.kind === "month") {
      trendLabel = "vs. moy. 90j";
      const refSlice = store.daily.slice(-90);
      refCaPerDay = openCaPerDay(refSlice);
      refTxPerDay = openTxPerDay(refSlice);
    } else if (period.kind === "fiscal-year-todate") {
      trendLabel = "vs. exercice préc.";
      const { from } = rangeForSelection(period, todayISO);
      const fyYear = parseInt(from.slice(0, 4));
      const prevFyFrom = `${fyYear - 1}-10-01`;
      const prevFyTo = `${fyYear}-09-30`;
      const refSlice = store.daily.filter((d) => d.date >= prevFyFrom && d.date <= prevFyTo);
      refCaPerDay = openCaPerDay(refSlice);
      refTxPerDay = openTxPerDay(refSlice);
    }

    const curOpen = m.slice.filter((d) => !d.closed && d.tx > 0);
    const curCaPerDay = curOpen.length ? (isHT ? m.caHT : m.ca) / curOpen.length : 0;
    const curTxPerDay = curOpen.length ? m.tx / curOpen.length : 0;

    return {
      caTrendDelta: refCaPerDay ? (curCaPerDay - refCaPerDay) / refCaPerDay : null,
      txTrendDelta: refTxPerDay ? (curTxPerDay - refTxPerDay) / refTxPerDay : null,
      trendLabel,
    };
  }, [store.daily, period, isHT, m]);

  const segmentShares = useMemo(() => {
    const totalCA = isHT ? m.caHT : m.ca;
    if (!totalCA) return [];
    return [
      { label: "Fromage.", color: "var(--color-dark)", share: (isHT ? m.fromagerieCAHT : m.fromagerieCA) / totalCA },
      { label: "Snacking", color: "var(--color-coral)", share: (isHT ? m.snackingCAHT ?? 0 : m.snackingCA) / totalCA },
      { label: "Épicerie", color: "#1A5EA8", share: (isHT ? m.epicerieCAHT ?? 0 : m.epicerieCA) / totalCA },
      { label: "Merch", color: "#7C3AED", share: (isHT ? m.merchCAHT ?? 0 : m.merchCA) / totalCA },
    ].filter((s) => s.share > 0);
  }, [m, isHT]);

  const caPerDay = m.days > 0 ? (isHT ? m.caHT : m.ca) / m.days : 0;
  const networkRefDelta =
    networkAvgCaPerDay && networkAvgCaPerDay > 0
      ? (caPerDay - networkAvgCaPerDay) / networkAvgCaPerDay
      : null;
  const networkRefStr = networkAvgCaPerDay
    ? fmtEUR(networkAvgCaPerDay).replace(" €", "") + (isHT ? " €HT" : " €TTC")
    : undefined;

  const txSegmentShares = useMemo(() => {
    const totalTx = m.tx;
    if (!totalTx) return [];
    return [
      { label: "Fromage.", color: "var(--color-dark)", share: m.fromagerieTx / totalTx },
      { label: "Snacking", color: "var(--color-coral)", share: m.snackingTx / totalTx },
      { label: "Épicerie", color: "#1A5EA8", share: m.epicerieTx / totalTx },
      { label: "Merch", color: "#7C3AED", share: m.merchTx / totalTx },
    ].filter((s) => s.share > 0);
  }, [m]);

  // Part réseau: this store's share of total network CA / Tx
  const caNetworkShare = networkComparisons.totalCA
    ? (isHT ? m.caHT : m.ca) / networkComparisons.totalCA
    : null;
  const txNetworkShare = networkComparisons.totalTx ? m.tx / networkComparisons.totalTx : null;
  // Basket vs réseau: absolute difference
  const networkBasketAbsolute = networkComparisons.avgBasket
    ? (isHT ? m.avgTicketHT : m.avgTicket) - networkComparisons.avgBasket
    : null;

  return (
    <div className="lm-grid">
      <div className="lm-store-head" style={{ gridColumn: "1 / -1" }}>
        <div>
          <h2 className="lm-store-title">{store.fullName}</h2>
          <div className="lm-store-meta">
            <span>{store.address}</span>
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
          spark={sparkValues}
          sparkColor="var(--color-coral)"
          trendDelta={trendComparison.caTrendDelta}
          trendLabel={trendComparison.trendLabel}
          networkShare={caNetworkShare}
          networkRank={networkComparisons.caRank}
          accent
        />
        <KPICard
          label="Transactions / jour"
          value={fmtNum(m.days > 0 ? Math.round(m.tx / m.days) : m.tx)}
          subValue={m.days > 1 ? `${fmtNum(m.tx)} tx au total` : undefined}
          delta={m.txDelta}
          yoyDelta={m.yoyAvailable ? m.yoyTxDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          spark={txSparkValues}
          trendDelta={trendComparison.txTrendDelta}
          trendLabel={trendComparison.trendLabel}
          networkShare={txNetworkShare}
          networkRank={networkComparisons.txRank}
        />
        <BasketBreakdown
          global={{
            value: isHT ? m.avgTicketHT : m.avgTicket,
            delta: m.ticketDelta,
            yoyDelta: m.yoyAvailable ? m.yoyTicketDelta : null,
          }}
          fromagerie={{
            value: isHT ? m.avgTicketFromagerieHT : m.avgTicketFromagerie,
            delta: m.ticketFromagerieDelta,
          }}
          snacking={{
            value: isHT ? m.avgTicketSnackingHT : m.avgTicketSnacking,
            delta: m.ticketSnackingDelta,
          }}
          epicerie={{
            value: isHT ? m.avgTicketEpicerieHT : m.avgTicketEpicerie,
            delta: m.ticketEpicerieDelta,
          }}
          epicerieCAShare={epicerieCAShare}
          merch={{
            value: isHT ? m.avgTicketMerchHT : m.avgTicketMerch,
            delta: m.ticketMerchDelta,
          }}
          stdDev={stdDev}
          yoyAvailable={m.yoyAvailable}
          suffix={isHT ? "€ HT" : "€ TTC"}
          networkBasketAbsolute={networkBasketAbsolute}
        />
        <MarginBreakdown
          margeHT={m.margeHT}
          margeCoveredCAHT={m.margeCoveredCAHT}
          caHT={m.caHT}
          margeFromagerieHT={m.margeFromagerieHT}
          margeSnackingHT={m.margeSnackingHT}
          margeEpicerieHT={m.margeEpicerieHT}
          margeMerchHT={m.margeMerchHT}
          margeCoveredFromagerieCAHT={m.margeCoveredFromagerieCAHT}
          margeCoveredSnackingCAHT={m.margeCoveredSnackingCAHT}
          margeCoveredEpicerieCAHT={m.margeCoveredEpicerieCAHT}
          margeCoveredMerchCAHT={m.margeCoveredMerchCAHT}
          margeDelta={m.margeDelta}
          yoyMargeDelta={m.yoyAvailable ? m.yoyMargeDelta : null}
          yoyAvailable={m.yoyAvailable}
        />
        <KPICard
          label="CA / jour moyen"
          value={fmtEUR(caPerDay).replace(" €", "")}
          suffix={isHT ? "€ HT" : "€ TTC"}
          delta={m.caDelta}
          yoyDelta={m.yoyAvailable ? m.yoyCaDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          spark={sparkValues}
          sparkRefLine={networkAvgCaPerDay ?? undefined}
          networkRef={networkRefStr}
          networkRefDelta={networkRefDelta}
          trendDelta={trendComparison.caTrendDelta}
          trendLabel={trendComparison.trendLabel}
          segments={segmentShares}
          subValue={m.days > 1 ? `sur ${m.days} jours` : undefined}
        />
      </div>

      <Card
        title="Évolution du chiffre d'affaires"
        subtitle={
          periodLabel +
          (m.yoyAvailable && showN1 ? " · N-1 en pointillé" : "") +
          (smoothCA && effectiveGranularity === "day" ? " · moy. 7j" : "")
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
            <button
              className={"lm-seg-btn" + (smoothCA ? " active" : "")}
              style={{ fontSize: 11, padding: "2px 8px", lineHeight: "20px" }}
              onClick={() => setSmoothCA((v) => !v)}
              title="Moyenne glissante 7 jours"
            >
              ~7j
            </button>
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
        subtitle="CA moyen (€) par tranche horaire · 30 derniers jours"
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
              Tx moy./heure
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
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--fg-tertiary)", marginLeft: 3 }}>tx</span>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Répartition des catégories"
        subtitle={`${periodLabel} · ${isHT ? "HT" : "TTC"}`}
      >
        {(() => {
          const totalCA = isHT ? m.caHT : m.ca;
          const caSegs = [
            { label: "Fromagerie", color: "var(--color-dark)", value: isHT ? m.fromagerieCAHT : m.fromagerieCA, share: totalCA ? (isHT ? m.fromagerieCAHT : m.fromagerieCA) / totalCA : 0 },
            { label: "Snacking",   color: "var(--color-coral)", value: isHT ? m.snackingCAHT ?? 0 : m.snackingCA, share: totalCA ? (isHT ? m.snackingCAHT ?? 0 : m.snackingCA) / totalCA : 0 },
            { label: "Épicerie",   color: "#1A5EA8", value: isHT ? m.epicerieCAHT ?? 0 : m.epicerieCA, share: totalCA ? (isHT ? m.epicerieCAHT ?? 0 : m.epicerieCA) / totalCA : 0 },
            { label: "Merch",      color: "#7C3AED", value: isHT ? m.merchCAHT ?? 0 : m.merchCA, share: totalCA ? (isHT ? m.merchCAHT ?? 0 : m.merchCA) / totalCA : 0 },
          ];
          const txSegs = [
            { label: "Fromagerie", color: "var(--color-dark)", value: m.days > 0 ? m.fromagerieTx / m.days : 0, share: m.tx ? m.fromagerieTx / m.tx : 0 },
            { label: "Snacking",   color: "var(--color-coral)", value: m.days > 0 ? m.snackingTx / m.days : 0, share: m.tx ? m.snackingTx / m.tx : 0 },
            { label: "Épicerie",   color: "#1A5EA8", value: m.days > 0 ? m.epicerieTx / m.days : 0, share: m.tx ? m.epicerieTx / m.tx : 0 },
            { label: "Merch",      color: "#7C3AED", value: m.days > 0 ? m.merchTx / m.days : 0, share: m.tx ? m.merchTx / m.tx : 0 },
          ];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <CategorySplit
                title="Chiffre d'affaires"
                segments={caSegs}
                formatValue={(v) => {
                  if (v >= 1000) return (v / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " k€";
                  return Math.round(v) + " €";
                }}
                shareLabel="du CA"
              />
              <div style={{ borderTop: "1px solid var(--border-light)" }} />
              <CategorySplit
                title="Transactions / jour"
                segments={txSegs}
                formatValue={(v) => (Math.round(v * 10) / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                shareLabel="des tx"
              />
            </div>
          );
        })()}
      </Card>

      <Card
        title="CA & transactions par jour de la semaine"
        subtitle={`Moyenne sur la période · ${isHT ? "HT" : "TTC"} · Fromagerie / Snacking / Épicerie`}
        span={2}
      >
        <WeekdayChart daily={store.daily} period={period} isHT={isHT} height={220} />
      </Card>

      <Card title="CA par catégories" subtitle={`${isHT ? "HT" : "TTC"} · barres journalières · moyenne 7 jours`} span={3}>
        <StackedCategoryChart daily={periodSlice} period={period} isHT={isHT} height={300} />
      </Card>

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
        title="Formules lunch"
        subtitle={`${periodLabel} · part du CA et tickets snacking`}
      >
        <FormulesCard
          formules={periodFormules}
          amountMode={amountMode}
          daily={periodSlice}
          period={period}
        />
      </Card>

      <Card
        title="Moyens de paiement"
        subtitle={`${periodLabel} · ${isHT ? "HT" : "TTC"}`}
        span={3}
      >
        <PaymentsCard
          payments={periodPayments}
          amountMode={amountMode}
          daily={periodSlice}
          period={period}
        />
      </Card>

      {(store.id === "davso" || store.id === "malmousque" || store.id === "endoume" || store.id === "republique") && (
        <FinancialBlock storeId={store.id} daily={store.daily} period={period} openedDate={store.openedDate} />
      )}

      {store.id === "davso" && (
        <DavsoExtras store={store} period={period} amountMode={amountMode} />
      )}
    </div>
  );
}
