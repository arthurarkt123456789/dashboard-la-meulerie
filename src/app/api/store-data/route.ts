import { NextResponse } from "next/server";
import { getAllStoreData } from "@/lib/apitic/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAllStoreData();
    return NextResponse.json(data, {
      headers: {
        // private: CDN/proxy must not cache this — the refresh button would
        // get a stale CDN response otherwise. TanStack Query handles its own
        // 60s client-side staleTime; no server-side shared cache needed.
        "Cache-Control": "private, no-cache",
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
