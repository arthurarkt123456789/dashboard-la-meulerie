import { NextResponse, type NextRequest } from "next/server";
import { deleteAutoRules, deleteRule, getRules } from "@/lib/previsionnel/db";
import { noStore, parseStore } from "../_shared";

export const dynamic = "force-dynamic";

/** GET /api/previsionnel/regles?store=davso → toutes les règles. */
export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  try {
    return noStore({ rules: await getRules(storeId) });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

/** DELETE /api/previsionnel/regles?store=davso&key=... → la contrepartie est réévaluée au prochain passage.
 *  DELETE /api/previsionnel/regles?store=davso&scope=auto → efface toutes les règles automatiques (les tiennes restent). */
export async function DELETE(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  if (req.nextUrl.searchParams.get("scope") === "auto") {
    try {
      const n = await deleteAutoRules(storeId);
      return noStore({ ok: true, deleted: n });
    } catch (err) {
      return noStore({ error: (err as Error).message }, 500);
    }
  }
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return noStore({ error: "key manquante" }, 400);
  try {
    await deleteRule(storeId, key);
    return noStore({ ok: true });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}
