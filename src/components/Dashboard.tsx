"use client";

import { useState } from "react";
import type { PeriodSelection } from "@/lib/apitic/types";
import { useStoreData, useStores, useToday } from "@/lib/queries";
import { Header } from "./Header";
import { ConsolidatedView } from "./ConsolidatedView";
import { StoreView } from "./StoreView";
import { SegmentFilterProvider } from "./SegmentFilter";

type Props = { tab: string };

export function Dashboard({ tab }: Props) {
  const [period, setPeriod] = useState<PeriodSelection>({
    kind: "preset",
    key: "7d",
  });
  const stores = useStores();
  const storeData = useStoreData();
  const today = useToday();

  const todayIso = today.data?.iso ?? null;
  const todayDate = todayIso ? new Date(todayIso) : new Date();

  return (
    <div className="lm-app">
      <Header
        stores={stores.data ?? []}
        activeTab={tab}
        period={period}
        onPeriod={setPeriod}
        todayIso={todayIso}
      />

      <main className="lm-main">
        <SegmentFilterProvider>
          {(() => {
            if (storeData.isLoading || !storeData.data) {
              return <DashboardSkeleton />;
            }
            if (storeData.isError) {
              return (
                <div
                  className="lm-scope-note"
                  style={{ borderColor: "var(--status-error)" }}
                >
                  <span className="lm-scope-dot" />
                  Connexion APITIC perdue.{" "}
                  <button
                    style={{
                      background: "none",
                      border: 0,
                      color: "var(--color-coral)",
                      textDecoration: "underline",
                      padding: 0,
                      marginLeft: 8,
                    }}
                    onClick={() => storeData.refetch()}
                  >
                    Réessayer
                  </button>
                </div>
              );
            }
            if (tab === "all") {
              return (
                <ConsolidatedView
                  stores={storeData.data}
                  period={period}
                />
              );
            }
            const store = storeData.data.find((s) => s.id === tab);
            if (!store) {
              return <div className="lm-empty">Magasin introuvable.</div>;
            }
            return (
              <StoreView store={store} period={period} today={todayDate} />
            );
          })()}
        </SegmentFilterProvider>
      </main>

      <footer className="lm-footer">
        <div>
          La Meulerie · Pilotage interne · données{" "}
          {process.env.NEXT_PUBLIC_APITIC_ENABLED === "true"
            ? "APITIC"
            : "APITIC (mock)"}
        </div>
        <div>
          Conçu par{" "}
          <span style={{ color: "var(--color-coral)", fontWeight: 500 }}>
            ARKT
          </span>{" "}
          Conseil
        </div>
      </footer>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="lm-grid">
      <div className="lm-kpis">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="lm-card lm-kpi"
            style={{ minHeight: 130, padding: 18 }}
          >
            <div
              className="lm-skeleton"
              style={{ width: 80, height: 12, marginBottom: 16 }}
            />
            <div
              className="lm-skeleton"
              style={{ width: 140, height: 34, marginBottom: 14 }}
            />
            <div className="lm-skeleton" style={{ width: 120, height: 12 }} />
          </div>
        ))}
      </div>
      <div
        className="lm-card"
        style={{ gridColumn: "span 2", minHeight: 360, padding: 20 }}
      >
        <div
          className="lm-skeleton"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div className="lm-card" style={{ minHeight: 360, padding: 20 }}>
        <div
          className="lm-skeleton"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
