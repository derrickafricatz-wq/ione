import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 160) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, n);
const validUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function hash(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
async function validAuthority(admin: any, raw: unknown) {
  const token = clean(raw, 256);
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const tokenHash = await hash(token);
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}
function receiptNumber() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "I1B-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + hex(bytes).slice(0,10).toUpperCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !service) return json({ success: false, error: "Manual book payments are not configured." }, 500);
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request body." }, 400); }
  const action = clean(body.action, 40).toLowerCase();
  try {
    if (action.startsWith("authority_")) {
      if (!await validAuthority(admin, body.authority_session || req.headers.get("x-ione-authority-session")))
        return json({ success: false, error: "Authority Press session expired. Verify Authority Press again." }, 401);
      if (action === "authority_list") {
        const { data, error } = await admin.from("book_orders")
          .select("id,book_id,customer_id,customer_email,amount,currency,status,payment_provider,manual_payer_name,manual_payer_phone,manual_review_status,manual_reviewed_at,manual_reviewed_by,manual_rejection_reason,manual_receipt_number,created_at,paid_at,heavens_books(title,author_name)")
          .eq("payment_provider", "Manual").order("created_at", { ascending: false }).limit(300);
        if (error) return json({ success: false, error: "Could not load manual book payment requests." }, 500);
        return json({ success: true, requests: data || [] });
      }
      if (action === "authority_receipts") {
        const { data, error } = await admin.from("ione_book_receipts").select("*").order("paid_at", { ascending: false }).limit(500);
        if (error) return json({ success: false, error: "Could not load the permanent receipt ledger." }, 500);
        return json({ success: true, receipts: data || [] });
      }
      const orderId = clean(body.order_id, 64);
      if (!validUuid(orderId)) return json({ success: false, error: "A valid payment request is required." }, 400);
      if (action === "authority_reject") {
        const { data, error } = await admin.rpc("ione_reject_manual_book_order", {
          p_order_id: orderId, p_authority_name: clean(body.authority_name || "Authority Press", 120),
          p_reason: clean(body.reason || "Payment could not be verified.", 500),
        });
        if (error) return json({ success: false, error: error.message || "Could not reject this request." }, 409);
        return json({ success: true, result: data });
      }
      if (action === "authority_approve") {
        const { data: order, error: findError } = await admin.from("book_orders")
          .select("id,book_id,customer_id,customer_email,amount,status,payment_provider,manual_review_status,manual_recovery_hash")
          .eq("id", orderId).eq("payment_provider", "Manual").maybeSingle();
        if (findError || !order) return json({ success: false, error: "Manual payment request not found." }, 404);
        if (!order.manual_recovery_hash || !/^[0-9a-f]{64}$/i.test(order.manual_recovery_hash))
          return json({ success: false, error: "This request has no valid recovery code. Ask the buyer to submit again." }, 409);
        const receipt = receiptNumber();
        const { data, error } = await admin.rpc("ione_approve_manual_book_order", {
          p_order_id: orderId, p_authority_name: clean(body.authority_name || "Authority Press", 120),
          p_receipt_number: receipt, p_recovery_hash: order.manual_recovery_hash,
        });
        if (error) return json({ success: false, error: error.message || "Could not approve this payment." }, 409);
        return json({ success: true, result: data });
      }
      return json({ success: false, error: "Unknown Authority Press action." }, 400);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ success: false, error: "Open your app session first." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ success: false, error: "Your app session has expired. Refresh and try again." }, 401);
    const userId = auth.user.id;

    if (action === "submit") {
      const bookId = clean(body.book_id, 64);
      const payerName = clean(body.payer_name, 120);
      const payerPhone = clean(body.payer_phone, 32).replace(/[^0-9+]/g, "");
      if (!validUuid(bookId)) return json({ success: false, error: "Choose a valid book." }, 400);
      if (payerName.length < 3) return json({ success: false, error: "Enter the name used to make the mobile-money payment." }, 400);
      if (payerPhone.replace(/\D/g, "").length < 9) return json({ success: false, error: "Enter the phone number used to make the payment." }, 400);
      const { data: book, error: bookError } = await admin.from("heavens_books")
        .select("id,title,price,currency,active,payment_required").eq("id", bookId).maybeSingle();
      if (bookError || !book || !book.active) return json({ success: false, error: "This book is not currently available." }, 404);
      const amount = Math.round(Number(book.price || 0));
      if (book.payment_required === false || !Number.isSafeInteger(amount) || amount <= 0)
        return json({ success: false, error: "This book does not require a paid order." }, 400);
      const { data: existing, error: existingError } = await admin.from("book_orders")
        .select("id,status,manual_review_status").eq("customer_id", userId).eq("book_id", bookId)
        .eq("payment_provider", "Manual").in("status", ["pending", "paid", "completed"]).order("created_at", { ascending: false }).limit(1);
      if (existingError) return json({ success: false, error: "Could not check your existing purchase request." }, 500);
      if (existing?.length) return json({ success: false, error: existing[0].status === "pending" ? "You already have a manual payment request awaiting review." : "You already have access to this book." }, 409);
      const recoveryCode = makeCode();
      const recoveryHash = await hash(recoveryCode);
      const { data: order, error: insertError } = await admin.from("book_orders").insert({
        book_id: bookId, customer_id: userId, customer_email: auth.user.email || null,
        amount, currency: book.currency || "TZS", status: "pending", payment_provider: "Manual",
        manual_payer_name: payerName, manual_payer_phone: payerPhone, manual_review_status: "pending",
        manual_recovery_hash: recoveryHash,
      }).select("id,book_id,amount,status,manual_review_status,created_at").single();
      if (insertError || !order) return json({ success: false, error: "Could not submit your manual payment request." }, 500);
      return json({
        success: true, order, recovery_code: recoveryCode,
        merchant: { name: "DERRICK KIPAJI OF AFRIKA & CO", number: "140001788", network: "Airtel Money" },
        message: "Request submitted. Authority Press must verify the actual transaction before book access opens.",
      });
    }

    if (action === "my_status") {
      const { data, error } = await admin.from("book_orders")
        .select("id,book_id,amount,currency,status,manual_review_status,manual_rejection_reason,manual_receipt_number,created_at,paid_at,heavens_books(title)")
        .eq("customer_id", userId).eq("payment_provider", "Manual").order("created_at", { ascending: false }).limit(100);
      if (error) return json({ success: false, error: "Could not load your manual payment status." }, 500);
      const orderIds = (data || []).filter((o: any) => ["paid","completed"].includes(o.status)).map((o: any) => o.id);
      let receipts: any[] = [];
      if (orderIds.length) {
        const result = await admin.from("ione_book_receipts").select("order_id,receipt_number,amount_tzs,payment_method,paid_at").in("order_id", orderIds);
        if (!result.error) receipts = result.data || [];
      }
      return json({ success: true, orders: data || [], receipts });
    }

    if (action === "recover") {
      const bookId = clean(body.book_id, 64);
      const code = clean(body.recovery_code, 64).replace(/\s+/g, "").toUpperCase();
      if (!validUuid(bookId) || !/^[A-HJ-NP-Z2-9]{16}$/.test(code)) return json({ success: false, error: "Enter the 16-character recovery code for this book." }, 400);
      const codeHash = await hash(code);
      const { data: recovery, error: recoveryError } = await admin.from("ione_book_recovery_codes")
        .select("id,order_id,book_id,customer_id,use_count").eq("book_id", bookId).eq("code_hash", codeHash).is("revoked_at", null).maybeSingle();
      if (recoveryError || !recovery) return json({ success: false, error: "Recovery code not recognised for this book." }, 404);
      const { data: order, error: orderError } = await admin.from("book_orders").select("id,status,book_id,amount")
        .eq("id", recovery.order_id).in("status", ["paid","completed"]).maybeSingle();
      if (orderError || !order || order.book_id !== bookId) return json({ success: false, error: "This purchase is not confirmed, so access cannot be restored." }, 409);
      const { data: existingAccess, error: existingAccessError } = await admin.from("book_access")
        .select("id").eq("book_id", bookId).eq("customer_id", userId).limit(1);
      if (existingAccessError) return json({ success: false, error: "Could not check existing book access." }, 500);
      if (!existingAccess?.length) {
        const { error: accessError } = await admin.from("book_access").insert({
          book_id: bookId, customer_id: userId, order_id: order.id,
        });
        if (accessError) return json({ success: false, error: "Could not restore access. Contact I|ONE Care." }, 500);
      }
      await admin.from("ione_book_recovery_codes").update({ last_used_at: new Date().toISOString(), use_count: Number(recovery.use_count || 0) + 1 }).eq("id", recovery.id);
      return json({ success: true, message: "Purchase verified. Book access restored.", book_id: bookId });
    }

    return json({ success: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error("ione-manual-book-payments error:", error);
    return json({ success: false, error: "Manual book payment request could not be processed." }, 500);
  }
});
