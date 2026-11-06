import { NextResponse, type NextRequest } from "next/server";

export const STORE_IDS = ["davso", "malmousque", "republique", "endoume"] as const;

export function parseStore(req: NextRequest): string | NextResponse {
  const storeId = req.nextUrl.searchParams.get("store") ?? "davso";
  if (!(STORE_IDS as readonly string[]).includes(storeId)) {
    return NextResponse.json({ error: `Magasin inconnu : ${storeId}` }, { status: 400 });
  }
  return storeId;
}

export function parseMonth(req: NextRequest, today: string): string | NextResponse {
  const m = req.nextUrl.searchParams.get("month") ?? today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return NextResponse.json({ error: `Mois invalide : ${m}` }, { status: 400 });
  return m;
}

export function noStore<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
