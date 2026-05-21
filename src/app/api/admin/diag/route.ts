import { NextResponse, type NextRequest } from "next/server";
import { readSalesCacheBatch } from "@/lib/apitic/cache";
import { fetchPaymentMeans } from "@/lib/apitic/endpoints";
import { getConfiguredStoreLinks, getLinkByStoreId } from "@/lib/apitic/mapping";
import { checkAdmin } from "@/lib/admin-auth";
import type { ApiticSale } from "@/lib/apitic/raw-types";

// Diagnostic endpoint to compare candidate CA formulas against the POS truth.
// READ-ONLY. Does not modify the cache.

export const dynamic = "force-dynamic";

type DayMetrics = {
  storeId: string;
  date: string;
  tx: number;
  caLinesSale: number;
  caLinesAll: number;
  caLinesGross: number;
  caLinesGrossSale: number;
  caPaymentsAll: number;
  caPaymentsPositive: number;
  fidelityDiscountsTotal: number;
  lineTypeBreakdown: Record<string, { count: number; ati: number }>;
  paymentMeanBreakdown: Record<string, { count: number; amount: number }>;
  salesWithLineDiscount: number;
  salesWithFidelityDiscount: number;
  salesNetEqualLines: number;
  divergentSales: Array<{
    id: number;
    ticket: number | null;
    lineSum: number;
    paymentSum: number;
    delta: number;
  }>;
};

const NEGATIVE_PAYMENT_NAME_PATTERNS = [
  "avoir",
  "remise en valeur",
  "trop perçu",
  "trop percu",
];

