// Moteur prévisionnel de trésorerie. Pur : aucune dépendance Next/DB/réseau.
//
// Entrées : historique de caisse (CA/jour), transactions bancaires classées,
// règles de classification, événements (manifs), météo, réglages.
// Sortie : plan jour par jour du mois demandé + hypothèses explicites.

import { holidayName } from "./holidays";
import type {
  Adjustment,
  DailyHist,
  EventDay,
  FixedScheduleItem,
  Plan,
  PlanDay,
  Rule,
  RuleKind,
  Settings,
  Tx,
  WeatherDay,
} from "./types";

// ── Dates ──────────────────────────────────────────────────────────────────────

export function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDates(ym: string): string[] {
  const n = daysInMonth(ym);
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Même date calendaire un an plus tôt (29/02 → 28/02). */
function sameDateLastYear(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const target = new Date(Date.UTC(y - 1, m - 1, Math.min(d, 28)));
  if (d > 28) {
    const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
  }
  return target.toISOString().slice(0, 10);
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ── Entrée du moteur ───────────────────────────────────────────────────────────

export type EngineInput = {
  storeId: string;
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD (Paris)
  daily: DailyHist[];
  txs: Tx[];
  rules: Rule[];
  events: EventDay[];
  weather: WeatherDay[];
  settings: Settings;
  openingBalance: number | null;
  balanceAsOf: string | null;
  adjustments?: Adjustment[];
};

// ── Modèle de CA ───────────────────────────────────────────────────────────────

type CaModel = {
  growth: number;
  growthWindow: string;
  growthN: number;
  growthN1: number;
  weekdayMeans: number[];
  rainEffect: number | null;
  coldEffect: number | null;
  rainSamples: number;
  coldSamples: number;
  eventsCalibration: Plan["hypotheses"]["eventsCalibration"];
};

const RAIN_MM = 2;
const COLD_TMAX = 12;

function isDisturbed(dateISO: string, eventMap: Map<string, EventDay>): boolean {
  return eventMap.has(dateISO) || holidayName(dateISO) !== null;
}

/** Moyennes par jour de semaine sur les 8 dernières semaines closes, hors jours perturbés. */
function weekdayMeans(
  dailyMap: Map<string, DailyHist>,
  today: string,
  eventMap: Map<string, EventDay>,
): number[] {
  const sums = Array(7).fill(0) as number[];
  const counts = Array(7).fill(0) as number[];
  for (let i = 1; i <= 56; i++) {
    const d = addDays(today, -i);
    const h = dailyMap.get(d);
    if (!h || h.closed || h.partial) continue;
    if (isDisturbed(d, eventMap)) continue;
    const wd = weekdayOf(d);
    sums[wd] += h.ca;
    counts[wd] += 1;
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
}

/** Croissance : 4 dernières semaines closes vs mêmes semaines N-1 (alignées jour de semaine). */
function growthRate(
  dailyMap: Map<string, DailyHist>,
  today: string,
  eventMap: Map<string, EventDay>,
): { growth: number; window: string; n: number; n1: number } {
  // Fenêtre : 28 jours clos se terminant hier.
  const end = addDays(today, -1);
  const start = addDays(end, -27);
  let n = 0;
  let n1 = 0;
  let pairs = 0;
  for (let i = 0; i < 28; i++) {
    const d = addDays(start, i);
    const d1 = addDays(d, -364);
    const h = dailyMap.get(d);
    const h1 = dailyMap.get(d1);
    if (!h || !h1 || h.closed || h1.closed || h.partial) continue;
    if (isDisturbed(d, eventMap) || isDisturbed(d1, eventMap)) continue;
    if (h.ca <= 0 && h1.ca <= 0) continue;
    n += h.ca;
    n1 += h1.ca;
    pairs++;
  }
  if (pairs < 10 || n1 <= 0) {
    return { growth: 1, window: `${start} → ${end}`, n, n1 };
  }
  return { growth: clamp(n / n1, 0.5, 1.6), window: `${start} → ${end}`, n, n1 };
}

/** Ratio CA réel / moyenne du même jour de semaine sur ±4 semaines autour. */
function localRatio(dailyMap: Map<string, DailyHist>, dateISO: string, eventMap: Map<string, EventDay>): number | null {
  const h = dailyMap.get(dateISO);
  if (!h || h.closed || h.partial || h.ca <= 0) return null;
  const peers: number[] = [];
  for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) {
    const d = addDays(dateISO, k * 7);
    const p = dailyMap.get(d);
    if (!p || p.closed || p.partial || p.ca <= 0) continue;
    if (isDisturbed(d, eventMap)) continue;
    peers.push(p.ca);
  }
  if (peers.length < 4) return null;
  return h.ca / mean(peers);
}

function weatherEffects(
  dailyMap: Map<string, DailyHist>,
  weather: WeatherDay[],
  today: string,
  eventMap: Map<string, EventDay>,
): { rainEffect: number | null; coldEffect: number | null; rainSamples: number; coldSamples: number } {
  const rainy: number[] = [];
  const dry: number[] = [];
  const cold: number[] = [];
  const mild: number[] = [];
  for (const w of weather) {
    if (w.date >= today) continue;
    if (w.precip === null && w.tmax === null) continue;
    if (isDisturbed(w.date, eventMap)) continue;
    const r = localRatio(dailyMap, w.date, eventMap);
    if (r === null) continue;
    if (w.precip !== null) (w.precip >= RAIN_MM ? rainy : dry).push(r);
    if (w.tmax !== null) (w.tmax < COLD_TMAX ? cold : mild).push(r);
  }
  const effect = (a: number[], b: number[]) =>
    a.length >= 10 && b.length >= 10 ? clamp(mean(a) / mean(b) - 1, -0.5, 0.5) : null;
  return {
    rainEffect: effect(rainy, dry),
    coldEffect: effect(cold, mild),
    rainSamples: rainy.length,
    coldSamples: cold.length,
  };
}

function buildCaModel(
  dailyMap: Map<string, DailyHist>,
  today: string,
  events: EventDay[],
  weather: WeatherDay[],
  settings: Settings,
): CaModel {
  const eventMap = new Map(events.map((e) => [e.date, e]));
  const g = growthRate(dailyMap, today, eventMap);
  const wm = weekdayMeans(dailyMap, today, eventMap);
  const we = settings.weatherEnabled
    ? weatherEffects(dailyMap, weather, today, eventMap)
    : { rainEffect: null, coldEffect: null, rainSamples: 0, coldSamples: 0 };

  // Calibration des manifs passées : CA réel vs attendu (hors météo pour rester lisible).
  const eventsCalibration: CaModel["eventsCalibration"] = [];
  for (const e of events) {
    if (e.date >= today) continue;
    const h = dailyMap.get(e.date);
    if (!h || h.closed || h.partial) continue;
    const base = baseline(dailyMap, e.date, g.growth, wm, eventMap);
    if (base.value <= 0) continue;
    eventsCalibration.push({
      date: e.date,
      label: e.label,
      expected: round2(base.value),
      actual: round2(h.ca),
      observedImpact: round2(h.ca / base.value - 1),
    });
  }

  return {
    growth: g.growth,
    growthWindow: g.window,
    growthN: round2(g.n),
    growthN1: round2(g.n1),
    weekdayMeans: wm.map(round2),
    ...we,
    eventsCalibration,
  };
}

/** CA de base d'un jour : N-1 aligné jour de semaine × croissance, sinon moyenne du jour de semaine. */
function baseline(
  dailyMap: Map<string, DailyHist>,
  dateISO: string,
  growth: number,
  weekdayMeansArr: number[],
  eventMap: Map<string, EventDay>,
): { value: number; source: PlanDay["ca"]["baseSource"]; n1: number | null } {
  const holiday = holidayName(dateISO);
  const wd = weekdayOf(dateISO);

  if (holiday) {
    // Férié : même date calendaire N-1 (le magasin suit le calendrier, pas le jour de semaine).
    const d1 = sameDateLastYear(dateISO);
    const h1 = dailyMap.get(d1);
    if (h1 && !h1.closed) return { value: h1.ca * growth, source: "n1", n1: h1.ca };
    // Sans N-1 : moyenne du jour de semaine, réduite de moitié faute de mieux.
    return { value: weekdayMeansArr[wd] * 0.5, source: "weekday-mean", n1: null };
  }

  const d1 = addDays(dateISO, -364);
  const h1 = dailyMap.get(d1);
  const n1Usable = h1 && !h1.closed && !h1.partial && !isDisturbed(d1, eventMap);
  if (n1Usable) {
    // Si le jour N-1 était nul alors que ce jour de semaine est ouvert en moyenne, on prend la moyenne.
    if (h1.ca <= 0 && weekdayMeansArr[wd] > 0) {
      return { value: weekdayMeansArr[wd], source: "weekday-mean", n1: h1.ca };
    }
    return { value: h1.ca * growth, source: "n1", n1: h1.ca };
  }
  if (weekdayMeansArr[wd] > 0) return { value: weekdayMeansArr[wd], source: "weekday-mean", n1: null };
  return { value: 0, source: "closed", n1: null };
}

// ── Transactions : regroupement, fréquence, calendrier ─────────────────────────

type KeyStats = {
  key: string;
  label: string;
  kind: RuleKind;
  byMonth: Map<string, { total: number; count: number; days: number[]; weekdays: number[] }>;
  dates: string[];
};

function groupOutflows(txs: Tx[], ruleMap: Map<string, Rule>): Map<string, KeyStats> {
  const map = new Map<string, KeyStats>();
  for (const tx of txs) {
    if (tx.amount >= 0) continue;
    const rule = ruleMap.get(tx.key);
    const kind: RuleKind = rule?.kind ?? "fixe";
    const st: KeyStats = map.get(tx.key) ?? {
      key: tx.key,
      label: rule?.label ?? tx.label,
      kind,
      byMonth: new Map(),
      dates: [],
    };
    const ym = tx.date.slice(0, 7);
    const m = st.byMonth.get(ym) ?? { total: 0, count: 0, days: [] as number[], weekdays: [] as number[] };
    m.total += -tx.amount;
    m.count += 1;
    m.days.push(Number(tx.date.slice(8, 10)));
    m.weekdays.push(weekdayOf(tx.date));
    st.byMonth.set(ym, m);
    st.dates.push(tx.date);
    map.set(tx.key, st);
  }
  return map;
}

function mode(values: number[]): number | null {
  if (!values.length) return null;
  const c = new Map<number, number>();
  for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Nature annuelle probable : taxes locales, assurances, cotisations, abonnements annuels. */
const ANNUAL_RE = /\b(CFE|CVAE|TAXE|FONCIER|FONCIERE|ASSURANCE|ASSURANCES|AXA|ALLIANZ|HISCOX|GENERALI|MAAF|MMA|SACEM|SPRE|COTISATION|ADHESION|ANNUEL|ANNUELLE|CCI|CMA|FORMATION)\b/;
const ANNUAL_ACCOUNTS = /^(616|635|637|6281|6283|6354)/;

function annualLikely(rule: Rule | undefined, key: string, label: string): boolean {
  if (rule?.kind !== "fixe") return false;
  if (ANNUAL_RE.test(`${key} ${label}`.toUpperCase())) return true;
  return (rule.accounts ?? []).some((a) => ANNUAL_ACCOUNTS.test(a.replace(/\D/g, "")));
}

/** Construit le calendrier projeté d'une contrepartie fixe / hors exploitation. */
function scheduleItem(
  st: KeyStats,
  rule: Rule | undefined,
  month: string,
  today: string,
  windowMonths: string[],
  actualDatesThisMonth: string[],
): FixedScheduleItem {
  const histMonths = windowMonths.filter((m) => m < month);
  const present = histMonths.filter((m) => st.byMonth.has(m));
  const monthlyTotals = present.map((m) => st.byMonth.get(m)!.total);
  const avgCount = present.length ? mean(present.map((m) => st.byMonth.get(m)!.count)) : 0;
  const presence = histMonths.length ? present.length / histMonths.length : 0;

  const allDays = present.flatMap((m) => st.byMonth.get(m)!.days);
  const allWeekdays = present.flatMap((m) => st.byMonth.get(m)!.weekdays);
  const perOccurrence = present.map((m) => {
    const mm = st.byMonth.get(m)!;
    return mm.total / mm.count;
  });
  const sortedDates = [...st.dates].sort();
  const lastDate = sortedDates[sortedDates.length - 1] ?? null;

  let frequency: FixedScheduleItem["frequency"];
  if (avgCount >= 3.5) frequency = "hebdo";
  else if (presence >= 0.6) frequency = "mensuel";
  else frequency = "irregulier";

  const overridden = rule?.expectedAmount != null || rule?.expectedDay != null;
  const expectedAmount = rule?.expectedAmount != null ? rule.expectedAmount : median(monthlyTotals);
  const expectedDay = rule?.expectedDay != null ? rule.expectedDay : Math.round(median(allDays)) || null;
  const weekday = frequency === "hebdo" ? mode(allWeekdays) : null;

  const paidThisMonth = actualDatesThisMonth.length;
  const dates = monthDates(month);
  const projected = [] as string[];
  let status: FixedScheduleItem["status"] = "projete";
  let statusReason = "";

  const placeOnDay = (day: number) => {
    const dim = daysInMonth(month);
    let d = `${month}-${String(Math.min(Math.max(1, day), dim)).padStart(2, "0")}`;
    // Échéance passée sans sortie constatée : décalée à demain.
    if (d < today) d = addDays(today, 1);
    if (d.slice(0, 7) === month) projected.push(d);
  };

  if (frequency === "hebdo" && weekday !== null) {
    for (const d of dates) {
      if (d < today) continue;
      if (weekdayOf(d) === weekday) projected.push(d);
    }
    statusReason = `Hebdomadaire, ${present.length} mois observés`;
  } else if (frequency === "mensuel") {
    if (paidThisMonth === 0 && expectedDay) placeOnDay(expectedDay);
    statusReason = `Mensuel, ${present.length}/${histMonths.length} mois observés`;
  } else {
    // Irrégulier : jamais reprojeté sur la seule base de l'an dernier.
    const n1Month = shiftMonth(month, -12);
    const n1 = st.byMonth.get(n1Month);
    const gaps: number[] = [];
    const monthsSorted = [...present].sort();
    for (let i = 1; i < monthsSorted.length; i++) {
      const [y0, m0] = monthsSorted[i - 1].split("-").map(Number);
      const [y1, m1] = monthsSorted[i].split("-").map(Number);
      gaps.push((y1 - y0) * 12 + (m1 - m0));
    }
    const regularGap = gaps.length >= 2 && gaps.every((g) => g === gaps[0]) ? gaps[0] : null; // trimestriel, semestriel…
    const dueByGap = regularGap !== null && lastDate !== null && shiftMonth(lastDate.slice(0, 7), regularGap) === month;
    const recurrence = rule?.recurrence ?? "auto";
    const amountGuess = rule?.expectedAmount ?? n1?.total ?? expectedAmount;
    const dayGuess = rule?.expectedDay ?? (n1 ? Math.round(median(n1.days)) : expectedDay ?? 15);

    if (recurrence === "exclure") {
      status = "exclu";
      statusReason = "Exclu par toi";
    } else if (recurrence === "inclure") {
      status = "projete";
      statusReason = "Attendu ce mois-ci (ta décision)";
      if (paidThisMonth === 0) placeOnDay(dayGuess);
    } else if (dueByGap) {
      status = "projete";
      statusReason = `Périodicité ${regularGap} mois constatée sur ${present.length} occurrences, échéance ce mois`;
      if (paidThisMonth === 0) placeOnDay(dayGuess);
    } else if (rule?.kind === "hors_exploitation") {
      status = "exclu";
      statusReason = `Hors exploitation irrégulier (dividendes, impôt sur les sociétés, compte courant…) : non retenu sans ta décision${n1 ? `, sorti en ${n1Month}` : ""}`;
    } else if (n1 && annualLikely(rule, st.key, st.label)) {
      status = "propose";
      statusReason = `Nature annuelle probable, sorti en ${n1Month} (${Math.round(n1.total)} €) : retenu, retirable`;
      if (paidThisMonth === 0) placeOnDay(dayGuess);
    } else {
      status = "exclu";
      statusReason = n1
        ? `Sorti en ${n1Month} mais sans périodicité prouvée : non retenu`
        : `Irrégulier (${present.length} mois sur ${histMonths.length}) : non retenu`;
    }

    return {
      key: st.key,
      label: st.label,
      kind: st.kind,
      frequency,
      expectedAmount: round2(amountGuess),
      expectedDay: dayGuess,
      weekday: null,
      observedMonths: present.length,
      observedAmounts: monthlyTotals.map(round2),
      projectedDates: projected,
      paidThisMonth,
      overridden,
      status,
      statusReason,
      lastDate,
    };
  }

  const perOcc = frequency === "hebdo" ? median(perOccurrence) : expectedAmount;
  return {
    key: st.key,
    label: st.label,
    kind: st.kind,
    frequency,
    expectedAmount: round2(frequency === "hebdo" ? perOcc : expectedAmount),
    expectedDay,
    weekday,
    observedMonths: present.length,
    observedAmounts: monthlyTotals.map(round2),
    projectedDates: projected,
    paidThisMonth,
    overridden,
    status,
    statusReason,
    lastDate,
  };
}

// ── Moteur principal ───────────────────────────────────────────────────────────

export function buildPlan(input: EngineInput): Plan {
  const { storeId, month, today, settings } = input;
  const warnings: string[] = [];
  const dailyMap = new Map(input.daily.map((d) => [d.date, d]));
  const ruleMap = new Map(input.rules.map((r) => [r.key, r]));
  const eventMap = new Map(input.events.map((e) => [e.date, e]));
  const weatherMap = new Map(input.weather.map((w) => [w.date, w]));

  const model = buildCaModel(dailyMap, today, input.events, input.weather, settings);
  if (model.growthN1 <= 0) warnings.push("Pas de N-1 exploitable sur les 4 dernières semaines : croissance fixée à 0 %.");
  if (settings.weatherEnabled && model.rainEffect === null) warnings.push("Effet pluie non calibré (moins de 10 jours de pluie comparables) : ignoré.");

  // ── Répartition des encaissements ──
  const shareWindow: DailyHist[] = [];
  for (let i = 1; i <= 28; i++) {
    const h = dailyMap.get(addDays(today, -i));
    if (h && !h.closed && h.ca > 0) shareWindow.push(h);
  }
  const withSplit = shareWindow.filter((h) => (h.cb ?? 0) + (h.especes ?? 0) + (h.tr ?? 0) + (h.virement ?? 0) > 0);
  let shares = { cb: 0.8, especes: 0.1, tr: 0.08, virement: 0.02 };
  if (withSplit.length >= 7) {
    const tot = withSplit.reduce((s, h) => s + (h.cb ?? 0) + (h.especes ?? 0) + (h.tr ?? 0) + (h.virement ?? 0), 0);
    if (tot > 0) {
      shares = {
        cb: withSplit.reduce((s, h) => s + (h.cb ?? 0), 0) / tot,
        especes: withSplit.reduce((s, h) => s + (h.especes ?? 0), 0) / tot,
        tr: withSplit.reduce((s, h) => s + (h.tr ?? 0), 0) / tot,
        virement: withSplit.reduce((s, h) => s + (h.virement ?? 0), 0) / tot,
      };
    }
  } else {
    warnings.push("Répartition CB / espèces / TR non disponible en caisse : valeurs par défaut (80/10/8/2).");
  }

  // ── Fenêtre transactions ──
  const txMonths = [...new Set(input.txs.map((t) => t.date.slice(0, 7)))].sort();
  const windowMonths = txMonths.length ? txMonths : [month];
  const groups = groupOutflows(input.txs, ruleMap);

  // Contreparties sans règle : "divers" si petites, sinon traitées comme fixes (en attendant une réponse).
  const unclassifiedKeys = [...groups.values()].filter((g) => !ruleMap.has(g.key));
  const bigUnclassified = unclassifiedKeys.filter((g) => {
    const tot = [...g.byMonth.values()].reduce((s, m) => s + m.total, 0);
    return tot >= settings.smallThreshold;
  });
  if (bigUnclassified.length) {
    warnings.push(`${bigUnclassified.length} contrepartie(s) non classée(s) traitée(s) comme charges fixes par défaut.`);
  }

  // ── Ratios matière et variable (3 derniers mois clos) ──
  const closedMonths = windowMonths.filter((m) => m < month).slice(-3);
  const caOfMonth = (ym: string) =>
    monthDates(ym).reduce((s, d) => s + (dailyMap.get(d)?.ca ?? 0), 0);
  const sumKind = (ym: string, kind: RuleKind) =>
    [...groups.values()]
      .filter((g) => (ruleMap.get(g.key)?.kind ?? null) === kind)
      .reduce((s, g) => s + (g.byMonth.get(ym)?.total ?? 0), 0);

  const matiereRatioMonths = closedMonths.map((ym) => {
    const caRef = caOfMonth(shiftMonth(ym, -settings.matiereLagMonths));
    const mat = sumKind(ym, "matiere");
    return { month: ym, matiere: round2(mat), ca: round2(caRef), ratio: caRef > 0 ? round2(mat / caRef * 10000) / 10000 : null };
  });
  const validRatios = matiereRatioMonths.filter((m) => m.ratio !== null && m.ca > 0 && m.matiere > 0);
  const matiereRatioCalcule = validRatios.length
    ? validRatios.reduce((s, m) => s + m.matiere, 0) / validRatios.reduce((s, m) => s + m.ca, 0)
    : null;
  const matiereRatio = settings.matiereRatioOverride !== null && settings.matiereRatioOverride !== undefined
    ? settings.matiereRatioOverride
    : matiereRatioCalcule;
  if (matiereRatio === null) warnings.push("Aucune contrepartie classée « matière » sur les 3 derniers mois : sorties matière non projetées.");

  const varTot = closedMonths.reduce((s, ym) => s + sumKind(ym, "variable"), 0);
  const caTot = closedMonths.reduce((s, ym) => s + caOfMonth(ym), 0);
  const variableRatio = caTot > 0 && varTot > 0 ? varTot / caTot : null;

  // Divers : petites contreparties non classées, moyenne par jour sur les mois clos.
  const smallKeys = unclassifiedKeys.filter((g) => !bigUnclassified.includes(g));
  const diversTot = closedMonths.reduce(
    (s, ym) => s + smallKeys.reduce((ss, g) => ss + (g.byMonth.get(ym)?.total ?? 0), 0),
    0,
  );
  const diversDays = closedMonths.reduce((s, ym) => s + daysInMonth(ym), 0);
  const diversPerDay = diversDays ? diversTot / diversDays : 0;

  // ── Répartition hebdo des paiements matière ──
  const matWeekday = Array(7).fill(0) as number[];
  for (const ym of closedMonths) {
    for (const g of groups.values()) {
      if (ruleMap.get(g.key)?.kind !== "matiere") continue;
      const mm = g.byMonth.get(ym);
      if (!mm) continue;
      const per = mm.total / mm.count;
      for (const wd of mm.weekdays) matWeekday[wd] += per;
    }
  }
  const matWdTot = matWeekday.reduce((a, b) => a + b, 0);
  const matWdShare = matWdTot > 0 ? matWeekday.map((v) => v / matWdTot) : [0, 0.2, 0.2, 0.2, 0.2, 0.2, 0];

  // ── Calendrier des sorties fixes / hors exploitation ──
  const txThisMonth = input.txs.filter((t) => t.date.slice(0, 7) === month && t.date < today);
  const fixedSchedule: FixedScheduleItem[] = [];
  for (const g of groups.values()) {
    const rule = ruleMap.get(g.key);
    const kind = rule?.kind ?? (bigUnclassified.includes(g) ? "fixe" : null);
    if (kind !== "fixe" && kind !== "hors_exploitation") continue;
    const actualDates = txThisMonth.filter((t) => t.key === g.key && t.amount < 0).map((t) => t.date);
    const item = scheduleItem({ ...g, kind }, rule, month, today, windowMonths, actualDates);
    if (item.observedMonths === 0 && !item.projectedDates.length) continue; // vu seulement ce mois-ci : rien à projeter
    if (item.projectedDates.length || item.paidThisMonth || item.status !== "projete") fixedSchedule.push(item);
  }
  // Échéance mensuelle déjà réglée sous un autre libellé : même montant (±15 %) et un mot en commun.
  const GENERIC = new Set(["SEPA", "VIR", "PRLV", "CARTE", "SAS", "SARL", "LA", "LE", "DE", "DU", "ET"]);
  const tokens = (k: string) =>
    k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !GENERIC.has(t));
  const claimed = new Set<string>();
  for (const it of fixedSchedule) {
    if (it.frequency !== "mensuel" || it.paidThisMonth > 0 || it.projectedDates.length === 0 || it.expectedAmount <= 0) continue;
    const itTokens = tokens(it.key);
    const hit = txThisMonth.find((t) => {
      if (t.amount >= 0 || t.key === it.key || claimed.has(t.id)) return false;
      if (Math.abs(-t.amount - it.expectedAmount) > it.expectedAmount * 0.15) return false;
      const tt = tokens(`${t.key} ${t.label}`);
      return itTokens.some((x) => tt.includes(x));
    });
    if (!hit) continue;
    claimed.add(hit.id);
    it.paidThisMonth = 1;
    it.projectedDates = [];
    it.statusReason = `Réglé le ${hit.date.slice(8)} sous le libellé « ${hit.label.slice(0, 40)} »`;
  }
  const rank = (i: FixedScheduleItem) => (i.projectedDates.length || i.paidThisMonth ? 0 : i.status === "propose" ? 1 : 2);
  fixedSchedule.sort((a, b) => rank(a) - rank(b) || b.expectedAmount - a.expectedAmount);
  const excluded = fixedSchedule.filter((i) => i.status === "exclu" && !i.paidThisMonth);
  if (excluded.length) {
    warnings.push(`${excluded.length} sortie(s) irrégulière(s) non retenue(s) (${excluded.slice(0, 3).map((i) => i.label).join(", ")}${excluded.length > 3 ? "…" : ""}) : voir l'échéancier pour les attendre ce mois-ci.`);
  }

  // ── Jour par jour ──
  const dates = monthDates(month);
  const forecastDates = dates.filter((d) => d >= today);
  // CA prévu du mois (pour répartir matière + variable).
  const caForecast = new Map<string, PlanDay["ca"]>();
  const forcedOpenWeekdays = settings.forceOpenWeekdays ?? [];
  const forcedClosedWeekdays = settings.forceClosedWeekdays ?? [];
  for (const d of dates) {
    const h = dailyMap.get(d);
    const base = baseline(dailyMap, d, model.growth, model.weekdayMeans, eventMap);
    const wd = weekdayOf(d);
    let effectiveBase = base;
    // Jours forcés ouverts (normalement fermés) : on estime le CA.
    if (base.source === "closed" && d >= today && forcedOpenWeekdays.includes(wd)) {
      const specific = settings.forceOpenCa?.[String(wd)];
      let est: number;
      if (specific !== undefined && specific > 0) {
        est = specific;
      } else {
        const nonZero = model.weekdayMeans.filter((v) => v > 0);
        est = nonZero.length ? mean(nonZero) * 0.7 : 0;
      }
      effectiveBase = { value: round2(est), source: "weekday-mean", n1: null };
    }
    // Jours forcés fermés (normalement ouverts) : CA = 0 sur les jours futurs uniquement.
    if (d >= today && forcedClosedWeekdays.includes(wd)) {
      effectiveBase = { value: 0, source: "closed", n1: null };
    }
    const ev = eventMap.get(d) ?? null;
    const w = weatherMap.get(d);
    let weatherFactor = 1;
    if (settings.weatherEnabled && w) {
      if (model.rainEffect !== null && w.precip !== null && w.precip >= RAIN_MM) weatherFactor *= 1 + model.rainEffect;
      if (model.coldEffect !== null && w.tmax !== null && w.tmax < COLD_TMAX) weatherFactor *= 1 + model.coldEffect;
    }
    const eventFactor = ev ? 1 + ev.impact : 1;
    const forecast = effectiveBase.value * weatherFactor * eventFactor;
    const isPast = d < today;
    const actual = h && !h.closed ? h.ca : null;
    let source: PlanDay["ca"]["source"] = "forecast";
    let value = forecast;
    if (isPast && actual !== null) {
      source = "actual";
      value = actual;
    } else if (d === today && h?.partial) {
      source = "partial";
      value = Math.max(forecast, actual ?? 0);
    }
    caForecast.set(d, {
      value: round2(value),
      source,
      base: round2(effectiveBase.value),
      baseSource: effectiveBase.source,
      n1: effectiveBase.n1 !== null ? round2(effectiveBase.n1) : null,
      growth: round2(model.growth),
      weatherFactor: round2(weatherFactor),
      eventFactor: round2(eventFactor),
    });
  }
  const caMonthForecast = forecastDates.reduce((s, d) => s + caForecast.get(d)!.value, 0);
  const forecastWdCount = Array(7).fill(0) as number[];
  for (const d of forecastDates) forecastWdCount[weekdayOf(d)]++;

  // Encaissements bancaires différés : CA(d) × part CB arrive à d + délai.
  const bankIn = new Map<string, { cb: number; tr: number; virement: number }>();
  const addIn = (d: string, k: "cb" | "tr" | "virement", v: number) => {
    const e = bankIn.get(d) ?? { cb: 0, tr: 0, virement: 0 };
    e[k] += v;
    bankIn.set(d, e);
  };
  // On part des 15 jours précédant le début de mois pour capter les délais.
  for (let i = -15; i < dates.length; i++) {
    const d = i < 0 ? addDays(dates[0], i) : dates[i];
    const ca = i < 0 ? (dailyMap.get(d)?.ca ?? 0) : caForecast.get(d)!.value;
    if (ca <= 0) continue;
    addIn(addDays(d, settings.cbDelayDays), "cb", ca * shares.cb);
    addIn(addDays(d, settings.trDelayDays), "tr", ca * shares.tr);
    addIn(d, "virement", ca * shares.virement);
  }

  // Solde d'ouverture.
  let opening: Plan["opening"];
  if (settings.openingBalanceOverride !== null) {
    opening = { balance: settings.openingBalanceOverride, asOf: addDays(today, -1), source: "override" };
  } else if (input.openingBalance !== null) {
    opening = { balance: input.openingBalance, asOf: input.balanceAsOf ?? addDays(today, -1), source: "bank-sync" };
  } else {
    opening = { balance: 0, asOf: addDays(today, -1), source: "none" };
    warnings.push("Solde bancaire indisponible : saisir un solde d'ouverture dans les réglages.");
  }

  // Flux réels par jour (transactions du mois, hors « ignorer »).
  const actualByDay = new Map<string, { in: number; items: PlanDay["sorties"]["items"]; byKind: Record<RuleKind, number>; unclassified: number }>();
  for (const t of input.txs) {
    if (t.date.slice(0, 7) !== month) continue;
    const rule = ruleMap.get(t.key);
    if (rule?.kind === "ignorer") continue;
    const e = actualByDay.get(t.date) ?? {
      in: 0,
      items: [],
      byKind: { matiere: 0, fixe: 0, hors_exploitation: 0, variable: 0, ignorer: 0 },
      unclassified: 0,
    };
    if (t.amount > 0) e.in += t.amount;
    else {
      const amt = -t.amount;
      if (rule) {
        e.byKind[rule.kind] += amt;
        e.items.push({ label: rule.label, amount: round2(amt), kind: rule.kind, status: "actual" });
      } else {
        e.unclassified += amt;
        e.items.push({ label: t.label, amount: round2(amt), kind: "fixe", status: "actual" });
      }
    }
    actualByDay.set(t.date, e);
  }

  const days: PlanDay[] = [];
  const spread = settings.scenarioSpread;
  // Les soldes passés sont reconstitués à rebours depuis le solde connu.
  let solde = opening.balance;
  let soldeOpt = opening.balance;
  let soldePess = opening.balance;
  let soldeExpl = opening.balance;
  const asOf = opening.asOf;

  for (const d of dates) {
    const ca = caForecast.get(d)!;
    const isPast = d < today;
    const actual = actualByDay.get(d);
    const useActualFlows = d <= asOf && actual !== undefined;
    const w = weatherMap.get(d);
    const ev = eventMap.get(d) ?? null;

    // Encaissements
    const inPlanned = bankIn.get(d) ?? { cb: 0, tr: 0, virement: 0 };
    const especes = ca.value * shares.especes;
    const enc = useActualFlows
      ? { cb: actual.in, tr: 0, virement: 0, especes: round2(especes), bank: actual.in, source: "actual" as const }
      : {
          cb: round2(inPlanned.cb),
          tr: round2(inPlanned.tr),
          virement: round2(inPlanned.virement),
          especes: round2(especes),
          bank: round2(inPlanned.cb + inPlanned.tr + inPlanned.virement),
          source: "forecast" as const,
        };

    // Sorties
    let sorties: PlanDay["sorties"];
    if (useActualFlows) {
      sorties = {
        matiere: round2(actual.byKind.matiere),
        fixe: round2(actual.byKind.fixe + actual.unclassified),
        horsExploitation: round2(actual.byKind.hors_exploitation),
        variable: round2(actual.byKind.variable),
        divers: 0,
        total: 0,
        items: actual.items,
        source: "actual",
      };
    } else if (d <= asOf || isPast) {
      // Jour passé sans synchro bancaire : rien de connu, on ne projette pas non plus.
      sorties = { matiere: 0, fixe: 0, horsExploitation: 0, variable: 0, divers: 0, total: 0, items: [], source: "actual" };
    } else {
      const wd = weekdayOf(d);
      const matiere = matiereRatio !== null && forecastWdCount[wd] > 0
        ? caMonthForecast * matiereRatio * matWdShare[wd] / forecastWdCount[wd]
        : 0;
      const variable = variableRatio !== null ? ca.value * variableRatio : 0;
      const items: PlanDay["sorties"]["items"] = [];
      let fixe = 0;
      let hors = 0;
      for (const it of fixedSchedule) {
        if (!it.projectedDates.includes(d)) continue;
        items.push({ label: it.label, amount: it.expectedAmount, kind: it.kind, status: "forecast" });
        if (it.kind === "fixe") fixe += it.expectedAmount;
        else hors += it.expectedAmount;
      }
      // Ajustements manuels one-shot
      let adjMatiere = 0;
      let adjVariable = 0;
      for (const adj of input.adjustments ?? []) {
        if (adj.date !== d) continue;
        items.push({ label: adj.label, amount: adj.amount, kind: adj.kind, status: "forecast" });
        if (adj.kind === "fixe") fixe += adj.amount;
        else if (adj.kind === "hors_exploitation") hors += adj.amount;
        else if (adj.kind === "matiere") adjMatiere += adj.amount;
        else if (adj.kind === "variable") adjVariable += adj.amount;
      }
      sorties = {
        matiere: round2(matiere + adjMatiere),
        fixe: round2(fixe),
        horsExploitation: round2(hors),
        variable: round2(variable + adjVariable),
        divers: round2(diversPerDay),
        total: 0,
        items,
        source: "forecast",
      };
    }
    sorties.total = round2(sorties.matiere + sorties.fixe + sorties.horsExploitation + sorties.variable + sorties.divers);

    const netExploitation = round2(enc.bank - (sorties.matiere + sorties.fixe + sorties.variable + sorties.divers));
    const netTotal = round2(netExploitation - sorties.horsExploitation);

    days.push({
      date: d,
      weekday: weekdayOf(d),
      isPast,
      isToday: d === today,
      holiday: holidayName(d),
      event: ev,
      weather: w ? { precip: w.precip, tmax: w.tmax } : null,
      ca,
      encaissements: enc,
      sorties,
      netExploitation,
      netTotal,
      solde: 0,
      soldeExploitation: 0,
      soldeOptimiste: 0,
      soldePessimiste: 0,
    });
  }

  // Soldes : à rebours jusqu'à asOf, puis en avant.
  const asOfIdx = days.findIndex((d) => d.date === asOf);
  if (asOfIdx >= 0) {
    days[asOfIdx].solde = solde;
    for (let i = asOfIdx - 1; i >= 0; i--) {
      days[i].solde = round2(days[i + 1].solde - days[i + 1].netTotal);
    }
    for (let i = 0; i <= asOfIdx; i++) {
      days[i].soldeOptimiste = days[i].solde;
      days[i].soldePessimiste = days[i].solde;
    }
    solde = days[asOfIdx].solde;
    soldeOpt = solde;
    soldePess = solde;
    // Solde d'exploitation : on repart du solde connu, en excluant les flux hors exploitation ensuite.
    soldeExpl = solde;
    for (let i = 0; i <= asOfIdx; i++) days[i].soldeExploitation = days[i].solde;
  } else if (asOf < dates[0]) {
    // Solde connu avant le début du mois : on avance depuis le 1er.
  } else {
    warnings.push("Date de synchro bancaire postérieure au mois : soldes projetés depuis le solde actuel.");
  }

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (asOfIdx >= 0 && i <= asOfIdx) continue;
    const futureIn = day.encaissements.source === "forecast";
    const inOpt = futureIn ? day.encaissements.bank * (1 + spread) : day.encaissements.bank;
    const inPess = futureIn ? day.encaissements.bank * (1 - spread) : day.encaissements.bank;
    const varOut = day.sorties.matiere + day.sorties.variable;
    const outOpt = futureIn ? day.sorties.total - varOut + varOut * (1 + spread) : day.sorties.total;
    const outPess = futureIn ? day.sorties.total - varOut + varOut * (1 - spread) : day.sorties.total;
    solde = round2(solde + day.netTotal);
    soldeOpt = round2(soldeOpt + inOpt - outOpt);
    soldePess = round2(soldePess + inPess - outPess);
    soldeExpl = round2(soldeExpl + day.netExploitation);
    day.solde = solde;
    day.soldeOptimiste = soldeOpt;
    day.soldePessimiste = soldePess;
    day.soldeExploitation = soldeExpl;
  }

  // ── KPI ──
  const futureDays = days.filter((d) => d.date >= today);
  const pointBas = days.reduce((min, d) => (d.solde < min.solde ? { date: d.date, solde: d.solde } : min), {
    date: days[0].date,
    solde: days[0].solde,
  });
  const caMoisRealise = days.filter((d) => d.ca.source === "actual").reduce((s, d) => s + d.ca.value, 0);
  const caMoisPrevu = days.reduce((s, d) => s + d.ca.value, 0);
  const n1Dates = dates.map((d) => dailyMap.get(addDays(d, -364)));
  const caMoisN1 = n1Dates.every((h) => h === undefined) ? null : n1Dates.reduce((s, h) => s + (h?.ca ?? 0), 0);
  const last = days[days.length - 1];

  const sum = (f: (d: PlanDay) => number, arr: PlanDay[] = days) => round2(arr.reduce((s, d) => s + f(d), 0));

  const plan: Plan = {
    storeId,
    month,
    today,
    generatedAt: new Date().toISOString(),
    opening,
    days,
    kpis: {
      soldeActuel: round2(opening.balance),
      soldeFinMois: last.solde,
      soldeFinMoisOptimiste: last.soldeOptimiste,
      soldeFinMoisPessimiste: last.soldePessimiste,
      pointBas,
      caMoisPrevu: round2(caMoisPrevu),
      caMoisRealise: round2(caMoisRealise),
      caMoisN1: caMoisN1 !== null ? round2(caMoisN1) : null,
      encaissementsRestants: sum((d) => d.encaissements.bank, futureDays),
      sortiesRestantes: sum((d) => d.sorties.total - d.sorties.horsExploitation, futureDays),
      sortiesHorsExploitationRestantes: sum((d) => d.sorties.horsExploitation, futureDays),
      netExploitationMois: sum((d) => d.netExploitation),
      alertThreshold: settings.alertThreshold,
      joursSousSeuil: days.filter((d) => d.solde < settings.alertThreshold).length,
    },
    waterfall: {
      soldeInitial: round2(days[0].solde - days[0].netTotal),
      encaissements: sum((d) => d.encaissements.bank),
      matiere: sum((d) => d.sorties.matiere),
      fixe: sum((d) => d.sorties.fixe),
      variable: sum((d) => d.sorties.variable),
      divers: sum((d) => d.sorties.divers),
      horsExploitation: sum((d) => d.sorties.horsExploitation),
      soldeFinal: last.solde,
    },
    hypotheses: {
      growth: round2(model.growth),
      growthWindow: model.growthWindow,
      growthN: model.growthN,
      growthN1: model.growthN1,
      weekdayMeans: model.weekdayMeans,
      paymentShares: {
        cb: round2(shares.cb * 100) / 100,
        especes: round2(shares.especes * 100) / 100,
        tr: round2(shares.tr * 100) / 100,
        virement: round2(shares.virement * 100) / 100,
      },
      matiereRatio: matiereRatio !== null ? Math.round(matiereRatio * 10000) / 10000 : null,
      matiereRatioCalcule: matiereRatioCalcule !== null ? Math.round(matiereRatioCalcule * 10000) / 10000 : null,
      matiereRatioMonths,
      variableRatio: variableRatio !== null ? Math.round(variableRatio * 10000) / 10000 : null,
      diversPerDay: round2(diversPerDay),
      weather: {
        enabled: settings.weatherEnabled,
        rainEffect: model.rainEffect !== null ? round2(model.rainEffect) : null,
        coldEffect: model.coldEffect !== null ? round2(model.coldEffect) : null,
        rainSamples: model.rainSamples,
        coldSamples: model.coldSamples,
        forecastUntil: input.weather.filter((w) => w.source === "forecast").map((w) => w.date).sort().pop() ?? null,
      },
      eventsCalibration: model.eventsCalibration,
      settings,
    },
    fixedSchedule,
    warnings,
  };
  return plan;
}
