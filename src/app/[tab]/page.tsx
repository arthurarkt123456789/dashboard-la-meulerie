import { Dashboard } from "@/components/Dashboard";
import { listStores } from "@/lib/apitic/client";
import { notFound } from "next/navigation";

// Pre-render the well-known tabs at build time (no APITIC call needed since
// the store ids are stable). Any other slug 404s.
export const dynamicParams = true;

const KNOWN_TABS = ["all", "davso", "endoume", "malmousque", "republique"] as const;

export function generateStaticParams() {
  return KNOWN_TABS.map((tab) => ({ tab }));
}

export default async function TabPage({
  params,
}: {
  params: { tab: string };
}) {
  const valid = new Set<string>(KNOWN_TABS);
  // Add any extra ids the operator may have mapped beyond the four canonical
  // stores. listStores() is cheap (mock or local mapping read), no APITIC.
  for (const s of await listStores()) valid.add(s.id);
  if (!valid.has(params.tab)) notFound();
  return <Dashboard tab={params.tab} />;
}
