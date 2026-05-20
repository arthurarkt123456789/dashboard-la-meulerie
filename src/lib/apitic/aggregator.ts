import "server-only";
import { getOrFetchSales } from "./cache";
import {
  fetchAccounts,
  fetchCategories,
  fetchPaymentMeans,
  fetchProducts,
  fetchSalesForDate,
} from "./endpoints";
import { buildSegmentMapper, getConfiguredStoreLinks } from "./mapping";
import type {
  PaymentMethod,
  PaymentSplit,
  Product as InternalProduct,
  Segment,
  Store,
  StoreData,
  StoreDaily,
  StoreHourly,
} from "./types";
import type {
  ApiticCategory,
  ApiticPaymentMean,
  ApiticProduct,
  ApiticSale,
} from "./raw-types";

// ────────────────────────────────────────────────────────────────────────
// Date helpers (Europe/Paris)
// ────────────────────────────────────────────────────────────────────────

function todayInParis(): string {
  return parisDate(new Date());
}

function parisDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function parisHour(iso: string): number {
  // APITIC datetimes look like "2026-05-19 13:42:11". Treat as Paris-local.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2})/);
  if (!m) return -1;
  return Number(m[4]);
}

function parisDateFromDateTime(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}

function listDates(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function subtractDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────
// Sales → per-day rollup
// ────────────────────────────────────────────────────────────────────────

const HISTORY_DAYS = Number(process.env.APITIC_HISTORY_DAYS || "540");

type ProductLookup = Map<number, { name: string; categoryId: number; price: number }>;
type CategoryLookup = Map<number, { name: string }>;
type PaymentLookup = Map<number, { name: string }>;

function rollupDay(
  sales: ApiticSale[],
  fiscalDate: string,
  productLookup: ProductLookup,
  segmentOf: (categoryId: number) => Segment,
): StoreDaily {
  let ca = 0;
  let fromagerieCA = 0;
  let snackingCA = 0;
  for (const sale of sales) {
    for (const line of sale.lines) {
      if (line.line_type !== "sale") continue;
      const net = line.ati_price - line.discount_ati_price;
      ca += net;
      const product = productLookup.get(line.product_id);
      const seg = product ? segmentOf(product.categoryId) : "Snacking";
      if (seg === "Fromagerie") fromagerieCA += net;
      else snackingCA += net;
    }
  }
  const tx = sales.length;
  return {
    date: fiscalDate,
    ca: Math.round(ca),
    tx,
    avgTicket: tx ? ca / tx : 0,
    fromagerieCA: Math.round(fromagerieCA),
    snackingCA: Math.round(snackingCA),
  };
}

function rollupHourly(
  sales: ApiticSale[],
  now: Date,
  fiscalDate: string,
): StoreHourly[] {
  const buckets = new Map<number, { ca: number; tx: number }>();
  for (let h = 7; h <= 19; h++) buckets.set(h, { ca: 0, tx: 0 });
  for (const sale of sales) {
    const h = parisHour(sale.datetime_paid || sale.datetime_created);
    if (h < 7 || h > 19) continue;
    const b = buckets.get(h);
    if (!b) continue;
    let amount = 0;
    for (const line of sale.lines) {
      if (line.line_type !== "sale") continue;
      amount += line.ati_price - line.discount_ati_price;
    }
    b.ca += amount;
    b.tx += 1;
  }
  // current hour in Paris (only meaningful when fiscalDate == today)
  const isToday = fiscalDate === parisDate(now);
  const currentHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const hourly: StoreHourly[] = [];
  for (let h = 7; h <= 19; h++) {
    const b = buckets.get(h)!;
    hourly.push({
      hour: h,
      ca: Math.round(b.ca),
      tx: b.tx,
      done: !isToday ? true : h < currentHour,
    });
  }
  return hourly;
}

// ────────────────────────────────────────────────────────────────────────
// Top products aggregation
// ────────────────────────────────────────────────────────────────────────

function buildTopProducts(
  salesByDate: Map<string, ApiticSale[]>,
  productLookup: ProductLookup,
  categoryLookup: CategoryLookup,
  segmentOf: (categoryId: number, name?: string) => Segment,
  today: string,
): InternalProduct[] {
  const totals = new Map<
    number,
    {
      unitsToday: number;
      units7d: number;
      units30d: number;
      revenue7d: number;
      revenue30d: number;
    }
  >();

  const cutoff7 = subtractDays(today, 6);
  const cutoff30 = subtractDays(today, 29);

  for (const [date, sales] of salesByDate) {
    const inLast7 = date >= cutoff7;
    const inLast30 = date >= cutoff30;
    const isToday = date === today;
    for (const sale of sales) {
      for (const line of sale.lines) {
        if (line.line_type !== "sale") continue;
        const t = totals.get(line.product_id) ?? {
          unitsToday: 0,
          units7d: 0,
          units30d: 0,
          revenue7d: 0,
          revenue30d: 0,
        };
        const qty = line.quantity;
        const net = line.ati_price - line.discount_ati_price;
        if (isToday) t.unitsToday += qty;
        if (inLast7) t.units7d += qty;
        if (inLast30) {
          t.units30d += qty;
          t.revenue30d += net;
        }
        if (inLast7) t.revenue7d += net;
        totals.set(line.product_id, t);
      }
    }
  }

  const out: InternalProduct[] = [];
  for (const [productId, agg] of totals) {
    const product = productLookup.get(productId);
    if (!product) continue;
    const category = categoryLookup.get(product.categoryId);
    const segment = segmentOf(product.categoryId, category?.name);
    out.push({
      name: product.name,
      segment,
      category: category?.name ?? "—",
      unit: "pièce",
      price: product.price,
      unitsToday: agg.unitsToday,
      units7d: agg.units7d,
      units30d: agg.units30d,
      revenue7d: Math.round(agg.revenue7d),
      revenue30d: Math.round(agg.revenue30d),
    });
  }
  return out.sort((a, b) => b.revenue30d - a.revenue30d);
}

// ────────────────────────────────────────────────────────────────────────
// Payment split (today only — matches the proto's UI)
// ────────────────────────────────────────────────────────────────────────

const PAYMENT_KEYWORDS: { method: PaymentMethod; keywords: string[] }[] = [
  { method: "Sans contact", keywords: ["sans contact", "contactless", "nfc"] },
  { method: "Tickets resto", keywords: ["ticket", "resto", "swile", "edenred", "tr"] },
  { method: "Espèces", keywords: ["espèce", "espece", "cash", "liquide"] },
  { method: "Carte bancaire", keywords: ["carte", "cb", "bancaire", "card"] },
];

function classifyPayment(name: string): PaymentMethod {
  const n = name.toLowerCase();
  for (const { method, keywords } of PAYMENT_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return method;
  }
  return "Carte bancaire"; // safe default — most transactions are CB
}

function buildPayments(
  todaySales: ApiticSale[],
  paymentLookup: PaymentLookup,
): PaymentSplit[] {
  const totals: Record<PaymentMethod, number> = {
    "Carte bancaire": 0,
    "Sans contact": 0,
    "Espèces": 0,
    "Tickets resto": 0,
  };
  for (const sale of todaySales) {
    for (const p of sale.payments) {
      const name = paymentLookup.get(p.payment_mean_id)?.name ?? "";
      const method = classifyPayment(name);
      totals[method] += p.amount;
    }
  }
  const total =
    totals["Carte bancaire"] +
    totals["Sans contact"] +
    totals["Espèces"] +
    totals["Tickets resto"];
  const list: PaymentSplit[] = (
    [
      "Carte bancaire",
      "Sans contact",
      "Espèces",
      "Tickets resto",
    ] as PaymentMethod[]
  ).map((method) => ({
    method,
    share: total ? totals[method] / total : 0,
    amount: totals[method],
  }));
  return list;
}

// ────────────────────────────────────────────────────────────────────────
// Per-store aggregate
// ────────────────────────────────────────────────────────────────────────

async function aggregateOneStore(
  accountId: string,
  storeMeta: Store,
  now: Date,
  segmentMapper: ReturnType<typeof buildSegmentMapper>,
): Promise<StoreData> {
  const today = parisDate(now);
  const start = subtractDays(today, HISTORY_DAYS - 1);
  const dates = listDates(start, today);

  // 1. Fetch reference data once per store (also cacheable, but they're small)
  const [products, categories, paymentMeans] = await Promise.all([
    fetchProducts(accountId).catch(() => [] as ApiticProduct[]),
    fetchCategories(accountId).catch(() => [] as ApiticCategory[]),
    fetchPaymentMeans(accountId).catch(() => [] as ApiticPaymentMean[]),
  ]);

  const productLookup: ProductLookup = new Map(
    products.map((p) => [
      p.id,
      { name: p.name, categoryId: p.category_id, price: p.ati_price },
    ]),
  );
  const categoryLookup: CategoryLookup = new Map(
    categories.map((c) => [c.id, { name: c.name }]),
  );
  const paymentLookup: PaymentLookup = new Map(
    paymentMeans.map((p) => [p.id, { name: p.name }]),
  );

  const segmentOf = (categoryId: number, name?: string) =>
    segmentMapper.segmentForCategory(
      categoryId,
      name ?? categoryLookup.get(categoryId)?.name,
    );

  // 2. Fetch sales per day (cached) — Promise.all relies on http.ts to throttle.
  const openedTs = new Date(`${storeMeta.openedDate}T00:00:00Z`).getTime();

  const salesByDate = new Map<string, ApiticSale[]>();
  await Promise.all(
    dates.map(async (date) => {
      const dTs = new Date(`${date}T00:00:00Z`).getTime();
      if (dTs < openedTs) {
        salesByDate.set(date, []);
        return;
      }
      try {
        const sales = await getOrFetchSales(accountId, date, () =>
          fetchSalesForDate(accountId, date),
        );
        salesByDate.set(date, sales);
      } catch {
        // any failure: treat as closed/missing for that day. The UI handles
        // missing data via the periodMetrics yoyAvailable flag.
        salesByDate.set(date, []);
      }
    }),
  );

  // 3. Build StoreDaily[]
  const daily: StoreDaily[] = dates.map((date) => {
    const dTs = new Date(`${date}T00:00:00Z`).getTime();
    if (dTs < openedTs) {
      return {
        date,
        ca: 0,
        tx: 0,
        avgTicket: 0,
        fromagerieCA: 0,
        snackingCA: 0,
        closed: true,
      };
    }
    const sales = salesByDate.get(date) ?? [];
    const day = rollupDay(sales, date, productLookup, (id) =>
      segmentOf(id, categoryLookup.get(id)?.name),
    );
    if (date === today) day.partial = true;
    return day;
  });

  // 4. Hourly for today
  const todaySales = salesByDate.get(today) ?? [];
  const hourly = rollupHourly(todaySales, now, today);

  // 5. Top products + payments
  const topProducts = buildTopProducts(
    salesByDate,
    productLookup,
    categoryLookup,
    segmentOf,
    today,
  );
  const payments = buildPayments(todaySales, paymentLookup);

  return {
    id: storeMeta.id,
    name: storeMeta.name,
    fullName: storeMeta.fullName,
    address: storeMeta.address,
    manager: storeMeta.manager,
    opened: storeMeta.opened,
    openedDate: storeMeta.openedDate,
    daily,
    hourly,
    topProducts,
    payments,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Public surface
// ────────────────────────────────────────────────────────────────────────

export function listConfiguredStores(): Store[] {
  return getConfiguredStoreLinks().map(({ meta }) => ({
    id: meta.id,
    name: meta.name,
    fullName: meta.fullName,
    address: meta.address,
    manager: meta.manager,
    opened: meta.opened,
    openedDate: meta.openedDate,
  }));
}

export async function aggregateStore(
  storeId: string,
  now: Date = new Date(),
): Promise<StoreData | null> {
  const link = getConfiguredStoreLinks().find((l) => l.storeId === storeId);
  if (!link) return null;
  const mapper = buildSegmentMapper();
  return aggregateOneStore(link.accountId, link.meta, now, mapper);
}

export async function aggregateAllStores(
  now: Date = new Date(),
): Promise<StoreData[]> {
  const links = getConfiguredStoreLinks();
  const mapper = buildSegmentMapper();
  // Run stores in parallel — http.ts caps concurrency across all in-flight calls.
  return Promise.all(
    links.map((l) => aggregateOneStore(l.accountId, l.meta, now, mapper)),
  );
}

/** Convenience: round-trip the live /accounts endpoint for the discover route. */
export async function dumpAccounts() {
  return fetchAccounts();
}

export async function dumpCategoriesForFirstAccount() {
  const accounts = await fetchAccounts();
  if (accounts.length === 0) return null;
  const categories = await fetchCategories(accounts[0].id);
  return { account: accounts[0], categories };
}
