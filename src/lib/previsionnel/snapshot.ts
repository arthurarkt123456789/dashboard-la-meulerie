import "server-only";
import { cacheGet, cacheSet } from "./db";
import type { Baseline, Plan } from "./types";

// Les snapshots n'expirent pas : ils sont remplacés à chaque recalcul.
const FOREVER = 10 * 365 * 24 * 3600;

const planKey = (storeId: string, month: string) => `plan:${storeId}:${month}`;
const baselineKey = (storeId: string, month: string) => `baseline:${storeId}:${month}`;

export type StoredPlan<T> = { savedAt: string; payload: T };

/** Dernier plan calculé pour ce magasin et ce mois, tel quel, sans recalcul. */
export async function getStoredPlan<T>(storeId: string, month: string): Promise<StoredPlan<T> | null> {
  return cacheGet<StoredPlan<T>>(planKey(storeId, month), FOREVER);
}

export async function storePlan<T>(storeId: string, month: string, payload: T): Promise<string> {
  const savedAt = new Date().toISOString();
  await cacheSet(planKey(storeId, month), { savedAt, payload });
  return savedAt;
}

export function baselineFromPlan(plan: Plan, frozenAt: string = new Date().toISOString()): Baseline {
  return {
    storeId: plan.storeId,
    month: plan.month,
    frozenAt,
    days: plan.days.map((d) => ({
      date: d.date,
      ca: d.ca.value,
      bank: d.encaissements.bank,
      sorties: d.sorties.total,
      solde: d.solde,
    })),
    soldeFinMois: plan.kpis.soldeFinMois,
    caMois: plan.kpis.caMoisPrevu,
  };
}

export async function getBaseline(storeId: string, month: string): Promise<Baseline | null> {
  return cacheGet<Baseline>(baselineKey(storeId, month), FOREVER);
}

/**
 * Renvoie la projection figée du mois. Elle est créée au premier calcul et
 * n'est remplacée que sur demande explicite (`refreeze`).
 */
export async function ensureBaseline(plan: Plan, refreeze = false): Promise<Baseline> {
  if (!refreeze) {
    const existing = await getBaseline(plan.storeId, plan.month);
    if (existing) return existing;
  }
  const baseline = baselineFromPlan(plan);
  await cacheSet(baselineKey(plan.storeId, plan.month), baseline);
  return baseline;
}

/**
 * Reprend un plan déjà calculé (cache d'un navigateur, antérieur à
 * l'enregistrement serveur) comme plan enregistré et comme projection figée.
 * Sans effet si un plan est déjà enregistré pour ce mois : rien n'est écrasé.
 */
export async function adoptPlan<T extends { plan: Plan }>(storeId: string, month: string, payload: T): Promise<{ adopted: boolean; baseline: Baseline | null; savedAt: string | null }> {
  const existing = await getStoredPlan<T>(storeId, month);
  if (existing) return { adopted: false, baseline: await getBaseline(storeId, month), savedAt: existing.savedAt };
  const savedAt = payload.plan.generatedAt;
  await cacheSet(planKey(storeId, month), { savedAt, payload });
  let baseline = await getBaseline(storeId, month);
  if (!baseline) {
    baseline = baselineFromPlan(payload.plan, savedAt);
    await cacheSet(baselineKey(storeId, month), baseline);
  }
  return { adopted: true, baseline, savedAt };
}
