import "server-only";
import { suggestKind, prettyLabel } from "./classify";
import { addEvent, cacheGet, cacheSet, upsertRules } from "./db";
import { buildLedgerEvidence } from "./evidence";
import { median } from "./engine";
import { classifyWithLLM, llmEnabled, scoutEvents, type LlmClassifyInput } from "./llm";
import type { StoreContext } from "./data";
import type { Briefing, Decision, Doubt, EventDay, Rule, RuleKind, RuleSource } from "./types";

// L'agent Trésorier : décide seul ce qu'il peut prouver, demande le reste.
//
// Ordre de preuve pour classer une contrepartie :
//   1. écritures Pennylane (compte PCG de la transaction ou de la facture lettrée)
//   2. mots-clés sans ambiguïté (URSSAF, DGFIP, METRO…)
//   3. Claude, sur libellés + régularité, accepté si confiance ≥ 0.8
//   4. sinon question, seulement si le montant est significatif

const PENNYLANE_MIN_SHARE = 0.7;
const LLM_ACCEPT = 0.8;

type KeyStat = {
  key: string;
  label: string;
  count: number;
  total: number;
  lastDate: string;
  lastAmount: number;
  monthsSet: Set<string>;
  samples: string[];
  amounts: number[];
};

function keyStats(ctx: StoreContext): { stats: Map<string, KeyStat>; monthsWindow: number; totalOut: number } {
  const stats = new Map<string, KeyStat>();
  const months = new Set<string>();
  let totalOut = 0;
  for (const tx of ctx.txs) {
    months.add(tx.date.slice(0, 7));
    if (tx.amount >= 0) continue;
    totalOut += -tx.amount;
    const s = stats.get(tx.key) ?? {
      key: tx.key,
      label: prettyLabel(tx.key),
      count: 0,
      total: 0,
      lastDate: tx.date,
      lastAmount: -tx.amount,
      monthsSet: new Set<string>(),
      samples: [],
      amounts: [],
    };
    s.count += 1;
    s.total += -tx.amount;
    s.amounts.push(-tx.amount);
    s.monthsSet.add(tx.date.slice(0, 7));
    if (tx.date >= s.lastDate) {
      s.lastDate = tx.date;
      s.lastAmount = -tx.amount;
    }
    if (s.samples.length < 3 && !s.samples.includes(tx.label)) s.samples.push(tx.label);
    stats.set(tx.key, s);
  }
  return { stats, monthsWindow: months.size, totalOut };
}

