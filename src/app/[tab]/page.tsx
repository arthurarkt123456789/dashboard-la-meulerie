import { Dashboard } from "@/components/Dashboard";
import { listStores } from "@/lib/apitic/client";
import { notFound } from "next/navigation";

const VALID_TABS = new Set(["all"]);

export async function generateStaticParams() {
  const stores = await listStores();
  return [{ tab: "all" }, ...stores.map((s) => ({ tab: s.id }))];
}

export default async function TabPage({
  params,
}: {
  params: { tab: string };
}) {
  const stores = await listStores();
  for (const s of stores) VALID_TABS.add(s.id);
  if (!VALID_TABS.has(params.tab)) {
    notFound();
  }
  return <Dashboard tab={params.tab} />;
}
