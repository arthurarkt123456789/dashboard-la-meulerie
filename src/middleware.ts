import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/dashboard-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never intercept Next.js internals or static assets
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Login page and login API are always public
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  // Admin routes use their own ADMIN_TOKEN auth — skip cookie check
  if (pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }

  // If DASHBOARD_PASSWORD is not configured, allow open access
  const pwd = process.env.DASHBOARD_PASSWORD;
  if (!pwd || pwd.length === 0) {
    return NextResponse.next();
  }

  // Validate session cookie
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySession(session);

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
