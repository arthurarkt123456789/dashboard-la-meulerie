import { NextResponse } from "next/server";
import { getAllStoreData } from "@/lib/apitic/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAllStoreData();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: unknown; code?: string };
    const cause = e.cause as { message?: string; code?: string } | undefined;
    console.error("[store-data] failed:", e?.name, e?.message, cause);
    return NextResponse.json(
      {
        error: e?.message ?? "Unknown error",
        name: e?.name,
        code: e?.code,
        cause: cause ? { message: cause.message, code: cause.code } : undefined,
      },
      { status: 500 },
    );
  }
}
