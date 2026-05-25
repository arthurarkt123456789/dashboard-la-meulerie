import { NextResponse, type NextRequest } from "next/server";
import { getLinkByStoreId } from "@/lib/apitic/mapping";
import { apiticFetch } from "@/lib/apitic/http";
import { checkAdmin } from "@/lib/admin-auth";

// GET /api/admin/cancelled-probe?storeId=davso&date=2026-05-20&token=<ADMIN_TOKEN>
//
// Returns the RAW APITIC response for the cancelled endpoint so we can inspect
// the exact JSON structure (total, data fields, cancelled_lines, etc.)

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "davso";
  const date = url.searchParams.get("date") ?? new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);

  const link = getLinkByStoreId(storeId);
  if (!link) return NextResponse.json({ error: `Unknown storeId: ${storeId}` }, { status: 404 });

  const path = `/accounts/${link.accountId}/sales/${date}/cancelled?page=1&size=50`;

  try {
    const raw = await apiticFetch(path, { ignoreBlackout: true, maxAttempts: 1 });
    const typed = raw as Record<string, unknown>;
    const data = Array.isArray(typed.data) ? (typed.data as unknown[]) : [];
    return NextResponse.json({
      storeId,
      date,
      path,
      topLevelKeys: Object.keys(typed),
      total: typed.total,
      dataLength: data.length,
      firstItem: data[0] ?? null,
      // Show all items if few (to see full structure)
      allItems: data.length <= 5 ? data : data.slice(0, 3),
      raw: typed,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    return NextResponse.json({
      storeId,
      date,
      path,
      error: err.message ?? err.name,
      status: err.status,
    }, { status: 200 }); // 200 so the body is always readable
  }
}
