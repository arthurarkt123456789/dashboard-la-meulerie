import { NextResponse, type NextRequest } from "next/server";
import {
  getPennylaneConfig,
  fetchMonthlyProInvoices,
  getPastMonths,
} from "@/lib/pennylane/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALL_STORES = ["davso", "endoume", "malmousque", "republique"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const n = Math.min(Number(url.searchParams.get("months") ?? "24"), 36);

  if (!storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });

  const periods = getPastMonths(n);
  const fromDate = periods[0].start;
  const toDate = periods[periods.length - 1].end;

  const storeIds = storeId === "all" ? ALL_STORES : [storeId];
  const byMonth = new Map<string, { amountTTC: number; amountHT: number }>();

  await Promise.all(
    storeIds.map(async (id) => {
      const config = getPennylaneConfig(id);
      if (!config) return;
      try {
        const invoices = await fetchMonthlyProInvoices(config.token, fromDate, toDate);
        for (const inv of invoices) {
          const existing = byMonth.get(inv.month) ?? { amountTTC: 0, amountHT: 0 };
          byMonth.set(inv.month, {
            amountTTC: existing.amountTTC + inv.amountTTC,
            amountHT: existing.amountHT + inv.amountHT,
          });
        }
      } catch (err) {
        console.error(`[pro-invoices] ${id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );

  const months = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amounts]) => ({ month, ...amounts }));

  return NextResponse.json(
    { months },
    { headers: { "Cache-Control": "max-age=300" } },
  );
}
