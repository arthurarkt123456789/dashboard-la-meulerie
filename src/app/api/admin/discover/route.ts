import { NextResponse, type NextRequest } from "next/server";
import {
  fetchAccounts,
  fetchCategories,
  fetchPaymentMeans,
} from "@/lib/apitic/endpoints";
import { checkAdmin } from "@/lib/admin-auth";

// Bootstrap helper: dumps accounts + categories + payment_means so the operator
// can copy IDs into APITIC_ACCOUNT_* and APITIC_CATEGORIES_* env vars.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (process.env.APITIC_ENABLED !== "true") {
    return NextResponse.json(
      { error: "APITIC_ENABLED is not true." },
      { status: 400 },
    );
  }
  try {
    const accounts = await fetchAccounts();
    const details = await Promise.all(
      accounts.map(async (a) => {
        const [categories, paymentMeans] = await Promise.all([
          fetchCategories(a.id).catch(() => []),
          fetchPaymentMeans(a.id).catch(() => []),
        ]);
        return {
          id: a.id,
          name: a.name,
          shop_code: a.shop_code,
          state: a.state,
          country: a.country,
          categories,
          payment_means: paymentMeans,
        };
      }),
    );
    return NextResponse.json({ accounts: details }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, name: err instanceof Error ? err.name : undefined },
      { status: 500 },
    );
  }
}
