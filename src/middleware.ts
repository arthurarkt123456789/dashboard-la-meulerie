import { NextResponse, type NextRequest } from "next/server";

// Self-contained: Edge Runtime cannot reliably import from external modules
// that read process.env. All auth logic is inlined here.

const COOKIE = "lm_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

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

async function sessionValid(cookie: string | undefined, pwd: string): Promise<boolean> {
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot <= 0) return false;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > MAX_AGE) return false;
  const expected = await hmac256(pwd, payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Login page and login API are always public
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  // Healthcheck endpoint must be reachable without a session cookie
  if (pathname === "/api/today") {
    return NextResponse.next();
  }

  // Admin routes have their own ADMIN_TOKEN auth
  if (pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }

  // If DASHBOARD_PASSWORD is not set, allow open access
  const pwd = process.env.DASHBOARD_PASSWORD;
  if (!pwd || pwd.trim().length === 0) {
    return NextResponse.next();
  }

  // Check session cookie
  const cookie = request.cookies.get(COOKIE)?.value;
  const valid = await sessionValid(cookie, pwd);

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
