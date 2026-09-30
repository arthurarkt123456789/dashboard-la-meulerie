import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Dumps the raw WebCaisse global-data response to diagnose field names and account count.

const AUTH_ENDPOINTS = [
  "https://api3.web-caisse.com/v1/auth/login",
  "https://api3.web-caisse.com/v1/apibusiness/auth/login",
];

async function getToken(): Promise<string | null> {
  const email = process.env.WEBCAISSE_EMAIL;
  const password = process.env.WEBCAISSE_PASSWORD;
  if (email && password) {
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
          if (token) return token;
        }
      } catch { /* try next */ }
    }
  }
  return process.env.WEBCAISSE_TOKEN ?? null;
}

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const token = await getToken();
  if (!token) return NextResponse.json({ error: "No token available" }, { status: 503 });

  const today = new Date()
    .toLocaleString("sv-SE", { timeZone: "Europe/Paris" })
    .slice(0, 10);

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? today;

  const upstream = await fetch(
    "https://api3.web-caisse.com/v1/apibusiness/global-data",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "https://apibusiness.web-caisse.com",
        Referer: "https://apibusiness.web-caisse.com/",
      },
      body: JSON.stringify({ from: date, to: date, type: "period", previous: false }),
    },
  );

  const raw = await upstream.json();

  // Return accounts with all keys visible so we can inspect field names
  return NextResponse.json({ date, status: upstream.status, raw }, {
    headers: { "Cache-Control": "no-store" },
  });
}
