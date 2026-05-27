type Props = {
  margeHT: number;
  margeCoveredCAHT: number;
  caHT: number;
  margeFromagerieHT: number;
  margeSnackingHT: number;
  margeEpicerieHT: number;
  margeMerchHT: number;
  fromagerieCAHT: number;
  snackingCAHT: number;
  epicerieCAHT: number;
  merchCAHT: number;
  /** Difference in margin rates in pp (e.g. 0.023 = +2.3 pp). */
  margeDelta: number | null;
  /** Same unit: pp difference vs N-1. */
  yoyMargeDelta: number | null;
  yoyAvailable: boolean;
  partial?: boolean;
};

function fmtRate(n: number): string {
  return (Math.round(n * 1000) / 10).toFixed(1).replace(".", ",") + " %";
}

function fmtPP(pp: number): string {
  const val = (Math.round(pp * 10000) / 100).toFixed(2).replace(".", ",");
  return (pp >= 0 ? "+" : "") + val + " pp";
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

function ppClass(pp: number | null | undefined): string {
  if (typeof pp !== "number" || !isFinite(pp)) return "neu";
  if (pp > 0) return "pos";
  if (pp < 0) return "neg";
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
  fromagerieCAHT,
  snackingCAHT,
  epicerieCAHT,
  merchCAHT,
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
        marginTop: 2,
        marginBottom: 6,
        fontVariantNumeric: "tabular-nums",
      }}>
        {fmtEurCompact(margeHT)} HT
        {coverage != null && (
          <span style={{ marginLeft: 6 }}>· couvre {fmtRate(coverage)} du CA</span>
        )}
      </div>
      <div className="lm-kpi-deltas" style={{ marginTop: 8 }}>
        {typeof margeDelta === "number" && isFinite(margeDelta) && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + ppClass(margeDelta)}>
              {fmtPP(margeDelta)}
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
            <span className={"lm-delta " + ppClass(yoyMargeDelta)}>
              {fmtPP(yoyMargeDelta)}
            </span>
            <span className="lm-delta-label">vs. last year</span>
          </div>
        ) : null}
      </div>
      {margeFromagerieHT !== 0 && fromagerieCAHT > 0 && (
        <MargeRow label="Fromagerie" color="var(--color-dark)" marge={margeFromagerieHT} caHT={fromagerieCAHT} />
      )}
      {margeSnackingHT !== 0 && snackingCAHT > 0 && (
        <MargeRow label="Snacking" color="var(--color-coral)" marge={margeSnackingHT} caHT={snackingCAHT} />
      )}
      {margeEpicerieHT !== 0 && epicerieCAHT > 0 && (
        <MargeRow label="Épicerie" color="#1A5EA8" marge={margeEpicerieHT} caHT={epicerieCAHT} />
      )}
      {margeMerchHT !== 0 && merchCAHT > 0 && (
        <MargeRow label="Merch" color="#7C3AED" marge={margeMerchHT} caHT={merchCAHT} />
      )}
    </div>
  );
}

function MargeRow({
  label,
  color,
  marge,
  caHT,
}: {
  label: string;
  color: string;
  marge: number;
  caHT: number;
}) {
  const rate = marge / caHT;
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
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: 5,
        fontVariantNumeric: "tabular-nums",
      }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 16,
          color: "var(--fg-primary)",
          letterSpacing: "-0.01em",
        }}>
          {fmtRate(rate)}
        </span>
        <span style={{
          fontFamily: "var(--font-body)",
          fontSize: 10,
          color: "var(--fg-tertiary)",
        }}>
          {fmtEurCompact(marge)}
        </span>
      </div>
    </div>
  );
}
