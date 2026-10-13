import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://intoione.space",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const digest = async (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes));
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const password = (Deno.env.get("IONE_AUTHORITY_PASSWORD") || "").trim();
    if (!url || !service || !password) return json({ success: false, error: "Authority security is not configured." }, 500);
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const form = await req.formData();
    const suppliedPassword = String(form.get("password") || "");
    const image = form.get("image");
    if (!(image instanceof File) || image.size < 1 || image.size > 5 * 1024 * 1024 || image.type !== "image/png") {
      return json({ success: false, error: "Choose the authorized PNG image (maximum 5 MB)." }, 400);
    }

    const forwarded = req.headers.get("x-forwarded-for") || "";
    const clientIp = forwarded.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const attemptKey = await digest(clientIp);
    const now = new Date();
    const { data: attempt, error: attemptReadError } = await admin
      .from("ione_authority_auth_attempts").select("failed_attempts,locked_until").eq("attempt_key", attemptKey).maybeSingle();
    if (attemptReadError) return json({ success: false, error: "Could not check security lockout. Try again later." }, 500);
    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > now.getTime()) {
      const minutes = Math.max(1, Math.ceil((new Date(attempt.locked_until).getTime() - now.getTime()) / 60000));
      return json({ success: false, locked: true, error: `Too many failed attempts. Try again in about ${minutes} minute(s).` }, 429);
    }

    const { data: reference, error: referenceError } = await admin.storage.from("authority-press-security").download("space.png");
    if (referenceError || !reference) return json({ success: false, error: "The private security image is not available. Contact I|ONE support." }, 503);

    const [referenceHash, suppliedHash] = await Promise.all([
      digest(await reference.arrayBuffer()),
      digest(await image.arrayBuffer()),
    ]);
    const valid = suppliedPassword === password && referenceHash === suppliedHash;
    if (!valid) {
      const failed = Number(attempt?.failed_attempts || 0) + 1;
      const lockUntil = failed >= 5 ? new Date(now.getTime() + 60 * 60 * 1000).toISOString() : null;
      const { error: saveError } = await admin.from("ione_authority_auth_attempts").upsert({
        attempt_key: attemptKey,
        failed_attempts: failed >= 5 ? 0 : failed,
        locked_until: lockUntil,
        updated_at: now.toISOString(),
      }, { onConflict: "attempt_key" });
      if (saveError) return json({ success: false, error: "Verification failed and security state could not be saved. Try again later." }, 500);
      return json({ success: false, error: failed >= 5 ? "Too many failed attempts. Authority Press is locked for one hour." : "Incorrect password or security image." }, failed >= 5 ? 429 : 401);
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = hex(tokenBytes.buffer);
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const { error: sessionError } = await admin.from("ione_authority_sessions").insert({
      token_hash: await digest(token), expires_at: expiresAt,
    });
    if (sessionError) return json({ success: false, error: "Could not start the secure Authority Press session." }, 500);
    await admin.from("ione_authority_auth_attempts").upsert({
      attempt_key: attemptKey, failed_attempts: 0, locked_until: null, updated_at: now.toISOString(),
    }, { onConflict: "attempt_key" });
    return json({ success: true, token, expires_at: expiresAt });
  } catch (error) {
    console.error("ione-authority-image-auth error", error);
    return json({ success: false, error: "Authority Press verification could not be completed." }, 500);
  }
});
