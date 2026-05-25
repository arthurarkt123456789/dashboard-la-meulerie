import { NextResponse, type NextRequest } from "next/server";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { apiticFetch } from "@/lib/apitic/http";
import { checkAdmin } from "@/lib/admin-auth";

// GET /api/admin/sale-types?storeId=davso&date=2026-05-20&token=<ADMIN_TOKEN>
//
// Probes a wide range of APITIC endpoint patterns to discover where
// cancelled tickets (notes annulées) and product losses (pertes) live.
// Returns raw keys + sample for every endpoint that returns 200.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function probe(
  path: string,
): Promise<{ status: string; keys?: string[]; total?: number; sample?: unknown }> {
  try {
    const resp = (await apiticFetch(path, {
      ignoreBlackout: true,
      maxAttempts: 1,
    })) as Record<string, unknown>;

    const data: unknown[] =
      Array.isArray(resp.data) ? (resp.data as unknown[]) :
      Array.isArray(resp) ? (resp as unknown[]) :
      [];

    return {
      status: "200 ✓",
      keys: Object.keys(resp),
      total: typeof resp.total === "number" ? resp.total : data.length,
      sample: data[0] ?? null,
    };
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    const s = err.status ?? err.message ?? err.name ?? "error";
    return { status: String(s) };
  }
}

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

  const id = link.accountId;

  // Probe all plausible APITIC endpoint patterns in parallel.
  // Any that return 200 are candidates for cancelled tickets / losses.
  const candidates: Record<string, string> = {
    // Log / action tables (most likely)
    "logs_date":              `/accounts/${id}/logs/${date}`,
    "logs_root":              `/accounts/${id}/logs`,
    "actions_date":           `/accounts/${id}/actions/${date}`,
    "actions_root":           `/accounts/${id}/actions`,
    "activities_date":        `/accounts/${id}/activities/${date}`,
    "events_date":            `/accounts/${id}/events/${date}`,
    "audit_date":             `/accounts/${id}/audit/${date}`,

    // Cancelled / void variants
    "cancelled_sales_date":   `/accounts/${id}/cancelled-sales/${date}`,
    "cancelled_sales_root":   `/accounts/${id}/cancelled-sales`,
    "voided_date":            `/accounts/${id}/voided-sales/${date}`,
    "deleted_sales_date":     `/accounts/${id}/deleted-sales/${date}`,
    "refunds_date":           `/accounts/${id}/refunds/${date}`,
    "returns_date":           `/accounts/${id}/returns/${date}`,

    // Note / receipt oriented names (French POS vocab)
    "notes_date":             `/accounts/${id}/notes/${date}`,
    "notes_cancelled_date":   `/accounts/${id}/notes/cancelled/${date}`,
    "cancelled_notes_date":   `/accounts/${id}/cancelled-notes/${date}`,
    "receipts_date":          `/accounts/${id}/receipts/${date}`,
    "cancelled_receipts_date":`/accounts/${id}/cancelled-receipts/${date}`,

    // Losses / waste
    "losses_date":            `/accounts/${id}/losses/${date}`,
    "wastes_date":            `/accounts/${id}/wastes/${date}`,
    "pertes_date":            `/accounts/${id}/pertes/${date}`,

    // Generic sales with query param
    "sales_cancelled_param":  `/accounts/${id}/sales/${date}?type=cancelled`,
    "sales_voided_param":     `/accounts/${id}/sales/${date}?type=voided`,
    "sales_all_types":        `/accounts/${id}/sales/${date}?include_cancelled=true`,
  };

  // Run probes with a small concurrency to avoid hammering APITIC
  const results: Record<string, ReturnType<typeof probe> extends Promise<infer T> ? T : never> = {};
  const entries = Object.entries(candidates);
  const BATCH = 4;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const settled = await Promise.all(batch.map(([, path]) => probe(path)));
    batch.forEach(([key], j) => {
      results[key] = settled[j];
    });
  }

  // Separate hits from misses for readability
  const hits = Object.entries(results).filter(([, v]) => v.status.startsWith("200"));
  const misses = Object.entries(results).filter(([, v]) => !v.status.startsWith("200"));

  return NextResponse.json({
    storeId,
    accountId: id,
    date,
    summary: `${hits.length} hit(s) / ${misses.length} miss(es)`,
    hits: Object.fromEntries(hits),
    misses: Object.fromEntries(misses.map(([k, v]) => [k, v.status])),
  });
}
