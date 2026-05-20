import { NextResponse } from "next/server";
import { getToday } from "@/lib/apitic/client";

export async function GET() {
  return NextResponse.json({ iso: getToday().toISOString() });
}
