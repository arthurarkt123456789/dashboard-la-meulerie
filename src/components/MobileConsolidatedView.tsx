"use client";

import { useMemo } from "react";
import { periodMetricsForSelection, rangeForSelection } from "@/lib/metrics";
import type { PeriodSelection, StoreData, Store } from "@/lib/apitic/types";
import { fmtEURshort, fmtEUR } from "@/lib/format";
import { LineChart, type LinePoint } from "./charts/LineChart";

const STORE_COLORS: Record<string, string> = {
  davso: "#E8420D",
  endoume: "#2563EB",
  malmousque: "#059669",
  republique: "#9333EA",
};

const FR_MONTHS = [
  "janvier","février","mars","avril","mai","juin",
  "juillet","août","septembre","octobre","novembre","décembre",
];

function fmtDelta(v: number) {
  return (v >= 0 ? "+" : "−") + Math.abs(Math.round(v * 100)) + "%";
}

type Props = {
  allData: StoreData[];
  stores: Store[];
  period: PeriodSelection;
  isHT: boolean;
  periodLabel: string;
};

export function MobileConsolidatedView({ allData, stores, period, isHT, periodLabel }: Props) {
  const isMonthPeriod = period.kind === "month";

  // ── Per-store computed data ───────────────────────────────────────────────
  const storeData = useMemo(() => {
    return stores.flatMap(store => {
      const data = allData.find(s => s.id === store.id);
      if (!data || !data.daily.length) return [];
      const todayISO = data.daily[data.daily.length - 1].date;
      const m = periodMetricsForSelection(data.daily, period);
      const { from, to } = rangeForSelection(period, todayISO);
      const slice = data.daily.filter(d => d.date >= from && d.date <= to && !d.closed);
      const ca = isHT ? m.caHT : m.ca;
      const txPerDay = m.days > 0 ? Math.round(m.tx / m.days) : 0;
      const avgTicket = isHT ? m.avgTicketHT : m.avgTicket;
      const yoyCaDelta = m.yoyAvailable ? m.yoyCaDelta : null;

      // Monthly stats (always current calendar month)
      const yr = Number(todayISO.slice(0, 4));
      const mo = Number(todayISO.slice(5, 7));
      const monthStart = `${yr}-${String(mo).padStart(2, "0")}-01`;
      const dailyByDate = new Map(data.daily.map(d => [d.date, d]));
      const monthDays = data.daily.filter(d => d.date >= monthStart && d.date <= todayISO && !d.closed);
      const monthTotal = monthDays.reduce((s, d) => s + (isHT ? (d.caHT ?? 0) : d.ca), 0);
      const n1Partial = monthDays.reduce((s, d) => {
        const dt = new Date(`${d.date}T00:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() - 364);
        const n1d = dailyByDate.get(dt.toISOString().slice(0, 10));
        return s + (n1d && !n1d.closed ? (isHT ? (n1d.caHT ?? 0) : n1d.ca) : 0);
      }, 0);
      const monthGrowth = n1Partial > 0 ? monthTotal / n1Partial - 1 : null;

      return [{ store, data, m, slice, ca, txPerDay, avgTicket, yoyCaDelta, monthTotal, n1Partial, monthGrowth, mo, todayISO }];
    });
  }, [allData, stores, period, isHT]);

  // ── Réseau totals ─────────────────────────────────────────────────────────
  const reseauCA = storeData.reduce((s, d) => s + d.ca, 0);
  const reseauMonthTotal = storeData.reduce((s, d) => s + d.monthTotal, 0);
  const reseauN1Partial = storeData.reduce((s, d) => s + d.n1Partial, 0);
  const reseauMonthGrowth = reseauN1Partial > 0 ? reseauMonthTotal / reseauN1Partial - 1 : null;

  // ── Multi-line chart data ─────────────────────────────────────────────────
  const { chartData, chartSeries } = useMemo(() => {
    const dateSet = new Set<string>();
    storeData.forEach(sd => sd.slice.forEach(d => dateSet.add(d.date)));
    const sortedDates = [...dateSet].sort();

    // Build per-store CA lookups
    const lookups = storeData.map(sd => ({
      id: sd.store.id,
      byDate: new Map(sd.slice.map(d => [d.date, isHT ? (d.caHT ?? 0) : d.ca])),
    }));

    const data: LinePoint[] = sortedDates.map(date => {
      const point: LinePoint = { date };
      lookups.forEach(({ id, byDate }) => { point[id] = byDate.get(date) ?? null; });
      return point;
    });

    const series = storeData.map(sd => ({
      key: sd.store.id,
      label: sd.store.name,
      color: STORE_COLORS[sd.store.id] ?? "#94a3b8",
    }));

    return { chartData: data, chartSeries: series };
  }, [storeData, isHT]);

  const currentMonth = storeData[0]?.mo ?? (new Date().getMonth() + 1);

  if (!storeData.length) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
        Chargement…
      </div>
    );
  }

  return (
    <div>
      {/* ── C.A. Mois en cours — réseau ── */}
      <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border-light)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>
              C.A. Mois en cours · Réseau
            </span>
            <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{FR_MONTHS[currentMonth - 1]}</span>
          </div>
          {/* Réseau total */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
              {fmtEURshort(reseauMonthTotal)}
            </span>
            {reseauMonthGrowth !== null && (
              <span style={{ fontSize: 13, fontWeight: 700, color: reseauMonthGrowth >= 0 ? "#15803d" : "#b91c1c" }}>
                {fmtDelta(reseauMonthGrowth)} vs N-1
              </span>
            )}
          </div>
          {/* 4 store cards in 2×2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {storeData.map(sd => {
              const color = STORE_COLORS[sd.store.id] ?? "#94a3b8";
              return (
                <div key={sd.store.id} style={{
                  background: "var(--bg-subtle)",
                  borderRadius: 8, padding: "10px 12px",
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-tertiary)", marginBottom: 4 }}>
                    {sd.store.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtEURshort(sd.monthTotal)}
                  </div>
                  {sd.monthGrowth !== null && (
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: sd.monthGrowth >= 0 ? "#15803d" : "#b91c1c" }}>
                      {fmtDelta(sd.monthGrowth)} vs N-1
                    </div>
                  )}
                  {sd.n1Partial > 0 && (
                    <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 1 }}>
                      N-1 : {fmtEURshort(sd.n1Partial)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Répartition des CA */}
        {reseauMonthTotal > 0 && (
          <div style={{ padding: "10px 16px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-tertiary)", marginBottom: 6 }}>
              Répartition du CA réseau
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
              {storeData.map(sd => (
                <div key={sd.store.id} style={{
                  flex: sd.monthTotal / reseauMonthTotal,
                  background: STORE_COLORS[sd.store.id] ?? "#94a3b8",
                  minWidth: 2,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 6 }}>
              {storeData.map(sd => (
                <div key={sd.store.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--fg-secondary)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: STORE_COLORS[sd.store.id] ?? "#94a3b8", flexShrink: 0 }} />
                  {sd.store.name} · {reseauMonthTotal > 0 ? Math.round(sd.monthTotal / reseauMonthTotal * 100) : 0} %
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── KPIs comparés — période sélectionnée ── */}
      <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
        <div style={{ padding: "12px 16px 4px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>
            KPIs · {periodLabel}
          </div>
        </div>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 48px 72px", gap: 0, padding: "8px 16px 6px", borderBottom: "1px solid var(--border-light)" }}>
          {["", "C.A.", "Tx/j", "Panier"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-tertiary)", textAlign: h === "" ? "left" : "right" }}>
              {h}
            </div>
          ))}
        </div>
        {/* Store rows */}
        {storeData.map((sd, i) => {
          const color = STORE_COLORS[sd.store.id] ?? "#94a3b8";
          const isLast = i === storeData.length - 1;
          return (
            <div key={sd.store.id} style={{
              display: "grid", gridTemplateColumns: "1fr 72px 48px 72px", gap: 0,
              padding: "10px 16px",
              borderBottom: isLast ? "none" : "1px solid var(--border-light)",
              alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 3, height: 18, background: color, borderRadius: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-primary)" }}>{sd.store.name}</div>
                  {sd.yoyCaDelta !== null && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: sd.yoyCaDelta >= 0 ? "#15803d" : "#b91c1c" }}>
                      {fmtDelta(sd.yoyCaDelta)} N-1
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {fmtEURshort(sd.ca)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {sd.txPerDay}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {fmtEUR(sd.avgTicket).replace(" €", "")} €
              </div>
            </div>
          );
        })}
        {/* Réseau total */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 72px 48px 72px",
          padding: "10px 16px", background: "var(--bg-subtle)",
          borderTop: "2px solid var(--border-light)",
          alignItems: "center",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total réseau
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
            {fmtEURshort(reseauCA)}
          </div>
          <div />
          <div />
        </div>
      </div>

      {/* ── Évolution CA — 4 boutiques ── */}
      {chartData.length >= 2 && (
        <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
          <div style={{ padding: "14px 16px 10px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>Évolution CA</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
              {chartSeries.map(s => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fg-secondary)" }}>
                  <span style={{ width: 12, height: 2, background: s.color, display: "inline-block", borderRadius: 1 }} />
                  {s.label}
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border-light)", padding: "0 4px 8px" }}>
            <LineChart
              data={chartData}
              height={200}
              period={period}
              series={chartSeries}
              yFormat={fmtEURshort}
              highlightLast={false}
              showLegend={false}
            />
          </div>
        </div>
      )}

      {/* ── Classement C.A. période ── */}
      <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-tertiary)", marginBottom: 10 }}>
          Classement C.A. · {periodLabel}
        </div>
        {[...storeData].sort((a, b) => b.ca - a.ca).map((sd, rank) => {
          const maxCA = storeData.reduce((m, d) => Math.max(m, d.ca), 0);
          const color = STORE_COLORS[sd.store.id] ?? "#94a3b8";
          return (
            <div key={sd.store.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: rank === 0 ? color : "var(--fg-tertiary)", width: 14, textAlign: "center" }}>
                    {rank + 1}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-primary)" }}>{sd.store.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtEURshort(sd.ca)}
                  </span>
                  {sd.yoyCaDelta !== null && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: sd.yoyCaDelta >= 0 ? "#15803d" : "#b91c1c" }}>
                      {fmtDelta(sd.yoyCaDelta)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--bg-subtle)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${maxCA > 0 ? (sd.ca / maxCA) * 100 : 0}%`, background: color, borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
