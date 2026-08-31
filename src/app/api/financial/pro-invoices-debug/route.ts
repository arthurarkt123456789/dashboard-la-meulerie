import { NextResponse, type NextRequest } from "next/server";
import { getPennylaneConfig } from "@/lib/pennylane/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
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
  params.set("max_date", "2025-09-30");
  params.append("status[]", "paid");
  params.append("status[]", "unpaid");
  params.set("page[per_page]", "5");
  params.set("sort", "date");

  const res = await fetch(
    `https://app.pennylane.com/api/external/v2/customer_invoices?${params}`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );

  const status = res.status;
  const rawText = await res.text();
  let rawJson: unknown = null;
  try { rawJson = JSON.parse(rawText); } catch { rawJson = rawText; }

  return NextResponse.json({ status, storeId, rawJson });
}
