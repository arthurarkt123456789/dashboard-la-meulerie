import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  buildSession,
  isPasswordConfigured,
  passwordMatches,
} from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { error: "Password gate is not configured on this deploy." },
      { status: 503 },
    );
  }
  let password: string | undefined;
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!password || !passwordMatches(password)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await buildSession();
  if (!session) {
    return NextResponse.json({ error: "Session build failed" }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
