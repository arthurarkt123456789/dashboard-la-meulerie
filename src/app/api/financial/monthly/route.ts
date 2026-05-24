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
      const { lines, diag } = await fetchTrialBalance(config.token, config.companyId, start, end);
      const costs = aggregateFromLines(lines);
      months.push({
        month,
        ...costs,
        ...(month === periods.at(-1)?.month
          ? {
              _diag: {
                ...diag,
                ...(debug
                  ? {
                      sample6x: lines
                        .filter((l) => l.ledger_account_number.startsWith("6"))
                        .slice(0, 15)
                        .map((l) => ({
                          n: l.ledger_account_number,
                          name: l.ledger_account_name,
                          debit: l.debit,
                          credit: l.credit,
                          balance: l.balance,
                        })),
                    }
                  : {}),
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
