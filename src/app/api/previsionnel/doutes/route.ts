import { NextResponse, type NextRequest } from "next/server";
import { runTresorier } from "@/lib/previsionnel/agent";
import { loadStoreContext, todayParis } from "@/lib/previsionnel/data";
import { noStore, parseMonth, parseStore } from "../_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** GET /api/previsionnel/doutes?store=davso → briefing de l'agent : décisions, questions, veille presse. */
export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const month = parseMonth(req, todayParis());
  if (month instanceof NextResponse) return month;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const scout = req.nextUrl.searchParams.get("scout") !== "0";
  try {
    const ctx = await loadStoreContext(storeId, month, { force });
    const briefing = await runTresorier(ctx, { scout });
    return noStore({
      ...briefing,
      settings: ctx.settings,
      bankSynced: ctx.openingBalance !== null,
      openingBalance: ctx.openingBalance,
      balanceAsOf: ctx.balanceAsOf,
      dailyDays: ctx.daily.length,
    });
  } catch (err) {
    console.error(`[previsionnel/doutes] ${storeId}:`, (err as Error).message);
    return noStore({ error: (err as Error).message }, 500);
  }
}
