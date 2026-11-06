import { NextResponse, type NextRequest } from "next/server";
import { getRules, isRuleKind, upsertRules } from "@/lib/previsionnel/db";
import type { Rule } from "@/lib/previsionnel/types";
import { noStore, parseStore } from "../_shared";

export const dynamic = "force-dynamic";

/** POST /api/previsionnel/reponses?store=davso  body: { answers: [{ key, kind, label?, expectedAmount?, expectedDay? }] } */
export async function POST(req: NextRequest) {
  const storeId = parseStore(req);
  if (storeId instanceof NextResponse) return storeId;
  let body: { answers?: unknown };
  try {
    body = (await req.json()) as { answers?: unknown };
  } catch {
    return noStore({ error: "JSON invalide" }, 400);
  }
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const existing = new Map((await getRules(storeId).catch(() => [] as Rule[])).map((r) => [r.key, r]));
  const rules: Rule[] = [];
  for (const a of answers as Record<string, unknown>[]) {
    const key = typeof a.key === "string" ? a.key.trim() : "";
    const prev = existing.get(key);
    const kind = isRuleKind(a.kind) ? a.kind : prev?.kind;
    if (!key || !kind) continue;
    const recurrence = a.recurrence === "inclure" || a.recurrence === "exclure" || a.recurrence === "auto" ? a.recurrence : prev?.recurrence ?? "auto";
    const amount = a.expectedAmount === null || a.expectedAmount === undefined || a.expectedAmount === "" ? null : Number(a.expectedAmount);
    const day = a.expectedDay === null || a.expectedDay === undefined || a.expectedDay === "" ? null : Number(a.expectedDay);
    rules.push({
      key,
      kind,
      label: typeof a.label === "string" && a.label.trim() ? a.label.trim().slice(0, 80) : prev?.label ?? key,
      expectedAmount: amount !== null && Number.isFinite(amount) ? Math.abs(amount) : a.expectedAmount === undefined ? prev?.expectedAmount ?? null : null,
      expectedDay: day !== null && Number.isFinite(day) ? Math.min(31, Math.max(1, Math.round(day))) : a.expectedDay === undefined ? prev?.expectedDay ?? null : null,
      recurrence,
      accounts: prev?.accounts ?? [],
      source: "utilisateur",
      confidence: 1,
      reason: typeof a.reason === "string" ? a.reason.slice(0, 200) : prev?.reason ?? "Décision manuelle",
    });
  }
  try {
    await upsertRules(storeId, rules);
    return noStore({ ok: true, saved: rules.length });
  } catch (err) {
    return noStore({ error: (err as Error).message }, 500);
  }
}
