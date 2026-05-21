"use client";

import { useEffect, useMemo, useState } from "react";
import { maybeBucket, type Granularity } from "@/lib/bucketing";
import { GranularityToggle } from "./GranularityToggle";
import { N1Toggle } from "./N1Toggle";
import type { AmountMode } from "./AmountModeToggle";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import {
  consolidateDaily,
  consolidatePayments,
  consolidateProducts,
  consolidatedPeriodMetricsForSelection,
  periodLabelFor,
  periodMetricsForSelection,
  rangeForSelection,
} from "@/lib/metrics";
import {
  fmtEUR,
  fmtEURshort,
  fmtNum,
  fmtPctNoSign,
} from "@/lib/format";
import { Card } from "./Card";
import { KPICard } from "./KPICard";
import { BasketBreakdown } from "./BasketBreakdown";
import { ScopeNote } from "./ScopeNote";
import { LineChart, type LineSeries } from "./charts/LineChart";
import { HBarChart } from "./charts/HBarChart";
import { TopProducts } from "./TopProducts";
import { PaymentsCard } from "./PaymentsCard";
import { SegmentSplit } from "./SegmentSplit";
import { LegendInline } from "./LegendInline";
import { SegmentFilterInline, useSegmentFilter } from "./SegmentFilter";

const SERIES_COLORS = [
  "var(--color-coral)",
  "var(--color-dark)",
  "#666660",
  "#A8A8A6",
];

function granularityAllowed(period: PeriodSelection): boolean {
  if (period.kind === "month") return true;
  if (period.kind === "fiscal-year-todate") return true;
  if (period.kind === "range") return true;
  if (period.kind === "preset") return period.key === "30d" || period.key === "90d";
  return false;
}

