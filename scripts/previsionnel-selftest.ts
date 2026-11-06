// Auto-test du moteur prévisionnel sur des données synthétiques.
// Lancer : bun scripts/previsionnel-selftest.ts   (ou npx tsx)
import { buildPlan, addDays, weekdayOf } from "../src/lib/previsionnel/engine";
import { DEFAULT_SETTINGS, type DailyHist, type Tx } from "../src/lib/previsionnel/types";

const today = "2026-11-06";
const daily: DailyHist[] = [];
for (let i = 800; i >= 1; i--) {
  const date = addDays(today, -i);
  const wd = weekdayOf(date);
  const base = wd === 0 ? 0 : wd === 6 ? 2600 : 1800;
  const yearFactor = date < "2026-01-01" ? 0.9 : 1;
  const ca = base * yearFactor;
  daily.push({ date, ca, cb: ca * 0.8, especes: ca * 0.1, tr: ca * 0.08, virement: ca * 0.02 });
}
daily.push({ date: today, ca: 400, partial: true });

const txs: Tx[] = [];
let id = 0;
for (let m = 0; m < 13; m++) {
  const d = new Date(Date.UTC(2025, 10 + m, 1));
  const ym = d.toISOString().slice(0, 7);
  if (ym > "2026-11") break;
  const push = (day: number, amount: number, label: string, key: string) => {
    const date = `${ym}-${String(day).padStart(2, "0")}`;
    if (date > today) return;
    txs.push({ id: String(++id), date, amount, label, key });
  };
  push(5, -3200, "VIR SEPA URSSAF PACA", "URSSAF PACA");
  push(1, -2100, "PRLV SEPA SCI LOYER", "SCI LOYER");
  push(28, -9800, "VIR SALAIRES", "SALAIRES");
  push(12, -450, "PRLV EDF", "EDF");
  push(15, -1500, "VIR CHEESE INC MANAGEMENT FEES", "CHEESE INC MANAGEMENT FEES");
  for (const day of [3, 10, 17, 24]) push(day, -2800, "PRLV METRO", "METRO");
  for (const day of [4, 11, 18, 25]) push(day, -900, "CARTE FROMAGERIE X", "FROMAGERIE X");
  push(20, -60, "PRLV SPOTIFY", "SPOTIFY");
  for (let day = 2; day <= 28; day += 2) push(day, 3000, "REMISE CB", "REMISE CB");
}

const plan = buildPlan({
  storeId: "davso",
  month: "2026-11",
  today,
  daily,
  txs,
  rules: [
    { key: "URSSAF PACA", kind: "fixe", label: "URSSAF" },
    { key: "SCI LOYER", kind: "fixe", label: "Loyer" },
    { key: "SALAIRES", kind: "fixe", label: "Salaires" },
    { key: "EDF", kind: "fixe", label: "EDF" },
    { key: "CHEESE INC MANAGEMENT FEES", kind: "hors_exploitation", label: "Management fees" },
    { key: "METRO", kind: "matiere", label: "Metro" },
    { key: "FROMAGERIE X", kind: "matiere", label: "Fromagerie X" },
  ],
  events: [{ date: "2026-11-18", label: "Manif", impact: -0.3 }],
  weather: [],
  settings: { ...DEFAULT_SETTINGS, weatherEnabled: false },
  openingBalance: 12000,
  balanceAsOf: "2026-11-05",
});

const fmt = (n: number) => n.toFixed(0).padStart(7);
console.log("growth", plan.hypotheses.growth, "matiereRatio", plan.hypotheses.matiereRatio);
console.log("warnings", plan.warnings);
console.log("fixed:", plan.fixedSchedule.map((f) => `${f.label} ${f.frequency} ${f.expectedAmount} -> ${f.projectedDates.join(",")}`));
for (const d of plan.days) {
  console.log(
    d.date, d.weekday, d.ca.source.padEnd(8), fmt(d.ca.value), "in", fmt(d.encaissements.bank),
    "mat", fmt(d.sorties.matiere), "fix", fmt(d.sorties.fixe), "hors", fmt(d.sorties.horsExploitation),
    "solde", fmt(d.solde), "pess", fmt(d.soldePessimiste), d.event?.label ?? "", d.holiday ?? "",
  );
}
console.log(plan.kpis);
console.log(plan.waterfall);

// Assertions simples
const assert = (c: boolean, msg: string) => { if (!c) { console.error("FAIL:", msg); process.exit(1); } };
assert(Math.abs(plan.hypotheses.growth - 1 / 0.9) < 0.02, "croissance ≈ +11 %");
assert(plan.hypotheses.matiereRatio !== null && plan.hypotheses.matiereRatio > 0.2, "ratio matière plausible");
assert(plan.days.find((d) => d.date === "2026-11-18")!.ca.eventFactor === 0.7, "manif appliquée");
assert(plan.days.find((d) => d.date === "2026-11-11")!.holiday === "Armistice", "férié détecté");
assert(plan.fixedSchedule.some((f) => f.label === "Salaires" && f.projectedDates.includes("2026-11-28")), "salaires projetés le 28");
assert(plan.fixedSchedule.some((f) => f.label === "Loyer" && f.paidThisMonth === 1 && f.projectedDates.length === 0), "loyer déjà payé non reprojeté");
assert(plan.fixedSchedule.some((f) => f.label === "URSSAF" && f.paidThisMonth === 1 && f.projectedDates.length === 0), "URSSAF payé le 5 non reprojeté");
assert(plan.days[4].solde === 12000, "solde au 5 = solde synchro");
console.log("OK");
