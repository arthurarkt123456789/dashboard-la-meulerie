import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/dashboard-auth";

// Paths that bypass the password gate:
//  - /login (and its POST endpoint)
//  - /api/admin/* (those have their own ADMIN_TOKEN auth)
//  - Next.js internals + favicon
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/admin/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // No password configured = no gate at all (dev / preview convenience).
  if (!process.env.DASHBOARD_PASSWORD) return NextResponse.next();

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const ok = await verifySession(cookie);
  if (ok) return NextResponse.next();

  // Redirect HTML pages to /login, return 401 JSON for /api routes.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Skip _next assets and the favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
