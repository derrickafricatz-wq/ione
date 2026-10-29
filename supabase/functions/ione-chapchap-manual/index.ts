import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const cleanPhone = (v: unknown) => {
  const p = String(v || "").replace(/\D/g, "");
  if (p.startsWith("255")) return p;
  if (p.startsWith("0")) return "255" + p.slice(1);
  if (p.startsWith("6") || p.startsWith("7")) return "255" + p;
  return p;
};
const money = (n: number) => Math.max(0, Math.round(n));
async function validAuthoritySession(admin: any, raw: unknown) {
  const token = String(raw || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}
async function sellerEmailReceipt(receipt: any) {
  const key = String(Deno.env.get("IONE_RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY") || "").trim();
  const to = String(receipt?.seller_email || "").trim();
  if (!key || !to || !receipt) return;
  const safe = (v: unknown) => String(v ?? "—").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" } as any)[c]);
  const html = "<div style='font-family:Arial,sans-serif'><h2>I|ONE CHAPCHAP • OFFICIAL MANUAL-PAYMENT RECEIPT</h2><p><b>Receipt:</b> "+safe(receipt.receipt_number)+"</p><p><b>Product:</b> "+safe(receipt.product_title)+"</p><p><b>Buyer:</b> "+safe(receipt.buyer_full_name)+"</p><p><b>Buyer phone:</b> "+safe(receipt.buyer_contact)+"</p><p><b>Sale amount:</b> TZS "+Number(receipt.amount_tzs||0).toLocaleString("en-US")+"</p><p><b>I|ONE manual transaction fee (4%):</b> TZS "+Number(receipt.chapchap_fee_tzs||0).toLocaleString("en-US")+"</p><p><b>Seller share before any later payout costs:</b> TZS "+Number(receipt.seller_available_tzs||0).toLocaleString("en-US")+"</p><p><b>Payment method:</b> Manual • verified by Authority Press</p><p><b>Confirmed:</b> "+safe(receipt.paid_at ? new Date(receipt.paid_at).toLocaleString() : "—")+"</p></div>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "Idempotency-Key": "chapchap-manual-seller-receipt-" + receipt.order_id },
    body: JSON.stringify({ from: "I|ONE ChapChap <hello@intoione.space>", to: [to], subject: "I|ONE ChapChap • Manual Sale Receipt", html,
      text: "I|ONE CHAPCHAP — OFFICIAL MANUAL-PAYMENT RECEIPT\nReceipt: "+receipt.receipt_number+"\nProduct: "+receipt.product_title+"\nBuyer: "+receipt.buyer_full_name+"\nBuyer phone: "+receipt.buyer_contact+"\nAmount: TZS "+Number(receipt.amount_tzs||0).toLocaleString("en-US")+"\nI|ONE fee (4%): TZS "+Number(receipt.chapchap_fee_tzs||0).toLocaleString("en-US")+"\nSeller share: TZS "+Number(receipt.seller_available_tzs||0).toLocaleString("en-US")+"\nPayment method: Manual • Authority Press verified" })
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST only" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "submit") {
      const auth = req.headers.get("Authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ success: false, error: "Sign in to submit a manual purchase." }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(token);
      if (authError || !authData.user) return json({ success: false, error: "Your I|ONE session has expired." }, 401);
      const productId = String(body?.product_id || "").trim();
      const buyerName = String(body?.buyer_full_name || "").trim();
      const buyerPhone = cleanPhone(body?.buyer_phone || body?.buyer_contact);
      const buyerAddress = String(body?.buyer_address || "").trim();
      const buyerEmail = String(body?.buyer_email || "").trim().toLowerCase();
      if (!productId || buyerName.length < 2 || !/^255[67]\d{8}$/.test(buyerPhone) || !buyerAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
        return json({ success: false, error: "Enter your full name, valid +255 phone number, address, and email." }, 400);
      }
      const { data: product, error: productError } = await admin.from("ione_single_products")
        .select("id,seller_id,seller_name,seller_phone,title,price_tzs,price_amount,price_currency,discount_active,discount_type,discount_value,status,category,description,location,attributes,image_urls")
        .eq("id", productId).maybeSingle();
      if (productError || !product || product.status !== "active") return json({ success: false, error: "This product is no longer available." }, 409);
      let base = String(product.price_currency || "TZS") === "USD" ? Number(product.price_amount) : Number(product.price_tzs);
      if (!Number.isFinite(base) || base <= 0) return json({ success: false, error: "Invalid product price." }, 400);
      let final = base;
      if (product.discount_active === true) {
        const value = Number(product.discount_value || 0), type = String(product.discount_type || "percentage");
        if (!Number.isFinite(value) || value < 0 || (type === "percentage" && value > 100) || !["percentage","fixed"].includes(type)) return json({ success: false, error: "This product discount is not configured correctly." }, 409);
        const discount = type === "percentage" ? base * value / 100 : value;
        if (discount >= base) return json({ success: false, error: "This product discount is not valid." }, 409);
        final = base - discount;
      }
      let amount: number;
      if (String(product.price_currency || "TZS") === "USD") {
        const fx = await fetch("https://open.er-api.com/v6/latest/USD");
        const fxData = await fx.json();
        const rate = Number(fxData?.rates?.TZS);
        if (!fx.ok || !Number.isFinite(rate) || rate <= 0) return json({ success: false, error: "USD price conversion is temporarily unavailable." }, 503);
        amount = money(final * rate);
      } else amount = money(final);
      if (amount <= 0) return json({ success: false, error: "Invalid purchase amount." }, 400);

      const { data: reserved, error: reserveError } = await admin.from("ione_single_products")
        .update({ status: "pending_payment", updated_at: new Date().toISOString() }).eq("id", productId).eq("status", "active").select("id").maybeSingle();
      if (reserveError || !reserved) return json({ success: false, error: "This product was just reserved by another buyer." }, 409);
      const fee = Math.floor(amount * 0.04), sellerShare = amount - fee, now = new Date().toISOString();
      const { data: order, error: orderError } = await admin.from("ione_chapchap_orders").insert({
        product_id: productId, buyer_id: authData.user.id, seller_id: product.seller_id, buyer_phone: buyerPhone,
        amount_tzs: amount, commission_percent: 4, commission_tzs: fee, blmpay_payment_percent: 0,
        blmpay_payment_fee_tzs: 0, seller_net_tzs: sellerShare, seller_available_tzs: sellerShare,
        status: "pending", payment_provider: "Manual", buyer_full_name: buyerName, buyer_address: buyerAddress,
        buyer_email: buyerEmail, buyer_contact: buyerPhone, updated_at: now
      }).select("id,amount_tzs,status,created_at").single();
      if (orderError || !order) {
        await admin.from("ione_single_products").update({ status: "active", updated_at: now }).eq("id", productId).eq("status", "pending_payment");
        return json({ success: false, error: "Could not create the manual purchase request." }, 500);
      }
      return json({ success: true, order, merchant: { name: "DERRICK KIPAJI OF AFRIKA & CO", network: "Airtel Money", number: "140001788" },
        amount_tzs: amount, platform_fee_tzs: fee, seller_share_tzs: sellerShare,
        message: "Manual purchase submitted. Pay the displayed amount, then wait for Authority Press to verify it. The item is not sold until confirmed." });
    }

    if (action === "lookup_receipts") {
      const name = String(body?.buyer_full_name || "").trim();
      const phone = cleanPhone(body?.buyer_phone);
      if (name.length < 2 || !/^255[67]\d{8}$/.test(phone)) return json({ success: false, error: "Enter the same full name and phone number used for manual payment." }, 400);
      const { data: receipts, error } = await admin.from("ione_chapchap_receipts").select("*")
        .eq("payment_provider", "Manual").ilike("buyer_full_name", name).eq("buyer_contact", phone)
        .order("paid_at", { ascending: false }).limit(20);
      if (error) return json({ success: false, error: "Could not load your manual receipts." }, 500);
      return json({ success: true, receipts: receipts || [] });
    }

    if (action === "list_pending") {
      if (!(await validAuthoritySession(admin, body?.authority_session || req.headers.get("x-ione-authority-session"))) && String(body?.password || "") !== String(Deno.env.get("IONE_AUTHORITY_PASSWORD") || "")) return json({ success: false, error: "Authority Press session expired. Unlock again." }, 401);
      const { data, error } = await admin.from("ione_chapchap_orders")
        .select("id,product_id,seller_id,buyer_full_name,buyer_phone,buyer_contact,amount_tzs,commission_tzs,seller_net_tzs,seller_available_tzs,status,created_at,product:ione_single_products(title)")
        .eq("payment_provider", "Manual").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      if (error) return json({ success: false, error: "Could not load pending manual ChapChap payments." }, 500);
      return json({ success: true, orders: data || [] });
    }

    if (action === "confirm_sold") {
      if (!(await validAuthoritySession(admin, body?.authority_session || req.headers.get("x-ione-authority-session"))) && String(body?.password || "") !== String(Deno.env.get("IONE_AUTHORITY_PASSWORD") || "")) return json({ success: false, error: "Authority Press session expired. Unlock again." }, 401);
      const orderId = String(body?.order_id || "").trim();
      if (!orderId) return json({ success: false, error: "Order is required." }, 400);
      const { data: order, error: orderError } = await admin.from("ione_chapchap_orders").select("*").eq("id", orderId).eq("payment_provider", "Manual").eq("status", "pending").maybeSingle();
      if (orderError || !order) return json({ success: false, error: "This manual order is not pending or was already handled." }, 409);
      const now = new Date().toISOString();
      const { data: product, error: productError } = await admin.from("ione_single_products")
        .select("id,seller_id,seller_name,seller_phone,category,title,description,location,attributes,image_urls,status")
        .eq("id", order.product_id).maybeSingle();
      if (productError || !product) return json({ success: false, error: "Product record is missing; order was not confirmed." }, 409);
      const { data: agreement } = await admin.from("ione_chapchap_seller_agreements")
        .select("seller_name,seller_phone,seller_email,seller_address").eq("seller_id", order.seller_id).eq("product_id", order.product_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: updated, error: updateError } = await admin.from("ione_chapchap_orders")
        .update({ status: "paid", paid_at: now, updated_at: now, payout_status: "ready" })
        .eq("id", orderId).eq("payment_provider", "Manual").eq("status", "pending").select("id").maybeSingle();
      if (updateError || !updated) return json({ success: false, error: "Could not confirm this manual payment." }, 409);
      const { error: productUpdateError } = await admin.from("ione_single_products").update({ status: "sold", updated_at: now })
        .eq("id", product.id).in("status", ["pending_payment", "active"]);
      if (productUpdateError) return json({ success: false, error: "Payment confirmed but product status needs Authority review." }, 500);
      const payload = {
        order_id: order.id, buyer_id: order.buyer_id, seller_id: order.seller_id,
        buyer_full_name: order.buyer_full_name, buyer_address: order.buyer_address, buyer_email: order.buyer_email,
        buyer_contact: order.buyer_contact || order.buyer_phone, seller_name: agreement?.seller_name || product.seller_name || "SELLER",
        seller_phone: agreement?.seller_phone || product.seller_phone || "—", seller_email: agreement?.seller_email || null,
        seller_address: agreement?.seller_address || null, product_title: product.title, product_category: product.category,
        product_description: product.description, product_condition: product.attributes?.condition || product.attributes?.Condition || null,
        product_location: product.location, product_attributes: product.attributes || {}, product_image_urls: product.image_urls || [],
        amount_tzs: order.amount_tzs, chapchap_percent: 4, chapchap_fee_tzs: order.commission_tzs,
        blmpay_reference: null, blmpay_transaction_id: null, paid_at: now, payment_provider: "Manual",
        blmpay_payment_percent: 0, blmpay_payment_fee_tzs: 0, seller_available_tzs: order.seller_available_tzs
      };
      const { data: receipt, error: receiptError } = await admin.from("ione_chapchap_receipts").upsert(payload, { onConflict: "order_id" }).select("*").single();
      if (receiptError || !receipt) return json({ success: false, error: "Payment was confirmed but receipt creation failed. Reopen Authority Press and retry receipt recovery." }, 500);
      await admin.from("ione_chapchap_notifications").upsert({ seller_id: order.seller_id, order_id: order.id, title: "CHAPCHAP • SOLD", body: "Your product was sold after Authority Press verified the manual payment. Contact the buyer at "+order.buyer_phone+" to arrange delivery or collection." }, { onConflict: "order_id" });
      await sellerEmailReceipt(receipt);
      return json({ success: true, order_id: order.id, receipt, message: "Manual payment verified. Product marked sold and receipt saved in Authority Press." });
    }
    return json({ success: false, error: "Unsupported manual ChapChap action." }, 400);
  } catch (e) {
    console.error("ChapChap manual payment error:", e);
    return json({ success: false, error: "Could not complete the manual ChapChap request." }, 500);
  }
});