/**
 * Signiertes Token für calendar-ics (UX-3 B).
 * Payload: registrationId + Ablauf (Unix-Sekunden), HMAC-SHA256, Base64URL.
 * Keine Personendaten im Token.
 */

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const bin = atob(padded + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signBytes(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  // Deno/TS: Uint8Array als BufferSource (wie fake/adapter).
  const sig = await crypto.subtle.sign("HMAC", key, data as BufferSource);
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export type CalendarTokenPayload = {
  rid: string;
  exp: number;
};

export const CALENDAR_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

/** Token = base64url(JSON).base64url(HMAC) */
export async function signCalendarToken(
  secret: string,
  registrationId: string,
  nowSec = Math.floor(Date.now() / 1000),
  ttlSec = CALENDAR_TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload: CalendarTokenPayload = {
    rid: registrationId.trim(),
    exp: nowSec + ttlSec,
  };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = bytesToBase64Url(await signBytes(secret, encoder.encode(body)));
  return `${body}.${sig}`;
}

export async function verifyCalendarToken(
  secret: string,
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<CalendarTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigB64] = parts;
  if (!body || !sigB64) return null;
  const expected = await signBytes(secret, encoder.encode(body));
  const given = base64UrlToBytes(sigB64);
  if (!given || !timingSafeEqual(expected, given)) return null;
  const raw = base64UrlToBytes(body);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as CalendarTokenPayload;
    if (typeof parsed.rid !== "string" || !parsed.rid.trim()) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    if (parsed.exp < nowSec) return null;
    return { rid: parsed.rid.trim(), exp: parsed.exp };
  } catch {
    return null;
  }
}

export function buildCalendarIcsUrl(supabaseUrl: string, token: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/calendar-ics?t=${encodeURIComponent(token)}`;
}
