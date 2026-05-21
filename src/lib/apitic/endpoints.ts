import "server-only";
import { apiticFetch } from "./http";
import type {
  ApiticAccount,
  ApiticCategory,
  ApiticPaged,
  ApiticPaymentMean,
  ApiticProduct,
  ApiticSale,
  ApiticSalesResponse,
} from "./raw-types";

// ────────────────────────────────────────────────────────────────────────
// Pagination helper
// ────────────────────────────────────────────────────────────────────────

async function paginateAll<T>(
  buildPath: (page: number, size: number) => string,
  pageSize: number,
  opts?: { ignoreBlackout?: boolean },
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  // safety cap so a buggy total doesn't loop forever
  const MAX_PAGES = 200;
  while (page <= MAX_PAGES) {
    const json = (await apiticFetch(
      buildPath(page, pageSize),
      opts,
    )) as ApiticPaged<T>;
    out.push(...json.data);
    if (out.length >= json.total || json.data.length === 0) break;
    page++;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ────────────────────────────────────────────────────────────────────────

// Reference catalogs (accounts / categories / products / payment_means) are
// idempotent metadata, not sales data — APITIC observed to serve them even
// during the lunch / dinner sales blackout windows. Bypass our guard so the
// segment routing keeps working when the user opens the dashboard at 12h30
// or 19h00 right after a deploy with an empty refs cache.
const REF_OPTS = { ignoreBlackout: true };

export async function fetchAccounts(): Promise<ApiticAccount[]> {
  return paginateAll<ApiticAccount>(
    (p, s) => `/accounts?page=${p}&size=${s}`,
    200,
    REF_OPTS,
  );
}

export async function fetchCategories(
  accountId: string,
): Promise<ApiticCategory[]> {
  return paginateAll<ApiticCategory>(
    (p, s) => `/accounts/${accountId}/categories?page=${p}&size=${s}`,
    200,
    REF_OPTS,
  );
}

export async function fetchProducts(
  accountId: string,
): Promise<ApiticProduct[]> {
  return paginateAll<ApiticProduct>(
    (p, s) => `/accounts/${accountId}/products?page=${p}&size=${s}`,
    200,
    REF_OPTS,
  );
}

export async function fetchPaymentMeans(
  accountId: string,
): Promise<ApiticPaymentMean[]> {
  return paginateAll<ApiticPaymentMean>(
    (p, s) => `/accounts/${accountId}/payment-means?page=${p}&size=${s}`,
    200,
    REF_OPTS,
  );
}

/** Fetches every sale for a single fiscal date, paginating until exhausted. */
export async function fetchSalesForDate(
  accountId: string,
  date: string, // YYYY-MM-DD
): Promise<ApiticSale[]> {
  const out: ApiticSale[] = [];
  let page = 1;
  const MAX_PAGES = 200;
  while (page <= MAX_PAGES) {
    const json = (await apiticFetch(
      `/accounts/${accountId}/sales/${date}?page=${page}&size=100`,
    )) as ApiticSalesResponse;
    out.push(...json.data);
    if (out.length >= json.total || json.data.length === 0) break;
    page++;
  }
  return out;
}
