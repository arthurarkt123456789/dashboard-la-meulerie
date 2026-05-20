// Raw payload shapes from APITIC's BI Data API (v0.9.3).
// Mirror the doc exactly — do NOT add convenience fields here.
// Mapping to our internal types lives in aggregator.ts.

export type ApiticTokenResponse = {
  access_token: string;
  /** "YYYY-MM-DD HH:mm:ss" (UTC) */
  access_token_expired_at: string;
};

export type ApiticPaged<T> = {
  page: number;
  limit: number;
  total: number;
  data: T[];
};

export type ApiticAccount = {
  id: string;
  name: string;
  closing_time: string;
  shop_code: string;
  currency: string;
  business_networking: string;
  timezone: string;
  state: string;
  country: string;
};

export type ApiticCategory = {
  id: number;
  name: string;
  model_id: string;
  parent_id: number;
};

export type ApiticProduct = {
  id: number;
  name: string;
  model_id: string;
  category_id: number;
  ati_price: number;
  purchase_price_excl_tax: number;
};

export type ApiticPaymentMean = {
  id: number;
  name: string;
  is_discount: boolean;
};

export type ApiticSaleLine = {
  id: number;
  product_id: number;
  line_type: "sale" | string;
  composed_product_id: number;
  composed_product_number: number;
  composed_product_order: number;
  quantity: number;
  vat_rate: number;
  purchase_price_excl_tax: number;
  unit_ati_price: number;
  unit_price_excl_tax: number;
  ati_price: number;
  price_excl_tax: number;
  discount_ati_price: number;
  discount_price_excl_tax: number;
};

export type ApiticSalePayment = {
  id: number;
  payment_mean_id: number;
  coupon_id: string | null;
  amount: number;
  datetime: string;
  electronic_banking?: {
    application_id: number;
    scheme_id: number;
  };
};

export type ApiticSale = {
  id: number;
  ticket_number: number | null;
  datetime_created: string;
  datetime_paid: string;
  time: string;
  platform: string;
  sale_type: string;
  guests_number: number;
  lines: ApiticSaleLine[];
  payments: ApiticSalePayment[];
  fidelity_discounts?: unknown[];
};

export type ApiticSalesResponse = ApiticPaged<ApiticSale> & {
  fiscal_date: string;
};
