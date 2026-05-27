import { fmtPct } from "@/lib/format";

type Props = {
  margeHT: number;
  margeCoveredCAHT: number;
  caHT: number;
  margeFromagerieHT: number;
  margeSnackingHT: number;
  margeEpicerieHT: number;
  margeMerchHT: number;
  margeDelta: number | null;
  yoyMargeDelta: number | null;
  yoyAvailable: boolean;
  partial?: boolean;
};

function fmtRate(n: number): string {
  return (Math.round(n * 1000) / 10).toFixed(1).replace(".", ",") + " %";
}

function fmtEurCompact(n: number): string {
  if (Math.abs(n) >= 1000) {
    return (
      (Math.round(n / 10) / 100).toLocaleString("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + " k€"
    );
  }
  return Math.round(n) + " €";
}

function deltaClass(delta: number | null | undefined): string {
  if (typeof delta !== "number" || !isFinite(delta)) return "neu";
  if (delta > 0) return "pos";
  if (delta < 0) return "neg";
  return "neu";
}

export function MarginBreakdown({
  margeHT,
  margeCoveredCAHT,
  caHT,
  margeFromagerieHT,
  margeSnackingHT,
  margeEpicerieHT,
  margeMerchHT,
  margeDelta,
  yoyMargeDelta,
  yoyAvailable,
  partial,
}: Props) {
  const margeRate = margeCoveredCAHT > 0 ? margeHT / margeCoveredCAHT : null;
  const coverage = caHT > 0 ? margeCoveredCAHT / caHT : null;

  return (
    <div className="lm-card lm-kpi">
      <div className="lm-kpi-head">
        <span className="lm-label">Marge Brute</span>
        {partial && <span className="lm-tag lm-tag-live">En cours</span>}
      </div>
      <div className="lm-kpi-value-row">
        <div className="lm-kpi-value">
          {margeRate != null ? fmtRate(margeRate) : "—"}
        </div>
      </div>
      <div style={{
        fontFamily: "var(--font-body)",
        fontSize: 11,
        color: "var(--fg-tertiary)",
        marginTop: -2,
        marginBottom: 2,
        fontVariantNumeric: "tabular-nums",
      }}>
        {fmtEurCompact(margeHT)} HT
        {coverage != null && (
          <span style={{ marginLeft: 6 }}>· couvre {fmtRate(coverage)} du CA</span>
        )}
      </div>
      <div className="lm-kpi-deltas">
        {typeof margeDelta === "number" && isFinite(margeDelta) && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(margeDelta)}>
              {margeDelta > 0 ? "↑ " : margeDelta < 0 ? "↓ " : ""}
              {fmtPct(margeDelta).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs. période préc.</span>
          </div>
        )}
        {yoyAvailable === false ? (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">—</span>
            <span className="lm-delta-label">last year N/A</span>
          </div>
        ) : typeof yoyMargeDelta === "number" && isFinite(yoyMargeDelta) ? (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(yoyMargeDelta)}>
              {yoyMargeDelta > 0 ? "↑ " : yoyMargeDelta < 0 ? "↓ " : ""}
              {fmtPct(yoyMargeDelta).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs. last year</span>
          </div>
        ) : null}
      </div>
      {margeFromagerieHT !== 0 && (
        <MargeRow label="Fromagerie" color="var(--color-dark)" value={margeFromagerieHT} />
      )}
      {margeSnackingHT !== 0 && (
        <MargeRow label="Snacking" color="var(--color-coral)" value={margeSnackingHT} />
      )}
      {margeEpicerieHT !== 0 && (
        <MargeRow label="Épicerie" color="#1A5EA8" value={margeEpicerieHT} />
      )}
      {margeMerchHT !== 0 && (
        <MargeRow label="Merch" color="#7C3AED" value={margeMerchHT} />
      )}
    </div>
  );
}

function MargeRow({ label, color, value }: { label: string; color: string; value: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "8px 1fr auto",
        gap: 8,
        alignItems: "center",
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid var(--border-light)",
      }}
    >
      <span style={{ width: 8, height: 8, background: color, borderRadius: 1 }} />
      <div style={{
        fontFamily: "var(--font-body)",
        fontSize: 11,
        color: "var(--fg-secondary)",
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <span style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 16,
        color: "var(--fg-primary)",
        letterSpacing: "-0.01em",
        fontVariantNumeric: "tabular-nums",
      }}>
        {fmtEurCompact(value)}
      </span>
    </div>
  );
}
