"use client";

import { useEffect, useRef, useState } from "react";
import type { PeriodSelection } from "@/lib/apitic/types";
import { formatDateLabel } from "@/lib/format";
import type { Granularity } from "@/lib/bucketing";

export type DualPoint = {
  date: string;
  left: number | null;
  right: number | null;
};

type Props = {
  data: DualPoint[];
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  leftFormat?: (n: number) => string;
  rightFormat?: (n: number) => string;
  height?: number;
  period?: PeriodSelection;
  granularity?: Granularity;
};

export function DualLineChart({
  data,
  leftLabel,
  rightLabel,
  leftColor,
  rightColor,
  leftFormat = (n) => n.toFixed(2) + " €",
  rightFormat = (n) => String(Math.round(n)),
  height = 220,
  period,
  granularity = "day",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(300, e.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { top: 12, right: 56, bottom: 28, left: 56 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const leftVals = data.map((d) => d.left).filter((v): v is number => v !== null);
  const rightVals = data.map((d) => d.right).filter((v): v is number => v !== null);

  const leftMin = leftVals.length ? Math.min(...leftVals) * 0.93 : 0;
  const leftMax = leftVals.length ? Math.max(...leftVals) * 1.07 : 1;
  const rightMin = rightVals.length ? Math.min(...rightVals) * 0.93 : 0;
  const rightMax = rightVals.length ? Math.max(...rightVals) * 1.07 : 1;

  const xAt = (i: number) => PAD.left + (i / Math.max(1, data.length - 1)) * innerW;
  const yAtL = (v: number) => PAD.top + innerH - ((v - leftMin) / (leftMax - leftMin || 1)) * innerH;
  const yAtR = (v: number) => PAD.top + innerH - ((v - rightMin) / (rightMax - rightMin || 1)) * innerH;

  const TICKS = 4;
  const labelEvery = data.length > 30 ? Math.ceil(data.length / 8) : data.length > 14 ? 3 : 1;

  let leftPath = "";
  let rightPath = "";
  data.forEach((d, i) => {
    if (d.left !== null) leftPath += ` ${leftPath ? "L" : "M"} ${xAt(i)} ${yAtL(d.left)}`;
    if (d.right !== null) rightPath += ` ${rightPath ? "L" : "M"} ${xAt(i)} ${yAtR(d.right)}`;
  });

  const lastL = [...data].reverse().find((d) => d.left !== null);
  const lastR = [...data].reverse().find((d) => d.right !== null);
  const lastLIdx = lastL ? data.lastIndexOf(lastL) : -1;
  const lastRIdx = lastR ? data.lastIndexOf(lastR) : -1;

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg
        width={w}
        height={height}
        style={{ display: "block" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const idx = Math.round(((e.clientX - rect.left - PAD.left) / innerW) * (data.length - 1));
          if (idx >= 0 && idx < data.length) setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines + left Y axis */}
        {Array.from({ length: TICKS + 1 }).map((_, i) => {
          const v = leftMin + ((leftMax - leftMin) * i) / TICKS;
          const y = yAtL(v);
          return (
            <g key={i}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y} y2={y}
                stroke="var(--border-light)" strokeWidth="1"
                strokeDasharray={i === 0 ? "0" : "2 3"} />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11"
                fill="var(--fg-tertiary)"
                style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
                {leftFormat(v)}
              </text>
            </g>
          );
        })}

        {/* right Y axis */}
        {Array.from({ length: TICKS + 1 }).map((_, i) => {
          const v = rightMin + ((rightMax - rightMin) * i) / TICKS;
          return (
            <text key={i} x={w - PAD.right + 8} y={yAtR(v) + 4}
              textAnchor="start" fontSize="11" fill={rightColor}
              style={{ fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums", opacity: 0.75 }}>
              {rightFormat(v)}
            </text>
          );
        })}

        {/* lines */}
        {leftPath && (
          <path d={leftPath} fill="none" stroke={leftColor} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        )}
        {rightPath && (
          <path d={rightPath} fill="none" stroke={rightColor} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3" />
        )}

        {/* end dots */}
        {lastLIdx >= 0 && lastL?.left !== null && (
          <circle cx={xAt(lastLIdx)} cy={yAtL(lastL!.left!)} r="3.5"
            fill="white" stroke={leftColor} strokeWidth="2" />
        )}
        {lastRIdx >= 0 && lastR?.right !== null && (
          <circle cx={xAt(lastRIdx)} cy={yAtR(lastR!.right!)} r="3.5"
            fill="white" stroke={rightColor} strokeWidth="2" />
        )}

        {/* x labels */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== data.length - 1) return null;
          return (
            <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize="11"
              fill="var(--fg-tertiary)"
              style={{ fontFamily: "var(--font-body)" }}>
              {period ? formatDateLabel(d.date, period, granularity) : d.date.slice(5)}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hover !== null && (
          <g>
            <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={PAD.top + innerH}
              stroke="var(--fg-primary)" strokeWidth="1" strokeDasharray="2 3" opacity="0.3" />
            {data[hover].left !== null && (
              <circle cx={xAt(hover)} cy={yAtL(data[hover].left!)} r="4"
                fill="white" stroke={leftColor} strokeWidth="2" />
            )}
            {data[hover].right !== null && (
              <circle cx={xAt(hover)} cy={yAtR(data[hover].right!)} r="4"
                fill="white" stroke={rightColor} strokeWidth="2" />
            )}
          </g>
        )}
      </svg>

      {hover !== null && (data[hover].left !== null || data[hover].right !== null) && (() => {
        const xFrac = hover / Math.max(1, data.length - 1);
        const tipLeft = Math.min(w - 190, Math.max(0, xFrac * innerW + PAD.left + 12));
        return (
          <div style={{
            position: "absolute", left: tipLeft, top: 8,
            background: "var(--color-dark)", color: "var(--fg-inverted)",
            padding: "8px 12px", borderRadius: "var(--radius-sm)",
            fontSize: 12, lineHeight: 1.6, pointerEvents: "none",
            fontFamily: "var(--font-body)", whiteSpace: "nowrap",
            boxShadow: "var(--shadow-md)",
          }}>
            <div style={{ opacity: 0.6, fontSize: 11, marginBottom: 4 }}>
              {period ? formatDateLabel(data[hover].date, period, granularity) : data[hover].date}
            </div>
            {data[hover].left !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 3, background: leftColor, display: "inline-block", borderRadius: 1 }} />
                <span style={{ flex: 1 }}>{leftLabel}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, marginLeft: 8 }}>
                  {leftFormat(data[hover].left!)}
                </span>
              </div>
            )}
            {data[hover].right !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 1, background: rightColor, display: "inline-block", borderRadius: 1, borderTop: `2px dashed ${rightColor}` }} />
                <span style={{ flex: 1 }}>{rightLabel}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, marginLeft: 8 }}>
                  {rightFormat(data[hover].right!)}
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
