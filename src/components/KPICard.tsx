import { fmtPct } from "@/lib/format";
import { Sparkline } from "./charts/Sparkline";

type SegmentShare = { label: string; color: string; share: number };

type Props = {
  label: string;
  value: string;
  suffix?: string;
  delta?: number | null;
  deltaLabel?: string;
  yoyDelta?: number | null;
  yoyAvailable?: boolean;
  yoyNote?: string;
  spark?: number[];
  sparkColor?: string;
  sparkRefLine?: number;
  accent?: boolean;
  partial?: boolean;
  /** Delta comparison vs network avg (e.g. CA/jour moyen). */
  networkRef?: string;
  networkRefDelta?: number | null;
  /** Absolute share of network total — shown as "X% du réseau" (neutral). */
  networkShare?: number | null;
  subValue?: string;
  /** "vs. Moyenne" delta — benchmark depends on selected period. */
  trendDelta?: number | null;
  trendLabel?: string;
  /** Mini stacked bar showing segment shares. */
  segments?: SegmentShare[];
};

function dc(v: number | null | undefined) {
  if (typeof v !== "number" || !isFinite(v)) return "neu";
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "neu";
}

function DeltaRow({ value, label }: { value: number; label: string }) {
  const cls = dc(value);
  return (
    <div className="lm-kpi-delta-row">
      <span className={"lm-delta " + cls}>
        {value > 0 ? "↑ " : value < 0 ? "↓ " : ""}
        {fmtPct(value).replace(/^\+/, "")}
      </span>
      <span className="lm-delta-label">{label}</span>
    </div>
  );
}

export function KPICard({
  label,
  value,
  suffix,
  delta,
  deltaLabel,
  yoyDelta,
  yoyAvailable,
  yoyNote,
  spark,
  sparkColor,
  sparkRefLine,
  accent,
  partial,
  networkRef,
  networkRefDelta,
  networkShare,
  subValue,
  trendDelta,
  trendLabel,
  segments,
}: Props) {
  return (
    <div className="lm-card lm-kpi">
      <div className="lm-kpi-head">
        <span className="lm-label">{label}</span>
        {partial && <span className="lm-tag lm-tag-live">En cours</span>}
      </div>
      <div className="lm-kpi-value-row">
        <div
          className="lm-kpi-value"
          style={accent ? { color: "var(--color-coral)" } : undefined}
        >
          {value}
          {suffix && <span className="lm-kpi-suffix">{suffix}</span>}
        </div>
        {spark && spark.length >= 2 && (
          <div className="lm-kpi-spark">
            <Sparkline
              values={spark}
              stroke={sparkColor || "var(--color-dark)"}
              width={88}
              height={28}
              refLine={sparkRefLine}
            />
          </div>
        )}
      </div>
      {subValue && (
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--fg-tertiary)",
          marginBottom: 4,
          marginTop: -2,
        }}>
          {subValue}
        </div>
      )}
      <div className="lm-kpi-deltas">
        {typeof delta === "number" && (
          <DeltaRow value={delta} label={deltaLabel || "vs. période préc."} />
        )}
        {yoyAvailable === false ? (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">—</span>
            <span className="lm-delta-label">{yoyNote || "last year N/A"}</span>
          </div>
        ) : typeof yoyDelta === "number" ? (
          <DeltaRow value={yoyDelta} label={yoyNote || "vs. last year"} />
        ) : null}
        {networkRef && typeof networkRefDelta === "number" && (
          <DeltaRow value={networkRefDelta} label={`vs. réseau (${networkRef})`} />
        )}
        {typeof networkShare === "number" && (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">{(networkShare * 100).toFixed(0)}%</span>
            <span className="lm-delta-label">du réseau</span>
          </div>
        )}
        {typeof trendDelta === "number" && (
          <DeltaRow value={trendDelta} label={trendLabel || "vs. moyenne"} />
        )}
      </div>
      {segments && segments.some((s) => s.share > 0.005) && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            height: 4,
            display: "flex",
            borderRadius: 2,
            overflow: "hidden",
            background: "var(--bg-subtle)",
          }}>
            {segments.filter((s) => s.share > 0.005).map((s) => (
              <div
                key={s.label}
                style={{ width: `${s.share * 100}%`, background: s.color }}
              />
            ))}
          </div>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "3px 10px",
            marginTop: 5,
            fontFamily: "var(--font-body)",
          }}>
            {segments.filter((s) => s.share > 0.005).map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                <span style={{ width: 6, height: 6, background: s.color, borderRadius: 1, flexShrink: 0 }} />
                <span style={{ color: "var(--fg-tertiary)" }}>{s.label}</span>
                <span style={{ color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {(s.share * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
