"use client";

import type { Product, PeriodSelection } from "@/lib/apitic/types";

const GC_TERMS:  string[][] = [["grilled"], ["menu grilled"]];
const BAG_TERMS: string[][] = [["sandwich"], ["menu baguette"]];

const DETAIL: { label: string; terms: string[] }[] = [
  { label: "Grilled Cheese", terms: ["grilled"] },
  { label: "Menu Grilled",   terms: ["menu grilled"] },
  { label: "Sandwich",       terms: ["sandwich"] },
  { label: "Menu Baguette",  terms: ["menu baguette"] },
];

function match(products: Product[], terms: string[]): Product[] {
  return products.filter((p) => {
    const n = p.name.toLowerCase();
    return terms.every((t) => n.includes(t));
  });
}

function computeSlot(products: Product[], termGroups: string[][]) {
  let units7d = 0; let units30d = 0; let units90d = 0;
  let unitsExercice = 0; let unitsExerciceN1 = 0;
  let exerciceDays = 0; let exerciceN1Days = 0;
  for (const terms of termGroups) {
    const matched = match(products, terms);
    units7d  += matched.reduce((s, p) => s + (p.units7d  ?? 0), 0);
    units30d += matched.reduce((s, p) => s + (p.units30d ?? 0), 0);
    units90d += matched.reduce((s, p) => s + (p.units90d ?? 0), 0);
    unitsExercice   += matched.reduce((s, p) => s + (p.unitsExercice   ?? 0), 0);
    unitsExerciceN1 += matched.reduce((s, p) => s + (p.unitsExerciceN1 ?? 0), 0);
    if (matched.length > 0) {
      exerciceDays   = Math.max(exerciceDays,   matched[0].exerciceDays   ?? 0);
      exerciceN1Days = Math.max(exerciceN1Days, matched[0].exerciceN1Days ?? 0);
    }
  }
  const avg7          = units7d  / 7;
  const avg30         = units30d / 30;
  const avg90         = units90d / 90;
  const avgExercice   = exerciceDays   > 0 ? unitsExercice   / exerciceDays   : 0;
  const avgExerciceN1 = exerciceN1Days > 0 ? unitsExerciceN1 / exerciceN1Days : 0;
  return { avg7, avg30, avg90, avgExercice, avgExerciceN1, hasData: units30d > 0 || unitsExercice > 0 };
}

function fmtInt(n: number): string { return Math.round(n).toString(); }

function fmtPct(v: number): string {
  const s = Math.abs(v * 100).toFixed(0);
  return (v >= 0 ? "+" : "−") + s + "%";
}

type Slot = ReturnType<typeof computeSlot>;
type Props = {
  products: Product[];
  period: PeriodSelection;
  /** Estimated daily sandwich units from Uber Eats (UE CA / 10 / days). Shows "Estimatif UE inclus" badge. */
  uberEatsDailyUnits?: number;
};

type Window = "today" | "7d" | "30d" | "90d" | "exercice";

function resolveWindow(period: PeriodSelection): Window {
  if (period.kind === "fiscal-year-todate") return "exercice";
  if (period.kind === "preset") {
    if (period.key === "today") return "today";
    if (period.key === "7d")    return "7d";
    if (period.key === "30d")   return "30d";
  }
  return "90d";
}

