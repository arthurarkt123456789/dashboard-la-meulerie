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

    // Fetch all pages with cursor param (matching trial_balance)
    const allItems: Array<{ date: string; status: string; currency_amount: string; currency_amount_before_tax: string; invoice_number: string }> = [];
    let cursor: string | null = null;
    let pageCount = 0;
    let hasMoreValues: unknown[] = [];

    do {
      const params = new URLSearchParams();
      params.set("min_date", "2024-10-01");
      params.set("max_date", "2026-09-30");
      params.append("status[]", "paid");
      params.append("status[]", "unpaid");
      params.append("status[]", "late");
      params.append("status[]", "upcoming");
      params.set("limit", "100");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `https://app.pennylane.com/api/external/v2/customer_invoices?${params}`,
        {
          headers: { Authorization: `Bearer ${config.token}` },
          signal: AbortSignal.timeout(12000),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        return NextResponse.json({ error: `API ${res.status}: ${body}` });
      }

      const json = await res.json() as Record<string, unknown>;
      const items = (Array.isArray(json.items) ? json.items : []) as Record<string, unknown>[];

      hasMoreValues.push(json.has_more);
      pageCount++;

      for (const item of items) {
        allItems.push({
          date: String(item.date ?? ""),
          status: String(item.status ?? ""),
          currency_amount: String(item.currency_amount ?? "0"),
          currency_amount_before_tax: String(item.currency_amount_before_tax ?? "0"),
          invoice_number: String(item.invoice_number ?? ""),
        });
      }

      const hasMeta = json.meta as { next_cursor?: string } | undefined;
      cursor = json.has_more === false
        ? null
        : (json.next_cursor as string | undefined) ?? hasMeta?.next_cursor ?? null;

      if (pageCount >= 5) break; // safety
    } while (cursor);

    // Group by month
    const byMonth: Record<string, { ttc: number; ht: number; count: number }> = {};
    for (const item of allItems) {
      const month = item.date.slice(0, 7);
      if (!month || month.length < 7) continue;
      const ttc = parseFloat(item.currency_amount) || 0;
      const ht = parseFloat(item.currency_amount_before_tax) || 0;
      if (!byMonth[month]) byMonth[month] = { ttc: 0, ht: 0, count: 0 };
      byMonth[month].ttc += ttc;
      byMonth[month].ht += ht;
      byMonth[month].count++;
    }

    return NextResponse.json({
      storeId,
      totalItems: allItems.length,
      pageCount,
      hasMoreValues,
      byMonth,
      allItems,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
