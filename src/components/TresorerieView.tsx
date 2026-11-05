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

// ── Category colours ───────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  "Achats matières":      "#f59e0b",
  "Dépenses personnel":   "#7c3aed",
  "Dépenses externes":    "#0891b2",
  "Impôts & taxes":       "#dc2626",
  "Remb. emprunts":       "#be185d",
  "Dépenses financières": "#64748b",
  "Autres dépenses":      "#9ca3af",
  "Dépenses except.":     "#374151",
};
const STACK_ORDER = [
  "Achats matières",
  "Dépenses personnel",
  "Dépenses externes",
  "Impôts & taxes",
  "Remb. emprunts",
  "Dépenses financières",
  "Autres dépenses",
  "Dépenses except.",
];
function catColor(label: string): string {
  return CAT_COLORS[label] ?? "#9ca3af";
}

// ── Charts ──────────────────────────────────────────────────────────────────────

function CashflowChart({ months }: { months: MonthCashflow[] }) {
  const [hov, setHov] = useState<number | null>(null);
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

  const onMM = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * W;
    const idx = Math.floor((sx - PL) / barW);
    setHov(idx >= 0 && idx < months.length ? idx : null);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}
      onMouseMove={onMM} onMouseLeave={() => setHov(null)}>
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
        const isH = hov === i;
        return (
          <g key={i}>
            {isH && <rect x={x} y={PT} width={barW} height={cH} fill="white" opacity={0.07} />}
            <rect x={x + pad} y={yPos(m.inflows)} width={bw} height={inH} fill="#16a34a" opacity={isH ? 1 : 0.8} rx={1} />
            <rect x={x + pad * 2 + bw} y={yPos(m.outflows)} width={bw} height={outH} fill="#dc2626" opacity={isH ? 1 : 0.8} rx={1} />
            {(months.length <= 6 || i % 2 === 0) && (
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
        return <polyline points={pts.join(" ")} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.65} />;
      })()}

      {/* Hover tooltip */}
      {hov !== null && (() => {
        const m = months[hov];
        const bx = PL + hov * barW + barW / 2;
        const tx = Math.max(2, Math.min(W - 102, bx - 50));
        const ty = PT + 2;
        const netCol = m.net >= 0 ? "#86efac" : "#fca5a5";
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={tx} y={ty} width={100} height={48} fill="#0d1117" rx={3} stroke="#30363d" strokeWidth={0.5} opacity={0.97} />
            <text x={tx + 5} y={ty + 11} fontSize={7.5} fill="#e2e8f0" fontWeight="600">{fmtMonthShort(m.month)}</text>
            <text x={tx + 5} y={ty + 23} fontSize={7} fill="#86efac">▲ {fmtEur(m.inflows, true)}</text>
            <text x={tx + 5} y={ty + 34} fontSize={7} fill="#fca5a5">▼ {fmtEur(m.outflows, true)}</text>
            <text x={tx + 5} y={ty + 45} fontSize={7} fill={netCol}>= {fmtEur(m.net, true)}</text>
          </g>
        );
      })()}
    </svg>
  );
}

function BreakEvenChart({ data }: { data: BreakEvenPoint[] }) {
  const [hov, setHov] = useState<number | null>(null);
  if (data.length < 2) return null;
  const W = 300, H = 155, PL = 44, PR = 6, PT = 10, PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const allVals = [...data.map((d) => d.ca), ...data.map((d) => d.seuil ?? 0)].filter((v) => v > 0);
  const maxVal = Math.max(...allVals, 1);

  const xPos = (i: number) => PL + (i / (data.length - 1)) * cW;
  const yPos = (v: number) => PT + cH * (1 - Math.min(v / maxVal, 1));
  const yLabel = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const ptW = cW / (data.length - 1);

  const caPoints = data.map((d, i) => `${xPos(i)},${yPos(d.ca)}`).join(" ");
  let seuilPath = ""; let started = false;
  data.forEach((d, i) => {
    if (!d.seuil) { started = false; return; }
    seuilPath += started ? `L${xPos(i)},${yPos(d.seuil)} ` : `M${xPos(i)},${yPos(d.seuil)} `;
    started = true;
  });

  const onMM = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * W;
    const idx = Math.round((sx - PL) / ptW);
    setHov(idx >= 0 && idx < data.length ? idx : null);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}
      onMouseMove={onMM} onMouseLeave={() => setHov(null)}>
      {ticks.map((f, i) => (
        <g key={i}>
          <line x1={PL} y1={yPos(maxVal * f)} x2={W - PR} y2={yPos(maxVal * f)} stroke="var(--border-light)" strokeWidth={0.5} />
          <text x={PL - 3} y={yPos(maxVal * f) + 3.5} textAnchor="end" fontSize={7} fill="var(--fg-tertiary)">{yLabel(maxVal * f)}</text>
        </g>
      ))}
      <polyline points={caPoints} fill="none" stroke="#002FA7" strokeWidth={2} strokeLinejoin="round" />
      {seuilPath && <path d={seuilPath} fill="none" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />}
      {/* Dots on lines */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={xPos(i)} cy={yPos(d.ca)} r={hov === i ? 3.5 : 2} fill="#002FA7" opacity={hov === i ? 1 : 0.6} />
          {d.seuil && <circle cx={xPos(i)} cy={yPos(d.seuil)} r={hov === i ? 3 : 1.5} fill="#dc2626" opacity={hov === i ? 1 : 0.6} />}
          {(data.length <= 6 || i % 2 === 0) && (
            <text x={xPos(i)} y={H - 3} textAnchor="middle" fontSize={6.5} fill="var(--fg-tertiary)">{fmtMonthShort(d.month).slice(0, 6)}</text>
          )}
        </g>
      ))}
      {/* Hover tooltip */}
      {hov !== null && (() => {
        const d = data[hov];
        const tx = Math.max(2, Math.min(W - 110, xPos(hov) - 54));
        const ty = PT + 2;
        const above = d.seuil !== null && d.ca >= d.seuil;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={tx} y={ty} width={108} height={d.seuil ? 48 : 36} fill="#0d1117" rx={3} stroke="#30363d" strokeWidth={0.5} opacity={0.97} />
            <text x={tx + 5} y={ty + 11} fontSize={7.5} fill="#e2e8f0" fontWeight="600">{fmtMonthShort(d.month)}</text>
            <text x={tx + 5} y={ty + 23} fontSize={7} fill="#93c5fd">CA : {fmtEur(d.ca, true)}</text>
            {d.seuil && <>
              <text x={tx + 5} y={ty + 34} fontSize={7} fill="#fca5a5">SR : {fmtEur(d.seuil, true)}</text>
              <text x={tx + 5} y={ty + 45} fontSize={6.5} fill={above ? "#86efac" : "#fca5a5"}>{above ? "✓ au-dessus" : "⚠ sous SR"}</text>
            </>}
          </g>
        );
      })()}
    </svg>
  );
}

