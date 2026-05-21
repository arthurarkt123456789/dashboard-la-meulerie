"use client";

import { fmtEUR, fmtEURshort, fmtNum } from "@/lib/format";
import type { PeriodSelection, Product } from "@/lib/apitic/types";
import type { SegmentFilterValue } from "./SegmentFilter";

type Props = {
  products: Product[];
  period: PeriodSelection;
  segmentFilter: SegmentFilterValue;
  limit?: number;
};

export function TopProducts({
  products,
  period,
  segmentFilter,
  limit = 10,
}: Props) {
  const presetKey =
    period.kind === "preset" ? period.key : "30d"; // month → use 30d aggregates
  const revenueKey: "revenue7d" | "revenue30d" =
    presetKey === "30d" || presetKey === "90d" ? "revenue30d" : "revenue7d";
  const unitsKey: "unitsToday" | "units7d" | "units30d" =
    presetKey === "today"
      ? "unitsToday"
      : presetKey === "30d" || presetKey === "90d"
        ? "units30d"
        : "units7d";

  let list = products;
  if (segmentFilter !== "all") {
    list = list.filter((p) => p.segment === segmentFilter);
  }
  // Re-sort by the same revenue key we'll display — otherwise the top N
  // returned by the aggregator (sorted by revenue30d) doesn't match the
  // ranking the user sees when looking at the 7-day column.
  list = [...list].sort((a, b) => b[revenueKey] - a[revenueKey]).slice(0, limit);
  if (list.length === 0) {
    return <div className="lm-empty">Aucun produit sur cette période.</div>;
  }
  const max = Math.max(...list.map((p) => p[revenueKey])) || 1;

  return (
    <div className="lm-products">
      <div className="lm-products-head">
        <div />
        <div>Produit</div>
        <div>Catégorie</div>
        <div style={{ textAlign: "right" }}>Unités</div>
        <div style={{ textAlign: "right" }}>CA</div>
      </div>
      {list.map((p, i) => {
        const pct = (p[revenueKey] / max) * 100;
        return (
          <div key={p.name} className="lm-product-row">
            <div className="lm-product-rank">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="lm-product-name">
              <div>{p.name}</div>
              <div className="lm-product-meta">
                {p.segment} · {p.unit} · {fmtEUR(p.price)}
              </div>
            </div>
            <div className="lm-product-cat">{p.category}</div>
            <div className="lm-product-units">{fmtNum(p[unitsKey])}</div>
            <div className="lm-product-revenue">
              <div className="lm-product-bar">
                <div
                  style={{
                    width: pct + "%",
                    background:
                      p.segment === "Fromagerie"
                        ? "var(--color-dark)"
                        : "var(--color-coral)",
                  }}
                />
              </div>
              <div className="lm-product-revenue-val">
                {fmtEURshort(p[revenueKey])}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
