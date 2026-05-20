import { NextResponse } from "next/server";
import { listStores } from "@/lib/apitic/client";

// Always server-rendered. Pre-rendering this would force an APITIC call at
// build time, which is brittle (blackouts, network) and pointless.
export const dynamic = "force-dynamic";

export async function GET() {
  const stores = await listStores();
  return NextResponse.json(stores, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
