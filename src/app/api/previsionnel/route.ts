import { NextResponse, type NextRequest } from "next/server";
import { runTresorier } from "@/lib/previsionnel/agent";
import { buildStorePlan, loadStoreContext, todayParis } from "@/lib/previsionnel/data";
import { noStore, parseMonth, parseStore } from "./_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** GET /api/previsionnel?store=davso&month=2026-11 → plan complet, après passage de l'agent (sans veille presse). */
export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const month = parseMonth(req, todayParis());
  if (month instanceof NextResponse) return month;
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const ctx = await loadStoreContext(storeId, month, { force });
    const briefing = await runTresorier(ctx, { scout: false });
    const plan = await buildStorePlan(ctx);
    return noStore({ plan, briefing, pendingDoubts: briefing.questions.length, events: ctx.events, txCount: ctx.rawTxCount });
  } catch (err) {
    console.error(`[previsionnel] ${storeId}/${month}:`, (err as Error).message);
    return noStore({ error: (err as Error).message }, 500);
  }
}
