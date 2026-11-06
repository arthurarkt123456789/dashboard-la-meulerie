import { NextResponse, type NextRequest } from "next/server";
import { deleteRule, getRules } from "@/lib/previsionnel/db";
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

/** DELETE /api/previsionnel/regles?store=davso&key=... → la contrepartie redevient un doute. */
export async function DELETE(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return noStore({ error: "key manquante" }, 400);
  try {
    await deleteRule(storeId, key);
    return noStore({ ok: true });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}
