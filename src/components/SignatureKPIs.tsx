"use client";

import type { Product } from "@/lib/apitic/types";

const DETAIL = [
  { label: "Grilled Cheese", terms: ["grilled"] },
  { label: "Sandwich",       terms: ["sandwich"] },
  { label: "Menu Grilled",   terms: ["menu grilled"] },
  { label: "Menu Baguette",  terms: ["menu baguette"] },
] as const;

const TOTALS = [
  { label: "Total Grilled Cheese", groups: [["grilled"], ["menu grilled"]] },
  { label: "Total Baguette",       groups: [["sandwich"], ["menu baguette"]] },
] as const;

function match(products: Product[], terms: readonly string[]): Product[] {
  return products.filter((p) => {
    const n = p.name.toLowerCase();
    return terms.every((t) => n.includes(t));
  });
}

function computeSlot(products: Product[], groups: readonly (readonly string[])[]) {
  let units30d = 0; let units7d = 0;
  for (const terms of groups) {
    const matched = match(products, terms);
    units30d += matched.reduce((s, p) => s + (p.units30d ?? 0), 0);
    units7d  += matched.reduce((s, p) => s + (p.units7d  ?? 0), 0);
  }
  const avg30 = units30d / 30;
  const avg7  = units7d  / 7;
  const trend = avg30 > 0 ? (avg7 - avg30) / avg30 : null;
  return { avg30, avg7, trend, hasData: units30d > 0 };
}

function fmt1(n: number): string { return n.toFixed(1).replace(".", ","); }

function fmtPct(v: number): string {
  const s = Math.abs(v * 100).toFixed(0);
  return (v >= 0 ? "+" : "−") + s + "%";
}

type Props = { products: Product[] };

export function SignatureKPIs({ products }: Props) {
  const totals = TOTALS.map(({ label, groups }) => ({ label, ...computeSlot(products, groups) }));
  const details = DETAIL.map(({ label, terms }) => ({ label, ...computeSlot(products, [terms]) }));

  return (
    <div className="lm-card" style={{ gridColumn: "1 / -1" }}>
      <div className="lm-card-head">
        <div>
          <h3 className="lm-card-title">Consommation Snacking</h3>
          <div className="lm-card-subtitle">Ventes moyennes / jour · moy. 30j vs 7j</div>
        </div>
      </div>
      <div className="lm-card-body padded">
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>

          {/* ── Totaux ── */}
          <div style={{ display: "flex", gap: 32, paddingRight: 28, flexShrink: 0 }}>
            {totals.map(({ label, avg30, avg7, trend, hasData }) => (
              <div key={label} style={{ fontFamily: "var(--font-body)", minWidth: 120 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "var(--fg-secondary)", marginBottom: 6,
                }}>
                  {label}
                </div>
                {hasData ? (
                  <>
                    <div style={{
                      fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700,
                      color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em", lineHeight: 1,
                    }}>
                      {fmt1(avg30)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
                      ventes / jour · moy. 30j
                    </div>
                    {trend !== null && (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: trend >= 0 ? "#08C167" : "#DC2626" }}>
                        {fmtPct(trend)}{" "}
                        <span style={{ fontWeight: 400, color: "var(--fg-tertiary)", fontSize: 10 }}>
                          vs 7j ({fmt1(avg7)}/j)
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--fg-tertiary)", fontStyle: "italic" }}>Pas de données</div>
                )}
              </div>
            ))}
          </div>

          {/* ── Séparateur vertical ── */}
          <div style={{ width: 1, background: "var(--border-light)", flexShrink: 0, alignSelf: "stretch" }} />

          {/* ── Détail ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, paddingLeft: 28, flex: 1 }}>
            {details.map(({ label, avg30, avg7, trend, hasData }) => (
              <div key={label} style={{ fontFamily: "var(--font-body)" }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 6,
                }}>
                  {label}
                </div>
                {hasData ? (
                  <>
                    <div style={{
                      fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700,
                      color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em", lineHeight: 1,
                    }}>
                      {fmt1(avg30)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
                      ventes / jour · moy. 30j
                    </div>
                    {trend !== null && (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: trend >= 0 ? "#08C167" : "#DC2626" }}>
                        {fmtPct(trend)}{" "}
                        <span style={{ fontWeight: 400, color: "var(--fg-tertiary)", fontSize: 10 }}>
                          vs 7j ({fmt1(avg7)}/j)
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--fg-tertiary)", fontStyle: "italic" }}>Pas de données</div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
