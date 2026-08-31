import { NextResponse, type NextRequest } from "next/server";
import { getPennylaneConfig, fetchMonthlyProInvoices } from "@/lib/pennylane/client";

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

  // Raw first-page fetch to inspect field names
  const rawParams = new URLSearchParams();
  rawParams.set("min_date", "2024-10-01");
  rawParams.set("max_date", "2026-09-30");
  rawParams.append("status[]", "paid");
  rawParams.append("status[]", "unpaid");
  rawParams.append("status[]", "late");
  rawParams.set("page[per_page]", "5");
  rawParams.set("sort", "date");

  const rawRes = await fetch(
    `https://app.pennylane.com/api/external/v2/customer_invoices?${rawParams}`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );
  const rawStatus = rawRes.status;
  const rawText = await rawRes.text();
  let firstPage: unknown = null;
  try { firstPage = JSON.parse(rawText); } catch { firstPage = rawText; }

  // Processed result from our aggregation function
  let processed: unknown = null;
  let processedError: string | null = null;
  try {
    processed = await fetchMonthlyProInvoices(config.token, "2024-10-01", "2026-09-30");
  } catch (e) {
    processedError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ storeId, rawStatus, firstPage, processed, processedError });
}
