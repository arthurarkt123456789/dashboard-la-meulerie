import "server-only";
import {
  getOrFetchRefs,
  getOrFetchSales,
  listCachedDates,
  readSalesCacheBatch,
  writeSalesCache,
} from "./cache";
import {
  fetchAccounts,
  fetchCategories,
  fetchPaymentMeans,
  fetchProducts,
  fetchSalesForDate,
} from "./endpoints";
import {
  buildSegmentMapper,
  getConfiguredStoreLinks,
  getOpenedOverride,
} from "./mapping";
import type {
  FormuleKind,
  FormuleStats,
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

// 3 years by default — wide enough to cover one full year of N-1 plus
// a year-over-year overlay margin. Operator can override via env if needed.
const HISTORY_DAYS = Number(process.env.APITIC_HISTORY_DAYS || "1095");

type ProductLookup = Map<number, { name: string; categoryId: number; price: number }>;
type CategoryLookup = Map<number, { name: string }>;
type PaymentLookup = Map<number, { name: string }>;

function rollupDay(
  sales: ApiticSale[],
  fiscalDate: string,
  productLookup: ProductLookup,
  segmentOf: (categoryId: number) => Segment,
  fallbackSegment: Segment = "Snacking",
): StoreDaily {
  let ca = 0;
  let caHT = 0;
  let fromagerieCA = 0;
  let fromagerieCAHT = 0;
  let snackingCA = 0;
  let snackingCAHT = 0;
  let fromagerieTx = 0;
  let snackingTx = 0;
  for (const sale of sales) {
    let saleHasFromagerie = false;
    let saleHasSnacking = false;
    for (const line of sale.lines ?? []) {
      if (line.line_type !== "sale") continue;
      // ati_price is already net of discount_ati_price; same convention for
      // price_excl_tax. Verified against the POS to the cent.
      const amountTTC = line.ati_price;
      const amountHT = line.price_excl_tax;
      ca += amountTTC;
      caHT += amountHT;
      const product = productLookup.get(line.product_id);
      const seg = product ? segmentOf(product.categoryId) : fallbackSegment;
      if (seg === "Fromagerie") {
        fromagerieCA += amountTTC;
        fromagerieCAHT += amountHT;
        saleHasFromagerie = true;
      } else {
        snackingCA += amountTTC;
        snackingCAHT += amountHT;
        saleHasSnacking = true;
      }
    }
    if (saleHasFromagerie) fromagerieTx++;
    if (saleHasSnacking) snackingTx++;
  }
  const tx = sales.length;
  return {
    date: fiscalDate,
    ca: Math.round(ca),
    caHT: Math.round(caHT * 100) / 100,
    tx,
    avgTicket: tx ? ca / tx : 0,
    avgTicketHT: tx ? caHT / tx : 0,
    fromagerieCA: Math.round(fromagerieCA),
    fromagerieCAHT: Math.round(fromagerieCAHT * 100) / 100,
    snackingCA: Math.round(snackingCA),
    snackingCAHT: Math.round(snackingCAHT * 100) / 100,
    fromagerieTx,
    snackingTx,
  };
}

/**
 * Hourly profile averaged over the last N closed days. APITIC doesn't give us
 * today's data, so the intraday chart shows a typical day instead of a live
 * curve that would always drift to zero in the right half.
 */
function rollupHourlyAverage(
  salesByDate: Map<string, ApiticSale[]>,
  endDateExclusive: string,
  daysBack: number,
): StoreHourly[] {
  const buckets = new Map<number, { ca: number; tx: number }>();
  for (let h = 7; h <= 19; h++) buckets.set(h, { ca: 0, tx: 0 });
  const seenDates = new Set<string>();
  const fromDate = subtractDays(endDateExclusive, daysBack);
  for (const [date, sales] of salesByDate) {
    if (date < fromDate || date >= endDateExclusive) continue;
    if (sales.length === 0) continue;
    seenDates.add(date);
    for (const sale of sales) {
      const h = parisHour(sale.datetime_paid || sale.datetime_created);
      if (h < 7 || h > 19) continue;
      const b = buckets.get(h);
      if (!b) continue;
      let amount = 0;
      for (const line of sale.lines ?? []) {
        if (line.line_type !== "sale") continue;
        amount += line.ati_price;
      }
      b.ca += amount;
      b.tx += 1;
    }
  }
  const n = Math.max(1, seenDates.size);
  const hourly: StoreHourly[] = [];
  for (let h = 7; h <= 19; h++) {
    const b = buckets.get(h)!;
    hourly.push({
      hour: h,
      ca: Math.round(b.ca / n),
      tx: Math.round(b.tx / n),
      done: true, // every bucket has data — it's a profile, not a live curve
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
  type Agg = {
    unitsToday: number;
    units7d: number;
    units30d: number;
    revenue7d: number;
    revenue30d: number;
    revenue7dHT: number;
    revenue30dHT: number;
    hasFractionalQty: boolean;
  };
  const totals = new Map<number, Agg>();

  const cutoff7 = subtractDays(today, 6);
  const cutoff30 = subtractDays(today, 29);

  for (const [date, sales] of salesByDate) {
    const inLast7 = date >= cutoff7;
    const inLast30 = date >= cutoff30;
    const isToday = date === today;
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        if (line.line_type !== "sale") continue;
        const t: Agg = totals.get(line.product_id) ?? {
          unitsToday: 0,
          units7d: 0,
          units30d: 0,
          revenue7d: 0,
          revenue30d: 0,
          revenue7dHT: 0,
          revenue30dHT: 0,
          hasFractionalQty: false,
        };
        const qty = line.quantity;
        // ati_price / price_excl_tax already net of any discount.
        const amountTTC = line.ati_price;
        const amountHT = line.price_excl_tax;
        if (!Number.isInteger(qty)) t.hasFractionalQty = true;
        if (isToday) t.unitsToday += qty;
        if (inLast7) {
          t.units7d += qty;
          t.revenue7d += amountTTC;
          t.revenue7dHT += amountHT;
        }
        if (inLast30) {
          t.units30d += qty;
          t.revenue30d += amountTTC;
          t.revenue30dHT += amountHT;
        }
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
      unit: agg.hasFractionalQty ? "au poids" : "pièce",
      price: product.price,
      unitsToday: agg.unitsToday,
      units7d: agg.units7d,
      units30d: agg.units30d,
      revenue7d: Math.round(agg.revenue7d),
      revenue30d: Math.round(agg.revenue30d),
      revenue7dHT: Math.round(agg.revenue7dHT),
      revenue30dHT: Math.round(agg.revenue30dHT),
    });
  }
  return out.sort((a, b) => b.revenue30d - a.revenue30d);
}

// ────────────────────────────────────────────────────────────────────────
// "Formules lunch" detection — flag products whose name matches
//   /menu.*grilled/i  → grilled  (Menu Grilled)
//   /menu.*baguette/i → baguette (Menu Baguette)
// Aggregates revenue + units per formule over a window so we can show the
// formule penetration as a share of the snacking pie.
// ────────────────────────────────────────────────────────────────────────

const FORMULE_PATTERNS: { kind: FormuleKind; re: RegExp }[] = [
  { kind: "grilled", re: /menu.*grilled/i },
  { kind: "baguette", re: /menu.*baguette/i },
];

function classifyFormule(name: string): FormuleKind | null {
  for (const { kind, re } of FORMULE_PATTERNS) {
    if (re.test(name)) return kind;
  }
  return null;
}

function buildFormuleStats(
  salesByDate: Map<string, ApiticSale[]>,
  endDateExclusive: string,
  daysBack: number,
  productLookup: ProductLookup,
  daily: StoreDaily[],
): FormuleStats {
  const fromDate = subtractDays(endDateExclusive, daysBack);
  // Resolve product_id → formule kind once.
  const productFormule = new Map<number, FormuleKind>();
  for (const [id, info] of productLookup) {
    const k = classifyFormule(info.name);
    if (k) productFormule.set(id, k);
  }

  const byKind: FormuleStats["byKind"] = {
    grilled: { units: 0, ca: 0, caHT: 0 },
    baguette: { units: 0, ca: 0, caHT: 0 },
  };

  // Numerator: walk the sales in the window, sum formule units & CA.
  for (const [date, sales] of salesByDate) {
    if (date < fromDate || date >= endDateExclusive) continue;
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        if (line.line_type !== "sale") continue;
        const formule = productFormule.get(line.product_id);
        if (!formule) continue;
        byKind[formule].units += line.quantity;
        byKind[formule].ca += line.ati_price;
        byKind[formule].caHT += line.price_excl_tax;
      }
    }
  }

  // Denominators: take from the rolled-up daily series (consistent with the
  // segment routing the rest of the dashboard uses).
  const windowDaily = daily.filter(
    (d) => d.date >= fromDate && d.date < endDateExclusive,
  );
  const snackingCA = windowDaily.reduce((s, d) => s + d.snackingCA, 0);
  const snackingCAHT = windowDaily.reduce(
    (s, d) => s + (d.snackingCAHT ?? 0),
    0,
  );
  const snackingTx = windowDaily.reduce(
    (s, d) => s + (d.snackingTx ?? 0),
    0,
  );

  const lastDate =
    windowDaily.length > 0 ? windowDaily[windowDaily.length - 1].date : "";

  return {
    endDate: lastDate,
    days: daysBack,
    byKind,
    snackingCA,
    snackingCAHT,
    snackingTx,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Payment split aggregated over a window of recent days (since APITIC
// doesn't expose today's tickets we can't build a live "today" donut).
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
  salesByDate: Map<string, ApiticSale[]>,
  endDateExclusive: string,
  daysBack: number,
  paymentLookup: PaymentLookup,
): PaymentSplit[] {
  const totals: Record<PaymentMethod, number> = {
    "Carte bancaire": 0,
    "Sans contact": 0,
    "Espèces": 0,
    "Tickets resto": 0,
  };
  // Track aggregated TTC and HT across the window so we can scale payment
  // amounts to HT using the realised VAT ratio.
  let totalTTC = 0;
  let totalHT = 0;
  const fromDate = subtractDays(endDateExclusive, daysBack);
  for (const [date, sales] of salesByDate) {
    if (date < fromDate || date >= endDateExclusive) continue;
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        if (line.line_type !== "sale") continue;
        totalTTC += line.ati_price;
        totalHT += line.price_excl_tax;
      }
      for (const p of sale.payments ?? []) {
        const name = paymentLookup.get(p.payment_mean_id)?.name ?? "";
        const method = classifyPayment(name);
        totals[method] += p.amount;
      }
    }
  }
  const htRatio = totalTTC > 0 ? totalHT / totalTTC : 1;
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
    amountHT: totals[method] * htRatio,
  }));
  return list;
}

