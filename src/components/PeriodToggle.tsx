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

function formatRangeShort(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const fStr = `${f.getUTCDate()}/${f.getUTCMonth() + 1}`;
  const tStr = `${t.getUTCDate()}/${t.getUTCMonth() + 1}`;
  return `${fStr} → ${tStr}`;
}

type Props = {
  value: PeriodSelection;
  onChange: (v: PeriodSelection) => void;
};

export function PeriodToggle({ value, onChange }: Props) {
  const [openPopover, setOpenPopover] = useState<null | "month" | "range">(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPopover) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpenPopover(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openPopover]);

  const isMonth = value.kind === "month";
  const isRange = value.kind === "range";
  const isFY = value.kind === "fiscal-year-todate";

  const monthLabel = isMonth ? formatMonth(value.year, value.month) : "Mois";
  const rangeLabel = isRange ? formatRangeShort(value.from, value.to) : "Dates";

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
          onClick={() => setOpenPopover((s) => (s === "month" ? null : "month"))}
        >
          {monthLabel} ▾
        </button>
        <button
          className={"lm-seg-btn " + (isRange ? "active" : "")}
          onClick={() => setOpenPopover((s) => (s === "range" ? null : "range"))}
        >
          {rangeLabel} ▾
        </button>
        <button
          className={"lm-seg-btn " + (isFY ? "active" : "")}
          onClick={() => onChange({ kind: "fiscal-year-todate" })}
          title="Exercice en cours (1er oct. → hier)"
        >
          Exercice
        </button>
      </div>

      {openPopover === "month" && (
        <MonthPicker
          value={isMonth ? { year: value.year, month: value.month } : null}
          onPick={(year, month) => {
            onChange({ kind: "month", year, month });
            setOpenPopover(null);
          }}
        />
      )}
      {openPopover === "range" && (
        <RangePicker
          value={isRange ? { from: value.from, to: value.to } : null}
          onPick={(from, to) => {
            onChange({ kind: "range", from, to });
            setOpenPopover(null);
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
    <div role="dialog" style={popoverStyle}>
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
              style={pickerBtnStyle(isActive, isFuture)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RangePicker({
  value,
  onPick,
}: {
  value: { from: string; to: string } | null;
  onPick: (from: string, to: string) => void;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  // Default: last 14 days ending yesterday.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const fortnightAgo = new Date();
  fortnightAgo.setDate(fortnightAgo.getDate() - 14);
  const [from, setFrom] = useState(value?.from ?? fortnightAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(value?.to ?? yesterday.toISOString().slice(0, 10));

  const valid = from && to && from <= to;

  return (
    <div role="dialog" style={popoverStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={labelStyle}>
          Du
          <input
            type="date"
            value={from}
            max={to || todayStr}
            onChange={(e) => setFrom(e.target.value)}
            style={dateInputStyle}
          />
        </label>
        <label style={labelStyle}>
          Au
          <input
            type="date"
            value={to}
            min={from}
            max={todayStr}
            onChange={(e) => setTo(e.target.value)}
            style={dateInputStyle}
          />
        </label>
        <button
          disabled={!valid}
          onClick={() => valid && onPick(from, to)}
          style={applyBtnStyle(!!valid)}
        >
          Appliquer
        </button>
      </div>
    </div>
  );
}

const popoverStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  background: "var(--color-white)",
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-md)",
  padding: 12,
  zIndex: 200,
  minWidth: 240,
};

function pickerBtnStyle(isActive: boolean, isFuture: boolean): React.CSSProperties {
  return {
    background: isActive ? "var(--color-coral)" : "var(--bg-subtle)",
    color: isActive
      ? "var(--color-white)"
      : isFuture
        ? "var(--fg-tertiary)"
        : "var(--fg-primary)",
    border: 0,
    borderRadius: "var(--radius-sm)",
    padding: "8px 10px",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontWeight: 500,
    cursor: isFuture ? "not-allowed" : "pointer",
    opacity: isFuture ? 0.4 : 1,
  };
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--fg-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const dateInputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--fg-primary)",
  background: "var(--color-white)",
};

function applyBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    marginTop: 4,
    padding: "8px 12px",
    background: enabled ? "var(--color-coral)" : "var(--bg-subtle)",
    color: enabled ? "var(--color-white)" : "var(--fg-tertiary)",
    border: 0,
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 500,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}
