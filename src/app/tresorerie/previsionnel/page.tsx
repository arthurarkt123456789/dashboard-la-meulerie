import { listStores } from "@/lib/apitic/client";
import { PrevisionnelView } from "@/components/previsionnel/PrevisionnelView";

export const dynamic = "force-dynamic";

export default async function PrevisionnelPage({ searchParams }: { searchParams?: { store?: string } }) {
  const stores = await listStores();
  const initial = searchParams?.store && stores.some((s) => s.id === searchParams.store) ? searchParams.store : "davso";
  return <PrevisionnelView stores={stores} initialStore={initial} />;
}
