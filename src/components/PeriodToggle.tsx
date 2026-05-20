"use client";

import type { PeriodKey } from "@/lib/apitic/types";

const OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
];

type Props = { value: PeriodKey; onChange: (v: PeriodKey) => void };

export function PeriodToggle({ value, onChange }: Props) {
  return (
    <div className="lm-segmented">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          className={"lm-seg-btn " + (value === o.id ? "active" : "")}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
