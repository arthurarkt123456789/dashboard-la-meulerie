"use client";

import { useMemo } from "react";
import type { PeriodSelection, Store } from "@/lib/apitic/types";
import { PeriodToggle } from "./PeriodToggle";
import { Tabs } from "./Tabs";

type Props = {
  stores: Store[];
  activeTab: string;
  period: PeriodSelection;
  onPeriod: (p: PeriodSelection) => void;
  todayIso: string | null;
};

export function Header({
  stores,
  activeTab,
  period,
  onPeriod,
  todayIso,
}: Props) {
  const { dateStr, lastDayStr } = useMemo(() => {
    if (!todayIso) return { dateStr: "—", lastDayStr: "—" };
    const today = new Date(todayIso);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      dateStr: today.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      lastDayStr: yesterday.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    };
  }, [todayIso]);

  return (
    <header className="lm-header">
      <div className="lm-header-top">
        <div className="lm-brand">
          <div className="lm-brand-mark">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="12" cy="12" r="10" />
              <path
                d="M6 12 Q 12 6 18 12 Q 12 18 6 12 Z"
                fill="currentColor"
                opacity="0.15"
              />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <div className="lm-brand-name">
            <div className="lm-brand-line">LA MEULERIE</div>
            <div className="lm-brand-sub">Pilotage des ventes</div>
          </div>
        </div>

        <div className="lm-header-meta">
          <div className="lm-date-block">
            <div className="lm-date-day">{dateStr}</div>
            <div className="lm-date-time">
              <span className="lm-status-dot" /> APITIC · données arrêtées au {lastDayStr}
            </div>
          </div>
          <button className="lm-icon-btn" title="Rafraîchir" aria-label="Rafraîchir">
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path
                d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4M12.5 4V1.5M12.5 4H10M3.5 12v2.5M3.5 12H6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button className="lm-icon-btn" title="Exporter" aria-label="Exporter">
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path
                d="M8 2v8M8 10l3-3M8 10 5 7M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="lm-avatar">CV</div>
        </div>
      </div>

      <div className="lm-header-bottom">
        <Tabs value={activeTab} stores={stores} />
        <PeriodToggle value={period} onChange={onPeriod} />
      </div>
    </header>
  );
}
