import { fmtPct } from "@/lib/format";

type SegmentBasket = {
  label: string;
  value: number;
  delta?: number | null;
  color: string;
};

type Props = {
  global: { value: number; delta?: number | null };
  fromagerie: { value: number; delta?: number | null };
  snacking: { value: number; delta?: number | null };
  partial?: boolean;
  /** "€" by default. Pass "€ HT" or "€ TTC" to add a clarifier. */
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
  partial,
  suffix = "€",
}: Props) {
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
      <div className="lm-kpi-deltas">
        {typeof global.delta === "number" && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + deltaClass(global.delta)}>
              {global.delta > 0 ? "↑ " : global.delta < 0 ? "↓ " : ""}
              {fmtPct(global.delta).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">vs période préc.</span>
          </div>
        )}
      </div>
      <SegmentRow label="Fromagerie" color="var(--color-dark)" b={fromagerie} suffix={suffix} />
      <SegmentRow label="Snacking" color="var(--color-coral)" b={snacking} suffix={suffix} />
    </div>
  );
}

function SegmentRow({
  label,
  color,
  b,
  suffix,
}: {
  label: string;
  color: string;
  b: { value: number; delta?: number | null };
  suffix: string;
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
            color: "var(--fg-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {fmtEur2(b.value)} <span style={{ fontSize: 12, color: "var(--fg-secondary)" }}>{suffix}</span>
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
