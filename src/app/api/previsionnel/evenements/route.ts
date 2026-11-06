import { NextResponse, type NextRequest } from "next/server";
import { addEvent, deleteEvent, getEvents, updateEvent } from "@/lib/previsionnel/db";
import { noStore, parseStore } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  try {
    return noStore({ events: await getEvents(storeId) });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

/** POST body: { date, label, impact, scope?: "store"|"all" } */
export async function POST(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return noStore({ error: "JSON invalide" }, 400);
  }
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) return noStore({ error: "date invalide (YYYY-MM-DD)" }, 400);
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : "Manifestation";
  const impactRaw = Number(body.impact);
  const impact = Number.isFinite(impactRaw) ? Math.max(-1, Math.min(1, impactRaw)) : -0.3;
  const scope = body.scope === "all" ? "all" : storeId;
  try {
    const ev = await addEvent(scope, { date, label, impact });
    return noStore({ ok: true, event: ev });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

/** PATCH body: { id, impact?, label?, date? } */
export async function PATCH(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return noStore({ error: "JSON invalide" }, 400);
  }
  const id = Number(body.id);
  if (!Number.isFinite(id)) return noStore({ error: "id invalide" }, 400);
  const patch: { impact?: number; label?: string; date?: string } = {};
  if (body.impact !== undefined) {
    const v = Number(body.impact);
    if (Number.isFinite(v)) patch.impact = Math.max(-1, Math.min(1, v));
  }
  if (typeof body.label === "string") patch.label = body.label.trim().slice(0, 80);
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date;
  try {
    await updateEvent(storeId, id, patch);
    return noStore({ ok: true });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) return noStore({ error: "id invalide" }, 400);
  try {
    await deleteEvent(storeId, id);
    return noStore({ ok: true });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}
