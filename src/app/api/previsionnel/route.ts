import { NextResponse, type NextRequest } from "next/server";
import { buildDoubts, buildStorePlan, loadStoreContext, todayParis } from "@/lib/previsionnel/data";
import { noStore, parseMonth, parseStore } from "./_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/previsionnel?store=davso&month=2026-11 → plan complet. */
export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const month = parseMonth(req, todayParis());
  if (month instanceof NextResponse) return month;
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const ctx = await loadStoreContext(storeId, month, { force });
    const plan = await buildStorePlan(ctx);
    const doubts = buildDoubts(ctx);
    return noStore({ plan, pendingDoubts: doubts.length, events: ctx.events, txCount: ctx.rawTxCount });
  } catch (err) {
    console.error(`[previsionnel] ${storeId}/${month}:`, (err as Error).message);
    return noStore({ error: (err as Error).message }, 500);
  }
}
