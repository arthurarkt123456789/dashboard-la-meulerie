import "server-only";
import { getStoreData } from "@/lib/apitic/client";
import { getPennylaneConfig } from "@/lib/pennylane/client";
import { fetchBankAccounts } from "@/lib/pennylane/treasury";
import { fetchAllTransactions, type RawBankTx } from "@/lib/pennylane/transactions-all";
import { LEDGER_WINDOW_MONTHS, fetchLedgerAccounts, fetchLedgerEntryLines, type LedgerAccount, type LedgerLine } from "@/lib/pennylane/ledger";
import { STORE_META } from "@/lib/apitic/mapping";
import { llmEnabled, narratePlan } from "./llm";
import { counterpartyKey } from "./classify";
import { cacheGet, cacheSet, getEvents, getRules, getSettings } from "./db";
import { addDays, buildPlan, shiftMonth } from "./engine";
import { getWeather } from "./weather";
import type { DailyHist, Plan, Rule, Settings, Tx, EventDay } from "./types";

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

async function settle<T>(p: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await p };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

export type StoreContext = {
  storeId: string;
  storeName: string;
  storeAddress: string;
  ledgerLines: LedgerLine[];
  ledgerAccounts: LedgerAccount[];
  ledgerError: string | null;
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

async function loadLedger(storeId: string, token: string, minDate: string, maxDate: string, force: boolean) {
  const key = `ledger:${storeId}:${minDate}`;
  if (!force) {
    const hit = await cacheGet<{ lines: LedgerLine[]; accounts: LedgerAccount[] }>(key, 24 * 3600);
    if (hit) return hit;
  }
  const [lines, accounts] = await Promise.all([fetchLedgerEntryLines(token, minDate, maxDate), fetchLedgerAccounts(token)]);
  const data = { lines, accounts };
  await cacheSet(key, data);
  return data;
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

  const ledgerMin = `${shiftMonth(month, -LEDGER_WINDOW_MONTHS)}-01`;
  // Pennylane en séquence (transactions, soldes, écritures) pour rester sous la limite de débit ;
  // caisse et base en parallèle.
  const pennylaneSeq = (async () => {
    const txRes = await settle(loadTransactions(storeId, config.token, minDate, maxDate, Boolean(opts.force)));
    const bankRes = await settle(fetchBankAccounts(config.token));
    const ledgerRes = await settle(loadLedger(storeId, config.token, ledgerMin, maxDate, Boolean(opts.force)));
    return { txRes, bankRes, ledgerRes };
  })();
  const [dailyRes, rules, events, settings, seq] = await Promise.allSettled([
    getStoreData(storeId),
    getRules(storeId),
    getEvents(storeId),
    getSettings(storeId),
    pennylaneSeq,
  ]);
  if (seq.status === "rejected") throw seq.reason;
  const { txRes, bankRes, ledgerRes } = seq.value;
  const meta = STORE_META.find((m) => m.id === storeId);

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
    storeName: meta?.name ?? storeId,
    storeAddress: meta?.address ?? "Marseille",
    ledgerLines: ledgerRes.status === "fulfilled" ? ledgerRes.value.lines : [],
    ledgerAccounts: ledgerRes.status === "fulfilled" ? ledgerRes.value.accounts : [],
    ledgerError: ledgerRes.status === "rejected" ? (ledgerRes.reason as Error).message : null,
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

export async function buildStorePlan(ctx: StoreContext): Promise<Plan & { weatherError: string | null; txError: string | null; dailyError: string | null; bankAccounts: StoreContext["bankAccounts"]; narrative: string | null }> {
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
    events: ctx.events.filter((e) => e.status !== "rejete"),
    weather: weather.days,
    settings: ctx.settings,
    openingBalance: ctx.openingBalance,
    balanceAsOf: ctx.balanceAsOf,
  });
  if (ctx.txError) plan.warnings.unshift(`Transactions Pennylane indisponibles : ${ctx.txError}`);
  if (ctx.dailyError) plan.warnings.unshift(`Historique caisse indisponible : ${ctx.dailyError}`);
  if (weather.error) plan.warnings.push(`Météo partielle : ${weather.error}`);

  // Lecture du trésorier (Claude), mise en cache sur les chiffres clés.
  let narrative: string | null = null;
  if (llmEnabled()) {
    const summary = {
      magasin: ctx.storeName,
      mois: plan.month,
      aujourdhui: plan.today,
      solde_actuel: plan.kpis.soldeActuel,
      solde_fin_mois: plan.kpis.soldeFinMois,
      fourchette: [plan.kpis.soldeFinMoisPessimiste, plan.kpis.soldeFinMoisOptimiste],
      point_bas: plan.kpis.pointBas,
      seuil_alerte: plan.kpis.alertThreshold,
      jours_sous_seuil: plan.kpis.joursSousSeuil,
      ca_prevu: plan.kpis.caMoisPrevu,
      ca_realise: plan.kpis.caMoisRealise,
      ca_n1: plan.kpis.caMoisN1,
      croissance: plan.hypotheses.growth,
      ratio_matiere: plan.hypotheses.matiereRatio,
      waterfall: plan.waterfall,
      echeances_a_venir: plan.fixedSchedule.filter((f) => f.projectedDates.length).slice(0, 12).map((f) => ({ libelle: f.label, nature: f.kind, montant: f.expectedAmount, dates: f.projectedDates })),
      evenements: ctx.events.filter((e) => e.date.startsWith(plan.month) && e.status !== "rejete").map((e) => ({ date: e.date, libelle: e.label, impact: e.impact, source: e.source })),
      meteo: plan.hypotheses.weather,
      avertissements: plan.warnings,
    };
    const key = `narrative:${ctx.storeId}:${plan.month}:${Math.round(plan.kpis.soldeFinMois)}:${Math.round(plan.kpis.pointBas.solde)}:${plan.kpis.caMoisPrevu.toFixed(0)}`;
    try {
      narrative = (await cacheGet<string>(key, 6 * 3600)) ?? (await narratePlan(summary));
      await cacheSet(key, narrative);
    } catch (err) {
      plan.warnings.push(`Lecture Claude indisponible : ${(err as Error).message}`);
    }
  }
  return { ...plan, weatherError: weather.error, txError: ctx.txError, dailyError: ctx.dailyError, bankAccounts: ctx.bankAccounts, narrative };
}
