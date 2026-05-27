import { fmtPctNoSign } from "@/lib/format";

type SegmentData = {
  label: string;
  color: string;
  value: number;
  share: number; // 0..1
};

type SplitProps = {
  title: string;
  segments: SegmentData[];
  formatValue: (v: number) => string;
  shareLabel?: string;
};

export function CategorySplit({ title, segments, formatValue, shareLabel = "du total" }: SplitProps) {
  const nonZero = segments.filter((s) => s.value > 0 || s.share > 0);
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--fg-secondary)",
        marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{
        display: "flex",
        height: 12,
        borderRadius: 2,
        overflow: "hidden",
        background: "var(--bg-subtle)",
        marginBottom: 16,
      }}>
        {nonZero.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.share * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px 24px",
      }}>
        {nonZero.map((s) => (
          <div key={s.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, background: s.color, borderRadius: 1, flexShrink: 0 }} />
              <span className="lm-label">{s.label}</span>
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 600,
              color: "var(--fg-primary)",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}>
              {formatValue(s.value)}
            </div>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--fg-tertiary)",
              marginTop: 4,
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtPctNoSign(s.share)} {shareLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
