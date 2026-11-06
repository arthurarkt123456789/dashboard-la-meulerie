// Types partagés du module prévisionnel (purs, sans dépendance runtime).

export type RuleKind = "matiere" | "fixe" | "hors_exploitation" | "variable" | "ignorer";

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  matiere: "Matière première",
  fixe: "Charge fixe",
  hors_exploitation: "Hors exploitation",
  variable: "Variable (lié au CA)",
  ignorer: "Ignorer",
};

export type Rule = {
  key: string;
  kind: RuleKind;
  label: string;
  /** Montant mensuel forcé par l'utilisateur (sinon médiane observée). */
  expectedAmount?: number | null;
  /** Jour du mois forcé par l'utilisateur (sinon médiane observée). */
  expectedDay?: number | null;
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

export type EventDay = {
  id?: number;
  date: string;
  label: string;
  /** Impact relatif sur le CA, ex. -0.3 = -30 %. */
  impact: number;
};

export type WeatherDay = {
  date: string;
  precip: number | null; // mm
  tmax: number | null; // °C
  source: "forecast" | "archive";
};

export type Settings = {
  /** Délai bancaire des encaissements CB (jours). */
  cbDelayDays: number;
  /** Délai des titres-restaurant (jours). */
  trDelayDays: number;
  /** Décalage mois entre CA et paiement matière (0 ou 1). */
  matiereLagMonths: number;
  /** Impact par défaut d'une manifestation. */
  defaultEventImpact: number;
  /** Seuil sous lequel une contrepartie n'est pas questionnée (€ sur la fenêtre). */
  smallThreshold: number;
  /** Seuil d'alerte de trésorerie (€). */
  alertThreshold: number;
  /** Solde d'ouverture forcé si la synchro bancaire est indisponible. */
  openingBalanceOverride: number | null;
  /** Activer l'effet météo. */
  weatherEnabled: boolean;
  /** Amplitude des scénarios (±) appliquée au CA. */
  scenarioSpread: number;
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
