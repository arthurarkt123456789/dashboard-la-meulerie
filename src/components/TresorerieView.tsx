"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Store } from "@/lib/apitic/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type CategoryFlow = {
  label: string;
  amount: number;
  direction: "in" | "out";
};
type MonthCashflow = {
  month: string;
  inflows: number;
  outflows: number;
  net: number;
  categoryBreakdown: CategoryFlow[];
};
type RecurringItem = { label: string; prevYearAvg: number; lastMonthAmount: number };
type RecurringCharges = {
  items: RecurringItem[];
  totalPrevYearAvg: number;
  totalLastMonth: number;
  prevFiscalYearLabel: string;
  lastMonthLabel: string;
};
type BreakEvenPoint = {
  month: string;
  ca: number;
  chargesFixed: number;
  chargesVariable: number;
  seuil: number | null;
};
type StoreTreasury = {
  id: string;
  name: string;
  totalBalance: number;
  bankAccounts: { name: string; balance: number }[];
  bankSynced: boolean;
  cashflowMonths: MonthCashflow[];
  recurringCharges: RecurringCharges;
  breakEven: BreakEvenPoint[];
};
type TresoData = {
  stores: StoreTreasury[];
  storeErrors: { id: string; name: string; error: string }[];
  fetchedAt: string;
};

// ── Formatting ─────────────────────────────────────────────────────────────────

const fmtEur = (n: number, compact = false) => {
  if (compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(n);
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

const fmtMonthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const mon = d.toLocaleDateString("fr-FR", { month: "short" });
  return `${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${String(y).slice(2)}`;
};

// ── Charts ──────────────────────────────────────────────────────────────────────

function CashflowChart({ months }: { months: MonthCashflow[] }) {
  const W = 300, H = 165, PL = 42, PR = 6, PT = 10, PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const maxVal = Math.max(...months.flatMap((m) => [m.inflows, m.outflows]), 1);
  const barW = cW / months.length;
  const pad = 1.5;
  const bw = Math.max((barW - pad * 3) / 2, 2);
  const yPos = (v: number) => PT + cH * (1 - Math.min(v / maxVal, 1));
  const yLabel = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {ticks.map((f, i) => (
        <g key={i}>
          <line x1={PL} y1={yPos(maxVal * f)} x2={W - PR} y2={yPos(maxVal * f)} stroke="var(--border-light)" strokeWidth={0.5} />
          <text x={PL - 3} y={yPos(maxVal * f) + 3.5} textAnchor="end" fontSize={7} fill="var(--fg-tertiary)">
            {yLabel(maxVal * f)}
          </text>
        </g>
      ))}

      {months.map((m, i) => {
        const x = PL + i * barW;
        const inH = (m.inflows / maxVal) * cH;
        const outH = (m.outflows / maxVal) * cH;
        const showLabel = months.length <= 6 || i % 2 === 0;
        return (
          <g key={i}>
            <rect x={x + pad} y={yPos(m.inflows)} width={bw} height={inH} fill="#16a34a" opacity={0.8} rx={1} />
            <rect x={x + pad * 2 + bw} y={yPos(m.outflows)} width={bw} height={outH} fill="#dc2626" opacity={0.8} rx={1} />
            {showLabel && (
              <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize={6.5} fill="var(--fg-tertiary)">
                {fmtMonthShort(m.month).slice(0, 6)}
              </text>
            )}
          </g>
        );
      })}

      {/* Net balance line */}
      {months.length > 1 && (() => {
        const nets = months.map((m) => m.net);
        const netMin = Math.min(...nets);
        const netMax = Math.max(...nets);
        const range = Math.max(netMax - netMin, 1);
        const midY = PT + cH * 0.5;
        const pts = months.map((m, i) => {
          const x = PL + i * barW + barW / 2;
          const y = midY - ((m.net - (netMax + netMin) / 2) / range) * cH * 0.4;
          return `${x},${Math.max(PT + 2, Math.min(PT + cH - 2, y))}`;
        });
        return (
          <polyline points={pts.join(" ")} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.65} />
        );
      })()}
    </svg>
  );
}

