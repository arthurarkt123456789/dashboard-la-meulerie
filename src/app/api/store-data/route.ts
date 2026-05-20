import { NextResponse } from "next/server";
import { getAllStoreData } from "@/lib/apitic/client";

// Always server-rendered. Aggregation pulls live data from APITIC at runtime —
// pre-rendering this would attempt the same calls during the build and
// brick the deploy whenever APITIC is unreachable or in a blackout.
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getAllStoreData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
