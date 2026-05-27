import "server-only";
import type { Segment, Store } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Static metadata for the 4 stores (mirror of the proto). The mapping to
// APITIC account IDs comes from env vars filled in by the operator after
// running /api/admin/discover.
// ────────────────────────────────────────────────────────────────────────

type StoreMeta = Store & {
  envVar: string;
  openedEnvVar: string;
};

export const STORE_META: StoreMeta[] = [
  {
    id: "davso",
    name: "Davso",
    fullName: "La Meulerie Davso",
    address: "12 rue Francis Davso, 13001 Marseille",
    opened: "2019",
    openedDate: "2019-03-15",
    envVar: "APITIC_ACCOUNT_DAVSO",
    openedEnvVar: "APITIC_OPENED_DAVSO",
  },
  {
    id: "endoume",
    name: "Endoume",
    fullName: "La Meulerie Endoume",
    address: "8 rue d'Endoume, 13007 Marseille",
    opened: "2021",
    openedDate: "2099-12-31",
    envVar: "APITIC_ACCOUNT_ENDOUME",
    openedEnvVar: "APITIC_OPENED_ENDOUME",
  },
  {
    id: "malmousque",
    name: "Malmousque",
    fullName: "La Meulerie Malmousque",
    address: "3 traverse Malmousque, 13007 Marseille",
    opened: "2023",
    openedDate: "2023-06-10",
    envVar: "APITIC_ACCOUNT_MALMOUSQUE",
    openedEnvVar: "APITIC_OPENED_MALMOUSQUE",
  },
  {
    id: "republique",
    name: "République",
    fullName: "La Meulerie République",
    address: "45 rue de la République, 13002 Marseille",
    opened: "2021",
    openedDate: "2021-01-01",
    envVar: "APITIC_ACCOUNT_REPUBLIQUE",
    openedEnvVar: "APITIC_OPENED_REPUBLIQUE",
  },
];

/** Operator-supplied override of the store opening date (YYYY-MM-DD). */
export function getOpenedOverride(storeId: string): string | null {
  const meta = STORE_META.find((s) => s.id === storeId);
  if (!meta) return null;
  const raw = process.env[meta.openedEnvVar];
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export type StoreLink = {
  storeId: string;
  accountId: string;
  meta: StoreMeta;
};

/** Returns the resolved store ↔ account links, skipping any unset env vars. */
export function getConfiguredStoreLinks(): StoreLink[] {
  const out: StoreLink[] = [];
  for (const meta of STORE_META) {
    const accountId = process.env[meta.envVar];
    if (accountId && accountId.trim().length > 0) {
      out.push({ storeId: meta.id, accountId: accountId.trim(), meta });
    }
  }
  return out;
}

export function getLinkByStoreId(storeId: string): StoreLink | null {
  return getConfiguredStoreLinks().find((l) => l.storeId === storeId) ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Category → Segment mapping
//
// Configured via env:
//   APITIC_CATEGORIES_FROMAGERIE="12,34,55"
//   APITIC_CATEGORIES_SNACKING="2,7,18"
//   APITIC_CATEGORIES_EPICERIE="8,9,23"   ← optional third segment
// Anything else falls back to APITIC_DEFAULT_SEGMENT (default "Snacking").
//
// If both env vars are empty, we degrade gracefully with a keyword heuristic
// on the category name (Fromagerie if it contains a cheesy keyword).
// ────────────────────────────────────────────────────────────────────────

function parseIdList(s: string | undefined): Set<number> {
  if (!s) return new Set();
  return new Set(
    s
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x)),
  );
}

const CHEESE_KEYWORDS = [
  "fromage",
  "froma",
  "cremerie",
  "crémerie",
  "lait",
  "yaourt",
  "beurre",
];

export type SegmentMapper = {
  segmentForCategory(categoryId: number, categoryName?: string): Segment;
  defaultSegment: Segment;
};

export function buildSegmentMapper(): SegmentMapper {
  const fromagerieIds = parseIdList(process.env.APITIC_CATEGORIES_FROMAGERIE);
  const epicerieIds = parseIdList(process.env.APITIC_CATEGORIES_EPICERIE);
  const snackingIds = parseIdList(process.env.APITIC_CATEGORIES_SNACKING);
  const defaultSegment: Segment =
    process.env.APITIC_DEFAULT_SEGMENT === "Fromagerie"
      ? "Fromagerie"
      : "Snacking";
  const hasConfig = fromagerieIds.size + epicerieIds.size + snackingIds.size > 0;

  return {
    defaultSegment,
    segmentForCategory(categoryId: number, categoryName?: string): Segment {
      if (fromagerieIds.has(categoryId)) return "Fromagerie";
      if (epicerieIds.has(categoryId)) return "Épicerie";
      if (snackingIds.has(categoryId)) return "Snacking";
      if (!hasConfig && categoryName) {
        const n = categoryName.toLowerCase();
        if (CHEESE_KEYWORDS.some((k) => n.includes(k))) return "Fromagerie";
      }
      return defaultSegment;
    },
  };
}
