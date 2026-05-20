"use client";

import { fmtEUR, fmtEURshort, fmtNum } from "@/lib/format";
import type { PeriodKey, Product } from "@/lib/apitic/types";
import type { SegmentFilterValue } from "./SegmentFilter";

type Props = {
  products: Product[];
  period: PeriodKey;
  segmentFilter: SegmentFilterValue;
  limit?: number;
};

export function TopProducts({
  products,
  period,
  segmentFilter,
  limit = 10,
}: Props) {
  let list = products;
  if (segmentFilter !== "all") {
    list = list.filter((p) => p.segment === segmentFilter);
  }
  list = list.slice(0, limit);
  if (list.length === 0) {
    return <div className="lm-empty">Aucun produit sur cette période.</div>;
  }
  const revenueKey: "revenue7d" | "revenue30d" =
    period === "30d" || period === "90d" ? "revenue30d" : "revenue7d";
  const unitsKey: "unitsToday" | "units7d" | "units30d" =
    period === "today"
      ? "unitsToday"
      : period === "30d" || period === "90d"
        ? "units30d"
        : "units7d";
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
