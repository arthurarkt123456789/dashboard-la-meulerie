"use client";

import type { Product, PeriodSelection } from "@/lib/apitic/types";

const GC_TERMS:  string[][] = [["grilled"], ["menu grilled"]];
const BAG_TERMS: string[][] = [["sandwich"], ["menu baguette"]];

const GC_DETAIL: { label: string; terms: string[] }[] = [
  { label: "Grilled Cheese", terms: ["grilled"] },
  { label: "Menu Grilled",   terms: ["menu grilled"] },
];
const BAG_DETAIL: { label: string; terms: string[] }[] = [
  { label: "Sandwich",      terms: ["sandwich"] },
  { label: "Menu Baguette", terms: ["menu baguette"] },
];

function match(products: Product[], terms: string[]): Product[] {
  return products.filter((p) => {
    const n = p.name.toLowerCase();
    return terms.every((t) => n.includes(t));
  });
}

function computeSlot(products: Product[], termGroups: string[][]) {
  let units7d = 0; let units30d = 0; let units90d = 0;
  for (const terms of termGroups) {
    const matched = match(products, terms);
    units7d  += matched.reduce((s, p) => s + (p.units7d  ?? 0), 0);
    units30d += matched.reduce((s, p) => s + (p.units30d ?? 0), 0);
    units90d += matched.reduce((s, p) => s + (p.units90d ?? 0), 0);
  }
  const avg7  = units7d  / 7;
  const avg30 = units30d / 30;
  const avg90 = units90d / 90;
  return { avg7, avg30, avg90, hasData: units30d > 0 };
}

function fmt1(n: number): string { return n.toFixed(1).replace(".", ","); }

function fmtPct(v: number): string {
  const s = Math.abs(v * 100).toFixed(0);
  return (v >= 0 ? "+" : "−") + s + "%";
}

type Slot = ReturnType<typeof computeSlot>;
type Props = { products: Product[]; period: PeriodSelection };

type Window = "today" | "7d" | "30d" | "90d";

function resolveWindow(period: PeriodSelection): Window {
  if (period.kind === "preset") {
    if (period.key === "today") return "today";
    if (period.key === "7d")    return "7d";
    if (period.key === "30d")   return "30d";
  }
  return "90d"; // 90d preset, exercice, month, range → use 90d window
}

export function SignatureKPIs({ products, period }: Props) {
  const win = resolveWindow(period);

  const primaryLabel = win === "today" ? "aujourd'hui" : win === "7d" ? "moy. 7j" : win === "30d" ? "moy. 30j" : "moy. 90j";
  const trendRef     = win === "today" ? "vs moy. 7j" : win === "7d" ? "vs moy. 30j" : win === "30d" ? "vs moy. 90j" : "vs moy. 30j";

  const gcDetail  = GC_DETAIL.map(({ label, terms }) => ({ label, ...computeSlot(products, [terms]) }));
  const bagDetail = BAG_DETAIL.map(({ label, terms }) => ({ label, ...computeSlot(products, [terms]) }));
  const gcTotal   = computeSlot(products, GC_TERMS);
  const bagTotal  = computeSlot(products, BAG_TERMS);

  function pickPrimary(s: Slot) {
    if (win === "today") return s.avg7; // no unitsToday in computeSlot, use avg7 as best proxy
    if (win === "7d")    return s.avg7;
    if (win === "30d")   return s.avg30;
    return s.avg90;
  }
  function pickOther(s: Slot) {
    if (win === "today") return s.avg30;
    if (win === "7d")    return s.avg30;
    if (win === "30d")   return s.avg90;
    return s.avg30;
  }
  function pickTrend(s: Slot) {
    const p = pickPrimary(s); const o = pickOther(s);
    return o > 0 ? (p - o) / o : null;
  }

  const grandAvg = pickPrimary(gcTotal) + pickPrimary(bagTotal);

  function KPI({ label, slot, big }: { label: string; slot: Slot; big: boolean }) {
    const primary = pickPrimary(slot);
    const other   = pickOther(slot);
    const trend   = pickTrend(slot);
    return (
      <div style={{ fontFamily: "var(--font-body)", minWidth: big ? 115 : 80 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: big ? "var(--fg-secondary)" : "var(--fg-tertiary)",
          marginBottom: 6,
        }}>
          {label}
        </div>
        {slot.hasData ? (
          <>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: big ? 30 : 22,
              fontWeight: 700,
              color: "var(--fg-primary)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}>
              {fmt1(primary)}
            </div>
            <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
              {primaryLabel}
            </div>
            {trend !== null && (
              <div style={{
                marginTop: 6, fontSize: 11, fontWeight: 600,
                color: trend >= 0 ? "#08C167" : "#DC2626",
              }}>
                {fmtPct(trend)}{" "}
                <span style={{ fontWeight: 400, color: "var(--fg-tertiary)", fontSize: 10 }}>
                  {trendRef} ({fmt1(other)}/j)
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--fg-tertiary)", fontStyle: "italic" }}>Pas de données</div>
        )}
      </div>
    );
  }

  return (
    <div className="lm-card" style={{ gridColumn: "1 / -1" }}>
      <div className="lm-card-head">
        <div>
          <h3 className="lm-card-title">Consommation Snacking</h3>
          <div className="lm-card-subtitle">
            Ventes moyennes / jour · {primaryLabel} · tendance {trendRef}
          </div>
        </div>
      </div>
      <div className="lm-card-body padded">
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>

          {/* ── Groupe Grilled Cheese ── */}
          <div style={{ display: "flex", gap: 20, paddingRight: 28, flexShrink: 0, alignItems: "flex-start" }}>
            <KPI label="Total Grilled Cheese" slot={gcTotal} big={true} />
            {gcDetail.map(({ label, ...slot }) => (
              <KPI key={label} label={label} slot={slot} big={false} />
            ))}
          </div>

          {/* ── Séparateur ── */}
          <div style={{ width: 1, background: "var(--border-light)", flexShrink: 0, alignSelf: "stretch" }} />

          {/* ── Groupe Baguette ── */}
          <div style={{ display: "flex", gap: 20, paddingLeft: 28, paddingRight: 28, flex: 1, alignItems: "flex-start" }}>
            <KPI label="Total Baguette" slot={bagTotal} big={true} />
            {bagDetail.map(({ label, ...slot }) => (
              <KPI key={label} label={label} slot={slot} big={false} />
            ))}
          </div>

          {/* ── Séparateur ── */}
          <div style={{ width: 1, background: "var(--border-light)", flexShrink: 0, alignSelf: "stretch" }} />

          {/* ── Total Snacking ── */}
          <div style={{ paddingLeft: 28, flexShrink: 0, fontFamily: "var(--font-body)" }}>
            <div style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--fg-secondary)", marginBottom: 6,
            }}>
              Total Snacking
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700,
              color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em", lineHeight: 1,
            }}>
              {fmt1(grandAvg)}
            </div>
            <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
              {primaryLabel}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
