import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

async function sendSokoniSms(admin: any, idempotencyKey: string, eventType: string, rawPhone: unknown, rawMessage: string) {
  const apiKey = Deno.env.get("DARSMS_API_KEY");
  const phone = normalizeTanzaniaPhone(rawPhone);
  if (!apiKey) return { status: "skipped", reason: "missing_api_key" };
  if (!validPhone(phone)) return { status: "skipped", reason: "invalid_phone" };
  const message = String(rawMessage || "").replace(/\\s+/g, " ").trim().slice(0, 300);
  if (!message) return { status: "skipped", reason: "empty_message" };
  const claim = await admin.from("ione_sokoni_sms_log").insert({
    idempotency_key: idempotencyKey, event_type: eventType, recipient_phone: phone, status: "pending"
  }).select("id").maybeSingle();
  if (claim.error) {
    if (claim.error.code === "23505") return { status: "duplicate" };
    console.warn("Sokoni SMS log could not be claimed:", { event_type: eventType, code: claim.error.code });
    return { status: "failed", reason: "log_write_failed" };
  }
  if (!claim.data?.id) return { status: "duplicate" };
  try {
    const response = await fetch("https://dev.darsms.co.tz/api/v1/integrations/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ senderId: "DARSMS", to: [phone], message }),
      signal: AbortSignal.timeout(12000)
    });
    let result: any = {};
    try { result = await response.json(); } catch (_) {}
    const success = response.ok && result?.success === true;
    const ids = result?.data?.messageIds;
    const providerMessageId = Array.isArray(ids) ? String(ids[0] || "") : String(ids || "");
    await admin.from("ione_sokoni_sms_log").update({
      status: success ? "queued" : "failed", provider_message_id: providerMessageId || null,
      error_message: success ? null : String(result?.message || ("DARSMS HTTP " + response.status)).slice(0, 240),
      provider_response: { http_status: response.status, success, message: String(result?.message || "").slice(0, 160) },
      updated_at: new Date().toISOString()
    }).eq("idempotency_key", idempotencyKey);
    if (!success) console.warn("Sokoni SMS provider rejected a message:", { event_type: eventType, http_status: response.status });
    return { status: success ? "queued" : "failed", providerMessageId: providerMessageId || null };
  } catch (error) {
    await admin.from("ione_sokoni_sms_log").update({
      status: "failed", error_message: String((error as any)?.message || error).slice(0, 240),
      updated_at: new Date().toISOString()
    }).eq("idempotency_key", idempotencyKey);
    console.warn("Sokoni SMS request failed:", { event_type: eventType });
    return { status: "failed", reason: "network_error" };
  }
}

