import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const normalizePhone = (value: unknown) => {
  const digits = String(value || "").replace(/\\D/g, "");
  if (digits.startsWith("255") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "255" + digits.slice(1);
  if ((digits.startsWith("6") || digits.startsWith("7")) && digits.length === 9) return "255" + digits;
  return "";
};
async function validAuthoritySession(admin: any, rawToken: unknown): Promise<boolean> {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorityPassword = Deno.env.get("IONE_AUTHORITY_PASSWORD")?.trim();
    if (!url || !anon || !service) return json({ success: false, error: "Author access is not configured on the server." }, 500);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "my_status");
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

    if (action.startsWith("authority_")) {
      if (!(await validAuthoritySession(admin, body?.authority_session || req.headers.get("x-ione-authority-session")))) return json({ success: false, error: "Authority Press session expired. Unlock again." }, 401);
      if (action === "authority_list") {
        const { data, error } = await admin.from("ione_author_access").select("user_id,real_name,phone,terms_accepted,fee_tzs,merchant_name,merchant_number,merchant_network,status,package_number,books_used,renewal_requested,payment_confirmed_at,payment_confirmed_by,authority_notes,submitted_at,updated_at").order("submitted_at", { ascending: false }).limit(200);
        if (error) return json({ success: false, error: "Could not load Author Studio applications." }, 500);
        return json({ success: true, requests: data || [] });
      }
      if (action === "authority_set_status") {
        const userId = String(body?.user_id || "");
        const next = String(body?.status || "");
        if (!/^[0-9a-f-]{36}$/i.test(userId) || !["active", "locked", "rejected"].includes(next)) return json({ success: false, error: "Invalid author or status." }, 400);
        const { data: current, error: findError } = await admin.from("ione_author_access").select("*").eq("user_id", userId).maybeSingle();
        if (findError || !current) return json({ success: false, error: "Author application not found." }, 404);
        if (next === "active" && body?.payment_confirmed !== true) return json({ success: false, error: "Confirm the TSh 10,000 payment before activating access." }, 400);
        const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString(), authority_notes: String(body?.authority_notes || "").trim().slice(0, 1000) || null };
        if (next === "active") {
          patch.payment_confirmed_at = new Date().toISOString();
          patch.payment_confirmed_by = "Authority Press";
          if (current.renewal_requested) {
            patch.package_number = Number(current.package_number || 0) + 1;
            patch.books_used = 0;
          } else if (!Number(current.package_number || 0)) {
            patch.package_number = 1;
            patch.books_used = 0;
          }
          patch.renewal_requested = false;
        }
        const { data, error } = await admin.from("ione_author_access").update(patch).eq("user_id", userId).select("user_id,status,package_number,books_used,renewal_requested,payment_confirmed_at").single();
        if (error) return json({ success: false, error: "Could not update Author Studio access." }, 500);
        return json({ success: true, request: data });
      }
      return json({ success: false, error: "Unknown Authority Press action." }, 400);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ success: false, error: "Open the app session first." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ success: false, error: "Your app session has expired. Refresh and try again." }, 401);
    const userId = auth.user.id;

    if (action === "my_status") {
      const { data, error } = await admin.from("ione_author_access").select("user_id,real_name,phone,terms_accepted,fee_tzs,merchant_name,merchant_number,merchant_network,status,package_number,books_used,renewal_requested,payment_confirmed_at,authority_notes,submitted_at,updated_at").eq("user_id", userId).maybeSingle();
      if (error) return json({ success: false, error: "Could not restore your Author Studio application." }, 500);
      return json({ success: true, request: data || null });
    }
    if (action === "submit") {
      const realName = String(body?.real_name || "").trim().replace(/\\s+/g, " ");
      const phone = normalizePhone(body?.phone);
      if (realName.length < 3 || realName.length > 120) return json({ success: false, error: "Enter your full real name." }, 400);
      if (!phone) return json({ success: false, error: "Enter a valid Tanzanian mobile number." }, 400);
      if (body?.terms_accepted !== true) return json({ success: false, error: "Please accept the Author Studio terms before submitting." }, 400);
      const { data: existing, error: existingError } = await admin.from("ione_author_access").select("status,package_number,books_used").eq("user_id", userId).maybeSingle();
      if (existingError) return json({ success: false, error: "Could not check your saved application." }, 500);
      if (existing && existing.status === "active") return json({ success: false, error: "Your Author Studio access is already active." }, 409);
      if (existing && existing.status === "locked") return json({ success: false, error: "Your three-book package is complete. Use RENEW PACKAGE to keep your saved details." }, 409);
      const { data, error } = await admin.from("ione_author_access").upsert({
        user_id: userId, real_name: realName, phone, terms_accepted: true, fee_tzs: 10000,
        merchant_name: "DERRICK KIPAJI OF AFRIKA & CO", merchant_number: "140001788", merchant_network: "Airtel Money",
        status: "pending_payment", renewal_requested: false, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, { onConflict: "user_id" }).select("user_id,real_name,phone,fee_tzs,merchant_name,merchant_number,merchant_network,status,package_number,books_used,renewal_requested,submitted_at").single();
      if (error) return json({ success: false, error: "Could not save your application. Please try again." }, 500);
      return json({ success: true, request: data, message: "Application saved. Make the TSh 10,000 payment, then wait for Authority Press to confirm it." });
    }
    if (action === "renew") {
      const { data: existing, error: findError } = await admin.from("ione_author_access").select("status,real_name,phone").eq("user_id", userId).maybeSingle();
      if (findError || !existing) return json({ success: false, error: "Submit your Author Studio form first." }, 404);
      if (existing.status !== "locked") return json({ success: false, error: "Renewal is available after all three books in your package have been published." }, 409);
      const { data, error } = await admin.from("ione_author_access").update({ status: "pending_payment", renewal_requested: true, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId).select("user_id,real_name,phone,fee_tzs,merchant_name,merchant_number,merchant_network,status,package_number,books_used,renewal_requested,submitted_at").single();
      if (error) return json({ success: false, error: "Could not save your renewal request." }, 500);
      return json({ success: true, request: data, message: "Renewal request saved with your existing details. Pay TSh 10,000 and wait for Authority Press confirmation." });
    }
    return json({ success: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error("ione-author-access error:", error);
    return json({ success: false, error: "Author Studio access could not be processed." }, 500);
  }
});
