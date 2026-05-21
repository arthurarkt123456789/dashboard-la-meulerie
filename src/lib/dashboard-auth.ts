// Shared helpers for the dashboard's password-protection layer.
// Runs in Next.js edge middleware so we use the Web Crypto API rather than
// node:crypto.

const COOKIE_NAME = "lm_session";
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = COOKIE_MAX_AGE_S;

function getPassword(): string | null {
  const v = process.env.DASHBOARD_PASSWORD;
  return v && v.length > 0 ? v : null;
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  // base64url
  const bytes = new Uint8Array(sig);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Builds a cookie value: "<issuedAtSec>.<hmac>" */
export async function buildSession(): Promise<string | null> {
  const pwd = getPassword();
  if (!pwd) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = String(issuedAt);
  const sig = await hmac(pwd, payload);
  return `${payload}.${sig}`;
}

/** Returns true if the cookie value is a valid session. */
export async function verifySession(cookieValue: string | null | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const pwd = getPassword();
  if (!pwd) return false; // fail closed if no password configured
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  const ageSec = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSec < 0 || ageSec > COOKIE_MAX_AGE_S) return false;
  const expected = await hmac(pwd, payload);
  // constant-time compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export function passwordMatches(input: string): boolean {
  const pwd = getPassword();
  if (!pwd) return false;
  // Pas une vraie comparison constant-time mais l'attaquant a un seul shot
  // par requête HTTP — le rate-limit Railway suffit.
  return input === pwd;
}

export function isPasswordConfigured(): boolean {
  return getPassword() !== null;
}
