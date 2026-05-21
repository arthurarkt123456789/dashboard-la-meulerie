"use client";

import type { Granularity } from "@/lib/bucketing";

type Props = {
  value: Granularity;
  onChange: (g: Granularity) => void;
  allowMonth?: boolean;
};

export function GranularityToggle({ value, onChange, allowMonth }: Props) {
  return (
    <div className="lm-segmented lm-segmented-sm">
      <button
        className={"lm-seg-btn " + (value === "day" ? "active" : "")}
        onClick={() => onChange("day")}
      >
        Jour
      </button>
      <button
        className={"lm-seg-btn " + (value === "week" ? "active" : "")}
        onClick={() => onChange("week")}
      >
        Semaine
      </button>
      {allowMonth && (
        <button
          className={"lm-seg-btn " + (value === "month" ? "active" : "")}
          onClick={() => onChange("month")}
        >
          Mois
        </button>
      )}
    </div>
  );
}
