import { NextResponse } from "next/server";
import {
  getPennylaneConfig,
  fetchTrialBalance,
  aggregateFromLines,
} from "@/lib/pennylane/client";
import { getPastMonths } from "@/lib/pennylane/periods";
import {
  fetchBankAccounts,
  extractMonthCashflow,
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

  // Bank balance KPI — from bank sync (authoritative).
  // Outright fails for stores without bank connection: show "N/A" rather than wrong data.
  let bankAccounts: { name: string; balance: number }[] = [];
  let bankSynced = false;
  try {
    bankAccounts = await fetchBankAccounts(config.token);
    bankSynced = bankAccounts.length > 0;
    console.log(`[treso] ${storeId}: ${bankAccounts.length} bank accounts`);
  } catch (err) {
    console.log(`[treso] ${storeId} bank sync unavailable:`, (err as Error).message);
  }

  const cashflowMonths: ReturnType<typeof extractMonthCashflow>[] = [];
  const trialData: Array<{
    month: string;
    masseSalariale: number;
    chargesExploitation: number;
    coutMatiere: number;
    caPennylane: number;
    remboursementCapital: number;
  }> = [];

  for (const { month, start, end } of months) {
    try {
      const { lines } = await fetchTrialBalance(config.token, start, end);
      cashflowMonths.push(extractMonthCashflow(lines, month));
      const costs = aggregateFromLines(lines);
      trialData.push({ month, ...costs });
    } catch (err) {
      console.error(`[treso] trial balance ${storeId}/${month}:`, (err as Error).message);
      cashflowMonths.push({ month, inflows: 0, outflows: 0, net: 0, categoryBreakdown: [] });
      trialData.push({ month, masseSalariale: 0, chargesExploitation: 0, coutMatiere: 0, caPennylane: 0, remboursementCapital: 0 });
    }
  }

  // Exclude loan/debt accounts — only keep operational cash accounts
  const isLoanAccount = (name: string) =>
    /pr[êe]t|emprunt|cr[ée]dit bail|financement|ligne de/i.test(name);
  const operationalAccounts = bankAccounts.filter((a) => !isLoanAccount(a.name));
  const loanAccounts = bankAccounts.filter((a) => isLoanAccount(a.name));
  if (loanAccounts.length > 0) {
    console.log(`[treso] ${storeId} comptes exclus (prêts):`, loanAccounts.map((a) => `${a.name}=${a.balance}`).join(", "));
  }
  console.log(`[treso] ${storeId} comptes opéra:`, operationalAccounts.map((a) => `${a.name}=${a.balance}`).join(", "));

  const totalBalance = bankSynced
    ? Math.round(operationalAccounts.reduce((s, a) => s + a.balance, 0) * 100) / 100
    : 0;

  // Economic break-even (P&L based, excludes loan repayments)
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
        label: "Dépenses d'exploitation",
        prevYearAvg: Math.round(avg(prevFy.map((m) => m.chargesExploitation)) * 100) / 100,
        lastMonthAmount: Math.round(lastM.chargesExploitation * 100) / 100,
      },
      {
        label: "Remb. emprunts",
        prevYearAvg: Math.round(avg(prevFy.map((m) => m.remboursementCapital)) * 100) / 100,
        lastMonthAmount: Math.round(lastM.remboursementCapital * 100) / 100,
      },
    ],
    totalPrevYearAvg:
      Math.round(
        avg(prevFy.map((m) => m.masseSalariale + m.chargesExploitation + m.remboursementCapital)) * 100,
      ) / 100,
    totalLastMonth:
      Math.round((lastM.masseSalariale + lastM.chargesExploitation + lastM.remboursementCapital) * 100) / 100,
    prevFiscalYearLabel:
      prevFy.length >= 2
        ? `${prevFy[0].month.slice(0, 7)} – ${prevFy[11]?.month.slice(0, 7) ?? ""}`
        : "",
    lastMonthLabel: lastM.month,
  };

  return {
    id: storeId,
    name: STORE_NAMES[storeId] ?? storeId,
    totalBalance,
    bankAccounts: operationalAccounts, // prêts exclus
    bankSynced,
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
