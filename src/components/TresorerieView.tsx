"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type Creditor = {
  name: string;
  totalAmount: number;
  count: number;
  categorizedAmount: number;
  uncategorizedAmount: number;
  inferredCategory: string | null;
};

type CurrentMonthForecast = {
  month: string;
  caToDate: number;
  tauxMargeTheorique: number | null;
  margeToDate: number | null;
  chargesFixesMoyennes: number;
  caRequis: number | null;
  caManquant: number | null;
  jours: { elapsed: number; total: number };
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
  currentMonthForecast: CurrentMonthForecast | null;
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
  "Non classé":           "#d1d5db",
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
  "Non classé",
];
function catColor(label: string): string {
  return CAT_COLORS[label] ?? "#9ca3af";
}

const ASSIGNABLE_CATEGORIES = STACK_ORDER.filter((c) => c !== "Non classé");

// Applies localStorage creditor→category mappings to the current month's breakdown,
// moving amounts from "Non classé" into the mapped categories.
function applyCreditorMappings(
  months: MonthCashflow[],
  creditors: Creditor[],
  userMappings: Record<string, string>,
  currentMonthStr: string,
): MonthCashflow[] {
  return months.map((m) => {
    if (m.month !== currentMonthStr) return m;
    const breakdown = m.categoryBreakdown.map((c) => ({ ...c }));
    const ncIdx = breakdown.findIndex((c) => c.label === "Non classé" && c.direction === "out");
    if (ncIdx === -1) return m;

    for (const creditor of creditors) {
      const cat = userMappings[creditor.name] ?? creditor.inferredCategory;
      if (!cat || creditor.uncategorizedAmount <= 0.01) continue;
      const transfer = Math.min(creditor.uncategorizedAmount, breakdown[ncIdx].amount);
      if (transfer < 0.01) continue;
      breakdown[ncIdx].amount -= transfer;
      const catIdx = breakdown.findIndex((c) => c.label === cat && c.direction === "out");
      if (catIdx !== -1) {
        breakdown[catIdx].amount += transfer;
      } else {
        breakdown.push({ label: cat, amount: transfer, direction: "out" });
      }
    }

    return {
      ...m,
      categoryBreakdown: breakdown
        .filter((c) => c.amount > 0.01)
        .sort((a, b) => {
          if (a.label === "Non classé") return 1;
          if (b.label === "Non classé") return -1;
          return b.amount - a.amount;
        }),
    };
  });
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
        const tx = Math.max(2, Math.min(W - 128, bx - 64));
        const ty = PT + 2;
        const netCol = m.net >= 0 ? "#86efac" : "#fca5a5";
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={tx} y={ty} width={126} height={62} fill="#0d1117" rx={4} stroke="#30363d" strokeWidth={0.5} opacity={0.97} />
            <text x={tx + 6} y={ty + 14} fontSize={11} fill="#e2e8f0" fontWeight="600">{fmtMonthShort(m.month)}</text>
            <text x={tx + 6} y={ty + 29} fontSize={10} fill="#86efac">▲ {fmtEur(m.inflows, true)}</text>
            <text x={tx + 6} y={ty + 43} fontSize={10} fill="#fca5a5">▼ {fmtEur(m.outflows, true)}</text>
            <text x={tx + 6} y={ty + 57} fontSize={10} fill={netCol}>= {fmtEur(m.net, true)}</text>
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
          <circle cx={xPos(i)} cy={yPos(d.ca)} r={hov === i ? 5 : 3} fill="#002FA7" opacity={hov === i ? 1 : 0.65} />
          {d.seuil && <circle cx={xPos(i)} cy={yPos(d.seuil)} r={hov === i ? 4.5 : 2.5} fill="#dc2626" opacity={hov === i ? 1 : 0.65} />}
          {(data.length <= 6 || i % 2 === 0) && (
            <text x={xPos(i)} y={H - 3} textAnchor="middle" fontSize={6.5} fill="var(--fg-tertiary)">{fmtMonthShort(d.month).slice(0, 6)}</text>
          )}
        </g>
      ))}
      {/* Hover tooltip */}
      {hov !== null && (() => {
        const d = data[hov];
        const tx = Math.max(2, Math.min(W - 128, xPos(hov) - 64));
        const ty = PT + 2;
        const above = d.seuil !== null && d.ca >= d.seuil;
        const h = d.seuil ? 68 : 46;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={tx} y={ty} width={126} height={h} fill="#0d1117" rx={4} stroke="#30363d" strokeWidth={0.5} opacity={0.97} />
            <text x={tx + 6} y={ty + 14} fontSize={11} fill="#e2e8f0" fontWeight="600">{fmtMonthShort(d.month)}</text>
            <text x={tx + 6} y={ty + 29} fontSize={10} fill="#93c5fd">CA : {fmtEur(d.ca, true)}</text>
            {d.seuil && <>
              <text x={tx + 6} y={ty + 44} fontSize={10} fill="#fca5a5">SR : {fmtEur(d.seuil, true)}</text>
              <text x={tx + 6} y={ty + 59} fontSize={9} fill={above ? "#86efac" : "#fca5a5"}>{above ? "✓ au-dessus" : "⚠ sous SR"}</text>
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
        <circle key={i} cx={xC(i)} cy={yPos(m.inflows)} r={hov === i ? 5 : 3} fill="#002FA7" opacity={hov === i ? 1 : 0.65} />
      ))}

      {/* Hover tooltip */}
      {hov !== null && (() => {
        const m = months[hov];
        const outCats = m.categoryBreakdown.filter((c) => c.direction === "out" && c.amount > 0.01).sort((a, b) => b.amount - a.amount);
        const lh = 14;
        const th = (outCats.length + 3) * lh + 14;
        const tw = 155;
        const tx = Math.max(2, Math.min(W - tw - 2, xC(hov) - tw / 2));
        const ty = Math.max(PT, Math.min(PT + cH - th, yPos(m.inflows) - th - 8));
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={tx} y={ty} width={tw} height={th} fill="#0d1117" rx={4} stroke="#30363d" strokeWidth={0.5} opacity={0.97} />
            <text x={tx + 6} y={ty + 14} fontSize={11} fill="#e2e8f0" fontWeight="600">{fmtMonthShort(m.month)}</text>
            <text x={tx + 6} y={ty + 14 + lh} fontSize={10} fill="#93c5fd">Encaiss. {fmtEur(m.inflows, true)}</text>
            {outCats.map((c, i) => (
              <g key={i}>
                <rect x={tx + 6} y={ty + 10 + (i + 2) * lh} width={7} height={7} fill={catColor(c.label)} rx={1} />
                <text x={tx + 16} y={ty + 17 + (i + 2) * lh} fontSize={9} fill="#cbd5e1">{c.label} {fmtEur(c.amount, true)}</text>
              </g>
            ))}
            <line x1={tx + 6} y1={ty + 11 + (outCats.length + 2) * lh} x2={tx + tw - 6} y2={ty + 11 + (outCats.length + 2) * lh} stroke="#30363d" strokeWidth={0.5} />
            <text x={tx + 6} y={ty + 10 + (outCats.length + 3) * lh} fontSize={10} fill="#fca5a5">Total dép. {fmtEur(m.outflows, true)}</text>
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

function CurrentMonthBlock({ data }: { data: CurrentMonthForecast }) {
  if (data.tauxMargeTheorique === null || data.caRequis === null || data.caRequis === 0) {
    return (
      <div className="treso-block">
        <div className="lm-label" style={{ marginBottom: 6 }}>
          Mois en cours — {fmtMonthShort(data.month)}
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-muted)" }}>
          Données insuffisantes (12 mois complets requis)
        </p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((data.caToDate / data.caRequis) * 100));
  const dayPct = Math.round((data.jours.elapsed / data.jours.total) * 100);
  const isAhead = pct >= dayPct;
  const barColor = pct >= 100 ? "#10b981" : isAhead ? "#3b82f6" : "#f59e0b";

  return (
    <div className="treso-block">
      <div className="lm-label" style={{ marginBottom: 10 }}>
        Mois en cours — {fmtMonthShort(data.month)}
        <span style={{ fontSize: 10, color: "var(--fg-muted)", marginLeft: 6, fontWeight: 400 }}>
          j{data.jours.elapsed}/{data.jours.total}
        </span>
      </div>

      {[
        { label: "Taux de marge théorique", value: `${Math.round((data.tauxMargeTheorique ?? 0) * 100)}%`, color: "#f59e0b" },
        { label: "CA réalisé à ce jour", value: fmtEur(data.caToDate), color: "var(--fg-primary)" },
        { label: "Marge dégagée", value: fmtEur(data.margeToDate ?? 0), color: "#10b981" },
        { label: "Charges fixes estimées", value: fmtEur(data.chargesFixesMoyennes), color: "#ef4444" },
      ].map(({ label, value, color }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>CA requis ce mois</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-primary)", fontVariantNumeric: "tabular-nums" }}>
            {fmtEur(data.caRequis)}
          </span>
        </div>

        <div style={{ position: "relative", height: 10, background: "var(--bg-row-alt)", borderRadius: 5, overflow: "hidden" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: barColor,
            borderRadius: 5,
          }} />
          <div style={{
            position: "absolute", top: 0, bottom: 0, width: 2,
            background: "rgba(255,255,255,0.35)",
            left: `${dayPct}%`,
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "var(--fg-muted)" }}>{pct}% réalisé</span>
          {(data.caManquant ?? 0) > 0
            ? <span style={{ fontSize: 10, color: "#f59e0b" }}>encore {fmtEur(data.caManquant ?? 0)}</span>
            : <span style={{ fontSize: 10, color: "#10b981" }}>Objectif atteint ✓</span>
          }
        </div>
      </div>
    </div>
  );
}

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

function CreditorsList({
  storeId,
  onLoaded,
  userMappings,
  onMappingChange,
}: {
  storeId: string;
  onLoaded: (creditors: Creditor[]) => void;
  userMappings: Record<string, string>;
  onMappingChange: (name: string, cat: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    creditors: Creditor[];
    totalUncategorized: number;
    error?: string;
  } | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    if (!open || data !== null || loading) return;
    setLoading(true);
    fetch(`/api/treso/creditors?store=${storeId}`)
      .then((r) => r.json())
      .then((d) => {
        const result = d as { creditors: Creditor[]; totalUncategorized: number; error?: string };
        setData(result);
        onLoadedRef.current(result.creditors);
      })
      .catch((e) => setData({ creditors: [], totalUncategorized: 0, error: (e as Error).message }))
      .finally(() => setLoading(false));
  }, [open, storeId, data, loading]);

  const uncatCreditors = data?.creditors.filter((c) => c.uncategorizedAmount > 0) ?? [];
  const catCreditors = data?.creditors.filter((c) => c.uncategorizedAmount <= 0 && c.totalAmount > 0) ?? [];

  return (
    <div className="treso-block" style={{ borderBottom: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span className="lm-label" style={{ margin: 0, color: uncatCreditors.length > 0 ? "#f59e0b" : undefined }}>
          Créanciers ce mois
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
          {data && uncatCreditors.length > 0
            ? `${uncatCreditors.length} non classé${uncatCreditors.length > 1 ? "s" : ""}`
            : data && !data.error
            ? "✓"
            : ""}{" "}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && (
            <p style={{ fontSize: 11, color: "var(--fg-muted)" }}>Chargement...</p>
          )}

          {data?.error && data.creditors.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--fg-muted)" }}>
              Transactions non disponibles pour ce commerce
            </p>
          )}

          {data && data.creditors.length === 0 && !data.error && (
            <p style={{ fontSize: 11, color: "var(--fg-muted)" }}>Aucune transaction ce mois.</p>
          )}

          {/* Uncategorized creditors */}
          {uncatCreditors.map((cr) => {
            const userCat = userMappings[cr.name];
            const effectiveCat = userCat ?? cr.inferredCategory ?? "";
            const isAuto = !userCat && !!cr.inferredCategory;
            return (
              <div key={cr.name} style={{ marginBottom: 7, paddingBottom: 7, borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span
                    style={{ fontSize: 11, color: "var(--fg-primary)", maxWidth: "62%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={cr.name}
                  >
                    {cr.name}
                  </span>
                  <span style={{ fontSize: 11, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                    {fmtEur(cr.uncategorizedAmount, true)}
                    {cr.categorizedAmount > 0 && (
                      <span style={{ color: "var(--fg-muted)", marginLeft: 3 }}>
                        (+{fmtEur(cr.categorizedAmount, true)} ✓)
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <select
                    value={effectiveCat}
                    onChange={(e) => onMappingChange(cr.name, e.target.value)}
                    style={{
                      flex: 1, fontSize: 11,
                      background: "var(--bg-row-alt)",
                      color: effectiveCat ? catColor(effectiveCat) : "var(--fg-muted)",
                      border: `1px solid ${effectiveCat ? catColor(effectiveCat) : "var(--border)"}`,
                      borderRadius: 4, padding: "2px 4px",
                    }}
                  >
                    <option value="">— Non classé —</option>
                    {ASSIGNABLE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {isAuto && (
                    <span style={{ fontSize: 9, color: "#10b981", whiteSpace: "nowrap" }}>★ auto</span>
                  )}
                  {userCat && (
                    <span style={{ fontSize: 9, color: "#3b82f6", whiteSpace: "nowrap" }}>✓</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Classified creditors (collapsed summary) */}
          {catCreditors.length > 0 && (
            <p style={{ fontSize: 10, color: "var(--fg-muted)", marginTop: 4 }}>
              {catCreditors.length} créancier{catCreditors.length > 1 ? "s" : ""} déjà classifié{catCreditors.length > 1 ? "s" : ""} ✓
            </p>
          )}
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
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [userMappings, setUserMappings] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("lm_cred_cats") ?? "{}") as Record<string, string>; }
    catch { return {}; }
  });

  const handleLoaded = useCallback((loaded: Creditor[]) => setCreditors(loaded), []);

  const handleMappingChange = useCallback((name: string, cat: string) => {
    setUserMappings((prev) => {
      const next = { ...prev };
      if (cat) next[name] = cat; else delete next[name];
      try { localStorage.setItem("lm_cred_cats", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Apply creditor category mappings to current month display only
  const adjustedMonths = useMemo(() => {
    if (!store.currentMonthForecast || creditors.length === 0) return store.cashflowMonths;
    return applyCreditorMappings(
      store.cashflowMonths, creditors, userMappings, store.currentMonthForecast.month,
    );
  }, [store.cashflowMonths, creditors, userMappings, store.currentMonthForecast]);

  return (
    <div className="treso-col">
      <div className="treso-col-head">
        <span className="treso-col-name">{store.name}</span>
      </div>
      {store.currentMonthForecast && <CurrentMonthBlock data={store.currentMonthForecast} />}
      <BalanceKPI store={store} />
      <CashflowBlock months={adjustedMonths} />
      <RecurringChargesBlock data={store.recurringCharges} />
      <CashSRBlock months={adjustedMonths} />
      <BreakEvenBlock data={store.breakEven} />
      <CreditorsList
        storeId={store.id}
        onLoaded={handleLoaded}
        userMappings={userMappings}
        onMappingChange={handleMappingChange}
      />
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
