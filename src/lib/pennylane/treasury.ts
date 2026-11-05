import "server-only";
import type { TrialBalanceLine } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CategoryFlow = {
  label: string;
  amount: number;
  direction: "in" | "out";
};

export type MonthCashflow = {
  month: string;
  inflows: number;   // 51x/53x debit (encaissements)
  outflows: number;  // 51x/53x credit (décaissements)
  net: number;
  categoryBreakdown: CategoryFlow[];
};

export type TresoAccount = {
  number: string;
  name: string;
  balance: number; // debit - credit = solde actuel
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function accountCategory(n: string): { label: string; direction: "in" | "out" } | null {
  if (n.startsWith("70") || n.startsWith("71") || n.startsWith("72")) return { label: "Ventes / Produits", direction: "in" };
  if (n.startsWith("74") || n.startsWith("75") || n.startsWith("77")) return { label: "Autres produits", direction: "in" };
  if (n.startsWith("60")) return { label: "Achats matières", direction: "out" };
  if (n.startsWith("61") || n.startsWith("62")) return { label: "Charges externes", direction: "out" };
  if (n.startsWith("63")) return { label: "Impôts & taxes", direction: "out" };
  if (n.startsWith("64")) return { label: "Charges personnel", direction: "out" };
  if (n.startsWith("65")) return { label: "Autres charges", direction: "out" };
  if (n.startsWith("66")) return { label: "Charges financières", direction: "out" };
  if (n.startsWith("67")) return { label: "Charges exceptionnelles", direction: "out" };
  if (n.startsWith("16")) return { label: "Remboursements emprunts", direction: "out" };
  return null;
}

// ── Extraction from trial balance lines ───────────────────────────────────────

/**
 * Extracts monthly cash flow from trial balance lines.
 * Uses 51x/53x (bank/cash) account movements as the cash basis.
 */
export function extractMonthCashflow(lines: TrialBalanceLine[], month: string): MonthCashflow {
  let inflows = 0;
  let outflows = 0;
  const catMap = new Map<string, number>();

  for (const line of lines) {
    const n = line.ledger_account_number;

    // Cash accounts: 51x (bank), 53x (caisse)
    if (n.startsWith("51") || n.startsWith("53")) {
      inflows += line.debit;    // debit on bank = money received
      outflows += line.credit;  // credit on bank = money paid
      continue;
    }

    // Counterpart accounts — build category breakdown using movement direction
    const cat = accountCategory(n);
    if (!cat) continue;

    // For revenue accounts (7x): credit = revenue recognized → cash inflow
    // For expense accounts (6x/16x): debit = expense recognized → cash outflow
    const movement = cat.direction === "in"
      ? Math.max(0, line.credit - line.debit)   // net credit on revenue accounts
      : Math.max(0, line.debit - line.credit);   // net debit on expense accounts

    if (movement > 0.01) {
      catMap.set(cat.label, (catMap.get(cat.label) ?? 0) + movement);
    }
  }

  // Build direction map from first seen account per label
  const dirMap = new Map<string, "in" | "out">();
  for (const line of lines) {
    const cat = accountCategory(line.ledger_account_number);
    if (cat && !dirMap.has(cat.label)) dirMap.set(cat.label, cat.direction);
  }

  const categoryBreakdown: CategoryFlow[] = [];
  for (const [label, amount] of catMap.entries()) {
    if (amount < 0.01) continue;
    categoryBreakdown.push({ label, amount: Math.round(amount * 100) / 100, direction: dirMap.get(label) ?? "out" });
  }

  // Sort by amount descending
  categoryBreakdown.sort((a, b) => b.amount - a.amount);

  return {
    month,
    inflows: Math.round(inflows * 100) / 100,
    outflows: Math.round(outflows * 100) / 100,
    net: Math.round((inflows - outflows) * 100) / 100,
    categoryBreakdown,
  };
}

/**
 * Extracts current bank account balances from a lifetime trial balance.
 * balance = debit - credit = net cash position on that account.
 */
export function extractTresoAccounts(lines: TrialBalanceLine[]): TresoAccount[] {
  return lines
    .filter(
      (l) =>
        (l.ledger_account_number.startsWith("51") || l.ledger_account_number.startsWith("53")) &&
        (Math.abs(l.debit) > 0.01 || Math.abs(l.credit) > 0.01 || Math.abs(l.balance) > 0.01),
    )
    .map((l) => ({
      number: l.ledger_account_number,
      name: l.ledger_account_name || `Compte ${l.ledger_account_number}`,
      balance: Math.round(l.balance * 100) / 100,
    }))
    .sort((a, b) => b.balance - a.balance);
}
