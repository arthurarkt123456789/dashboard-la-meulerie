import { NextResponse, type NextRequest } from "next/server";
import {
  fetchCategories,
  fetchProducts,
  fetchPaymentMeans,
} from "@/lib/apitic/endpoints";
import { buildSegmentMapper, getConfiguredStoreLinks } from "@/lib/apitic/mapping";
import { checkAdmin } from "@/lib/admin-auth";

// Diagnostic: for each store, fetch reference data (products / categories /
// payment_means) and report counts + segment coverage. Helps detect whether
// fetchProducts is silently failing or whether category_id → segment mapping
// is missing IDs.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const links = getConfiguredStoreLinks();
  const mapper = buildSegmentMapper();

  const results = await Promise.all(
    links.map(async (link) => {
      let products: Awaited<ReturnType<typeof fetchProducts>> = [];
      let categories: Awaited<ReturnType<typeof fetchCategories>> = [];
      let paymentMeans: Awaited<ReturnType<typeof fetchPaymentMeans>> = [];
      const errors: { kind: string; message: string }[] = [];
      try {
        products = await fetchProducts(link.accountId);
      } catch (err) {
        errors.push({
          kind: "products",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        categories = await fetchCategories(link.accountId);
      } catch (err) {
        errors.push({
          kind: "categories",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        paymentMeans = await fetchPaymentMeans(link.accountId);
      } catch (err) {
        errors.push({
          kind: "payment_means",
          message: err instanceof Error ? err.message : String(err),
        });
      }

      const categoryById = new Map(categories.map((c) => [c.id, c.name]));
      const segCounts = { Fromagerie: 0, Snacking: 0 };
      const unknownCats = new Map<number, { name: string; count: number }>();
      for (const p of products) {
        const catName = categoryById.get(p.category_id);
        const seg = mapper.segmentForCategory(p.category_id, catName);
        segCounts[seg]++;
        // Track category_ids that fell through to the default
        // (= not present in either env list)
        const fromagerieEnv = (process.env.APITIC_CATEGORIES_FROMAGERIE || "")
          .split(",")
          .map((x) => Number(x.trim()))
          .filter(Boolean);
        const snackingEnv = (process.env.APITIC_CATEGORIES_SNACKING || "")
          .split(",")
          .map((x) => Number(x.trim()))
          .filter(Boolean);
        if (
          !fromagerieEnv.includes(p.category_id) &&
          !snackingEnv.includes(p.category_id)
        ) {
          const e = unknownCats.get(p.category_id) ?? {
            name: catName ?? "(?)",
            count: 0,
          };
          e.count++;
          unknownCats.set(p.category_id, e);
        }
      }
      return {
        storeId: link.storeId,
        accountId: link.accountId,
        productsCount: products.length,
        categoriesCount: categories.length,
        paymentMeansCount: paymentMeans.length,
        segCounts,
        unknownCategories: Array.from(unknownCats.entries()).map(([id, info]) => ({
          id,
          name: info.name,
          products: info.count,
        })),
        sampleProducts: products.slice(0, 3).map((p) => ({
          id: p.id,
          name: p.name,
          category_id: p.category_id,
          category_name: categoryById.get(p.category_id) ?? null,
        })),
        errors,
      };
    }),
  );

  return NextResponse.json({
    fromagerieEnvCount: (process.env.APITIC_CATEGORIES_FROMAGERIE || "")
      .split(",")
      .filter(Boolean).length,
    snackingEnvCount: (process.env.APITIC_CATEGORIES_SNACKING || "")
      .split(",")
      .filter(Boolean).length,
    defaultSegment: process.env.APITIC_DEFAULT_SEGMENT || "Snacking",
    perStore: results,
  });
}
