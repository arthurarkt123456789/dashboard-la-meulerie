// Ported from charts.jsx formatters. French locale, tabular nums everywhere.

import type { PeriodKey } from "./apitic/types";

const FR = "fr-FR";

export const fmtEUR = (n: number): string => {
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat(FR, { maximumFractionDigits: 0 }).format(n) + " €";
  }
  return new Intl.NumberFormat(FR, { maximumFractionDigits: 2 }).format(n) + " €";
};

export const fmtEURshort = (n: number): string => {
  if (Math.abs(n) >= 1000) {
    return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + "k €";
  }
  return Math.round(n) + " €";
};

export const fmtNum = (n: number): string =>
  new Intl.NumberFormat(FR, { maximumFractionDigits: 0 }).format(n);

export const fmtPct = (n: number): string =>
  (n >= 0 ? "+" : "") + (n * 100).toFixed(1).replace(".", ",") + " %";

export const fmtPctNoSign = (n: number): string =>
  (n * 100).toFixed(1).replace(".", ",") + " %";

const FR_MONTHS = [
  "jan", "fév", "mars", "avr", "mai", "juin",
  "juil", "août", "sept", "oct", "nov", "déc",
];
const FR_DAYS_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export function formatDateLabel(iso: string, period: PeriodKey): string {
  const d = new Date(iso + "T00:00:00");
  if (period === "today" || period === "7d") {
    return FR_DAYS_SHORT[d.getDay()] + " " + d.getDate();
  }
  if (period === "30d") {
    return d.getDate() + " " + FR_MONTHS[d.getMonth()];
  }
  return d.getDate() + "/" + (d.getMonth() + 1);
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return FR_DAYS_SHORT[d.getDay()] + " " + d.getDate() + " " + FR_MONTHS[d.getMonth()];
}
