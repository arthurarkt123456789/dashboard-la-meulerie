import { NextResponse, type NextRequest } from "next/server";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { apiticFetch } from "@/lib/apitic/http";
import { checkAdmin } from "@/lib/admin-auth";

// GET /api/admin/sale-types?storeId=davso&date=2026-05-20&token=<ADMIN_TOKEN>
//
// Round 2 — targets:
//   • /losses/{date} confirmed existing (503 last time = transient server error)
//   • New cancelled-ticket path variants not yet tried

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function probe(
  path: string,
): Promise<{ status: string; keys?: string[]; total?: number; sample?: unknown }> {
  try {
    const resp = (await apiticFetch(path, {
      ignoreBlackout: true,
      maxAttempts: 2, // retry once on transient errors
    })) as Record<string, unknown>;

    const data: unknown[] =
      Array.isArray(resp.data) ? (resp.data as unknown[]) :
      Array.isArray(resp)       ? (resp as unknown[])      : [];

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
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "davso";
  const date    = url.searchParams.get("date") ?? new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);

  const link = getLinkByStoreId(storeId);
  if (!link) return NextResponse.json({ error: `Unknown storeId: ${storeId}` }, { status: 404 });

  const id = link.accountId;

  const candidates: Record<string, string> = {
    // ── Losses (confirmed existing via 503 last probe) ────────────────────
    "losses_date":              `/accounts/${id}/losses/${date}`,
    "losses_root":              `/accounts/${id}/losses`,
    "losses_date_p1":           `/accounts/${id}/losses/${date}?page=1&size=20`,

    // ── Cancelled tickets — new variants not tried before ─────────────────
    // underscore instead of hyphen
    "cancelled_sales_us":       `/accounts/${id}/cancelled_sales/${date}`,
    "cancelled_notes_us":       `/accounts/${id}/cancelled_notes/${date}`,
    // reversed path order
    "sales_slash_cancelled":    `/accounts/${id}/sales/cancelled/${date}`,
    // different resource names
    "tickets_cancelled":        `/accounts/${id}/tickets/cancelled/${date}`,
    "tickets_date":             `/accounts/${id}/tickets/${date}`,
    "orders_date":              `/accounts/${id}/orders/${date}`,
    "orders_cancelled":         `/accounts/${id}/orders/cancelled/${date}`,
    // APITIC sometimes uses "note" as the resource
    "note_date":                `/accounts/${id}/note/${date}`,
    "notes_annulees":           `/accounts/${id}/notes-annulees/${date}`,
    // top-level (no account id)
    "top_logs_date":            `/logs/${date}`,
    "top_cancelled_date":       `/cancelled-sales/${date}`,
    // with query params on the root sales endpoint
    "sales_status_cancelled":   `/accounts/${id}/sales/${date}?status=cancelled`,
    "sales_deleted":            `/accounts/${id}/sales/${date}?deleted=true`,
    "sales_page1_limit100":     `/accounts/${id}/sales/${date}?page=1&size=100`,
  };

  const entries = Object.entries(candidates);
  const BATCH = 4;
  const results: Record<string, Awaited<ReturnType<typeof probe>>> = {};
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const settled = await Promise.all(batch.map(([, path]) => probe(path)));
    batch.forEach(([key], j) => { results[key] = settled[j]; });
  }

  const hits   = Object.entries(results).filter(([, v]) => v.status.startsWith("200"));
  const errors = Object.entries(results).filter(([, v]) => !v.status.startsWith("200"));

  return NextResponse.json({
    storeId,
    accountId: id,
    date,
    summary: `${hits.length} hit(s) / ${errors.length} miss(es)`,
    // Full detail for hits — keys + total count + first record
    hits: Object.fromEntries(hits),
    // For misses just the status code
    misses: Object.fromEntries(errors.map(([k, v]) => [k, v.status])),
  });
}
