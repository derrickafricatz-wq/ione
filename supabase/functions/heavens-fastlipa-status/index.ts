import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 180) => String(v ?? "").trim().slice(0, n);
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "", anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", apiKey = Deno.env.get("FASTLIPA_API_KEY")?.trim() || "";
    if (!url || !anonKey || !serviceKey || !apiKey) return json({ success: false, error: "FastLipa or Supabase server configuration is incomplete." }, 500);
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ success: false, error: "Authentication required." }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ success: false, error: "Invalid or expired login session." }, 401);
    const body = await req.json().catch(() => ({})), bookId = clean(body.book_id, 64), reference = clean(body.reference, 100);
    if (!bookId) return json({ success: false, error: "book_id is required." }, 400);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    let query = admin.from("book_orders").select("id,book_id,customer_id,amount,currency,status,payment_provider,blmpay_reference,blmpay_transaction_id,paid_at").eq("payment_provider", "FastLipa").eq("book_id", bookId).eq("customer_id", auth.user.id);
    if (reference) query = query.eq("blmpay_reference", reference);
    const { data: orders, error: orderError } = await query.order("created_at", { ascending: false }).limit(1);
    if (orderError) { console.error("FastLipa order lookup failed:", orderError.message); return json({ success: false, error: "Could not find your FastLipa book order." }, 500); }
    const order = orders?.[0];
    if (!order) return json({ success: false, error: "No FastLipa payment order was found for this book." }, 404);
    if (["paid", "completed"].includes(String(order.status).toLowerCase())) return json({ success: true, provider: "FastLipa", reference: order.blmpay_reference, tranid: order.blmpay_transaction_id, book_id: bookId, status: "COMPLETED", already_paid: true });
    const tranid = clean(order.blmpay_transaction_id, 120);
    if (!tranid) return json({ success: false, error: "The saved order has no FastLipa transaction ID. Contact support." }, 409);
    const response = await fetch("https://api.fastlipa.com/v1/transaction/status?tranid=" + encodeURIComponent(tranid), { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    const raw = await response.text(); let provider: any = {};
    try { provider = raw ? JSON.parse(raw) : {}; } catch { provider = { raw }; }
    if (!response.ok || provider?.status !== true) { console.error("FastLipa status lookup failed:", response.status, provider?.code || provider?.message || "unknown"); return json({ success: false, error: "FastLipa payment status could not be checked. Please try again.", provider_http_status: response.status }, 502); }
    const payment = provider?.data || {}, paymentStatus = String(payment.payment_status || "").toUpperCase();
    if (String(payment.reference || "").trim() !== String(order.blmpay_reference) || Number(payment.amount) !== Number(order.amount)) return json({ success: false, error: "FastLipa's status details did not match this book order. Access has not been changed." }, 409);
    if (paymentStatus === "COMPLETED") {
      const { error: updateError } = await admin.from("book_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id).eq("payment_provider", "FastLipa");
      if (updateError) { console.error("FastLipa paid order update failed:", updateError.message); return json({ success: false, error: "Payment is confirmed, but the book order could not be updated. Contact support." }, 500); }
      const { error: accessError } = await admin.from("book_access").upsert({ book_id: order.book_id, customer_id: order.customer_id, order_id: order.id }, { onConflict: "book_id,customer_id" });
      if (accessError) { console.error("FastLipa book access grant failed:", accessError.message); return json({ success: false, error: "Payment is confirmed, but book access could not be saved. Contact support." }, 500); }
    } else if (paymentStatus === "CANCELLED") {
      const { error } = await admin.from("book_orders").update({ status: "cancelled" }).eq("id", order.id).eq("payment_provider", "FastLipa").eq("status", "pending");
      if (error) return json({ success: false, error: "Could not save the cancelled payment status." }, 500);
    } else if (paymentStatus !== "PENDING") return json({ success: false, error: "FastLipa returned an unrecognized payment status." }, 502);
    return json({ success: true, provider: "FastLipa", reference: order.blmpay_reference, tranid, book_id: bookId, status: paymentStatus });
  } catch (error) { console.error("heavens-fastlipa-status error:", error instanceof Error ? error.message : "unknown"); return json({ success: false, error: "FastLipa status check could not be completed." }, 500); }
});