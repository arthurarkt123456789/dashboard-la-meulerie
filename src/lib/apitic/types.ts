// Shapes consumed by the dashboard UI. The APITIC adapter (and the mock)
// must produce exactly these. Adding fields here is the contract change point.

export type Segment = "Fromagerie" | "Snacking";

export type PeriodKey = "today" | "7d" | "30d" | "90d";

export type PeriodSelection =
  | { kind: "preset"; key: PeriodKey }
  | { kind: "month"; year: number; month: number /* 1..12 */ };

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
  ca: number;          // €
  tx: number;          // tickets
  avgTicket: number;
  fromagerieCA: number;
  snackingCA: number;
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
  revenue7d: number;
  revenue30d: number;
};

export type PaymentMethod = "Carte bancaire" | "Sans contact" | "Espèces" | "Tickets resto";

export type PaymentSplit = {
  method: PaymentMethod;
  share: number;       // 0..1
  amount?: number;     // €
};

export type StoreData = Store & {
  daily: StoreDaily[];
  hourly: StoreHourly[];
  topProducts: Product[];
  payments: PaymentSplit[];
};
