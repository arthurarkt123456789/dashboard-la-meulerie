"use client";

import { useWebcaisseToday } from "@/lib/queries";
import { fmtEURshort } from "@/lib/format";
import type { Store } from "@/lib/apitic/types";

const STORE_COLORS: Record<string, string> = {
  davso: "#E8420D",
  endoume: "#2563EB",
  malmousque: "#059669",
  republique: "#9333EA",
};

type Props = {
  activeTab: string;
  stores: Store[];
};

export function WebcaisseLiveCard({ activeTab, stores }: Props) {
  const liveQ = useWebcaisseToday();

  if (liveQ.isLoading) return null;

  if (liveQ.isError || !liveQ.data) {
    const msg = liveQ.isError ? String((liveQ.error as Error)?.message ?? "erreur") : null;
    const is503 = msg?.includes("503");
    return (
      <div style={{
        background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
        padding: "10px 16px", marginBottom: 20,
        fontSize: 12, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>●</span>
        <span>
          Live indisponible —{" "}
          {is503 ? "WEBCAISSE_TOKEN non configuré (Railway → Variables)" : (msg ?? "erreur réseau")}
        </span>
        <button
          onClick={() => liveQ.refetch()}
          style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", color: "#b91c1c", fontSize: 13 }}
        >↻</button>
      </div>
    );
  }

  const live = liveQ.data!;
  const lastFetch = new Date(live.fetchedAt);
  const minsAgo = Math.round((Date.now() - lastFetch.getTime()) / 60000);
  const timeLabel = minsAgo === 0 ? "à l'instant" : `il y a ${minsAgo} min`;

  const isAllTab = activeTab === "all";
  const storeEntry = isAllTab ? null : live.stores[activeTab];

  return (
    <div style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      borderRadius: 10,
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      marginBottom: 20,
      overflow: "hidden",
    }}>
      {/* Header row */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: "#22c55e",
          display: "inline-block",
          boxShadow: "0 0 6px #22c55e",
          animation: "lm-pulse 2s infinite",
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Aujourd'hui · Live
        </span>
        <span style={{ fontSize: 11, color: "#475569", marginLeft: 4 }}>
          {live.date} · {timeLabel}
        </span>
        <button
          onClick={() => liveQ.refetch()}
          style={{ background: "none", border: 0, cursor: "pointer", color: "#64748b", fontSize: 14, padding: "0 0 0 2px", lineHeight: 1 }}
          title="Actualiser"
        >↻</button>
      </div>

      {/* Content */}
      {isAllTab ? (
        /* All stores: horizontal rows */
        <div style={{ padding: "10px 16px 12px", display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
          {stores.map((store) => {
            const sd = live.stores[store.id];
            if (!sd) return null;
            const color = STORE_COLORS[store.id] ?? "#94a3b8";
            return (
              <div key={store.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 14px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 8,
                borderLeft: `3px solid ${color}`,
                flex: "1 1 160px",
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", minWidth: 80 }}>{store.name}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-display)" }}>
                  {fmtEURshort(sd.caHT)}
                </span>
                <span style={{ fontSize: 11, color: "#64748b" }}>HT</span>
                <span style={{ fontSize: 13, color: "#94a3b8", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>
                  {sd.tx} tx
                </span>
              </div>
            );
          })}
          {/* Total réseau */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "8px 14px",
            background: "rgba(255,255,255,0.08)",
            borderRadius: 8,
            borderLeft: "3px solid #f1f5f9",
            flex: "1 1 160px",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", minWidth: 80 }}>Total réseau</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-display)" }}>
              {fmtEURshort(live.global.caHT)}
            </span>
            <span style={{ fontSize: 11, color: "#64748b" }}>HT</span>
            <span style={{ fontSize: 13, color: "#94a3b8", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>
              {live.global.tx} tx
            </span>
          </div>
        </div>
      ) : storeEntry ? (
        /* Single store: 3 stat boxes */
        <div style={{ padding: "10px 16px 14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { label: "C.A. HT", value: fmtEURshort(storeEntry.caHT) },
            { label: "C.A. TTC", value: fmtEURshort(storeEntry.ca) },
            { label: "Transactions", value: String(storeEntry.tx) },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-display)" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Store present in tab but no live data yet */
        <div style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>
          Aucune donnée live pour ce magasin aujourd'hui.
        </div>
      )}
    </div>
  );
}
