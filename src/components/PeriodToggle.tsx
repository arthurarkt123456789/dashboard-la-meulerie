"use client";

import { useEffect, useRef, useState } from "react";
import type { PeriodKey, PeriodSelection } from "@/lib/apitic/types";

const PRESETS: { id: PeriodKey; label: string }[] = [
  // APITIC has no live "today" feed, so the shortest preset rolls back to
  // the last closed fiscal day (= yesterday).
  { id: "today", label: "Hier" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
];

const FR_MONTHS_SHORT = [
  "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
  "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
];

function formatMonth(year: number, month: number): string {
  return `${FR_MONTHS_SHORT[month - 1]} ${year}`;
}

type Props = {
  value: PeriodSelection;
  onChange: (v: PeriodSelection) => void;
};

export function PeriodToggle({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isMonth = value.kind === "month";
  const monthLabel = isMonth
    ? formatMonth(value.year, value.month)
    : "Mois";

  return (
    <div
      ref={ref}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}
    >
      <div className="lm-segmented">
        {PRESETS.map((o) => (
          <button
            key={o.id}
            className={
              "lm-seg-btn " +
              (value.kind === "preset" && value.key === o.id ? "active" : "")
            }
            onClick={() => onChange({ kind: "preset", key: o.id })}
          >
            {o.label}
          </button>
        ))}
        <button
          className={"lm-seg-btn " + (isMonth ? "active" : "")}
          onClick={() => setOpen((s) => !s)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {monthLabel} ▾
        </button>
      </div>

      {open && (
        <MonthPicker
          value={isMonth ? { year: value.year, month: value.month } : null}
          onPick={(year, month) => {
            onChange({ kind: "month", year, month });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function MonthPicker({
  value,
  onPick,
}: {
  value: { year: number; month: number } | null;
  onPick: (year: number, month: number) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(value?.year ?? today.getFullYear());
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  return (
    <div
      role="dialog"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        background: "var(--color-white)",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md)",
        padding: 12,
        zIndex: 200,
        minWidth: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button
          className="lm-icon-btn"
          onClick={() => setYear((y) => y - 1)}
          aria-label="Année précédente"
        >
          ‹
        </button>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 16,
            color: "var(--fg-primary)",
          }}
        >
          {year}
        </div>
        <button
          className="lm-icon-btn"
          onClick={() => setYear((y) => y + 1)}
          aria-label="Année suivante"
          disabled={year >= currentYear}
          style={year >= currentYear ? { opacity: 0.3, cursor: "not-allowed" } : undefined}
        >
          ›
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
        }}
      >
        {FR_MONTHS_SHORT.map((label, i) => {
          const m = i + 1;
          const isFuture = year > currentYear || (year === currentYear && m > currentMonth);
          const isActive = value?.year === year && value?.month === m;
          return (
            <button
              key={m}
              disabled={isFuture}
              onClick={() => onPick(year, m)}
              style={{
                background: isActive ? "var(--color-coral)" : "var(--bg-subtle)",
                color: isActive ? "var(--color-white)" : isFuture ? "var(--fg-tertiary)" : "var(--fg-primary)",
                border: 0,
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 500,
                cursor: isFuture ? "not-allowed" : "pointer",
                opacity: isFuture ? 0.4 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
