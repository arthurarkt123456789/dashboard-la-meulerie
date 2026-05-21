"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PeriodSelection, Store } from "@/lib/apitic/types";
import { PeriodToggle } from "./PeriodToggle";
import { Tabs } from "./Tabs";
import { AmountModeToggle, type AmountMode } from "./AmountModeToggle";

type Props = {
  stores: Store[];
  activeTab: string;
  period: PeriodSelection;
  onPeriod: (p: PeriodSelection) => void;
  amountMode: AmountMode;
  onAmountMode: (m: AmountMode) => void;
  todayIso: string | null;
};

export function Header({
  stores,
  activeTab,
  period,
  onPeriod,
  amountMode,
  onAmountMode,
  todayIso,
}: Props) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      // brief visual feedback then back to normal
      setTimeout(() => setRefreshing(false), 400);
    }
  }

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
          <button
            className="lm-icon-btn"
            title="Rafraîchir les données"
            aria-label="Rafraîchir"
            onClick={handleRefresh}
            disabled={refreshing}
            style={
              refreshing
                ? { transform: "rotate(360deg)", transition: "transform 400ms ease" }
                : undefined
            }
          >
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
          <div className="lm-avatar">CV</div>
        </div>
      </div>

      <div className="lm-header-bottom">
        <Tabs value={activeTab} stores={stores} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <AmountModeToggle value={amountMode} onChange={onAmountMode} />
          <PeriodToggle value={period} onChange={onPeriod} />
        </div>
      </div>
    </header>
  );
}
