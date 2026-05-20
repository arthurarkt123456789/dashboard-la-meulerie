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
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 10,
              height: 2,
              background: s.color,
              display: "inline-block",
            }}
          />
          {s.label}
        </div>
      ))}
    </div>
  );
}
