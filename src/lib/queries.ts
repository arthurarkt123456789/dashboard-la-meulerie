"use client";

import { useQuery } from "@tanstack/react-query";
import type { Store, StoreData } from "./apitic/types";

export type ProInvoiceMonth = {
  month: string;
  amountTTC: number;
  amountHT: number;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: () => fetchJson<Store[]>("/api/stores"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useStoreData() {
  return useQuery({
    queryKey: ["store-data"],
    queryFn: () => fetchJson<StoreData[]>("/api/store-data"),
    // Live partial day refreshes every 60s; longer-window aggregates are still
    // valid from the same payload, so a single query covers everything.
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useToday() {
  return useQuery({
    queryKey: ["today"],
    queryFn: () => fetchJson<{ iso: string }>("/api/today"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProInvoices(storeId: string | null) {
  return useQuery({
    queryKey: ["pro-invoices", storeId],
    queryFn: () =>
      fetchJson<{ months: ProInvoiceMonth[] }>(
        `/api/financial/pro-invoices?storeId=${storeId}&months=24`,
      ),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
