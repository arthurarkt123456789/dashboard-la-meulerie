import "server-only";
import {
  aggregateAllStores,
  aggregateStore,
  listConfiguredStores,
} from "./aggregator";
import {
  ApiticBlackoutError,
  ApiticConfigError,
  ApiticHttpError,
} from "./http";
import {
  getAllStoreData as mockGetAll,
  getStoreData as mockGet,
  getToday as mockToday,
  listStores as mockList,
} from "./mock";
import type { Store, StoreData } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Single swap point between mock data and real APITIC.
// Set APITIC_ENABLED=true to switch.
// ────────────────────────────────────────────────────────────────────────

const apiticEnabled = process.env.APITIC_ENABLED === "true";
const fallbackToMock = process.env.APITIC_FALLBACK_TO_MOCK !== "false";

function isExpectedApiticError(err: unknown): boolean {
  return (
    err instanceof ApiticBlackoutError ||
    err instanceof ApiticConfigError ||
    err instanceof ApiticHttpError ||
    (err instanceof Error && err.name.startsWith("Apitic"))
  );
}

function logApiticError(scope: string, err: unknown) {
  if (err instanceof Error) {
    console.warn(`[apitic] ${scope}: ${err.name} ${err.message}`);
  } else {
    console.warn(`[apitic] ${scope}: unknown error`, err);
  }
}

export async function listStores(): Promise<Store[]> {
  if (!apiticEnabled) return mockList();
  try {
    const real = listConfiguredStores();
    if (real.length > 0) return real;
    // No mapping configured yet — fall back so the dashboard still renders.
    return fallbackToMock ? mockList() : [];
  } catch (err) {
    logApiticError("listStores", err);
    if (fallbackToMock) return mockList();
    throw err;
  }
}

export async function getStoreData(id: string): Promise<StoreData | null> {
  if (!apiticEnabled) return mockGet(id);
  try {
    const data = await aggregateStore(id);
    if (data) return data;
    return fallbackToMock ? mockGet(id) : null;
  } catch (err) {
    if (!isExpectedApiticError(err)) throw err;
    logApiticError(`getStoreData(${id})`, err);
    return fallbackToMock ? mockGet(id) : null;
  }
}

export async function getAllStoreData(): Promise<StoreData[]> {
  if (!apiticEnabled) return mockGetAll();
  try {
    const data = await aggregateAllStores();
    if (data.length > 0) return data;
    return fallbackToMock ? mockGetAll() : [];
  } catch (err) {
    if (!isExpectedApiticError(err)) throw err;
    logApiticError("getAllStoreData", err);
    return fallbackToMock ? mockGetAll() : [];
  }
}

export function getToday(): Date {
  if (!apiticEnabled) return mockToday();
  return new Date();
}
