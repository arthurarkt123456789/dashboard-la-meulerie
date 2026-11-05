import { listStores } from "@/lib/apitic/client";
import { TresorerieView } from "@/components/TresorerieView";

export default async function TresPage() {
  const stores = await listStores();
  return <TresorerieView stores={stores} />;
}
