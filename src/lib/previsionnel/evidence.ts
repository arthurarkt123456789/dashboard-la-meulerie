// Évidence comptable : relie chaque transaction bancaire aux comptes PCG que Pennylane
// (ou le comptable) lui a attribués, directement ou via la facture fournisseur lettrée.
// Pur, sans dépendance réseau.

import type { LedgerAccount, LedgerLine } from "@/lib/pennylane/ledger";
import type { RuleKind, Tx } from "./types";

export type AccountEvidence = { number: string; label: string; amount: number };
export type KeyEvidence = {
  key: string;
  /** Ids des transactions reliées à une écriture. */
  matchedTxIds: Set<string>;
  /** Comptes de contrepartie pondérés par montant. */
  accounts: AccountEvidence[];
  /** Nombre de transactions de la contrepartie reliées à une écriture. */
  matched: number;
  /** Nombre total de transactions sortantes de la contrepartie. */
  total: number;
  /** Nature dominante déduite des comptes, part de l'évidence qu'elle représente. */
  kind: RuleKind | null;
  share: number;
  reason: string;
};

const isBank = (n: string) => /^(51[0-9]|53[0-9])/.test(n);
const isSupplierAux = (n: string) => /^40[0-9]/.test(n);
const isCustomerAux = (n: string) => /^41[0-9]/.test(n);
const isVat = (n: string) => /^445/.test(n);

/** Nature de sortie d'après le numéro de compte PCG. */
export function kindFromAccount(number: string): RuleKind | null {
  const n = number.replace(/\D/g, "");
  if (!n) return null;
  if (/^58/.test(n)) return "ignorer"; // virements internes
  if (/^(60[127]|603)/.test(n)) return "matiere"; // achats stockés, marchandises, variation de stock
  if (/^606/.test(n)) return "fixe"; // énergie, fournitures non stockées
  if (/^604|^605/.test(n)) return "fixe"; // prestations, matériel
  if (/^627|^6222|^6226/.test(n)) return "variable"; // services bancaires, commissions
  if (/^6[1-5]/.test(n)) return "fixe"; // services extérieurs, impôts, personnel, autres charges
  if (/^66|^67|^68|^69/.test(n)) return "hors_exploitation"; // financier, exceptionnel, dotations, IS
  if (/^1[0-9]/.test(n)) return "hors_exploitation"; // capital, emprunts, comptes courants (108)
  if (/^45/.test(n)) return "hors_exploitation"; // groupe, associés, compte courant
  if (/^2[0-9]/.test(n)) return "hors_exploitation"; // immobilisations
  if (/^42|^43|^44/.test(n)) return "fixe"; // personnel, sécurité sociale, État (TVA, IS)
  if (/^7/.test(n)) return "ignorer"; // produits (remboursements, avoirs) : pas une sortie à projeter
  return null;
}

type Entry = { id: string; date: string; lines: LedgerLine[] };

