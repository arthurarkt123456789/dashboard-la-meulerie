import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// UUID → our internal store ID
const ACCOUNT_MAP: Record<string, string> = {
  "033711eca5ca84f82b31c92d6456ac48": "malmousque",
  "e33a95762a358c3893af6d71ebd823f2": "davso",
  "ed3a3872726b31b359f7b889ec04dc3e": "endoume",
  "0401b95b044be70b94bf4d0264f1a209": "republique",
  // "45f9793a4c327a4fad3667a8a228bcb1" appears to be a duplicate entry — ignored
};

export type WebcaisseStore = {
  ca: number;
  caHT: number;
  tx: number;
  name: string;
};

export type WebcaisseTodayResponse = {
  date: string;
  fetchedAt: string;
  stores: Record<string, WebcaisseStore>;
  global: { ca: number; caHT: number; tx: number };
  tokenExpiresAt: string | null;
};

export async function GET() {
  const token = process.env.WEBCAISSE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "WEBCAISSE_TOKEN not configured" }, { status: 503 });
  }

  const today = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 10);

  let upstream: Response;
  try {
    upstream = await fetch("https://api3.web-caisse.com/v1/apibusiness/global-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "Origin": "https://apibusiness.web-caisse.com",
        "Referer": "https://apibusiness.web-caisse.com/",
      },
      body: JSON.stringify({ from: today, to: today, type: "period", previous: false }),
    });
  } catch (e) {
    return NextResponse.json({ error: "Network error reaching web-caisse" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Web-caisse API error", status: upstream.status },
      { status: 502 },
    );
  }

  const data = await upstream.json();

  // Map per-account data to our store IDs
  const stores: Record<string, WebcaisseStore> = {};
  for (const [uuid, account] of Object.entries(data.accounts as Record<string, Record<string, unknown>>)) {
    const storeId = ACCOUNT_MAP[uuid];
    if (!storeId) continue;
    stores[storeId] = {
      ca: (account.turnoverTtc as number) ?? 0,
      caHT: (account.turnoverHt as number) ?? 0,
      tx: (account.salesTotal as number) ?? 0,
      name: (account.name as string) ?? storeId,
    };
  }

  // Decode JWT expiry without a library
  let tokenExpiresAt: string | null = null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp) tokenExpiresAt = new Date(payload.exp * 1000).toISOString();
  } catch { /* ignore */ }

  const response: WebcaisseTodayResponse = {
    date: today,
    fetchedAt: new Date().toISOString(),
    stores,
    global: {
      ca: data.global?.turnoverTtc ?? 0,
      caHT: data.global?.turnoverHt ?? 0,
      tx: data.global?.salesTotal ?? 0,
    },
    tokenExpiresAt,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
