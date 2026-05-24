import { NextResponse, type NextRequest } from "next/server";
import { getFinancialData, periodToFinancialRange } from "@/lib/pennylane/client";

// GET /api/financial?storeId=davso&kind=month&year=2026&month=4
// GET /api/financial?storeId=davso&kind=preset&key=30d
// GET /api/financial?storeId=davso&kind=range&from=2026-01-01&to=2026-03-31
//
// Protected by session cookie (middleware handles it).
// The CA for the period is passed by the client (already computed from APITIC data).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const caParam = url.searchParams.get("ca"); // € TTC for the period

  if (!storeId) {
    return NextResponse.json({ error: "storeId required" }, { status: 400 });
  }

  const period = {
    kind: url.searchParams.get("kind") ?? "preset",
    key: url.searchParams.get("key") ?? undefined,
    year: url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined,
    month: url.searchParams.get("month") ? Number(url.searchParams.get("month")) : undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  const { start, end, label, fallback } = periodToFinancialRange(period);
  const ca = caParam ? parseFloat(caParam) : 0;

  try {
    const data = await getFinancialData(storeId, ca, start, end);
    return NextResponse.json(
      { ...data, periodLabel: label, fallback },
      { headers: { "Cache-Control": "private, max-age=300" } }, // cache 5min, data is monthly
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
