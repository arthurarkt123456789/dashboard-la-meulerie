import { NextResponse, type NextRequest } from "next/server";
import { getConfiguredStoreLinks } from "@/lib/apitic/mapping";
import { fetchCancelledSalesForDate } from "@/lib/apitic/endpoints";
import { currentBlackout, apiticFetch } from "@/lib/apitic/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_DAYS = 60;
const CONCURRENCY = 3;

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end && dates.length < MAX_DAYS) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export type MonitoringDayStat = {
  date: string;
  cancelledTx: number;
  cancelledAmount: number;
  cancelledLines: number;
};

export type MonitoringResponse = {
  blackout?: string;
  stores: { id: string; daily: MonitoringDayStat[] }[];
};

async function fetchStoreCancelled(
  accountId: string,
  dates: string[],
): Promise<MonitoringDayStat[]> {
  const results: MonitoringDayStat[] = [];
  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const batch = dates.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (date) => {
        const stat = await fetchCancelledSalesForDate(accountId, date);
        return { date, ...stat };
      }),
    );
    results.push(...settled);
  }
  return results;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to required" }, { status: 400 });
  }

  // ?debug=1&storeId=davso — returns the raw APITIC JSON for one date so we
  // can inspect the exact response structure without needing admin auth.
  if (url.searchParams.get("debug") === "1") {
    const storeId = url.searchParams.get("storeId") ?? "davso";
    const links = getConfiguredStoreLinks();
    const link = links.find((l) => l.storeId === storeId);
    if (!link) return NextResponse.json({ error: `Unknown storeId: ${storeId}`, configured: links.map(l => l.storeId) });
    const date = from; // just one date
    const path = `/accounts/${link.accountId}/sales/${date}/cancelled?page=1&size=50`;
    try {
      const raw = await apiticFetch(path, { ignoreBlackout: true, maxAttempts: 1 });
      return NextResponse.json({ debug: true, storeId, date, path, raw });
    } catch (e) {
      const err = e as { status?: number; message?: string; name?: string };
      return NextResponse.json({ debug: true, storeId, date, path, error: err.message ?? err.name, status: err.status });
    }
  }

  // APITIC blocks cancelled-sales endpoint during service hours server-side.
  // Rather than hammering it and getting 503s, bail early with a signal the
  // client can use to show a meaningful message.
  const blackout = currentBlackout();
  if (blackout) {
    console.log(`[monitoring] blackout window ${blackout}, skipping fetch`);
    return NextResponse.json({ blackout, stores: [] } satisfies MonitoringResponse);
  }

  const links = getConfiguredStoreLinks();
  const dates = datesInRange(from, to);
  console.log(`[monitoring] fetching ${dates.length} dates × ${links.length} stores (${from} → ${to})`);

  const storeResults = await Promise.all(
    links.map(async (link) => {
      const daily = await fetchStoreCancelled(link.accountId, dates);
      return { id: link.storeId, daily };
    }),
  );

  const totalCancelled = storeResults.reduce(
    (s, st) => s + st.daily.reduce((ss, d) => ss + d.cancelledTx, 0),
    0,
  );
  console.log(`[monitoring] done — total cancelledTx across all stores/dates: ${totalCancelled}`);

  return NextResponse.json({ stores: storeResults } satisfies MonitoringResponse);
}
