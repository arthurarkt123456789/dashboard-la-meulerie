import { fmtPct, fmtPctNoSign } from "@/lib/format";

type SegmentCA = {
  value: number;
  share: number;
  yoyDelta?: number | null;
};

type Props = {
  label: string;
  total: number;
  delta?: number | null;
  yoyDelta?: number | null;
  yoyAvailable?: boolean;
  suffix: string;
  trendDelta?: number | null;
  trendLabel?: string;
  networkShare?: number | null;
  networkRank?: number | null;
  fromagerie: SegmentCA;
  snacking: SegmentCA;
  epicerie: SegmentCA;
  merch: SegmentCA;
  partial?: boolean;
};

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

export function CABreakdown({
  label,
  total,
  delta,
  yoyDelta,
  yoyAvailable,
  suffix,
  trendDelta,
  trendLabel,
  networkShare,
  networkRank,
  fromagerie,
  snacking,
  epicerie,
  merch,
  partial,
}: Props) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const hasYoy = yoyAvailable !== false && typeof yoyDelta === "number" && isFinite(yoyDelta);

  return (
    <div className="lm-card lm-kpi" style={{ borderLeft: "3px solid var(--color-coral)" }}>
      <div className="lm-kpi-head">
        <span className="lm-label">{label}</span>
        {partial && <span className="lm-tag lm-tag-live">En cours</span>}
      </div>
      <div className="lm-kpi-value-row">
        <div className="lm-kpi-value">
          {total >= 1000
            ? (total / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : total.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
          <span className="lm-kpi-suffix">
            {total >= 1000 ? ` k${suffix}` : ` ${suffix}`}
          </span>
        </div>
      </div>
      <div className="lm-kpi-deltas" style={{ marginTop: 20 }}>
        {hasDelta && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(delta)}>
              {(delta ?? 0) > 0 ? "↑ " : (delta ?? 0) < 0 ? "↓ " : ""}
              {fmtPct(delta!).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs. période préc.</span>
          </div>
        )}
        {yoyAvailable === false ? (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">—</span>
            <span className="lm-delta-label">last year N/A</span>
          </div>
        ) : hasYoy ? (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(yoyDelta)}>
              {(yoyDelta ?? 0) > 0 ? "↑ " : (yoyDelta ?? 0) < 0 ? "↓ " : ""}
              {fmtPct(yoyDelta!).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs. last year</span>
          </div>
        ) : null}
        {trendDelta != null && trendLabel && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(trendDelta)}>
              {trendDelta > 0 ? "↑ " : trendDelta < 0 ? "↓ " : ""}
              {fmtPctNoSign(Math.abs(trendDelta))}
            </span>
            <span className="lm-delta-label">{trendLabel}</span>
          </div>
        )}
        {networkShare != null && (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">
              {(networkShare * 100).toFixed(0)} %
            </span>
            <span className="lm-delta-label">
              du réseau{networkRank != null ? ` · #${networkRank}` : ""}
            </span>
          </div>
        )}
      </div>
      {fromagerie.value > 0 && (
        <CARow label="Fromagerie" color="var(--color-dark)" seg={fromagerie} yoyAvailable={yoyAvailable} />
      )}
      {snacking.value > 0 && (
        <CARow label="Snacking" color="var(--color-coral)" seg={snacking} yoyAvailable={yoyAvailable} />
      )}
      {epicerie.value > 0 && (
        <CARow label="Épicerie" color="#1A5EA8" seg={epicerie} yoyAvailable={yoyAvailable} />
      )}
      {merch.value > 0 && (
        <CARow label="Merch" color="#7C3AED" seg={merch} yoyAvailable={yoyAvailable} />
      )}
    </div>
  );
}

function CARow({
  label,
  color,
  seg,
  yoyAvailable,
}: {
  label: string;
  color: string;
  seg: SegmentCA;
  yoyAvailable?: boolean;
}) {
  const hasYoy =
    yoyAvailable !== false &&
    typeof seg.yoyDelta === "number" &&
    isFinite(seg.yoyDelta);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "8px 1fr auto",
        gap: "0 8px",
        alignItems: "center",
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid var(--border-light)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          background: color,
          borderRadius: 1,
          alignSelf: "flex-start",
          marginTop: 4,
        }}
      />
      <div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--fg-secondary)",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--fg-tertiary)",
            marginTop: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {(seg.share * 100).toFixed(0)} % du CA
        </div>
        {hasYoy && (
          <div style={{ marginTop: 3 }}>
            <span
              className={"lm-delta " + deltaClass(seg.yoyDelta)}
              style={{ fontSize: 10, whiteSpace: "nowrap" }}
            >
              {seg.yoyDelta! > 0 ? "↑" : seg.yoyDelta! < 0 ? "↓" : "·"}{" "}
              {fmtPctNoSign(Math.abs(seg.yoyDelta!))}
              <span
                style={{
                  color: "var(--fg-tertiary)",
                  fontWeight: 400,
                  marginLeft: 2,
                }}
              >
                N-1
              </span>
            </span>
          </div>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 18,
          color: "var(--fg-primary)",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          alignSelf: "center",
        }}
      >
        {fmtEurCompact(seg.value)}
      </span>
    </div>
  );
}
