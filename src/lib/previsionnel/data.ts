import "server-only";
import { getStoreData } from "@/lib/apitic/client";
import { getPennylaneConfig } from "@/lib/pennylane/client";
import { fetchBankAccounts } from "@/lib/pennylane/treasury";
import { fetchAllTransactions, type RawBankTx } from "@/lib/pennylane/transactions-all";
import { counterpartyKey, prettyLabel, suggestKind } from "./classify";
import { cacheGet, cacheSet, getEvents, getRules, getSettings } from "./db";
import { addDays, buildPlan, shiftMonth } from "./engine";
import { getWeather } from "./weather";
import type { DailyHist, Doubt, Plan, Rule, Settings, Tx, EventDay } from "./types";

export function todayParis(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const TX_WINDOW_MONTHS = 13;

export type StoreContext = {
  storeId: string;
  today: string;
  month: string;
  daily: DailyHist[];
  txs: Tx[];
  rawTxCount: number;
  rules: Rule[];
  events: EventDay[];
  settings: Settings;
  openingBalance: number | null;
  balanceAsOf: string | null;
  bankAccounts: { name: string; balance: number }[];
  weatherError: string | null;
  txError: string | null;
  dailyError: string | null;
};

function toTx(raw: RawBankTx): Tx {
  const key = counterpartyKey(raw.label);
  return { id: raw.id, date: raw.date, amount: raw.amount, label: raw.label, key };
}

async function loadTransactions(storeId: string, token: string, minDate: string, maxDate: string, force: boolean) {
  const cacheKey = `tx:${storeId}:${minDate}`;
  if (!force) {
    const hit = await cacheGet<RawBankTx[]>(cacheKey, 30 * 60);
    if (hit) return hit;
  }
  const rows = await fetchAllTransactions(token, minDate, maxDate);
  await cacheSet(cacheKey, rows);
  return rows;
}

const isLoanAccount = (name: string) => /pr[êe]t|emprunt|cr[ée]dit bail|financement|ligne de/i.test(name);

export async function loadStoreContext(
  storeId: string,
  month: string,
  opts: { force?: boolean } = {},
): Promise<StoreContext> {
  const config = getPennylaneConfig(storeId);
  if (!config) throw new Error(`Pas de configuration Pennylane pour ${storeId}`);
  const today = todayParis();
  const minDate = `${shiftMonth(month, -TX_WINDOW_MONTHS)}-01`;
  const maxDate = addDays(today, 1);

  const [dailyRes, txRes, bankRes, rules, events, settings] = await Promise.allSettled([
    getStoreData(storeId),
    loadTransactions(storeId, config.token, minDate, maxDate, Boolean(opts.force)),
    fetchBankAccounts(config.token),
    getRules(storeId),
    getEvents(storeId),
    getSettings(storeId),
  ]);

  const daily: DailyHist[] =
    dailyRes.status === "fulfilled" && dailyRes.value
      ? dailyRes.value.daily.map((d) => ({
          date: d.date,
          ca: d.ca,
          cb: d.cbAmount,
          especes: d.especesAmount,
          tr: d.ticketsRestoAmount,
          virement: d.virementAmount,
          closed: d.closed,
          partial: d.partial,
        }))
      : [];
  const dailyError =
    dailyRes.status === "rejected" ? (dailyRes.reason as Error).message : dailyRes.value ? null : "Caisse indisponible";

  const rawTxs = txRes.status === "fulfilled" ? txRes.value : [];
  const txError = txRes.status === "rejected" ? (txRes.reason as Error).message : null;
  const txs = rawTxs.map(toTx);

  let openingBalance: number | null = null;
  let balanceAsOf: string | null = null;
  let bankAccounts: { name: string; balance: number }[] = [];
  if (bankRes.status === "fulfilled" && bankRes.value.length) {
    bankAccounts = bankRes.value.filter((a) => !isLoanAccount(a.name));
    openingBalance = Math.round(bankAccounts.reduce((s, a) => s + a.balance, 0) * 100) / 100;
    // Date de référence du solde : dernière transaction connue (la synchro bancaire ne date pas le solde).
    const lastTx = txs.filter((t) => t.date <= today).map((t) => t.date).sort().pop() ?? null;
    balanceAsOf = lastTx ?? addDays(today, -1);
  }

  if (rules.status === "rejected") throw rules.reason;
  if (events.status === "rejected") throw events.reason;
  if (settings.status === "rejected") throw settings.reason;

  return {
    storeId,
    today,
    month,
    daily,
    txs,
    rawTxCount: rawTxs.length,
    rules: rules.value,
    events: events.value,
    settings: settings.value,
    openingBalance,
    balanceAsOf,
    bankAccounts,
    weatherError: null,
    txError,
    dailyError,
  };
}

/** Contreparties sortantes non classées, au-dessus du seuil, triées par montant. */
export function buildDoubts(ctx: StoreContext): Doubt[] {
  const ruleKeys = new Set(ctx.rules.map((r) => r.key));
  const map = new Map<string, Doubt & { monthsSet: Set<string> }>();
  const monthsWindow = new Set<string>();
  for (const tx of ctx.txs) {
    monthsWindow.add(tx.date.slice(0, 7));
    if (tx.amount >= 0 || ruleKeys.has(tx.key)) continue;
    const d = map.get(tx.key) ?? {
      key: tx.key,
      label: prettyLabel(tx.key),
      count: 0,
      total: 0,
      lastDate: tx.date,
      lastAmount: -tx.amount,
      monthsPresent: 0,
      monthsWindow: 0,
      suggested: suggestKind(tx.key, tx.label),
      samples: [],
      monthsSet: new Set<string>(),
    };
    d.count += 1;
    d.total += -tx.amount;
    d.monthsSet.add(tx.date.slice(0, 7));
    if (tx.date >= d.lastDate) {
      d.lastDate = tx.date;
      d.lastAmount = -tx.amount;
    }
    if (d.samples.length < 3 && !d.samples.includes(tx.label)) d.samples.push(tx.label);
    map.set(tx.key, d);
  }
  return [...map.values()]
    .filter((d) => d.total >= ctx.settings.smallThreshold)
    .map(({ monthsSet, ...d }) => ({
      ...d,
      total: Math.round(d.total * 100) / 100,
      lastAmount: Math.round(d.lastAmount * 100) / 100,
      monthsPresent: monthsSet.size,
      monthsWindow: monthsWindow.size,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function buildStorePlan(ctx: StoreContext): Promise<Plan & { weatherError: string | null; txError: string | null; dailyError: string | null; bankAccounts: StoreContext["bankAccounts"] }> {
  let weather: Awaited<ReturnType<typeof getWeather>> = { days: [], error: null };
  if (ctx.settings.weatherEnabled) {
    try {
      weather = await getWeather(ctx.today);
    } catch (err) {
      weather = { days: [], error: (err as Error).message };
    }
  }
  const plan = buildPlan({
    storeId: ctx.storeId,
    month: ctx.month,
    today: ctx.today,
    daily: ctx.daily,
    txs: ctx.txs,
    rules: ctx.rules,
    events: ctx.events,
    weather: weather.days,
    settings: ctx.settings,
    openingBalance: ctx.openingBalance,
    balanceAsOf: ctx.balanceAsOf,
  });
  if (ctx.txError) plan.warnings.unshift(`Transactions Pennylane indisponibles : ${ctx.txError}`);
  if (ctx.dailyError) plan.warnings.unshift(`Historique caisse indisponible : ${ctx.dailyError}`);
  if (weather.error) plan.warnings.push(`Météo partielle : ${weather.error}`);
  return { ...plan, weatherError: weather.error, txError: ctx.txError, dailyError: ctx.dailyError, bankAccounts: ctx.bankAccounts };
}
