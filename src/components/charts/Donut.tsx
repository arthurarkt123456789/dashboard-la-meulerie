"use client";

type DonutData = { share: number; method: string };

type Props = {
  data: DonutData[];
  size?: number;
  thickness?: number;
  colors: string[];
};

export function Donut({ data, size = 180, thickness = 28, colors }: Props) {
  const total = data.reduce((s, d) => s + d.share, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2 - 2;
  let start = -Math.PI / 2;

  const arcs = data.map((d, i) => {
    const angle = (d.share / total) * Math.PI * 2;
    const end = start + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    start = end;
    return { path, color: colors[i % colors.length] };
  });

  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      {arcs.map((a, i) => (
        <path
          key={i}
          d={a.path}
          fill="none"
          stroke={a.color}
          strokeWidth={thickness}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}
