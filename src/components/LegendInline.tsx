import type { LineSeries } from "./charts/LineChart";

export function LegendInline({ series }: { series: LineSeries[] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        fontFamily: "var(--font-body)",
        fontSize: 12,
        color: "var(--fg-secondary)",
        flexWrap: "wrap",
      }}
    >
      {series.map((s) => (
        <div
          key={s.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: s.dashed ? 0.75 : 1,
          }}
        >
          <span
            style={{
              width: 14,
              height: 2,
              display: "inline-block",
              background: s.dashed
                ? `repeating-linear-gradient(to right, ${s.color} 0 3px, transparent 3px 6px)`
                : s.color,
            }}
          />
          {s.label}
        </div>
      ))}
    </div>
  );
}
