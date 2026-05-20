import { NextResponse, type NextRequest } from "next/server";
import { warmStore } from "@/lib/apitic/aggregator";
import { getConfiguredStoreLinks } from "@/lib/apitic/mapping";
import { checkAdmin } from "@/lib/admin-auth";

// Warms the APITIC sales cache for one store + one date range at a time.
//
//   GET /api/admin/bootstrap                                   → list configured stores
//   GET /api/admin/bootstrap?storeId=davso&from=2025-01-01&to=2025-01-30
//
// Without from/to it defaults to the last 30 days. The bootstrap script in
// /scripts iterates the full history in chunks.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function subtractDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayInParis(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

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

  if (!storeId) {
    const links = getConfiguredStoreLinks();
    return NextResponse.json({
      stores: links.map((l) => l.storeId),
      hint:
        "Call ?storeId=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD to warm a date range.",
    });
  }

  const today = todayInParis();
  const to = url.searchParams.get("to") || today;
  const from = url.searchParams.get("from") || subtractDays(to, 29);

  const start = Date.now();
  try {
    const result = await warmStore(storeId, from, to);
    return NextResponse.json({
      ...result,
      elapsedMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, name: err instanceof Error ? err.name : undefined },
      { status: 500 },
    );
  }
}
