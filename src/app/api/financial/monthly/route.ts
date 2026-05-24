import { NextResponse, type NextRequest } from "next/server";
import {
  getPennylaneConfig,
  fetchTrialBalance,
  aggregateFromLines,
  getPastMonths,
} from "@/lib/pennylane/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // up to 12 sequential Pennylane calls

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const n = Math.min(Number(url.searchParams.get("months") ?? "12"), 24);

  if (!storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });

  const config = getPennylaneConfig(storeId);
  if (!config) {
    return NextResponse.json(
      { error: `No Pennylane config for store: ${storeId}` },
      { status: 404 },
    );
  }

  const periods = getPastMonths(n);
  const months = [];

  for (const { month, start, end } of periods) {
    try {
      const lines = await fetchTrialBalance(config.token, start, end);
      const costs = aggregateFromLines(lines);
      months.push({ month, ...costs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      months.push({ month, error: message });
    }
  }

  return NextResponse.json(
    { months },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
