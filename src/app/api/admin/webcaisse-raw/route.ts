import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const AUTH_ENDPOINTS = [
  "https://api3.web-caisse.com/v1/auth/login",
  "https://api3.web-caisse.com/v1/apibusiness/auth/login",
];

async function getCredentialsToken(): Promise<{ token: string; via: string } | null> {
  const email = process.env.WEBCAISSE_EMAIL;
  const password = process.env.WEBCAISSE_PASSWORD;
  if (!email || !password) return null;
  for (const url of AUTH_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const token = (data.token ?? data.access_token ?? data.jwt ?? data.authToken) as string | undefined;
        if (token) return { token, via: url };
      }
    } catch { /* try next */ }
  }
  return null;
}

async function callGlobalData(token: string, date: string) {
  const res = await fetch("https://api3.web-caisse.com/v1/apibusiness/global-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://apibusiness.web-caisse.com",
      Referer: "https://apibusiness.web-caisse.com/",
    },
    body: JSON.stringify({ from: date, to: date, type: "period", previous: false }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const today = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 10);
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? today;

  const staticToken = process.env.WEBCAISSE_TOKEN ?? null;
  const credResult = await getCredentialsToken();

  const results: Record<string, unknown> = { date };

  if (credResult) {
    const r = await callGlobalData(credResult.token, date);
    results.credentials = {
      via: credResult.via,
      status: r.status,
      globalHT: (r.data as Record<string, Record<string, number>>)?.global?.turnoverHt,
      raw: r.data,
    };
  } else {
    results.credentials = "WEBCAISSE_EMAIL/PASSWORD not set";
  }

  if (staticToken) {
    const r = await callGlobalData(staticToken, date);
    results.staticToken = {
      status: r.status,
      globalHT: (r.data as Record<string, Record<string, number>>)?.global?.turnoverHt,
      raw: r.data,
    };
  } else {
    results.staticToken = "WEBCAISSE_TOKEN not set";
  }

  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