export function buildLedgerEvidence(
  txs: Tx[],
  lines: LedgerLine[],
  accounts: LedgerAccount[],
): Map<string, KeyEvidence> {
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const numberOf = (l: LedgerLine) => l.accountNumber || accById.get(l.accountId)?.number || "";
  const labelOf = (l: LedgerLine) => accById.get(l.accountId)?.label ?? "";

  // 1. Écritures
  const entries = new Map<string, Entry>();
  for (const l of lines) {
    const id = l.entryId || `line-${l.id}`;
    const e = entries.get(id) ?? { id, date: l.date, lines: [] };
    e.lines.push(l);
    if (!e.date && l.date) e.date = l.date;
    entries.set(id, e);
  }

  // 2. Tiers fournisseur (compte 401 auxiliaire, par id) → comptes de charge observés sur ses factures.
  const supplierExpense = new Map<string, Map<string, AccountEvidence>>();
  for (const e of entries.values()) {
    const hasBank = e.lines.some((l) => isBank(numberOf(l)));
    if (hasBank) continue;
    const aux = e.lines.filter((l) => isSupplierAux(numberOf(l)));
    if (!aux.length) continue;
    const expense = e.lines.filter((l) => {
      const n = numberOf(l);
      return !isSupplierAux(n) && !isCustomerAux(n) && !isVat(n) && !isBank(n);
    });
    for (const a of aux) {
      const m = supplierExpense.get(a.accountId) ?? new Map<string, AccountEvidence>();
      for (const x of expense) {
        const n = numberOf(x);
        const amt = Math.abs(x.debit - x.credit);
        const cur = m.get(n) ?? { number: n, label: labelOf(x), amount: 0 };
        cur.amount += amt;
        m.set(n, cur);
      }
      supplierExpense.set(a.accountId, m);
    }
  }

  // 3. Écritures bancaires indexées par (date, montant signé banque).
  const bankIndex = new Map<string, Entry[]>();
  const keyOf = (date: string, amount: number) => `${date}|${amount.toFixed(2)}`;
  for (const e of entries.values()) {
    const bank = e.lines.filter((l) => isBank(numberOf(l)));
    if (!bank.length) continue;
    const amount = bank.reduce((s, l) => s + (l.debit - l.credit), 0);
    const k = keyOf(e.date, amount);
    bankIndex.set(k, [...(bankIndex.get(k) ?? []), e]);
  }

  const shiftDate = (d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };

  // 4. Transactions → évidence
  const out = new Map<string, KeyEvidence>();
  for (const tx of txs) {
    if (tx.amount >= 0) continue;
    const ev = out.get(tx.key) ?? { key: tx.key, matchedTxIds: new Set<string>(), accounts: [], matched: 0, total: 0, kind: null, share: 0, reason: "" };
    ev.total += 1;
    let candidates: Entry[] = [];
    for (const delta of [0, 1, -1, 2, -2, 3, -3]) {
      candidates = bankIndex.get(keyOf(shiftDate(tx.date, delta), tx.amount)) ?? [];
      if (candidates.length) break;
    }
    if (!candidates.length) {
      out.set(tx.key, ev);
      continue;
    }
    const e = candidates[0];
    const accMap = new Map(ev.accounts.map((a) => [a.number, a]));
    let found = false;
    for (const l of e.lines) {
      const n = numberOf(l);
      if (isBank(n) || isVat(n) || isCustomerAux(n)) continue;
      const amt = Math.abs(l.debit - l.credit);
      if (isSupplierAux(n)) {
        const exp = supplierExpense.get(l.accountId);
        if (!exp || exp.size === 0) continue;
        const tot = [...exp.values()].reduce((s, a) => s + a.amount, 0) || 1;
        for (const a of exp.values()) {
          const cur = accMap.get(a.number) ?? { number: a.number, label: a.label, amount: 0 };
          cur.amount += amt * (a.amount / tot);
          accMap.set(a.number, cur);
          found = true;
        }
        continue;
      }
      const cur = accMap.get(n) ?? { number: n, label: labelOf(l), amount: 0 };
      cur.amount += amt;
      accMap.set(n, cur);
      found = true;
    }
    if (found) {
      ev.matched += 1;
      ev.matchedTxIds.add(tx.id);
    }
    ev.accounts = [...accMap.values()].sort((a, b) => b.amount - a.amount);
    out.set(tx.key, ev);
  }

  // 5. Nature dominante
  for (const ev of out.values()) {
    const byKind = new Map<RuleKind, number>();
    let known = 0;
    for (const a of ev.accounts) {
      const k = kindFromAccount(a.number);
      if (!k) continue;
      byKind.set(k, (byKind.get(k) ?? 0) + a.amount);
      known += a.amount;
    }
    if (known <= 0) continue;
    const [kind, amt] = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];
    ev.kind = kind;
    ev.share = amt / known;
    const top = ev.accounts.filter((a) => kindFromAccount(a.number) === kind).slice(0, 2);
    ev.reason = `Pennylane : ${top.map((a) => `${a.number}${a.label ? " " + a.label : ""}`).join(", ")} (${ev.matched}/${ev.total} opérations lettrées)`;
  }
  return out;
}
