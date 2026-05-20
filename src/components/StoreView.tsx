"use client";

import { useMemo } from "react";
import type { PeriodKey, StoreData } from "@/lib/apitic/types";
import { PERIOD_LABELS, periodMetrics } from "@/lib/metrics";
import { fmtEUR, fmtNum } from "@/lib/format";
import { Card } from "./Card";
import { KPICard } from "./KPICard";
import { LineChart } from "./charts/LineChart";
import { HourlyBars } from "./charts/HourlyBars";
import { TopProducts } from "./TopProducts";
import { PaymentsCard } from "./PaymentsCard";
import { SegmentSplit } from "./SegmentSplit";
import { SegmentFilterInline, useSegmentFilter } from "./SegmentFilter";

type Props = {
  store: StoreData;
  period: PeriodKey;
  today: Date;
};

export function StoreView({ store, period, today }: Props) {
  const [segmentFilter] = useSegmentFilter();

  const m = useMemo(() => periodMetrics(store.daily, period), [store.daily, period]);
  const sparkValues = store.daily.slice(-14).map((d) => d.ca);
  const periodLabel = PERIOD_LABELS[period];

  const lineData = store.daily.slice(-m.days);
  const todayCA = store.daily[store.daily.length - 1]?.ca ?? 0;

  const openedDate = new Date(store.openedDate + "T00:00:00");
  const monthsOpen = Math.round(
    (today.getTime() - openedDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  const openSinceLabel =
    monthsOpen < 12
      ? `Ouvert depuis ${monthsOpen} mois`
      : `Ouvert depuis ${store.opened}`;

  const yoyNote = m.yoyAvailable
    ? "vs N-1"
    : `N-1 indisponible · ouvert depuis ${monthsOpen} mois`;

  const yoyOverlay = m.yoyAvailable
    ? (() => {
        const days = m.days;
        const start = store.daily.length - days - 365;
        return store.daily.slice(start, start + days).map((d, i) => ({
          date: lineData[i]?.date ?? d.date,
          ca: d.ca,
        }));
      })()
    : null;

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
            <span>Responsable : {store.manager}</span>
            <span className="lm-dot">·</span>
            <span>{openSinceLabel}</span>
            {!m.yoyAvailable && (
              <>
                <span className="lm-dot">·</span>
                <span
                  style={{ color: "var(--color-coral)", fontWeight: 500 }}
                >
                  Hors comparaison N-1
                </span>
              </>
            )}
          </div>
        </div>
        <div className="lm-store-status">
          <span className="lm-status-dot" />
          <span>Caisse en ligne · dernière sync il y a 2 min</span>
        </div>
      </div>

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
          spark={store.daily.slice(-14).map((d) => d.tx)}
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
          spark={store.daily.slice(-14).map((d) => (d.tx ? d.ca / d.tx : 0))}
          partial={period === "today"}
        />
        <KPICard
          label="CA aujourd'hui"
          value={fmtEUR(todayCA).replace(" €", "")}
          suffix="€"
          spark={store.hourly.filter((h) => h.done).map((h) => h.ca)}
          partial
        />
      </div>

      <Card
        title="Évolution du chiffre d'affaires"
        subtitle={
          periodLabel + (m.yoyAvailable ? " · N-1 en pointillé" : "")
        }
        span={2}
      >
        <LineChart
          data={lineData.map((d) => ({ ...d }))}
          series={[
            {
              key: "ca",
              label: `CA ${new Date().getFullYear()}`,
              color: "var(--color-coral)",
            },
          ]}
          yoyData={yoyOverlay}
          height={280}
          period={period}
        />
      </Card>

      <Card title="Affluence intraday" subtitle="CA par heure · aujourd'hui">
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
              Pic du jour
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
        subtitle={periodLabel}
      >
        <SegmentSplit fromagerie={m.fromagerieCA} snacking={m.snackingCA} />
      </Card>

      <Card
        title="Top produits"
        subtitle={`Classement · ${periodLabel}`}
        action={<SegmentFilterInline />}
        span={2}
      >
        <TopProducts
          products={store.topProducts}
          period={period}
          segmentFilter={segmentFilter}
        />
      </Card>

      <Card title="Moyens de paiement" subtitle="Aujourd'hui">
        <PaymentsCard payments={store.payments} />
      </Card>
    </div>
  );
}
