import { NextResponse } from "next/server";
import {
  getPennylaneConfig,
  fetchTrialBalance,
  aggregateFromLines,
} from "@/lib/pennylane/client";
import { getPastMonths } from "@/lib/pennylane/periods";
import {
  fetchBankAccounts,
  fetchTransactions,
  buildMonthlyCashflow,
} from "@/lib/pennylane/treasury";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORE_IDS = ["davso", "malmousque", "republique", "endoume"] as const;
const STORE_NAMES: Record<string, string> = {
  davso: "Davso",
  malmousque: "Malmousque",
  republique: "République",
  endoume: "Endoume",
};

async function buildStoreData(storeId: string) {
  const config = getPennylaneConfig(storeId);
  if (!config) {
    console.error(`[treso] No Pennylane config for ${storeId}`);
    return null;
  }

  // 13 months: prev fiscal year (12) + current month (1) = Oct N-1 → Oct N
  const months = getPastMonths(13);
  const fromDate = months[0].start;
  const toDate = months[months.length - 1].end;

  // Bank accounts + transactions — wrap in try/catch to avoid killing the whole store
  let bankAccounts: Awaited<ReturnType<typeof fetchBankAccounts>> = [];
  let transactions: Awaited<ReturnType<typeof fetchTransactions>> = [];
  try {
    [bankAccounts, transactions] = await Promise.all([
      fetchBankAccounts(config.token),
      fetchTransactions(config.token, fromDate, toDate),
    ]);
    console.log(`[treso] ${storeId}: ${bankAccounts.length} accounts, ${transactions.length} transactions`);
  } catch (err) {
    console.error(`[treso] ${storeId} bank/txn error:`, (err as Error).message);
    // Continue: trial balance will still work for break-even + charges
  }

  const trialData: Array<{
    month: string;
    masseSalariale: number;
    chargesExploitation: number;
    coutMatiere: number;
    caPennylane: number;
  }> = [];

  for (const { month, start, end } of months) {
    try {
      const { lines } = await fetchTrialBalance(config.token, start, end);
      const costs = aggregateFromLines(lines);
      trialData.push({ month, ...costs });
    } catch (err) {
      console.error(`[treso] trial balance ${storeId}/${month}:`, (err as Error).message);
      trialData.push({ month, masseSalariale: 0, chargesExploitation: 0, coutMatiere: 0, caPennylane: 0 });
    }
  }

  const totalBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const cashflowMonths = buildMonthlyCashflow(transactions, months);

  // Break-even for all 13 months
  const breakEven = trialData.map((m) => {
    const cf = m.masseSalariale + m.chargesExploitation;
    const cv = m.coutMatiere;
    const ca = m.caPennylane;
    const mcvRate = ca > 0 ? (ca - cv) / ca : null;
    const seuil = mcvRate && mcvRate > 0 ? Math.round((cf / mcvRate) * 100) / 100 : null;
    return { month: m.month, ca, chargesFixed: cf, chargesVariable: cv, seuil };
  });

  // Recurring charges: prev fiscal year = months[0..11], last closed month = months[12]
  const prevFy = trialData.slice(0, 12);
  const lastM = trialData[12] ?? trialData[trialData.length - 1];
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

  const recurringCharges = {
    items: [
      {
        label: "Masse salariale",
        prevYearAvg: Math.round(avg(prevFy.map((m) => m.masseSalariale)) * 100) / 100,
        lastMonthAmount: Math.round(lastM.masseSalariale * 100) / 100,
      },
      {
        label: "Charges d'exploitation",
        prevYearAvg: Math.round(avg(prevFy.map((m) => m.chargesExploitation)) * 100) / 100,
        lastMonthAmount: Math.round(lastM.chargesExploitation * 100) / 100,
      },
    ],
    totalPrevYearAvg:
      Math.round(
        avg(prevFy.map((m) => m.masseSalariale + m.chargesExploitation)) * 100,
      ) / 100,
    totalLastMonth:
      Math.round((lastM.masseSalariale + lastM.chargesExploitation) * 100) / 100,
    prevFiscalYearLabel:
      prevFy.length >= 2
        ? `${prevFy[0].month.slice(0, 7)} – ${prevFy[11]?.month.slice(0, 7) ?? ""}`
        : "",
    lastMonthLabel: lastM.month,
  };

  return {
    id: storeId,
    name: STORE_NAMES[storeId] ?? storeId,
    totalBalance: Math.round(totalBalance * 100) / 100,
    bankAccounts: bankAccounts.map((a) => ({ name: a.name, balance: a.balance })),
    cashflowMonths,
    recurringCharges,
    breakEven,
  };
}

export async function GET() {
  const results = await Promise.allSettled(STORE_IDS.map(buildStoreData));

  const stores: NonNullable<Awaited<ReturnType<typeof buildStoreData>>>[] = [];
  const storeErrors: { id: string; name: string; error: string }[] = [];

  results.forEach((r, i) => {
    const id = STORE_IDS[i];
    if (r.status === "fulfilled" && r.value !== null) {
      stores.push(r.value);
    } else {
      const msg = r.status === "rejected"
        ? (r.reason as Error)?.message ?? "Erreur inconnue"
        : "Configuration Pennylane manquante";
      console.error(`[treso] ${id} failed:`, msg);
      storeErrors.push({ id, name: STORE_NAMES[id] ?? id, error: msg });
    }
  });

  return NextResponse.json(
    { stores, storeErrors, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
