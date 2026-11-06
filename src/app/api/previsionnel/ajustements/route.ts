import { NextResponse, type NextRequest } from "next/server";
import { addAdjustment, deleteAdjustment, getAdjustments } from "@/lib/previsionnel/db";
import { noStore, parseStore } from "../_shared";
import type { RuleKind } from "@/lib/previsionnel/types";

export const dynamic = "force-dynamic";

const KINDS: RuleKind[] = ["matiere", "fixe", "hors_exploitation", "variable", "ignorer"];

export async function GET(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  try {
    return noStore({ adjustments: await getAdjustments(storeId) });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

export async function POST(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  let body: unknown;
  try { body = await req.json(); } catch { return noStore({ error: "JSON invalide" }, 400); }
  const b = body as Record<string, unknown>;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return noStore({ error: "date invalide" }, 400);
  if (typeof b.label !== "string" || !b.label.trim()) return noStore({ error: "libellé manquant" }, 400);
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return noStore({ error: "montant invalide (positif requis)" }, 400);
  if (!KINDS.includes(b.kind as RuleKind)) return noStore({ error: "nature invalide" }, 400);
  try {
    const adj = await addAdjustment(storeId, { date: b.date, label: b.label.trim(), amount, kind: b.kind as RuleKind });
    return noStore({ adjustment: adj });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return noStore({ error: "id invalide" }, 400);
  try {
    await deleteAdjustment(storeId, id);
    return noStore({ ok: true });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}
