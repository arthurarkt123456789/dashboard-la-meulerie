"use client";

import { useQuery } from "@tanstack/react-query";
import type { Store, StoreData } from "./apitic/types";

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
