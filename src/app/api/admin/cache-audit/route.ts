import { NextResponse, type NextRequest } from "next/server";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { readSalesCacheBatch, listCachedDates } from "@/lib/apitic/cache";
import { apiticFetch } from "@/lib/apitic/http";
import { checkAdmin } from "@/lib/admin-auth";
import type { ApiticSalesResponse } from "@/lib/apitic/raw-types";

// GET /api/admin/cache-audit?storeId=malmousque&year=2026&month=7&probe=1&token=...
//
// Returns per-day transaction counts for a given month.
// With probe=1 also hits APITIC live to get page-1 `total` for each day.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function listMonthDates(year: number, month: number): string[] {
  const days: string[] = [];
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCMonth() === month - 1) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "malmousque";
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);
  const probe = url.searchParams.get("probe") === "1";

  const link = getLinkByStoreId(storeId);
  if (!link) return NextResponse.json({ error: `Unknown storeId: ${storeId}` }, { status: 404 });

  const accountId = link.accountId;
  const dates = listMonthDates(year, month);

  // 1. Check which dates are in cache
  const cached = await listCachedDates(accountId, dates);

  // 2. Read cached sales for all dates
  const salesMap = await readSalesCacheBatch(accountId, dates);

  type DayRow = {
    date: string;
    inCache: boolean;
    cacheTx: number;
    cacheTTC: number;
    // only present with probe=1
    apiTotal?: number;
    apiPage1Items?: number;
    apiTTC?: number;
    apiPages?: number;
  };

  const rows: DayRow[] = [];
  let totalCacheTx = 0;
  let totalCacheTTC = 0;

  for (const date of dates) {
    const sales = salesMap.get(date) ?? [];
    let ttc = 0;
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        if (line.line_type === "sale") ttc += line.ati_price;
      }
    }
    totalCacheTx += sales.length;
    totalCacheTTC += ttc;
    rows.push({
      date,
      inCache: cached.has(date),
      cacheTx: sales.length,
      cacheTTC: Math.round(ttc * 100) / 100,
    });
  }

  // 3. Optionally probe APITIC live to compare totals
  let rawResponseShape: Record<string, unknown> | undefined;
  if (probe && process.env.APITIC_ENABLED === "true") {
    for (const row of rows) {
      try {
        // Page 1 to read the `total` field
        const rawP1 = (await apiticFetch(
          `/accounts/${accountId}/sales/${row.date}?page=1&size=100`,
          { ignoreBlackout: true, maxAttempts: 2 },
        )) as Record<string, unknown>;

        // Capture raw response shape once (to verify field names)
        if (!rawResponseShape) {
          rawResponseShape = Object.fromEntries(
            Object.entries(rawP1).map(([k, v]) =>
              k === "data" ? [k, `Array(${Array.isArray(v) ? v.length : 0})`] : [k, v],
            ),
          );
        }

        const p1 = rawP1 as ApiticSalesResponse;
        const reportedTotal = p1.total;
        const page1Items = p1.data.length;

        // Walk all pages — use empty-page guard since total field may be unreliable
        let allSales = [...p1.data];
        let page = 2;
        const maxPages = Math.ceil(reportedTotal / 100) + 2; // extra buffer
        while (page <= Math.max(maxPages, 5)) {
          const rawPn = (await apiticFetch(
            `/accounts/${accountId}/sales/${row.date}?page=${page}&size=100`,
            { ignoreBlackout: true, maxAttempts: 2 },
          )) as Record<string, unknown>;
          const pn = rawPn as ApiticSalesResponse;
          if (pn.data.length === 0) break;
          allSales = allSales.concat(pn.data);
          page++;
          if (allSales.length >= reportedTotal && pn.data.length < 100) break;
        }

        let apiTTC = 0;
        for (const sale of allSales) {
          for (const line of sale.lines ?? []) {
            if (line.line_type === "sale") apiTTC += line.ati_price;
          }
        }

        row.apiTotal = reportedTotal;
        row.apiPage1Items = page1Items;
        row.apiTTC = Math.round(apiTTC * 100) / 100;
        row.apiPages = page - 1;
      } catch {
        row.apiTotal = -1; // error
      }
    }
  }

  const totalCacheTTCRounded = Math.round(totalCacheTTC * 100) / 100;
  const missingDates = rows.filter((r) => !r.inCache).map((r) => r.date);
  const zeroCacheDates = rows.filter((r) => r.inCache && r.cacheTx === 0).map((r) => r.date);

  let apiSummary: { totalTx: number; totalTTC: number } | undefined;
  if (probe) {
    const apiTx = rows.reduce((s, r) => s + (r.apiTotal ?? 0), 0);
    const apiTTC = rows.reduce((s, r) => s + (r.apiTTC ?? 0), 0);
    apiSummary = { totalTx: apiTx, totalTTC: Math.round(apiTTC * 100) / 100 };
  }

  return NextResponse.json({
    storeId,
    accountId,
    period: `${year}-${String(month).padStart(2, "0")}`,
    cacheSummary: {
      totalDays: dates.length,
      cachedDays: cached.size,
      missingFromCache: missingDates.length,
      missingDates,
      zeroCacheDays: zeroCacheDates.length,
      zeroCacheDates,
      totalTx: totalCacheTx,
      totalTTC: totalCacheTTCRounded,
    },
    ...(apiSummary ? { apiSummary } : {}),
    ...(rawResponseShape ? { rawResponseShape } : {}),
    days: rows,
  });
}
