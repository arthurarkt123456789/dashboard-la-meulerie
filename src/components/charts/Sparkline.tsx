"use client";

import { useId } from "react";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  /** Horizontal dashed reference line (e.g. network average). Same unit as values. */
  refLine?: number;
  /** Draw a dashed line at the mean of values. */
  showAvg?: boolean;
  /** Scale SVG to 100% container width (viewBox-based). */
  responsive?: boolean;
};

export function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "var(--fg-accent)",
  refLine,
  showAvg,
  responsive,
}: Props) {
  const gradId = useId();
  if (!values || values.length < 2) return null;

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const allForScale = [
    ...values,
    ...(refLine !== undefined ? [refLine] : []),
    ...(showAvg ? [avg] : []),
  ];
  const max = Math.max(...allForScale);
  const min = Math.min(...allForScale);
  const range = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });
  const linePath = "M " + pts.map((p) => `${p[0]} ${p[1]}`).join(" L ");
  const areaPath =
    linePath +
    ` L ${pts[pts.length - 1][0]} ${height - pad} L ${pts[0][0]} ${height - pad} Z`;

  const avgY = pad + innerH - ((avg - min) / range) * innerH;

  const svgProps = responsive
    ? { viewBox: `0 0 ${width} ${height}`, width: "100%", height, preserveAspectRatio: "none" as const }
    : { width, height };

  return (
    <svg {...svgProps} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showAvg && (
        <line
          x1={pad} y1={avgY} x2={width - pad} y2={avgY}
          stroke={stroke}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.45"
        />
      )}
      {refLine !== undefined && (() => {
        const ry = pad + innerH - ((refLine - min) / (range || 1)) * innerH;
        return (
          <line
            x1={pad} y1={ry} x2={width - pad} y2={ry}
            stroke="var(--fg-tertiary)"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.7"
          />
        );
      })()}
    </svg>
  );
}
