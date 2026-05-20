"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Segment } from "@/lib/apitic/types";

export type SegmentFilterValue = "all" | Segment;

type Ctx = [SegmentFilterValue, (v: SegmentFilterValue) => void];
const SegmentFilterContext = createContext<Ctx | null>(null);

export function SegmentFilterProvider({ children }: { children: ReactNode }) {
  const state = useState<SegmentFilterValue>("all");
  return (
    <SegmentFilterContext.Provider value={state}>
      {children}
    </SegmentFilterContext.Provider>
  );
}

export function useSegmentFilter(): Ctx {
  const ctx = useContext(SegmentFilterContext);
  if (!ctx) throw new Error("useSegmentFilter must be used inside SegmentFilterProvider");
  return ctx;
}

const OPTS: { id: SegmentFilterValue; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "Fromagerie", label: "Fromagerie" },
  { id: "Snacking", label: "Snacking" },
];

export function SegmentFilterInline() {
  const [val, set] = useSegmentFilter();
  return (
    <div className="lm-segmented lm-segmented-sm">
      {OPTS.map((o) => (
        <button
          key={o.id}
          className={"lm-seg-btn " + (val === o.id ? "active" : "")}
          onClick={() => set(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
