import { NextResponse, type NextRequest } from "next/server";
import { fetchSalesForDate } from "@/lib/apitic/endpoints";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { apiticFetch } from "@/lib/apitic/http";
import { checkAdmin } from "@/lib/admin-auth";

// GET /api/admin/sale-types?storeId=davso&date=2026-05-01&token=<ADMIN_TOKEN>
//
// Diagnostic: fetches all sales for one date and returns:
//   - breakdown of unique sale_type values with counts + € totals
//   - sample record per sale_type
//   - also probes potential "cancelled tickets" endpoints
//
// Used to discover how APITIC flags annulations and pertes.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ApiticSaleRaw = {
  id: number;
  sale_type: string;
  lines?: { line_type?: string; ati_price?: number; quantity?: number; product_id?: number }[];
  payments?: { amount?: number; payment_mean?: { name?: string } }[];
};

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "davso";
  const date = url.searchParams.get("date") ?? new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);

  const link = getLinkByStoreId(storeId);
  if (!link) {
    return NextResponse.json({ error: `Unknown storeId: ${storeId}` }, { status: 404 });
  }

  // 1. Fetch all sales for the date
  const sales = (await fetchSalesForDate(link.accountId, date)) as ApiticSaleRaw[];

  // 2. Group by sale_type
  const byType: Record<string, { count: number; totalTTC: number; sample: ApiticSaleRaw }> = {};
  for (const sale of sales) {
    const t = sale.sale_type ?? "(null)";
    if (!byType[t]) byType[t] = { count: 0, totalTTC: 0, sample: sale };
    byType[t].count++;
    const ttc = (sale.lines ?? []).reduce((s, l) => s + (l.ati_price ?? 0), 0);
    byType[t].totalTTC += ttc;
  }

  // 3. Probe potential "cancelled tickets" endpoints (APITIC doesn't document these
  //    publicly — try common patterns and report what comes back)
  const candidateEndpoints = [
    `/accounts/${link.accountId}/cancelled-sales/${date}`,
    `/accounts/${link.accountId}/sales/${date}/cancelled`,
    `/accounts/${link.accountId}/logs/${date}`,
    `/accounts/${link.accountId}/voids/${date}`,
  ];
  const probeResults: Record<string, { status: string; keys?: string[]; count?: number }> = {};

  for (const ep of candidateEndpoints) {
    try {
      const resp = await apiticFetch(ep, { ignoreBlackout: true }) as Record<string, unknown>;
      const data = Array.isArray(resp.data) ? resp.data : Array.isArray(resp) ? resp : null;
      probeResults[ep] = {
        status: "200",
        keys: Object.keys(resp),
        count: data?.length ?? undefined,
      };
    } catch (e) {
      const err = e as { status?: number; message?: string };
      probeResults[ep] = { status: String(err.status ?? err.message ?? "error") };
    }
  }

  return NextResponse.json({
    storeId,
    date,
    totalSales: sales.length,
    // Breakdown per sale_type — this is the key diagnostic
    saleTypes: Object.entries(byType).map(([type, v]) => ({
      sale_type: type,
      count: v.count,
      totalTTC: Math.round(v.totalTTC * 100) / 100,
      sample: {
        id: v.sample.id,
        sale_type: v.sample.sale_type,
        lineCount: v.sample.lines?.length ?? 0,
        paymentMethods: (v.sample.payments ?? []).map(p => p.payment_mean?.name ?? "?"),
        firstLine: v.sample.lines?.[0] ?? null,
      },
    })),
    // Probe results for potential cancelled-ticket endpoints
    cancelledEndpointProbes: probeResults,
  });
}
