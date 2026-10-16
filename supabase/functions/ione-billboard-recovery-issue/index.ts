import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const raw = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return "I1-" + raw;
}
async function encryptRecoveryCode(code: string, serviceKey: string) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ione-recovery-vault-v1:" + serviceKey));
  const key = await crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(code));
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  return { encrypted_code: b64(new Uint8Array(encrypted)), iv: b64(iv) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const auth = String(req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
    if (!url || !key) return json({ success: false, error: "Server configuration missing." }, 500);
    if (!auth) return json({ success: false, error: "Owner session required." }, 401);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(auth[1]);
    const user = authData?.user;
    if (authError || !user?.id) return json({ success: false, error: "Invalid session." }, 401);
    const body = await req.json().catch(() => ({}));
    const billboardId = String(body?.billboard_id || "").trim();
    if (!billboardId) return json({ success: false, error: "Billboard ID required." }, 400);
    const { data: billboard, error: billboardError } = await admin.from("afrilink_billboards")
      .select("id,owner_id,brand_name").eq("id", billboardId).maybeSingle();
    if (billboardError) throw billboardError;
    if (!billboard || String(billboard.owner_id) !== String(user.id)) {
      return json({ success: false, error: "You must be the verified owner of this billboard to create a recovery code." }, 403);
    }
    const token = makeCode();
    const tokenHash = await sha256(token);
    const { error: expireError } = await admin.from("ione_billboard_recovery_codes")
      .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
      .eq("billboard_id", billboard.id).is("claimed_at", null);
    if (expireError) throw expireError;
    const { error: insertError } = await admin.from("ione_billboard_recovery_codes").insert({
      billboard_id: billboard.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insertError) throw insertError;
    try {
      const encrypted = await encryptRecoveryCode(token, key);
      const { error: vaultError } = await admin.from("ione_billboard_recovery_vault").upsert({
        billboard_id: billboard.id, encrypted_code: encrypted.encrypted_code, iv: encrypted.iv,
        code_hash: tokenHash, updated_at: new Date().toISOString(),
      }, { onConflict: "billboard_id" });
      if (vaultError) throw vaultError;
    } catch (vaultError) {
      await admin.from("ione_billboard_recovery_codes").delete().eq("token_hash", tokenHash);
      throw vaultError;
    }
    return json({ success: true, brand_name: billboard.brand_name, recovery_code: token, expires_in_days: 365 });
  } catch (error) {
    console.error("ione-billboard-recovery-issue:", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: "Could not create a recovery code." }, 500);
  }
});