import { NextResponse, type NextRequest } from "next/server";
import { warmStore } from "@/lib/apitic/aggregator";
import { getConfiguredStoreLinks } from "@/lib/apitic/mapping";

// Nightly cache warm-up — called by Railway Cron at 00:01 Paris time.
// Fetches the last DAYS_BACK days for every configured store so the
// dashboard never hits APITIC during blackout windows (noon, evening).
//
// Protected by CRON_SECRET (or falls back to ADMIN_TOKEN if not set).
// Railway Cron: GET https://<app>/api/cron/daily
//               Header: Authorization: Bearer <CRON_SECRET>

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 3; // yesterday + 2-day safety buffer for missed nights

function todayInParis(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function subtractDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_TOKEN;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.APITIC_ENABLED !== "true") {
    return NextResponse.json({ error: "APITIC_ENABLED is not true." }, { status: 400 });
  }

  const links = getConfiguredStoreLinks();
  if (links.length === 0) {
    return NextResponse.json({ error: "No stores configured." }, { status: 400 });
  }

  const today = todayInParis();
  const to = subtractDays(today, 1);   // yesterday (APITIC doesn't serve today)
  const from = subtractDays(today, DAYS_BACK);

  const started = Date.now();
  const results: Record<string, { fetched: number; skipped: number; failed: number }> = {};

  // Sequential per store — avoids hammering APITIC concurrently across accounts.
  for (const { storeId } of links) {
    try {
      const r = await warmStore(storeId, from, to);
      results[storeId] = { fetched: r.fetched, skipped: r.skipped, failed: r.failed };
    } catch (err) {
      results[storeId] = { fetched: 0, skipped: 0, failed: 1 };
      console.error(`[cron/daily] ${storeId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    ok: true,
    from,
    to,
    elapsedMs: Date.now() - started,
    results,
  });
}
