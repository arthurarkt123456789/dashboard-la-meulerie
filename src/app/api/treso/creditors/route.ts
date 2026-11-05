import { NextResponse, type NextRequest } from "next/server";
import { getPennylaneConfig } from "@/lib/pennylane/client";
import { fetchBankTransactions } from "@/lib/pennylane/transactions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Map Pennylane account prefixes to our display categories
const ACCOUNT_TO_CATEGORY: [string, string][] = [
  ["60", "Achats matières"],
  ["61", "Dépenses externes"],
  ["62", "Dépenses externes"],
  ["63", "Impôts & taxes"],
  ["64", "Dépenses personnel"],
  ["65", "Autres dépenses"],
  ["66", "Dépenses financières"],
  ["67", "Dépenses except."],
  ["16", "Remb. emprunts"],
];

function accountToCategory(num: string | null): string | null {
  if (!num) return null;
  for (const [prefix, label] of ACCOUNT_TO_CATEGORY) {
    if (num.startsWith(prefix)) return label;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store");
  if (!storeId) return NextResponse.json({ error: "Missing store" }, { status: 400 });

  const config = getPennylaneConfig(storeId);
  if (!config) return NextResponse.json({ error: "No config" }, { status: 404 });

  // Current month
  const now = new Date();
  const minDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const maxDate = now.toISOString().slice(0, 10);

  try {
    const transactions = await fetchBankTransactions(config.token, minDate, maxDate);

    type CreditorAcc = {
      name: string;
      totalAmount: number;
      count: number;
      categorizedAmount: number;
      uncategorizedAmount: number;
      inferredCategory: string | null;
    };

    const map = new Map<string, CreditorAcc>();

    for (const tx of transactions) {
      if (tx.amount > 0) continue; // skip inflows
      const amount = Math.abs(tx.amount);
      const name = tx.description.trim() || "Sans description";

      const acc = map.get(name) ?? {
        name, totalAmount: 0, count: 0,
        categorizedAmount: 0, uncategorizedAmount: 0,
        inferredCategory: null,
      };

      acc.totalAmount += amount;
      acc.count += 1;

      const cat = accountToCategory(tx.ledgerAccountNumber);
      if (cat) {
        acc.categorizedAmount += amount;
        if (!acc.inferredCategory) acc.inferredCategory = cat;
      } else {
        acc.uncategorizedAmount += amount;
      }

      map.set(name, acc);
    }

    const creditors = Array.from(map.values())
      .filter((c) => c.totalAmount > 1)
      // Auto-classify: if same creditor has categorized transactions, that infers the category
      // for uncategorized ones (user requested: "si une facture est classifiée, on classifie aussi")
      .map((c) => ({
        name: c.name,
        totalAmount: Math.round(c.totalAmount * 100) / 100,
        count: c.count,
        categorizedAmount: Math.round(c.categorizedAmount * 100) / 100,
        uncategorizedAmount: Math.round(c.uncategorizedAmount * 100) / 100,
        inferredCategory: c.inferredCategory, // non-null = auto-classify suggestion
      }))
      .sort((a, b) => b.uncategorizedAmount - a.uncategorizedAmount || b.totalAmount - a.totalAmount);

    const totalUncategorized = Math.round(
      creditors.reduce((s, c) => s + c.uncategorizedAmount, 0) * 100,
    ) / 100;

    return NextResponse.json({
      creditors,
      totalUncategorized,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[treso/creditors] ${storeId}:`, (err as Error).message);
    // Return 200 with empty list so client can show a graceful message
    return NextResponse.json({
      creditors: [],
      totalUncategorized: 0,
      error: (err as Error).message,
    });
  }
}
