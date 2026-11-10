import { NextResponse, type NextRequest } from "next/server";
import { runTresorier } from "@/lib/previsionnel/agent";
import { buildStorePlan, loadStoreContext, todayParis } from "@/lib/previsionnel/data";
import { ensureBaseline, getBaseline, getStoredPlan, storePlan } from "@/lib/previsionnel/snapshot";
import { noStore, parseMonth, parseStore } from "./_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * GET /api/previsionnel?store=davso&month=2026-11
 *   → recalcule le plan (agent sans veille presse), l'enregistre et le renvoie.
 * GET …&cached=1
 *   → renvoie le dernier plan enregistré sans aucun calcul (404 s'il n'y en a pas).
 * GET …&refreeze=1
 *   → recalcule et remplace la projection figée par le plan du moment.
 * Toutes les réponses portent `baseline` (projection figée) et `savedAt`.
 */
export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const month = parseMonth(req, todayParis());
  if (month instanceof NextResponse) return month;
  const params = req.nextUrl.searchParams;
  const force = params.get("force") === "1";
  const refreeze = params.get("refreeze") === "1";
  try {
    if (params.get("cached") === "1") {
      const stored = await getStoredPlan<Record<string, unknown>>(storeId, month);
      if (!stored) return noStore({ error: "Aucun plan enregistré pour ce mois." }, 404);
      const baseline = await getBaseline(storeId, month);
      return noStore({ ...stored.payload, baseline, savedAt: stored.savedAt });
    }
    const ctx = await loadStoreContext(storeId, month, { force });
    const briefing = await runTresorier(ctx, { scout: false });
    const plan = await buildStorePlan(ctx);
    const payload = { plan, briefing, pendingDoubts: briefing.questions.length, events: ctx.events, txCount: ctx.rawTxCount };
    // L'enregistrement ne doit jamais faire échouer l'affichage du plan.
    let baseline = null;
    let savedAt = new Date().toISOString();
    try {
      baseline = await ensureBaseline(plan, refreeze);
      savedAt = await storePlan(storeId, month, payload);
    } catch (err) {
      console.error(`[previsionnel] snapshot ${storeId}/${month}:`, (err as Error).message);
    }
    return noStore({ ...payload, baseline, savedAt });
  } catch (err) {
    console.error(`[previsionnel] ${storeId}/${month}:`, (err as Error).message);
    return noStore({ error: (err as Error).message }, 500);
  }
}