async function sendSokoniPush(admin: any, userId: string, payload: any) {
  try {
    const { data: config, error: configError } = await admin.from("ione_push_config")
      .select("vapid_public_key,vapid_private_key,vapid_subject").eq("id", true).maybeSingle();
    if (configError || !config?.vapid_public_key || !config?.vapid_private_key) { console.warn("Sokoni push configuration unavailable:", configError?.message || "missing VAPID keys"); return 0; }
    webpush.setVapidDetails(config.vapid_subject || "mailto:notifications@ione.app", config.vapid_public_key, config.vapid_private_key);
    const { data: subscriptions, error } = await admin.from("ione_push_subscriptions")
      .select("id,endpoint,p256dh,auth").eq("user_id", userId).eq("active", true);
    if (error) { console.warn("Sokoni push subscriptions could not be loaded:", error.message); return 0; }
    let delivered = 0;
    if (!(subscriptions || []).length) console.warn("Sokoni push has no active subscription for user:", userId);
    for (const sub of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
        delivered++;
      } catch (pushError: any) {
        const statusCode = Number(pushError?.statusCode || 0);
        console.warn("Sokoni push delivery failed:", { user_id: userId, status_code: statusCode, message: String(pushError?.message || pushError).slice(0, 240) });
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("ione_push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    return delivered;
  } catch (pushError) {
    console.warn("Sokoni push notification was skipped:", pushError);
    return 0;
  }
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
        admin.from("ione_sokoni_vendors").select("id,vendor_name,status,paid_until,approved_at,profile_photo_path,is_at_market,presence_updated_at").eq("user_id", user.id).maybeSingle(),
        admin.from("ione_sokoni_payment_requests").select("id,status,amount_tzs,created_at,approved_at,admin_note")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
      ]);
      if (vendorError || requestError) return json({ success: false, error: "Could not load your Sokoni status." }, 500);
      const active = !!vendor && vendor.status === "active" && Date.parse(vendor.paid_until) > Date.now();
      let vendorProfilePhotoUrl = null;
      if (vendor?.profile_photo_path) {
        const signedProfile = await admin.storage.from("ione-sokoni-vendor-profiles").createSignedUrl(vendor.profile_photo_path, 3600);
        if (!signedProfile.error) vendorProfilePhotoUrl = signedProfile.data.signedUrl;
      }
      return json({ success: true, active, vendor: vendor ? { ...vendor, profile_photo_url: vendorProfilePhotoUrl } : null, requests: requests || [] });
    }

    if (action === "public_products") {
      const { data: rows, error } = await admin.from("ione_sokoni_products")
        .select("id,vendor_id,user_id,product_name,description,price_tzs,unit_name,stock_quantity,photo_path,available,updated_at")
        .eq("available", true).gt("stock_quantity", 0).order("updated_at", { ascending: false }).limit(300);
      if (error) return json({ success: false, error: "Could not load Sokoni products." }, 500);
      const vendorIds = [...new Set((rows || []).map((r: any) => r.vendor_id))];
      let vendorRows: any[] = [];
      if (vendorIds.length) {
        const result = await admin.from("ione_sokoni_vendors").select("id,vendor_name,status,paid_until,profile_photo_path,is_at_market,presence_updated_at").in("id", vendorIds);
        if (result.error) return json({ success: false, error: "Could not load verified sellers." }, 500);
        vendorRows = result.data || [];
      }
      const nowMs = Date.now();
      const vendorMap = new Map(vendorRows.filter((v: any) => v.status === "active" && Date.parse(v.paid_until) > nowMs).map((v: any) => [v.id, v]));
      const vendorPhotoMap = new Map<string, string | null>();
      await Promise.all([...vendorMap.values()].map(async (vendor: any) => {
        if (!vendor.profile_photo_path) { vendorPhotoMap.set(vendor.id, null); return; }
        const signedVendorPhoto = await admin.storage.from("ione-sokoni-vendor-profiles").createSignedUrl(vendor.profile_photo_path, 3600);
        vendorPhotoMap.set(vendor.id, signedVendorPhoto.error ? null : signedVendorPhoto.data.signedUrl);
      }));
      const products = await Promise.all((rows || []).filter((r: any) => vendorMap.has(r.vendor_id)).map(async (r: any) => {
        let photoUrl = null;
        if (r.photo_path) {
          const signed = await admin.storage.from("ione-sokoni-products").createSignedUrl(r.photo_path, 3600);
          if (!signed.error) photoUrl = signed.data.signedUrl;
        }
        const vendor = vendorMap.get(r.vendor_id);
        const vendorPhotoUrl = vendorPhotoMap.get(r.vendor_id) || null;
        return {
          id: r.id, vendor_id: r.vendor_id, product_name: r.product_name, description: r.description,
          price_tzs: r.price_tzs, unit_name: r.unit_name, stock_quantity: r.stock_quantity,
          photo_url: photoUrl, vendor_name: vendor.vendor_name, vendor_profile_photo_url: vendorPhotoUrl,
          vendor_is_at_market: vendor.is_at_market === true, vendor_presence_updated_at: vendor.presence_updated_at || null,
          updated_at: r.updated_at
        };
      }));
      return json({ success: true, products });
    }

    if (action === "my_products") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const { data: rows, error } = await admin.from("ione_sokoni_products").select("*")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
      if (error) return json({ success: false, error: "Could not load your product listings." }, 500);
      const products = await Promise.all((rows || []).map(async (r: any) => {
        let photoUrl = null;
        if (r.photo_path) {
          const signed = await admin.storage.from("ione-sokoni-products").createSignedUrl(r.photo_path, 3600);
          if (!signed.error) photoUrl = signed.data.signedUrl;
        }
        return { id: r.id, product_name: r.product_name, description: r.description, price_tzs: r.price_tzs,
          unit_name: r.unit_name, stock_quantity: r.stock_quantity, photo_url: photoUrl, available: r.available };
      }));
      return json({ success: true, products });
    }

    if (action === "save_product") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const { data: vendor, error: vendorError } = await admin.from("ione_sokoni_vendors")
        .select("id,status,paid_until").eq("user_id", user.id).maybeSingle();
      if (vendorError) return json({ success: false, error: "Could not verify your vendor access." }, 500);
      if (!vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now()) {
        return json({ success: false, error: "Your Sokoni access is not active. Contact Authority Press to renew." }, 403);
      }
      const name = String(body?.product_name || "").trim().replace(/\s+/g, " ");
      const description = String(body?.description || "").trim().slice(0, 1200);
      const unit = String(body?.unit_name || "").trim().slice(0, 40);
      const price = Number(body?.price_tzs);
      const stock = Number(body?.stock_quantity);
      if (name.length < 2 || name.length > 140 || !unit || !Number.isSafeInteger(price) || price < 0 ||
          !Number.isFinite(stock) || stock < 0 || stock > 100000000) {
        return json({ success: false, error: "Enter a product name, valid price, unit and available quantity." }, 400);
      }
      const productId = String(body?.product_id || "").trim();
      let prior: any = null;
      if (productId) {
        if (!/^[0-9a-f-]{36}$/i.test(productId)) return json({ success: false, error: "Invalid product." }, 400);
        const result = await admin.from("ione_sokoni_products").select("*").eq("id", productId).eq("user_id", user.id).maybeSingle();
        if (result.error || !result.data) return json({ success: false, error: "Product not found in your own listings." }, 404);
        prior = result.data;
      }
      let photoPath = prior?.photo_path || null;
      let newPhotoPath: string | null = null;
      if (body?.image_base64) {
        const mime = String(body?.image_mime || "").toLowerCase();
        const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "";
        const encoded = String(body.image_base64);
        if (!ext || encoded.length > 7000000 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
          return json({ success: false, error: "Choose a JPG, PNG or WebP photo up to 5 MB." }, 400);
        }
        const binary = atob(encoded);
        if (binary.length > 5 * 1024 * 1024) return json({ success: false, error: "Product photos must be 5 MB or smaller." }, 400);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        newPhotoPath = user.id + "/" + crypto.randomUUID() + "." + ext;
        const upload = await admin.storage.from("ione-sokoni-products").upload(newPhotoPath, bytes, {
          contentType: mime, upsert: false, cacheControl: "3600"
        });
        if (upload.error) return json({ success: false, error: "Could not upload product photo. Try a smaller image." }, 500);
        photoPath = newPhotoPath;
      }
      const values = {
        vendor_id: vendor.id, user_id: user.id, product_name: name, description,
        price_tzs: price, unit_name: unit, stock_quantity: stock, photo_path: photoPath,
        available: stock > 0, updated_at: new Date().toISOString()
      };
      const saved = prior
        ? await admin.from("ione_sokoni_products").update(values).eq("id", prior.id).eq("user_id", user.id).select("id").single()
        : await admin.from("ione_sokoni_products").insert(values).select("id").single();
      if (saved.error) {
        if (newPhotoPath) await admin.storage.from("ione-sokoni-products").remove([newPhotoPath]);
        return json({ success: false, error: "Could not save product listing." }, 500);
      }
      if (newPhotoPath && prior?.photo_path) await admin.storage.from("ione-sokoni-products").remove([prior.photo_path]);
      return json({ success: true, product_id: saved.data.id, message: "Product listing saved." });
    }

    if (action === "delete_product") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const productId = String(body?.product_id || "").trim();
      const { data: product, error } = await admin.from("ione_sokoni_products").select("id,photo_path")
        .eq("id", productId).eq("user_id", user.id).maybeSingle();
      if (error || !product) return json({ success: false, error: "Product not found in your own listings." }, 404);
      const deleted = await admin.from("ione_sokoni_products").delete().eq("id", product.id).eq("user_id", user.id);
      if (deleted.error) return json({ success: false, error: "Could not remove product listing." }, 500);
      if (product.photo_path) await admin.storage.from("ione-sokoni-products").remove([product.photo_path]);
      return json({ success: true, message: "Product removed." });
    }

    if (action === "place_order_batch") {
      const buyer = await getVerifiedUser(admin, req);
      if (!buyer) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const buyerName = String(body?.buyer_name || "").trim().replace(/\s+/g, " ");
      const buyerPhone = normalizeTanzaniaPhone(body?.buyer_phone);
      const note = String(body?.buyer_note || "").trim().slice(0, 500);
      const wantsDelivery = body?.wants_delivery === true;
      const deliveryAddress = String(body?.delivery_address || "").trim().slice(0, 240);
      const dropoffLat = body?.dropoff_lat === null || body?.dropoff_lat === undefined || body?.dropoff_lat === "" ? NaN : Number(body.dropoff_lat);
      const dropoffLng = body?.dropoff_lng === null || body?.dropoff_lng === undefined || body?.dropoff_lng === "" ? NaN : Number(body.dropoff_lng);
      const rawItems = Array.isArray(body?.items) ? body.items : [];
      if (buyerName.length < 2 || buyerName.length > 120 || !validPhone(buyerPhone) || rawItems.length < 1 || rawItems.length > 30) {
        return json({ success: false, error: "Enter your name, valid phone number and add 1–30 products." }, 400);
      }
      const hasDropoffLat = Number.isFinite(dropoffLat);
      const hasDropoffLng = Number.isFinite(dropoffLng);
      if (wantsDelivery && (deliveryAddress.length < 4 || hasDropoffLat !== hasDropoffLng ||
          (hasDropoffLat && (dropoffLat < -90 || dropoffLat > 90 || dropoffLng < -180 || dropoffLng > 180)))) {
        return json({ success: false, error: "For Boda Yangu, enter the delivery address. GPS coordinates are optional, but if supplied they must be valid." }, 400);
      }
      const itemMap = new Map<string, number>();
      for (const raw of rawItems) {
        const productId = String(raw?.product_id || "").trim();
        const quantity = Number(raw?.quantity);
        if (!/^[0-9a-f-]{36}$/i.test(productId) || itemMap.has(productId) || !Number.isFinite(quantity) ||
            quantity <= 0 || quantity > 100000 || Math.round(quantity * 1000) !== quantity * 1000) {
          return json({ success: false, error: "One or more cart items are invalid. Review quantities and try again." }, 400);
        }
        itemMap.set(productId, quantity);
      }
      const productIds = [...itemMap.keys()];
      const { data: productRows, error: productsError } = await admin.from("ione_sokoni_products")
        .select("id,vendor_id,user_id,product_name,unit_name,price_tzs,stock_quantity,available")
        .in("id", productIds);
      if (productsError || (productRows || []).length !== productIds.length) {
        return json({ success: false, error: "One or more products are no longer available. Refresh the market and try again." }, 409);
      }
      for (const product of productRows || []) {
        const quantity = itemMap.get(product.id) || 0;
        if (!product.available || Number(product.stock_quantity) < quantity) {
          return json({ success: false, error: product.product_name + " is unavailable or has insufficient stock." }, 409);
        }
        if (product.user_id === buyer.id) return json({ success: false, error: "You cannot order your own listing." }, 400);
      }
      const vendorIds = [...new Set((productRows || []).map((p: any) => p.vendor_id))];
      const { data: vendorRows, error: vendorsError } = await admin.from("ione_sokoni_vendors")
        .select("id,vendor_name,status,paid_until,user_id,phone_number").in("id", vendorIds);
      if (vendorsError) return json({ success: false, error: "Could not verify the sellers. Please retry." }, 500);
      const now = Date.now();
      const vendorMap = new Map((vendorRows || []).filter((v: any) => v.status === "active" && Date.parse(v.paid_until) > now).map((v: any) => [v.id, v]));
      if (vendorMap.size !== vendorIds.length) return json({ success: false, error: "A seller's Sokoni access has expired. Refresh the market and try again." }, 409);
      const groups = new Map<string, any[]>();
      for (const product of productRows || []) {
        const vendorItems = groups.get(product.vendor_id) || [];
        const quantity = itemMap.get(product.id) || 0;
        vendorItems.push({ product, quantity, total: Number(product.price_tzs) * quantity });
        groups.set(product.vendor_id, vendorItems);
      }
      const createdOrderIds: string[] = [];
      const createdOrders: any[] = [];
      for (const [vendorId, items] of groups) {
        const vendor: any = vendorMap.get(vendorId);
        const total = items.reduce((sum, item) => sum + item.total, 0);
        if (!Number.isFinite(total) || total > 100000000000) {
          if (createdOrderIds.length) await admin.from("ione_sokoni_orders").delete().in("id", createdOrderIds);
          return json({ success: false, error: "Order total is too large." }, 400);
        }
        const groupId = crypto.randomUUID();
        const first = items[0];
        const header = await admin.from("ione_sokoni_orders").insert({
          product_id: first.product.id, vendor_id: vendor.id, seller_user_id: vendor.user_id, buyer_user_id: buyer.id,
          product_name: items.length === 1 ? first.product.product_name : "Oda ya bidhaa " + items.length,
          unit_name: items.length === 1 ? first.product.unit_name : "bidhaa",
          quantity: items.length === 1 ? first.quantity : 1,
          unit_price_tzs: items.length === 1 ? first.product.price_tzs : 0,
          total_tzs: total, buyer_name: buyerName, buyer_phone: buyerPhone, buyer_note: note,
          wants_delivery: wantsDelivery, delivery_address: wantsDelivery ? deliveryAddress : null,
          dropoff_lat: wantsDelivery && hasDropoffLat ? dropoffLat : null,
          dropoff_lng: wantsDelivery && hasDropoffLng ? dropoffLng : null,
          order_group_id: groupId, status: "new"
        }).select("id,status,total_tzs,created_at,order_group_id").single();
        if (header.error || !header.data) {
          if (createdOrderIds.length) await admin.from("ione_sokoni_orders").delete().in("id", createdOrderIds);
          return json({ success: false, error: "Could not submit the complete cart. No earlier seller orders were kept; please retry." }, 500);
        }
        createdOrderIds.push(header.data.id);
        const lines = items.map((item) => ({
          order_id: header.data.id, product_id: item.product.id, product_name: item.product.product_name,
          unit_name: item.product.unit_name, quantity: item.quantity, unit_price_tzs: item.product.price_tzs, total_tzs: item.total
        }));
        const savedLines = await admin.from("ione_sokoni_order_items").insert(lines);
        if (savedLines.error) {
          await admin.from("ione_sokoni_orders").delete().in("id", createdOrderIds);
          return json({ success: false, error: "Could not save all cart items. Please retry the order." }, 500);
        }
        createdOrders.push({ ...header.data, vendor_name: vendor.vendor_name, vendor_user_id: vendor.user_id, vendor_phone: vendor.phone_number, item_count: items.length });
      }
      for (const order of createdOrders) {
        await sendSokoniPush(admin, order.vendor_user_id, {
          title: "I|ONE Sokoni • Oda mpya",
          body: buyerName + " ametuma oda yenye bidhaa " + order.item_count + ".",
          url: "./?ionePushDestination=sokoni", tag: "ione-sokoni-order-" + order.id
        });
        await sendSokoniSms(admin, "order:" + order.id + ":seller:new", "order_new_seller",
          order.vendor_phone, "I|ONE Sokoni: Oda mpya kutoka " + buyerName + ". Fungua ione Sokoni kuangalia maelezo.");
      }
      if (createdOrders.length) await sendSokoniSms(admin, "checkout:" + createdOrders[0].id + ":buyer:received", "order_received_buyer",
        buyerPhone, "I|ONE Sokoni: Oda yako imepokelewa. Wauzaji wamejulishwa. Angalia hali ya oda ndani ya ione.");
      return json({ success: true, orders: createdOrders.map(({ vendor_user_id, vendor_phone, ...order }: any) => order), message: "Oda imetumwa kwa kila muuzaji. Kila muuzaji ataona bidhaa zake kwenye oda moja." });
    }

    if (action === "place_order") {
      const buyer = await getVerifiedUser(admin, req);
      if (!buyer) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const productId = String(body?.product_id || "").trim();
      const buyerName = String(body?.buyer_name || "").trim().replace(/\s+/g, " ");
      const buyerPhone = normalizeTanzaniaPhone(body?.buyer_phone);
      const quantity = Number(body?.quantity);
      const note = String(body?.buyer_note || "").trim().slice(0, 500);
      const wantsDelivery = body?.wants_delivery === true;
      const deliveryAddress = String(body?.delivery_address || "").trim().slice(0, 240);
      const dropoffLat = body?.dropoff_lat === null || body?.dropoff_lat === undefined || body?.dropoff_lat === "" ? NaN : Number(body.dropoff_lat);
      const dropoffLng = body?.dropoff_lng === null || body?.dropoff_lng === undefined || body?.dropoff_lng === "" ? NaN : Number(body.dropoff_lng);
      if (!/^[0-9a-f-]{36}$/i.test(productId) || buyerName.length < 2 || buyerName.length > 120 ||
          !validPhone(buyerPhone) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || Math.round(quantity * 1000) !== quantity * 1000) {
        return json({ success: false, error: "Enter your name, valid phone number and a valid quantity." }, 400);
      }
      const hasDropoffLat = Number.isFinite(dropoffLat);
      const hasDropoffLng = Number.isFinite(dropoffLng);
      if (wantsDelivery && (deliveryAddress.length < 4 || hasDropoffLat !== hasDropoffLng ||
          (hasDropoffLat && (dropoffLat < -90 || dropoffLat > 90 || dropoffLng < -180 || dropoffLng > 180)))) {
        return json({ success: false, error: "For Boda Yangu, enter the delivery address. GPS coordinates are optional, but if supplied they must be valid." }, 400);
      }
      const { data: product, error: productError } = await admin.from("ione_sokoni_products")
        .select("id,vendor_id,user_id,product_name,unit_name,price_tzs,stock_quantity,available")
        .eq("id", productId).maybeSingle();
      if (productError || !product || !product.available || Number(product.stock_quantity) < quantity) {
        return json({ success: false, error: "This product is unavailable or the requested quantity is no longer in stock." }, 409);
      }
      if (product.user_id === buyer.id) return json({ success: false, error: "You cannot order your own listing." }, 400);
      const { data: vendor, error: vendorError } = await admin.from("ione_sokoni_vendors")
        .select("id,vendor_name,status,paid_until,user_id,phone_number").eq("id", product.vendor_id).maybeSingle();
      if (vendorError || !vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now()) {
        return json({ success: false, error: "This seller's Sokoni access is not currently active." }, 409);
      }
      const total = Number(product.price_tzs) * quantity;
      if (!Number.isFinite(total) || total > 100000000000) return json({ success: false, error: "Order total is too large." }, 400);
      const inserted = await admin.from("ione_sokoni_orders").insert({
        product_id: product.id, vendor_id: vendor.id, seller_user_id: vendor.user_id, buyer_user_id: buyer.id,
        product_name: product.product_name, unit_name: product.unit_name, quantity,
        unit_price_tzs: product.price_tzs, total_tzs: total, buyer_name: buyerName,
        buyer_phone: buyerPhone, buyer_note: note, wants_delivery: wantsDelivery,
        delivery_address: wantsDelivery ? deliveryAddress : null,
        dropoff_lat: wantsDelivery && hasDropoffLat ? dropoffLat : null,
          dropoff_lng: wantsDelivery && hasDropoffLng ? dropoffLng : null, status: "new"
      }).select("id,status,total_tzs,created_at").single();
      if (inserted.error) return json({ success: false, error: "Could not send your order request. Please retry." }, 500);
      const lineInsert = await admin.from("ione_sokoni_order_items").insert([{
        order_id: inserted.data.id, product_id: product.id, product_name: product.product_name,
        unit_name: product.unit_name, quantity, unit_price_tzs: product.price_tzs, total_tzs: total
      }]);
      if (lineInsert.error) {
        await admin.from("ione_sokoni_orders").delete().eq("id", inserted.data.id);
        return json({ success: false, error: "Could not save order details. Please retry." }, 500);
      }
      await sendSokoniPush(admin, vendor.user_id, {
        title: "I|ONE Sokoni • Oda mpya", body: buyerName + " ametuma oda ya " + product.product_name + ".",
        url: "./?ionePushDestination=sokoni", tag: "ione-sokoni-order-" + inserted.data.id
      });
      await Promise.allSettled([
        sendSokoniSms(admin, "order:" + inserted.data.id + ":seller:new", "order_new_seller",
          vendor.phone_number, "I|ONE Sokoni: Oda mpya kutoka " + buyerName + " ya " + product.product_name + ". Fungua ione Sokoni."),
        sendSokoniSms(admin, "order:" + inserted.data.id + ":buyer:received", "order_received_buyer",
          buyerPhone, "I|ONE Sokoni: Oda yako ya " + product.product_name + " imepokelewa. Angalia hali ndani ya ione.")
      ]);
      return json({ success: true, order: inserted.data,
        message: "Ombi limetumwa kwa muuzaji. Muuzaji atapitia ombi na kuwasiliana nawe kwa namba uliyotoa." });
    }

    if (action === "my_orders") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const [seller, buyer] = await Promise.all([
        admin.from("ione_sokoni_orders").select("id,product_id,product_name,unit_name,quantity,unit_price_tzs,total_tzs,buyer_name,buyer_phone,buyer_note,wants_delivery,delivery_address,status,created_at")
          .eq("seller_user_id", user.id).order("created_at", { ascending: false }).limit(100),
        admin.from("ione_sokoni_orders").select("id,vendor_id,product_name,unit_name,quantity,unit_price_tzs,total_tzs,wants_delivery,status,created_at")
          .eq("buyer_user_id", user.id).order("created_at", { ascending: false }).limit(100)
      ]);
      if (seller.error || buyer.error) return json({ success: false, error: "Could not load Sokoni order requests." }, 500);
      const allOrderIds = [...new Set([...(seller.data || []), ...(buyer.data || [])].map((order: any) => order.id))];
      const orderItemsById = new Map<string, any[]>();
      if (allOrderIds.length) {
        const { data: itemRows, error: itemError } = await admin.from("ione_sokoni_order_items")
          .select("id,order_id,product_id,product_name,unit_name,quantity,unit_price_tzs,total_tzs")
          .in("order_id", allOrderIds).order("created_at", { ascending: true });
        if (itemError) return json({ success: false, error: "Could not load order item details." }, 500);
        for (const item of itemRows || []) {
          const list = orderItemsById.get(item.order_id) || [];
          list.push(item);
          orderItemsById.set(item.order_id, list);
        }
      }
      const sellerOrders = (seller.data || []).map((order: any) => ({ ...order, items: orderItemsById.get(order.id) || [] }));
      const buyerOrdersWithItems = (buyer.data || []).map((order: any) => ({ ...order, items: orderItemsById.get(order.id) || [] }));
      const vendorIds = [...new Set((buyer.data || []).map((order: any) => order.vendor_id).filter(Boolean))];
      let sellerPhones = new Map<string, string>();
      if (vendorIds.length) {
        const vendorContacts = await admin.from("ione_sokoni_vendors").select("id,phone_number").in("id", vendorIds);
        if (vendorContacts.error) return json({ success: false, error: "Could not load seller contact details." }, 500);
        sellerPhones = new Map((vendorContacts.data || []).map((vendor: any) => [vendor.id, vendor.phone_number]));
      }
      const buyerOrders = buyerOrdersWithItems.map((order: any) => ({ ...order, seller_phone: sellerPhones.get(order.vendor_id) || null }));
      return json({ success: true, seller_orders: sellerOrders, buyer_orders: buyerOrders });
    }

    if (action === "update_order_status") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const orderId = String(body?.order_id || "").trim();
      const nextStatus = String(body?.status || "").trim().toLowerCase();
      if (!/^[0-9a-f-]{36}$/i.test(orderId) || !["accepted", "rejected", "completed"].includes(nextStatus)) {
        return json({ success: false, error: "Invalid order update." }, 400);
      }
      const { data: vendor } = await admin.from("ione_sokoni_vendors").select("id,status,paid_until,pickup_location,pickup_lat,pickup_lng")
        .eq("user_id", user.id).maybeSingle();
      if (!vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now()) {
        return json({ success: false, error: "Active Sokoni vendor access is required." }, 403);
      }
      const { data: order, error: orderError } = await admin.from("ione_sokoni_orders").select("*")
        .eq("id", orderId).eq("seller_user_id", user.id).maybeSingle();
      if (orderError || !order) return json({ success: false, error: "Order request not found in your seller account." }, 404);
      if (order.status !== "new" && !(order.status === "accepted" && nextStatus === "completed")) {
        return json({ success: false, error: "This order cannot be changed to that status." }, 409);
      }
      if (nextStatus === "accepted") {
        const claimed = await admin.from("ione_sokoni_orders").update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("id", order.id).eq("status", "new").select("id").maybeSingle();
        if (claimed.error || !claimed.data) return json({ success: false, error: "Another action already updated this order. Refresh and retry." }, 409);
        const { data: orderItems, error: orderItemsError } = await admin.from("ione_sokoni_order_items")
          .select("product_id,quantity").eq("order_id", order.id);
        if (orderItemsError) {
          await admin.from("ione_sokoni_orders").update({ status: "new", updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "accepted");
          return json({ success: false, error: "Could not verify order items. Refresh and try again." }, 500);
        }
        const stockLines = (orderItems && orderItems.length) ? orderItems : [{ product_id: order.product_id, quantity: order.quantity }];
        const deductions: Array<{ product_id: string; quantity: number }> = [];
        let stockFailure = false;
        for (const line of stockLines) {
          const { data: product, error: productError } = await admin.from("ione_sokoni_products").select("stock_quantity")
            .eq("id", line.product_id).eq("user_id", user.id).maybeSingle();
          if (productError || !product || Number(product.stock_quantity) < Number(line.quantity)) {
            stockFailure = true; break;
          }
          const remaining = Number(product.stock_quantity) - Number(line.quantity);
          const stockUpdate = await admin.from("ione_sokoni_products").update({
            stock_quantity: remaining, available: remaining > 0, updated_at: new Date().toISOString()
          }).eq("id", line.product_id).eq("user_id", user.id).eq("stock_quantity", product.stock_quantity).select("id").maybeSingle();
          if (stockUpdate.error || !stockUpdate.data) {
            stockFailure = true; break;
          }
          deductions.push({ product_id: line.product_id, quantity: Number(line.quantity) });
        }
        if (stockFailure) {
          for (const deduction of deductions) {
            const { data: current } = await admin.from("ione_sokoni_products").select("stock_quantity")
              .eq("id", deduction.product_id).eq("user_id", user.id).maybeSingle();
            if (current) {
              const restored = Number(current.stock_quantity) + deduction.quantity;
              await admin.from("ione_sokoni_products").update({ stock_quantity: restored, available: restored > 0, updated_at: new Date().toISOString() })
                .eq("id", deduction.product_id).eq("user_id", user.id).eq("stock_quantity", current.stock_quantity);
            }
          }
          await admin.from("ione_sokoni_orders").update({ status: "new", updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "accepted");
          return json({ success: false, error: "Not enough stock remains for every item in this order. No stock was intentionally consumed; refresh and retry." }, 409);
        }
        let deliveryCreated=false,deliveryId:string|null=null;
        if(order.wants_delivery===true&&order.delivery_address){
          const pickupLocation=String(vendor.pickup_location||"").trim()||"Eneo la kuchukulia litathibitishwa kwa simu";
          const pickupLat=vendor.pickup_lat!==null&&vendor.pickup_lat!==undefined&&vendor.pickup_lat!==""&&Number.isFinite(Number(vendor.pickup_lat))?Number(vendor.pickup_lat):null;
          const pickupLng=vendor.pickup_lng!==null&&vendor.pickup_lng!==undefined&&vendor.pickup_lng!==""&&Number.isFinite(Number(vendor.pickup_lng))?Number(vendor.pickup_lng):null;
          const created=await admin.from("ione_sokoni_deliveries").insert({order_id:order.id,buyer_user_id:order.buyer_user_id,seller_user_id:order.seller_user_id,vendor_id:order.vendor_id,pickup_location:pickupLocation,pickup_lat:pickupLat,pickup_lng:pickupLng,dropoff_location:order.delivery_address,dropoff_lat:order.dropoff_lat,dropoff_lng:order.dropoff_lng,status:"requested"}).select("id").single();
          if(created.error&&created.error.code!=="23505")console.error("Automatic delivery request failed:",created.error.message);
          let finalDeliveryId=created.data?.id||null;
          if(!finalDeliveryId&&created.error?.code==="23505"){const prior=await admin.from("ione_sokoni_deliveries").select("id").eq("order_id",order.id).maybeSingle();finalDeliveryId=prior.data?.id||null;}
          if(finalDeliveryId){
            deliveryCreated=true;deliveryId=finalDeliveryId;
            const riders:any[]=[];
            let riderQueryError:any=null;
            for(let offset=0;;offset+=1000){
              const batch=await admin.from("ione_sokoni_riders").select("user_id,phone_number").eq("status","active").eq("access_payment_confirmed",true).gt("access_expires_at",new Date().toISOString()).eq("available",true).order("created_at",{ascending:true}).range(offset,offset+999);
              if(batch.error){riderQueryError=batch.error;break;}
              riders.push(...(batch.data||[]));
              if((batch.data||[]).length<1000)break;
            }
            if(riderQueryError)console.warn("Could not load every eligible rider after order acceptance:",riderQueryError.message);
            const pushResults=await Promise.allSettled(riders.map((r:any)=>sendSokoniPush(admin,r.user_id,{title:"I|ONE Boda Yangu • Safari mpya",body:order.product_name+" • "+order.quantity+" "+order.unit_name+" • "+order.delivery_address+". Fungua Sokoni kuona maelezo na kupiga simu.",url:"./?ionePushDestination=sokoni&ioneDeliveryId="+deliveryId,tag:"ione-sokoni-delivery-"+deliveryId})));
            await Promise.allSettled(riders.map((r:any)=>sendSokoniSms(admin,"delivery:"+deliveryId+":rider:"+r.user_id,"delivery_request_rider",r.phone_number,
              "I|ONE Boda Yangu: Safari mpya ya kuchukua " + String(order.product_name || "bidhaa") + ". Fungua ione Sokoni kuona maelezo.")));
            await sendSokoniSms(admin,"delivery:"+deliveryId+":buyer:accepted","order_accepted_buyer",order.buyer_phone,
              "I|ONE Sokoni: Muuzaji amekubali oda yako. Ombi la boda limetumwa kwa madereva walio tayari.");
            console.info("Automatic delivery alerts after seller acceptance:",{delivery_id:deliveryId,eligible_riders:riders.length,push_attempts:pushResults.length});
            await Promise.allSettled([
              sendSokoniPush(admin,order.buyer_user_id,{title:"I|ONE Sokoni • Oda imekubaliwa",body:"Mama Sokoni amekubali "+order.product_name+". Madereva wanaarifiwa moja kwa moja.",url:"./?ionePushDestination=sokoni&ioneDeliveryId="+deliveryId,tag:"ione-sokoni-order-status-"+order.id}),
              sendSokoniPush(admin,order.seller_user_id,{title:"I|ONE Sokoni • Oda imekubaliwa",body:"Ombi la uwasilishaji limetumwa moja kwa moja kwa madereva wanaopatikana.",url:"./?ionePushDestination=sokoni&ioneDeliveryId="+deliveryId,tag:"ione-sokoni-seller-delivery-"+order.id})
            ]);
          }
        }
        if(!deliveryCreated)await sendSokoniPush(admin,order.buyer_user_id,{title:"I|ONE Sokoni • Oda imekubaliwa",body:"Oda imekubaliwa, lakini ombi la delivery halikuweza kutengenezwa. Tafadhali wasiliana na Mama Sokoni.",url:"./?ionePushDestination=sokoni",tag:"ione-sokoni-order-status-"+order.id});
        return json({success:true,delivery_id:deliveryId,delivery_created:deliveryCreated,message:deliveryCreated?"Oda imekubaliwa. Safari imetumwa moja kwa moja kwa madereva walio tayari; hakuna haja ya kuomba boda tena.":"Oda imekubaliwa, lakini ombi la delivery halikuweza kutengenezwa. Wasiliana na I|ONE Support."});
      }
      const update = await admin.from("ione_sokoni_orders").update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", order.id).eq("status", order.status).select("id").maybeSingle();
      if (update.error || !update.data) return json({ success: false, error: "Order status was not saved. Refresh and try again." }, 409);
      if (nextStatus === "rejected") await sendSokoniPush(admin, order.buyer_user_id, {
        title: "I|ONE Sokoni • Oda imekataliwa", body: "Muuzaji hakuweza kukubali oda yako ya " + order.product_name + ".",
        url: "./?ionePushDestination=sokoni", tag: "ione-sokoni-order-status-" + order.id
      });
      if (nextStatus === "rejected") await sendSokoniSms(admin, "order:" + order.id + ":buyer:rejected", "order_rejected_buyer",
        order.buyer_phone, "I|ONE Sokoni: Samahani, oda yako ya " + order.product_name + " haikukubaliwa. Fungua ione kuona maelezo.");
      if (nextStatus === "completed") await sendSokoniSms(admin, "order:" + order.id + ":buyer:completed", "order_completed_buyer",
        order.buyer_phone, "I|ONE Sokoni: Oda yako ya " + order.product_name + " imekamilika. Asante kwa kutumia ione.");
      return json({ success: true, message: nextStatus === "completed" ? "Order marked completed." : "Order request rejected." });
    }

    if (action === "save_pickup_location") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const label = String(body?.pickup_location || "").trim().slice(0, 240);
      const rawLat = body?.pickup_lat;
      const rawLng = body?.pickup_lng;
      const hasLat = rawLat !== null && rawLat !== undefined && String(rawLat).trim() !== "";
      const hasLng = rawLng !== null && rawLng !== undefined && String(rawLng).trim() !== "";
      const lat = hasLat ? Number(rawLat) : null;
      const lng = hasLng ? Number(rawLng) : null;
      if (label.length < 4 || hasLat !== hasLng ||
          (hasLat && (!Number.isFinite(lat) || lat! < -90 || lat! > 90 || !Number.isFinite(lng) || lng! < -180 || lng! > 180))) {
        return json({ success: false, error: "Enter a pickup address. GPS coordinates are optional, but if supplied they must be valid." }, 400);
      }
      const { data: vendor, error } = await admin.from("ione_sokoni_vendors").select("id,status,paid_until")
        .eq("user_id", user.id).maybeSingle();
      if (error || !vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now()) {
        return json({ success: false, error: "Active Sokoni vendor access is required." }, 403);
      }
      const saved = await admin.from("ione_sokoni_vendors").update({
        pickup_location: label, pickup_lat: lat, pickup_lng: lng, updated_at: new Date().toISOString()
      }).eq("id", vendor.id).select("id").maybeSingle();
      if (saved.error || !saved.data) return json({ success: false, error: "Could not save the pickup location." }, 500);
      return json({ success: true, message: "Pickup location saved for Boda Yangu requests." });
    }

    if (action === "rider_apply") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const name = String(body?.rider_name || "").trim().replace(/\s+/g, " ");
      const phone = normalizeTanzaniaPhone(body?.phone_number);
      const profilePath = String(body?.profile_path || "").trim();
      const documentType = String(body?.identity_document_type || "").trim();
      const documentPath = String(body?.identity_document_path || "").trim();
      const plate = String(body?.motorcycle_plate || "").trim().toUpperCase().replace(/\s+/g, " ");
      const groupName = String(body?.rider_group_name || "").trim().replace(/\s+/g, " ");
      const chairmanPhone = normalizeTanzaniaPhone(body?.chairman_phone);
      const allowedDocumentTypes = ["driving_license", "national_id", "rider_group_id"];
      if (name.length < 2 || name.length > 120 || !validPhone(phone) ||
          !allowedDocumentTypes.includes(documentType) || plate.length < 4 || plate.length > 24 ||
          groupName.length < 2 || groupName.length > 140 || !validPhone(chairmanPhone)) {
        return json({ success: false, error: "Enter your full name, valid phone numbers, one identity document, motorcycle plate and rider group details." }, 400);
      }
      const profileParts = profilePath.split("/");
      if (profileParts.length !== 2 || profileParts[0] !== user.id || !/^[A-Za-z0-9._-]{5,180}$/.test(profileParts[1]) ||
          !/\.(jpg|png|webp)$/i.test(profileParts[1])) {
        return json({ success: false, error: "The rider profile photo is invalid. Please upload it again." }, 400);
      }
      const profileListed = await admin.storage.from("ione-sokoni-rider-profiles").list(user.id, { search: profileParts[1], limit: 20 });
      if (profileListed.error || !(profileListed.data || []).some((item: any) => item.name === profileParts[1])) {
        return json({ success: false, error: "The rider profile photo could not be verified. Upload it again." }, 400);
      }
      const pathParts = documentPath.split("/");
      if (pathParts.length !== 2 || pathParts[0] !== user.id || !/^[A-Za-z0-9._-]{5,180}$/.test(pathParts[1]) ||
          !/\.(jpg|png|webp|pdf)$/i.test(pathParts[1])) {
        return json({ success: false, error: "The identity document upload is invalid. Please upload it again." }, 400);
      }
      const listed = await admin.storage.from("ione-sokoni-rider-documents").list(user.id, { search: pathParts[1], limit: 20 });
      if (listed.error || !(listed.data || []).some((item: any) => item.name === pathParts[1])) {
        return json({ success: false, error: "The identity document could not be verified. Upload it again." }, 400);
      }
      const { data: rider } = await admin.from("ione_sokoni_riders").select("id,status").eq("user_id", user.id).maybeSingle();
      if (rider) return json({ success: false, error: "Your Boda Yangu rider profile already exists. Check its status below." }, 409);
      const { data: pending } = await admin.from("ione_sokoni_rider_applications").select("id,status")
        .eq("user_id", user.id).eq("status", "pending").maybeSingle();
      if (pending) return json({ success: true, already_pending: true, message: "Your rider application is already waiting for Authority Press." });
      const result = await admin.from("ione_sokoni_rider_applications").insert({
        user_id: user.id, rider_name: name, phone_number: phone, identity_document_type: documentType,
        identity_document_path: documentPath, profile_path: profilePath, motorcycle_plate: plate, rider_group_name: groupName,
        chairman_phone: chairmanPhone, status: "pending"
      }).select("id,status,created_at").single();
      if (result.error) return json({ success: false, error: "Could not submit the rider application. Please retry." }, 500);
      return json({ success: true, application: result.data, message: "Rider application submitted. Authority Press must verify you before you can receive trips." });
    }

    if (action === "rider_update_profile") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const profilePath = String(body?.profile_path || "").trim();
      const parts = profilePath.split("/");
      if (parts.length !== 2 || parts[0] !== user.id || !/^[A-Za-z0-9._-]{5,180}$/.test(parts[1]) || !/\.(jpg|png|webp)$/i.test(parts[1])) {
        return json({ success: false, error: "The profile photo is invalid. Upload it again." }, 400);
      }
      const listed = await admin.storage.from("ione-sokoni-rider-profiles").list(user.id, { search: parts[1], limit: 20 });
      if (listed.error || !(listed.data || []).some((item: any) => item.name === parts[1])) return json({ success: false, error: "The profile photo could not be verified." }, 400);
      const { data: rider, error: riderError } = await admin.from("ione_sokoni_riders").select("id,status,profile_path").eq("user_id", user.id).maybeSingle();
      if (riderError || !rider || rider.status !== "active") return json({ success: false, error: "Only an Authority-approved rider can update this profile." }, 403);
      const updated = await admin.from("ione_sokoni_riders").update({ profile_path: profilePath, updated_at: new Date().toISOString() }).eq("id", rider.id).select("id").maybeSingle();
      if (updated.error || !updated.data) return json({ success: false, error: "Could not update the rider profile." }, 500);
      const applicationUpdate = await admin.from("ione_sokoni_rider_applications").update({ profile_path: profilePath }).eq("user_id", user.id).eq("status", "approved");
      if (applicationUpdate.error) {
        if (rider.profile_path) await admin.from("ione_sokoni_riders").update({ profile_path: rider.profile_path }).eq("id", rider.id);
        else await admin.from("ione_sokoni_riders").update({ profile_path: null }).eq("id", rider.id);
        return json({ success: false, error: "The Authority profile record could not be updated. Please retry." }, 500);
      }
      if (rider.profile_path && rider.profile_path !== profilePath) {
        try { await admin.storage.from("ione-sokoni-rider-profiles").remove([rider.profile_path]); } catch (_) {}
      }
      return json({ success: true, message: "Picha ya wasifu imesasishwa na itaonekana Sokoni ukiwasha upatikanaji." });
    }

    if (action === "rider_status") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const [riderResult, applicationResult] = await Promise.all([
        admin.from("ione_sokoni_riders").select("id,rider_name,phone_number,status,available,last_seen_at,location_updated_at")
          .eq("user_id", user.id).maybeSingle(),
        admin.from("ione_sokoni_rider_applications").select("id,rider_name,status,created_at,reviewed_at,admin_note")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1)
      ]);
      if (riderResult.error || applicationResult.error) return json({ success: false, error: "Could not load rider status." }, 500);
      let activeDelivery = null;
      if (riderResult.data) {
        const active = await admin.from("ione_sokoni_deliveries").select("id,order_id,pickup_location,pickup_lat,pickup_lng,dropoff_location,dropoff_lat,dropoff_lng,delivery_fee_tzs,buyer_fee_confirmed,seller_fee_confirmed,route_accepted,status,created_at")
          .eq("rider_user_id", user.id).in("status", ["accepted", "picked_up", "delivered"]).maybeSingle();
        if (active.error) return json({ success: false, error: "Could not load your current trip." }, 500);
        activeDelivery = active.data || null;
      }
      return json({ success: true, rider: riderResult.data || null, application: applicationResult.data?.[0] || null, active_delivery: activeDelivery });
    }

    if (action === "rider_availability") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const available = body?.available === true;
      const { data: rider, error } = await admin.from("ione_sokoni_riders").select("id,status,available,access_payment_confirmed,access_expires_at").eq("user_id", user.id).maybeSingle();
      if (error || !rider || rider.status !== "active" || !rider.access_payment_confirmed || !rider.access_expires_at || Date.parse(rider.access_expires_at) <= Date.now()) return json({ success: false, error: "Authority Press must approve your rider access and dates before you can go on duty." }, 403);
      const [activeDeliveries, activePassengerTrips] = await Promise.all([admin.from("ione_sokoni_deliveries").select("id,status,route_accepted").eq("rider_user_id", user.id).in("status", ["accepted", "picked_up", "delivered"]),admin.from("ione_sokoni_passenger_trips").select("id,status").eq("rider_id", rider.id).in("status", ["rider_ready", "picked_up"])]);
      if (activeDeliveries.error || activePassengerTrips.error) return json({ success: false, error: "Could not check your active trip." }, 500);
      const routeInProgress = (activeDeliveries.data || []).some((d: any) => d.status === "picked_up" || d.status === "delivered" || (d.status === "accepted" && d.route_accepted === true));
      if (available && (routeInProgress || !!activePassengerTrips.data?.length)) return json({ success: false, error: "Kamilisha safari uliyoanza kabla ya kuwasha upatikanaji tena." }, 409);
      const saved = await admin.from("ione_sokoni_riders").update({
        available, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...(available ? {} : { location_lat: null, location_lng: null, location_updated_at: null })
      }).eq("id", rider.id).select("available").single();
      if (saved.error) return json({ success: false, error: "Could not update rider availability." }, 500);
      return json({ success: true, available: saved.data.available, message: available ? "You are now available for Boda Yangu requests." : "You are now off duty." });
    }

    if (action === "rider_heartbeat") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const now = new Date().toISOString();
      const { data: rider, error } = await admin.from("ione_sokoni_riders").select("id,status,available,access_payment_confirmed,access_expires_at").eq("user_id", user.id).maybeSingle();
      if (error || !rider || rider.status !== "active" || !rider.access_payment_confirmed || !rider.access_expires_at || Date.parse(rider.access_expires_at) <= Date.now()) return json({ success: false, error: "Authority Press must approve your rider access and dates before you can go on duty." }, 403);
      if (!rider.available) return json({ success: true, available: false });
      const active = await admin.from("ione_sokoni_deliveries").select("id,status,route_accepted").eq("rider_user_id", user.id).in("status", ["accepted", "picked_up", "delivered"]);
      if (active.error) return json({ success: false, error: "Could not check your active trip." }, 500);
      const activePassenger = await admin.from("ione_sokoni_passenger_trips").select("id").eq("rider_id", rider.id).in("status", ["rider_ready", "picked_up"]).limit(1);
      if (activePassenger.error) return json({ success: false, error: "Could not check your passenger trip." }, 500);
      const hasActiveRoute = (active.data || []).some((d: any) => d.status === "picked_up" || d.status === "delivered" || (d.status === "accepted" && d.route_accepted === true)) || !!activePassenger.data?.length;
      const update = await admin.from("ione_sokoni_riders").update({ last_seen_at: now, updated_at: now }).eq("id", rider.id).eq("available", true);
      if (update.error) return json({ success: false, error: "Could not refresh availability." }, 500);
      return json({ success: true, available: true, has_active_trip: hasActiveRoute, last_seen_at: now });
    }

    if (action === "public_riders") {
      const now = Date.now();
      const freshSince = new Date(now - 3 * 60 * 1000).toISOString();
      // Show every Authority-approved rider whose manually granted access is still valid.
      // Availability only changes the displayed status; trip matching keeps its stricter
      // available + recent-heartbeat checks, so offline riders cannot accept live requests.
      const { data, error } = await admin.from("ione_sokoni_riders")
        .select("id,rider_name,profile_path,available,last_seen_at,access_payment_confirmed,access_expires_at")
        .eq("status", "active").eq("access_payment_confirmed", true).gt("access_expires_at", new Date(now).toISOString())
        .order("available", { ascending: false }).order("last_seen_at", { ascending: false, nullsFirst: false }).limit(100);
      if (error) return json({ success: false, error: "Could not load the verified rider board." }, 500);
      const riders = (data || []).map((rider: any) => ({
        id: rider.id, rider_name: rider.rider_name,
        available: rider.available === true && !!rider.last_seen_at && Date.parse(rider.last_seen_at) > Date.parse(freshSince),
        profile_url: rider.profile_path ? admin.storage.from("ione-sokoni-rider-profiles").getPublicUrl(rider.profile_path).data?.publicUrl || null : null
      }));
      return json({ success: true, riders });
    }

    if (action === "request_delivery") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const orderId = String(body?.order_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ success: false, error: "Invalid order." }, 400);
      const { data: order, error } = await admin.from("ione_sokoni_orders").select("*").eq("id", orderId).maybeSingle();
      if (error || !order || (order.buyer_user_id !== user.id && order.seller_user_id !== user.id)) {
        return json({ success: false, error: "This order is not available in your account." }, 404);
      }
      if (order.status !== "accepted" || !order.wants_delivery || !order.delivery_address) {
        return json({ success: false, error: "This accepted order does not have a delivery address." }, 409);
      }
      const { data: vendor, error: vendorError } = await admin.from("ione_sokoni_vendors")
        .select("id,status,paid_until,pickup_location,pickup_lat,pickup_lng").eq("id", order.vendor_id).maybeSingle();
      if (vendorError || !vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now() ||
          !vendor.pickup_location) {
        return json({ success: false, error: "The seller must save a pickup address before requesting Boda Yangu." }, 409);
      }
      const created = await admin.from("ione_sokoni_deliveries").insert({
        order_id: order.id, buyer_user_id: order.buyer_user_id, seller_user_id: order.seller_user_id, vendor_id: order.vendor_id,
        pickup_location: vendor.pickup_location, pickup_lat: vendor.pickup_lat, pickup_lng: vendor.pickup_lng,
        dropoff_location: order.delivery_address, dropoff_lat: order.dropoff_lat, dropoff_lng: order.dropoff_lng,
        status: "requested"
      }).select("id,status,created_at").single();
      if (created.error) {
        if (created.error.code === "23505") return json({ success: false, error: "A Boda Yangu request already exists for this order." }, 409);
        return json({ success: false, error: "Could not send the delivery request." }, 500);
      }

      // Notify the seller as well as every currently available, recently active verified rider.
      // The rider board remains the source of truth; push is an additional alert.
      const [{ data: availableRiders, error: ridersError }, { data: product }] = await Promise.all([
        admin.from("ione_sokoni_riders").select("user_id,phone_number")
          .eq("status", "active").eq("access_payment_confirmed", true).gt("access_expires_at", new Date().toISOString()).eq("available", true).limit(100),
        admin.from("ione_sokoni_products").select("product_name").eq("id", order.product_id).maybeSingle()
      ]);
      if (ridersError) console.warn("Could not load available riders for delivery alerts:", ridersError.message);
      const productName = String(product?.product_name || order.product_name || "oda ya Sokoni");
      const riderAlerts = (availableRiders || []).map((rider: any) =>
        sendSokoniPush(admin, rider.user_id, {
          title: "I|ONE Boda Yangu • Oda ya kuchukua",
          body: "Ombi jipya la kuchukua " + productName + " limewasilishwa. Fungua Sokoni kuona safari.",
          url: "./?ionePushDestination=sokoni", tag: "ione-sokoni-delivery-" + created.data.id
        })
      );
      const sellerAlert = sendSokoniPush(admin, order.seller_user_id, {
        title: "I|ONE Sokoni • Boda imeombwa",
        body: "Mteja ameomba boda kwa oda ya " + productName + ".",
        url: "./?ionePushDestination=sokoni", tag: "ione-sokoni-delivery-" + created.data.id
      });
      const pushResults = await Promise.allSettled([...riderAlerts, sellerAlert]);
      await Promise.allSettled((availableRiders || []).map((rider: any) =>
        sendSokoniSms(admin, "delivery:" + created.data.id + ":rider:" + rider.user_id, "delivery_request_rider",
          rider.phone_number, "I|ONE Boda Yangu: Safari mpya ya " + productName + " inasubiri dereva. Fungua ione Sokoni kuona maelezo.")));
      const { data: sellerContact } = await admin.from("ione_sokoni_vendors").select("phone_number").eq("id", order.vendor_id).maybeSingle();
      await sendSokoniSms(admin, "delivery:" + created.data.id + ":seller:requested", "delivery_request_seller",
        sellerContact?.phone_number, "I|ONE Sokoni: Mteja ameomba boda kwa oda ya " + productName + ". Madereva walio tayari wamearifiwa.");
      const riderPushDelivered = pushResults.slice(0, riderAlerts.length).reduce((n: number, r: any) => n + (r.status === "fulfilled" ? Number(r.value || 0) : 0), 0);
      console.info("Sokoni delivery notification result:", { delivery_id: created.data.id, eligible_riders: (availableRiders || []).length, rider_push_delivered: riderPushDelivered, seller_push_delivered: pushResults[riderAlerts.length]?.status === "fulfilled" ? Number((pushResults[riderAlerts.length] as any).value || 0) : 0 });
      return json({ success: true, delivery: created.data, notified_riders: riderPushDelivered, eligible_riders: (availableRiders || []).length, message: "Ombi la boda limetumwa kwa Mama Sokoni na bodaboda walioidhinishwa na walio kwenye zamu. Ada ya delivery itaonyeshwa kando na lazima ikubaliwe na pande zote mbili." });
    }

    if (action === "passenger_trip_request") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const passengerName = String(body?.passenger_name || "").trim().replace(/\s+/g, " ");
      const passengerPhone = normalizeTanzaniaPhone(body?.passenger_phone);
      const pickupArea = String(body?.pickup_area || "").trim().slice(0, 180);
      const destinationArea = String(body?.destination_area || "").trim().slice(0, 180);
      const pickupLat = Number(body?.pickup_lat), pickupLng = Number(body?.pickup_lng);
      const note = String(body?.passenger_note || "").trim().slice(0, 500);
      if (passengerName.length < 2 || !validPhone(passengerPhone) || pickupArea.length < 2 || destinationArea.length < 2 ||
          !Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || pickupLat < -90 || pickupLat > 90 || pickupLng < -180 || pickupLng > 180) {
        return json({ success: false, error: "Enter your name, valid phone, pickup area, destination and share GPS for pickup." }, 400);
      }
      const saved = await admin.from("ione_sokoni_passenger_trips").insert({
        passenger_user_id: user.id, passenger_name: passengerName, passenger_phone: passengerPhone,
        pickup_area: pickupArea, pickup_lat: pickupLat, pickup_lng: pickupLng,
        destination_area: destinationArea, passenger_note: note, status: "requested"
      }).select("id,status,created_at").single();
      if (saved.error) return json({ success: false, error: "Could not send the passenger trip request. Please retry." }, 500);
      const notifiedAt = new Date().toISOString();
      const availableRiders: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: riderBatch, error: ridersError } = await admin.from("ione_sokoni_riders")
          .select("user_id,phone_number")
          .eq("status", "active").eq("access_payment_confirmed", true)
          .gt("access_expires_at", notifiedAt).eq("available", true)
          .not("user_id", "is", null).order("id", { ascending: true }).range(offset, offset + 999);
        if (ridersError) {
          console.warn("Passenger trip rider notification lookup failed:", ridersError.message);
          break;
        }
        availableRiders.push(...(riderBatch || []));
        if (!riderBatch || riderBatch.length < 1000) break;
      }
      const pushResults = await Promise.all(availableRiders.map((rider: any) =>
        sendSokoniPush(admin, rider.user_id, {
          title: "I|ONE Boda Yangu • Safari mpya", body: pickupArea + " → " + destinationArea + ". Fungua Sokoni kuona ombi.",
          url: "./?ionePushDestination=sokoni", tag: "ione-passenger-trip-" + saved.data.id
        })
      ));
      await Promise.allSettled(availableRiders.map((rider: any) =>
        sendSokoniSms(admin, "passenger-trip:" + saved.data.id + ":rider:" + rider.user_id, "passenger_trip_request_rider",
          rider.phone_number, "I|ONE Boda Yangu: Ombi jipya la safari " + pickupArea + " kwenda " + destinationArea + ". Fungua ione Sokoni.")));
      await sendSokoniSms(admin, "passenger-trip:" + saved.data.id + ":passenger:received", "passenger_trip_received",
        passengerPhone, "I|ONE Boda Yangu: Ombi lako la safari limepokelewa. Madereva walio tayari wamejulishwa.");
      const notifiedRiders = pushResults.reduce((sum: number, count: number) => sum + Number(count || 0), 0);
      console.info("Passenger trip push dispatch:", { trip_id: saved.data.id, eligible_riders: availableRiders.length, delivered_subscriptions: notifiedRiders });
      return json({
        success: true, trip: saved.data, eligible_riders: availableRiders.length, notified_riders: notifiedRiders,
        message: "Ombi la safari limetumwa. Bodaboda walioidhinishwa na walio kwenye zamu wamejulishwa; mtakubaliana nauli moja kwa moja."
      });
    }

    if (action === "passenger_trip_list") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const { data: rider } = await admin.from("ione_sokoni_riders").select("id").eq("user_id", user.id).maybeSingle();
      const [asPassenger, asRider] = await Promise.all([
        admin.from("ione_sokoni_passenger_trips").select("*").eq("passenger_user_id", user.id).order("created_at", { ascending: false }).limit(50),
        rider ? admin.from("ione_sokoni_passenger_trips").select("*").eq("rider_id", rider.id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null })
      ]);
      if (asPassenger.error || asRider.error) return json({ success: false, error: "Could not load passenger trips." }, 500);
      const combined = new Map<string, any>();
      for (const trip of [...(asPassenger.data || []), ...(asRider.data || [])]) combined.set(trip.id, trip);
      const trips = await Promise.all([...combined.values()].map(async (trip: any) => {
        const other = trip.rider_id ? await admin.from("ione_sokoni_riders").select("rider_name,phone_number").eq("id", trip.rider_id).maybeSingle() : { data: null };
        return { ...trip, is_passenger: trip.passenger_user_id === user.id, is_rider: !!rider?.id && trip.rider_id === rider.id,
          rider_name: other.data?.rider_name || null, rider_phone: other.data?.phone_number || null };
      }));
      return json({ success: true, trips });
    }

    if (action === "passenger_trip_accept") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const tripId = String(body?.trip_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(tripId)) return json({ success: false, error: "Invalid passenger trip." }, 400);
      const freshSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: rider } = await admin.from("ione_sokoni_riders").select("id,status,available,last_seen_at,access_payment_confirmed,access_expires_at").eq("user_id", user.id).maybeSingle();
      if (!rider || rider.status !== "active" || !rider.access_payment_confirmed || !rider.access_expires_at || Date.parse(rider.access_expires_at) <= Date.now() || !rider.available || !rider.last_seen_at || rider.last_seen_at < freshSince) {
        return json({ success: false, error: "Thibitisha kuwa upo tayari na uwashe upatikanaji kwanza." }, 403);
      }
      const accepted = await admin.from("ione_sokoni_passenger_trips").update({
        rider_id: rider.id, status: "accepted", updated_at: new Date().toISOString()
      }).eq("id", tripId).eq("status", "requested").is("rider_id", null).select("id").maybeSingle();
      if (accepted.error || !accepted.data) return json({ success: false, error: "Safari hii imechukuliwa na dereva mwingine au haipatikani." }, 409);
      const { data: trip } = await admin.from("ione_sokoni_passenger_trips").select("passenger_user_id,pickup_area,destination_area").eq("id", tripId).maybeSingle();
      if (trip) await sendSokoniPush(admin, trip.passenger_user_id, { title: "I|ONE Boda Yangu • Dereva amepatikana", body: "Dereva amekubali ombi lako. Jadilianeni nauli; upatikanaji wake utazimwa akianza safari.", url: "./?ionePushDestination=sokoni", tag: "ione-passenger-trip-" + tripId });
      return json({ success: true, message: "Umekubali ombi. Jadilianeni nauli; utazima upatikanaji unapokubali kuanza safari." });
    }

    if (action === "passenger_trip_offer_fare") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const tripId = String(body?.trip_id || "").trim();
      const fare = Number(body?.fare_tzs);
      if (!/^[0-9a-f-]{36}$/i.test(tripId) || !Number.isInteger(fare) || fare < 100 || fare > 500000) return json({ success: false, error: "Weka nauli halali kati ya TZS 100 na 500,000." }, 400);
      const { data: trip } = await admin.from("ione_sokoni_passenger_trips").select("*").eq("id", tripId).maybeSingle();
      if (!trip) return json({ success: false, error: "Safari haipatikani." }, 404);
      const { data: rider } = await admin.from("ione_sokoni_riders").select("id").eq("user_id", user.id).maybeSingle();
      const role = rider?.id === trip.rider_id ? "rider" : trip.passenger_user_id === user.id ? "passenger" : null;
      if (!role || !trip.rider_id || !["accepted", "fare_proposed", "fare_countered"].includes(trip.status) || trip.fare_agreed) return json({ success: false, error: "Huwezi kubadilisha nauli ya safari hii sasa." }, 403);
      if (trip.fare_proposed_by === role && trip.proposed_fare_tzs !== null) return json({ success: false, error: "Subiri upande mwingine ujibu nauli uliyopendekeza." }, 409);
      const saved = await admin.from("ione_sokoni_passenger_trips").update({
        proposed_fare_tzs: fare, fare_proposed_by: role, status: role === "rider" ? "fare_proposed" : "fare_countered",
        fare_agreed: false, updated_at: new Date().toISOString()
      }).eq("id", tripId).select("id").single();
      if (saved.error) return json({ success: false, error: "Could not save fare proposal." }, 500);
      const recipient = role === "rider" ? trip.passenger_user_id : (await admin.from("ione_sokoni_riders").select("user_id").eq("id", trip.rider_id).maybeSingle()).data?.user_id;
      if (recipient) await sendSokoniPush(admin, recipient, {
        title: "I|ONE Boda Yangu • Nauli imependekezwa", body: "Pendekezo la nauli ni TZS " + fare.toLocaleString("en-TZ") + ". Fungua Sokoni kujibu.",
        url: "./?ionePushDestination=sokoni", tag: "ione-passenger-fare-" + tripId
      });
      return json({ success: true, message: "Nauli imetumwa. Upande mwingine anaweza kukubali au kutoa pendekezo jingine." });
    }

    if (action === "passenger_trip_agree_fare") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const tripId = String(body?.trip_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(tripId)) return json({ success: false, error: "Invalid passenger trip." }, 400);
      const { data: trip } = await admin.from("ione_sokoni_passenger_trips").select("*").eq("id", tripId).maybeSingle();
      if (!trip || !["fare_proposed", "fare_countered"].includes(trip.status) || trip.fare_agreed || !trip.proposed_fare_tzs) return json({ success: false, error: "Hakuna nauli inayosubiri kukubaliwa." }, 409);
      const { data: rider } = await admin.from("ione_sokoni_riders").select("id").eq("user_id", user.id).maybeSingle();
      const role = rider?.id === trip.rider_id ? "rider" : trip.passenger_user_id === user.id ? "passenger" : null;
      if (!role || role === trip.fare_proposed_by) return json({ success: false, error: "Ni upande mwingine tu unaoweza kukubali nauli hii." }, 403);
      const saved = await admin.from("ione_sokoni_passenger_trips").update({ fare_agreed: true, status: "fare_agreed", updated_at: new Date().toISOString() }).eq("id", tripId).select("id").single();
      if (saved.error) return json({ success: false, error: "Could not confirm the fare." }, 500);
      const recipient = role === "rider" ? trip.passenger_user_id : (await admin.from("ione_sokoni_riders").select("user_id").eq("id", trip.rider_id).maybeSingle()).data?.user_id;
      if (recipient) await sendSokoniPush(admin, recipient, {
        title: "I|ONE Boda Yangu • Nauli imekubaliwa", body: "Nauli ya TZS " + Number(trip.proposed_fare_tzs).toLocaleString("en-TZ") + " imekubaliwa.",
        url: "./?ionePushDestination=sokoni", tag: "ione-passenger-fare-" + tripId
      });
      return json({ success: true, message: "Nauli imekubaliwa. Malipo yatafanyika moja kwa moja kati yenu." });
    }

    if (action === "passenger_trip_status") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const tripId = String(body?.trip_id || "").trim();
      const next = String(body?.status || "").trim();
      const { data: trip } = await admin.from("ione_sokoni_passenger_trips").select("*").eq("id", tripId).maybeSingle();
      if (!trip) return json({ success: false, error: "Safari haipatikani." }, 404);
      const { data: rider } = await admin.from("ione_sokoni_riders").select("id").eq("user_id", user.id).maybeSingle();
      let patch: any = {};
      if (rider?.id === trip.rider_id && next === "rider_ready" && trip.status === "fare_agreed" && trip.fare_agreed) patch = { status: "rider_ready" };
      else if (rider?.id === trip.rider_id && next === "picked_up" && ["rider_ready", "fare_agreed"].includes(trip.status) && trip.fare_agreed) patch = { status: "picked_up" };
      else if (rider?.id === trip.rider_id && next === "completed" && trip.status === "picked_up") patch = { status: "completed", completed_at: new Date().toISOString() };
      else if (trip.passenger_user_id === user.id && next === "completed" && trip.status === "picked_up") patch = { status: "completed", completed_at: new Date().toISOString() };
      else if (trip.passenger_user_id === user.id && next === "cancelled" && ["requested", "accepted", "fare_proposed", "fare_countered", "fare_agreed", "rider_ready"].includes(trip.status)) patch = { status: "cancelled" };
      else return json({ success: false, error: "Huwezi kubadilisha hali ya safari hii kwa hatua hiyo." }, 403);
      // Reserve the rider before starting the route, so a failed reservation cannot
      // leave the passenger trip showing "rider_ready" while the rider is still available.
      if (next === "rider_ready") {
        if (!rider || rider.id !== trip.rider_id) return json({ success: false, error: "Dereva wa safari hii hajathibitishwa." }, 403);
        const reserved = await admin.from("ione_sokoni_riders")
          .update({ available: false, updated_at: new Date().toISOString() })
          .eq("id", rider.id).eq("available", true).select("id").maybeSingle();
        if (reserved.error || !reserved.data) return json({ success: false, error: "Upatikanaji umebadilika. Sasisha safari na ujaribu tena." }, 409);
      }
      const saved = await admin.from("ione_sokoni_passenger_trips").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", tripId).select("id").single();
      if (saved.error) {
        if (next === "rider_ready" && rider?.id) {
          await admin.from("ione_sokoni_riders").update({ available: true, updated_at: new Date().toISOString() }).eq("id", rider.id).eq("available", false);
        }
        return json({ success: false, error: "Could not update passenger trip." }, 500);
      }
      if (next === "completed" && trip.rider_id) await admin.from("ione_sokoni_riders").update({ available: true, last_seen_at: new Date().toISOString(), location_lat: null, location_lng: null, location_updated_at: null, updated_at: new Date().toISOString() }).eq("id", trip.rider_id);
      if (next === "cancelled" && trip.rider_id && trip.status !== "picked_up") await admin.from("ione_sokoni_riders").update({ available: true, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", trip.rider_id);
      const recipient = ["rider_ready", "picked_up", "completed"].includes(next) ? trip.passenger_user_id : null;
      if (recipient) await sendSokoniPush(admin, recipient, {
        title: next === "rider_ready" ? "I|ONE Boda Yangu • Dereva yuko njiani" : next === "picked_up" ? "I|ONE Boda Yangu • Abiria amechukuliwa" : "I|ONE Boda Yangu • Safari imekamilika",
        body: next === "rider_ready" ? "Dereva amekubali safari na yuko njiani kukuchukua. Mpigie simu ikiwa unahitaji kuwasiliana naye." : next === "picked_up" ? "Dereva amekuchukua." : "Dereva amethibitisha safari imekamilika.",
        url: "./?ionePushDestination=sokoni", tag: "ione-passenger-trip-" + tripId
      });
      return json({ success: true, message: next === "rider_ready" ? "Umekubali safari na upatikanaji umezimwa hadi ukamilishe safari." : next === "picked_up" ? "Umemchukua abiria." : next === "completed" ? "Safari imekamilika. Upatikanaji wako umewashwa tena." : "Ombi la safari limeghairiwa." });
    }

    if (action === "rider_open_deliveries") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const { data: rider, error: riderError } = await admin.from("ione_sokoni_riders").select("id,status,available,access_payment_confirmed,access_expires_at").eq("user_id", user.id).maybeSingle();
      if (riderError || !rider || rider.status !== "active" || !rider.access_payment_confirmed || !rider.access_expires_at || Date.parse(rider.access_expires_at) <= Date.now()) {
        return json({ success: false, error: "Authority Press must approve your active Boda Yangu access before viewing trips." }, 403);
      }
      // Keep accepted passenger negotiation in the central board after availability
      // is switched off; only available riders see unassigned work.
      const [deliveriesResult, openPassengerResult, myPassengerResult] = await Promise.all([
        rider.available
          ? admin.from("ione_sokoni_deliveries").select("id,order_id,vendor_id,pickup_location,dropoff_location,dropoff_lat,dropoff_lng,created_at").eq("status", "requested").is("rider_user_id", null).order("created_at", { ascending: true }).limit(100)
          : Promise.resolve({ data: [], error: null }),
        rider.available
          ? admin.from("ione_sokoni_passenger_trips").select("id,passenger_name,passenger_phone,pickup_area,pickup_lat,pickup_lng,destination_area,passenger_note,created_at,status,rider_id,proposed_fare_tzs,fare_proposed_by,fare_agreed")
            .eq("status", "requested").is("rider_id", null).order("created_at", { ascending: true }).limit(100)
          : Promise.resolve({ data: [], error: null }),
        admin.from("ione_sokoni_passenger_trips").select("id,passenger_name,passenger_phone,pickup_area,pickup_lat,pickup_lng,destination_area,passenger_note,created_at,status,rider_id,proposed_fare_tzs,fare_proposed_by,fare_agreed")
          .eq("rider_id", rider.id).in("status", ["accepted", "fare_proposed", "fare_countered", "fare_agreed", "rider_ready", "picked_up"]).order("created_at", { ascending: false }).limit(50)
      ]);
      if (deliveriesResult.error || openPassengerResult.error || myPassengerResult.error) return json({ success: false, error: "Could not load delivery and passenger requests." }, 500);
      const passengerTrips = [...(openPassengerResult.data || []), ...(myPassengerResult.data || [])];
      const openRows=deliveriesResult.data||[], orderIds=[...new Set(openRows.map((d:any)=>d.order_id).filter(Boolean))], vendorIds=[...new Set(openRows.map((d:any)=>d.vendor_id).filter(Boolean))];
      const [orders,vendors]=await Promise.all([
        orderIds.length?admin.from("ione_sokoni_orders").select("id,product_name,quantity,unit_name,buyer_name,buyer_phone").in("id",orderIds):Promise.resolve({data:[],error:null}),
        vendorIds.length?admin.from("ione_sokoni_vendors").select("id,vendor_name,phone_number").in("id",vendorIds):Promise.resolve({data:[],error:null})
      ]);
      if(orders.error||vendors.error)return json({success:false,error:"Could not load product details for delivery requests."},500);
      const orderMap=new Map((orders.data||[]).map((o:any)=>[o.id,o])),vendorMap=new Map((vendors.data||[]).map((v:any)=>[v.id,v]));
      const deliveries=openRows.map((d:any)=>({ ...d, ...(orderMap.get(d.order_id)||{}), ...(vendorMap.get(d.vendor_id)||{}), id: d.id, order_id: d.order_id, vendor_id: d.vendor_id, created_at: d.created_at }));
      return json({ success: true, deliveries, passenger_trips: passengerTrips });
    }

    if (action === "accept_delivery") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const { data: rider, error: riderError } = await admin.from("ione_sokoni_riders").select("id,status,available,access_payment_confirmed,access_expires_at").eq("user_id", user.id).maybeSingle();
      if (riderError || !rider || rider.status !== "active" || !rider.available || !rider.access_payment_confirmed || !rider.access_expires_at || Date.parse(rider.access_expires_at) <= Date.now()) return json({ success: false, error: "Washa upatikanaji na hakikisha ruhusa ya Boda Yangu bado inatumika." }, 403);
      const active = await admin.from("ione_sokoni_deliveries").select("id,status").eq("rider_user_id", user.id).in("status", ["accepted", "picked_up", "delivered"]);
      if (active.error) return json({ success: false, error: "Imeshindikana kuthibitisha safari nyingine." }, 500);
      if ((active.data || []).length) return json({ success: false, error: "Maliza safari uliyoanza kabla ya kukubali nyingine." }, 409);
      const now = new Date().toISOString();
      const reserved = await admin.from("ione_sokoni_riders").update({ available: false, updated_at: now }).eq("id", rider.id).eq("available", true).select("id").maybeSingle();
      if (reserved.error || !reserved.data) return json({ success: false, error: "Upatikanaji umebadilika. Sasisha orodha na ujaribu tena." }, 409);
      const claimed = await admin.from("ione_sokoni_deliveries").update({ rider_user_id: user.id, status: "accepted", route_accepted: true, updated_at: now }).eq("id", deliveryId).eq("status", "requested").is("rider_user_id", null).select("id,order_id,pickup_location,pickup_lat,pickup_lng,dropoff_location,dropoff_lat,dropoff_lng,status,route_accepted").maybeSingle();
      if (claimed.error || !claimed.data) {
        await admin.from("ione_sokoni_riders").update({ available: true, last_seen_at: now, updated_at: now }).eq("id", rider.id).eq("available", false);
        return json({ success: false, error: "Safari hii imechukuliwa na dereva mwingine. Unaweza kuchagua safari nyingine." }, 409);
      }
      const { data: order } = await admin.from("ione_sokoni_orders").select("product_name").eq("id", claimed.data.order_id).maybeSingle();
      const { data: delivery } = await admin.from("ione_sokoni_deliveries").select("buyer_user_id,seller_user_id").eq("id", deliveryId).maybeSingle();
      if (delivery) await Promise.allSettled([delivery.buyer_user_id, delivery.seller_user_id].filter(Boolean).map((recipient: string) => sendSokoniPush(admin, recipient, {
        title: "I|ONE Sokoni • Dereva ameanza safari", body: "Dereva amekubali kupeleka " + String(order?.product_name || "bidhaa yako") + ". Anaweza kuwasiliana nawe kwa simu.",
        url: "./?ionePushDestination=sokoni&ioneDeliveryId=" + deliveryId, tag: "ione-delivery-started-" + deliveryId
      })));
      return json({ success: true, delivery: claimed.data, message: "Umeanza safari. Upatikanaji wako utawashwa tena utakapobonyeza Kazi Imekamilika." });
    }

    if (action === "set_delivery_fee") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const fee = Number(body?.delivery_fee_tzs);
      if (!Number.isSafeInteger(fee) || fee < 0 || fee > 10000000) return json({ success: false, error: "Enter a valid delivery fee in TZS." }, 400);
      const { data: delivery, error } = await admin.from("ione_sokoni_deliveries").select("id,status,rider_user_id,buyer_user_id,seller_user_id,route_accepted").eq("id", deliveryId).maybeSingle();
      if (error || !delivery || delivery.rider_user_id !== user.id || delivery.status !== "accepted" || delivery.route_accepted === true) {
        return json({ success: false, error: "Only the assigned rider can set the fee before pickup." }, 403);
      }
      const saved=await admin.from("ione_sokoni_deliveries").update({delivery_fee_tzs:fee,buyer_fee_confirmed:false,seller_fee_confirmed:true,updated_at:new Date().toISOString()}).eq("id",delivery.id).eq("status","accepted").eq("rider_user_id",user.id).select("id").maybeSingle();
      if(saved.error||!saved.data)return json({success:false,error:"Could not save the delivery fee."},500);
      await sendSokoniPush(admin,delivery.buyer_user_id,{title:"I|ONE Sokoni • Ada ya bodaboda",body:"Dereva amependekeza TZS "+fee.toLocaleString("en-TZ")+". Fungua Sokoni ukubali au upendekeze ada nyingine.",url:"./?ionePushDestination=sokoni&ioneDeliveryId="+delivery.id,tag:"ione-delivery-fee-proposed-"+delivery.id});
      return json({success:true,message:"Ada imetumwa kwa mnunuzi pekee. Subiri akubali au atoe pendekezo jingine."});
    }

    if(action==="counter_delivery_fee"){
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your session is not ready. Reload and try again."},401);
      const deliveryId=String(body?.delivery_id||"").trim(),fee=Number(body?.delivery_fee_tzs);
      if(!/^[0-9a-f-]{36}$/i.test(deliveryId)||!Number.isSafeInteger(fee)||fee<0||fee>10000000)return json({success:false,error:"Enter a valid delivery fee in TZS."},400);
      const {data:d,error}=await admin.from("ione_sokoni_deliveries").select("id,status,buyer_user_id,rider_user_id,route_accepted").eq("id",deliveryId).maybeSingle();
      if(error||!d||d.buyer_user_id!==user.id||d.status!=="accepted"||d.route_accepted)return json({success:false,error:"Only the buyer can counter the fee before the rider starts the route."},403);
      const saved=await admin.from("ione_sokoni_deliveries").update({delivery_fee_tzs:fee,buyer_fee_confirmed:true,seller_fee_confirmed:false,updated_at:new Date().toISOString()}).eq("id",d.id).eq("status","accepted").eq("route_accepted",false).select("id").maybeSingle();
      if(saved.error||!saved.data)return json({success:false,error:"Could not save your counteroffer."},500);
      if(d.rider_user_id)await sendSokoniPush(admin,d.rider_user_id,{title:"I|ONE Sokoni • Mnunuzi amependekeza ada",body:"Mnunuzi amependekeza TZS "+fee.toLocaleString("en-TZ")+". Fungua Sokoni ukubali au utume ada nyingine.",url:"./?ionePushDestination=sokoni&ioneDeliveryId="+d.id,tag:"ione-delivery-fee-proposed-"+d.id});
      return json({success:true,message:"Pendekezo limetumwa kwa dereva pekee. Subiri akubali au atume pendekezo jingine."});
    }

    if (action === "confirm_delivery_fee") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const {data:d,error}=await admin.from("ione_sokoni_deliveries").select("id,status,buyer_user_id,rider_user_id,seller_fee_confirmed,buyer_fee_confirmed,delivery_fee_tzs").eq("id",deliveryId).maybeSingle();
      if(error||!d||d.status!=="accepted"||d.delivery_fee_tzs===null||(d.buyer_user_id!==user.id&&d.rider_user_id!==user.id))return json({success:false,error:"Ada lazima iwe imependekezwa kwanza; makubaliano ni kati ya mnunuzi na dereva."},403);
      const isBuyer=d.buyer_user_id===user.id,isRider=d.rider_user_id===user.id;
      if(isBuyer&&!d.seller_fee_confirmed)return json({success:false,error:"Dereva anasubiri kujibu pendekezo lako la ada."},409);
      if(isRider&&d.seller_fee_confirmed)return json({success:false,error:"Subiri mnunuzi ajibu ada uliyopendekeza."},409);
      const saved=await admin.from("ione_sokoni_deliveries").update({... (isBuyer?{buyer_fee_confirmed:true}:{seller_fee_confirmed:true}),updated_at:new Date().toISOString()}).eq("id",d.id).eq("status","accepted").select("id").maybeSingle();
      if(saved.error||!saved.data)return json({success:false,error:"Could not confirm the delivery fee."},500);
      const {data:latest}=await admin.from("ione_sokoni_deliveries").select("buyer_fee_confirmed,seller_fee_confirmed").eq("id",d.id).single();
      const agreed=!!latest?.buyer_fee_confirmed&&!!latest?.seller_fee_confirmed,recipient=isBuyer?d.rider_user_id:d.buyer_user_id;
      if(recipient)await sendSokoniPush(admin,recipient,{title:agreed?"I|ONE Sokoni • Ada imekubaliwa":"I|ONE Sokoni • Jibu la ada",body:agreed?"Mnunuzi na dereva wamekubaliana ada. Dereva anaweza kuanza safari.":"Jibu la ada limehifadhiwa. Fungua Sokoni kuona hali.",url:"./?ionePushDestination=sokoni&ioneDeliveryId="+d.id,tag:"ione-delivery-fee-"+d.id});
      return json({success:true,both_confirmed:agreed,message:agreed?"Ada imekubaliwa na mnunuzi na dereva. Dereva anaweza kuanza safari sasa.":"Jibu lako limehifadhiwa."});
    }

    if (action === "accept_delivery_route") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const { data: rider, error: riderError } = await admin.from("ione_sokoni_riders").select("id,status,available,access_payment_confirmed,access_expires_at").eq("user_id", user.id).maybeSingle();
      if (riderError || !rider || rider.status !== "active" || !rider.available || !rider.access_payment_confirmed || !rider.access_expires_at || Date.parse(rider.access_expires_at) <= Date.now()) return json({ success: false, error: "Washa upatikanaji na hakikisha ruhusa ya dereva bado inatumika." }, 403);
      const { data: delivery, error } = await admin.from("ione_sokoni_deliveries").select("*").eq("id", deliveryId).eq("rider_user_id", user.id).maybeSingle();
      if (error || !delivery || delivery.status !== "accepted" || delivery.route_accepted || !delivery.buyer_fee_confirmed || !delivery.seller_fee_confirmed || delivery.delivery_fee_tzs === null) return json({ success: false, error: "Safari inaweza kukubaliwa baada tu ya mnunuzi na Mama Sokoni kukubali ada." }, 409);
      const [activeDelivery, activePassenger] = await Promise.all([admin.from("ione_sokoni_deliveries").select("id,status,route_accepted").eq("rider_user_id", user.id).in("status", ["accepted", "picked_up", "delivered"]),admin.from("ione_sokoni_passenger_trips").select("id,status").eq("rider_id", rider.id).in("status", ["rider_ready", "picked_up"])]);
      if (activeDelivery.error || activePassenger.error) return json({ success: false, error: "Imeshindikana kuthibitisha safari nyingine." }, 500);
      if ((activeDelivery.data || []).some((d: any) => d.id !== delivery.id && (d.status === "picked_up" || d.status === "delivered" || (d.status === "accepted" && d.route_accepted))) || activePassenger.data?.length) return json({ success: false, error: "Maliza safari nyingine uliyoanza kwanza." }, 409);
      const reserved = await admin.from("ione_sokoni_riders").update({ available: false, updated_at: new Date().toISOString() }).eq("id", rider.id).eq("available", true).select("id").maybeSingle();
      if (reserved.error || !reserved.data) return json({ success: false, error: "Upatikanaji wa dereva umebadilika. Sasisha kisha ujaribu tena." }, 409);
      const saved = await admin.from("ione_sokoni_deliveries").update({ route_accepted: true, updated_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "accepted").eq("route_accepted", false).eq("buyer_fee_confirmed", true).eq("seller_fee_confirmed", true).select("id").maybeSingle();
      if (saved.error || !saved.data) { await admin.from("ione_sokoni_riders").update({ available: true, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", rider.id).eq("available", false); return json({ success: false, error: "Safari haikuhifadhiwa. Jaribu tena." }, 409); }
      for (const recipient of [delivery.buyer_user_id, delivery.seller_user_id]) if (recipient) await sendSokoniPush(admin, recipient, { title: "I|ONE Sokoni • Dereva amekubali safari", body: "Ada imekubaliwa. Dereva amekubali safari na anaelekea kuchukua bidhaa.", url: "./?ionePushDestination=sokoni", tag: "ione-delivery-route-" + delivery.id });
      return json({ success: true, message: "Umekubali safari. Upatikanaji umezimwa hadi ukamilishe uwasilishaji." });
    }

    if (action === "update_delivery_status") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const next = String(body?.status || "").trim();
      if (!["picked_up", "delivered"].includes(next)) return json({ success: false, error: "Invalid trip status." }, 400);
      const { data: delivery, error } = await admin.from("ione_sokoni_deliveries").select("*")
        .eq("id", deliveryId).maybeSingle();
      if (error || !delivery || delivery.rider_user_id !== user.id) return json({ success: false, error: "This trip is not assigned to your rider account." }, 404);
      if (next === "picked_up" && (delivery.status !== "accepted" || !delivery.route_accepted)) {
        return json({ success: false, error: "Anza safari kabla ya kuthibitisha kuwa umechukua bidhaa." }, 409);
      }
      if (next === "delivered" && delivery.status !== "picked_up") return json({ success: false, error: "Mark the parcel picked up before marking it delivered." }, 409);
      const updated = await admin.from("ione_sokoni_deliveries").update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", delivery.id).eq("status", delivery.status).eq("rider_user_id", user.id).select("id").maybeSingle();
      if (updated.error || !updated.data) return json({ success: false, error: "Trip status changed elsewhere. Refresh and try again." }, 409);
      for (const recipient of [delivery.buyer_user_id, delivery.seller_user_id]) if (recipient) await sendSokoniPush(admin, recipient, { title: next === "picked_up" ? "I|ONE Sokoni • Bidhaa imechukuliwa" : "I|ONE Sokoni • Bidhaa imefikishwa", body: next === "picked_up" ? "Dereva amechukua bidhaa na yuko njiani." : "Dereva amesema bidhaa imefikishwa.", url: "./?ionePushDestination=sokoni&ioneDeliveryId=" + delivery.id, tag: "ione-delivery-status-" + delivery.id + "-" + next });
      const [{ data: orderContact }, { data: vendorContact }] = await Promise.all([
        admin.from("ione_sokoni_orders").select("buyer_phone,product_name").eq("id", delivery.order_id).maybeSingle(),
        admin.from("ione_sokoni_vendors").select("phone_number").eq("id", delivery.vendor_id).maybeSingle()
      ]);
      const smsStatusMessage = next === "picked_up"
        ? "I|ONE Sokoni: Dereva amechukua " + String(orderContact?.product_name || "bidhaa") + " na yuko njiani."
        : "I|ONE Sokoni: Uwasilishaji wa " + String(orderContact?.product_name || "bidhaa") + " umewekwa kuwa umekamilika na dereva.";
      await Promise.allSettled([
        sendSokoniSms(admin, "delivery:" + delivery.id + ":buyer:" + next, "delivery_" + next + "_buyer", orderContact?.buyer_phone, smsStatusMessage),
        sendSokoniSms(admin, "delivery:" + delivery.id + ":seller:" + next, "delivery_" + next + "_seller", vendorContact?.phone_number, smsStatusMessage)
      ]);
      return json({ success: true, message: next === "picked_up" ? "Umechukua bidhaa. Endelea kumfikishia mnunuzi." : "Umefikisha bidhaa. Bonyeza Kazi Imekamilika ili uwe tayari kwa safari nyingine." });
    }

    if (action === "update_rider_location") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const lat = Number(body?.latitude);
      const lng = Number(body?.longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return json({ success: false, error: "Invalid GPS coordinates." }, 400);
      }
      const { data: delivery, error } = await admin.from("ione_sokoni_deliveries").select("id,status,rider_user_id,buyer_fee_confirmed,seller_fee_confirmed")
        .eq("id", deliveryId).maybeSingle();
      if (error || !delivery || delivery.rider_user_id !== user.id ||
          !["accepted", "picked_up", "delivered"].includes(delivery.status) ||
          !delivery.buyer_fee_confirmed || !delivery.seller_fee_confirmed) {
        return json({ success: false, error: "Live location is available only on your assigned trip after the delivery fee is confirmed." }, 403);
      }
      const now = new Date().toISOString();
      const saved = await admin.from("ione_sokoni_deliveries").update({
        rider_lat: lat, rider_lng: lng, location_updated_at: now, updated_at: now
      }).eq("id", delivery.id).eq("rider_user_id", user.id).in("status", ["accepted", "picked_up"]).select("id").maybeSingle();
      if (saved.error || !saved.data) return json({ success: false, error: "Trip is no longer active; live location sharing has stopped." }, 409);
      await admin.from("ione_sokoni_riders").update({
        location_lat: lat, location_lng: lng, location_updated_at: now, last_seen_at: now, updated_at: now
      }).eq("user_id", user.id);
      return json({ success: true, updated_at: now });
    }

    if (action === "my_deliveries") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const [buyer, seller, rider] = await Promise.all([
        admin.from("ione_sokoni_deliveries").select("*").eq("buyer_user_id", user.id).order("created_at", { ascending: false }).limit(50),
        admin.from("ione_sokoni_deliveries").select("*").eq("seller_user_id", user.id).order("created_at", { ascending: false }).limit(50),
        admin.from("ione_sokoni_deliveries").select("*").eq("rider_user_id", user.id).order("created_at", { ascending: false }).limit(50)
      ]);
      if (buyer.error || seller.error || rider.error) return json({ success: false, error: "Could not load your delivery trips." }, 500);
      const map = new Map<string, any>();
      [...(buyer.data || []), ...(seller.data || []), ...(rider.data || [])].forEach((row: any) => map.set(row.id, row));
      const rows=[...map.values()],orderIds=[...new Set(rows.map((d:any)=>d.order_id).filter(Boolean))],vendorIds=[...new Set(rows.map((d:any)=>d.vendor_id).filter(Boolean))],riderIds=[...new Set(rows.map((d:any)=>d.rider_user_id).filter(Boolean))];
      const [ordersResult,vendorsResult,ridersResult]=await Promise.all([
        orderIds.length?admin.from("ione_sokoni_orders").select("id,product_name,quantity,unit_name,buyer_name,buyer_phone").in("id",orderIds):Promise.resolve({data:[],error:null}),
        vendorIds.length?admin.from("ione_sokoni_vendors").select("id,phone_number,vendor_name").in("id",vendorIds):Promise.resolve({data:[],error:null}),
        riderIds.length?admin.from("ione_sokoni_riders").select("user_id,rider_name,phone_number").in("user_id",riderIds):Promise.resolve({data:[],error:null})
      ]);
      if(ordersResult.error||vendorsResult.error||ridersResult.error)return json({success:false,error:"Could not load delivery contact details."},500);
      const orderMap=new Map((ordersResult.data||[]).map((x:any)=>[x.id,x])),vendorMap=new Map((vendorsResult.data||[]).map((x:any)=>[x.id,x])),riderMap=new Map((ridersResult.data||[]).map((x:any)=>[x.user_id,x]));
      const nowMs = Date.now();
      const deliveries = rows.map((d: any) => {
        const fresh = ["accepted", "picked_up"].includes(d.status) && !!d.location_updated_at && nowMs - Date.parse(d.location_updated_at) <= 120000;
        const order=orderMap.get(d.order_id)||{},vendor=vendorMap.get(d.vendor_id)||{},rider=riderMap.get(d.rider_user_id)||{};
        return {
          id: d.id, order_id: d.order_id, is_buyer: d.buyer_user_id === user.id, is_seller: d.seller_user_id === user.id,
          is_rider: d.rider_user_id === user.id, rider_assigned: !!d.rider_user_id,
          rider_user_id:d.rider_user_id,product_name:order.product_name||"Bidhaa ya Sokoni",quantity:order.quantity??null,unit_name:order.unit_name||"",buyer_name:order.buyer_name||"",buyer_phone:order.buyer_phone||"",seller_phone:vendor.phone_number||"",seller_name:vendor.vendor_name||"",rider_name:rider.rider_name||"",rider_phone:rider.phone_number||"",
          pickup_location: d.pickup_location, pickup_lat: d.pickup_lat, pickup_lng: d.pickup_lng,
          dropoff_location: d.dropoff_location, dropoff_lat: d.dropoff_lat, dropoff_lng: d.dropoff_lng,
          delivery_fee_tzs: d.delivery_fee_tzs, buyer_fee_confirmed: d.buyer_fee_confirmed,
          seller_fee_confirmed: d.seller_fee_confirmed, route_accepted: d.route_accepted === true, status: d.status,
          rider_lat: fresh ? d.rider_lat : null, rider_lng: fresh ? d.rider_lng : null,
          location_updated_at: d.location_updated_at, location_stale: !fresh, created_at: d.created_at
        };
      }).sort((a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return json({ success: true, deliveries });
    }

    if (action === "complete_delivery") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const deliveryId = String(body?.delivery_id || "").trim();
      const { data: delivery, error } = await admin.from("ione_sokoni_deliveries").select("id,status,buyer_user_id,seller_user_id,rider_user_id").eq("id", deliveryId).maybeSingle();
      const isRider = !!delivery && delivery.rider_user_id === user.id;
      const isBuyerOrSeller = !!delivery && (delivery.buyer_user_id === user.id || delivery.seller_user_id === user.id);
      const allowedStatus = !!delivery && (delivery.status === "delivered" || (isRider && delivery.status === "picked_up"));
      if (error || !delivery || !allowedStatus || (!isRider && !isBuyerOrSeller)) return json({ success: false, error: "Safari lazima iwe imefikishwa kabla ya kufungwa." }, 403);
      const done = await admin.from("ione_sokoni_deliveries").update({ status: "completed", rider_lat: null, rider_lng: null, location_updated_at: null, updated_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", delivery.status).select("id").maybeSingle();
      if (done.error || !done.data) return json({ success: false, error: "Safari haikukamilika. Sasisha kisha ujaribu tena." }, 500);
      if (delivery.rider_user_id) await admin.from("ione_sokoni_riders").update({ available: true, last_seen_at: new Date().toISOString(), location_lat: null, location_lng: null, location_updated_at: null, updated_at: new Date().toISOString() }).eq("user_id", delivery.rider_user_id);
      for (const recipient of [delivery.buyer_user_id, delivery.seller_user_id]) if (recipient && recipient !== user.id) await sendSokoniPush(admin, recipient, { title: "I|ONE Sokoni • Uwasilishaji umekamilika", body: "Dereva amekamilisha safari ya bidhaa yako.", url: "./?ionePushDestination=sokoni", tag: "ione-delivery-done-" + delivery.id });
      return json({ success: true, message: "Safari imekamilika. Upatikanaji wako umewashwa tena." });
    }

    if (action === "save_vendor_presence") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      if (typeof body?.is_at_market !== "boolean") return json({ success: false, error: "Choose whether you are at the market." }, 400);
      const { data: vendor, error: vendorError } = await admin.from("ione_sokoni_vendors")
        .select("id,status,paid_until").eq("user_id", user.id).maybeSingle();
      if (vendorError || !vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now()) {
        return json({ success: false, error: "Active Sokoni vendor access is required." }, 403);
      }
      const saved = await admin.from("ione_sokoni_vendors").update({
        is_at_market: body.is_at_market, presence_updated_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("id", vendor.id).select("is_at_market,presence_updated_at").maybeSingle();
      if (saved.error || !saved.data) return json({ success: false, error: "Could not update your market status." }, 500);
      return json({ success: true, ...saved.data, message: saved.data.is_at_market ? "Hali yako: Nipo sokoni." : "Hali yako: Sipo sokoni." });
    }

    if (action === "save_vendor_profile") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your session is not ready. Reload and try again." }, 401);
      const mime = String(body?.mime_type || "").toLowerCase();
      const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "";
      const encoded = String(body?.image_base64 || "");
      if (!extension || !encoded || encoded.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        return json({ success: false, error: "Choose a JPG, PNG or WebP profile photo under 2 MB." }, 400);
      }
      const { data: vendor, error: vendorError } = await admin.from("ione_sokoni_vendors")
        .select("id,status,paid_until,profile_photo_path").eq("user_id", user.id).maybeSingle();
      if (vendorError || !vendor || vendor.status !== "active" || Date.parse(vendor.paid_until) <= Date.now()) {
        return json({ success: false, error: "Active Sokoni vendor access is required." }, 403);
      }
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)); }
      catch (_) { return json({ success: false, error: "The profile image could not be read." }, 400); }
      if (!bytes.length || bytes.length > 2097152) return json({ success: false, error: "Profile photos must be 2 MB or smaller." }, 400);
      const path = user.id + "/" + crypto.randomUUID() + "." + extension;
      const uploaded = await admin.storage.from("ione-sokoni-vendor-profiles").upload(path, bytes, { contentType: mime, upsert: false });
      if (uploaded.error) return json({ success: false, error: "Could not upload the profile photo. Try again." }, 500);
      const saved = await admin.from("ione_sokoni_vendors").update({ profile_photo_path: path, updated_at: new Date().toISOString() })
        .eq("id", vendor.id).select("id").maybeSingle();
      if (saved.error || !saved.data) {
        await admin.storage.from("ione-sokoni-vendor-profiles").remove([path]);
        return json({ success: false, error: "Could not save the profile photo." }, 500);
      }
      if (vendor.profile_photo_path) await admin.storage.from("ione-sokoni-vendor-profiles").remove([vendor.profile_photo_path]);
      const signed = await admin.storage.from("ione-sokoni-vendor-profiles").createSignedUrl(path, 3600);
      return json({ success: true, profile_photo_url: signed.error ? null : signed.data.signedUrl, message: "Picha ya wasifu imehifadhiwa." });
    }

    if (action === "public_vendors") {
      const { data, error } = await admin.from("ione_sokoni_vendors")
        .select("id,vendor_name,paid_until,profile_photo_path,is_at_market,presence_updated_at").eq("status", "active").gt("paid_until", new Date().toISOString())
        .order("vendor_name", { ascending: true }).limit(200);
      if (error) return json({ success: false, error: "The market is temporarily unavailable." }, 500);
      const vendors = await Promise.all((data || []).map(async (vendor: any) => {
        let profile_photo_url = null;
        if (vendor.profile_photo_path) {
          const signed = await admin.storage.from("ione-sokoni-vendor-profiles").createSignedUrl(vendor.profile_photo_path, 3600);
          if (!signed.error) profile_photo_url = signed.data.signedUrl;
        }
        return { id: vendor.id, vendor_name: vendor.vendor_name, paid_until: vendor.paid_until,
          profile_photo_url, is_at_market: vendor.is_at_market === true, presence_updated_at: vendor.presence_updated_at || null };
      }));
      return json({ success: true, vendors });
    }

    if (action === "authority_dashboard" || action === "approve" || action === "reject" || action === "approve_rider" || action === "reject_rider" || action === "set_rider_access") {
      const rawSession = body?.authority_session || req.headers.get("x-ione-authority-session");
      if (!(await validAuthoritySession(admin, rawSession))) {
        return json({ success: false, error: "Authority Press session expired. Unlock Authority Press again." }, 401);
      }
      if (action === "set_rider_access") {
        const riderId = String(body?.rider_id || "").trim();
        const grant = body?.grant === true;
        if (!/^[0-9a-f-]{36}$/i.test(riderId)) return json({ success: false, error: "Invalid rider record." }, 400);
        const { data: rider, error: riderError } = await admin.from("ione_sokoni_riders").select("id,rider_name,status").eq("id", riderId).maybeSingle();
        if (riderError || !rider) return json({ success: false, error: "Verified rider record not found." }, 404);
        const now = new Date();
        let patch: Record<string, unknown>;
        if (grant) {
          const startDate = String(body?.start_date || ""), expiryDate = String(body?.expiry_date || "");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || expiryDate < startDate) return json({ success: false, error: "Enter valid access start and expiry dates." }, 400);
          const start = new Date(startDate + "T00:00:00.000Z"), expiry = new Date(expiryDate + "T23:59:59.999Z");
          if (!Number.isFinite(start.getTime()) || !Number.isFinite(expiry.getTime()) || start.toISOString().slice(0,10) !== startDate || expiry.toISOString().slice(0,10) !== expiryDate) return json({ success: false, error: "The access dates are invalid." }, 400);
          if (expiry.getTime() <= now.getTime()) return json({ success: false, error: "The expiry date must be today or a future date." }, 400);
          patch = { access_payment_confirmed: true, access_started_at: start.toISOString(), access_expires_at: expiry.toISOString(), access_amount_tzs: 5000, access_note: "Manually granted by Authority Press", updated_at: now.toISOString() };
        } else {
          patch = { access_payment_confirmed: false, available: false, last_seen_at: null, location_lat: null, location_lng: null, location_updated_at: null, access_note: "Access locked by Authority Press", updated_at: now.toISOString() };
        }
        const saved = await admin.from("ione_sokoni_riders").update(patch).eq("id", riderId).select("id,rider_name,access_payment_confirmed,access_started_at,access_expires_at").single();
        if (saved.error) return json({ success: false, error: "Could not save rider access dates and status." }, 500);
        return json({ success: true, rider: saved.data, message: grant ? "Boda Yangu access granted and dates saved." : "Boda Yangu access locked. The rider is now off duty." });
      }

      if (action === "authority_dashboard") {
        const nowIso = new Date().toISOString();
        const [requestsResult, pendingCount, activeCount, expiredCount, vendorListResult, riderAppsResult, riderPendingCount, verifiedRiderCount, ridersResult] = await Promise.all([
          admin.from("ione_sokoni_payment_requests")
            .select("id,user_id,vendor_id,vendor_name,phone_number,amount_tzs,status,created_at,approved_at,admin_note")
            .eq("status", "pending").order("created_at", { ascending: true }).limit(500),
          admin.from("ione_sokoni_payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
          admin.from("ione_sokoni_vendors").select("id", { count: "exact", head: true }).eq("status", "active").gt("paid_until", nowIso),
          admin.from("ione_sokoni_vendors").select("id", { count: "exact", head: true }).lte("paid_until", nowIso),
          admin.from("ione_sokoni_vendors").select("id,vendor_name,phone_number,status,paid_until,approved_at")
            .order("paid_until", { ascending: false }).limit(200),
          admin.from("ione_sokoni_rider_applications")
            .select("id,user_id,rider_name,phone_number,identity_document_type,identity_document_path,motorcycle_plate,rider_group_name,chairman_phone,status,created_at,reviewed_at,reviewed_by,admin_note")
            .order("created_at", { ascending: false }).limit(500),
          admin.from("ione_sokoni_rider_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
          admin.from("ione_sokoni_riders").select("id", { count: "exact", head: true }).eq("status", "active"),
          admin.from("ione_sokoni_riders").select("id,user_id,rider_name,phone_number,status,available,access_payment_confirmed,access_started_at,access_expires_at,access_amount_tzs,access_note,verified_at,created_at").order("created_at", { ascending: false }).limit(500)
        ]);
        if (requestsResult.error || pendingCount.error || activeCount.error || expiredCount.error || vendorListResult.error || riderAppsResult.error || riderPendingCount.error || verifiedRiderCount.error || ridersResult.error) {
          return json({ success: false, error: "Could not load Sokoni dashboard data." }, 500);
        }
        let confirmedPayments = 0;
        let totalRevenueTzs = 0;
        for (let offset = 0; ; offset += 1000) {
          const page = await admin.from("ione_sokoni_payment_requests").select("amount_tzs")
            .eq("status", "approved").order("created_at", { ascending: true }).range(offset, offset + 999);
          if (page.error) return json({ success: false, error: "Could not calculate confirmed Sokoni payments." }, 500);
          const rows = page.data || [];
          confirmedPayments += rows.length;
          totalRevenueTzs += rows.reduce((sum: number, p: any) => sum + Number(p.amount_tzs || 0), 0);
          if (rows.length < 1000) break;
        }
        const riderApplications = await Promise.all((riderAppsResult.data || []).map(async (application: any) => {
          let identityDocumentUrl = null;
          let profilePhotoUrl = null;
          if (application.profile_path) profilePhotoUrl = admin.storage.from("ione-sokoni-rider-profiles").getPublicUrl(application.profile_path).data?.publicUrl || null;
          if (application.identity_document_path) {
            const signed = await admin.storage.from("ione-sokoni-rider-documents")
              .createSignedUrl(application.identity_document_path, 600);
            if (!signed.error) identityDocumentUrl = signed.data.signedUrl;
          }
          const { identity_document_path: _privatePath, ...safeApplication } = application;
          return { ...safeApplication, identity_document_url: identityDocumentUrl, profile_photo_url: profilePhotoUrl };
        }));
        return json({
          success: true,
          requests: requestsResult.data || [],
          vendors: vendorListResult.data || [],
          riderApplications,
          riders: ridersResult.data || [],
          metrics: {
            pending: pendingCount.count || 0,
            pendingRiders: riderPendingCount.count || 0,
            verifiedRiders: verifiedRiderCount.count || 0,
            activeVendors: activeCount.count || 0,
            expiredVendors: expiredCount.count || 0,
            confirmedPayments,
            totalRevenueTzs
          }
        });
      }

      if (action === "approve_rider" || action === "reject_rider") {
        const applicationId = String(body?.application_id || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return json({ success: false, error: "Invalid rider application." }, 400);
        const { data: application, error: applicationError } = await admin.from("ione_sokoni_rider_applications")
          .select("*").eq("id", applicationId).maybeSingle();
        if (applicationError || !application) return json({ success: false, error: "Rider application not found." }, 404);
        if (application.status !== "pending") return json({ success: false, error: "This rider application has already been reviewed." }, 409);
        const now = new Date().toISOString();
        const claim = await admin.from("ione_sokoni_rider_applications").update({ status: "processing" })
          .eq("id", application.id).eq("status", "pending").select("id").maybeSingle();
        if (claim.error || !claim.data) return json({ success: false, error: "Another review is in progress. Refresh the dashboard." }, 409);
        if (action === "reject_rider") {
          const rejected = await admin.from("ione_sokoni_rider_applications").update({
            status: "rejected", reviewed_at: now, reviewed_by: "Authority Press",
            admin_note: String(body?.note || "").trim().slice(0, 500)
          }).eq("id", application.id).eq("status", "processing");
          if (rejected.error) {
            await admin.from("ione_sokoni_rider_applications").update({ status: "pending" }).eq("id", application.id).eq("status", "processing");
            return json({ success: false, error: "Could not save rider decision." }, 500);
          }
          return json({ success: true, message: "Rider application rejected." });
        }
        const riderWrite = await admin.from("ione_sokoni_riders").upsert({
          user_id: application.user_id, rider_name: application.rider_name, phone_number: application.phone_number,
          profile_path: application.profile_path || null,
          status: "active", available: false, verified_at: now, updated_at: now
        }, { onConflict: "user_id" }).select("id").single();
        if (riderWrite.error) {
          await admin.from("ione_sokoni_rider_applications").update({ status: "pending" }).eq("id", application.id).eq("status", "processing");
          return json({ success: false, error: "Could not create verified rider profile. No approval was recorded." }, 500);
        }
        const approved = await admin.from("ione_sokoni_rider_applications").update({
          status: "approved", reviewed_at: now, reviewed_by: "Authority Press",
          admin_note: String(body?.note || "").trim().slice(0, 500)
        }).eq("id", application.id).eq("status", "processing");
        if (approved.error) {
          await admin.from("ione_sokoni_riders").delete().eq("user_id", application.user_id);
          await admin.from("ione_sokoni_rider_applications").update({ status: "pending" }).eq("id", application.id).eq("status", "processing");
          return json({ success: false, error: "Rider approval was rolled back because the review record could not be saved." }, 500);
        }
        return json({ success: true, message: "Rider verified. They can now sign in to Boda Yangu and turn availability on." });
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

      const current = await admin.from("ione_sokoni_vendors").select("*")
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
        // Compensate for the vendor upsert if payment history could not be committed.
        // This keeps an unrecorded payment from granting access silently.
        if (current.data) {
          await admin.from("ione_sokoni_vendors").upsert(current.data, { onConflict: "user_id" });
        } else {
          await admin.from("ione_sokoni_vendors").delete().eq("user_id", request.user_id);
        }
        await admin.from("ione_sokoni_payment_requests").update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", request.id).eq("status", "processing");
        return json({ success: false, error: "Approval was rolled back because payment history could not be saved. Refresh and retry after checking the record." }, 500);
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
