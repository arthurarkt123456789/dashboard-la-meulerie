import { NextResponse, type NextRequest } from "next/server";
import {
  getPennylaneConfig,
  fetchTrialBalance,
  aggregateFromLines,
  getPastMonths,
} from "@/lib/pennylane/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const n = Math.min(Number(url.searchParams.get("months") ?? "12"), 24);
  const debug = url.searchParams.get("debug") === "1";

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
      months.push({
        month,
        ...costs,
        // In debug mode: include raw lines for the most recent month only
        ...(debug && month === periods.at(-1)?.month
          ? {
              _debug: {
                lineCount: lines.length,
                firstLineKeys: lines[0] ? Object.keys(lines[0]) : [],
                sample6x: lines
                  .filter((l) => l.ledger_account_number.startsWith("6"))
                  .slice(0, 10)
                  .map((l) => ({
                    n: l.ledger_account_number,
                    name: l.ledger_account_name,
                    debit: l.debit,
                    credit: l.credit,
                    balance: l.balance,
                  })),
                sample16x: lines
                  .filter((l) => l.ledger_account_number.startsWith("16"))
                  .slice(0, 5)
                  .map((l) => ({
                    n: l.ledger_account_number,
                    debit: l.debit,
                    credit: l.credit,
                  })),
              },
            }
          : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      months.push({ month, error: message });
    }
  }

  return NextResponse.json(
    { months },
    { headers: { "Cache-Control": "no-store" } },
  );
}
