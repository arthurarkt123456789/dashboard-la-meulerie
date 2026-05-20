import { NextResponse } from "next/server";
import { getToday } from "@/lib/apitic/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { iso: getToday().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
