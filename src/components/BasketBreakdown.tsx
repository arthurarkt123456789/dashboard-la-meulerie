import { fmtPct } from "@/lib/format";

type SegmentValue = {
  value: number;
  delta?: number | null;
  yoyDelta?: number | null;
};

type Props = {
  global: SegmentValue;
  fromagerie: SegmentValue;
  snacking: SegmentValue;
  /** Épicerie/boissons — per-ticket average. If epicerieCA > 0 but epicerieTx = 0, pass value=0 and caShare. */
  epicerie?: SegmentValue;
  /** Shown as fallback when epicerie.value === 0 but there is CA (categories not split into tickets). */
  epicerieCAShare?: number | null;
  stdDev?: number | null;
  yoyAvailable?: boolean;
  partial?: boolean;
  suffix?: string;
};

function fmtEur2(n: number): string {
  return (Math.round(n * 100) / 100)
    .toFixed(2)
    .replace(".", ",");
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
  stdDev,
  yoyAvailable,
  partial,
  suffix = "€",
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
          marginTop: -2,
          marginBottom: 2,
        }}>
          ± {fmtEur2(stdDev)} {suffix} (écart-type)
        </div>
      )}
      <div className="lm-kpi-deltas">
        {hasGlobalDelta && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(global.delta)}>
              {(global.delta ?? 0) > 0 ? "↑ " : (global.delta ?? 0) < 0 ? "↓ " : ""}
              {fmtPct(global.delta!).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs période préc.</span>
          </div>
        )}
        {yoyAvailable === false ? (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">—</span>
            <span className="lm-delta-label">N-1 indisponible</span>
          </div>
        ) : hasYoy ? (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(global.yoyDelta)}>
              {(global.yoyDelta ?? 0) > 0 ? "↑ " : (global.yoyDelta ?? 0) < 0 ? "↓ " : ""}
              {fmtPct(global.yoyDelta!).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs N-1</span>
          </div>
        ) : null}
      </div>
      <SegmentRow label="Fromagerie" color="var(--color-dark)" b={fromagerie} suffix={suffix} />
      <SegmentRow label="Snacking" color="var(--color-coral)" b={snacking} suffix={suffix} />
      {epicerie && epicerie.value > 0 ? (
        <SegmentRow label="Épicerie" color="#1A5EA8" b={epicerie} suffix={suffix} />
      ) : epicerieCAShare != null && epicerieCAShare > 0 ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "8px 1fr auto",
          gap: 8,
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
    </div>
  );
}

function SegmentRow({
  label,
  color,
  b,
  suffix,
  subNote,
}: {
  label: string;
  color: string;
  b: { value: number; delta?: number | null };
  suffix: string;
  subNote?: string;
}) {
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
      <span
        style={{
          width: 8,
          height: 8,
          background: color,
          borderRadius: 1,
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
        {subNote && (
          <div style={{ fontSize: 10, color: "var(--fg-tertiary)", fontFamily: "var(--font-body)" }}>
            {subNote}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          fontFamily: "var(--font-body)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 18,
            color: b.value > 0 ? "var(--fg-primary)" : "var(--fg-tertiary)",
            letterSpacing: "-0.01em",
          }}
        >
          {b.value > 0 ? (
            <>
              {fmtEur2(b.value)}{" "}
              <span style={{ fontSize: 12, color: "var(--fg-secondary)" }}>{suffix}</span>
            </>
          ) : (
            "—"
          )}
        </span>
        {typeof b.delta === "number" && isFinite(b.delta) && b.delta !== 0 && (
          <span
            className={"lm-delta " + deltaClass(b.delta)}
            style={{ fontSize: 11 }}
          >
            {b.delta > 0 ? "↑" : "↓"} {fmtPct(b.delta).replace(/^[+-]/, "")}
          </span>
        )}
      </div>
    </div>
  );
}
