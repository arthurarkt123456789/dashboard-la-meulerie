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
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  // safety cap so a buggy total doesn't loop forever
  const MAX_PAGES = 200;
  while (page <= MAX_PAGES) {
    const json = (await apiticFetch(buildPath(page, pageSize))) as ApiticPaged<T>;
    out.push(...json.data);
    if (out.length >= json.total || json.data.length === 0) break;
    page++;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ────────────────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<ApiticAccount[]> {
  return paginateAll<ApiticAccount>(
    (p, s) => `/accounts?page=${p}&size=${s}`,
    200,
  );
}

export async function fetchCategories(
  accountId: string,
): Promise<ApiticCategory[]> {
  return paginateAll<ApiticCategory>(
    (p, s) => `/accounts/${accountId}/categories?page=${p}&size=${s}`,
    200,
  );
}

export async function fetchProducts(
  accountId: string,
): Promise<ApiticProduct[]> {
  return paginateAll<ApiticProduct>(
    (p, s) => `/accounts/${accountId}/products?page=${p}&size=${s}`,
    200,
  );
}

export async function fetchPaymentMeans(
  accountId: string,
): Promise<ApiticPaymentMean[]> {
  return paginateAll<ApiticPaymentMean>(
    (p, s) => `/accounts/${accountId}/payment-means?page=${p}&size=${s}`,
    200,
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
