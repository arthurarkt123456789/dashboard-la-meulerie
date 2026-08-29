"use client";

import { useEffect, useRef, useState } from "react";
import type { PeriodSelection, StoreDaily } from "@/lib/apitic/types";
import { useStoreData, useStores, useToday } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "./Header";
import { ConsolidatedView } from "./ConsolidatedView";
import { StoreView } from "./StoreView";
import { SegmentFilterProvider } from "./SegmentFilter";
import type { AmountMode } from "./AmountModeToggle";

type Props = { tab: string };

// Bootstrap missing historical data (Oct 2024 – first cached day) for a single
// store by calling /api/store-bootstrap in 30-day chunks.
async function backfillStore(
  storeId: string,
  openedDate: string,
  daily: StoreDaily[],
): Promise<number> {
  const FISCAL_START = "2024-10-01";
  const start = openedDate > FISCAL_START ? openedDate : FISCAL_START;
  const firstDataDay = daily.find((d) => !d.closed && d.tx > 0);
  if (!firstDataDay || firstDataDay.date <= start) return 0;

  let totalFetched = 0;
  let cur = new Date(`${start}T00:00:00Z`);
  const gap = new Date(`${firstDataDay.date}T00:00:00Z`);

  while (cur < gap) {
    const from = cur.toISOString().slice(0, 10);
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 29);
    if (chunkEnd >= gap) chunkEnd.setTime(gap.getTime() - 86400000);
    const to = chunkEnd.toISOString().slice(0, 10);

    try {
      const res = await fetch(
        `/api/store-bootstrap?storeId=${storeId}&from=${from}&to=${to}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { fetched?: number };
        totalFetched += data.fetched ?? 0;
      }
    } catch {
      // network error — skip this chunk silently
    }
    cur.setUTCDate(cur.getUTCDate() + 30);
  }
  return totalFetched;
}

export function Dashboard({ tab }: Props) {
  const [period, setPeriod] = useState<PeriodSelection>({
    kind: "preset",
    key: "7d",
  });
  const [amountMode, setAmountMode] = useState<AmountMode>("HT");
  const stores = useStores();
  const storeData = useStoreData();
  const today = useToday();
  const queryClient = useQueryClient();
  const didBootstrap = useRef(false);

  useEffect(() => {
    if (didBootstrap.current || !storeData.data?.length) return;
    didBootstrap.current = true;

    Promise.all(
      storeData.data.map((s) => backfillStore(s.id, s.openedDate, s.daily)),
    ).then((counts) => {
      if (counts.some((c) => c > 0)) {
        void queryClient.invalidateQueries({ queryKey: ["store-data"] });
      }
    });
  }, [storeData.data, queryClient]);

  const todayIso = today.data?.iso ?? null;
  const todayDate = todayIso ? new Date(todayIso) : new Date();

  return (
    <div className="lm-app">
      <Header
        stores={stores.data ?? []}
        activeTab={tab}
        period={period}
        onPeriod={setPeriod}
        amountMode={amountMode}
        onAmountMode={setAmountMode}
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
                  amountMode={amountMode}
                />
              );
            }
            const store = storeData.data.find((s) => s.id === tab);
            if (!store) {
              return <div className="lm-empty">Magasin introuvable.</div>;
            }
            return (
              <StoreView
                store={store}
                period={period}
                today={todayDate}
                amountMode={amountMode}
              />
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
