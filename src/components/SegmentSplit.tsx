import { fmtEURshort, fmtPctNoSign } from "@/lib/format";

type Props = { fromagerie: number; snacking: number };

export function SegmentSplit({ fromagerie, snacking }: Props) {
  const total = fromagerie + snacking;
  const fPct = total ? fromagerie / total : 0;
  const sPct = total ? snacking / total : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 2,
          overflow: "hidden",
          background: "var(--bg-subtle)",
        }}
      >
        <div
          style={{ width: fPct * 100 + "%", background: "var(--color-dark)" }}
        />
        <div
          style={{ width: sPct * 100 + "%", background: "var(--color-coral)" }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        <SegmentColumn
          label="Fromagerie"
          color="var(--color-dark)"
          amount={fromagerie}
          pct={fPct}
        />
        <SegmentColumn
          label="Snacking"
          color="var(--color-coral)"
          amount={snacking}
          pct={sPct}
        />
      </div>
    </div>
  );
}

function SegmentColumn({
  label,
  color,
  amount,
  pct,
}: {
  label: string;
  color: string;
  amount: number;
  pct: number;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{ width: 8, height: 8, background: color, borderRadius: 1 }}
        />
        <span className="lm-label">{label}</span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          color: "var(--fg-primary)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtEURshort(amount)}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--fg-tertiary)",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtPctNoSign(pct)} du CA
      </div>
    </div>
  );
}
