import { NextResponse, type NextRequest } from "next/server";
import { getConfiguredStoreLinks } from "@/lib/apitic/mapping";
import { fetchCancelledSalesForDate } from "@/lib/apitic/endpoints";
import { currentBlackout } from "@/lib/apitic/http";

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
  apiticError?: number; // HTTP status returned by APITIC (e.g. 500)
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

  const blackout = currentBlackout();
  if (blackout) {
    return NextResponse.json({ blackout, stores: [] } satisfies MonitoringResponse);
  }

  const links = getConfiguredStoreLinks();
  const dates = datesInRange(from, to);

  // Probe one call first to detect APITIC 500 quickly before fetching all dates.
  if (dates.length > 0 && links.length > 0) {
    try {
      await fetchCancelledSalesForDate(links[0].accountId, dates[0]);
    } catch (e) {
      const err = e as { status?: number };
      const status = err.status ?? 0;
      if (status >= 500) {
        console.error(`[monitoring] APITIC ${status} on /cancelled — endpoint not available for account ${links[0].accountId}`);
        return NextResponse.json({ apiticError: status, stores: [] } satisfies MonitoringResponse);
      }
    }
  }

  const storeResults = await Promise.all(
    links.map(async (link) => {
      try {
        const daily = await fetchStoreCancelled(link.accountId, dates);
        return { id: link.storeId, daily };
      } catch {
        return { id: link.storeId, daily: [] };
      }
    }),
  );

  return NextResponse.json({ stores: storeResults } satisfies MonitoringResponse);
}
