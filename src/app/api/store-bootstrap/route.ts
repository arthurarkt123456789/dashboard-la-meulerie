import { NextResponse, type NextRequest } from "next/server";
import { warmStore } from "@/lib/apitic/aggregator";

// Warms one date-range chunk for a given store.
// Protected by the dashboard session cookie (enforced by middleware).
//
// GET /api/store-bootstrap?storeId=republique&from=2023-01-01&to=2023-01-10

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (process.env.APITIC_ENABLED !== "true") {
    return NextResponse.json({ error: "APITIC_ENABLED is not true." }, { status: 400 });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!storeId || !from || !to) {
    return NextResponse.json({ error: "storeId, from, to required" }, { status: 400 });
  }

  const start = Date.now();
  try {
    const result = await warmStore(storeId, from, to);
    return NextResponse.json({ ...result, elapsedMs: Date.now() - start });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