// ────────────────────────────────────────────────────────────────────────
// Per-store aggregate
// ────────────────────────────────────────────────────────────────────────

type AggregateMode =
  | { kind: "read" } // only read what's in cache; always refresh today
  | { kind: "warm"; from: string; to: string }; // fetch and cache this range

async function aggregateOneStore(
  accountId: string,
  storeMeta: Store,
  now: Date,
  segmentMapper: ReturnType<typeof buildSegmentMapper>,
  mode: AggregateMode = { kind: "read" },
): Promise<StoreData> {
  // APITIC doesn't expose the current fiscal day, so the series ends at
  // yesterday and "today" is never present in the dashboard.
  const today = parisDate(now);
  const lastDay = subtractDays(today, 1);
  const start = subtractDays(lastDay, HISTORY_DAYS - 1);
  const dates = listDates(start, lastDay);

  // 1. Reference data: products/categories/payment_means are cached in PG
  // with a 24h TTL. During APITIC blackouts (or any transient failure) we
  // serve the previous snapshot so segment routing keeps working.
  const [products, categories, paymentMeans] = await Promise.all([
    getOrFetchRefs<ApiticProduct>(accountId, "products", () =>
      fetchProducts(accountId),
    ).catch(() => [] as ApiticProduct[]),
    getOrFetchRefs<ApiticCategory>(accountId, "categories", () =>
      fetchCategories(accountId),
    ).catch(() => [] as ApiticCategory[]),
    getOrFetchRefs<ApiticPaymentMean>(accountId, "payment_means", () =>
      fetchPaymentMeans(accountId),
    ).catch(() => [] as ApiticPaymentMean[]),
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

  // 2. Fetch sales per day.
  // In READ mode we only read what's already cached (fast) and always
  // refresh today (live). Missing historical days are treated as "no data".
  // In WARM mode we actively fetch the requested date range and cache it.
  const salesByDate = new Map<string, ApiticSale[]>();
  const cached = await listCachedDates(accountId, dates);

  async function fetchOne(date: string) {
    try {
      const sales = await getOrFetchSales(accountId, date, () =>
        fetchSalesForDate(accountId, date),
      );
      salesByDate.set(date, sales);
    } catch {
      salesByDate.set(date, []);
    }
  }

  // Batch-read every cached historical date in one query (no N+1).
  const cachedDates = dates.filter((d) => cached.has(d));
  const cacheBatch = await readSalesCacheBatch(accountId, cachedDates);
  for (const [date, sales] of cacheBatch) salesByDate.set(date, sales);

  if (mode.kind === "read") {
    // Auto-fetch any missing date in the last 30 days. The bootstrap warms
    // older history; new days (= "yesterday" each morning, plus anything
    // that failed during a previous blackout) are picked up here. We cap at
    // 30 days so the request doesn't accidentally hammer APITIC if the
    // cache was wiped.
    const tailWindowDays = 30;
    const tailFromDate = subtractDays(lastDay, tailWindowDays - 1);
    const missingTail = dates.filter(
      (d) => d >= tailFromDate && !salesByDate.has(d),
    );
    if (missingTail.length > 0) {
      await Promise.all(missingTail.map((d) => fetchOne(d)));
    }
    for (const date of dates) {
      if (!salesByDate.has(date)) salesByDate.set(date, []);
    }
  } else {
    // warm: re-fetch the requested range, ignore cache for that window
    const warmSet = new Set(listDates(mode.from, mode.to));
    await Promise.all(
      dates.map(async (date) => {
        if (warmSet.has(date)) {
          await fetchOne(date);
        } else if (!salesByDate.has(date)) {
          salesByDate.set(date, []);
        }
      }),
    );
  }

  // 2b. Determine the effective opening date.
  // 1) Operator env override wins (APITIC_OPENED_<STOREID>).
  // 2) Otherwise use storeMeta.openedDate as the floor. firstSaleDate from
  //    cache can only push the date earlier (incomplete cache shouldn't make
  //    a store appear newer than it really is).
  let firstSaleDate: string | null = null;
  for (const date of dates) {
    if ((salesByDate.get(date) ?? []).length > 0) {
      firstSaleDate = date;
      break;
    }
  }
  const override = getOpenedOverride(storeMeta.id);
  const effectiveOpenedDate =
    override ??
    (firstSaleDate && firstSaleDate < storeMeta.openedDate
      ? firstSaleDate
      : storeMeta.openedDate);
  const openedTs = new Date(`${effectiveOpenedDate}T00:00:00Z`).getTime();

  // 3. Build StoreDaily[] — mark anything before the first sale as `closed`.
  const daily: StoreDaily[] = dates.map((date) => {
    const dTs = new Date(`${date}T00:00:00Z`).getTime();
    if (dTs < openedTs) {
      return {
        date,
        ca: 0,
        caHT: 0,
        tx: 0,
        avgTicket: 0,
        avgTicketHT: 0,
        fromagerieCA: 0,
        fromagerieCAHT: 0,
        snackingCA: 0,
        snackingCAHT: 0,
        closed: true,
      };
    }
    const sales = salesByDate.get(date) ?? [];
    return rollupDay(
      sales,
      date,
      productLookup,
      (id) => segmentOf(id, categoryLookup.get(id)?.name),
      segmentMapper.defaultSegment,
    );
  });

  // 4. Intraday profile averaged over the last 30 closed days (yesterday and back).
  //    Anchored on `today` exclusive, so yesterday is included in the average.
  const hourly = rollupHourlyAverage(salesByDate, today, 30);

  // 5. Top products + payments — both aggregate the last 30 closed days too.
  const topProducts = buildTopProducts(
    salesByDate,
    productLookup,
    categoryLookup,
    segmentOf,
    lastDay,
  );
  const payments = buildPayments(salesByDate, today, 30, paymentLookup);

  // Formules lunch — same 30-day window as payments/intraday for consistency.
  const formules = buildFormuleStats(
    salesByDate,
    today,
    30,
    productLookup,
    daily,
  );

  // Use env override if set; otherwise trust storeMeta.opened (the operator
  // knows the real date). firstSaleDate from cache is unreliable when the
  // bootstrap is incomplete — it would show the first *cached* day, not the
  // actual opening day.
  const openedLabel = override
    ? new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(
        new Date(`${override}T12:00:00Z`),
      )
    : storeMeta.opened;

  return {
    id: storeMeta.id,
    name: storeMeta.name,
    fullName: storeMeta.fullName,
    address: storeMeta.address,
    manager: storeMeta.manager,
    opened: openedLabel,
    openedDate: effectiveOpenedDate,
    daily,
    hourly,
    topProducts,
    payments,
    formules,
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

/**
 * Warms the cache for a date range without doing the full aggregation
 * computation. Returns the number of dates fetched + skipped.
 */
export async function warmStore(
  storeId: string,
  fromDate: string,
  toDate: string,
): Promise<{ storeId: string; fetched: number; skipped: number; failed: number; from: string; to: string }> {
  const link = getConfiguredStoreLinks().find((l) => l.storeId === storeId);
  if (!link) {
    return { storeId, fetched: 0, skipped: 0, failed: 0, from: fromDate, to: toDate };
  }
  const accountId = link.accountId;
  const dates = listDates(fromDate, toDate);
  const cached = await listCachedDates(accountId, dates);
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  await Promise.all(
    dates.map(async (date) => {
      if (cached.has(date)) {
        skipped++;
        return;
      }
      try {
        const sales = await fetchSalesForDate(accountId, date);
        await writeSalesCache(accountId, date, sales);
        fetched++;
      } catch (err) {
        const e = err as { name?: string; message?: string };
        console.warn(
          `[warmStore] ${storeId} ${date} failed: ${e?.name ?? "?"} ${e?.message ?? ""}`,
        );
        failed++;
      }
    }),
  );
  return { storeId, fetched, skipped, failed, from: fromDate, to: toDate };
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
