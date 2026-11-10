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

export function baselineFromPlan(plan: Plan): Baseline {
  return {
    storeId: plan.storeId,
    month: plan.month,
    frozenAt: new Date().toISOString(),
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
