import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function bytesToHex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
async function hmacSha256(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))));
}
function safeEqual(a: string, b: string): boolean { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const secret = Deno.env.get("FASTLIPA_WEBHOOK_SECRET")?.trim() || "", apiKey = Deno.env.get("FASTLIPA_API_KEY")?.trim() || "", url = Deno.env.get("SUPABASE_URL") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!secret || !apiKey || !url || !serviceKey) { console.error("FastLipa webhook configuration incomplete.", { secretConfigured: !!secret, apiKeyConfigured: !!apiKey }); return json({ success: false, error: "Webhook is not configured." }, 500); }
    const rawBody = await req.text(), signature = req.headers.get("X-FastLipa-Signature") || "", match = /^sha256=([a-f0-9]{64})$/i.exec(signature.trim());
    if (!match) return json({ success: false, error: "Missing or malformed FastLipa signature." }, 401);
    const expected = await hmacSha256(secret, rawBody);
    if (!safeEqual(match[1].toLowerCase(), expected)) return json({ success: false, error: "Invalid FastLipa signature." }, 401);
    let payload: any; try { payload = JSON.parse(rawBody); } catch { return json({ success: false, error: "Invalid JSON payload." }, 400); }
    const event = String(payload?.event || ""), data = payload?.data || {}, tranid = String(data.tranid || "").trim(), reference = String(data.reference || "").trim(), webhookStatus = String(data.payment_status || "").toUpperCase(), webhookAmount = Number(data.amount);
    if (!["payment.completed", "payment.cancelled"].includes(event) || !tranid || !reference || !Number.isFinite(webhookAmount)) return json({ success: false, error: "Unsupported or incomplete FastLipa payment event." }, 400);
    if ((event === "payment.completed" && webhookStatus !== "COMPLETED") || (event === "payment.cancelled" && webhookStatus !== "CANCELLED")) return json({ success: false, error: "Webhook event and payment status disagree." }, 400);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: order, error: orderError } = await admin.from("book_orders").select("id,book_id,customer_id,amount,status,payment_provider,blmpay_reference,blmpay_transaction_id").eq("payment_provider", "FastLipa").eq("blmpay_reference", reference).maybeSingle();
    if (orderError) { console.error("FastLipa webhook order lookup failed:", orderError.message); return json({ success: false, error: "Could not verify the matching book order." }, 500); }
    if (!order) return json({ success: false, error: "No matching FastLipa book order." }, 404);
    if (Number(order.amount) !== webhookAmount) return json({ success: false, error: "Webhook amount does not match the book order." }, 409);
    if (order.blmpay_transaction_id && String(order.blmpay_transaction_id) !== tranid) return json({ success: false, error: "Webhook transaction ID does not match the saved order." }, 409);
    const response = await fetch("https://api.fastlipa.com/v1/transaction/status?tranid=" + encodeURIComponent(tranid), { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    const raw = await response.text(); let provider: any = {};
    try { provider = raw ? JSON.parse(raw) : {}; } catch { provider = { raw }; }
    if (!response.ok || provider?.status !== true) { console.error("FastLipa webhook reconciliation failed:", response.status, provider?.code || provider?.message || "unknown"); return json({ success: false, error: "Could not reconcile the FastLipa transaction." }, 502); }
    const confirmed = provider?.data || {}, confirmedStatus = String(confirmed.payment_status || "").toUpperCase();
    if (String(confirmed.tranid || "") !== tranid || String(confirmed.reference || "") !== reference || Number(confirmed.amount) !== Number(order.amount) || confirmedStatus !== webhookStatus) return json({ success: false, error: "FastLipa status does not match the signed webhook and saved order." }, 409);
    if (confirmedStatus === "COMPLETED") {
      const { error: updateError } = await admin.from("book_orders").update({ status: "paid", blmpay_transaction_id: tranid, paid_at: new Date().toISOString() }).eq("id", order.id).eq("payment_provider", "FastLipa");
      if (updateError) { console.error("FastLipa webhook paid order update failed:", updateError.message); return json({ success: false, error: "Could not save confirmed payment." }, 500); }
      const { error: accessError } = await admin.from("book_access").upsert({ book_id: order.book_id, customer_id: order.customer_id, order_id: order.id }, { onConflict: "book_id,customer_id" });
      if (accessError) { console.error("FastLipa webhook book access grant failed:", accessError.message); return json({ success: false, error: "Payment confirmed but book access could not be saved." }, 500); }
    } else {
      const { error } = await admin.from("book_orders").update({ status: "cancelled" }).eq("id", order.id).eq("payment_provider", "FastLipa").eq("status", "pending");
      if (error) return json({ success: false, error: "Could not save cancelled payment." }, 500);
    }
    return json({ success: true, received: true, verified: true, event, reference, tranid, payment_status: confirmedStatus });
  } catch (error) { console.error("heavens-fastlipa-webhook error:", error instanceof Error ? error.message : "unknown"); return json({ success: false, error: "Webhook processing failed." }, 500); }
});