function isNegativePaymentMeanName(name: string): boolean {
  const n = name.toLowerCase();
  return NEGATIVE_PAYMENT_NAME_PATTERNS.some((p) => n.includes(p));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function analyseOneStore(
  storeId: string,
  accountId: string,
  date: string,
): Promise<DayMetrics> {
  const cache = await readSalesCacheBatch(accountId, [date]);
  const sales: ApiticSale[] = cache.get(date) ?? [];

  // Build payment_mean lookup (name → id). Cached cheaply per call.
  const paymentMeans = await fetchPaymentMeans(accountId).catch(() => []);
  const paymentMeanById = new Map(
    paymentMeans.map((p) => [p.id, { name: p.name }]),
  );

  let caLinesSale = 0;
  let caLinesAll = 0;
  let caLinesGross = 0;
  let caLinesGrossSale = 0;
  let caPaymentsAll = 0;
  let caPaymentsPositive = 0;
  let fidelityDiscountsTotal = 0;
  let salesWithLineDiscount = 0;
  let salesWithFidelityDiscount = 0;
  let salesNetEqualLines = 0;

  const lineTypeBreakdown: Record<string, { count: number; ati: number }> = {};
  const paymentMeanBreakdown: Record<string, { count: number; amount: number }> = {};
  const divergentSales: DayMetrics["divergentSales"] = [];

  for (const sale of sales) {
    let lineSumNet = 0;
    let lineSumGross = 0;
    let hasLineDiscount = false;

    for (const line of sale.lines ?? []) {
      const t = line.line_type || "(missing)";
      const lt = (lineTypeBreakdown[t] ??= { count: 0, ati: 0 });
      lt.count++;
      lt.ati += line.ati_price;
      const net = line.ati_price - line.discount_ati_price;

      caLinesAll += net;
      caLinesGross += line.ati_price;
      if (line.discount_ati_price > 0) hasLineDiscount = true;

      if (line.line_type === "sale") {
        caLinesSale += net;
        caLinesGrossSale += line.ati_price;
      }

      lineSumNet += net;
      lineSumGross += line.ati_price;
    }

    if (hasLineDiscount) salesWithLineDiscount++;

    const fids = (sale.fidelity_discounts ?? []) as Array<{ amount?: number }>;
    if (fids.length > 0) {
      salesWithFidelityDiscount++;
      for (const f of fids) {
        if (typeof f.amount === "number") fidelityDiscountsTotal += f.amount;
      }
    }

    let paymentSum = 0;
    for (const p of sale.payments ?? []) {
      const meanName = paymentMeanById.get(p.payment_mean_id)?.name ?? `(id ${p.payment_mean_id})`;
      const pm = (paymentMeanBreakdown[meanName] ??= { count: 0, amount: 0 });
      pm.count++;
      pm.amount += p.amount;
      caPaymentsAll += p.amount;
      if (!isNegativePaymentMeanName(meanName)) {
        caPaymentsPositive += p.amount;
      }
      paymentSum += p.amount;
    }

    if (Math.abs(lineSumNet - paymentSum) < 0.005) {
      salesNetEqualLines++;
    } else if (divergentSales.length < 5) {
      divergentSales.push({
        id: sale.id,
        ticket: sale.ticket_number,
        lineSum: round2(lineSumNet),
        paymentSum: round2(paymentSum),
        delta: round2(paymentSum - lineSumNet),
      });
    }
    // hint we used lineSumGross — keep silent unused
    void lineSumGross;
  }

  // round all numeric fields
  for (const k of Object.keys(lineTypeBreakdown)) {
    lineTypeBreakdown[k].ati = round2(lineTypeBreakdown[k].ati);
  }
  for (const k of Object.keys(paymentMeanBreakdown)) {
    paymentMeanBreakdown[k].amount = round2(paymentMeanBreakdown[k].amount);
  }

  return {
    storeId,
    date,
    tx: sales.length,
    caLinesSale: round2(caLinesSale),
    caLinesAll: round2(caLinesAll),
    caLinesGross: round2(caLinesGross),
    caLinesGrossSale: round2(caLinesGrossSale),
    caPaymentsAll: round2(caPaymentsAll),
    caPaymentsPositive: round2(caPaymentsPositive),
    fidelityDiscountsTotal: round2(fidelityDiscountsTotal),
    lineTypeBreakdown,
    paymentMeanBreakdown,
    salesWithLineDiscount,
    salesWithFidelityDiscount,
    salesNetEqualLines,
    divergentSales,
  };
}

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const date = url.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date param required" }, { status: 400 });
  }

  try {
    const targets =
      !storeId || storeId === "all"
        ? getConfiguredStoreLinks()
        : (() => {
            const link = getLinkByStoreId(storeId);
            if (!link) throw new Error(`Unknown storeId: ${storeId}`);
            return [link];
          })();

    const results = await Promise.all(
      targets.map((l) => analyseOneStore(l.storeId, l.accountId, date)),
    );

    // Consolidated sums across all targets
    const totals = results.reduce(
      (acc, r) => ({
        tx: acc.tx + r.tx,
        caLinesSale: acc.caLinesSale + r.caLinesSale,
        caLinesAll: acc.caLinesAll + r.caLinesAll,
        caLinesGross: acc.caLinesGross + r.caLinesGross,
        caLinesGrossSale: acc.caLinesGrossSale + r.caLinesGrossSale,
        caPaymentsAll: acc.caPaymentsAll + r.caPaymentsAll,
        caPaymentsPositive: acc.caPaymentsPositive + r.caPaymentsPositive,
        fidelityDiscountsTotal: acc.fidelityDiscountsTotal + r.fidelityDiscountsTotal,
      }),
      {
        tx: 0,
        caLinesSale: 0,
        caLinesAll: 0,
        caLinesGross: 0,
        caLinesGrossSale: 0,
        caPaymentsAll: 0,
        caPaymentsPositive: 0,
        fidelityDiscountsTotal: 0,
      },
    );
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
      if (k !== "tx") totals[k] = round2(totals[k]);
    }

    return NextResponse.json({ date, totals, perStore: results });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return NextResponse.json(
      { error: e?.message ?? "Unknown error", name: e?.name },
      { status: 500 },
    );
  }
}
