"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Store } from "@/lib/apitic/types";
import { RULE_KIND_LABELS, RULE_SOURCE_LABELS, type Briefing, type Decision, type EventDay, type Plan, type PlanDay, type RuleKind, type Settings } from "@/lib/previsionnel/types";
import { FluxChart, KIND_COLORS, SoldeChart, Waterfall } from "./charts";

// ── Types API ──────────────────────────────────────────────────────────────────

type DoutesResponse = Briefing & {
  settings: Settings;
  bankSynced: boolean;
  openingBalance: number | null;
  balanceAsOf: string | null;
  dailyDays: number;
  error?: string;
};

type PlanResponse = {
  plan: Plan & { bankAccounts: { name: string; balance: number }[]; narrative: string | null };
  briefing: Briefing;
  pendingDoubts: number;
  events: EventDay[];
  txCount: number;
  error?: string;
};

type Step = "chargement" | "doutes" | "analyse" | "plan";

// ── Format ─────────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number, digits = 0) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(digits)} %`;
const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short" }) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", opts);
const monthLabel = (ym: string) => {
  const s = new Date(`${ym}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const KINDS: RuleKind[] = ["matiere", "fixe", "hors_exploitation", "variable", "ignorer"];
const KIND_HELP: Record<RuleKind, string> = {
  matiere: "Fournisseur de produits revendus (fromage, pain, boissons…). Projeté au ratio du CA.",
  fixe: "Charge récurrente d'exploitation (loyer, salaires, URSSAF, énergie, abonnements). Projetée à sa date habituelle.",
  hors_exploitation: "Flux de structure : management fees, licence de marque, emprunt, compte courant. Hors trésorerie d'exploitation.",
  variable: "Coût qui suit le CA mais hors matière (commissions CB, livraison, TR).",
  ignorer: "Virement interne, erreur, dépense perso : exclu du prévisionnel.",
};

// ── Header ─────────────────────────────────────────────────────────────────────

function PrevHeader({ stores, storeId, month, onStore, onMonth }: {
  stores: Store[];
  storeId: string;
  month: string;
  onStore: (id: string) => void;
  onMonth: (m: string) => void;
}) {
  const items = [
    { id: "all", label: "Vue consolidée", href: "/all" },
    ...stores.map((s) => ({ id: s.id, label: s.name, href: `/${s.id}` })),
    { id: "tresorerie", label: "Trésorerie", href: "/tresorerie" },
    { id: "previsionnel", label: "Prévisionnel", href: "/tresorerie/previsionnel" },
  ];
  const months = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let k = -2; k <= 2; k++) {
      const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);
  return (
    <header className="lm-header">
      <div className="lm-header-top">
        <div className="lm-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-la-meulerie.png" alt="La Meulerie" style={{ height: 52, width: "auto", display: "block" }} />
        </div>
        <div className="lm-header-meta">
          <div className="lm-date-block">
            <div className="lm-brand-sub" style={{ marginBottom: 2 }}>Prévisionnel de trésorerie</div>
            <div className="prev-selects">
              <select value={storeId} onChange={(e) => onStore(e.target.value)} className="prev-select">
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={month} onChange={(e) => onMonth(e.target.value)} className="prev-select">
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
      <div className="lm-header-bottom">
        <div className="lm-tabs">
          {items.map((it) => (
            <Link key={it.id} href={it.href} className={`lm-tab${it.id === "previsionnel" ? " active" : ""}`} style={{ textDecoration: "none" }}>
              {it.label}
              {it.id === "previsionnel" && <span className="lm-tab-ind" />}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

// ── Étape 1 : doutes ───────────────────────────────────────────────────────────

function EventsEditor({ storeId, month, events, defaultImpact, onChange }: {
  storeId: string;
  month: string;
  events: EventDay[];
  defaultImpact: number;
  onChange: (events: EventDay[]) => void;
}) {
  const [date, setDate] = useState(`${month}-`);
  const [label, setLabel] = useState("Manifestation");
  const [impact, setImpact] = useState(String(Math.round(defaultImpact * 100)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inMonth = events.filter((e) => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));

  const add = async () => {
    setErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr("Date au format AAAA-MM-JJ"); return; }
    setBusy(true);
    try {
      const r = await api<{ event: EventDay }>(`/api/previsionnel/evenements?store=${storeId}`, {
        method: "POST",
        body: JSON.stringify({ date, label, impact: Number(impact) / 100 }),
      });
      onChange([...events, r.event]);
      setDate(`${month}-`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (ev: EventDay) => {
    if (ev.id === undefined) return;
    setBusy(true);
    try {
      if (ev.source === "presse") {
        // On garde la trace pour ne pas la reproposer.
        await api(`/api/previsionnel/evenements?store=${storeId}`, { method: "PATCH", body: JSON.stringify({ id: ev.id, status: "rejete" }) });
        onChange(events.map((e) => (e.id === ev.id ? { ...e, status: "rejete" } : e)));
      } else {
        await api(`/api/previsionnel/evenements?store=${storeId}&id=${ev.id}`, { method: "DELETE" });
        onChange(events.filter((e) => e.id !== ev.id));
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const restore = async (ev: EventDay) => {
    if (ev.id === undefined) return;
    await api(`/api/previsionnel/evenements?store=${storeId}`, { method: "PATCH", body: JSON.stringify({ id: ev.id, status: "confirme" }) });
    onChange(events.map((e) => (e.id === ev.id ? { ...e, status: "confirme" } : e)));
  };
  const patchImpact = async (id: number, v: string) => {
    const n = Number(v) / 100;
    if (!Number.isFinite(n)) return;
    try {
      await api(`/api/previsionnel/evenements?store=${storeId}`, { method: "PATCH", body: JSON.stringify({ id, impact: n }) });
      onChange(events.map((e) => (e.id === id ? { ...e, impact: n } : e)));
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="prev-card">
      <div className="lm-label">Manifestations, grèves et jours particuliers · {monthLabel(month)}</div>
      <p className="prev-muted" style={{ margin: "6px 0 10px" }}>
        Les lignes « presse » viennent de la veille automatique (une fois par jour). Impact appliqué au CA du jour ; l&apos;impact constaté des dates passées s&apos;affiche dans les hypothèses.
      </p>
      {inMonth.length === 0 && <div className="prev-muted">Rien de détecté ni de saisi pour ce mois.</div>}
      {inMonth.map((e) => (
        <div key={e.id ?? e.date} className={`prev-event-row${e.status === "rejete" ? " rejected" : ""}`}>
          <span className="prev-event-date">{fmtDate(e.date)}</span>
          <span className="prev-event-label">
            {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.label}</a> : e.label}
            <span className={`prev-src ${e.source === "presse" ? "prev-src-forecast" : ""}`}>{e.source === "presse" ? `presse${e.confidence !== undefined ? ` ${Math.round(e.confidence * 100)} %` : ""}` : "toi"}</span>
            {e.status === "rejete" && <span className="prev-src">écarté</span>}
          </span>
          {e.status !== "rejete" && (
            <>
              <input
                className="prev-input prev-input-sm"
                type="number"
                defaultValue={Math.round(e.impact * 100)}
                onBlur={(ev) => e.id !== undefined && patchImpact(e.id, ev.target.value)}
                step={5}
              />
              <span className="prev-muted">%</span>
            </>
          )}
          {e.id !== undefined && e.status !== "rejete" && <button className="prev-btn-link" onClick={() => remove(e)} disabled={busy}>retirer</button>}
          {e.id !== undefined && e.status === "rejete" && <button className="prev-btn-link" onClick={() => restore(e)} disabled={busy}>rétablir</button>}
        </div>
      ))}
      <div className="prev-event-add">
        <input className="prev-input" placeholder="AAAA-MM-JJ" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="prev-input" placeholder="Libellé" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="prev-input prev-input-sm" type="number" step={5} value={impact} onChange={(e) => setImpact(e.target.value)} />
        <span className="prev-muted">%</span>
        <button className="prev-btn" onClick={add} disabled={busy}>Ajouter</button>
      </div>
      {err && <div className="prev-error">{err}</div>}
    </div>
  );
}

function KindBadge({ kind }: { kind: RuleKind }) {
  const color = kind === "fixe" ? KIND_COLORS.fixe : kind === "matiere" ? KIND_COLORS.matiere : kind === "hors_exploitation" ? KIND_COLORS.horsExploitation : kind === "variable" ? KIND_COLORS.variable : KIND_COLORS.divers;
  return <span className="prev-kind" style={{ borderColor: color, color }}>{RULE_KIND_LABELS[kind]}</span>;
}

function DecisionRow({ d, storeId, onChanged }: { d: Decision; storeId: string; onChanged: (kind: RuleKind) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const choose = async (kind: RuleKind) => {
    setBusy(true);
    try {
      await api(`/api/previsionnel/reponses?store=${storeId}`, { method: "POST", body: JSON.stringify({ answers: [{ key: d.key, kind, label: d.label, reason: "Corrigé à la main" }] }) });
      onChanged(kind);
      setEditing(false);
    } finally { setBusy(false); }
  };
  return (
    <div className={`prev-decision${d.isNew ? " new" : ""}`}>
      <div className="prev-decision-main">
        <span className="prev-decision-label">{d.label}{d.isNew && <span className="prev-src prev-src-forecast">nouveau</span>}</span>
        <KindBadge kind={d.kind} />
        <span className="prev-muted prev-decision-meta">{fmtEur(d.total)} · {d.count} op. ({d.matched} lettrée{d.matched > 1 ? "s" : ""}) · {RULE_SOURCE_LABELS[d.source]}{d.source !== "utilisateur" ? ` ${Math.round(d.confidence * 100)} %` : ""}</span>
        <button className="prev-btn-link" onClick={() => setEditing((v) => !v)}>{editing ? "fermer" : "corriger"}</button>
      </div>
      {d.reason && <div className="prev-muted prev-decision-reason">{d.reason}</div>}
      {editing && (
        <div className="prev-doubt-actions" style={{ paddingLeft: 0 }}>
          {KINDS.map((k) => (
            <button key={k} className={`prev-choice${d.kind === k ? " selected" : ""}`} disabled={busy} title={KIND_HELP[k]} onClick={() => choose(k)}>{RULE_KIND_LABELS[k]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefingStep({ data, storeId, onAnalyse, onEventsChange, onSettingsChange, onRescout }: {
  data: DoutesResponse;
  storeId: string;
  onAnalyse: (answers: Record<string, RuleKind>) => void;
  onEventsChange: (events: EventDay[]) => void;
  onSettingsChange: (s: Settings) => void;
  onRescout: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, RuleKind>>({});
  const [decisions, setDecisions] = useState<Decision[]>(data.decisions);
  const [showAll, setShowAll] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [opening, setOpening] = useState(data.settings.openingBalanceOverride?.toString() ?? "");
  const answered = Object.keys(answers).length;
  const total = data.questions.length;
  const newDecisions = decisions.filter((d) => d.isNew);
  const bySource = (src: Decision["source"]) => newDecisions.filter((d) => d.source === src).length;
  const visible = showAll ? decisions : newDecisions;
  const pressEvents = data.events.filter((e) => e.source === "presse" && e.status !== "rejete");

  const acceptSuggestions = () => {
    const next = { ...answers };
    for (const d of data.questions) if (d.suggested && !next[d.key]) next[d.key] = d.suggested;
    setAnswers(next);
  };

  const saveOpening = async () => {
    const v = opening.trim() === "" ? null : Number(opening);
    const r = await api<{ settings: Settings }>(`/api/previsionnel/reglages?store=${storeId}`, {
      method: "PUT",
      body: JSON.stringify({ openingBalanceOverride: v }),
    });
    onSettingsChange(r.settings);
  };

  return (
    <div className="prev-step">
      <div className="prev-intro">
        <h2 className="prev-h2">Briefing du trésorier · {monthLabel(data.month)}</h2>
        <p className="prev-muted">
          {data.txCount} transactions bancaires et {data.ledgerLines} lignes d&apos;écriture lues.
          {newDecisions.length > 0
            ? ` ${newDecisions.length} contrepartie${newDecisions.length > 1 ? "s" : ""} classée${newDecisions.length > 1 ? "s" : ""} seul : ${bySource("pennylane")} par les écritures Pennylane, ${bySource("mots-cles")} par mots-clés, ${bySource("ia")} par Claude.`
            : ` ${decisions.length} contreparties déjà classées, rien de nouveau.`}
          {total > 0 ? ` ${total} question${total > 1 ? "s" : ""} en bas.` : " Aucune question."}
        </p>
        {data.warnings.map((w, i) => <div key={i} className="prev-error">{w}</div>)}
      </div>

      {!data.bankSynced && (
        <div className="prev-card prev-card-warn">
          <div className="lm-label">Solde bancaire indisponible dans Pennylane</div>
          <p className="prev-muted" style={{ margin: "6px 0 10px" }}>Saisir le solde d&apos;ouverture (solde bancaire d&apos;hier soir) pour projeter.</p>
          <div className="prev-event-add">
            <input className="prev-input" type="number" placeholder="Solde en €" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <button className="prev-btn" onClick={saveOpening}>Enregistrer</button>
          </div>
        </div>
      )}

      <div className="prev-card">
        <div className="prev-doubts-head">
          <span className="lm-label">Ce que j&apos;ai classé{showAll ? ` · ${decisions.length}` : newDecisions.length ? ` · ${newDecisions.length} nouvelles` : ""}</span>
          <button className="prev-btn-link" onClick={() => setShowAll((v) => !v)}>{showAll ? "nouvelles seulement" : `tout voir (${decisions.length})`}</button>
        </div>
        {visible.length === 0 && <div className="prev-muted">Rien de nouveau.</div>}
        {visible.map((d) => (
          <DecisionRow key={d.key} d={d} storeId={storeId} onChanged={(kind) => setDecisions(decisions.map((x) => (x.key === d.key ? { ...x, kind, source: "utilisateur", confidence: 1, reason: "Corrigé à la main" } : x)))} />
        ))}
      </div>

      <div className="prev-card">
        <div className="prev-doubts-head">
          <span className="lm-label">Transactions sans écriture lettrée · {data.unmatched.count}/{data.unmatched.txCount} sorties · {fmtEur(data.unmatched.total)}</span>
          <button className="prev-btn-link" onClick={() => setShowUnmatched((v) => !v)}>{showUnmatched ? "masquer" : "voir"}</button>
        </div>
        <p className="prev-muted" style={{ margin: "6px 0 0" }}>Elles restent dans les flux à leur date bancaire. Leur nature vient des mots-clés, de Claude ou de toi.</p>
        {showUnmatched && (
          <table className="prev-sched" style={{ marginTop: 8 }}>
            <thead><tr><th>Date</th><th>Libellé</th><th className="num">Montant</th><th>Nature</th></tr></thead>
            <tbody>
              {data.unmatched.items.map((t, i) => (
                <tr key={i}>
                  <td>{fmtDate(t.date)}</td>
                  <td className="prev-samples" style={{ whiteSpace: "normal" }}>{t.label}</td>
                  <td className="num">{fmtEur(t.amount)}</td>
                  <td>{t.kind ? <KindBadge kind={t.kind} /> : <span className="prev-muted">à classer</span>}</td>
                </tr>
              ))}
              {data.unmatched.count > data.unmatched.items.length && <tr><td colSpan={4} className="prev-muted">{data.unmatched.count - data.unmatched.items.length} de plus, non affichées.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="prev-card">
        <div className="prev-doubts-head">
          <span className="lm-label">Veille presse · {pressEvents.length} date{pressEvents.length > 1 ? "s" : ""} retenue{pressEvents.length > 1 ? "s" : ""}</span>
          <span className="prev-muted">
            {data.scout.ran ? "recherche faite à l'instant" : data.scout.at ? `dernière recherche ${new Date(data.scout.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : data.llm.enabled ? "" : "ANTHROPIC_API_KEY absente"}
            {data.llm.enabled && <> · <button className="prev-btn-link" onClick={onRescout}>relancer</button></>}
          </span>
        </div>
        <EventsEditor storeId={storeId} month={data.month} events={data.events} defaultImpact={data.settings.defaultEventImpact} onChange={onEventsChange} />
      </div>

      {total > 0 && (
        <div className="prev-card">
          <div className="prev-doubts-head">
            <span className="lm-label">J&apos;ai besoin de toi · {answered}/{total}</span>
            {data.questions.some((q) => q.suggested) && <button className="prev-btn-link" onClick={acceptSuggestions}>Accepter les avis</button>}
          </div>
          {data.questions.map((d, i) => {
            const chosen = answers[d.key];
            return (
              <div key={d.key} className={`prev-doubt${chosen ? " answered" : ""}`}>
                <div className="prev-doubt-main">
                  <div className="prev-doubt-num">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="prev-doubt-title">
                      <strong>{d.label}</strong> : je n&apos;ai ni écriture lettrée ni libellé reconnu. De quoi s&apos;agit-il ?
                    </div>
                    <div className="prev-muted">
                      {d.count} opération{d.count > 1 ? "s" : ""} · {fmtEur(d.total)} sur {d.monthsPresent}/{d.monthsWindow} mois · dernière le {fmtDate(d.lastDate)} ({fmtEur(d.lastAmount)})
                    </div>
                    <div className="prev-samples">{d.samples.join(" · ")}</div>
                    {d.hints.map((h, k) => (
                      <div key={k} className="prev-muted">Avis {RULE_SOURCE_LABELS[h.source]} ({Math.round(h.confidence * 100)} %) : {RULE_KIND_LABELS[h.kind]}{h.reason ? ` · ${h.reason}` : ""}</div>
                    ))}
                  </div>
                </div>
                <div className="prev-doubt-actions">
                  {KINDS.map((k) => (
                    <button
                      key={k}
                      className={`prev-choice${chosen === k ? " selected" : ""}${d.suggested === k && !chosen ? " suggested" : ""}`}
                      title={KIND_HELP[k]}
                      onClick={() => setAnswers({ ...answers, [d.key]: k })}
                    >
                      {RULE_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="prev-actions">
        <button className="prev-btn prev-btn-primary" onClick={() => onAnalyse(answers)}>
          {answered < total ? `Calculer le plan (${total - answered} sans réponse, traitée${total - answered > 1 ? "s" : ""} en charge fixe)` : "Calculer le plan"}
        </button>
      </div>
    </div>
  );
}

// ── Étape 2 ────────────────────────────────────────────────────────────────────

function AnalyseStep({ saved }: { saved: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 900);
    return () => clearInterval(id);
  }, []);
  const lines = [
    saved > 0 ? `${saved} réponse${saved > 1 ? "s" : ""} enregistrée${saved > 1 ? "s" : ""}` : "Classements appliqués",
    "Lecture de la caisse (N-1, 8 dernières semaines)",
    "Calcul de la croissance 4 semaines vs N-1",
    "Météo Marseille : prévision 16 jours et calibration pluie / froid",
    "Calendrier des charges fixes et hors exploitation",
    "Ratio matière sur 3 mois clos",
    "Projection jour par jour et scénarios",
    "Lecture du trésorier",
  ];
  return (
    <div className="prev-step prev-analyse">
      <h2 className="prev-h2">Analyse en cours</h2>
      <ul className="prev-analyse-list">
        {lines.map((l, i) => (
          <li key={l} className={i <= tick ? "done" : ""}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Étape 3 : plan ─────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`prev-kpi${tone ? ` prev-kpi-${tone}` : ""}`}>
      <div className="lm-label">{label}</div>
      <div className="prev-kpi-value">{value}</div>
      {sub && <div className="prev-muted">{sub}</div>}
    </div>
  );
}

function DayRow({ d, open, onToggle }: { d: PlanDay; open: boolean; onToggle: () => void }) {
  const tone = d.sorties.source === "actual" ? "actual" : "forecast";
  const flags: string[] = [];
  if (d.holiday) flags.push(d.holiday);
  if (d.event) flags.push(`${d.event.label} ${fmtPct(d.event.impact)}`);
  if (d.weather?.precip !== null && d.weather?.precip !== undefined && d.weather.precip >= 2) flags.push(`pluie ${d.weather.precip.toFixed(0)} mm`);
  if (d.weather?.tmax !== null && d.weather?.tmax !== undefined && d.weather.tmax < 12) flags.push(`froid ${d.weather.tmax.toFixed(0)}°`);
  return (
    <>
      <tr className={`prev-row prev-row-${tone}${d.isToday ? " today" : ""}${d.solde < 0 ? " negative" : ""}`} onClick={onToggle}>
        <td className="prev-td-date">
          {fmtDate(d.date)}
          {flags.length > 0 && <div className="prev-flags">{flags.join(" · ")}</div>}
        </td>
        <td className="num">
          {fmtEur(d.ca.value)}
          <span className={`prev-src prev-src-${d.ca.source}`}>{d.ca.source === "actual" ? "réel" : d.ca.source === "partial" ? "en cours" : "prévu"}</span>
        </td>
        <td className="num pos">{d.encaissements.bank ? fmtEur(d.encaissements.bank) : "·"}</td>
        <td className="num">{d.sorties.matiere ? fmtEur(d.sorties.matiere) : "·"}</td>
        <td className="num">{d.sorties.fixe ? fmtEur(d.sorties.fixe) : "·"}</td>
        <td className="num">{d.sorties.variable + d.sorties.divers ? fmtEur(d.sorties.variable + d.sorties.divers) : "·"}</td>
        <td className="num hors">{d.sorties.horsExploitation ? fmtEur(d.sorties.horsExploitation) : "·"}</td>
        <td className={`num ${d.netTotal >= 0 ? "pos" : "neg"}`}>{fmtEur(d.netTotal)}</td>
        <td className={`num prev-td-solde${d.solde < 0 ? " neg" : ""}`}>{fmtEur(d.solde)}</td>
      </tr>
      {open && (
        <tr className="prev-row-detail">
          <td colSpan={9}>
            <div className="prev-detail-grid">
              <div>
                <div className="lm-label">CA</div>
                <div className="prev-muted">
                  base {fmtEur(d.ca.base)} ({d.ca.baseSource === "n1" ? `N-1 ${fmtEur(d.ca.n1 ?? 0)} × ${d.ca.growth.toFixed(2)}` : d.ca.baseSource === "weekday-mean" ? "moyenne du jour de semaine" : "fermé"})
                  {d.ca.weatherFactor !== 1 && <> · météo ×{d.ca.weatherFactor.toFixed(2)}</>}
                  {d.ca.eventFactor !== 1 && <> · événement ×{d.ca.eventFactor.toFixed(2)}</>}
                </div>
                <div className="prev-muted">
                  encaissements : CB {fmtEur(d.encaissements.cb)} · TR {fmtEur(d.encaissements.tr)} · virements {fmtEur(d.encaissements.virement)} · espèces (caisse) {fmtEur(d.encaissements.especes)}
                </div>
              </div>
              <div>
                <div className="lm-label">Sorties {d.sorties.source === "actual" ? "constatées" : "prévues"}</div>
                {d.sorties.items.length === 0 && <div className="prev-muted">Aucune échéance identifiée{d.sorties.matiere ? " (matière au ratio)" : ""}.</div>}
                {d.sorties.items.map((it, i) => (
                  <div key={i} className="prev-item-row">
                    <i style={{ background: it.kind === "fixe" ? KIND_COLORS.fixe : it.kind === "hors_exploitation" ? KIND_COLORS.horsExploitation : it.kind === "matiere" ? KIND_COLORS.matiere : KIND_COLORS.variable }} />
                    <span>{it.label}</span>
                    <span className="num">{fmtEur(it.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FixedSchedulePanel({ plan, storeId, onSaved }: { plan: Plan; storeId: string; onSaved: () => void }) {
  const [edit, setEdit] = useState<Record<string, { amount: string; day: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (key: string, kind: RuleKind, label: string) => {
    const e = edit[key];
    if (!e) return;
    setBusy(key);
    try {
      await api(`/api/previsionnel/reponses?store=${storeId}`, {
        method: "POST",
        body: JSON.stringify({ answers: [{ key, kind, label, expectedAmount: e.amount === "" ? null : Number(e.amount), expectedDay: e.day === "" ? null : Number(e.day) }] }),
      });
      setEdit((cur) => { const n = { ...cur }; delete n[key]; return n; });
      onSaved();
    } finally { setBusy(null); }
  };
  const reclass = async (key: string) => {
    setBusy(key);
    try {
      await api(`/api/previsionnel/regles?store=${storeId}&key=${encodeURIComponent(key)}`, { method: "DELETE" });
      onSaved();
    } finally { setBusy(null); }
  };
  return (
    <div className="prev-card">
      <div className="lm-label">Échéancier des sorties fixes et hors exploitation</div>
      <p className="prev-muted" style={{ margin: "6px 0 10px" }}>Montant = médiane des mois observés, date = jour habituel. Modifier pour forcer une valeur.</p>
      <table className="prev-sched">
        <thead>
          <tr><th>Contrepartie</th><th>Type</th><th>Fréq.</th><th className="num">Montant</th><th>Jour</th><th>Projeté</th><th /></tr>
        </thead>
        <tbody>
          {plan.fixedSchedule.map((f) => {
            const e = edit[f.key];
            return (
              <tr key={f.key} className={f.kind === "hors_exploitation" ? "hors" : ""}>
                <td>
                  {f.label}
                  {f.overridden && <span className="prev-src prev-src-forecast">forcé</span>}
                  <div className="prev-muted">{f.observedMonths} mois · {f.observedAmounts.slice(-4).map((a) => fmtEur(a)).join(", ")}</div>
                </td>
                <td>{RULE_KIND_LABELS[f.kind]}</td>
                <td>{f.frequency}</td>
                <td className="num">
                  {e ? <input className="prev-input prev-input-sm" value={e.amount} onChange={(ev) => setEdit({ ...edit, [f.key]: { ...e, amount: ev.target.value } })} /> : fmtEur(f.expectedAmount)}
                </td>
                <td>
                  {e ? <input className="prev-input prev-input-xs" value={e.day} onChange={(ev) => setEdit({ ...edit, [f.key]: { ...e, day: ev.target.value } })} /> : f.frequency === "hebdo" ? ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"][f.weekday ?? 0] : f.expectedDay ?? "·"}
                </td>
                <td className="prev-muted">
                  {f.paidThisMonth > 0 && <span>payé ×{f.paidThisMonth} </span>}
                  {f.projectedDates.map((d) => d.slice(8)).join(", ") || "·"}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {e ? (
                    <>
                      <button className="prev-btn-link" onClick={() => save(f.key, f.kind, f.label)} disabled={busy === f.key}>ok</button>
                      <button className="prev-btn-link" onClick={() => setEdit((cur) => { const n = { ...cur }; delete n[f.key]; return n; })}>annuler</button>
                    </>
                  ) : (
                    <>
                      <button className="prev-btn-link" onClick={() => setEdit({ ...edit, [f.key]: { amount: String(f.expectedAmount), day: String(f.expectedDay ?? "") } })}>modifier</button>
                      <button className="prev-btn-link" onClick={() => reclass(f.key)} disabled={busy === f.key} title="Reposer la question de classification">reclasser</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {plan.fixedSchedule.length === 0 && <tr><td colSpan={7} className="prev-muted">Aucune sortie fixe identifiée.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function HypothesesPanel({ plan }: { plan: Plan }) {
  const h = plan.hypotheses;
  const w = h.weather;
  return (
    <div className="prev-card">
      <div className="lm-label">Hypothèses</div>
      <dl className="prev-dl">
        <dt>Croissance</dt>
        <dd>{fmtPct(h.growth - 1, 1)} · {fmtEur(h.growthN)} vs {fmtEur(h.growthN1)} N-1 · {h.growthWindow}</dd>
        <dt>CA de base</dt>
        <dd>N-1 aligné sur le jour de semaine × croissance ; moyenne du jour de semaine (8 sem.) si N-1 absent ; fériés sur la même date N-1</dd>
        <dt>Encaissements</dt>
        <dd>CB {Math.round(h.paymentShares.cb * 100)} % à J+{h.settings.cbDelayDays} · TR {Math.round(h.paymentShares.tr * 100)} % à J+{h.settings.trDelayDays} · virements {Math.round(h.paymentShares.virement * 100)} % · espèces {Math.round(h.paymentShares.especes * 100)} % (restent en caisse)</dd>
        <dt>Matière</dt>
        <dd>
          {h.matiereRatio !== null ? `${(h.matiereRatio * 100).toFixed(1)} % du CA` : "non calculé"}
          {h.matiereRatioMonths.length > 0 && (
            <span className="prev-muted"> · {h.matiereRatioMonths.map((m) => `${m.month.slice(5)} : ${m.ratio !== null ? (m.ratio * 100).toFixed(0) + " %" : "·"}`).join(" · ")}</span>
          )}
          {h.settings.matiereLagMonths > 0 && <span className="prev-muted"> · décalage {h.settings.matiereLagMonths} mois</span>}
        </dd>
        <dt>Variables</dt>
        <dd>{h.variableRatio !== null ? `${(h.variableRatio * 100).toFixed(1)} % du CA` : "aucune contrepartie classée variable"} · divers {fmtEur(h.diversPerDay)}/jour</dd>
        <dt>Météo</dt>
        <dd>
          {!w.enabled && "désactivée"}
          {w.enabled && (
            <>
              pluie ≥ 2 mm : {w.rainEffect !== null ? fmtPct(w.rainEffect) : "non calibré"} ({w.rainSamples} j) · tmax &lt; 12° : {w.coldEffect !== null ? fmtPct(w.coldEffect) : "non calibré"} ({w.coldSamples} j)
              {w.forecastUntil && <> · prévision jusqu&apos;au {fmtDate(w.forecastUntil)}</>}
            </>
          )}
        </dd>
        <dt>Scénarios</dt>
        <dd>±{Math.round(h.settings.scenarioSpread * 100)} % sur les encaissements et les sorties variables futures</dd>
        {h.eventsCalibration.length > 0 && (
          <>
            <dt>Manifs passées</dt>
            <dd>{h.eventsCalibration.map((e) => `${fmtDate(e.date)} ${e.label} : constaté ${fmtPct(e.observedImpact)} (attendu ${fmtEur(e.expected)}, réel ${fmtEur(e.actual)})`).join(" · ")}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function SettingsPanel({ storeId, settings, onSaved }: { storeId: string; settings: Settings; onSaved: () => void }) {
  const [form, setForm] = useState({
    cbDelayDays: String(settings.cbDelayDays),
    trDelayDays: String(settings.trDelayDays),
    matiereLagMonths: String(settings.matiereLagMonths),
    defaultEventImpact: String(Math.round(settings.defaultEventImpact * 100)),
    alertThreshold: String(settings.alertThreshold),
    scenarioSpread: String(Math.round(settings.scenarioSpread * 100)),
    smallThreshold: String(settings.smallThreshold),
    openingBalanceOverride: settings.openingBalanceOverride?.toString() ?? "",
    weatherEnabled: settings.weatherEnabled,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/previsionnel/reglages?store=${storeId}`, {
        method: "PUT",
        body: JSON.stringify({
          cbDelayDays: Number(form.cbDelayDays),
          trDelayDays: Number(form.trDelayDays),
          matiereLagMonths: Number(form.matiereLagMonths),
          defaultEventImpact: Number(form.defaultEventImpact) / 100,
          alertThreshold: Number(form.alertThreshold),
          scenarioSpread: Number(form.scenarioSpread) / 100,
          smallThreshold: Number(form.smallThreshold),
          openingBalanceOverride: form.openingBalanceOverride === "" ? null : Number(form.openingBalanceOverride),
          weatherEnabled: form.weatherEnabled,
        }),
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof form, label: string, suffix = "") => (
    <label className="prev-field">
      <span>{label}</span>
      <input className="prev-input prev-input-sm" value={String(form[k])} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      <span className="prev-muted">{suffix}</span>
    </label>
  );
  return (
    <div className="prev-card">
      <div className="lm-label">Réglages</div>
      <div className="prev-fields">
        {field("cbDelayDays", "Délai CB", "jours")}
        {field("trDelayDays", "Délai titres-resto", "jours")}
        {field("matiereLagMonths", "Décalage matière", "mois")}
        {field("defaultEventImpact", "Impact manif par défaut", "%")}
        {field("alertThreshold", "Seuil d'alerte", "€")}
        {field("scenarioSpread", "Amplitude scénarios", "%")}
        {field("smallThreshold", "Seuil de question", "€ / 13 mois")}
        {field("openingBalanceOverride", "Solde d'ouverture forcé", "€ (vide = synchro)")}
        <label className="prev-field">
          <span>Météo</span>
          <input type="checkbox" checked={form.weatherEnabled} onChange={(e) => setForm({ ...form, weatherEnabled: e.target.checked })} />
        </label>
      </div>
      <div className="prev-actions" style={{ marginTop: 8 }}>
        <button className="prev-btn" onClick={save} disabled={busy}>Enregistrer et recalculer</button>
      </div>
      {err && <div className="prev-error">{err}</div>}
    </div>
  );
}

function PlanStep({ data, storeId, onReview, onReload }: {
  data: PlanResponse;
  storeId: string;
  onReview: () => void;
  onReload: (force?: boolean) => void;
}) {
  const plan = data.plan;
  const k = plan.kpis;
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [panel, setPanel] = useState<"hyp" | "sched" | "events" | "decisions" | "settings">("hyp");
  const [decisions, setDecisions] = useState<Decision[]>(data.briefing.decisions);
  const [events, setEvents] = useState<EventDay[]>(data.events);
  const finTone = k.soldeFinMois < 0 ? "bad" : k.soldeFinMois < k.alertThreshold ? "warn" : "ok";
  const pbTone = k.pointBas.solde < 0 ? "bad" : k.pointBas.solde < k.alertThreshold ? "warn" : "ok";

  return (
    <div className="prev-step">
      <div className="prev-plan-head">
        <div>
          <h2 className="prev-h2">Plan de trésorerie · {monthLabel(plan.month)}</h2>
          <div className="prev-muted">
            Solde {plan.opening.source === "bank-sync" ? "Pennylane" : plan.opening.source === "override" ? "saisi" : "inconnu"} au {fmtDate(plan.opening.asOf)} : {fmtEur(plan.opening.balance)}
            {plan.bankAccounts.length > 1 && <> ({plan.bankAccounts.map((a) => `${a.name} ${fmtEur(a.balance)}`).join(" + ")})</>}
            {" · "}généré à {new Date(plan.generatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="prev-actions">
          <button className="prev-btn" onClick={onReview}>{data.pendingDoubts > 0 ? `Briefing · ${data.pendingDoubts} question${data.pendingDoubts > 1 ? "s" : ""}` : "Briefing"}</button>
          <button className="prev-btn" onClick={() => onReload(true)}>Recharger Pennylane</button>
        </div>
      </div>

      {plan.narrative && (
        <div className="prev-card prev-narrative">
          <div className="lm-label">Lecture du trésorier</div>
          <p>{plan.narrative}</p>
        </div>
      )}

      {plan.warnings.length > 0 && (
        <ul className="prev-warnings">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}

      <div className="prev-kpis">
        <Kpi label="Solde actuel" value={fmtEur(k.soldeActuel)} sub={`au ${fmtDate(plan.opening.asOf)}`} />
        <Kpi label="Solde fin de mois" value={fmtEur(k.soldeFinMois)} sub={`${fmtEur(k.soldeFinMoisPessimiste)} à ${fmtEur(k.soldeFinMoisOptimiste)}`} tone={finTone} />
        <Kpi label="Point bas" value={fmtEur(k.pointBas.solde)} sub={fmtDate(k.pointBas.date)} tone={pbTone} />
        <Kpi label="CA du mois" value={fmtEur(k.caMoisPrevu)} sub={`réalisé ${fmtEur(k.caMoisRealise)}${k.caMoisN1 ? ` · N-1 ${fmtEur(k.caMoisN1)} (${fmtPct(k.caMoisPrevu / k.caMoisN1 - 1)})` : ""}`} />
        <Kpi label="Reste à encaisser" value={fmtEur(k.encaissementsRestants)} sub={`à décaisser ${fmtEur(k.sortiesRestantes)} + hors expl. ${fmtEur(k.sortiesHorsExploitationRestantes)}`} />
        <Kpi label="Jours sous le seuil" value={String(k.joursSousSeuil)} sub={`seuil ${fmtEur(k.alertThreshold)}`} tone={k.joursSousSeuil > 0 ? "warn" : "ok"} />
      </div>

      <div className="prev-card">
        <div className="lm-label">Solde bancaire jour par jour</div>
        <SoldeChart plan={plan} />
      </div>

      <div className="prev-two">
        <div className="prev-card">
          <div className="lm-label">Flux journaliers</div>
          <FluxChart plan={plan} />
        </div>
        <div className="prev-card">
          <div className="lm-label">Du solde initial au solde final</div>
          <Waterfall plan={plan} />
        </div>
      </div>

      <div className="prev-card">
        <div className="lm-label">Détail jour par jour</div>
        <div className="prev-table-wrap">
          <table className="prev-table">
            <thead>
              <tr>
                <th>Jour</th><th className="num">CA caisse</th><th className="num">Encaissé banque</th><th className="num">Matière</th><th className="num">Fixes</th><th className="num">Autres</th><th className="num">Hors expl.</th><th className="num">Net</th><th className="num">Solde</th>
              </tr>
            </thead>
            <tbody>
              {plan.days.map((d) => (
                <DayRow key={d.date} d={d} open={openDay === d.date} onToggle={() => setOpenDay(openDay === d.date ? null : d.date)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="prev-panel-tabs">
        {(["hyp", "sched", "events", "decisions", "settings"] as const).map((p) => (
          <button key={p} className={`prev-tab${panel === p ? " active" : ""}`} onClick={() => setPanel(p)}>
            {p === "hyp" ? "Hypothèses" : p === "sched" ? "Échéancier" : p === "events" ? "Manifs" : p === "decisions" ? `Classements (${decisions.length})` : "Réglages"}
          </button>
        ))}
      </div>
      {panel === "hyp" && <HypothesesPanel plan={plan} />}
      {panel === "sched" && <FixedSchedulePanel plan={plan} storeId={storeId} onSaved={() => onReload()} />}
      {panel === "events" && (
        <EventsEditor
          storeId={storeId}
          month={plan.month}
          events={events}
          defaultImpact={plan.hypotheses.settings.defaultEventImpact}
          onChange={(ev) => { setEvents(ev); onReload(); }}
        />
      )}
      {panel === "decisions" && (
        <div className="prev-card">
          <div className="lm-label">Classement des contreparties</div>
          <p className="prev-muted" style={{ margin: "6px 0 10px" }}>Corriger une ligne la fige (source : toi) et recalcule le plan.</p>
          {decisions.map((d) => (
            <DecisionRow key={d.key} d={d} storeId={storeId} onChanged={(kind) => { setDecisions(decisions.map((x) => (x.key === d.key ? { ...x, kind, source: "utilisateur", confidence: 1 } : x))); onReload(); }} />
          ))}
        </div>
      )}
      {panel === "settings" && <SettingsPanel storeId={storeId} settings={plan.hypotheses.settings} onSaved={() => onReload()} />}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export function PrevisionnelView({ stores, initialStore }: { stores: Store[]; initialStore: string }) {
  const defaultMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  const [storeId, setStoreId] = useState(initialStore);
  const [month, setMonth] = useState(defaultMonth);
  const [step, setStep] = useState<Step>("chargement");
  const [doutes, setDoutes] = useState<DoutesResponse | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async (force = false) => {
    setStep("analyse");
    setError(null);
    try {
      const r = await api<PlanResponse>(`/api/previsionnel?store=${storeId}&month=${month}${force ? "&force=1" : ""}`);
      setPlan(r);
      setStep("plan");
    } catch (e) {
      setError((e as Error).message);
      setStep("plan");
    }
  }, [storeId, month]);

  const loadDoutes = useCallback(async (force = false) => {
    setStep("chargement");
    setError(null);
    try {
      const r = await api<DoutesResponse>(`/api/previsionnel/doutes?store=${storeId}&month=${month}${force ? "&force=1" : ""}`);
      setDoutes(r);
      const nothingNew = r.questions.length === 0 && !r.decisions.some((d) => d.isNew) && r.scout.found === 0 && r.bankSynced;
      if (nothingNew && !force) {
        setSaved(0);
        await loadPlan();
      } else {
        setStep("doutes");
      }
    } catch (e) {
      setError((e as Error).message);
      setStep("doutes");
    }
  }, [storeId, month, loadPlan]);

  useEffect(() => { void loadDoutes(); }, [loadDoutes]);

  const onAnalyse = async (answers: Record<string, RuleKind>) => {
    const list = Object.entries(answers).map(([key, kind]) => ({
      key,
      kind,
      label: doutes?.questions.find((d) => d.key === key)?.label ?? key,
    }));
    setStep("analyse");
    try {
      if (list.length) await api(`/api/previsionnel/reponses?store=${storeId}`, { method: "POST", body: JSON.stringify({ answers: list }) });
      setSaved(list.length);
      await loadPlan();
    } catch (e) {
      setError((e as Error).message);
      setStep("doutes");
    }
  };

  const stable = stores.length ? stores : [{ id: "davso", name: "Davso", fullName: "", address: "", opened: "", openedDate: "" }];

  return (
    <div className="lm-app prev-theme">
      <PrevHeader stores={stable} storeId={storeId} month={month} onStore={setStoreId} onMonth={setMonth} />
      <main className="lm-main prev-main">
        {error && <div className="prev-error" style={{ marginBottom: 12 }}>Erreur : {error}</div>}
        {step === "chargement" && (
          <div className="prev-step prev-analyse">
            <h2 className="prev-h2">Le trésorier prépare son briefing</h2>
            <p className="prev-muted">Transactions et écritures Pennylane, caisse APITIC, classification, veille presse. Une à deux minutes au premier passage.</p>
          </div>
        )}
        {step === "doutes" && doutes && (
          <BriefingStep
            data={doutes}
            storeId={storeId}
            onAnalyse={onAnalyse}
            onEventsChange={(events) => setDoutes({ ...doutes, events })}
            onSettingsChange={(settings) => setDoutes({ ...doutes, settings, bankSynced: doutes.bankSynced || settings.openingBalanceOverride !== null })}
            onRescout={() => loadDoutes(true)}
          />
        )}
        {step === "analyse" && <AnalyseStep saved={saved} />}
        {step === "plan" && plan && (
          <PlanStep data={plan} storeId={storeId} onReview={() => loadDoutes()} onReload={(force) => loadPlan(Boolean(force))} />
        )}
      </main>
    </div>
  );
}
