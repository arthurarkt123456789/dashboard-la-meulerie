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

const FR_MONTHS = [
  "janvier","février","mars","avril","mai","juin",
  "juillet","août","septembre","octobre","novembre","décembre",
];

const PERIOD_OPTIONS = [
  { value: "today", label: "Hier" },
  { value: "7d",    label: "7 jours" },
  { value: "30d",   label: "30 jours" },
  { value: "90d",   label: "3 mois" },
  { value: "fy",    label: "Exercice" },
] as const;

type PeriodOpt = typeof PERIOD_OPTIONS[number]["value"];

function toPeriodSelection(key: PeriodOpt, year: number, month: number): PeriodSelection {
  if (key === "fy") return { kind: "fiscal-year-todate" };
  return { kind: "preset", key };
}

function fmtPct(v: number) {
  const pct = Math.round(Math.abs(v) * 100);
  return (v >= 0 ? "+" : "−") + pct + "%";
}

// ── Styled native select ─────────────────────────────────────────────────────
function AppSelect({
  value, onChange, options, color,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  color?: string;
}) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          appearance: "none",
          WebkitAppearance: "none",
          background: color ? color + "18" : "var(--bg-subtle)",
          border: color ? `1.5px solid ${color}40` : "1.5px solid var(--border-light)",
          borderRadius: 10,
          padding: "9px 28px 9px 12px",
          fontSize: 14,
          fontWeight: 700,
          color: color ?? "var(--fg-primary)",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span style={{
        position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", fontSize: 9, color: color ?? "var(--fg-tertiary)",
        fontWeight: 700,
      }}>▼</span>
    </div>
  );
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
            flexShrink: 0,
          }}>
            {fmtPct(yoyDelta!)}
          </div>
        )}
        <span style={{ fontSize: 18, color: "var(--fg-tertiary)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>›</span>
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

// ── Stat box (monthly summary) ───────────────────────────────────────────────
function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--bg-subtle)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Horizontal scroll MonthDailyBars ─────────────────────────────────────────
function MobileMonthBars({ store, isHT }: { store: StoreData; isHT: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayISO = store.daily[store.daily.length - 1]?.date ?? "";
  const todayDay = Number(todayISO.slice(8, 10));
  const storeColor = STORE_COLORS[store.id] ?? "var(--color-coral)";
  const year = Number(todayISO.slice(0, 4));
  const month = Number(todayISO.slice(5, 7));
  const daysCount = new Date(year, month, 0).getDate();
  const BAR_SLOT = 36;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (todayDay - 0.5) * BAR_SLOT - el.clientWidth / 2;
  }, [todayDay]);

  const totalW = daysCount * BAR_SLOT + 64;

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [periodKey, setPeriodKey] = useState<PeriodOpt>("7d");

  const activeId = storeId ?? stores[0]?.id ?? "davso";
  const store = allData.find((s) => s.id === activeId) ?? null;

  const todayISO = store?.daily[store.daily.length - 1]?.date ?? "";
  const year = todayISO ? Number(todayISO.slice(0, 4)) : new Date().getFullYear();
  const month = todayISO ? Number(todayISO.slice(5, 7)) : new Date().getMonth() + 1;

  const period = useMemo(
    () => toPeriodSelection(periodKey, year, month),
    [periodKey, year, month],
  );

  const m = useMemo(
    () => store ? periodMetricsForSelection(store.daily, period) : null,
    [store, period],
  );

  const periodSlice = useMemo(() => {
    if (!store || !todayISO) return [];
    const { from, to } = rangeForSelection(period, todayISO);
    return store.daily.filter((d) => d.date >= from && d.date <= to && !d.closed);
  }, [store, period, todayISO]);

  const hasUberEats = useMemo(
    () => periodSlice.some(d => (d.uberEatsCa ?? 0) > 0),
    [periodSlice],
  );

  // Line chart data
  const lineData = useMemo(() => periodSlice.map((d) => ({
    date: d.date,
    ca: isHT ? (d.caHT ?? 0) : d.ca,
    uberEatsCa: isHT ? Math.round((d.uberEatsCa ?? 0) / 1.1 * 100) / 100 : (d.uberEatsCa ?? 0),
  })), [periodSlice, isHT]);

  // N-1 line overlay (same day-of-week, 52 weeks back)
  const yoyLineData = useMemo(() => {
    if (!m?.yoySlice?.length || !m.yoyAvailable) return null;
    return m.yoySlice.map(d => ({
      date: d.date,
      ca: isHT ? (d.caHT ?? 0) : d.ca,
    }));
  }, [m, isHT]);

  // Monthly stat boxes
  const monthStats = useMemo(() => {
    if (!store || !todayISO) return null;
    const mo = Number(todayISO.slice(5, 7));
    const yr = Number(todayISO.slice(0, 4));
    const monthStart = `${yr}-${String(mo).padStart(2, "0")}-01`;
    const dailyByDate = new Map(store.daily.map(d => [d.date, d]));
    // All days of the current month up to todayISO
    const monthDays = store.daily.filter(d => d.date >= monthStart && d.date <= todayISO);
    const monthTotal = monthDays.reduce((s, d) => s + (isHT ? (d.caHT ?? 0) : d.ca), 0);
    const lastDay = monthDays[monthDays.length - 1];
    const todayCa = lastDay ? (isHT ? (lastDay.caHT ?? 0) : lastDay.ca) : 0;
    // N-1: for each calendar day of the month, look up the day 364 days earlier
    const allMonthDates: string[] = [];
    const daysInMonth = new Date(yr, mo, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      allMonthDates.push(`${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    const n1Total = allMonthDates.reduce((s, dateStr) => {
      const dt = new Date(`${dateStr}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() - 364);
      const n1Date = dt.toISOString().slice(0, 10);
      const n1d = dailyByDate.get(n1Date);
      return s + (n1d && !n1d.closed ? (isHT ? (n1d.caHT ?? 0) : n1d.ca) : 0);
    }, 0);
    return { todayCa, monthTotal, n1Total, lastDate: lastDay?.date ?? todayISO };
  }, [store, todayISO, isHT]);

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
    periodKey === "today" ? "Hier" :
    periodKey === "7d" ? "7 derniers jours" :
    periodKey === "30d" ? "30 derniers jours" :
    periodKey === "90d" ? "3 derniers mois" :
    `Exercice ${currentFiscalYearEnd() - 1}–${currentFiscalYearEnd()}`;

  const fyEnd = currentFiscalYearEnd(todayISO ? new Date(`${todayISO}T12:00:00Z`) : new Date());

  const ueDailyUnits = periodSlice.length > 0
    ? periodSlice.reduce((s, d) => s + (d.uberEatsCa ?? 0), 0) / 10 / periodSlice.length
    : 0;

  const storeOptions = stores.map(s => ({ value: s.id, label: s.name }));

  function goToFullView() {
    document.cookie = "force-desktop=1; path=/; max-age=86400; SameSite=Lax";
    window.location.href = `/${activeId === "all" ? "all" : activeId}`;
  }

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
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--color-white)", borderBottom: "1px solid var(--border-light)" }}>

        {/* Row 1: hamburger · logo · HT/TTC */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 14px 8px", gap: 0 }}>
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: 40, height: 40, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 5,
              background: menuOpen ? "var(--bg-subtle)" : "none",
              border: 0, borderRadius: 10, cursor: "pointer", flexShrink: 0,
            }}
            aria-label="Menu"
          >
            <span style={{ width: 18, height: 2, background: "var(--fg-primary)", borderRadius: 1, display: "block", transition: "transform 0.2s, opacity 0.2s", transform: menuOpen ? "translateY(7px) rotate(45deg)" : "none" }} />
            <span style={{ width: 18, height: 2, background: "var(--fg-primary)", borderRadius: 1, display: "block", opacity: menuOpen ? 0 : 1, transition: "opacity 0.2s" }} />
            <span style={{ width: 18, height: 2, background: "var(--fg-primary)", borderRadius: 1, display: "block", transition: "transform 0.2s, opacity 0.2s", transform: menuOpen ? "translateY(-7px) rotate(-45deg)" : "none" }} />
          </button>

          {/* Logo centered */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <img src="/logo-la-meulerie.png" alt="La Meulerie" style={{ height: 28, width: "auto" }} />
          </div>

          {/* HT/TTC */}
          <button
            onClick={() => setIsHT(!isHT)}
            style={{
              width: 52, height: 28, borderRadius: 14, border: 0, cursor: "pointer",
              background: "var(--fg-primary)", position: "relative", flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 4, left: isHT ? 4 : 24,
              width: 20, height: 20, borderRadius: 10,
              background: "var(--color-white)", transition: "left 0.2s",
            }} />
            <span style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "var(--color-white)",
              letterSpacing: "0.04em",
            }}>
              {isHT ? "HT" : "TTC"}
            </span>
          </button>
        </div>

        {/* Row 2: store select + period select */}
        <div style={{ display: "flex", gap: 8, padding: "0 14px 10px" }}>
          <AppSelect
            value={activeId}
            onChange={v => setStoreId(v)}
            options={storeOptions}
            color={storeColor}
          />
          <AppSelect
            value={periodKey}
            onChange={v => setPeriodKey(v as PeriodOpt)}
            options={[...PERIOD_OPTIONS]}
          />
        </div>

        {/* Hamburger dropdown menu */}
        {menuOpen && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
            background: "var(--color-white)", borderBottom: "1px solid var(--border-light)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}>
            <button
              onClick={() => { dataQ.refetch(); setMenuOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "16px 20px", background: "none", border: 0, cursor: "pointer",
                borderBottom: "1px solid var(--border-light)", textAlign: "left",
              }}
            >
              <span style={{ fontSize: 18 }}>↻</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-primary)" }}>Actualiser les données</span>
            </button>
            <button
              onClick={() => { setMenuOpen(false); goToFullView(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "16px 20px", background: "none", border: 0, cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 18 }}>⊞</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-primary)" }}>Vue complète</span>
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--fg-tertiary)" }}>→</span>
            </button>
          </div>
        )}
      </div>

      {/* Overlay to close menu */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 99 }}
        />
      )}

      {/* ── Body ── */}
      <div style={{ padding: "12px 12px 80px" }}>

        {/* ── 5 KPI accordions ── */}
        <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12, borderLeft: `3px solid ${storeColor}` }}>

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
              {hasUberEats && (() => {
                const ueCa = periodSlice.reduce((s, d) => s + (d.uberEatsCa ?? 0), 0);
                const ueCaHT = Math.round(ueCa / 1.1 * 100) / 100;
                return <DRow label={`dont Uber Eats (${(((isHT ? ueCaHT : ueCa) / totalCA) * 100).toFixed(0)} %)`} value={fmtEURshort(isHT ? ueCaHT : ueCa)} color="#06B553" />;
              })()}
            </>}
          </KPIAccordion>

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
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border-light)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)", marginBottom: 10 }}>
              C.A. de {FR_MONTHS[month - 1]} {year}
            </div>
            {/* Fixed stat boxes */}
            {monthStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                <StatBox
                  label="Dernier jour"
                  value={fmtEURshort(monthStats.todayCa)}
                  sub={monthStats.lastDate.slice(8, 10) + "/" + monthStats.lastDate.slice(5, 7)}
                />
                <StatBox
                  label="Mois en cours"
                  value={fmtEURshort(monthStats.monthTotal)}
                />
                <StatBox
                  label="N-1 mois"
                  value={monthStats.n1Total > 0 ? fmtEURshort(monthStats.n1Total) : "—"}
                />
              </div>
            )}
          </div>
          {/* Scrollable chart */}
          <div style={{ padding: "12px 4px 4px" }}>
            <MobileMonthBars store={store} isHT={isHT} />
          </div>
        </div>

        {/* ── Évolution CA (avec N-1 même jour de semaine) ── */}
        {lineData.length >= 2 && (
          <div style={{ background: "var(--color-white)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 12 }}>
            <div style={{ padding: "14px 16px 10px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-primary)" }}>Évolution du C.A.</div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2, display: "flex", gap: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 2, background: storeColor, display: "inline-block", borderRadius: 1 }} />
                  {isHT ? "HT" : "TTC"} · {periodLabel}
                </span>
                {yoyLineData && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 12, height: 0, border: "1px dashed var(--fg-tertiary)", display: "inline-block" }} />
                    N-1
                  </span>
                )}
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--border-light)", padding: "0 4px 8px" }}>
              <LineChart
                data={lineData}
                height={160}
                period={period}
                series={[{ key: "ca", label: "CA", color: storeColor }]}
                yFormat={fmtEURshort}
                yoyData={yoyLineData}
                uberEatsKey={hasUberEats ? "uberEatsCa" : undefined}
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
              <button
                onClick={goToFullView}
                style={{ display: "block", width: "100%", padding: "10px 0", color: "var(--fg-secondary)", fontSize: 13, background: "none", border: 0, cursor: "pointer", textAlign: "left" }}
              >
                → Vue détaillée complète
              </button>
              <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 8 }}>
                Marges par catégorie, panier moyen détaillé, paiements, Uber Eats, stocks formulaires, historique comparé…
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
