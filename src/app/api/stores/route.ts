import { NextResponse } from "next/server";
import { listStores } from "@/lib/apitic/client";

export const revalidate = 3600;

export async function GET() {
  const stores = await listStores();
  return NextResponse.json(stores);
}
