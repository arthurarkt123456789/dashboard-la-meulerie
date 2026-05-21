// Deterministic mock data generator. Mirrors the proto's data.js byte-for-byte
// in shape so the UI behaves identically. Swap this module for a real APITIC
// adapter once endpoints are wired (see src/lib/apitic/client.ts).

import type {
  PaymentSplit,
  Product,
  Segment,
  Store,
  StoreData,
  StoreDaily,
  StoreHourly,
} from "./types";

type StoreSeed = Store & {
  seed: number;
  baseCA: number;
  weekendFactor: number;
  snackingShare: number;
  avgTicket: number;
  txPerDay: number;
  yoyGrowth: number | null;
};

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STORE_SEEDS: StoreSeed[] = [
  {
    id: "davso",
    name: "Davso",
    fullName: "La Meulerie Davso",
    address: "12 rue Francis Davso, 13001 Marseille",
    manager: "Camille Vidal",
    opened: "2019",
    openedDate: "2019-03-15",
    seed: 11,
    baseCA: 3850,
    weekendFactor: 0.85,
    snackingShare: 0.58,
    avgTicket: 14.2,
    txPerDay: 270,
    yoyGrowth: 0.084,
  },
  {
    id: "endoume",
    name: "Endoume",
    fullName: "La Meulerie Endoume",
    address: "8 rue d'Endoume, 13007 Marseille",
    manager: "Léa Bertin",
    opened: "2021",
    openedDate: "2021-09-01",
    seed: 22,
    baseCA: 2640,
    weekendFactor: 1.1,
    snackingShare: 0.38,
    avgTicket: 18.7,
    txPerDay: 142,
    yoyGrowth: 0.062,
  },
  {
    id: "malmousque",
    name: "Malmousque",
    fullName: "La Meulerie Malmousque",
    address: "3 traverse Malmousque, 13007 Marseille",
    manager: "Théo Salvini",
    opened: "2023",
    openedDate: "2023-06-10",
    seed: 33,
    baseCA: 3120,
    weekendFactor: 1.55,
    snackingShare: 0.52,
    avgTicket: 21.4,
    txPerDay: 148,
    yoyGrowth: 0.118,
  },
  {
    id: "republique",
    name: "République",
    fullName: "La Meulerie République",
    address: "45 rue de la République, 13002 Marseille",
    manager: "Yanis Moreau",
    opened: "nov. 2025",
    openedDate: "2025-11-15",
    seed: 44,
    baseCA: 3420,
    weekendFactor: 0.72,
    snackingShare: 0.71,
    avgTicket: 11.9,
    txPerDay: 290,
    yoyGrowth: null,
  },
];

const FROMAGERIE_PRODUCTS = [
  { name: "Comté 24 mois", price: 6.8, unit: "200g", category: "Pâte pressée" },
  { name: "Beaufort d'été AOP", price: 7.4, unit: "200g", category: "Pâte pressée" },
  { name: "Reblochon fermier", price: 5.2, unit: "pièce", category: "Pâte molle" },
  { name: "Roquefort Papillon", price: 4.9, unit: "150g", category: "Bleu" },
  { name: "Brillat-Savarin truffé", price: 8.5, unit: "pièce", category: "Pâte molle" },
  { name: "Banon AOP", price: 4.6, unit: "pièce", category: "Chèvre" },
  { name: "Saint-Marcellin", price: 3.2, unit: "pièce", category: "Pâte molle" },
  { name: "Mimolette extra-vieille", price: 6.1, unit: "200g", category: "Pâte pressée" },
  { name: "Tomme de Savoie", price: 4.8, unit: "200g", category: "Pâte pressée" },
  { name: "Chèvre cendré", price: 3.8, unit: "pièce", category: "Chèvre" },
  { name: "Burrata des Pouilles", price: 5.9, unit: "pièce", category: "Frais" },
  { name: "Bleu d'Auvergne", price: 4.4, unit: "200g", category: "Bleu" },
  { name: "Mozzarella di Bufala", price: 4.8, unit: "pièce", category: "Frais" },
  { name: "Plateau dégustation", price: 28.0, unit: "4 pers.", category: "Plateau" },
];

