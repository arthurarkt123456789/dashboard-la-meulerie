import { NextResponse, type NextRequest } from "next/server";
import { aggregateStore } from "@/lib/apitic/aggregator";
import { getConfiguredStoreLinks } from "@/lib/apitic/mapping";
import { checkAdmin } from "@/lib/admin-auth";

// Warms the APITIC cache for one store at a time. Designed to be invoked
// once per store after a fresh deploy, e.g.:
//
//   for s in davso endoume malmousque republique; do
//     curl -fsS "$URL/api/admin/bootstrap?storeId=$s&token=$TOKEN"
//   done
//
// Each call iterates through APITIC_HISTORY_DAYS days of sales (cached after
// the first fetch). Subsequent invocations are fast no-ops.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Railway tolerates this on PRO; on Hobby it caps lower.

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (process.env.APITIC_ENABLED !== "true") {
    return NextResponse.json(
      { error: "APITIC_ENABLED is not true." },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const start = Date.now();

  try {
    if (storeId) {
      const data = await aggregateStore(storeId);
      if (!data) {
        return NextResponse.json(
          { error: `Unknown or unmapped storeId: ${storeId}` },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        storeId,
        days: data.daily.length,
        elapsedMs: Date.now() - start,
      });
    }

    // No storeId → list configured stores so the caller can iterate.
    const links = getConfiguredStoreLinks();
    return NextResponse.json({
      stores: links.map((l) => l.storeId),
      hint:
        "Call this endpoint with ?storeId=<id> for each store to warm its cache.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, name: err instanceof Error ? err.name : undefined },
      { status: 500 },
    );
  }
}
