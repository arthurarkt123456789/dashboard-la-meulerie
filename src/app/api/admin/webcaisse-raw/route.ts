import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function callGlobalData(token: string, date: string, extraHeaders: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  const res = await fetch("https://api3.web-caisse.com/v1/apibusiness/global-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://apibusiness.web-caisse.com",
      Referer: "https://apibusiness.web-caisse.com/",
      ...extraHeaders,
    },
    body: JSON.stringify({ from: date, to: date, previous: false, ...body }),
  });
  const data = await res.json() as Record<string, unknown>;
  const global = data.global as Record<string, number> | undefined;
  return {
    status: res.status,
    globalHT: global?.turnoverHt ?? null,
    globalTx: global?.salesTotal ?? null,
    accountCount: data.accounts ? Object.keys(data.accounts as object).length : 0,
  };
}

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const today = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 10);
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? today;

  const token = process.env.WEBCAISSE_TOKEN ?? process.env.WEBCAISSE_EMAIL; // use static token
  if (!token) return NextResponse.json({ error: "No token configured" }, { status: 503 });

  const staticToken = process.env.WEBCAISSE_TOKEN;
  if (!staticToken) return NextResponse.json({ error: "WEBCAISSE_TOKEN not set" }, { status: 503 });

  const [typePeriod, typeDay, noCacheHeaders, withTimestamp] = await Promise.all([
    callGlobalData(staticToken, date, {}, { type: "period" }),
    callGlobalData(staticToken, date, {}, { type: "day" }),
    callGlobalData(staticToken, date, { "Cache-Control": "no-cache", "Pragma": "no-cache" }, { type: "period" }),
    callGlobalData(staticToken, date, {}, { type: "period", _ts: Date.now() }),
  ]);

  return NextResponse.json({
    date,
    "type=period": typePeriod,
    "type=day": typeDay,
    "type=period+no-cache": noCacheHeaders,
    "type=period+timestamp": withTimestamp,
  }, { headers: { "Cache-Control": "no-store" } });
}
