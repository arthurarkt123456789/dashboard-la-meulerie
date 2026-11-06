// Normalisation des libellés bancaires en clé de contrepartie + suggestion de classification.
// Pur, sans dépendance.

import type { RuleKind } from "./types";

const NOISE = new Set([
  "PRLV", "SEPA", "VIR", "VIREMENT", "CARTE", "CB", "PAIEMENT", "PAIEMENTS", "FACTURE", "FACT", "FAC",
  "REF", "ECHEANCE", "ECH", "DU", "LE", "DE", "LA", "LES", "ET", "AU", "EN", "PAR", "POUR", "SAS",
  "SARL", "EURL", "SA", "SASU", "FR", "INST", "INSTANT", "RECU", "EMIS", "WEB", "MOTIF", "LIB",
  "ID", "MANDAT", "RUM", "ICS", "NUM", "N", "NO", "COMMERCE", "CLIENTS", "CLIENT", "PRELEVEMENT",
  "PRELEV", "RETRAIT", "DAB", "DEPOT", "REMISE", "CHEQUE", "CHQ", "FRAIS", "COMMISSION", "COMMISSIONS",
  "EUR", "EUROS", "TTC", "HT",
  // mois et périodes, qui changent d'une opération à l'autre
  "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE",
  "JAN", "FEV", "AVR", "JUIL", "SEPT", "SEP", "OCT", "NOV", "DEC", "MOIS", "TRIMESTRE", "ANNEE", "PERIODE",
  "ACOMPTE", "SOLDE", "REGUL", "REGULARISATION", "REMBOURSEMENT", "RBT",
  // paie : le nom de la personne identifie le tiers, pas l'objet du virement
  "SALAIRE", "SALAIRES", "SAL", "PAIE", "PAYE", "REMUNERATION", "PRIME", "PRIMES", "AVANCE", "INDEMNITE", "INDEMNITES", "NDF", "NOTE", "FRAIS",
]);

const KEEP_SHORT = new Set(["EDF", "SFR", "AXA", "UP", "BPI", "AG2R", "URSSAF", "DGFIP", "SEM", "FREE", "SCI"]);

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Clé de contrepartie : majuscules, sans accents, sans dates/numéros/mots de bruit, 2 premiers mots. */
export function counterpartyKey(label: string): string {
  const up = stripAccents(label).toUpperCase();
  const tokens = up
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .filter((t) => !/^\d+$/.test(t)) // nombres
    .filter((t) => !/^\d{2}\/\d{2}/.test(t)) // dates
    .filter((t) => !/^X+\d+$/.test(t)) // X1234 (cartes)
    .filter((t) => !/^[A-Z]{1,2}\d+$/.test(t)) // refs type FR12, A1234
    .filter((t) => !/\d{4,}/.test(t)) // tokens avec longues séquences de chiffres
    .filter((t) => !(/\d/.test(t) && /[A-Z]/.test(t))) // références mixtes (FR47EDF001, RUM12A)
    .filter((t) => !NOISE.has(t))
    .filter((t) => t.length >= 3 || KEEP_SHORT.has(t));
  // Deux mots suffisent à identifier un tiers ; le troisième varie souvent (objet, mois, référence).
  // Exception : les organismes qui prélèvent plusieurs impôts sous la même tête (DGFIP TVA, DGFIP IS, URSSAF…),
  // où le troisième mot distingue l'impôt.
  const MULTI = new Set(["DGFIP", "URSSAF", "IMPOT", "IMPOTS", "TRESOR", "DGI", "SIE"]);
  const key = tokens.slice(0, MULTI.has(tokens[0]) ? 3 : 2).join(" ");
  return key || up.slice(0, 24).trim() || "SANS LIBELLE";
}

/** Libellé lisible à partir de la clé. */
export function prettyLabel(key: string): string {
  return key
    .toLowerCase()
    .split(" ")
    .map((w) => (KEEP_SHORT.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const HINTS: { kind: RuleKind; re: RegExp }[] = [
  { kind: "hors_exploitation", re: /\b(MANAGEMENT|HOLDING|LICENCE|REDEVANCE|MARQUE|CHEESE INC|DIVIDENDE|COMPTE COURANT|PRET|EMPRUNT|BPI|CREDIT|LEASING|LOCAM|GRENKE)\b/ },
  { kind: "fixe", re: /\b(URSSAF|DGFIP|IMPOT|IMPOTS|TVA|TRESOR PUBLIC|AGS|MALAKOFF|AG2R|HUMANIS|KLESIA|PREVOYANCE|MUTUELLE|ALAN|LOYER|SCI|FONCIER|EDF|ENGIE|TOTALENERGIES|TOTAL ENERGIES|EAU|SEM|SUEZ|VEOLIA|ORANGE|SFR|FREE|BOUYGUES|ASSURANCE|AXA|ALLIANZ|MAAF|HISCOX|GENERALI|PENNYLANE|APITIC|WEBCAISSE|WEB CAISSE|COMPTABLE|EXPERT|SALAIRE|SALAIRES|PAIE|PAYFIT|SILAE|NETTOYAGE|ALARME|VERISURE|SACEM|SPRE|QONTO|SHINE|ABONNEMENT|GOOGLE|MICROSOFT|CANVA|ADOBE|SPOTIFY|DEEZER|LIGHTSPEED|ZENCHEF)\b/ },
  { kind: "matiere", re: /\b(METRO|PROMOCASH|TRANSGOURMET|FROMAGERIE|FROMAGERIES|LAITERIE|FROMAGE|FROMAGES|CREMERIE|AFFINEUR|AFFINAGE|BOULANGERIE|BOULANGER|PAIN|LEGUMES|PRIMEUR|PRIMEURS|BOUCHERIE|CHARCUTERIE|COCA|BOISSON|BOISSONS|DISTRIBOISSONS|EPICERIE|SYSCO|BRAKE|POMONA|MARCHE|HALLES|RUNGIS|TRAITEUR|RICHESMONTS|LACTALIS|SAVENCIA|SODIAAL|VIN|VINS|CAVE|BRASSERIE|GRANDS MOULINS|EMBALLAGE|EMBALLAGES|PACKAGING)\b/ },
  { kind: "variable", re: /\b(UBER|DELIVEROO|STRIPE|SUMUP|ZETTLE|EDENRED|SWILE|BIMPLI|PLUXEE|COTISATION CARTE|TPE|MONETIQUE)\b|\b(COMMISSIONS? CB|FRAIS CB|FRAIS BANCAIRES)\b/ },
];

/** Nature suggérée par mots-clés. Null si aucun motif ou si plusieurs natures sont possibles. */
export function suggestKind(key: string, label: string): RuleKind | null {
  const text = `${key} ${stripAccents(label).toUpperCase()}`;
  const kinds = new Set<RuleKind>();
  for (const h of HINTS) if (h.re.test(text)) kinds.add(h.kind);
  if (kinds.size !== 1) return null;
  return [...kinds][0];
}
