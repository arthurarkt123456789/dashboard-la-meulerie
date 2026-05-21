// Shapes consumed by the dashboard UI. The APITIC adapter (and the mock)
// must produce exactly these. Adding fields here is the contract change point.

export type Segment = "Fromagerie" | "Snacking";

export type PeriodKey = "today" | "7d" | "30d" | "90d";

export type PeriodSelection =
  | { kind: "preset"; key: PeriodKey }
  | { kind: "month"; year: number; month: number /* 1..12 */ }
  | { kind: "range"; from: string; to: string /* YYYY-MM-DD */ }
  | { kind: "fiscal-year-todate" /* Oct 1 → today, FY runs Oct-Sep */ };

export type Store = {
  id: string;
  name: string;
  fullName: string;
  address: string;
  manager: string;
  /** Human label, e.g. "2019" or "nov. 2025" */
  opened: string;
  /** ISO YYYY-MM-DD, used for YoY comparability */
  openedDate: string;
};

export type StoreDaily = {
  date: string;        // YYYY-MM-DD
  ca: number;          // € TTC
  caHT: number;        // € HT
  tx: number;          // tickets
  avgTicket: number;
  avgTicketHT: number;
  fromagerieCA: number;
  fromagerieCAHT: number;
  snackingCA: number;
  snackingCAHT: number;
  /** Tickets with at least one Fromagerie line. Mixed tickets count in both. */
  fromagerieTx?: number;
  /** Tickets with at least one Snacking line. Mixed tickets count in both. */
  snackingTx?: number;
  closed?: boolean;    // day before store opened
  partial?: boolean;   // day in progress
};

export type StoreHourly = {
  hour: number;        // 7..19
  ca: number;
  tx: number;
  done: boolean;       // false = hour not yet reached
};

export type Product = {
  name: string;
  segment: Segment;
  category: string;
  unit: string;
  price: number;
  unitsToday: number;
  units7d: number;
  units30d: number;
  revenue7d: number;     // TTC
  revenue30d: number;    // TTC
  revenue7dHT: number;
  revenue30dHT: number;
};

export type PaymentMethod = "Carte bancaire" | "Sans contact" | "Espèces" | "Tickets resto";

export type PaymentSplit = {
  method: PaymentMethod;
  share: number;       // 0..1
  amount?: number;     // € TTC (what was actually collected)
  amountHT?: number;   // € HT (scaled using day's overall HT/TTC ratio)
};

export type FormuleKind = "grilled_cheese" | "sandwich";

export type FormuleStats = {
  /** ISO date this window ends on (inclusive). */
  endDate: string;
  /** Number of days aggregated. */
  days: number;
  /** Per-formule totals over the last `days` closed days. */
  byKind: Record<FormuleKind, { units: number; ca: number; caHT: number }>;
  /** Snacking totals over the same window (for the share denominators). */
  snackingCA: number;
  snackingCAHT: number;
  snackingTx: number;
};

export type StoreData = Store & {
  daily: StoreDaily[];
  hourly: StoreHourly[];
  topProducts: Product[];
  payments: PaymentSplit[];
  formules: FormuleStats;
};
