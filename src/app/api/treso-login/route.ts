import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TRESO_COOKIE = "lm_treso";
const MAX_AGE = 30 * 24 * 60 * 60;

async function hmac256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function POST(req: NextRequest) {
  const tresoPwd = process.env.TRESO_PASSWORD;
  if (!tresoPwd || tresoPwd.trim().length === 0) {
    return NextResponse.json({ error: "Trésorerie non configurée." }, { status: 503 });
  }

  let password: string | undefined;
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (!password || password !== tresoPwd) {
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  const issuedAt = String(Math.floor(Date.now() / 1000));
  const sig = await hmac256(tresoPwd, issuedAt);
  const session = `${issuedAt}.${sig}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TRESO_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