function BreakEvenChart({ data }: { data: BreakEvenPoint[] }) {
  if (data.length < 2) return null;
  const W = 300, H = 155, PL = 44, PR = 6, PT = 10, PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const allVals = [
    ...data.map((d) => d.ca),
    ...data.map((d) => d.seuil ?? 0),
  ].filter((v) => v > 0);
  const maxVal = Math.max(...allVals, 1);

  const xPos = (i: number) => PL + (i / (data.length - 1)) * cW;
  const yPos = (v: number) => PT + cH * (1 - Math.min(v / maxVal, 1));
  const yLabel = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const caPoints = data.map((d, i) => `${xPos(i)},${yPos(d.ca)}`).join(" ");

  let seuilPath = "";
  let seuilStarted = false;
  data.forEach((d, i) => {
    if (d.seuil === null || d.seuil === 0) { seuilStarted = false; return; }
    seuilPath += seuilStarted ? `L${xPos(i)},${yPos(d.seuil)} ` : `M${xPos(i)},${yPos(d.seuil)} `;
    seuilStarted = true;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {ticks.map((f, i) => (
        <g key={i}>
          <line x1={PL} y1={yPos(maxVal * f)} x2={W - PR} y2={yPos(maxVal * f)} stroke="var(--border-light)" strokeWidth={0.5} />
          <text x={PL - 3} y={yPos(maxVal * f) + 3.5} textAnchor="end" fontSize={7} fill="var(--fg-tertiary)">
            {yLabel(maxVal * f)}
          </text>
        </g>
      ))}
      {/* Area between lines for visual context */}
      {seuilPath && caPoints && (
        <clipPath id="chartClip">
          <rect x={PL} y={PT} width={cW} height={cH} />
        </clipPath>
      )}
      <polyline points={caPoints} fill="none" stroke="#002FA7" strokeWidth={2} strokeLinejoin="round" />
      {seuilPath && <path d={seuilPath} fill="none" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />}
      {data.map((d, i) => (
        (data.length <= 6 || i % 2 === 0) && (
          <text key={i} x={xPos(i)} y={H - 3} textAnchor="middle" fontSize={6.5} fill="var(--fg-tertiary)">
            {fmtMonthShort(d.month).slice(0, 6)}
          </text>
        )
      ))}
    </svg>
  );
}

function CashSRChart({ months, avgOutflows }: { months: MonthCashflow[]; avgOutflows: number }) {
  if (months.length < 2) return null;
  const W = 300, H = 155, PL = 44, PR = 6, PT = 10, PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const allVals = [...months.map((m) => m.inflows), ...months.map((m) => m.outflows), avgOutflows].filter((v) => v > 0);
  const maxVal = Math.max(...allVals, 1);

  const xPos = (i: number) => PL + (i / (months.length - 1)) * cW;
  const yPos = (v: number) => PT + cH * (1 - Math.min(v / maxVal, 1));
  const yLabel = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const srY = yPos(avgOutflows);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {ticks.map((f, i) => (
        <g key={i}>
          <line x1={PL} y1={yPos(maxVal * f)} x2={W - PR} y2={yPos(maxVal * f)} stroke="var(--border-light)" strokeWidth={0.5} />
          <text x={PL - 3} y={yPos(maxVal * f) + 3.5} textAnchor="end" fontSize={7} fill="var(--fg-tertiary)">
            {yLabel(maxVal * f)}
          </text>
        </g>
      ))}
      {/* SR tréso = average outflows (orange reference) */}
      {avgOutflows > 0 && (
        <line x1={PL} y1={srY} x2={W - PR} y2={srY} stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 3" />
      )}
      {/* Outflows line (red dashed) */}
      <polyline
        points={months.map((m, i) => `${xPos(i)},${yPos(m.outflows)}`).join(" ")}
        fill="none" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round"
      />
      {/* Inflows line (blue solid) */}
      <polyline
        points={months.map((m, i) => `${xPos(i)},${yPos(m.inflows)}`).join(" ")}
        fill="none" stroke="#002FA7" strokeWidth={2} strokeLinejoin="round"
      />
      {months.map((m, i) =>
        (months.length <= 6 || i % 2 === 0) ? (
          <text key={i} x={xPos(i)} y={H - 3} textAnchor="middle" fontSize={6.5} fill="var(--fg-tertiary)">
            {fmtMonthShort(m.month).slice(0, 6)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BalanceKPI({ store }: { store: StoreTreasury }) {
  const [expanded, setExpanded] = useState(false);
  const isPositive = store.totalBalance >= 0;

  return (
    <div className="treso-block">
      <div className="lm-label" style={{ marginBottom: 6 }}>Trésorerie actuelle</div>
      {store.bankSynced ? (
        <>
          <div className="treso-balance" style={{ color: isPositive ? "var(--status-success)" : "#dc2626" }}>
            {fmtEur(store.totalBalance)}
          </div>
          {store.bankAccounts.length > 0 && (
            <button
              className="treso-expand-btn"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
            >
              {store.bankAccounts.length} compte(s) {expanded ? "▲" : "▼"}
            </button>
          )}
          {expanded && (
            <div className="treso-accounts">
              {store.bankAccounts.map((a, i) => (
                <div key={i} className="treso-account-row">
                  <span className="treso-account-name" title={a.name}>
                    {a.name.length > 36 ? `${a.name.slice(0, 36)}…` : a.name}
                  </span>
                  <span style={{ color: a.balance >= 0 ? "var(--fg-primary)" : "#dc2626", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: 11, fontWeight: 500 }}>
                    {fmtEur(a.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--fg-tertiary)", fontStyle: "italic", paddingBottom: 4 }}>
          Sync. bancaire non configurée
        </div>
      )}
    </div>
  );
}

function CashflowBlock({ months }: { months: MonthCashflow[] }) {
  const [showAll, setShowAll] = useState(false);
  const lastMonth = months[months.length - 1];
  const cats = lastMonth?.categoryBreakdown ?? [];
  const topCats = showAll ? cats : cats.slice(0, 6);

  return (
    <div className="treso-block">
      <div className="treso-block-head">
        <span className="lm-label">Flux mensuel</span>
        <span className="treso-legend">
          <span className="treso-legend-dot" style={{ background: "#16a34a" }} />Entrées
          <span className="treso-legend-dot" style={{ background: "#dc2626" }} />Sorties
          <svg width="14" height="8" viewBox="0 0 14 8" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }}>
            <line x1="0" y1="4" x2="14" y2="4" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="3 2" opacity={0.65} />
          </svg>
          Net
        </span>
      </div>
      <CashflowChart months={months} />

      <div className="treso-month-summary">
        <div>
          <span className="treso-summary-label">Entrées</span>
          <span className="treso-summary-val treso-green">{fmtEur(lastMonth?.inflows ?? 0, true)}</span>
        </div>
        <div>
          <span className="treso-summary-label">Sorties</span>
          <span className="treso-summary-val treso-red">{fmtEur(lastMonth?.outflows ?? 0, true)}</span>
        </div>
        <div>
          <span className="treso-summary-label">Net</span>
          <span className={`treso-summary-val ${(lastMonth?.net ?? 0) >= 0 ? "treso-green" : "treso-red"}`}>
            {fmtEur(lastMonth?.net ?? 0, true)}
          </span>
        </div>
      </div>

      {topCats.length > 0 && (
        <div className="treso-cats">
          <div className="treso-cats-title">
            Catégories — {lastMonth ? fmtMonthShort(lastMonth.month) : "—"}
          </div>
          {topCats.map((c, i) => (
            <div key={i} className="treso-cat-row">
              <span className="treso-cat-dot" style={{ background: c.direction === "in" ? "#16a34a" : "#dc2626" }} />
              <span className="treso-cat-label">{c.label}</span>
              <span className="treso-cat-amount">{fmtEur(c.amount, true)}</span>
            </div>
          ))}
          {cats.length > 6 && (
            <button className="treso-show-more" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Voir moins" : `+${cats.length - 6} autres`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RecurringChargesBlock({ data }: { data: RecurringCharges }) {
  return (
    <div className="treso-block">
      <div className="lm-label" style={{ marginBottom: 8 }}>Charges récurrentes estimées</div>
      <div className="treso-rec-table">
        <div className="treso-rec-row treso-rec-header">
          <span />
          <span>Moy. N–1</span>
          <span>Mois préc.</span>
        </div>
        {data.items.map((item, i) => {
          const delta = item.prevYearAvg > 0
            ? (item.lastMonthAmount - item.prevYearAvg) / item.prevYearAvg
            : 0;
          return (
            <div key={i} className="treso-rec-row">
              <span className="treso-rec-label">{item.label}</span>
              <span className="treso-rec-val">{fmtEur(item.prevYearAvg, true)}</span>
              <span className="treso-rec-val">
                {fmtEur(item.lastMonthAmount, true)}
                {Math.abs(delta) > 0.05 && (
                  <span className={delta > 0 ? "treso-delta-up" : "treso-delta-dn"}>
                    {delta > 0 ? " ↑" : " ↓"}
                    {Math.round(Math.abs(delta) * 100)}%
                  </span>
                )}
              </span>
            </div>
          );
        })}
        <div className="treso-rec-row treso-rec-total">
          <span>Total</span>
          <span>{fmtEur(data.totalPrevYearAvg, true)}</span>
          <span style={{ color: data.totalLastMonth > data.totalPrevYearAvg * 1.05 ? "#dc2626" : "var(--status-success)" }}>
            {fmtEur(data.totalLastMonth, true)}
          </span>
        </div>
      </div>
      {data.prevFiscalYearLabel && (
        <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 6 }}>
          Exercice de référence : {data.prevFiscalYearLabel}
        </div>
      )}
    </div>
  );
}

function BreakEvenBlock({ data }: { data: BreakEvenPoint[] }) {
  const lastValid = [...data].reverse().find((d) => d.seuil !== null && d.seuil > 0);
  const lastCA = data[data.length - 1]?.ca ?? 0;
  const isAbove = lastCA > 0 && lastValid && lastCA >= lastValid.seuil!;

  return (
    <div className="treso-block" style={{ borderBottom: 0 }}>
      <div className="treso-block-head">
        <span className="lm-label">Seuil de Rentabilité</span>
        <span className="treso-legend">
          <span className="treso-legend-dot" style={{ background: "#002FA7" }} />CA
          <svg width="14" height="8" viewBox="0 0 14 8" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }}>
            <line x1="0" y1="4" x2="14" y2="4" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          SR
        </span>
      </div>
      <BreakEvenChart data={data} />
      {lastValid && (
        <div className="treso-be-summary">
          <div>
            <span className="treso-summary-label">SR mensuel</span>
            <span className="treso-summary-val">{fmtEur(lastValid.seuil!, true)}</span>
          </div>
          <div>
            <span className="treso-summary-label">CA {fmtMonthShort(data[data.length - 1]?.month ?? "")}</span>
            <span className="treso-summary-val" style={{ color: isAbove ? "var(--status-success)" : "#dc2626" }}>
              {fmtEur(lastCA, true)}
              <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4 }}>
                {isAbove ? "✓ au-dessus" : "⚠ sous SR"}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CashSRBlock({ months }: { months: MonthCashflow[] }) {
  // SR tréso = average monthly outflows of previous fiscal year (months 0-11)
  // Outflows from 51x/53x include ALL cash out: salaries, suppliers, loan repayments, taxes
  const refMonths = months.slice(0, 12).filter((m) => m.outflows > 0);
  const avgOutflows = refMonths.length > 0
    ? refMonths.reduce((s, m) => s + m.outflows, 0) / refMonths.length
    : 0;

  const lastM = months[months.length - 1];
  const isAbove = lastM && avgOutflows > 0 && lastM.inflows >= avgOutflows;

  return (
    <div className="treso-block" style={{ borderBottom: 0 }}>
      <div className="treso-block-head">
        <span className="lm-label">SR Trésorerie</span>
        <span className="treso-legend">
          <span className="treso-legend-dot" style={{ background: "#002FA7" }} />Encaissements
          <svg width="14" height="8" viewBox="0 0 14 8" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }}>
            <line x1="0" y1="4" x2="14" y2="4" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 3" />
          </svg>
          Moy. décaissements
        </span>
      </div>
      <CashSRChart months={months} avgOutflows={avgOutflows} />
      {avgOutflows > 0 && lastM && (
        <div className="treso-be-summary">
          <div>
            <span className="treso-summary-label">Seuil tréso (moy. N–1)</span>
            <span className="treso-summary-val">{fmtEur(avgOutflows, true)}</span>
          </div>
          <div>
            <span className="treso-summary-label">Encaissements {fmtMonthShort(lastM.month)}</span>
            <span className="treso-summary-val" style={{ color: isAbove ? "var(--status-success)" : "#dc2626" }}>
              {fmtEur(lastM.inflows, true)}
              <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4 }}>
                {isAbove ? "✓ au-dessus" : "⚠ sous seuil"}
              </span>
            </span>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 6 }}>
        Inclut remboursements d'emprunts. Source : flux 51x/53x.
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div className="treso-col">
      <div className="treso-col-head">
        <div className="lm-skeleton" style={{ height: 14, width: "55%", borderRadius: 3 }} />
      </div>
      {[80, 200, 110, 165].map((h, i) => (
        <div key={i} className="treso-block" style={i === 3 ? { borderBottom: 0 } : {}}>
          <div className="lm-skeleton" style={{ height: h, borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

function StoreColumn({ store }: { store: StoreTreasury }) {
  return (
    <div className="treso-col">
      <div className="treso-col-head">
        <span className="treso-col-name">{store.name}</span>
      </div>
      <BalanceKPI store={store} />
      <CashflowBlock months={store.cashflowMonths} />
      <RecurringChargesBlock data={store.recurringCharges} />
      <BreakEvenBlock data={store.breakEven} />
      <CashSRBlock months={store.cashflowMonths} />
    </div>
  );
}

function TresoHeader({
  stores,
  fetchedAt,
  onRefresh,
  refreshing,
}: {
  stores: Store[];
  fetchedAt: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const updatedStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const items = [
    { id: "all", label: "Vue consolidée" },
    ...stores.map((s) => ({ id: s.id, label: s.name })),
    { id: "tresorerie", label: "Trésorerie" },
  ];

  return (
    <header className="lm-header">
      <div className="lm-header-top">
        <div className="lm-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-la-meulerie.png" alt="La Meulerie" style={{ height: 52, width: "auto", display: "block" }} />
        </div>
        <div className="lm-header-meta">
          <div className="lm-date-block">
            <div className="lm-brand-sub" style={{ marginBottom: 2 }}>Trésorerie · Pennylane</div>
            <div className="lm-date-day">{dateStr}</div>
            <div className="lm-date-time">
              <span className="lm-status-dot" />
              {updatedStr ? `Données au ${updatedStr}` : "Chargement…"}
            </div>
          </div>
          <button
            className="lm-icon-btn"
            title="Rafraîchir"
            aria-label="Rafraîchir"
            onClick={onRefresh}
            disabled={refreshing}
            style={refreshing ? { animation: "lm-spin 0.8s linear infinite" } : undefined}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4M12.5 4V1.5M12.5 4H10M3.5 12v2.5M3.5 12H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="lm-header-bottom">
        <div className="lm-tabs">
          {items.map((it) => (
            <Link
              key={it.id}
              href={it.id === "tresorerie" ? "/tresorerie" : `/${it.id}`}
              className={`lm-tab${it.id === "tresorerie" ? " active" : ""}`}
              style={{ textDecoration: "none" }}
            >
              {it.label}
              {it.id === "tresorerie" && <span className="lm-tab-ind" />}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type Props = { stores: Store[] };

export function TresorerieView({ stores }: Props) {
  const [data, setData] = useState<TresoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/treso")
      .then((r) => {
        if (!r.ok) return r.text().then((t) => Promise.reject(new Error(`${r.status}: ${t.slice(0, 120)}`)));
        return r.json() as Promise<TresoData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [tick]);

  return (
    <div className="lm-app">
      <TresoHeader
        stores={stores}
        fetchedAt={data?.fetchedAt ?? null}
        onRefresh={() => setTick((t) => t + 1)}
        refreshing={loading}
      />
      <main className="lm-main">
        {error && (
          <div style={{ padding: "24px 0", color: "#dc2626", fontSize: 13 }}>
            Erreur : {error}
          </div>
        )}
        <div className="treso-columns">
          {loading ? (
            [0, 1, 2, 3].map((i) => <ColumnSkeleton key={i} />)
          ) : (
            <>
              {(data?.stores ?? []).map((store) => (
                <StoreColumn key={store.id} store={store} />
              ))}
              {(data?.storeErrors ?? []).map((e) => (
                <div key={e.id} className="treso-col">
                  <div className="treso-col-head">
                    <span className="treso-col-name">{e.name}</span>
                  </div>
                  <div className="treso-block" style={{ color: "#dc2626", fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Données indisponibles</div>
                    <div style={{ color: "var(--fg-tertiary)", wordBreak: "break-all" }}>{e.error}</div>
                  </div>
                </div>
              ))}
              {!error && data && data.stores.length === 0 && data.storeErrors.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 16px", color: "var(--fg-secondary)", fontSize: 13 }}>
                  Aucune donnée Pennylane disponible. Vérifiez la configuration des tokens.
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