export function SignatureKPIs({ products, period, uberEatsDailyUnits = 0 }: Props) {
  const win = resolveWindow(period);

  const primaryLabel =
    win === "exercice" ? "moy./j exercice" :
    win === "today"    ? "aujourd'hui" :
    win === "7d"       ? "moy. 7j" :
    win === "30d"      ? "moy. 30j" : "moy. 90j";
  const trendRef =
    win === "exercice" ? "vs N-1" :
    win === "today"    ? "vs 7j" :
    win === "7d"       ? "vs 30j" :
    win === "30d"      ? "vs 90j" : "vs 30j";

  const gcTotal  = computeSlot(products, GC_TERMS);
  const bagTotal = computeSlot(products, BAG_TERMS);
  const details  = DETAIL.map(({ label, terms }) => ({ label, ...computeSlot(products, [terms]) }));

  function pickPrimary(s: Slot) {
    if (win === "exercice") return s.avgExercice;
    if (win === "today" || win === "7d") return s.avg7;
    if (win === "30d") return s.avg30;
    return s.avg90;
  }
  function pickOther(s: Slot) {
    if (win === "exercice") return s.avgExerciceN1;
    if (win === "today" || win === "7d") return s.avg30;
    if (win === "30d") return s.avg90;
    return s.avg30;
  }
  function pickTrend(s: Slot) {
    const p = pickPrimary(s); const o = pickOther(s);
    return o > 0 ? (p - o) / o : null;
  }

  // UberEats estimate: split UE daily units by boutique GC/Baguette ratio
  const gcBoutique  = pickPrimary(gcTotal);
  const bagBoutique = pickPrimary(bagTotal);
  const total = gcBoutique + bagBoutique;
  const gcRatio  = total > 0 ? gcBoutique  / total : 0.5;
  const bagRatio = total > 0 ? bagBoutique / total : 0.5;
  const ueGc  = uberEatsDailyUnits * gcRatio;
  const ueBag = uberEatsDailyUnits * bagRatio;
  const hasUE = uberEatsDailyUnits > 0;

  const grandTotal = pickPrimary(gcTotal) + pickPrimary(bagTotal) + (hasUE ? uberEatsDailyUnits : 0);

  // ── Big KPI block (totaux) ──────────────────────────────────────────────
  function BigKPI({ label, slot, ueBonus = 0 }: { label: string; slot: Slot; ueBonus?: number }) {
    const primary = pickPrimary(slot) + ueBonus;
    const other   = pickOther(slot);
    const boutique = pickPrimary(slot);
    const trend   = (() => {
      const o = pickOther(slot);
      return o > 0 ? (primary - o) / o : null;
    })();
    return (
      <div style={{ fontFamily: "var(--font-body)", minWidth: 110 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.06em", color: "var(--fg-secondary)", marginBottom: 6,
        }}>
          {label}
        </div>
        {slot.hasData ? (
          <>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700,
              color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em", lineHeight: 1,
            }}>
              {fmtInt(primary)}
            </div>
            {ueBonus > 0 && (
              <div style={{ fontSize: 9, color: "#15803d", marginTop: 2, fontWeight: 500 }}>
                {fmtInt(boutique)} boutique + {fmtInt(ueBonus)} UE est.
              </div>
            )}
            <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: ueBonus > 0 ? 2 : 3 }}>{primaryLabel}</div>
            {trend !== null && (
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: trend >= 0 ? "#08C167" : "#DC2626" }}>
                {fmtPct(trend)}{" "}
                <span style={{ fontWeight: 400, color: "var(--fg-tertiary)", fontSize: 10 }}>
                  {trendRef} ({fmtInt(other)}/j)
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

  // ── Small KPI block (détail) ────────────────────────────────────────────
  function SmallKPI({ label, slot }: { label: string; slot: Slot }) {
    const primary = pickPrimary(slot);
    const trend   = pickTrend(slot);
    return (
      <div style={{ fontFamily: "var(--font-body)", minWidth: 70 }}>
        <div style={{
          fontSize: 9, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 5,
        }}>
          {label}
        </div>
        {slot.hasData ? (
          <>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
              color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em", lineHeight: 1,
            }}>
              {fmtInt(primary)}
            </div>
            <div style={{ fontSize: 9, color: "var(--fg-tertiary)", marginTop: 2 }}>{primaryLabel}</div>
            {trend !== null && (
              <div style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: trend >= 0 ? "#08C167" : "#DC2626" }}>
                {fmtPct(trend)}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: "var(--fg-tertiary)", fontStyle: "italic" }}>—</div>
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
            Ventes / jour · {primaryLabel} · tendance {trendRef}
          </div>
        </div>
      </div>
      <div className="lm-card-body" style={{ padding: 0 }}>
        <div className="snacking-outer" style={{ display: "flex", alignItems: "stretch" }}>

          {/* ── Total Grilled Cheese ── */}
          <div className="snacking-total-item" style={{ padding: "16px 20px", flexShrink: 0 }}>
            <BigKPI label="Total Grilled Cheese" slot={gcTotal} ueBonus={ueGc} />
          </div>

          <div className="snacking-sep" style={{ width: 1, background: "var(--border-light)", alignSelf: "stretch" }} />

          {/* ── Total Baguette ── */}
          <div className="snacking-total-item" style={{ padding: "16px 20px", flexShrink: 0 }}>
            <BigKPI label="Total Baguette" slot={bagTotal} ueBonus={ueBag} />
          </div>

          <div className="snacking-sep" style={{ width: 1, background: "var(--border-light)", alignSelf: "stretch" }} />

          {/* ── Total Snacking — fond gris ── */}
          <div className="snacking-grand" style={{
            padding: "16px 20px", flexShrink: 0,
            background: "var(--bg-subtle)",
            display: "flex", alignItems: "center",
          }}>
            <div style={{ fontFamily: "var(--font-body)" }}>
              <div style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--fg-secondary)", marginBottom: 6,
              }}>
                Total Snacking
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700,
                color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em", lineHeight: 1,
              }}>
                {fmtInt(grandTotal)}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
                {primaryLabel}
              </div>
            </div>
          </div>

          <div className="snacking-sep" style={{ width: 1, background: "var(--border-light)", alignSelf: "stretch" }} />

          {/* ── Détail ── */}
          <div className="snacking-detail-wrap" style={{ flex: 1, minWidth: 0 }}>
            <div className="snacking-detail" style={{ display: "flex", height: "100%" }}>
              {details.map(({ label, ...slot }) => (
                <div key={label} className="snacking-detail-item" style={{
                  padding: "16px 20px",
                  borderRight: "1px solid var(--border-light)",
                  flex: 1,
                }}>
                  <SmallKPI label={label} slot={slot} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
