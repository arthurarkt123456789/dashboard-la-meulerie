import { NextResponse, type NextRequest } from "next/server";
import { readSalesCacheBatch } from "@/lib/apitic/cache";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { fetchSalesForDate } from "@/lib/apitic/endpoints";
import { checkAdmin } from "@/lib/admin-auth";

// Diagnostic. Returns the first 2 cached sales for a (store, date) pair so we
// can inspect APITIC's actual payload shape. With ?fresh=1 it bypasses the
// cache and fetches live.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const date = url.searchParams.get("date");
  const fresh = url.searchParams.get("fresh") === "1";
  if (!storeId || !date) {
    return NextResponse.json(
      { error: "storeId and date params required" },
      { status: 400 },
    );
  }
  const link = getLinkByStoreId(storeId);
  if (!link) {
    return NextResponse.json(
      { error: `Unknown storeId: ${storeId}` },
      { status: 404 },
    );
  }

  try {
    let sales;
    if (fresh) {
      sales = await fetchSalesForDate(link.accountId, date);
    } else {
      const batch = await readSalesCacheBatch(link.accountId, [date]);
      sales = batch.get(date) ?? [];
    }
    return NextResponse.json({
      storeId,
      accountId: link.accountId,
      date,
      source: fresh ? "live" : "cache",
      totalSales: sales.length,
      firstKeys: sales[0] ? Object.keys(sales[0]) : null,
      sample: sales.slice(0, 2),
    });
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: { message?: string } };
    return NextResponse.json(
      { error: e?.message, name: e?.name, cause: e?.cause },
      { status: 500 },
    );
  }
}