const SNACKING_PRODUCTS = [
  { name: "Sandwich jambon-comté", price: 7.5, unit: "pièce", category: "Sandwich" },
  { name: "Sandwich poulet-pesto", price: 8.2, unit: "pièce", category: "Sandwich" },
  { name: "Tartine chèvre-miel", price: 9.4, unit: "pièce", category: "Tartine" },
  { name: "Tartine truite fumée", price: 11.2, unit: "pièce", category: "Tartine" },
  { name: "Salade burrata-tomates", price: 12.8, unit: "bol", category: "Salade" },
  { name: "Croque-monsieur truffé", price: 10.5, unit: "pièce", category: "Chaud" },
  { name: "Quiche du jour", price: 6.8, unit: "part", category: "Chaud" },
  { name: "Pan bagnat", price: 8.9, unit: "pièce", category: "Sandwich" },
  { name: "Wrap chèvre-figues", price: 8.4, unit: "pièce", category: "Sandwich" },
  { name: "Planche apéro", price: 16.5, unit: "2 pers.", category: "Planche" },
  { name: "Soupe du jour", price: 5.2, unit: "bol", category: "Chaud" },
  { name: "Café gourmand", price: 6.5, unit: "pièce", category: "Sucré" },
];

const CATALOG = [
  ...FROMAGERIE_PRODUCTS.map((p) => ({ ...p, segment: "Fromagerie" as Segment })),
  ...SNACKING_PRODUCTS.map((p) => ({ ...p, segment: "Snacking" as Segment })),
];

const HISTORY_DAYS = 540;

// Anchored "today" so screenshots and tests are reproducible.
// Override with the MOCK_TODAY env var on the server.
function getMockToday(): Date {
  const iso = process.env.MOCK_TODAY || "2026-05-19";
  return new Date(iso + "T18:30:00");
}

function dayFactor(d: Date): number {
  const dow = d.getDay();
  return [0.85, 0.78, 0.92, 0.98, 1.06, 1.28, 1.18][dow];
}

function generateDaily(store: StoreSeed, today: Date): StoreDaily[] {
  const rng = mulberry32(store.seed);
  const openedTs = new Date(store.openedDate + "T00:00:00").getTime();
  const series: StoreDaily[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dStartTs = new Date(iso + "T00:00:00").getTime();
    if (dStartTs < openedTs) {
      series.push({
        date: iso,
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
      });
      continue;
    }
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayMul = dayFactor(d) * (isWeekend ? store.weekendFactor : 1);
    const noise = 0.85 + rng() * 0.3;
    const ageYears = i / 365;
    const growth = store.yoyGrowth ?? 0;
    const yoyScale = Math.pow(1 + growth, -ageYears);
    const ca = store.baseCA * dayMul * noise * yoyScale;
    const tx =
      store.txPerDay *
      dayMul *
      (0.9 + rng() * 0.2) *
      Math.pow(1 + growth * 0.5, -ageYears);
    const fromagerieCA = Math.round(ca * (1 - store.snackingShare) * (0.92 + rng() * 0.16));
    const snackingCA = Math.round(ca * store.snackingShare * (0.92 + rng() * 0.16));
    const caHT = ca / 1.1; // approx 10% VAT for the mock
    series.push({
      date: iso,
      ca: Math.round(ca),
      caHT: Math.round(caHT * 100) / 100,
      tx: Math.round(tx),
      avgTicket: tx ? ca / tx : 0,
      avgTicketHT: tx ? caHT / tx : 0,
      fromagerieCA,
      fromagerieCAHT: Math.round((fromagerieCA / 1.1) * 100) / 100,
      snackingCA,
      snackingCAHT: Math.round((snackingCA / 1.1) * 100) / 100,
    });
  }
  // partial day for today
  const todayProgress = 0.78;
  const last = series[series.length - 1];
  if (!last.closed) {
    last.ca = Math.round(last.ca * todayProgress);
    last.tx = Math.round(last.tx * todayProgress);
    last.fromagerieCA = Math.round(last.fromagerieCA * todayProgress);
    last.snackingCA = Math.round(last.snackingCA * todayProgress);
    last.avgTicket = last.tx ? last.ca / last.tx : 0;
    last.partial = true;
  }
  return series;
}