function monthGranularityAllowed(period: PeriodSelection): boolean {
  // Month bucketing only makes sense when the period spans >~60 days.
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

type Props = {
  stores: StoreData[];
  period: PeriodSelection;
  amountMode: AmountMode;
};

export function ConsolidatedView({ stores, period, amountMode }: Props) {
  const [segmentFilter] = useSegmentFilter();
  const allowWeekly = granularityAllowed(period);
  const allowMonth = monthGranularityAllowed(period);
  const [granularity, setGranularity] = useState<Granularity>(
    defaultGranularity(period),
  );
  // Re-snap granularity when the period changes (e.g. switching to Exercice).
  useEffect(() => {
    setGranularity(defaultGranularity(period));
  }, [period]);
  // If the user changes to a period where their granularity isn't allowed,
  // fall back to "day".
  const effectiveGranularity: Granularity = allowWeekly
    ? granularity === "month" && !allowMonth
      ? "week"
      : granularity
    : "day";
  const isHT = amountMode === "HT";
  const [showN1, setShowN1] = useState(false);

  const view = useMemo(() => {
    const consolidatedDaily = consolidateDaily(stores.map((s) => s.daily));
    const consolidatedProducts = consolidateProducts(
      stores.map((s) => s.topProducts),
    );
    const consolidatedPayments = consolidatePayments(
      stores.map((s) => ({ daily: s.daily, payments: s.payments })),
    );
    const m = consolidatedPeriodMetricsForSelection(
      consolidatedDaily,
      stores.map((s) => ({ store: s, daily: s.daily })),
      period,
    );
    return { consolidatedDaily, consolidatedProducts, consolidatedPayments, m };
  }, [stores, period]);

  const { consolidatedDaily, consolidatedProducts, consolidatedPayments, m } = view;
  const sparkValues = consolidatedDaily
    .slice(-14)
    .map((d) => (isHT ? d.caHT ?? 0 : d.ca));

  const storeMetrics = useMemo(() => {
    return stores
      .map((s) => {
        const ms = periodMetricsForSelection(s.daily, period);
        const value = isHT ? ms.caHT : ms.ca;
        const yoyValue = isHT ? ms.yoyCaHT : ms.yoyCa;
        return {
          label: s.name,
          value,
          ticket: isHT ? ms.avgTicketHT : ms.avgTicket,
          delta: ms.caDelta,
          yoyValue: ms.yoyAvailable ? yoyValue : null,
          yoyDelta: ms.yoyAvailable ? ms.yoyCaDelta : null,
          yoyAvailable: ms.yoyAvailable,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [stores, period, isHT]);

  const yoyOffsetDays =
    period.kind === "month" || period.kind === "fiscal-year-todate" ? 365 : 364;

  const lineSeries: LineSeries[] = useMemo(() => {
    const base: LineSeries[] = stores.map((s, i) => ({
      key: s.id,
      label: s.name,
      color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
    }));
    if (!showN1) return base;
    const dashed: LineSeries[] = stores.map((s, i) => ({
      key: s.id + "__yoy",
      label: s.name + " N-1",
      color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
      dashed: true,
    }));
    return [...base, ...dashed];
  }, [stores, showN1]);

  const lineData = useMemo(() => {
    const todayISO =
      consolidatedDaily[consolidatedDaily.length - 1]?.date ?? "";
    const { from, to } = rangeForSelection(period, todayISO);
    const slice = consolidatedDaily.filter(
      (d) => d.date >= from && d.date <= to,
    );

    function subtractDaysISO(iso: string, days: number): string {
      const dd = new Date(`${iso}T00:00:00Z`);
      dd.setUTCDate(dd.getUTCDate() - days);
      return dd.toISOString().slice(0, 10);
    }

    return slice.map((d) => {
      const row: {
        date: string;
        partial?: boolean;
        [k: string]: string | number | boolean | null | undefined;
      } = {
        date: d.date,
        partial: d.partial,
      };
      for (const s of stores) {
        const day = s.daily.find((dd) => dd.date === d.date);
        if (!day || day.closed) {
          row[s.id] = null;
        } else {
          row[s.id] = isHT ? (day.caHT ?? 0) : day.ca;
        }
        if (showN1) {
          const yoyDate = subtractDaysISO(d.date, yoyOffsetDays);
          const yoyDay = s.daily.find((dd) => dd.date === yoyDate);
          row[s.id + "__yoy"] =
            yoyDay && !yoyDay.closed
              ? isHT
                ? yoyDay.caHT ?? 0
                : yoyDay.ca
              : null;
        }
      }
      return row;
    });
  }, [stores, consolidatedDaily, period, isHT, showN1, yoyOffsetDays]);

  const chartData = useMemo(
    () => maybeBucket(lineData, effectiveGranularity),
    [lineData, effectiveGranularity],
  );

  const yoyNote = m.yoyAvailable
    ? `vs N-1 · périmètre ${m.scopeStores}/${m.totalStores}`
    : "N-1 indisponible";

  const periodLabel = periodLabelFor(period);

  return (
    <div className="lm-grid">
      {m.yoyAvailable && m.scopeStores < m.totalStores && (
        <ScopeNote
          scopeStores={m.scopeStores}
          totalStores={m.totalStores}
          excludedStores={m.excludedStores}
        />
      )}

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
          spark={consolidatedDaily.slice(-14).map((d) => d.tx)}
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
          label="Magasins actifs"
          value={String(stores.length)}
          suffix={` / ${stores.length}`}
          yoyNote="République ouvert nov. 2025"
        />
      </div>

      <Card
        title="Évolution du chiffre d'affaires"
        subtitle={`Par magasin · ${periodLabel}`}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {allowWeekly && (
              <GranularityToggle
                value={granularity}
                onChange={setGranularity}
                allowMonth={allowMonth}
              />
            )}
            <N1Toggle value={showN1} onChange={setShowN1} />
            <LegendInline series={lineSeries.filter((s) => !s.dashed)} />
          </div>
        }
        span={2}
      >
        <LineChart
          data={chartData}
          series={lineSeries}
          height={300}
          period={period}
          granularity={effectiveGranularity}
        />
      </Card>

      <Card
        title="Comparaison des magasins"
        subtitle={`CA ${periodLabel} · barre N-1`}
      >
        <HBarChart
          rows={storeMetrics.map((s) => ({
            label: s.label,
            value: s.value,
            yoyValue: s.yoyValue,
          }))}
        />
        <div
          className="lm-store-mini-grid"
          style={{
            marginTop: 20,
            borderTop: "1px solid var(--border-light)",
            paddingTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {storeMetrics.map((s) => (
            <div key={s.label}>
              <div className="lm-label" style={{ fontSize: 10 }}>
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  color: "var(--fg-secondary)",
                  marginTop: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                Panier {s.ticket.toFixed(2).replace(".", ",")} €
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  marginTop: 4,
                }}
              >
                <div
                  className={
                    "lm-delta " +
                    (s.delta > 0 ? "pos" : s.delta < 0 ? "neg" : "neu")
                  }
                  style={{ fontSize: 11 }}
                >
                  {s.delta > 0 ? "↑" : s.delta < 0 ? "↓" : "·"}{" "}
                  {fmtPctNoSign(Math.abs(s.delta))}{" "}
                  <span
                    style={{ color: "var(--fg-tertiary)", fontWeight: 400 }}
                  >
                    P-1
                  </span>
                </div>
                {s.yoyAvailable && typeof s.yoyDelta === "number" ? (
                  <div
                    className={
                      "lm-delta " +
                      (s.yoyDelta > 0 ? "pos" : s.yoyDelta < 0 ? "neg" : "neu")
                    }
                    style={{ fontSize: 11 }}
                  >
                    {s.yoyDelta > 0 ? "↑" : s.yoyDelta < 0 ? "↓" : "·"}{" "}
                    {fmtPctNoSign(Math.abs(s.yoyDelta))}{" "}
                    <span
                      style={{ color: "var(--fg-tertiary)", fontWeight: 400 }}
                    >
                      N-1
                    </span>
                  </div>
                ) : (
                  <div className="lm-delta neu" style={{ fontSize: 11 }}>
                    —{" "}
                    <span
                      style={{ color: "var(--fg-tertiary)", fontWeight: 400 }}
                    >
                      N-1 n/a
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Répartition Fromagerie / Snacking"
        subtitle={periodLabel}
      >
        <SegmentSplit
          fromagerie={isHT ? m.fromagerieCAHT : m.fromagerieCA}
          snacking={isHT ? m.snackingCAHT : m.snackingCA}
          suffix={isHT ? "€ HT" : "€ TTC"}
        />
      </Card>

      <Card
        title="Top produits"
        subtitle={`Classement par CA ${isHT ? "HT" : "TTC"} · ${periodLabel}`}
        action={<SegmentFilterInline />}
        span={2}
      >
        <TopProducts
          products={consolidatedProducts}
          period={period}
          segmentFilter={segmentFilter}
          amountMode={amountMode}
        />
      </Card>

      <Card
        title="Moyens de paiement"
        subtitle={`30 derniers jours · tous magasins · ${isHT ? "HT" : "TTC"}`}
      >
        <PaymentsCard payments={consolidatedPayments} amountMode={amountMode} />
      </Card>
    </div>
  );
}
