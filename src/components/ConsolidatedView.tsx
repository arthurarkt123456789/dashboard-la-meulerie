"use client";

import { useMemo } from "react";
import type { PeriodKey, StoreData } from "@/lib/apitic/types";
import {
  PERIOD_LABELS,
  consolidateDaily,
  consolidatePayments,
  consolidateProducts,
  consolidatedPeriodMetrics,
  periodMetrics,
} from "@/lib/metrics";
import {
  fmtEUR,
  fmtEURshort,
  fmtNum,
  fmtPctNoSign,
} from "@/lib/format";
import { Card } from "./Card";
import { KPICard } from "./KPICard";
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

type Props = {
  stores: StoreData[];
  period: PeriodKey;
};

export function ConsolidatedView({ stores, period }: Props) {
  const [segmentFilter] = useSegmentFilter();

  const view = useMemo(() => {
    const consolidatedDaily = consolidateDaily(stores.map((s) => s.daily));
    const consolidatedProducts = consolidateProducts(
      stores.map((s) => s.topProducts),
    );
    const consolidatedPayments = consolidatePayments(
      stores.map((s) => ({ daily: s.daily, payments: s.payments })),
    );
    const m = consolidatedPeriodMetrics(
      consolidatedDaily,
      stores.map((s) => ({ store: s, daily: s.daily })),
      period,
    );
    return { consolidatedDaily, consolidatedProducts, consolidatedPayments, m };
  }, [stores, period]);

  const { consolidatedDaily, consolidatedProducts, consolidatedPayments, m } = view;
  const sparkValues = consolidatedDaily.slice(-14).map((d) => d.ca);

  const storeMetrics = useMemo(() => {
    return stores
      .map((s) => {
        const ms = periodMetrics(s.daily, period);
        return {
          label: s.name,
          value: ms.ca,
          ticket: ms.avgTicket,
          delta: ms.caDelta,
          yoyValue: ms.yoyAvailable ? ms.yoyCa : null,
          yoyDelta: ms.yoyAvailable ? ms.yoyCaDelta : null,
          yoyAvailable: ms.yoyAvailable,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [stores, period]);

  const lineSeries: LineSeries[] = stores.map((s, i) => ({
    key: s.id,
    label: s.name,
    color: SERIES_COLORS[i] ?? "var(--fg-secondary)",
  }));

  const lineData = useMemo(() => {
    const days = m.days;
    const slice = consolidatedDaily.slice(-days);
    return slice.map((d, i) => {
      const row: { date: string; partial?: boolean; [k: string]: string | number | boolean | null | undefined } = {
        date: d.date,
        partial: d.partial,
      };
      for (const s of stores) {
        const day = s.daily[s.daily.length - days + i];
        row[s.id] = day && !day.closed ? day.ca : null;
      }
      return row;
    });
  }, [stores, consolidatedDaily, m.days]);

  const yoyNote = m.yoyAvailable
    ? `vs N-1 · périmètre ${m.scopeStores}/${m.totalStores}`
    : "N-1 indisponible";

  const periodLabel = PERIOD_LABELS[period];

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
          value={fmtEUR(m.ca).replace(" €", "")}
          suffix="€"
          delta={m.caDelta}
          yoyDelta={m.yoyAvailable ? m.yoyCaDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          yoyNote={yoyNote}
          spark={sparkValues}
          sparkColor="var(--color-coral)"
          accent
          partial={period === "today"}
        />
        <KPICard
          label="Transactions"
          value={fmtNum(m.tx)}
          delta={m.txDelta}
          yoyDelta={m.yoyAvailable ? m.yoyTxDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          yoyNote={yoyNote}
          spark={consolidatedDaily.slice(-14).map((d) => d.tx)}
          partial={period === "today"}
        />
        <KPICard
          label="Panier moyen"
          value={m.avgTicket.toFixed(2).replace(".", ",")}
          suffix="€"
          delta={m.ticketDelta}
          yoyDelta={m.yoyAvailable ? m.yoyTicketDelta : undefined}
          yoyAvailable={m.yoyAvailable}
          yoyNote={yoyNote}
          spark={consolidatedDaily
            .slice(-14)
            .map((d) => (d.tx ? d.ca / d.tx : 0))}
          partial={period === "today"}
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
        action={<LegendInline series={lineSeries} />}
        span={2}
      >
        <LineChart
          data={lineData}
          series={lineSeries}
          height={300}
          period={period}
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
        <SegmentSplit fromagerie={m.fromagerieCA} snacking={m.snackingCA} />
      </Card>

      <Card
        title="Top produits"
        subtitle={`Classement par CA · ${periodLabel}`}
        action={<SegmentFilterInline />}
        span={2}
      >
        <TopProducts
          products={consolidatedProducts}
          period={period}
          segmentFilter={segmentFilter}
        />
      </Card>

      <Card title="Moyens de paiement" subtitle="Aujourd'hui · tous magasins">
        <PaymentsCard payments={consolidatedPayments} />
      </Card>
    </div>
  );
}
