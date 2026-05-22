import { fmtEURshort, fmtNum, fmtPctNoSign } from "@/lib/format";
import type { FormuleStats } from "@/lib/apitic/types";
import type { AmountMode } from "./AmountModeToggle";

type Props = {
  formules: FormuleStats;
  amountMode: AmountMode;
};

const LABELS: Record<"grilled" | "baguette", { name: string; color: string }> = {
  grilled: { name: "Menu Grilled", color: "var(--color-coral)" },
  baguette: { name: "Menu Baguette", color: "var(--color-dark)" },
};

export function FormulesCard({ formules, amountMode }: Props) {
  const isHT = amountMode === "HT";
  const snackingCA = isHT ? formules.snackingCAHT : formules.snackingCA;
  const snackingTx = formules.snackingTx;
  const totalFormulesCA = (["grilled", "baguette"] as const).reduce(
    (s, k) => s + (isHT ? formules.byKind[k].caHT : formules.byKind[k].ca),
    0,
  );
  const totalFormulesUnits = (["grilled", "baguette"] as const).reduce(
    (s, k) => s + formules.byKind[k].units,
    0,
  );
  const totalSharePct = snackingCA > 0 ? totalFormulesCA / snackingCA : 0;
  const totalTicketSharePct = snackingTx > 0 ? totalFormulesUnits / snackingTx : 0;

  const noFormulesDetected = totalFormulesUnits === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {noFormulesDetected ? (
        <div className="lm-empty" style={{ padding: "12px 0" }}>
          Aucun produit n'a été détecté comme menu lunch sur les{" "}
          {formules.days} derniers jours. Vérifie que tes produits contiennent
          &quot;Menu Grilled&quot; ou &quot;Menu Baguette&quot; dans leur nom
          APITIC.
        </div>
      ) : (
        <>
          {(["grilled", "baguette"] as const).map((kind) => {
            const v = formules.byKind[kind];
            const ca = isHT ? v.caHT : v.ca;
            const shareCA = snackingCA > 0 ? ca / snackingCA : 0;
            const shareTx = snackingTx > 0 ? v.units / snackingTx : 0;
            const meta = LABELS[kind];
            return (
              <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        background: meta.color,
                        borderRadius: 1,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--fg-primary)",
                      }}
                    >
                      {meta.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: 18,
                      color: "var(--fg-primary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtPctNoSign(shareCA)}
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 6,
                    background: "var(--bg-subtle)",
                    borderRadius: 2,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, shareCA * 100)}%`,
                      height: "100%",
                      background: meta.color,
                      borderRadius: 2,
                      transition: "width 400ms ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: "var(--fg-secondary)",
                    fontVariantNumeric: "tabular-nums",
                    display: "flex",
                    gap: 12,
                  }}
                >
                  <span>{fmtNum(v.units)} ventes</span>
                  <span>{fmtEURshort(ca)} {isHT ? "HT" : "TTC"}</span>
                  <span>{fmtPctNoSign(shareTx)} des tickets snacking</span>
                </div>
              </div>
            );
          })}

          <div
            style={{
              marginTop: 6,
              paddingTop: 10,
              borderTop: "1px solid var(--border-light)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <div className="lm-label" style={{ fontSize: 10 }}>
                Part CA snacking
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  color: "var(--fg-primary)",
                  marginTop: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtPctNoSign(totalSharePct)}
              </div>
            </div>
            <div>
              <div className="lm-label" style={{ fontSize: 10 }}>
                Part tickets snacking
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  color: "var(--fg-primary)",
                  marginTop: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtPctNoSign(totalTicketSharePct)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