function StackedCashflowChart({ months }: { months: MonthCashflow[] }) {
  const [hov, setHov] = useState<number | null>(null);
  if (months.length < 2) return null;
  const W = 300, H = 165, PL = 44, PR = 6, PT = 10, PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const maxVal = Math.max(...months.map((m) => m.inflows), ...months.map((m) => m.outflows), 1);
  const barW = cW / months.length;
  const pad = 1.5;
  const bw = Math.max(barW - pad * 2, 2);
  const yPos = (v: number) => PT + cH * (1 - Math.min(v / maxVal, 1));
  const yLabel = (v: number) => v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
  const xL = (i: number) => PL + i * barW + pad;
  const xC = (i: number) => PL + i * barW + pad + bw / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const knownSet = new Set(STACK_ORDER);

  const onMM = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width * W;
    const idx = Math.floor((sx - PL) / barW);
    setHov(idx >= 0 && idx < months.length ? idx : null);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}
      onMouseMove={onMM} onMouseLeave={() => setHov(null)}>
      {ticks.map((f, i) => (
        <g key={i}>
          <line x1={PL} y1={yPos(maxVal * f)} x2={W - PR} y2={yPos(maxVal * f)} stroke="var(--border-light)" strokeWidth={0.5} />
          <text x={PL - 3} y={yPos(maxVal * f) + 3.5} textAnchor="end" fontSize={7} fill="var(--fg-tertiary)">{yLabel(maxVal * f)}</text>
        </g>
      ))}

      {/* Stacked bars per month */}
      {months.map((m, mi) => {
        const ordered = STACK_ORDER
          .map((label) => ({ label, amount: m.categoryBreakdown.find((c) => c.label === label && c.direction === "out")?.amount ?? 0 }))
          .filter((c) => c.amount > 0.01);
        const extras = m.categoryBreakdown.filter((c) => c.direction === "out" && !knownSet.has(c.label) && c.amount > 0.01);
        const all = [...ordered, ...extras];
        const catSum = all.reduce((s, c) => s + c.amount, 0);
        const uncat = Math.max(0, m.outflows - catSum);
        const isH = hov === mi;
        let yB = PT + cH;
        return (
          <g key={mi}>
            {isH && <rect x={PL + mi * barW} y={PT} width={barW} height={cH} fill="white" opacity={0.07} />}
            {all.map((cat, ci) => {
              const segH = Math.max(0, (cat.amount / maxVal) * cH);
              const y = yB - segH;
              yB -= segH;
              return <rect key={ci} x={xL(mi)} y={y} width={bw} height={segH} fill={catColor(cat.label)} opacity={isH ? 1 : 0.85} />;
            })}
            {uncat > 0.01 && (() => {
              const segH = (uncat / maxVal) * cH;
              const y = yB - segH;
              return <rect x={xL(mi)} y={y} width={bw} height={segH} fill="#374151" opacity={isH ? 0.6 : 0.3} />;
            })()}
            {(months.length <= 6 || mi % 2 === 0) && (
              <text x={xC(mi)} y={H - 3} textAnchor="middle" fontSize={6.5} fill="var(--fg-tertiary)">{fmtMonthShort(m.month).slice(0, 6)}</text>
            )}
          </g>
        );
      })}

      {/* CA / inflows line */}
      <polyline points={months.map((m, i) => `${xC(i)},${yPos(m.inflows)}`).join(" ")} fill="none" stroke="#002FA7" strokeWidth={2} strokeLinejoin="round" />
      {months.map((m, i) => (
        <circle key={i} cx={xC(i)} cy={yPos(m.inflows)} r={hov === i ? 3.5 : 2} fill="#002FA7" opacity={hov === i ? 1 : 0.65} />
      ))}

      {/* Hover tooltip */}
      {hov !== null && (() => {
        const m = months[hov];
        const outCats = m.categoryBreakdown.filter((c) => c.direction === "out" && c.amount > 0.01).sort((a, b) => b.amount - a.amount);
        const lines = outCats.length + 3;
        const th = lines * 11 + 10;
        const tw = 130;
        const tx = Math.max(2, Math.min(W - tw - 2, xC(hov) - tw / 2));
        const ty = Math.max(PT, Math.min(PT + cH - th, yPos(m.inflows) - th - 6));
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={tx} y={ty} width={tw} height={th} fill="#0d1117" rx={3} stroke="#30363d" strokeWidth={0.5} opacity={0.97} />
            <text x={tx + 5} y={ty + 11} fontSize={7.5} fill="#e2e8f0" fontWeight="600">{fmtMonthShort(m.month)}</text>
            <text x={tx + 5} y={ty + 22} fontSize={7} fill="#93c5fd">Encaiss. {fmtEur(m.inflows, true)}</text>
            {outCats.map((c, i) => (
              <g key={i}>
                <rect x={tx + 5} y={ty + 28 + i * 11} width={5} height={5} fill={catColor(c.label)} rx={1} />
                <text x={tx + 13} y={ty + 34 + i * 11} fontSize={6.5} fill="#cbd5e1">{c.label} {fmtEur(c.amount, true)}</text>
              </g>
            ))}
            <line x1={tx + 5} y1={ty + 29 + outCats.length * 11} x2={tx + tw - 5} y2={ty + 29 + outCats.length * 11} stroke="#30363d" strokeWidth={0.5} />
            <text x={tx + 5} y={ty + 39 + outCats.length * 11} fontSize={7} fill="#fca5a5">Total dép. {fmtEur(m.outflows, true)}</text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const DECOUVERT_AUTORISE: Record<string, number> = {
  endoume:    5000,
  malmousque: 10000,
  republique: 10000,
};

function BalanceKPI({ store }: { store: StoreTreasury }) {
  const [expanded, setExpanded] = useState(false);
  const isPositive = store.totalBalance >= 0;
  const decouvert = DECOUVERT_AUTORISE[store.id];

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
      {decouvert && (
        <div style={{ marginTop: 6, fontSize: 10, color: "var(--fg-tertiary)", borderTop: "1px solid var(--border-light)", paddingTop: 5 }}>
          Auth. découvert : <span style={{ color: "var(--fg-secondary)", fontWeight: 500 }}>{fmtEur(decouvert)}</span>
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
              <span className="treso-cat-dot" style={{ background: c.direction === "in" ? "#16a34a" : catColor(c.label) }} />
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
      <div className="lm-label" style={{ marginBottom: 8 }}>Dépenses récurrentes estimées</div>
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
  const lastM = months[months.length - 1];
  const isAbove = lastM && lastM.outflows > 0 && lastM.inflows >= lastM.outflows;

  // Active categories legend
  const activeCats = STACK_ORDER.filter((label) =>
    months.some((m) => m.categoryBreakdown.some((c) => c.label === label && c.direction === "out" && c.amount > 0.01)),
  );

  return (
    <div className="treso-block">
      <div className="treso-block-head">
        <span className="lm-label">SR Trésorerie</span>
        <span className="treso-legend">
          <svg width="14" height="8" viewBox="0 0 14 8" style={{ display: "inline-block", verticalAlign: "middle" }}>
            <line x1="0" y1="4" x2="14" y2="4" stroke="#002FA7" strokeWidth="2" />
          </svg>
          CA
        </span>
      </div>
      <StackedCashflowChart months={months} />
      {/* Category legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginTop: 6, marginBottom: 2 }}>
        {activeCats.map((label) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "var(--fg-secondary)" }}>
            <span style={{ display: "inline-block", width: 7, height: 7, background: catColor(label), borderRadius: 1, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>
      {lastM && lastM.outflows > 0 && (
        <div className="treso-be-summary" style={{ marginTop: 6 }}>
          <div>
            <span className="treso-summary-label">Encaiss. {fmtMonthShort(lastM.month)}</span>
            <span className="treso-summary-val" style={{ color: isAbove ? "var(--status-success)" : "#dc2626" }}>
              {fmtEur(lastM.inflows, true)}
              <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4 }}>{isAbove ? "✓" : "⚠"}</span>
            </span>
          </div>
          <div>
            <span className="treso-summary-label">Dép. {fmtMonthShort(lastM.month)}</span>
            <span className="treso-summary-val">{fmtEur(lastM.outflows, true)}</span>
          </div>
        </div>
      )}
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
      <CashSRBlock months={store.cashflowMonths} />
      <BreakEvenBlock data={store.breakEven} />
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
