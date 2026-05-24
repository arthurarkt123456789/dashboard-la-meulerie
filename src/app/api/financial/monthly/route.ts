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
      const diag = (lines as unknown as { _diag?: object })._diag as Record<string, unknown> | undefined;
      months.push({
        month,
        ...costs,
        // Always include lightweight diagnostic for the most recent month
        // so field-name / structure issues are visible in the API response.
        ...(month === periods.at(-1)?.month
          ? {
              _diag: {
                ...(diag ?? {}),
                sample6x: (debug
                  ? lines
                      .filter((l) => l.ledger_account_number.startsWith("6"))
                      .slice(0, 15)
                      .map((l) => ({
                        n: l.ledger_account_number,
                        name: l.ledger_account_name,
                        debit: l.debit,
                        credit: l.credit,
                        balance: l.balance,
                      }))
                  : undefined),
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
