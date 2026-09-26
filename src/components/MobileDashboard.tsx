"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useStoreData, useStores } from "@/lib/queries";
import {
  periodMetricsForSelection,
  rangeForSelection,
  currentFiscalYearEnd,
} from "@/lib/metrics";
import type { PeriodSelection, StoreData } from "@/lib/apitic/types";
import { fmtEUR, fmtEURshort } from "@/lib/format";
import { LineChart } from "./charts/LineChart";
import { MonthDailyBars } from "./charts/MonthDailyBars";
import { FiscalYearChart } from "./charts/FiscalYearChart";

const STORE_COLORS: Record<string, string> = {
  davso: "#E8420D",
  endoume: "#2563EB",
  malmousque: "#059669",
  republique: "#9333EA",
};

const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function fmtPct(v: number) {
  const pct = Math.round(Math.abs(v) * 100);
  return (v >= 0 ? "+" : "−") + pct + "%";
}

// ── Collapsible KPI block ────────────────────────────────────────────────────
function KPIAccordion({
  label, value, suffix, yoyDelta, yoyAvailable, children,
}: {
  label: string;
  value: string;
  suffix?: string;
  yoyDelta?: number | null;
  yoyAvailable?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const showYoy = yoyAvailable !== false && typeof yoyDelta === "number";
  return (
    <div style={{ borderBottom: "1px solid var(--border-light)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          padding: "14px 16px", background: "none", border: 0,
          textAlign: "left", cursor: "pointer", gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.02em", color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
            {value}
            {suffix && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-secondary)", marginLeft: 4 }}>{suffix}</span>}
          </div>
        </div>
        {showYoy && (
          <div style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700,
            background: (yoyDelta ?? 0) >= 0 ? "#dcfce7" : "#fee2e2",
            color: (yoyDelta ?? 0) >= 0 ? "#15803d" : "#b91c1c",
          }}>
            {fmtPct(yoyDelta!)}
          </div>
        )}
        <span style={{ fontSize: 18, color: "var(--fg-tertiary)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
      </button>
      {open && children && (
        <div style={{ padding: "0 16px 16px", background: "var(--bg-subtle)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Generic collapsible section ──────────────────────────────────────────────
function Section({ title, subtitle, defaultOpen = false, accent, children }: {
  title: string; subtitle?: string; defaultOpen?: boolean; accent?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", background: "none", border: 0, cursor: "pointer",
          borderLeft: accent ? `3px solid ${accent}` : "none",
        }}
      >
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <span style={{ fontSize: 18, color: "var(--fg-tertiary)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>›</span>
      </button>
      {open && <div style={{ borderTop: "1px solid var(--border-light)" }}>{children}</div>}
    </div>
  );
}

// ── Delta row in expanded KPI ────────────────────────────────────────────────
function DRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
      <span style={{ color: "var(--fg-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: color ?? "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── Horizontal scroll MonthDailyBars (larger bars for touch) ─────────────────
function MobileMonthBars({ store, isHT }: { store: StoreData; isHT: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
  const todayDay = Number(todayISO.slice(8, 10));
  const storeColor = STORE_COLORS[store.id] ?? "var(--color-coral)";
  const year = Number(todayISO.slice(0, 4));
  const month = Number(todayISO.slice(5, 7));
  const daysCount = new Date(year, month, 0).getDate();
  const BAR_SLOT = 36; // px per day — wide enough for touch

  // After mount, scroll so today is roughly centered
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayCenter = (todayDay - 0.5) * BAR_SLOT;
    el.scrollLeft = todayCenter - el.clientWidth / 2;
  }, [todayDay]);

  const totalW = daysCount * BAR_SLOT + 64; // 64 = left PAD for labels

  return (
    <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
      <div style={{ width: totalW, minWidth: totalW }}>
        <MonthDailyBars
          daily={store.daily}
          todayISO={todayISO}
          isHT={isHT}
          storeColor={storeColor}
        />
      </div>
    </div>
  );
}

// ── Main mobile dashboard ────────────────────────────────────────────────────
export function MobileDashboard() {
  const storesQ = useStores();
  const dataQ = useStoreData();

  const stores = storesQ.data ?? [];
  const allData = dataQ.data ?? [];

  const [storeId, setStoreId] = useState<string | null>(null);
  const [isHT, setIsHT] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeId = storeId ?? stores[0]?.id ?? "davso";
  const store = allData.find((s) => s.id === activeId) ?? null;

  const todayISO = store?.daily[store.daily.length - 1]?.date ?? "";
  const year = todayISO ? Number(todayISO.slice(0, 4)) : new Date().getFullYear();
  const month = todayISO ? Number(todayISO.slice(5, 7)) : new Date().getMonth() + 1;

  // Period: default to current month
  const [period, setPeriod] = useState<PeriodSelection>(() => {
    const now = new Date();
    return { kind: "month", year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // Sync month period year/month when todayISO is known
  useEffect(() => {
    if (todayISO && period.kind === "month") {
      setPeriod({ kind: "month", year, month });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO]);

  const m = useMemo(
    () => store ? periodMetricsForSelection(store.daily, period) : null,
    [store, period],
  );

  const periodSlice = useMemo(() => {
    if (!store || !todayISO) return [];
    const { from, to } = rangeForSelection(period, todayISO);
    return store.daily.filter((d) => d.date >= from && d.date <= to && !d.closed);
  }, [store, period, todayISO]);

  // Line chart data (daily, simplified)
  const lineData = useMemo(() => {
    return periodSlice.map((d) => ({
      date: d.date,
      ca: isHT ? (d.caHT ?? 0) : d.ca,
    }));
  }, [periodSlice, isHT]);

  // Formule stats
  const formules = useMemo(() => {
    const slice = periodSlice;
    const days = slice.length || 1;
    const grilled = slice.reduce((s, d) => s + (d.grilledUnits ?? 0), 0);
    const baguette = slice.reduce((s, d) => s + (d.baguetteUnits ?? 0), 0);
    const snackingTx = slice.reduce((s, d) => s + (d.snackingTx ?? 0), 0);
    return { grilled, baguette, snackingTx, days, grilledPerDay: grilled / days, bagPerDay: baguette / days };
  }, [periodSlice]);

  // Network formule %
  const networkFormulePct = useMemo(() => {
    if (!allData.length || !todayISO) return null;
    let totalFormules = 0, totalSnackTx = 0;
    for (const s of allData) {
      const { from, to } = rangeForSelection(period, s.daily[s.daily.length - 1]?.date ?? todayISO);
      const slice = s.daily.filter((d) => d.date >= from && d.date <= to && !d.closed);
      totalFormules += slice.reduce((acc, d) => acc + (d.grilledUnits ?? 0) + (d.baguetteUnits ?? 0), 0);
      totalSnackTx += slice.reduce((acc, d) => acc + (d.snackingTx ?? 0), 0);
    }
    return totalSnackTx > 0 ? totalFormules / totalSnackTx : null;
  }, [allData, period, todayISO]);

  const storeColor = STORE_COLORS[activeId] ?? "var(--color-coral)";
  const totalCA = isHT ? m?.caHT ?? 0 : m?.ca ?? 0;

  const periodLabel =
    period.kind === "preset" ? (period.key === "7d" ? "7 derniers jours" : period.key) :
    period.kind === "month" ? `${FR_MONTHS[month - 1]} ${year}` :
    `Exercice ${currentFiscalYearEnd() - 1}–${currentFiscalYearEnd()}`;

  const fyEnd = currentFiscalYearEnd(todayISO ? new Date(`${todayISO}T12:00:00Z`) : new Date());

  // UE daily units (for snacking)
  const ueDailyUnits = periodSlice.length > 0
    ? periodSlice.reduce((s, d) => s + (d.uberEatsCa ?? 0), 0) / 10 / periodSlice.length
    : 0;

  if (dataQ.isLoading || !store) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-body)", color: "var(--fg-tertiary)" }}>
        Chargement…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#f5f5f7", fontFamily: "var(--font-body)" }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--color-white)", borderBottom: "1px solid var(--border-light)",
      }}>
        {/* Top row: logo + store selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 8px" }}>
          <img src="/logo-la-meulerie.png" alt="La Meulerie" style={{ height: 32, width: "auto" }} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{
              display: "flex", gap: 6, overflowX: "auto", overflowY: "hidden",
              scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
            }}>
              {stores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStoreId(s.id)}
                  style={{
                    flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: 0,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: s.id === activeId ? storeColor : "var(--bg-subtle)",
                    color: s.id === activeId ? "#fff" : "var(--fg-secondary)",
                    transition: "background 0.15s",
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {/* HT/TTC */}
          <button
            onClick={() => setIsHT(!isHT)}
            style={{
              flexShrink: 0, padding: "5px 10px", borderRadius: 20,
              border: "1px solid var(--border-light)", fontSize: 12, fontWeight: 600,
              background: "var(--bg-subtle)", color: "var(--fg-secondary)", cursor: "pointer",
            }}
          >
            {isHT ? "HT" : "TTC"}
          </button>
        </div>

        {/* Period row */}
        <div style={{ display: "flex", gap: 6, padding: "0 16px 10px", overflowX: "auto", scrollbarWidth: "none" }}>
          {([
            { label: "7j", p: { kind: "preset", key: "7d" } as PeriodSelection },
            { label: FR_MONTHS[month - 1].slice(0, 4) + ".", p: { kind: "month", year, month } as PeriodSelection },
            { label: "Exercice", p: { kind: "fiscal-year-todate" } as PeriodSelection },
          ]).map(({ label, p }) => {
            const isActive = JSON.stringify(period) === JSON.stringify(p);
            return (
              <button
                key={label}
                onClick={() => setPeriod(p)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: 0,
                  background: isActive ? "var(--color-dark)" : "var(--bg-subtle)",
                  color: isActive ? "#fff" : "var(--fg-secondary)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "12px 12px 80px" }}>

        {/* ── 5 KPI accordions ── */}
        <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12, borderLeft: `3px solid ${storeColor}` }}>

          {/* 1. CA */}
          <KPIAccordion
            label={`C.A. · ${periodLabel}`}
            value={fmtEURshort(totalCA)}
            yoyDelta={m?.yoyAvailable ? m.yoyCaDelta : null}
            yoyAvailable={m?.yoyAvailable}
          >
            {m && <>
              <DRow label="vs période préc." value={`${m.caDelta >= 0 ? "+" : ""}${(m.caDelta * 100).toFixed(1).replace(".", ",")} %`} color={m.caDelta >= 0 ? "#15803d" : "#b91c1c"} />
              {m.fromagerieCA > 0 && <DRow label={`Fromagerie (${((isHT ? m.fromagerieCAHT : m.fromagerieCA) / totalCA * 100).toFixed(0)} %)`} value={fmtEURshort(isHT ? m.fromagerieCAHT : m.fromagerieCA)} />}
              {m.snackingCA > 0 && <DRow label={`Snacking (${((isHT ? m.snackingCAHT ?? 0 : m.snackingCA) / totalCA * 100).toFixed(0)} %)`} value={fmtEURshort(isHT ? m.snackingCAHT ?? 0 : m.snackingCA)} />}
              {m.epicerieCA > 0 && <DRow label={`Épicerie (${((isHT ? m.epicerieCAHT ?? 0 : m.epicerieCA) / totalCA * 100).toFixed(0)} %)`} value={fmtEURshort(isHT ? m.epicerieCAHT ?? 0 : m.epicerieCA)} />}
              {m.merchCA > 0 && <DRow label={`Merch (${((isHT ? m.merchCAHT ?? 0 : m.merchCA) / totalCA * 100).toFixed(0)} %)`} value={fmtEURshort(isHT ? m.merchCAHT ?? 0 : m.merchCA)} />}
            </>}
          </KPIAccordion>

          {/* 2. Transactions */}
          <KPIAccordion
            label="Transactions / jour"
            value={m ? String(Math.round(m.tx / Math.max(m.days, 1))) : "—"}
            suffix="tx/j"
            yoyDelta={m?.yoyAvailable ? m.yoyTxDelta : null}
            yoyAvailable={m?.yoyAvailable}
          >
            {m && <>
              <DRow label="Total transactions" value={String(m.tx)} />
              <DRow label="vs période préc." value={`${m.txDelta >= 0 ? "+" : ""}${(m.txDelta * 100).toFixed(1).replace(".", ",")} %`} color={m.txDelta >= 0 ? "#15803d" : "#b91c1c"} />
              {m.fromagerieTx > 0 && <DRow label={`Fromagerie (${(m.fromagerieTx / m.tx * 100).toFixed(0)} %)`} value={Math.round(m.fromagerieTx / Math.max(m.days, 1)) + " tx/j"} />}
              {m.snackingTx > 0 && <DRow label={`Snacking (${(m.snackingTx / m.tx * 100).toFixed(0)} %)`} value={Math.round(m.snackingTx / Math.max(m.days, 1)) + " tx/j"} />}
            </>}
          </KPIAccordion>

          {/* 3. Panier moyen */}
          <KPIAccordion
            label="Panier moyen"
            value={fmtEUR(isHT ? m?.avgTicketHT ?? 0 : m?.avgTicket ?? 0).replace(" €", "")}
            suffix={isHT ? "€ HT" : "€ TTC"}
            yoyDelta={m?.yoyAvailable ? m.yoyTicketDelta : null}
            yoyAvailable={m?.yoyAvailable}
          >
            {m && <>
              <DRow label="vs période préc." value={`${m.ticketDelta >= 0 ? "+" : ""}${(m.ticketDelta * 100).toFixed(1).replace(".", ",")} %`} color={m.ticketDelta >= 0 ? "#15803d" : "#b91c1c"} />
              {m.fromagerieTx > 0 && <DRow label="Panier Fromagerie" value={fmtEUR(isHT ? m.avgTicketFromagerieHT : m.avgTicketFromagerie)} />}
              {m.snackingTx > 0 && <DRow label="Panier Snacking" value={fmtEUR(isHT ? m.avgTicketSnackingHT : m.avgTicketSnacking)} />}
            </>}
          </KPIAccordion>

          {/* 4. Marge Brute */}
          {m && m.margeCoveredCAHT > 0 && (
            <KPIAccordion
              label="Marge Brute"
              value={`${(m.margeCoveredCAHT > 0 ? m.margeHT / m.margeCoveredCAHT * 100 : 0).toFixed(1).replace(".", ",")} %`}
              yoyDelta={m.yoyAvailable ? m.yoyMargeDelta : null}
              yoyAvailable={m.yoyAvailable}
            >
              <DRow label="Marge HT" value={fmtEURshort(m.margeHT)} />
              <DRow label="CA couvert" value={fmtEURshort(m.margeCoveredCAHT)} />
            </KPIAccordion>
          )}

          {/* 5. CA / jour */}
          <KPIAccordion
            label="C.A. / jour moyen"
            value={fmtEURshort(m && m.days > 0 ? totalCA / m.days : 0)}
            suffix="/j"
            yoyDelta={m?.yoyAvailable ? m.yoyCaDelta : null}
            yoyAvailable={m?.yoyAvailable}
          >
            {m && <>
              <DRow label="Jours dans la période" value={String(m.days)} />
              <DRow label="N-1 CA/j" value={m.yoyCa > 0 && m.days > 0 ? fmtEURshort(m.yoyCa / m.days) : "N/A"} />
            </>}
          </KPIAccordion>
        </div>

        {/* ── Snacking — recommandation ── */}
        <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 10 }}>
            Recommandation production quotidienne
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 4 }}>Total Grilled Cheese</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(formules.grilledPerDay + ueDailyUnits * (formules.grilledPerDay / Math.max(formules.grilledPerDay + formules.bagPerDay, 1)))}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>unités / jour</div>
            </div>
            <div style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginBottom: 4 }}>Total Snacking</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(formules.grilledPerDay + formules.bagPerDay + ueDailyUnits)}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>unités / jour</div>
            </div>
          </div>
          {ueDailyUnits > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#15803d" }}>
              Estimatif Uber Eats inclus ({Math.round(ueDailyUnits)} /j)
            </div>
          )}
        </div>

        {/* ── C.A. mensuel jour par jour ── */}
        <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
          <div style={{ padding: "14px 16px 10px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>
              C.A. de {FR_MONTHS[month - 1]} {year}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>
              Glisser pour voir les jours précédents
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border-light)", padding: "12px 4px 4px" }}>
            <MobileMonthBars store={store} isHT={isHT} />
          </div>
        </div>

        {/* ── Évolution CA ── */}
        {lineData.length > 0 && (
          <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
            <div style={{ padding: "14px 16px 10px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>Évolution du C.A.</div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>{isHT ? "HT" : "TTC"} · {periodLabel}</div>
            </div>
            <div style={{ borderTop: "1px solid var(--border-light)", padding: "0 4px 8px" }}>
              <LineChart
                data={lineData}
                height={160}
                period={period}
                series={[{ key: "ca", label: "CA", color: storeColor }]}
                yFormat={fmtEURshort}
              />
            </div>
          </div>
        )}

        {/* ── Répartition catégories ── */}
        {m && totalCA > 0 && (
          <Section title="Répartition catégories" subtitle={`${isHT ? "HT" : "TTC"} · ${periodLabel}`}>
            <div style={{ padding: "12px 16px" }}>
              {[
                { label: "Fromagerie", color: "var(--color-dark)", val: isHT ? m.fromagerieCAHT : m.fromagerieCA },
                { label: "Snacking",   color: "var(--color-coral)", val: isHT ? m.snackingCAHT ?? 0 : m.snackingCA },
                { label: "Épicerie",   color: "#1A5EA8", val: isHT ? m.epicerieCAHT ?? 0 : m.epicerieCA },
                { label: "Merch",      color: "#7C3AED", val: isHT ? m.merchCAHT ?? 0 : m.merchCA },
              ].filter(s => s.val > 0).map((s) => {
                const pct = s.val / totalCA;
                return (
                  <div key={s.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                        {s.label}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {fmtEURshort(s.val)} · {(pct * 100).toFixed(0)} %
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--bg-subtle)" }}>
                      <div style={{ height: "100%", borderRadius: 3, background: s.color, width: `${pct * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── C.A. mensuel exercice ── */}
        <Section title={`C.A. mensuel · Exercice ${fyEnd - 1}–${fyEnd}`} subtitle="Tap pour voir le graphe">
          <div style={{ padding: "12px 16px 4px" }}>
            <FiscalYearChart daily={store.daily} todayISO={todayISO} isHT={isHT} />
          </div>
        </Section>

        {/* ── % Formules snacking ── */}
        {formules.snackingTx > 0 && (
          <div style={{ background: "var(--color-white)", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 8 }}>
              Formules snacking
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-coral)", fontVariantNumeric: "tabular-nums" }}>
                  {((formules.grilled + formules.baguette) / formules.snackingTx * 100).toFixed(0)} %
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>formules / snacking tx</div>
              </div>
              {networkFormulePct !== null && (
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>
                    Réseau : <strong style={{ fontVariantNumeric: "tabular-nums" }}>{(networkFormulePct * 100).toFixed(0)} %</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Données avancées ── */}
        <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "none", border: 0, cursor: "pointer" }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-secondary)" }}>Données avancées</span>
            <span style={{ fontSize: 18, color: "var(--fg-tertiary)", transform: advancedOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
          </button>
          {advancedOpen && (
            <div style={{ borderTop: "1px solid var(--border-light)", padding: "12px 16px" }}>
              <a
                href={`/${activeId === "all" ? "all" : activeId}`}
                style={{ display: "block", padding: "10px 0", color: "var(--fg-secondary)", fontSize: 13, textDecoration: "none" }}
              >
                → Vue détaillée complète
              </a>
              <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 8 }}>
                Marges par catégorie, panier moyen détaillé, paiements, Uber Eats, stocks formulaires, historique comparé…
              </p>
            </div>
          )}
        </div>

        {/* ── Switch to full view ── */}
        <a
          href={`/${activeId === "all" ? "all" : activeId}`}
          style={{
            display: "block", textAlign: "center", padding: "14px 20px",
            background: "var(--color-dark)", color: "#fff", borderRadius: 12,
            fontWeight: 600, fontSize: 15, textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          Ouvrir la vue complète →
        </a>
      </div>
    </div>
  );
}
