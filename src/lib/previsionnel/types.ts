// Types partagés du module prévisionnel (purs, sans dépendance runtime).

export type RuleKind = "matiere" | "fixe" | "hors_exploitation" | "variable" | "ignorer";

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  matiere: "Matière première",
  fixe: "Charge fixe",
  hors_exploitation: "Hors exploitation",
  variable: "Variable (lié au CA)",
  ignorer: "Ignorer",
};

export type RuleSource = "utilisateur" | "pennylane" | "mots-cles" | "ia";

export const RULE_SOURCE_LABELS: Record<RuleSource, string> = {
  utilisateur: "toi",
  pennylane: "écritures Pennylane",
  "mots-cles": "mots-clés",
  ia: "Claude",
};

export type Rule = {
  key: string;
  kind: RuleKind;
  label: string;
  /** Montant mensuel forcé par l'utilisateur (sinon médiane observée). */
  expectedAmount?: number | null;
  /** Jour du mois forcé par l'utilisateur (sinon médiane observée). */
  expectedDay?: number | null;
  /** Pour les sorties irrégulières : auto (règle de nature), inclure ce mois, exclure. */
  recurrence?: "auto" | "inclure" | "exclure";
  /** Comptes PCG dominants relevés par l'agent. */
  accounts?: string[];
  /** Qui a décidé. */
  source?: RuleSource;
  confidence?: number;
  reason?: string;
  updatedAt?: string;
};

export type Tx = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // négatif = sortie
  label: string;
  key: string; // contrepartie normalisée
};

export type DailyHist = {
  date: string;
  ca: number; // TTC
  cb?: number;
  especes?: number;
  tr?: number;
  virement?: number;
  closed?: boolean;
  partial?: boolean;
};

export type EventSource = "utilisateur" | "presse";
export type EventStatus = "propose" | "confirme" | "rejete";

export type EventDay = {
  id?: number;
  date: string;
  label: string;
  /** Impact relatif sur le CA, ex. -0.3 = -30 %. */
  impact: number;
  source?: EventSource;
  status?: EventStatus;
  confidence?: number;
  url?: string | null;
};

export type WeatherDay = {
  date: string;
  precip: number | null; // mm
  tmax: number | null; // °C
  source: "forecast" | "archive";
};

export type Settings = {
  cbDelayDays: number;
  trDelayDays: number;
  matiereLagMonths: number;
  defaultEventImpact: number;
  smallThreshold: number;
  alertThreshold: number;
  openingBalanceOverride: number | null;
  weatherEnabled: boolean;
  scenarioSpread: number;
  /** Jours de semaine forcés ouverts (0 = dim … 6 = sam). */
  forceOpenWeekdays: number[];
  /** Taux de marge brute forcé (ex. 0.28 = 28 %). null = calculé depuis l'historique. */
  matiereRatioOverride: number | null;
};

export const DEFAULT_SETTINGS: Settings = {
  cbDelayDays: 1,
  trDelayDays: 10,
  matiereLagMonths: 0,
  defaultEventImpact: -0.3,
  smallThreshold: 150,
  alertThreshold: 5000,
  openingBalanceOverride: null,
  weatherEnabled: true,
  scenarioSpread: 0.1,
  forceOpenWeekdays: [],
  matiereRatioOverride: null,
};

export type Adjustment = {
  id?: number;
  date: string;
  label: string;
  amount: number; // positif = sortie
  kind: RuleKind;
};

export type Decision = {
  key: string;
  label: string;
  kind: RuleKind;
  source: RuleSource;
  confidence: number;
  reason: string;
  total: number;
  count: number;
  matched: number;
  isNew: boolean;
};

export type Briefing = {
  storeId: string;
  month: string;
  today: string;
  generatedAt: string;
  txCount: number;
  ledgerLines: number;
  decisions: Decision[];
  questions: Doubt[];
  /** Transactions sortantes sans écriture lettrée trouvée : conservées telles quelles dans les flux. */
  unmatched: { count: number; total: number; txCount: number; items: { date: string; label: string; amount: number; key: string; kind: RuleKind | null }[] };
  events: EventDay[];
  scout: { ran: boolean; found: number; error: string | null; at: string | null };
  llm: { enabled: boolean; error: string | null };
  warnings: string[];
};

