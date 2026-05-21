"use client";

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

export function N1Toggle({ value, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      title={
        disabled
          ? "Pas de données N-1 disponibles sur cette période"
          : value
            ? "Masquer la courbe N-1"
            : "Afficher la courbe N-1"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: value ? "var(--color-coral)" : "var(--bg-subtle)",
        color: value ? "var(--color-white)" : "var(--fg-secondary)",
        border: "1px solid " + (value ? "var(--color-coral)" : "var(--border-light)"),
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span
        style={{
          width: 12,
          height: 2,
          background: value
            ? `repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 6px)`
            : `repeating-linear-gradient(to right, var(--fg-tertiary) 0 3px, transparent 3px 6px)`,
        }}
      />
      N-1
    </button>
  );
}
