import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MONTH_TZS = 1000;
const PERIOD_DAYS = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function normalizeTanzaniaPhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return "255" + digits.slice(1);
  if (digits.startsWith("6") || digits.startsWith("7")) return "255" + digits;
  return digits;
}
function validPhone(phone: string) { return /^255[67]\d{8}$/.test(phone); }

async function getVerifiedUser(admin: any, req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
async function validAuthoritySession(admin: any, rawToken: unknown) {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ success: false, error: "Server configuration is missing." }, 500);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request." }, 400); }
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "submit") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Please reload and try again." }, 401);
      const name = String(body?.vendor_name || "").trim().replace(/\s+/g, " ");
      const phone = normalizeTanzaniaPhone(body?.phone_number);
      if (name.length < 2 || name.length > 120 || !validPhone(phone)) {
        return json({ success: false, error: "Please enter your name and a valid Tanzania phone number." }, 400);
      }
      const { data: existingVendor, error: vendorError } = await admin.from("ione_sokoni_vendors")
        .select("id,status,paid_until").eq("user_id", user.id).maybeSingle();
      if (vendorError) return json({ success: false, error: "Could not check your Sokoni access." }, 500);
      const { data: pending, error: pendingError } = await admin.from("ione_sokoni_payment_requests")
        .select("id,status,created_at").eq("user_id", user.id).eq("status", "pending").maybeSingle();
      if (pendingError) return json({ success: false, error: "Could not check your existing request." }, 500);
      if (pending) return json({ success: true, already_pending: true, request: pending,
        message: "Your request is already waiting for Authority Press to confirm payment." });
      const insert = await admin.from("ione_sokoni_payment_requests").insert({
        user_id: user.id, vendor_id: existingVendor?.id || null,
        vendor_name: name, phone_number: phone, amount_tzs: MONTH_TZS,
        period_days: PERIOD_DAYS, status: "pending"
      }).select("id,status,amount_tzs,created_at").single();
      if (insert.error) {
        if (insert.error.code === "23505") return json({ success: false, error: "A request is already pending. Refresh to check its status." }, 409);
        console.error("Sokoni application insert failed:", insert.error);
        return json({ success: false, error: "We could not submit your request. Please try again." }, 500);
      }
      return json({ success: true, request: insert.data,
        message: "Request received. Pay TZS 1,000 using the official I|ONE manual payment instructions. Access opens only after Authority Press confirms receipt." });
    }

    if (action === "my_status") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Please reload and try again." }, 401);
      const [{ data: vendor, error: vendorError }, { data: requests, error: requestError }] = await Promise.all([
        admin.from("ione_sokoni_vendors").select("id,vendor_name,status,paid_until,approved_at").eq("user_id", user.id).maybeSingle(),
        admin.from("ione_sokoni_payment_requests").select("id,status,amount_tzs,created_at,approved_at,admin_note")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
      ]);
      if (vendorError || requestError) return json({ success: false, error: "Could not load your Sokoni status." }, 500);
      const active = !!vendor && vendor.status === "active" && Date.parse(vendor.paid_until) > Date.now();
      return json({ success: true, active, vendor: vendor || null, requests: requests || [] });
    }

    if (action === "public_vendors") {
      const { data, error } = await admin.from("ione_sokoni_vendors")
        .select("id,vendor_name,paid_until").eq("status", "active").gt("paid_until", new Date().toISOString())
        .order("vendor_name", { ascending: true }).limit(200);
      if (error) return json({ success: false, error: "The market is temporarily unavailable." }, 500);
      return json({ success: true, vendors: data || [] });
    }

    if (action === "authority_dashboard" || action === "approve" || action === "reject") {
      const rawSession = body?.authority_session || req.headers.get("x-ione-authority-session");
      if (!(await validAuthoritySession(admin, rawSession))) {
        return json({ success: false, error: "Authority Press session expired. Unlock Authority Press again." }, 401);
      }
      if (action === "authority_dashboard") {
        const [requestsResult, vendorsResult, paidResult] = await Promise.all([
          admin.from("ione_sokoni_payment_requests")
            .select("id,user_id,vendor_id,vendor_name,phone_number,amount_tzs,status,created_at,approved_at,admin_note")
            .order("created_at", { ascending: false }).limit(200),
          admin.from("ione_sokoni_vendors").select("id,status,paid_until").limit(10000),
          admin.from("ione_sokoni_payment_requests").select("amount_tzs").eq("status", "approved").limit(10000)
        ]);
        if (requestsResult.error || vendorsResult.error || paidResult.error) {
          return json({ success: false, error: "Could not load Sokoni dashboard data." }, 500);
        }
        const vendors = vendorsResult.data || [];
        const payments = paidResult.data || [];
        const now = Date.now();
        return json({
          success: true,
          requests: requestsResult.data || [],
          metrics: {
            pending: (requestsResult.data || []).filter((r: any) => r.status === "pending").length,
            activeVendors: vendors.filter((v: any) => v.status === "active" && Date.parse(v.paid_until) > now).length,
            expiredVendors: vendors.filter((v: any) => Date.parse(v.paid_until) <= now).length,
            confirmedPayments: payments.length,
            totalRevenueTzs: payments.reduce((sum: number, p: any) => sum + Number(p.amount_tzs || 0), 0)
          }
        });
      }

      const requestId = String(body?.request_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ success: false, error: "Invalid request." }, 400);
      const { data: request, error: requestError } = await admin.from("ione_sokoni_payment_requests")
        .select("*").eq("id", requestId).maybeSingle();
      if (requestError || !request) return json({ success: false, error: "Request not found." }, 404);
      if (request.status !== "pending") return json({ success: false, error: "This request has already been reviewed. Refresh the dashboard." }, 409);
      const now = new Date();
      const claim = await admin.from("ione_sokoni_payment_requests").update({ status: "processing", updated_at: now.toISOString() })
        .eq("id", request.id).eq("status", "pending").select("id").maybeSingle();
      if (claim.error || !claim.data) return json({ success: false, error: "Another review is in progress. Refresh the dashboard." }, 409);
      if (action === "reject") {
        const rejected = await admin.from("ione_sokoni_payment_requests").update({
          status: "rejected", approved_by: "Authority Press", admin_note: String(body?.note || "").trim().slice(0, 500),
          updated_at: now.toISOString()
        }).eq("id", request.id).eq("status", "processing");
        if (rejected.error) {
          await admin.from("ione_sokoni_payment_requests").update({ status: "pending" }).eq("id", request.id).eq("status", "processing");
          return json({ success: false, error: "Could not save the decision. Please retry." }, 500);
        }
        return json({ success: true, message: "Request marked as not approved." });
      }

      const current = await admin.from("ione_sokoni_vendors").select("id,paid_until,status")
        .eq("user_id", request.user_id).maybeSingle();
      if (current.error) {
        await admin.from("ione_sokoni_payment_requests").update({ status: "pending" }).eq("id", request.id).eq("status", "processing");
        return json({ success: false, error: "Could not verify vendor record." }, 500);
      }
      const nowMs = now.getTime();
      const priorEnd = current.data?.paid_until ? Date.parse(current.data.paid_until) : 0;
      const startMs = Math.max(nowMs, Number.isFinite(priorEnd) ? priorEnd : 0);
      const paidUntil = new Date(startMs + PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const vendorWrite = await admin.from("ione_sokoni_vendors").upsert({
        user_id: request.user_id, vendor_name: request.vendor_name, phone_number: request.phone_number,
        status: "active", paid_until: paidUntil, approved_at: now.toISOString(), approved_by: "Authority Press",
        updated_at: now.toISOString()
      }, { onConflict: "user_id" }).select("id").single();
      if (vendorWrite.error) {
        await admin.from("ione_sokoni_payment_requests").update({ status: "pending" }).eq("id", request.id).eq("status", "processing");
        console.error("Sokoni vendor activation failed:", vendorWrite.error);
        return json({ success: false, error: "Payment decision could not activate vendor access. No approval was recorded; retry safely." }, 500);
      }
      const paymentWrite = await admin.from("ione_sokoni_payment_requests").update({
        vendor_id: vendorWrite.data.id, status: "approved", payment_confirmed_at: now.toISOString(),
        approved_at: now.toISOString(), approved_by: "Authority Press",
        admin_note: String(body?.note || "").trim().slice(0, 500), updated_at: now.toISOString()
      }).eq("id", request.id).eq("status", "processing");
      if (paymentWrite.error) {
        console.error("Sokoni payment approval record failed:", paymentWrite.error);
        return json({ success: false, error: "Vendor record was updated but payment history needs Authority Press review. Do not approve again; refresh the dashboard." }, 500);
      }
      return json({ success: true, vendor_id: vendorWrite.data.id, paid_until: paidUntil,
        message: "Payment confirmed and Sokoni access activated for 30 days." });
    }
    return json({ success: false, error: "Unknown Sokoni action." }, 400);
  } catch (error) {
    console.error("ione-sokoni failure:", error);
    return json({ success: false, error: "Sokoni is temporarily unavailable. Please try again." }, 500);
  }
});
