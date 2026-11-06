import { NextResponse, type NextRequest } from "next/server";
import { buildDoubts, loadStoreContext, todayParis } from "@/lib/previsionnel/data";
import { noStore, parseMonth, parseStore } from "../_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/previsionnel/doutes?store=davso → contreparties à classer + contexte. */
export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const month = parseMonth(req, todayParis());
  if (month instanceof NextResponse) return month;
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const ctx = await loadStoreContext(storeId, month, { force });
    const doubts = buildDoubts(ctx);
    return noStore({
      storeId,
      month,
      today: ctx.today,
      doubts,
      rulesCount: ctx.rules.length,
      events: ctx.events,
      settings: ctx.settings,
      bankSynced: ctx.openingBalance !== null,
      openingBalance: ctx.openingBalance,
      balanceAsOf: ctx.balanceAsOf,
      txCount: ctx.rawTxCount,
      txError: ctx.txError,
      dailyError: ctx.dailyError,
      dailyDays: ctx.daily.length,
    });
  } catch (err) {
    console.error(`[previsionnel/doutes] ${storeId}:`, (err as Error).message);
    return noStore({ error: (err as Error).message }, 500);
  }
}
