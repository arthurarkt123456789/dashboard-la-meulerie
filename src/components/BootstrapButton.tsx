"use client";

import { useState, useCallback } from "react";

type Props = {
  storeId: string;
  historyDays?: number;
  chunkDays?: number;
  onDone?: () => void;
};

function dateChunks(
  from: string,
  to: string,
  chunkDays: number,
): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = [];
  const endDate = new Date(`${to}T00:00:00Z`);
  const cur = new Date(`${from}T00:00:00Z`);
  while (cur <= endDate) {
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
    chunks.push({
      from: cur.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    cur.setUTCDate(cur.getUTCDate() + chunkDays);
  }
  return chunks;
}

function subtractDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function BootstrapButton({
  storeId,
  historyDays = 1095,
  chunkDays = 10,
  onDone,
}: Props) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running"; done: number; total: number; range: string; fetched: number; skipped: number }
    | { kind: "done"; fetched: number; skipped: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const run = useCallback(async () => {
    const yesterday = subtractDays(1);
    const from = subtractDays(historyDays);
    const chunks = dateChunks(from, yesterday, chunkDays);

    setState({ kind: "running", done: 0, total: chunks.length, range: "", fetched: 0, skipped: 0 });

    let totalFetched = 0;
    let totalSkipped = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      setState((s) =>
        s.kind === "running"
          ? { ...s, done: i, range: `${chunk.from} → ${chunk.to}` }
          : s,
      );
      try {
        const res = await fetch(
          `/api/store-bootstrap?storeId=${storeId}&from=${chunk.from}&to=${chunk.to}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          // Skip APITIC-unavailable errors (blackout etc.) but stop on config errors
          if (res.status === 400) {
            setState({ kind: "error", message: body.error ?? "Erreur serveur" });
            return;
          }
          // transient error: keep going
        } else {
          const data = await res.json();
          totalFetched += data.fetched ?? 0;
          totalSkipped += data.skipped ?? 0;
        }
      } catch {
        // network error: continue
      }
      setState((s) =>
        s.kind === "running"
          ? { ...s, done: i + 1, fetched: totalFetched, skipped: totalSkipped }
          : s,
      );
    }

    setState({ kind: "done", fetched: totalFetched, skipped: totalSkipped });
    onDone?.();
  }, [storeId, historyDays, chunkDays, onDone]);

  if (state.kind === "idle") {
    return (
      <button
        onClick={run}
        style={{
          fontSize: 11,
          fontFamily: "var(--font-body)",
          color: "var(--color-coral)",
          background: "none",
          border: "1px solid var(--color-coral)",
          borderRadius: 4,
          padding: "2px 8px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Charger l&apos;historique
      </button>
    );
  }

  if (state.kind === "running") {
    const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg-secondary)", fontFamily: "var(--font-body)" }}>
          <span>Chargement… {state.done}/{state.total}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: "var(--bg-subtle)", borderRadius: 2 }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--color-coral)",
              borderRadius: 2,
              transition: "width 300ms ease",
            }}
          />
        </div>
        <div style={{ fontSize: 10, color: "var(--fg-secondary)", fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
          {state.range} · {state.fetched} chargés / {state.skipped} déjà en cache
        </div>
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <span style={{ fontSize: 11, color: "var(--fg-secondary)", fontFamily: "var(--font-body)" }}>
        ✓ {state.fetched} jours chargés · Rechargez la page
      </span>
    );
  }

  return (
    <span style={{ fontSize: 11, color: "var(--color-coral)", fontFamily: "var(--font-body)" }}>
      Erreur : {state.message}
    </span>
  );
}
