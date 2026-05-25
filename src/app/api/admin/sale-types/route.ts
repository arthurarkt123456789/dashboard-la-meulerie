import { NextResponse, type NextRequest } from "next/server";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { apiticFetch } from "@/lib/apitic/http";
import { checkAdmin } from "@/lib/admin-auth";

// GET /api/admin/sale-types?storeId=davso&date=2026-05-20&token=<ADMIN_TOKEN>
//
// Targeted probe now that we know the cancelled sales endpoint.
// Also probes loss variants derived from the same URL pattern.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function probe(
  path: string,
): Promise<{ status: string; keys?: string[]; total?: number; sample?: unknown }> {
  try {
    const resp = (await apiticFetch(path, { ignoreBlackout: true, maxAttempts: 2 })) as Record<string, unknown>;
    const data: unknown[] =
      Array.isArray(resp.data) ? (resp.data as unknown[]) :
      Array.isArray(resp)      ? (resp as unknown[])      : [];
    return {
      status: "200 ✓",
      keys: Object.keys(resp),
      total: typeof resp.total === "number" ? resp.total : data.length,
      sample: data[0] ?? null,
    };
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    return { status: String(err.status ?? err.message ?? err.name ?? "error") };
  }
}

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url    = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "davso";
  const date    = url.searchParams.get("date") ?? new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);

  const link = getLinkByStoreId(storeId);
  if (!link) return NextResponse.json({ error: `Unknown storeId: ${storeId}` }, { status: 404 });

  const id = link.accountId;

  const candidates: Record<string, string> = {
    // ── Confirmed pattern from APITIC docs ────────────────────────────────
    "cancelled_sales":       `/accounts/${id}/sales/${date}/cancelled`,
    "cancelled_sales_p1":    `/accounts/${id}/sales/${date}/cancelled?page=1&size=50`,

    // ── Loss variants derived from the same pattern ───────────────────────
    "losses_same_pattern":   `/accounts/${id}/sales/${date}/losses`,
    "losses_same_pattern2":  `/accounts/${id}/sales/${date}/loss`,
    "wastes_same_pattern":   `/accounts/${id}/sales/${date}/wastes`,
    "pertes_same_pattern":   `/accounts/${id}/sales/${date}/pertes`,
    "voids_same_pattern":    `/accounts/${id}/sales/${date}/voided`,
    "refunds_same_pattern":  `/accounts/${id}/sales/${date}/refunds`,
  };

  const entries = Object.entries(candidates);
  const results: Record<string, Awaited<ReturnType<typeof probe>>> = {};
  const settled = await Promise.all(entries.map(([, path]) => probe(path)));
  entries.forEach(([key], i) => { results[key] = settled[i]; });

  const hits   = Object.entries(results).filter(([, v]) => v.status.startsWith("200"));
  const misses = Object.entries(results).filter(([, v]) => !v.status.startsWith("200"));

  return NextResponse.json({
    storeId,
    date,
    summary: `${hits.length} hit(s) / ${misses.length} miss(es)`,
    hits:   Object.fromEntries(hits),
    misses: Object.fromEntries(misses.map(([k, v]) => [k, v.status])),
  });
}
