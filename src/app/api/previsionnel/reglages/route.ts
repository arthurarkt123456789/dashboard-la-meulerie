import { NextResponse, type NextRequest } from "next/server";
import { getSettings, sanitizeSettings, saveSettings } from "@/lib/previsionnel/db";
import { noStore, parseStore } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  try {
    return noStore({ settings: await getSettings(storeId) });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

/** PUT body: Settings partiel (fusionné avec l'existant). */
export async function PUT(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "JSON invalide" }, 400);
  }
  try {
    const current = await getSettings(storeId);
    const merged = sanitizeSettings({ ...current, ...(body as object) });
    await saveSettings(storeId, merged);
    return noStore({ ok: true, settings: merged });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}