export async function runTresorier(
  ctx: StoreContext,
  opts: { scout?: boolean } = {},
): Promise<Briefing> {
  const warnings: string[] = [];
  const { stats, monthsWindow, totalOut } = keyStats(ctx);
  const ruleMap = new Map(ctx.rules.map((r) => [r.key, r]));
  const materiality = Math.max(ctx.settings.smallThreshold, totalOut * 0.004);

  // ── 1. Évidence comptable ──
  const evidence = buildLedgerEvidence(ctx.txs, ctx.ledgerLines, ctx.ledgerAccounts);
  if (ctx.ledgerLines.length === 0) {
    warnings.push(ctx.ledgerError
      ? `Écritures Pennylane indisponibles : ${ctx.ledgerError}`
      : "Aucune écriture Pennylane lue : classification sans preuve comptable.");
  }

  const newRules: Rule[] = [];
  const hintsByKey = new Map<string, Doubt["hints"]>();
  const forLlm: LlmClassifyInput[] = [];

  // Règles automatiques contredites par une preuve comptable forte : réévaluées. Les tiennes ne bougent pas.
  const revised: string[] = [];
  for (const s of stats.values()) {
    const rule = ruleMap.get(s.key);
    if (!rule || rule.source === "utilisateur") continue;
    const ev = evidence.get(s.key);
    if (!ev?.kind || ev.share < PENNYLANE_MIN_SHARE || ev.matched < 1 || ev.kind === rule.kind) continue;
    if (rule.source === "pennylane" && (rule.confidence ?? 0) >= 0.95) continue;
    const confidence = ev.matched / Math.max(1, ev.total) >= 0.5 ? 0.95 : 0.8;
    newRules.push({ ...rule, kind: ev.kind, source: "pennylane", confidence, reason: `${ev.reason} (remplace : ${rule.kind} par ${rule.source})`, accounts: ev.accounts.slice(0, 3).map((a) => a.number) });
    revised.push(s.label);
  }
  if (revised.length) warnings.push(`${revised.length} classement(s) automatique(s) corrigé(s) par les écritures Pennylane : ${revised.slice(0, 5).join(", ")}.`);

  for (const s of stats.values()) {
    if (ruleMap.has(s.key)) continue;
    const hints: Doubt["hints"] = [];
    const ev = evidence.get(s.key);
    if (ev?.kind) {
      const strong = ev.share >= PENNYLANE_MIN_SHARE && ev.matched >= 1;
      const confidence = strong ? (ev.matched / Math.max(1, ev.total) >= 0.5 ? 0.95 : 0.8) : 0.5;
      if (strong) {
        newRules.push({ key: s.key, kind: ev.kind, label: s.label, source: "pennylane", confidence, reason: ev.reason, accounts: ev.accounts.slice(0, 3).map((a) => a.number) });
        continue;
      }
      hints.push({ source: "pennylane", kind: ev.kind, confidence, reason: ev.reason });
    }
    const kw = suggestKind(s.key, s.samples[0] ?? "");
    if (kw) {
      newRules.push({ key: s.key, kind: kw, label: s.label, source: "mots-cles", confidence: 0.85, reason: "Libellé reconnu", accounts: ev?.accounts.slice(0, 3).map((a) => a.number) ?? [] });
      continue;
    }
    hintsByKey.set(s.key, hints);
    if (s.total >= materiality) {
      forLlm.push({
        key: s.key,
        samples: s.samples,
        count: s.count,
        total: s.total,
        monthsPresent: s.monthsSet.size,
        monthsWindow,
        typicalAmount: median(s.amounts),
      });
    }
  }

  // ── 2. Claude pour le reste ──
  let llmError: string | null = null;
  const llmOn = llmEnabled();
  if (llmOn && forLlm.length) {
    try {
      for (let i = 0; i < forLlm.length; i += 50) {
        const batch = forLlm.slice(i, i + 50);
        const results = await classifyWithLLM(ctx.storeName, batch);
        for (const r of results) {
          const s = stats.get(r.key);
          if (!s || ruleMap.has(r.key) || newRules.some((n) => n.key === r.key)) continue;
          if (r.confidence >= LLM_ACCEPT) {
            newRules.push({ key: r.key, kind: r.kind, label: s.label, source: "ia", confidence: r.confidence, reason: r.reason, accounts: evidence.get(r.key)?.accounts.slice(0, 3).map((a) => a.number) ?? [] });
          } else {
            hintsByKey.get(r.key)?.push({ source: "ia", kind: r.kind, confidence: r.confidence, reason: r.reason });
          }
        }
      }
    } catch (err) {
      llmError = (err as Error).message;
      warnings.push(`Claude indisponible pour la classification : ${llmError}`);
    }
  } else if (!llmOn && forLlm.length) {
    warnings.push("ANTHROPIC_API_KEY absente : les contreparties sans preuve comptable ni mot-clé te sont demandées.");
  }

  if (newRules.length) {
    await upsertRules(ctx.storeId, newRules);
    for (const r of newRules) ruleMap.set(r.key, { ...r, updatedAt: new Date().toISOString() });
  }

  // ── 3. Questions restantes ──
  const questions: Doubt[] = [];
  for (const s of stats.values()) {
    if (ruleMap.has(s.key) || s.total < materiality) continue;
    questions.push({
      key: s.key,
      label: s.label,
      count: s.count,
      total: Math.round(s.total * 100) / 100,
      lastDate: s.lastDate,
      lastAmount: Math.round(s.lastAmount * 100) / 100,
      monthsPresent: s.monthsSet.size,
      monthsWindow,
      suggested: hintsByKey.get(s.key)?.sort((a, b) => b.confidence - a.confidence)[0]?.kind ?? null,
      samples: s.samples,
      hints: hintsByKey.get(s.key) ?? [],
    });
  }
  questions.sort((a, b) => b.total - a.total);

  // ── 4. Décisions (toutes les règles, avec leurs montants) ──
  const newKeys = new Set(newRules.map((r) => r.key));
  const decisions: Decision[] = [];
  for (const r of ruleMap.values()) {
    const s = stats.get(r.key);
    decisions.push({
      key: r.key,
      label: r.label,
      kind: r.kind,
      source: (r.source ?? "utilisateur") as RuleSource,
      confidence: r.confidence ?? 1,
      reason: r.reason ?? "",
      total: Math.round((s?.total ?? 0) * 100) / 100,
      count: s?.count ?? 0,
      matched: evidence.get(r.key)?.matched ?? 0,
      isNew: newKeys.has(r.key),
    });
  }

  // Transactions sortantes sans écriture lettrée : listées, jamais écartées.
  const unmatchedItems: Briefing["unmatched"]["items"] = [];
  let txOutCount = 0;
  for (const tx of ctx.txs) {
    if (tx.amount >= 0) continue;
    txOutCount++;
    if (evidence.get(tx.key)?.matchedTxIds.has(tx.id)) continue;
    unmatchedItems.push({ date: tx.date, label: tx.label, amount: Math.round(-tx.amount * 100) / 100, key: tx.key, kind: ruleMap.get(tx.key)?.kind ?? null });
  }
  unmatchedItems.sort((a, b) => b.date.localeCompare(a.date));
  const unmatched: Briefing["unmatched"] = {
    count: unmatchedItems.length,
    total: Math.round(unmatchedItems.reduce((s, i) => s + i.amount, 0) * 100) / 100,
    txCount: txOutCount,
    items: unmatchedItems.slice(0, 300),
  };
  decisions.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.total - a.total);

  // ── 5. Veille presse ──
  const scout: Briefing["scout"] = { ran: false, found: 0, error: null, at: null };
  let events: EventDay[] = ctx.events;
  if (opts.scout !== false && llmOn) {
    const cacheKey = `scout:${ctx.month}`;
    const cached = await cacheGet<{ at: string; found: number }>(cacheKey, 20 * 3600);
    if (cached) {
      scout.at = cached.at;
      scout.found = cached.found;
    } else {
      scout.ran = true;
      try {
        const res = await scoutEvents(ctx.month, ctx.today, ctx.storeAddress);
        let added = 0;
        for (const e of res.events) {
          if (e.confidence < 0.4) continue;
          const dup = events.find((x) => x.date === e.date && (x.source === "presse" || x.label.toLowerCase() === e.label.toLowerCase()));
          if (dup) continue;
          const created = await addEvent("all", {
            date: e.date,
            label: `${e.label}`,
            impact: e.impact,
            source: "presse",
            status: "propose",
            confidence: e.confidence,
            url: e.url,
          });
          events = [...events, created];
          added++;
        }
        scout.found = added;
        scout.at = new Date().toISOString();
        await cacheSet(cacheKey, { at: scout.at, found: added });
      } catch (err) {
        scout.error = (err as Error).message;
        warnings.push(`Veille presse indisponible : ${scout.error}`);
      }
    }
  }

  ctx.rules = [...ruleMap.values()];
  ctx.events = events;

  return {
    storeId: ctx.storeId,
    month: ctx.month,
    today: ctx.today,
    generatedAt: new Date().toISOString(),
    txCount: ctx.rawTxCount,
    ledgerLines: ctx.ledgerLines.length,
    decisions,
    questions,
    unmatched,
    events: events.filter((e) => e.date.startsWith(ctx.month)).sort((a, b) => a.date.localeCompare(b.date)),
    scout,
    llm: { enabled: llmOn, error: llmError },
    warnings: [...warnings, ...(ctx.txError ? [`Transactions Pennylane : ${ctx.txError}`] : []), ...(ctx.dailyError ? [`Caisse : ${ctx.dailyError}`] : [])],
  };
}

export const KIND_ORDER: RuleKind[] = ["fixe", "matiere", "hors_exploitation", "variable", "ignorer"];
