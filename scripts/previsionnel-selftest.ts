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
  if (ym < "2026-11") push(2, -1900, `VIR SEPA SALAIRE ELODIE MARTIN ${ym}`, "ELODIE MARTIN");
  if (ym === "2026-11") push(2, -1950, "VIR INST PAIE NOVEMBRE ELODIE MARTIN", "PAIE NOVEMBRE");
  push(12, -450, "PRLV EDF", "EDF");
  push(15, -1500, "VIR CHEESE INC MANAGEMENT FEES", "CHEESE INC MANAGEMENT FEES");
  for (const day of [3, 10, 17, 24]) push(day, -2800, "PRLV METRO", "METRO");
  for (const day of [4, 11, 18, 25]) push(day, -900, "CARTE FROMAGERIE X", "FROMAGERIE X");
  push(20, -60, "PRLV SPOTIFY", "SPOTIFY");
  for (let day = 2; day <= 28; day += 2) push(day, 3000, "REMISE CB", "REMISE CB");
  if (ym === "2025-11") push(20, -12000, "VIR DIVIDENDES ASSOCIES", "DIVIDENDES ASSOCIES");
  if (ym === "2025-11") push(15, -1240, "PRLV DGFIP CFE", "DGFIP CFE");
  if (["2026-02", "2026-05", "2026-08"].includes(ym)) push(18, -2600, "PRLV DGFIP TVA TRIM", "DGFIP TVA");
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
    { key: "DIVIDENDES ASSOCIES", kind: "hors_exploitation", label: "Dividendes" },
    { key: "DGFIP CFE", kind: "fixe", label: "CFE", accounts: ["635110"] },
    { key: "DGFIP TVA", kind: "fixe", label: "TVA trimestrielle" },
    { key: "ELODIE MARTIN", kind: "fixe", label: "Elodie Martin" },
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
console.log("fixed:", plan.fixedSchedule.map((f) => `${f.label} ${f.frequency} ${f.status} ${f.expectedAmount} -> ${f.projectedDates.join(",")} [${f.statusReason}]`));
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
const byLabel = (l: string) => plan.fixedSchedule.find((f) => f.label === l)!;
assert(byLabel("Dividendes").status === "exclu" && byLabel("Dividendes").projectedDates.length === 0, "dividendes N-1 non reprojetés");
assert(byLabel("CFE").status === "propose" && byLabel("CFE").projectedDates.length === 1, "CFE annuelle proposée");
assert(byLabel("Elodie Martin").paidThisMonth === 1 && byLabel("Elodie Martin").projectedDates.length === 0, "salaire réglé sous un autre libellé non reprojeté");
assert(byLabel("TVA trimestrielle").status === "projete" && byLabel("TVA trimestrielle").projectedDates.length === 1, "TVA trimestrielle projetée par périodicité");
console.log("OK");
