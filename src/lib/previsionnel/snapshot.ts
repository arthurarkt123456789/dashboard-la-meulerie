import "server-only";
import { cacheGet, cacheSet } from "./db";
import { BANK_GAP, type Baseline, type Plan } from "./types";

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
    correction: plan.opening.correction ?? 0,
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

/**
 * Met la projection figée sur la même base de solde que le plan affiché : si la
 * correction de solde a changé depuis le gel (écart fixe activé ou désactivé),
 * les soldes figés sont décalés d'autant. Les flux figés ne changent pas.
 */
export function alignBaseline(baseline: Baseline | null, plan: Plan | undefined): Baseline | null {
  if (!baseline || !plan || plan.opening?.correction === undefined) return baseline;
  const frozenWith = baseline.correction ?? BANK_GAP[baseline.storeId] ?? 0;
  const delta = Math.round((plan.opening.correction - frozenWith) * 100) / 100;
  if (delta === 0) return baseline;
  const shift = (v: number) => Math.round((v + delta) * 100) / 100;
  return {
    ...baseline,
    days: baseline.days.map((d) => ({ ...d, solde: shift(d.solde) })),
    soldeFinMois: shift(baseline.soldeFinMois),
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
