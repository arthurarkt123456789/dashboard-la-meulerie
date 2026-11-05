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
  if (!config) return null;

  // 13 months: prev fiscal year (12) + current month (1) = Oct N-1 → Oct N
  const months = getPastMonths(13);
  const fromDate = months[0].start;
  const toDate = months[months.length - 1].end;

  // Bank accounts + transactions run in parallel, trial balance sequential (rate limit safe)
  const [bankAccounts, transactions] = await Promise.all([
    fetchBankAccounts(config.token),
    fetchTransactions(config.token, fromDate, toDate),
  ]);

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

  const stores = results
    .map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[treso] ${STORE_IDS[i]} failed:`, (r.reason as Error)?.message);
      return null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return NextResponse.json(
    { stores, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
