import { NextResponse } from "next/server";
import { getAllStoreData } from "@/lib/apitic/client";

// Cache: 60s for live data freshness. Today's row is partial and recomputed
// each call (mock is deterministic; real APITIC adapter will re-fetch).
export const revalidate = 60;

export async function GET() {
  const data = await getAllStoreData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
