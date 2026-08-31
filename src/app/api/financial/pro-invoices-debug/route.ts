import { NextResponse, type NextRequest } from "next/server";
import { getPennylaneConfig } from "@/lib/pennylane/client";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const storeId = url.searchParams.get("storeId") ?? "davso";
    const token = url.searchParams.get("token") ?? process.env.ADMIN_TOKEN;

    if (!token || token !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const config = getPennylaneConfig(storeId);
    if (!config) return NextResponse.json({ error: `No Pennylane config for ${storeId}` }, { status: 404 });

    const params = new URLSearchParams();
    params.set("min_date", "2024-10-01");
    params.set("max_date", "2026-09-30");
    params.append("status[]", "paid");
    params.append("status[]", "unpaid");
    params.append("status[]", "late");
    params.set("page[per_page]", "10");

    const res = await fetch(
      `https://app.pennylane.com/api/external/v2/customer_invoices?${params}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(15000),
      },
    );

    const status = res.status;
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }

    // Extract key info from first item to see field names
    const items = (json as Record<string, unknown>)?.items as unknown[] | undefined;
    const firstItem = items?.[0] as Record<string, unknown> | undefined;

    return NextResponse.json({
      status,
      storeId,
      itemCount: items?.length ?? 0,
      topKeys: json && typeof json === "object" ? Object.keys(json as object) : [],
      firstItemKeys: firstItem ? Object.keys(firstItem) : [],
      firstItem,
      raw: items?.slice(0, 3),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
