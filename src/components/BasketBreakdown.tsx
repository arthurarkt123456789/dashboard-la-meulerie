import { fmtPct, fmtPctNoSign } from "@/lib/format";

type SegmentValue = {
  value: number;
  delta?: number | null;
  yoyDelta?: number | null;
};

type Props = {
  global: SegmentValue;
  fromagerie: SegmentValue;
  snacking: SegmentValue;
  epicerie?: SegmentValue;
  epicerieCAShare?: number | null;
  merch?: SegmentValue;
  stdDev?: number | null;
  yoyAvailable?: boolean;
  partial?: boolean;
  suffix?: string;
  networkBasketAbsolute?: number | null;
};

function fmtEur2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}

function deltaClass(delta: number | null | undefined): string {
  if (typeof delta !== "number" || !isFinite(delta)) return "neu";
  if (delta > 0) return "pos";
  if (delta < 0) return "neg";
  return "neu";
}

export function BasketBreakdown({
  global,
  fromagerie,
  snacking,
  epicerie,
  epicerieCAShare,
  merch,
  stdDev,
  yoyAvailable,
  partial,
  suffix = "€",
  networkBasketAbsolute,
}: Props) {
  const hasGlobalDelta = typeof global.delta === "number";
  const hasYoy = yoyAvailable !== false && typeof global.yoyDelta === "number";

  return (
    <div className="lm-card lm-kpi">
      <div className="lm-kpi-head">
        <span className="lm-label">Panier moyen</span>
        {partial && <span className="lm-tag lm-tag-live">En cours</span>}
      </div>
      <div className="lm-kpi-value-row">
        <div className="lm-kpi-value">
          {fmtEur2(global.value)}
          <span className="lm-kpi-suffix">{suffix}</span>
        </div>
      </div>
      {stdDev != null && stdDev > 0 && (
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--fg-tertiary)",
          marginTop: 8,
          marginBottom: 2,
        }}>
          ± {fmtEur2(stdDev)} {suffix} (écart-type)
        </div>
      )}
      <div className="lm-kpi-deltas" style={{ marginTop: 20 }}>
        {hasGlobalDelta && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(global.delta)}>
              {(global.delta ?? 0) > 0 ? "↑ " : (global.delta ?? 0) < 0 ? "↓ " : ""}
              {fmtPct(global.delta!).replace(/^\+/, "")}
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
            <span className={"lm-delta " + deltaClass(global.yoyDelta)}>
              {(global.yoyDelta ?? 0) > 0 ? "↑ " : (global.yoyDelta ?? 0) < 0 ? "↓ " : ""}
              {fmtPct(global.yoyDelta!).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs. last year</span>
          </div>
        ) : null}
        {networkBasketAbsolute != null && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + (networkBasketAbsolute > 0 ? "pos" : networkBasketAbsolute < 0 ? "neg" : "neu")}>
              {networkBasketAbsolute > 0 ? "+" : ""}{fmtEur2(networkBasketAbsolute)} {suffix}
            </span>
            <span className="lm-delta-label">vs. réseau</span>
          </div>
        )}
      </div>
      <SegmentRow label="Fromagerie" color="var(--color-dark)" b={fromagerie} suffix={suffix} yoyAvailable={yoyAvailable} />
      <SegmentRow label="Snacking" color="var(--color-coral)" b={snacking} suffix={suffix} yoyAvailable={yoyAvailable} />
      {epicerie && epicerie.value > 0 ? (
        <SegmentRow label="Épicerie" color="#1A5EA8" b={epicerie} suffix={suffix} yoyAvailable={yoyAvailable} />
      ) : epicerieCAShare != null && epicerieCAShare > 0 ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "8px 1fr auto",
          gap: "0 8px",
          alignItems: "center",
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--border-light)",
        }}>
          <span style={{ width: 8, height: 8, background: "#1A5EA8", borderRadius: 1 }} />
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--fg-secondary)", letterSpacing: 0.4, textTransform: "uppercase" }}>
            Épicerie
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
            {(epicerieCAShare * 100).toFixed(0)} %
            <span style={{ fontSize: 10, color: "var(--fg-tertiary)", fontWeight: 400, marginLeft: 3 }}>du CA</span>
          </div>
        </div>
      ) : null}
      {merch && merch.value > 0 && (
        <SegmentRow label="Merch" color="#7C3AED" b={merch} suffix={suffix} yoyAvailable={yoyAvailable} />
      )}
    </div>
  );
}

function SegmentRow({
  label,
  color,
  b,
  suffix,
  yoyAvailable,
}: {
  label: string;
  color: string;
  b: SegmentValue;
  suffix: string;
  yoyAvailable?: boolean;
}) {
  const hasDelta = typeof b.delta === "number" && isFinite(b.delta) && b.delta !== 0;
  const hasYoy = yoyAvailable !== false && typeof b.yoyDelta === "number" && isFinite(b.yoyDelta);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "8px 1fr auto",
      gap: "0 8px",
      alignItems: "center",
      marginTop: 8,
      paddingTop: 8,
      borderTop: "1px solid var(--border-light)",
    }}>
      <span style={{ width: 8, height: 8, background: color, borderRadius: 1, alignSelf: "flex-start", marginTop: 4 }} />
      <div>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--fg-secondary)",
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}>
          {label}
        </div>
        {(hasDelta || hasYoy) && (
          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "nowrap" }}>
            {hasDelta && (
              <span className={"lm-delta " + deltaClass(b.delta)} style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                {b.delta! > 0 ? "↑" : "↓"} {fmtPctNoSign(Math.abs(b.delta!))}
                <span style={{ color: "var(--fg-tertiary)", fontWeight: 400, marginLeft: 2 }}>P-1</span>
              </span>
            )}
            {hasYoy && (
              <span className={"lm-delta " + deltaClass(b.yoyDelta)} style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                {b.yoyDelta! > 0 ? "↑" : b.yoyDelta! < 0 ? "↓" : "·"} {fmtPctNoSign(Math.abs(b.yoyDelta!))}
                <span style={{ color: "var(--fg-tertiary)", fontWeight: 400, marginLeft: 2 }}>N-1</span>
              </span>
            )}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 18,
        color: b.value > 0 ? "var(--fg-primary)" : "var(--fg-tertiary)",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        alignSelf: "center",
      }}>
        {b.value > 0 ? (
          <>{fmtEur2(b.value)}{" "}<span style={{ fontSize: 12, color: "var(--fg-secondary)", fontFamily: "var(--font-body)", fontWeight: 400 }}>{suffix}</span></>
        ) : "—"}
      </span>
    </div>
  );
}
