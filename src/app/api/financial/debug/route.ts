import { NextResponse, type NextRequest } from "next/server";
import { getPennylaneConfig } from "@/lib/pennylane/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BASE = "https://app.pennylane.com/api/external/v2";

// GET /api/financial/debug?storeId=davso&start=2026-04-01&end=2026-04-30&token=<ADMIN_TOKEN>
// Returns the raw Pennylane trial_balance response for diagnosis.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-admin-token") ?? "";
  const expected = process.env.ADMIN_TOKEN ?? "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = url.searchParams.get("storeId") ?? "davso";
  const start = url.searchParams.get("start") ?? "2026-04-01";
  const end = url.searchParams.get("end") ?? "2026-04-30";

  const config = getPennylaneConfig(storeId);
  if (!config) {
    return NextResponse.json({ error: `No Pennylane config for store: ${storeId}` }, { status: 404 });
  }

  const params = new URLSearchParams({ period_start: start, period_end: end, limit: "200" });
  const res = await fetch(`${BASE}/trial_balance?${params}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `${res.status} ${res.statusText}`, body },
      { status: res.status },
    );
  }

  const json = await res.json();
  const lines: { number: string; name: string; debit: unknown; credit: unknown }[] =
    (json.trial_balance ?? []).map((r: Record<string, unknown>) => ({
      number: r.ledger_account_number,
      name: r.ledger_account_name,
      debit: r.debit,
      credit: r.credit,
    }));

  return NextResponse.json({
    period: { start, end },
    lineCount: lines.length,
    // Show 6x accounts (P&L charges) prominently for diagnosis
    chargeLines: lines.filter(l => String(l.number).match(/^6/)),
    loanLines: lines.filter(l => String(l.number).match(/^1[46]/)),
    sampleAll: lines.slice(0, 20),
  });
}
