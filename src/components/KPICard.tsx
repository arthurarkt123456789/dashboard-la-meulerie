import { fmtPct } from "@/lib/format";
import { Sparkline } from "./charts/Sparkline";

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
  /** E.g. "1 674 €/j" — shown as "vs réseau (X)" comparison row. */
  networkRef?: string;
  networkRefDelta?: number | null;
  /** Sub-value shown below the main number (e.g. "± 3,2 €" for std dev). */
  subValue?: string;
};

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
  subValue,
}: Props) {
  const isPos = typeof delta === "number" && delta > 0;
  const isNeg = typeof delta === "number" && delta < 0;
  const yoyPos = typeof yoyDelta === "number" && yoyDelta > 0;
  const yoyNeg = typeof yoyDelta === "number" && yoyDelta < 0;
  const netPos = typeof networkRefDelta === "number" && networkRefDelta > 0;
  const netNeg = typeof networkRefDelta === "number" && networkRefDelta < 0;

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
          <div className="lm-kpi-delta-row">
            <span
              className={"lm-delta " + (isPos ? "pos" : isNeg ? "neg" : "neu")}
            >
              {isPos && "↑ "}
              {isNeg && "↓ "}
              {fmtPct(delta).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">
              {deltaLabel || "vs période préc."}
            </span>
          </div>
        )}
        {yoyAvailable === false ? (
          <div className="lm-kpi-delta-row">
            <span className="lm-delta neu">—</span>
            <span className="lm-delta-label">
              {yoyNote || "N-1 indisponible"}
            </span>
          </div>
        ) : typeof yoyDelta === "number" ? (
          <div className="lm-kpi-delta-row">
            <span
              className={
                "lm-delta " + (yoyPos ? "pos" : yoyNeg ? "neg" : "neu")
              }
            >
              {yoyPos && "↑ "}
              {yoyNeg && "↓ "}
              {fmtPct(yoyDelta).replace(/^\+/, "")}
            </span>
            <span className="lm-delta-label">{yoyNote || "vs N-1"}</span>
          </div>
        ) : null}
        {networkRef && (
          <div className="lm-kpi-delta-row">
            <span className={"lm-delta " + (netPos ? "pos" : netNeg ? "neg" : "neu")}>
              {netPos && "↑ "}
              {netNeg && "↓ "}
              {typeof networkRefDelta === "number"
                ? fmtPct(networkRefDelta).replace(/^\+/, "")
                : "="}
            </span>
            <span className="lm-delta-label">vs réseau ({networkRef})</span>
          </div>
        )}
      </div>
    </div>
  );
}
