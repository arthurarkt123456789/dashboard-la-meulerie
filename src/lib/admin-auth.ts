import "server-only";
import type { NextRequest } from "next/server";

// Shared-secret check for /api/admin/* routes. The token can come from:
//   - `?token=...` query string
//   - `Authorization: Bearer ...` header
//   - `X-Admin-Token: ...` header
//
// If ADMIN_TOKEN is unset, admin routes are always refused (fail closed).

export type AdminCheck =
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string };

export function checkAdmin(req: NextRequest): AdminCheck {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.trim().length === 0) {
    return {
      ok: false,
      status: 403,
      message: "ADMIN_TOKEN is not configured on the server.",
    };
  }
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  const fromAuth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromHeader = req.headers.get("x-admin-token");
  const given = fromQuery || fromAuth || fromHeader;
  if (!given) {
    return { ok: false, status: 401, message: "Missing admin token." };
  }
  if (given !== expected) {
    return { ok: false, status: 401, message: "Invalid admin token." };
  }
  return { ok: true };
}