function generateHourly(store: StoreSeed): StoreHourly[] {
  const rng = mulberry32(store.seed + 100);
  const profile: Record<number, number> = {
    7: 0.04, 8: 0.07, 9: 0.06, 10: 0.05, 11: 0.07,
    12: 0.18, 13: 0.16, 14: 0.07, 15: 0.04, 16: 0.05,
    17: 0.08, 18: 0.1, 19: 0.03,
  };
  const hours: StoreHourly[] = [];
  for (let h = 7; h <= 19; h++) {
    const share = profile[h] || 0;
    const noise = 0.85 + rng() * 0.3;
    hours.push({
      hour: h,
      ca: Math.round(store.baseCA * share * noise),
      tx: Math.round(store.txPerDay * share * noise),
      done: h < 18 || (h === 18 && rng() > 0.5),
    });
  }
  return hours;
}

function generateTopProducts(store: StoreSeed): Product[] {
  const rng = mulberry32(store.seed + 200);
  const products: Product[] = CATALOG.map((p) => {
    const segShare = p.segment === "Snacking" ? store.snackingShare : 1 - store.snackingShare;
    const pop = 0.3 + rng() * 1.4;
    const unitsBase = (store.baseCA * segShare * pop) / (p.price * 8);
    const units = Math.round(unitsBase * (0.7 + rng() * 0.6));
    return {
      name: p.name,
      segment: p.segment,
      category: p.category,
      unit: p.unit,
      price: p.price,
      unitsToday: Math.max(1, Math.round(units * 0.78)),
      units7d: Math.max(2, units * 7),
      units30d: Math.max(8, units * 30),
      revenue7d: Math.round(units * 7 * p.price),
      revenue30d: Math.round(units * 30 * p.price),
      revenue7dHT: Math.round((units * 7 * p.price) / 1.1),
      revenue30dHT: Math.round((units * 30 * p.price) / 1.1),
    };
  });
  return products.sort((a, b) => b.revenue30d - a.revenue30d);
}

function generatePayments(store: StoreSeed): PaymentSplit[] {
  const rng = mulberry32(store.seed + 300);
  const cb = 0.62 + rng() * 0.1;
  const remainder = 1 - cb;
  const ticketsRestoShare = store.snackingShare * 0.35;
  const tr = remainder * ticketsRestoShare;
  const especes = remainder * (1 - ticketsRestoShare) * 0.65;
  const sansContact = remainder * (1 - ticketsRestoShare) * 0.35;
  const total = cb + tr + especes + sansContact;
  return [
    { method: "Carte bancaire", share: cb / total },
    { method: "Sans contact", share: sansContact / total },
    { method: "Espèces", share: especes / total },
    { method: "Tickets resto", share: tr / total },
  ];
}

// Cache the heavy generation step per process so we don't redo it on every
// request during a dev session.
let cached:
  | {
      stores: Store[];
      data: Record<string, StoreData>;
      today: Date;
    }
  | null = null;

function build() {
  if (cached) return cached;
  const today = getMockToday();
  const data: Record<string, StoreData> = {};
  const stores: Store[] = STORE_SEEDS.map(({ seed: _s, baseCA: _b, weekendFactor: _w, snackingShare: _ss, avgTicket: _at, txPerDay: _tx, yoyGrowth: _y, ...rest }) => rest);
  for (const seed of STORE_SEEDS) {
    const { seed: _s, baseCA: _b, weekendFactor: _w, snackingShare: _ss, avgTicket: _at, txPerDay: _tx, yoyGrowth: _y, ...store } = seed;
    data[seed.id] = {
      ...store,
      daily: generateDaily(seed, today),
      hourly: generateHourly(seed),
      topProducts: generateTopProducts(seed),
      payments: generatePayments(seed),
      formules: {
        endDate: today.toISOString().slice(0, 10),
        days: 30,
        byKind: {
          grilled_cheese: { units: 0, ca: 0, caHT: 0 },
          sandwich: { units: 0, ca: 0, caHT: 0 },
        },
        snackingCA: 0,
        snackingCAHT: 0,
        snackingTx: 0,
      },
    };
  }
  cached = { stores, data, today };
  return cached;
}

export function listStores(): Store[] {
  return build().stores;
}

export function getStoreData(id: string): StoreData | null {
  const all = build().data;
  return all[id] ?? null;
}

export function getAllStoreData(): StoreData[] {
  const all = build().data;
  return Object.values(all);
}

export function getToday(): Date {
  return build().today;
}
