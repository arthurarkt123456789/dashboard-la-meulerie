"use client";

import { useState } from "react";
import type { Baseline, Plan, PlanDay } from "@/lib/previsionnel/types";

const fmtEur0 = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtK = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return `${n < 0 ? "-" : ""}${(a / 1000).toFixed(a >= 10000 ? 0 : 1)} k€`;
  return `${Math.round(n)} €`;
};
const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtEur0(Math.abs(n))}`;
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" });
};

export const KIND_COLORS = {
  encaissements: "#4D7CFF",
  matiere: "#F5A524",
  fixe: "#A78BFA",
  variable: "#22D3EE",
  divers: "#8B93A7",
  horsExploitation: "#F472B6",
};
const PROJ = "#F5A524"; // projection figée

const C = {
  past: "var(--prev-past)",
  accent: "var(--prev-accent)",
  band: "var(--prev-band)",
  danger: "var(--prev-danger)",
  grid: "var(--prev-grid)",
  muted: "var(--prev-muted)",
  card: "var(--prev-card)",
};

// ── Courbe de solde ────────────────────────────────────────────────────────────

export function SoldeChart({ plan, baseline = null, aligned = false }: { plan: Plan; baseline?: Baseline | null; aligned?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = aligned ? 260 : 280;
  const days = plan.days;
  const n = days.length;
  // Aligné sur la matrice : chaque jour au centre de sa colonne, pas d'axe à gauche.
  const padL = aligned ? W / n / 2 : 56;
  const padR = aligned ? W / n / 2 : 16;
  const padT = 18;
  const padB = aligned ? 10 : 34;
  // Projection figée, alignée sur les jours du plan (null si le jour n'y figure pas).
  const projByDate = new Map((baseline?.days ?? []).map((b) => [b.date, b.solde]));
  const proj = days.map((d) => projByDate.get(d.date) ?? null);
  const hasProj = proj.some((v) => v !== null);
  const values = [
    ...days.flatMap((d) => [d.solde, d.soldeOptimiste, d.soldePessimiste]),
    ...proj.filter((v): v is number => v !== null),
  ];
  const thr = plan.kpis.alertThreshold;
  const minV = Math.min(0, thr, ...values);
  const maxV = Math.max(thr, ...values);
  const span = maxV - minV || 1;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - minV) / span) * (H - padT - padB);
  const todayIdx = days.findIndex((d) => d.isToday);
  const asOfIdx = days.findIndex((d) => d.date === plan.opening.asOf);
  const splitIdx = asOfIdx >= 0 ? asOfIdx : todayIdx >= 0 ? todayIdx : 0;

  const path = (get: (d: PlanDay) => number, from = 0, to = n - 1) =>
    days
      .slice(from, to + 1)
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(from + i).toFixed(1)},${y(get(d)).toFixed(1)}`)
      .join(" ");

  const band =
    days
      .slice(splitIdx)
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(splitIdx + i).toFixed(1)},${y(d.soldeOptimiste).toFixed(1)}`)
      .join(" ") +
    " " +
    days
      .slice(splitIdx)
      .reverse()
      .map((d, i, arr) => `L${x(splitIdx + arr.length - 1 - i).toFixed(1)},${y(d.soldePessimiste).toFixed(1)}`)
      .join(" ") +
    " Z";

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => minV + (span * i) / ticks);
  const pb = plan.kpis.pointBas;
  const pbIdx = days.findIndex((d) => d.date === pb.date);
  const hv = hover !== null ? days[hover] : null;

  return (
    <div className="prev-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="prev-chart" onMouseLeave={() => setHover(null)}>
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={aligned ? 0 : padL} x2={aligned ? W : W - padR} y1={y(v)} y2={y(v)} stroke={C.grid} strokeDasharray="2 3" />
            {aligned
              ? <text x={4} y={y(v) - 3} textAnchor="start" className="prev-axis">{fmtK(v)}</text>
              : <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="prev-axis">{fmtK(v)}</text>}
          </g>
        ))}
        {/* Zone réalisée */}
        <defs>
          <linearGradient id="prev-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4D7CFF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4D7CFF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect x={aligned ? 0 : padL} y={padT} width={Math.max(0, x(splitIdx) - (aligned ? 0 : padL) + (aligned ? W / n / 2 : 0))} height={H - padT - padB} fill="rgba(255,255,255,0.025)" />
        {/* Aire sous la courbe */}
        <path d={`${path((d) => d.solde)} L${x(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`} fill="url(#prev-area)" />
        {/* Bande de scénarios */}
        <path d={band} fill={C.band} />
        {/* Seuil d'alerte */}
        <line x1={padL} x2={W - padR} y1={y(thr)} y2={y(thr)} stroke={C.danger} strokeDasharray="5 4" strokeWidth={1.2} />
        <text x={W - padR} y={y(thr) - 5} textAnchor="end" className="prev-axis" fill={C.danger}>seuil {fmtK(thr)}</text>
        {/* Zéro */}
        {minV < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={C.muted} strokeWidth={1} />}
        {/* Courbes */}
        <path d={path((d) => d.solde, 0, splitIdx)} fill="none" stroke={C.past} strokeWidth={2} />
        <path d={path((d) => d.solde, splitIdx, n - 1)} fill="none" stroke={C.accent} strokeWidth={2.4} strokeLinejoin="round" />
        <path d={path((d) => d.soldeOptimiste, splitIdx, n - 1)} fill="none" stroke={C.accent} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        <path d={path((d) => d.soldePessimiste, splitIdx, n - 1)} fill="none" stroke={C.accent} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        {/* Projection figée */}
        {hasProj && (
          <path
            d={proj
              .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
              .filter((pt): pt is string => pt !== null)
              .map((pt, i) => `${i === 0 ? "M" : "L"}${pt}`)
              .join(" ")}
            fill="none"
            stroke={PROJ}
            strokeWidth={1.8}
            strokeDasharray="6 4"
          />
        )}
        {/* Aujourd'hui */}
        {todayIdx >= 0 && (
          <g>
            <line x1={x(todayIdx)} x2={x(todayIdx)} y1={padT} y2={H - padB} stroke={C.muted} strokeWidth={1} strokeDasharray="2 2" />
            <text x={x(todayIdx) + 4} y={padT + 10} className="prev-axis">aujourd&apos;hui</text>
          </g>
        )}
        {/* Point bas */}
        {pbIdx >= 0 && (
          <g>
            <circle cx={x(pbIdx)} cy={y(pb.solde)} r={5} fill={pb.solde < thr ? C.danger : C.accent} stroke={C.card} strokeWidth={2} />
            <text x={x(pbIdx)} y={y(pb.solde) + 18} textAnchor="middle" className="prev-axis" fill={pb.solde < thr ? C.danger : "var(--prev-fg)"}>
              point bas {fmtK(pb.solde)}
            </text>
          </g>
        )}
        {/* Axe X */}
        {!aligned && days.map((d, i) =>
          i % 3 === 0 || i === n - 1 ? (
            <text key={d.date} x={x(i)} y={H - padB + 16} textAnchor="middle" className="prev-axis">{d.date.slice(8)}</text>
          ) : null,
        )}
        {/* Hover */}
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={x(i) - (W - padL - padR) / n / 2}
            y={padT}
            width={(W - padL - padR) / n}
            height={H - padT - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hv && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={C.accent} strokeWidth={1} opacity={0.5} />
            <circle cx={x(hover)} cy={y(hv.solde)} r={4} fill={C.accent} />
          </g>
        )}
      </svg>
      {hv && (
        <div className="prev-tooltip">
          <strong>{dayLabel(hv.date)}</strong> · solde {fmtEur0(hv.solde)}
          {hv.encaissements.source === "forecast" && (
            <span className="prev-muted"> ({fmtEur0(hv.soldePessimiste)} à {fmtEur0(hv.soldeOptimiste)})</span>
          )}
          {hover !== null && proj[hover] !== null && (
            <span style={{ color: PROJ }}> · projeté {fmtEur0(proj[hover] as number)} (écart {fmtSigned(hv.solde - (proj[hover] as number))})</span>
          )}
          <span className="prev-muted"> · entrées {fmtEur0(hv.encaissements.bank)} · sorties {fmtEur0(hv.sorties.total)}</span>
        </div>
      )}
      <div className="prev-legend">
        <span><i style={{ background: "var(--prev-past)" }} />réel</span>
        <span><i style={{ background: "var(--prev-accent)" }} />prévision actuelle</span>
        {hasProj && <span><i style={{ background: PROJ }} />projeté (figé)</span>}
        <span><i style={{ background: "var(--prev-band)" }} />scénarios ±{Math.round(plan.hypotheses.settings.scenarioSpread * 100)} %</span>
        <span><i style={{ background: "var(--prev-danger)" }} />seuil d&apos;alerte</span>
      </div>
    </div>
  );
}

// ── Barres journalières ────────────────────────────────────────────────────────

export function FluxChart({ plan }: { plan: Plan }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = 240;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 30;
  const days = plan.days;
  const n = days.length;
  const maxIn = Math.max(1, ...days.map((d) => d.encaissements.bank));
  const maxOut = Math.max(1, ...days.map((d) => d.sorties.total));
  const top = Math.max(maxIn, maxOut);
  const zeroY = padT + (top / (2 * top)) * (H - padT - padB);
  const scale = (H - padT - padB) / (2 * top);
  const bw = (W - padL - padR) / n;
  const x = (i: number) => padL + i * bw;
  const hv = hover !== null ? days[hover] : null;

  return (
    <div className="prev-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="prev-chart" onMouseLeave={() => setHover(null)}>
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke={C.muted} />
        <text x={padL - 8} y={padT + 10} textAnchor="end" className="prev-axis">+{fmtK(top)}</text>
        <text x={padL - 8} y={H - padB} textAnchor="end" className="prev-axis">-{fmtK(top)}</text>
        {days.map((d, i) => {
          const inH = d.encaissements.bank * scale;
          const segs: [number, string][] = [
            [d.sorties.matiere, KIND_COLORS.matiere],
            [d.sorties.fixe, KIND_COLORS.fixe],
            [d.sorties.variable, KIND_COLORS.variable],
            [d.sorties.divers, KIND_COLORS.divers],
            [d.sorties.horsExploitation, KIND_COLORS.horsExploitation],
          ];
          let cursor = zeroY;
          const forecast = d.encaissements.source === "forecast";
          return (
            <g key={d.date} opacity={hover === null || hover === i ? 1 : 0.55} onMouseEnter={() => setHover(i)}>
              <rect x={x(i) + bw * 0.15} y={zeroY - inH} width={bw * 0.7} height={inH} rx={2} fill={KIND_COLORS.encaissements} opacity={forecast ? 0.55 : 1} />
              {segs.map(([v, c], k) => {
                const h = v * scale;
                const r = <rect key={k} x={x(i) + bw * 0.15} y={cursor} width={bw * 0.7} height={h} fill={c} opacity={forecast ? 0.6 : 1} />;
                cursor += h;
                return r;
              })}
              {d.isToday && <line x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} stroke={C.muted} strokeDasharray="2 2" />}
              {(i % 3 === 0 || i === n - 1) && (
                <text x={x(i) + bw / 2} y={H - padB + 14} textAnchor="middle" className="prev-axis">{d.date.slice(8)}</text>
              )}
              <rect x={x(i)} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hv && (
        <div className="prev-tooltip">
          <strong>{dayLabel(hv.date)}</strong> · entrées {fmtEur0(hv.encaissements.bank)} · matière {fmtEur0(hv.sorties.matiere)} · fixes {fmtEur0(hv.sorties.fixe)}
          {hv.sorties.horsExploitation > 0 && <> · hors expl. {fmtEur0(hv.sorties.horsExploitation)}</>}
          {hv.sorties.variable + hv.sorties.divers > 0 && <> · autres {fmtEur0(hv.sorties.variable + hv.sorties.divers)}</>}
        </div>
      )}
      <div className="prev-legend">
        <span><i style={{ background: KIND_COLORS.encaissements }} />encaissements banque</span>
        <span><i style={{ background: KIND_COLORS.matiere }} />matière</span>
        <span><i style={{ background: KIND_COLORS.fixe }} />charges fixes</span>
        <span><i style={{ background: KIND_COLORS.variable }} />variables</span>
        <span><i style={{ background: KIND_COLORS.divers }} />divers</span>
        <span><i style={{ background: KIND_COLORS.horsExploitation }} />hors exploitation</span>
      </div>
    </div>
  );
}

// ── Waterfall ──────────────────────────────────────────────────────────────────

export function Waterfall({ plan }: { plan: Plan }) {
  const w = plan.waterfall;
  const steps: { label: string; value: number; color: string; total?: boolean }[] = [
    { label: "Solde début", value: w.soldeInitial, color: "var(--prev-past)", total: true },
    { label: "Encaissements", value: w.encaissements, color: KIND_COLORS.encaissements },
    { label: "Matière", value: -w.matiere, color: KIND_COLORS.matiere },
    { label: "Charges fixes", value: -w.fixe, color: KIND_COLORS.fixe },
    { label: "Variables", value: -w.variable, color: KIND_COLORS.variable },
    { label: "Divers", value: -w.divers, color: KIND_COLORS.divers },
    { label: "Hors exploit.", value: -w.horsExploitation, color: KIND_COLORS.horsExploitation },
    { label: "Solde fin", value: w.soldeFinal, color: w.soldeFinal < plan.kpis.alertThreshold ? "var(--prev-danger)" : "var(--prev-accent)", total: true },
  ];
  const W = 900;
  const H = 230;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  let running = 0;
  const levels: { from: number; to: number }[] = steps.map((s) => {
    if (s.total) {
      running = s.value;
      return { from: 0, to: s.value };
    }
    const from = running;
    running += s.value;
    return { from, to: running };
  });
  const all = levels.flatMap((l) => [l.from, l.to]);
  const minV = Math.min(0, ...all);
  const maxV = Math.max(0, ...all);
  const span = maxV - minV || 1;
  const y = (v: number) => padT + (1 - (v - minV) / span) * (H - padT - padB);
  const bw = (W - padL - padR) / steps.length;

  return (
    <div className="prev-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="prev-chart">
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={C.muted} />
        {steps.map((s, i) => {
          const l = levels[i];
          const top = Math.max(l.from, l.to);
          const bottom = Math.min(l.from, l.to);
          const h = Math.max(1, y(bottom) - y(top));
          return (
            <g key={s.label}>
              <rect x={padL + i * bw + bw * 0.2} y={y(top)} width={bw * 0.6} height={h} rx={3} fill={s.color} opacity={s.total ? 1 : 0.85} />
              {i < steps.length - 1 && (
                <line x1={padL + i * bw + bw * 0.8} x2={padL + (i + 1) * bw + bw * 0.2} y1={y(l.to)} y2={y(l.to)} stroke={C.muted} strokeDasharray="2 2" />
              )}
              <text x={padL + i * bw + bw / 2} y={y(top) - 5} textAnchor="middle" className="prev-axis" fill="var(--prev-fg)">
                {s.total ? fmtK(s.value) : `${s.value >= 0 ? "+" : ""}${fmtK(s.value)}`}
              </text>
              <text x={padL + i * bw + bw / 2} y={H - padB + 16} textAnchor="middle" className="prev-axis">{s.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Projeté vs réel ────────────────────────────────────────────────────────────

/**
 * Compare la projection figée au réel, sur les jours déjà réalisés, et
 * superpose les trois courbes de CA cumulé : projeté, réel, prévision actuelle.
 */
export function ProjeteVsReel({ plan, baseline, onRefreeze, busy }: {
  plan: Plan;
  baseline: Baseline;
  onRefreeze: () => void;
  busy: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const days = plan.days;
  const n = days.length;
  const byDate = new Map(baseline.days.map((b) => [b.date, b]));

  // Jours réalisés : CA de caisse réel, et flux bancaires réels.
  const caRealIdx = days.reduce((last, d, i) => (d.ca.source === "actual" ? i : last), -1);
  const bankRealIdx = days.reduce((last, d, i) => (d.encaissements.source === "actual" ? i : last), -1);

  let cumReal = 0;
  let cumNow = 0;
  let cumProj = 0;
  const rows = days.map((d, i) => {
    const b = byDate.get(d.date);
    cumNow += d.ca.value;
    if (i <= caRealIdx) cumReal += d.ca.value;
    if (b) cumProj += b.ca;
    return { date: d.date, real: i <= caRealIdx ? cumReal : null, now: cumNow, proj: b ? cumProj : null };
  });

  const sumTo = (idx: number, real: (d: PlanDay) => number, projected: (date: string) => number | undefined) => {
    let r = 0;
    let p = 0;
    for (let i = 0; i <= idx; i++) {
      const pv = projected(days[i].date);
      if (pv === undefined) continue;
      r += real(days[i]);
      p += pv;
    }
    return { real: r, proj: p };
  };
  const ca = sumTo(caRealIdx, (d) => d.ca.value, (dt) => byDate.get(dt)?.ca);
  const enc = sumTo(bankRealIdx, (d) => d.encaissements.bank, (dt) => byDate.get(dt)?.bank);
  const sor = sumTo(bankRealIdx, (d) => d.sorties.total, (dt) => byDate.get(dt)?.sorties);
  const soldeDay = bankRealIdx >= 0 ? days[bankRealIdx] : null;
  const soldeProj = soldeDay ? byDate.get(soldeDay.date)?.solde : undefined;

  const W = 900;
  const H = 220;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const maxV = Math.max(1, ...rows.flatMap((r) => [r.now, r.proj ?? 0, r.real ?? 0]));
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);
  const line = (get: (r: (typeof rows)[number]) => number | null) =>
    rows
      .map((r, i) => {
        const v = get(r);
        return v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter((pt): pt is string => pt !== null)
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt}`)
      .join(" ");
  const hv = hover !== null ? rows[hover] : null;

  const frozen = new Date(baseline.frozenAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const lastReal = caRealIdx >= 0 ? dayLabel(days[caRealIdx].date) : null;

  const Stat = ({ label, real, proj, goodWhenHigher }: { label: string; real: number; proj: number; goodWhenHigher: boolean }) => {
    const diff = real - proj;
    const pct = proj !== 0 ? diff / Math.abs(proj) : null;
    const tone = Math.abs(diff) < 1 ? "" : (diff > 0) === goodWhenHigher ? " prev-pvr-good" : " prev-pvr-bad";
    return (
      <div className="prev-pvr-stat">
        <div className="lm-label">{label}</div>
        <div className="prev-pvr-real">{fmtEur0(real)}</div>
        <div className="prev-muted">projeté {fmtEur0(proj)}</div>
        <div className={`prev-pvr-diff${tone}`}>
          {fmtSigned(diff)}{pct !== null && ` (${pct > 0 ? "+" : pct < 0 ? "−" : ""}${(Math.abs(pct) * 100).toFixed(1).replace(".", ",")} %)`}
        </div>
      </div>
    );
  };

  return (
    <div className="prev-card">
      <div className="prev-pvr-head">
        <div>
          <div className="lm-label">Projeté vs réel</div>
          <div className="prev-muted">
            Projection figée le {frozen}{lastReal && <> · réel jusqu&apos;au {lastReal}</>}
          </div>
        </div>
        <button className="prev-btn prev-btn-sm" onClick={onRefreeze} disabled={busy} title="Remplace la projection figée par le plan actuel">
          Refiger le projeté
        </button>
      </div>

      {caRealIdx < 0 ? (
        <p className="prev-muted" style={{ marginTop: 10 }}>Aucun jour réalisé sur ce mois pour l&apos;instant.</p>
      ) : (
        <div className="prev-pvr-stats">
          <Stat label="CA caisse à date" real={ca.real} proj={ca.proj} goodWhenHigher />
          <Stat label="Encaissé en banque à date" real={enc.real} proj={enc.proj} goodWhenHigher />
          <Stat label="Sorties à date" real={sor.real} proj={sor.proj} goodWhenHigher={false} />
          {soldeDay && soldeProj !== undefined && (
            <Stat label={`Solde au ${dayLabel(soldeDay.date)}`} real={soldeDay.solde} proj={soldeProj} goodWhenHigher />
          )}
          <Stat label="Solde fin de mois (prévision)" real={plan.kpis.soldeFinMois} proj={baseline.soldeFinMois} goodWhenHigher />
        </div>
      )}

      <div className="prev-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="prev-chart" onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(maxV * t)} y2={y(maxV * t)} stroke={C.grid} strokeDasharray="2 3" />
              <text x={padL - 8} y={y(maxV * t) + 4} textAnchor="end" className="prev-axis">{fmtK(maxV * t)}</text>
            </g>
          ))}
          <path d={line((r) => r.now)} fill="none" stroke={C.accent} strokeWidth={1.4} opacity={0.7} />
          <path d={line((r) => r.proj)} fill="none" stroke={PROJ} strokeWidth={1.8} strokeDasharray="6 4" />
          <path d={line((r) => r.real)} fill="none" stroke={C.past} strokeWidth={2.6} strokeLinejoin="round" />
          {rows.map((r, i) =>
            i % 3 === 0 || i === n - 1 ? (
              <text key={r.date} x={x(i)} y={H - padB + 16} textAnchor="middle" className="prev-axis">{r.date.slice(8)}</text>
            ) : null,
          )}
          {rows.map((r, i) => (
            <rect
              key={r.date}
              x={x(i) - (W - padL - padR) / n / 2}
              y={padT}
              width={(W - padL - padR) / n}
              height={H - padT - padB}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
          {hv && hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={C.accent} strokeWidth={1} opacity={0.5} />
          )}
        </svg>
        {hv && (
          <div className="prev-tooltip">
            <strong>{dayLabel(hv.date)}</strong> · CA cumulé
            {hv.real !== null && <> · réel {fmtEur0(hv.real)}</>}
            {hv.proj !== null && <span style={{ color: PROJ }}> · projeté {fmtEur0(hv.proj)}</span>}
            {hv.real === null && <span className="prev-muted"> · prévision actuelle {fmtEur0(hv.now)}</span>}
            {hv.real !== null && hv.proj !== null && <span className="prev-muted"> · écart {fmtSigned(hv.real - hv.proj)}</span>}
          </div>
        )}
        <div className="prev-legend">
          <span><i style={{ background: "var(--prev-past)" }} />CA cumulé réel</span>
          <span><i style={{ background: PROJ }} />projeté (figé)</span>
          <span><i style={{ background: "var(--prev-accent)" }} />prévision actuelle</span>
        </div>
      </div>
    </div>
  );
}
