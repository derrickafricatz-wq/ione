/**
 * BLMPay API V2 request signer for Supabase Edge Functions.
 *
 * Preparation-only helper: not imported by production functions yet.
 * Keep both credentials in Supabase Edge Function secrets:
 *   BLMPAY_V2_API_KEY
 *   BLMPAY_V2_HMAC_SECRET
 *
 * Sign the exact body string passed to this helper and send that same string
 * as fetch's body. Never log the returned headers or credential values.
 */

const API_BASE = "https://pay.blmtec.co.tz";
const DEFAULT_ORIGIN = "https://intoione.space";
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toHex(new Uint8Array(signature));
}

function validateIdempotencyKey(key: string): void {
  if (key.length < 8 || key.length > 30 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new Error("Invalid BLMPay Idempotency-Key format.");
  }
}

/**
 * Creates authenticated headers for one BLMPay V2 request.
 *
 * `body` must be the exact serialized string that will be passed to fetch.
 * Use an empty string for body-less requests. `target` must be the exact
 * path-and-query sent on the wire, starting with "/".
 */
export async function createBlmpayV2Headers(args: {
  method: string;
  target: string;
  body: string;
  idempotencyKey?: string;
  origin?: string;
}): Promise<Headers> {
  const apiKey = Deno.env.get("BLMPAY_V2_API_KEY")?.trim();
  const secret = Deno.env.get("BLMPAY_V2_HMAC_SECRET")?.trim();
  if (!apiKey || !secret) {
    throw new Error("BLMPay V2 server credentials are not configured.");
  }

  const method = args.method.trim().toUpperCase();
  const target = args.target.trim();
  if (!/^[A-Z]+$/.test(method) || !target.startsWith("/") || target.includes("#")) {
    throw new Error("Invalid BLMPay V2 method or request target.");
  }

  if (args.idempotencyKey !== undefined) {
    validateIdempotencyKey(args.idempotencyKey);
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = toHex(nonceBytes);
  const bodyHash = await sha256Hex(args.body);
  const canonical = `${method}\n${target}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = await hmacSha256Hex(secret, canonical);

  const origin = (args.origin || Deno.env.get("BLMPAY_V2_ORIGIN") || DEFAULT_ORIGIN).trim();
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("BLMPay origin must be a valid HTTPS origin.");
  }
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== origin || parsedOrigin.pathname !== "/" || parsedOrigin.search || parsedOrigin.hash) {
    throw new Error("BLMPay origin must be an HTTPS origin without a path or query.");
  }

  const headers = new Headers({
    Authorization: `BLMPay-HMAC ${apiKey}`,
    "X-BLMPay-Timestamp": timestamp,
    "X-BLMPay-Nonce": nonce,
    "X-BLMPay-Signature": signature,
    "X-BLMPay-Origin": origin,
    Accept: "application/json",
  });
  if (args.body !== "") headers.set("Content-Type", "application/json");
  if (args.idempotencyKey) headers.set("Idempotency-Key", args.idempotencyKey);
  return headers;
}

/** URL helper to prevent accidental use of a non-V2 host. */
export function blmpayV2Url(target: string): string {
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("#")) {
    throw new Error("BLMPay V2 target must be an absolute path on the BLMPay API host.");
  }
  return API_BASE + target;
}
