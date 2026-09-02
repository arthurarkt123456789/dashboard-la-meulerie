"use client";

import type { Product } from "@/lib/apitic/types";

const TRACKED = [
  { label: "Grilled Cheese", terms: ["grilled"] },
  { label: "Sandwich",       terms: ["sandwich"] },
  { label: "Menu Grilled",   terms: ["menu grilled"] },
  { label: "Menu Baguette",  terms: ["menu baguette"] },
] as const;

function match(products: Product[], terms: readonly string[]): Product[] {
  return products.filter((p) => {
    const n = p.name.toLowerCase();
    return terms.every((t) => n.includes(t));
  });
}

function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function fmtPct(v: number): string {
  const s = Math.abs(v * 100).toFixed(0);
  return (v >= 0 ? "+" : "−") + s + "%";
}

type Props = { products: Product[] };

export function SignatureKPIs({ products }: Props) {
  const slots = TRACKED.map(({ label, terms }) => {
    const matched = match(products, terms);
    const units30d = matched.reduce((s, p) => s + (p.units30d ?? 0), 0);
    const units7d  = matched.reduce((s, p) => s + (p.units7d  ?? 0), 0);
    const avg30 = units30d / 30;
    const avg7  = units7d  / 7;
    const trend = avg30 > 0 ? (avg7 - avg30) / avg30 : null;
    return { label, avg30, avg7, trend, hasData: units30d > 0 };
  });

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
      marginBottom: 12,
    }}>
      {slots.map(({ label, avg30, avg7, trend, hasData }) => (
        <div
          key={label}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            fontFamily: "var(--font-body)",
          }}
        >
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--fg-tertiary)",
            marginBottom: 6,
          }}>
            {label}
          </div>

          {hasData ? (
            <>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 700,
                color: "var(--fg-primary)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}>
                {fmt1(avg30)}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 3 }}>
                ventes / jour · moy. 30j
              </div>
              {trend !== null && (
                <div style={{
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: trend >= 0 ? "#16a34a" : "#dc2626",
                }}>
                  {fmtPct(trend)}{" "}
                  <span style={{ fontWeight: 400, color: "var(--fg-tertiary)", fontSize: 10 }}>
                    vs moy. 7j ({fmt1(avg7)}/j)
                  </span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)", fontStyle: "italic" }}>
              Pas de données
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
