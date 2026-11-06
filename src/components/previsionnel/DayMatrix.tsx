"use client";

import { useMemo, useState } from "react";
import type { Plan, PlanDay, RuleKind } from "@/lib/previsionnel/types";
import { KIND_COLORS } from "./charts";

// Matrice jours × postes, alignée sous la courbe de solde : même colonne = même jour.

const fmtCell = (n: number) => {
  if (!n) return "";
  const a = Math.abs(n);
  const s = a >= 10000 ? `${(a / 1000).toFixed(0)}k` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : `${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};
const fmtEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

type Row = { label: string; values: number[]; kind?: RuleKind | "in" | "ca" | "solde" | "net"; sub?: boolean; status?: ("actual" | "forecast" | "")[] };
type Group = { title: string; color: string; rows: Row[]; total: number[] };

function itemRows(days: PlanDay[], kind: RuleKind, fallbackLabel: string, max: number): Row[] {
  const byLabel = new Map<string, number[]>();
  days.forEach((d, i) => {
    for (const it of d.sorties.items) {
      if (it.kind !== kind) continue;
      const arr = byLabel.get(it.label) ?? Array(days.length).fill(0);
      arr[i] += it.amount;
      byLabel.set(it.label, arr);
    }
  });
  const sorted = [...byLabel.entries()].sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0));
  const rows: Row[] = sorted.slice(0, max).map(([label, values]) => ({ label, values, kind, sub: true }));
  // Reste : total du poste moins les lignes détaillées.
  const listed = rows.reduce((acc, r) => acc.map((v, i) => v + r.values[i]), Array(days.length).fill(0) as number[]);
  const totalKind = days.map((d) => (kind === "fixe" ? d.sorties.fixe : kind === "hors_exploitation" ? d.sorties.horsExploitation : kind === "variable" ? d.sorties.variable : 0));
  const rest = totalKind.map((v, i) => Math.max(0, v - listed[i]));
  if (rest.some((v) => v > 0.5)) rows.push({ label: fallbackLabel, values: rest, kind, sub: true });
  return rows;
}

export function DayMatrix({ plan }: { plan: Plan }) {
  const days = plan.days;
  const n = days.length;
  const [open, setOpen] = useState<Record<string, boolean>>({ fixes: true, variables: true, hors: true, enc: false });

  const groups = useMemo<Group[]>(() => {
    const sum = (rows: Row[]) => rows.reduce((acc, r) => acc.map((v, i) => v + r.values[i]), Array(n).fill(0) as number[]);
    const enc: Row[] = [
      { label: "CA caisse", values: days.map((d) => d.ca.value), kind: "ca", sub: true, status: days.map((d) => (d.ca.source === "actual" ? "actual" : "forecast")) },
      { label: "Encaissé en banque", values: days.map((d) => d.encaissements.bank), kind: "in", sub: true },
    ];
    const fixes = itemRows(days, "fixe", "Autres charges fixes", 14);
    const variablesAll: Row[] = [
      { label: "Matière première (estimation)", values: days.map((d) => d.sorties.matiere), kind: "matiere", sub: true },
      { label: "Variables liées au CA", values: days.map((d) => d.sorties.variable), kind: "variable", sub: true },
      { label: "Divers", values: days.map((d) => d.sorties.divers), kind: "variable", sub: true },
    ];
    const variables = variablesAll.filter((r) => r.values.some((v) => v > 0.5));
    const hors = itemRows(days, "hors_exploitation", "Autres hors exploitation", 10);
    return [
      { title: "Encaissements", color: KIND_COLORS.encaissements, rows: enc, total: days.map((d) => d.encaissements.bank) },
      { title: "Charges fixes", color: KIND_COLORS.fixe, rows: fixes, total: days.map((d) => d.sorties.fixe) },
      { title: "Charges variables", color: KIND_COLORS.matiere, rows: variables, total: sum(variables) },
      { title: "Charges exceptionnelles et hors exploitation", color: KIND_COLORS.horsExploitation, rows: hors, total: days.map((d) => d.sorties.horsExploitation) },
    ];
  }, [days, n]);

  const keys = ["enc", "fixes", "variables", "hors"];
  const colStyle = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  const Cells = ({ values, cls, title }: { values: number[]; cls?: string; title: string }) => (
    <div className="prev-mx-cells" style={colStyle}>
      {values.map((v, i) => (
        <div
          key={days[i].date}
          className={`prev-mx-cell${days[i].isToday ? " today" : ""}${days[i].isPast ? " past" : ""}${cls ? ` ${cls}` : ""}${v ? "" : " empty"}`}
          title={v ? `${title} · ${days[i].date.slice(8)}/${days[i].date.slice(5, 7)} : ${fmtEur(v)}` : undefined}
        >
          {fmtCell(v)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="prev-mx">
      <div className="prev-mx-row prev-mx-head">
        <div className="prev-mx-label">Jour</div>
        <div className="prev-mx-cells" style={colStyle}>
          {days.map((d) => (
            <div key={d.date} className={`prev-mx-cell prev-mx-day${d.isToday ? " today" : ""}${d.isPast ? " past" : ""}${d.weekday === 0 || d.weekday === 6 ? " we" : ""}`}>
              <span>{["D", "L", "M", "M", "J", "V", "S"][d.weekday]}</span>
              {d.date.slice(8)}
            </div>
          ))}
        </div>
      </div>

      {groups.map((g, gi) => {
        const k = keys[gi];
        const isOpen = open[k];
        return (
          <div key={g.title} className="prev-mx-group">
            <div className="prev-mx-row prev-mx-grouphead" onClick={() => setOpen({ ...open, [k]: !isOpen })}>
              <div className="prev-mx-label">
                <i style={{ background: g.color }} />
                <span className="prev-mx-caret">{isOpen ? "▾" : "▸"}</span>
                {g.title}
              </div>
              <Cells values={g.total} cls="total" title={g.title} />
            </div>
            {isOpen && g.rows.map((r) => (
              <div key={r.label} className="prev-mx-row">
                <div className="prev-mx-label sub" title={r.label}>{r.label}</div>
                <Cells values={r.values} cls={r.kind === "in" || r.kind === "ca" ? "in" : "out"} title={r.label} />
              </div>
            ))}
            {isOpen && g.rows.length === 0 && (
              <div className="prev-mx-row"><div className="prev-mx-label sub prev-muted">aucune échéance</div><div /></div>
            )}
          </div>
        );
      })}

      <div className="prev-mx-row prev-mx-net">
        <div className="prev-mx-label">Net du jour</div>
        <div className="prev-mx-cells" style={colStyle}>
          {days.map((d) => (
            <div key={d.date} className={`prev-mx-cell${d.isToday ? " today" : ""}${d.netTotal >= 0 ? " in" : " neg"}`} title={`Net ${d.date.slice(8)} : ${fmtEur(d.netTotal)}`}>{fmtCell(d.netTotal)}</div>
          ))}
        </div>
      </div>
      <div className="prev-mx-row prev-mx-solde">
        <div className="prev-mx-label">Solde</div>
        <div className="prev-mx-cells" style={colStyle}>
          {days.map((d) => (
            <div key={d.date} className={`prev-mx-cell${d.isToday ? " today" : ""}${d.solde < plan.kpis.alertThreshold ? " neg" : ""}`} title={`Solde ${d.date.slice(8)} : ${fmtEur(d.solde)}`}>{fmtCell(d.solde)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