export type Doubt = {
  key: string;
  label: string;
  count: number;
  total: number; // € sortis sur la fenêtre (positif)
  lastDate: string;
  lastAmount: number;
  monthsPresent: number;
  monthsWindow: number;
  suggested: RuleKind | null;
  samples: string[];
  /** Avis des sources automatiques, insuffisants pour trancher. */
  hints: { source: RuleSource; kind: RuleKind; confidence: number; reason: string }[];
};

export type PlanDay = {
  date: string;
  weekday: number; // 0 = dimanche
  isPast: boolean;
  isToday: boolean;
  holiday: string | null;
  event: EventDay | null;
  weather: { precip: number | null; tmax: number | null } | null;
  ca: {
    value: number;
    source: "actual" | "forecast" | "partial";
    base: number;
    baseSource: "n1" | "weekday-mean" | "closed";
    n1: number | null;
    growth: number;
    weatherFactor: number;
    eventFactor: number;
  };
  encaissements: {
    cb: number;
    tr: number;
    virement: number;
    especes: number;
    bank: number; // cb + tr + virement arrivant en banque ce jour
    source: "actual" | "forecast";
  };
  sorties: {
    matiere: number;
    fixe: number;
    horsExploitation: number;
    variable: number;
    divers: number;
    total: number;
    items: { label: string; amount: number; kind: RuleKind; status: "actual" | "forecast" }[];
    source: "actual" | "forecast";
  };
  netExploitation: number; // bank - (matiere + fixe + variable + divers)
  netTotal: number; // netExploitation - horsExploitation
  solde: number; // solde bancaire fin de journée
  soldeExploitation: number; // solde hors flux hors-exploitation (depuis le début du mois)
  soldeOptimiste: number;
  soldePessimiste: number;
};

export type FixedScheduleItem = {
  key: string;
  label: string;
  kind: RuleKind;
  frequency: "mensuel" | "hebdo" | "irregulier";
  expectedAmount: number;
  expectedDay: number | null;
  weekday: number | null;
  observedMonths: number;
  observedAmounts: number[];
  projectedDates: string[];
  paidThisMonth: number;
  overridden: boolean;
  /** projete : échéance régulière ; propose : annuelle probable, retirable ; exclu : irrégulier non retenu. */
  status: "projete" | "propose" | "exclu";
  statusReason: string;
  lastDate: string | null;
};

export type Plan = {
  storeId: string;
  month: string;
  today: string;
  generatedAt: string;
  opening: { balance: number; asOf: string; source: "bank-sync" | "override" | "none" };
  days: PlanDay[];
  kpis: {
    soldeActuel: number;
    soldeFinMois: number;
    soldeFinMoisOptimiste: number;
    soldeFinMoisPessimiste: number;
    pointBas: { date: string; solde: number };
    caMoisPrevu: number;
    caMoisRealise: number;
    caMoisN1: number | null;
    encaissementsRestants: number;
    sortiesRestantes: number;
    sortiesHorsExploitationRestantes: number;
    netExploitationMois: number;
    alertThreshold: number;
    joursSousSeuil: number;
  };
  waterfall: {
    soldeInitial: number;
    encaissements: number;
    matiere: number;
    fixe: number;
    variable: number;
    divers: number;
    horsExploitation: number;
    soldeFinal: number;
  };
  hypotheses: {
    growth: number;
    growthWindow: string;
    growthN: number;
    growthN1: number;
    weekdayMeans: number[];
    paymentShares: { cb: number; especes: number; tr: number; virement: number };
    matiereRatio: number | null;
    matiereRatioCalcule: number | null;
    matiereRatioMonths: { month: string; matiere: number; ca: number; ratio: number | null }[];
    variableRatio: number | null;
    diversPerDay: number;
    weather: {
      enabled: boolean;
      rainEffect: number | null;
      coldEffect: number | null;
      rainSamples: number;
      coldSamples: number;
      forecastUntil: string | null;
    };
    eventsCalibration: { date: string; label: string; expected: number; actual: number; observedImpact: number }[];
    settings: Settings;
  };
  fixedSchedule: FixedScheduleItem[];
  warnings: string[];
};
