import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const FEE_TZS = 1000;
const PERIOD_DAYS = 30;
const BUCKET = "ione-mama-chakula-menu";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return "255" + digits.slice(1);
  if (digits.startsWith("6") || digits.startsWith("7")) return "255" + digits;
  return digits;
}
function validPhone(phone: string) { return /^255[67]\d{8}$/.test(phone); }
async function verifiedUser(admin: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
async function authorityOk(admin: any, raw: unknown) {
  const token = String(raw || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}
async function activeVendor(admin: any, userId: string) {
  const { data, error } = await admin.from("ione_mama_chakula_vendors")
    .select("id,user_id,business_name,phone_number,status,paid_until,is_open,location_text")
    .eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Imeshindikana kuthibitisha akaunti ya Mama Chakula.");
  if (!data || data.status !== "active" || !data.paid_until || Date.parse(data.paid_until) <= Date.now()) {
    throw new Error("Ruhusa ya Mama Chakula haijaanza au muda wake umeisha. Wasiliana na Authority Press.");
  }
  return data;
}

async function sendMamaSms(admin: any, idempotencyKey: string, eventType: string, rawPhone: unknown, rawMessage: string) {
  const apiKey = Deno.env.get("DARSMS_API_KEY");
  const phone = normalizePhone(rawPhone);
  if (!apiKey || !validPhone(phone)) return { status: "skipped" };
  const message = String(rawMessage || "").replace(/\s+/g, " ").trim().slice(0, 320);
  if (!message) return { status: "skipped" };
  const claim = await admin.from("ione_sokoni_sms_log").insert({
    idempotency_key: idempotencyKey, event_type: eventType, recipient_phone: phone, status: "pending"
  }).select("id").maybeSingle();
  if (claim.error) return { status: claim.error.code === "23505" ? "duplicate" : "failed" };
  if (!claim.data?.id) return { status: "duplicate" };
  const quota = await admin.rpc("reserve_ione_sokoni_sms_credit");
  if (quota.error || quota.data !== true) {
    await admin.from("ione_sokoni_sms_log").update({ status: "skipped",
      error_message: quota.error ? "SMS quota unavailable" : "SMS trial limit reached",
      updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    return { status: "skipped" };
  }
  try {
    const response = await fetch("https://dev.darsms.co.tz/api/v1/integrations/sms/send", {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ senderId: "DARSMS", to: [phone], message }), signal: AbortSignal.timeout(12000)
    });
    let result: any = {}; try { result = await response.json(); } catch (_) {}
    const ok = response.ok && result?.success === true;
    const ids = result?.data?.messageIds;
    await admin.from("ione_sokoni_sms_log").update({
      status: ok ? "queued" : "failed",
      provider_message_id: Array.isArray(ids) ? String(ids[0] || "") : String(ids || "") || null,
      error_message: ok ? null : String(result?.message || ("DARSMS HTTP " + response.status)).slice(0, 240),
      provider_response: { http_status: response.status, success: ok },
      updated_at: new Date().toISOString()
    }).eq("idempotency_key", idempotencyKey);
    return { status: ok ? "queued" : "failed" };
  } catch (error) {
    await admin.from("ione_sokoni_sms_log").update({ status: "failed",
      error_message: String((error as any)?.message || error).slice(0, 240),
      updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    return { status: "failed" };
  }
}
async function sendMamaPush(admin: any, userId: string, payload: any) {
  try {
    const { data: config } = await admin.from("ione_push_config")
      .select("vapid_public_key,vapid_private_key,vapid_subject").eq("id", true).maybeSingle();
    if (!config?.vapid_public_key || !config?.vapid_private_key) return 0;
    webpush.setVapidDetails(config.vapid_subject || "mailto:notifications@ione.app", config.vapid_public_key, config.vapid_private_key);
    const { data: subs } = await admin.from("ione_push_subscriptions")
      .select("id,endpoint,p256dh,auth").eq("user_id", userId).eq("active", true);
    let sent = 0;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
        sent++;
      } catch (error: any) {
        if ([404, 410].includes(Number(error?.statusCode || 0))) {
          await admin.from("ione_push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }
    return sent;
  } catch (error) { console.warn("Mama Chakula push skipped:", error); return 0; }
}

async function signedPhoto(admin: any, path: string | null) {
  if (!path) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
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
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const name = String(body?.business_name || "").trim().replace(/\s+/g, " ");
      const phone = normalizePhone(body?.phone_number);
      const location = String(body?.location_text || "").trim().slice(0, 240);
      if (name.length < 2 || name.length > 120 || !validPhone(phone)) {
        return json({ success: false, error: "Weka jina la biashara na namba sahihi ya simu ya Tanzania." }, 400);
      }
      const existing = await admin.from("ione_mama_chakula_vendors").select("id,status,paid_until")
        .eq("user_id", user.id).maybeSingle();
      if (existing.error) return json({ success: false, error: "Imeshindikana kukagua usajili wako." }, 500);
      const vendorWrite = await admin.from("ione_mama_chakula_vendors").upsert({
        user_id: user.id, business_name: name, phone_number: phone, location_text: location,
        status: existing.data?.status || "pending", updated_at: new Date().toISOString()
      }, { onConflict: "user_id" }).select("id").single();
      if (vendorWrite.error) return json({ success: false, error: "Usajili haukuhifadhiwa. Jaribu tena." }, 500);
      const pending = await admin.from("ione_mama_chakula_payment_requests").select("id,status")
        .eq("user_id", user.id).eq("status", "pending").maybeSingle();
      if (pending.error) return json({ success: false, error: "Imeshindikana kukagua ombi la malipo." }, 500);
      if (pending.data) return json({ success: true, already_pending: true, message: "Ombi lako linasubiri Authority Press kuthibitisha malipo." });
      const payment = await admin.from("ione_mama_chakula_payment_requests").insert({
        vendor_id: vendorWrite.data.id, user_id: user.id, business_name: name, phone_number: phone,
        amount_tzs: FEE_TZS, period_days: PERIOD_DAYS, status: "pending"
      }).select("id,status,amount_tzs,period_days,created_at").single();
      if (payment.error) return json({ success: false, error: payment.error.code === "23505" ? "Ombi lako tayari linasubiri uthibitisho." : "Ombi la malipo halikutumwa." }, 409);
      return json({ success: true, request: payment.data, message: "Ombi limepokelewa. Lipa TZS 1,000 kwa maelekezo rasmi ya I|ONE. Ruhusa itafunguliwa baada ya Authority Press kuthibitisha malipo." });
    }

    if (action === "my_status") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const [v, p] = await Promise.all([
        admin.from("ione_mama_chakula_vendors").select("id,business_name,phone_number,location_text,status,paid_until,is_open,profile_photo_path")
          .eq("user_id", user.id).maybeSingle(),
        admin.from("ione_mama_chakula_payment_requests").select("id,status,amount_tzs,created_at,approved_at,admin_note")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
      ]);
      if (v.error || p.error) return json({ success: false, error: "Imeshindikana kupakia hali ya usajili." }, 500);
      const vendor = v.data;
      const active = !!vendor && vendor.status === "active" && Date.parse(vendor.paid_until || "") > Date.now();
      return json({ success: true, active, vendor: vendor ? { ...vendor, profile_photo_url: await signedPhoto(admin, vendor.profile_photo_path) } : null, requests: p.data || [] });
    }

    if (action === "public_menu") {
      const { data: items, error } = await admin.from("ione_mama_chakula_menu_items")
        .select("id,vendor_id,item_name,description,category,price_tzs,portion_name,photo_path,available,sort_order")
        .eq("available", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(500);
      if (error) return json({ success: false, error: "Imeshindikana kupakia menyu." }, 500);
      const vendorIds = [...new Set((items || []).map((x: any) => x.vendor_id))];
      const vr = vendorIds.length ? await admin.from("ione_mama_chakula_vendors")
        .select("id,business_name,phone_number,location_text,status,paid_until,is_open,profile_photo_path").in("id", vendorIds) : { data: [], error: null };
      if (vr.error) return json({ success: false, error: "Imeshindikana kupakia migahawa." }, 500);
      const now = Date.now();
      const vendors = new Map((vr.data || []).filter((v: any) => v.status === "active" && Date.parse(v.paid_until || "") > now).map((v: any) => [v.id, v]));
      const menu = await Promise.all((items || []).filter((x: any) => vendors.has(x.vendor_id)).map(async (x: any) => {
        const v: any = vendors.get(x.vendor_id);
        return { id: x.id, vendor_id: x.vendor_id, item_name: x.item_name, description: x.description,
          category: x.category, price_tzs: x.price_tzs, portion_name: x.portion_name,
          photo_url: await signedPhoto(admin, x.photo_path), vendor_name: v.business_name,
          vendor_phone: v.phone_number, vendor_location: v.location_text, vendor_is_open: v.is_open,
          vendor_profile_photo_url: await signedPhoto(admin, v.profile_photo_path) };
      }));
      return json({ success: true, menu });
    }

    if (action === "my_menu") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const vendor = await activeVendor(admin, user.id);
      const { data, error } = await admin.from("ione_mama_chakula_menu_items").select("*")
        .eq("vendor_id", vendor.id).order("sort_order").order("created_at", { ascending: false }).limit(150);
      if (error) return json({ success: false, error: "Imeshindikana kupakia menyu yako." }, 500);
      const menu = await Promise.all((data || []).map(async (x: any) => ({ ...x, photo_url: await signedPhoto(admin, x.photo_path) })));
      return json({ success: true, menu, vendor });
    }

    if (action === "save_menu_item") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const vendor = await activeVendor(admin, user.id);
      const name = String(body?.item_name || "").trim().replace(/\s+/g, " ");
      const description = String(body?.description || "").trim().slice(0, 600);
      const category = String(body?.category || "Chakula").trim().slice(0, 60);
      const portion = String(body?.portion_name || "sahani").trim().slice(0, 30);
      const price = Number(body?.price_tzs);
      if (name.length < 2 || name.length > 120 || category.length < 2 || portion.length < 2 || !Number.isSafeInteger(price) || price < 1 || price > 100000000) {
        return json({ success: false, error: "Jaza jina, aina ya chakula, kipimo na bei sahihi." }, 400);
      }
      const id = String(body?.item_id || "").trim();
      let prior: any = null;
      if (id) {
        const old = await admin.from("ione_mama_chakula_menu_items").select("id,photo_path")
          .eq("id", id).eq("vendor_id", vendor.id).maybeSingle();
        if (old.error || !old.data) return json({ success: false, error: "Chakula hicho hakipo kwenye menyu yako." }, 404);
        prior = old.data;
      }
      let photoPath = prior?.photo_path || null;
      if (body?.image_base64) {
        const mime = String(body?.image_mime || "").toLowerCase();
        const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "";
        const encoded = String(body.image_base64);
        if (!ext || encoded.length > 7000000 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) return json({ success: false, error: "Picha iwe JPG, PNG au WebP na isizidi MB 5." }, 400);
        const binary = atob(encoded);
        if (binary.length > 5 * 1024 * 1024) return json({ success: false, error: "Picha isizidi MB 5." }, 400);
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const path = vendor.id + "/" + crypto.randomUUID() + "." + ext;
        const uploaded = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
        if (uploaded.error) return json({ success: false, error: "Picha haikupakiwa. Jaribu picha ndogo." }, 500);
        photoPath = path;
      }
      const payload = { vendor_id: vendor.id, user_id: user.id, item_name: name, description, category,
        price_tzs: price, portion_name: portion, photo_path: photoPath,
        available: body?.available !== false, updated_at: new Date().toISOString() };
      const saved = id
        ? await admin.from("ione_mama_chakula_menu_items").update(payload).eq("id", id).eq("vendor_id", vendor.id).select("id").single()
        : await admin.from("ione_mama_chakula_menu_items").insert(payload).select("id").single();
      if (saved.error) return json({ success: false, error: "Chakula hakikuhifadhiwa." }, 500);
      return json({ success: true, message: "Chakula kimehifadhiwa kwenye menyu." });
    }

    if (action === "delete_menu_item") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const vendor = await activeVendor(admin, user.id);
      const result = await admin.from("ione_mama_chakula_menu_items").delete()
        .eq("id", String(body?.item_id || "")).eq("vendor_id", vendor.id).select("id").maybeSingle();
      if (result.error || !result.data) return json({ success: false, error: "Chakula hakikufutwa." }, 404);
      return json({ success: true, message: "Chakula kimeondolewa kwenye menyu." });
    }

    if (action === "set_open") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const vendor = await activeVendor(admin, user.id);
      const result = await admin.from("ione_mama_chakula_vendors").update({ is_open: body?.is_open === true, updated_at: new Date().toISOString() })
        .eq("id", vendor.id).select("is_open").single();
      if (result.error) return json({ success: false, error: "Hali ya mgahawa haikuhifadhiwa." }, 500);
      return json({ success: true, is_open: result.data.is_open });
    }

    if (action === "place_order") {
      const buyer = await verifiedUser(admin, req);
      if (!buyer) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const name = String(body?.buyer_name || "").trim().replace(/\s+/g, " ");
      const phone = normalizePhone(body?.buyer_phone);
      const note = String(body?.buyer_note || "").trim().slice(0, 600);
      const method = body?.fulfillment_method === "delivery" ? "delivery" : "pickup";
      const address = String(body?.delivery_address || "").trim().slice(0, 240);
      const items = Array.isArray(body?.items) ? body.items : [];
      if (name.length < 2 || name.length > 120 || !validPhone(phone) || items.length < 1 || items.length > 25 || (method === "delivery" && address.length < 4)) {
        return json({ success: false, error: "Jaza jina, simu, chakula na taarifa sahihi za kuchukua au kupeleka." }, 400);
      }
      const quantities = new Map<string, number>();
      for (const line of items) {
        const id = String(line?.menu_item_id || "");
        const qty = Number(line?.quantity);
        if (!/^[0-9a-f-]{36}$/i.test(id) || quantities.has(id) || !Number.isSafeInteger(qty) || qty < 1 || qty > 1000) {
          return json({ success: false, error: "Kiasi cha sahani si sahihi. Kagua kikapu." }, 400);
        }
        quantities.set(id, qty);
      }
      const { data: rows, error } = await admin.from("ione_mama_chakula_menu_items")
        .select("id,vendor_id,user_id,item_name,portion_name,price_tzs,available").in("id", [...quantities.keys()]);
      if (error || (rows || []).length !== quantities.size) return json({ success: false, error: "Baadhi ya vyakula havipatikani tena. Sasisha menyu." }, 409);
      const vendorIds = [...new Set((rows || []).map((x: any) => x.vendor_id))];
      if (vendorIds.length !== 1) return json({ success: false, error: "Oda moja inapaswa kutoka kwa Mama Chakula mmoja. Tuma oda tofauti kwa mgahawa mwingine." }, 400);
      if ((rows || []).some((x: any) => !x.available || x.user_id === buyer.id)) return json({ success: false, error: "Chakula hakipatikani au huwezi kuagiza kwenye menyu yako mwenyewe." }, 409);
      const { data: vendor, error: vendorError } = await admin.from("ione_mama_chakula_vendors")
        .select("id,user_id,business_name,phone_number,location_text,status,paid_until,is_open").eq("id", vendorIds[0]).maybeSingle();
      if (vendorError || !vendor || vendor.status !== "active" || Date.parse(vendor.paid_until || "") <= Date.now()) return json({ success: false, error: "Ruhusa ya mgahawa huu haipo tena." }, 409);
      if (!vendor.is_open) return json({ success: false, error: "Mgahawa umefunga oda kwa sasa. Jaribu baadaye." }, 409);
      const lines = (rows || []).map((x: any) => ({ ...x, quantity: quantities.get(x.id) || 0, total: Number(x.price_tzs) * (quantities.get(x.id) || 0) }));
      const total = lines.reduce((sum: number, x: any) => sum + x.total, 0);
      if (!Number.isSafeInteger(total) || total < 1 || total > 1000000000) return json({ success: false, error: "Jumla ya oda si sahihi." }, 400);
      const created = await admin.from("ione_mama_chakula_orders").insert({
        vendor_id: vendor.id, seller_user_id: vendor.user_id, buyer_user_id: buyer.id,
        buyer_name: name, buyer_phone: phone, buyer_note: note, fulfillment_method: method,
        delivery_address: method === "delivery" ? address : null, total_tzs: total, status: "new"
      }).select("id,status,total_tzs,created_at").single();
      if (created.error) return json({ success: false, error: "Oda haikutumwa. Jaribu tena." }, 500);
      const itemRows = lines.map((x: any) => ({ order_id: created.data.id, menu_item_id: x.id,
        item_name: x.item_name, portion_name: x.portion_name, quantity: x.quantity,
        unit_price_tzs: x.price_tzs, total_tzs: x.total }));
      const inserted = await admin.from("ione_mama_chakula_order_items").insert(itemRows);
      if (inserted.error) {
        await admin.from("ione_mama_chakula_orders").delete().eq("id", created.data.id);
        return json({ success: false, error: "Oda haikukamilika kuhifadhiwa. Tafadhali tuma tena." }, 500);
      }
      const itemSummary = lines.map((x: any) => x.item_name + " x" + x.quantity).join(", ").slice(0, 80);
      const sellerSms = "I|ONE ODA MPYA. Mteja: " + name.slice(0, 40) + ". Simu: " + phone + ". " + itemSummary +
        (method === "delivery" ? ". Peleka: " + address.slice(0, 140) : ". Mteja atachukua.") + ". Fungua I|ONE kuona oda kamili.";
      const buyerSms = "I|ONE: Oda yako imetumwa kwa " + vendor.business_name +
        ". Simu ya Mama Chakula: " + vendor.phone_number + ". Utapokea taarifa akikubali.";
      await Promise.allSettled([
        sendMamaSms(admin, "mama-food:" + created.data.id + ":seller:new", "mama_food_order_new_seller", vendor.phone_number, sellerSms),
        sendMamaSms(admin, "mama-food:" + created.data.id + ":buyer:received", "mama_food_order_received_buyer", phone, buyerSms),
        sendMamaPush(admin, vendor.user_id, { title: "I|ONE • Oda mpya ya chakula", body: name + " ametuma oda mpya. Fungua Mama Chakula kuiona.", url: "./?ionePushDestination=mama-chakula", tag: "ione-mama-food-order-" + created.data.id })
      ]);
      return json({ success: true, order: created.data, message: "Oda imetumwa kwa " + (vendor.business_name || "Mama Chakula") + ". Utapokea SMS ya uthibitisho na namba ya mpishi." });
    }

    if (action === "my_orders") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const [seller, buyer] = await Promise.all([
        admin.from("ione_mama_chakula_orders").select("*").eq("seller_user_id", user.id).order("created_at", { ascending: false }).limit(100),
        admin.from("ione_mama_chakula_orders").select("*").eq("buyer_user_id", user.id).order("created_at", { ascending: false }).limit(100)
      ]);
      if (seller.error || buyer.error) return json({ success: false, error: "Imeshindikana kupakia oda zako." }, 500);
      const ids = [...new Set([...(seller.data || []), ...(buyer.data || [])].map((x: any) => x.id))];
      const itemResult = ids.length ? await admin.from("ione_mama_chakula_order_items").select("*").in("order_id", ids).order("created_at") : { data: [], error: null };
      if (itemResult.error) return json({ success: false, error: "Imeshindikana kupakia vyakula vya oda." }, 500);
      const byOrder = new Map<string, any[]>();
      for (const item of itemResult.data || []) { const list = byOrder.get(item.order_id) || []; list.push(item); byOrder.set(item.order_id, list); }
      const vendors = [...new Set((buyer.data || []).map((x: any) => x.vendor_id))];
      const contacts = vendors.length ? await admin.from("ione_mama_chakula_vendors").select("id,business_name,phone_number").in("id", vendors) : { data: [], error: null };
      if (contacts.error) return json({ success: false, error: "Imeshindikana kupakia mawasiliano ya migahawa." }, 500);
      const contactMap = new Map((contacts.data || []).map((x: any) => [x.id, x]));
      const deliveryResult = ids.length ? await admin.from("ione_mama_chakula_deliveries").select("id,order_id,rider_user_id,status,pickup_location,dropoff_location").in("order_id", ids) : { data: [], error: null };
      if (deliveryResult.error) return json({ success: false, error: "Imeshindikana kupakia taarifa za usafirishaji." }, 500);
      const riderIds = [...new Set((deliveryResult.data || []).map((x: any) => x.rider_user_id).filter(Boolean))];
      const riderResult = riderIds.length ? await admin.from("ione_sokoni_riders").select("user_id,rider_name,phone_number,vehicle_type").in("user_id", riderIds) : { data: [], error: null };
      if (riderResult.error) return json({ success: false, error: "Imeshindikana kupakia mawasiliano ya dereva." }, 500);
      const riderMap = new Map((riderResult.data || []).map((x: any) => [x.user_id, x]));
      const deliveryMap = new Map((deliveryResult.data || []).map((x: any) => [x.order_id, x]));
      const decorate = (x: any) => {
        const delivery: any = deliveryMap.get(x.id);
        const rider: any = delivery?.rider_user_id ? riderMap.get(delivery.rider_user_id) : null;
        return { ...x, items: byOrder.get(x.id) || [], vendor_name: contactMap.get(x.vendor_id)?.business_name || null,
          vendor_phone: contactMap.get(x.vendor_id)?.phone_number || null,
          food_delivery: delivery ? { id: delivery.id, status: delivery.status, pickup_location: delivery.pickup_location,
            dropoff_location: delivery.dropoff_location, rider_name: rider?.rider_name || null,
            rider_phone: rider?.phone_number || null, vehicle_type: rider?.vehicle_type || null } : null };
      };
      return json({ success: true, seller_orders: (seller.data || []).map(decorate), buyer_orders: (buyer.data || []).map(decorate) });
    }

    if (action === "request_delivery") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      const orderId = String(body?.order_id || "").trim();
      const { data: order, error } = await admin.from("ione_mama_chakula_orders").select("id,status,buyer_user_id,seller_user_id,vendor_id,fulfillment_method,delivery_address").eq("id", orderId).maybeSingle();
      if (error || !order || order.buyer_user_id !== user.id) return json({ success: false, error: "Oda hii haipo kwenye akaunti yako." }, 404);
      if (!["accepted","preparing","ready"].includes(order.status) || order.fulfillment_method !== "delivery" || !order.delivery_address) return json({ success: false, error: "Usafirishaji unaombwa baada ya Mama Chakula kukubali oda ya kupelekewa." }, 409);
      const existing = await admin.from("ione_mama_chakula_deliveries").select("id,status").eq("order_id", order.id).maybeSingle();
      if (existing.error) return json({ success: false, error: "Imeshindikana kukagua ombi la usafirishaji." }, 500);
      if (existing.data) return json({ success: true, delivery: existing.data, already_requested: true, message: "Ombi la usafirishaji tayari limetumwa." });
      const { data: vendor, error: vendorError } = await admin.from("ione_mama_chakula_vendors").select("business_name,location_text,status,paid_until").eq("id", order.vendor_id).maybeSingle();
      if (vendorError || !vendor || vendor.status !== "active" || !vendor.location_text.trim()) return json({ success: false, error: "Mama Chakula lazima ahifadhi eneo la kuchukulia chakula kwanza." }, 409);
      const created = await admin.from("ione_mama_chakula_deliveries").insert({
        order_id: order.id, buyer_user_id: order.buyer_user_id, seller_user_id: order.seller_user_id,
        vendor_id: order.vendor_id, pickup_location: vendor.location_text, dropoff_location: order.delivery_address, status: "requested"
      }).select("id,status").single();
      if (created.error) {
        if (created.error.code === "23505") return json({ success: false, error: "Ombi la usafirishaji tayari lipo." }, 409);
        return json({ success: false, error: "Ombi la usafirishaji halikutumwa." }, 500);
      }
      const { data: riders } = await admin.from("ione_sokoni_riders").select("user_id")
        .eq("status", "active").eq("available", true).eq("access_payment_confirmed", true)
        .gt("access_expires_at", new Date().toISOString()).not("vehicle_type", "is", null);
      await Promise.allSettled((riders || []).map((r: any) => sendMamaPush(admin, r.user_id, {
        title: "I|ONE • Oda mpya ya chakula ya kupeleka",
        body: vendor.business_name + " anahitaji dereva wa chakula. Fungua Sokoni kuona safari.",
        url: "./?ionePushDestination=sokoni", tag: "ione-mama-food-delivery-" + created.data.id
      })));
      await sendMamaPush(admin, order.seller_user_id, { title: "I|ONE • Dereva wa chakula anaombwa",
        body: "Ombi la dereva limetumwa kwa madereva wa Sokoni.", url: "./?ionePushDestination=mama-chakula", tag: "ione-mama-food-delivery-seller-" + created.data.id });
      return json({ success: true, delivery: created.data, message: "Ombi la dereva limetumwa kwa madereva wa Sokoni." });
    }

    if (action === "update_order_status") {
      const user = await verifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Ingia tena kisha ujaribu." }, 401);
      await activeVendor(admin, user.id);
      const id = String(body?.order_id || "");
      const next = String(body?.status || "");
      const allowed: Record<string, string[]> = { new: ["accepted", "rejected"], accepted: ["preparing"], preparing: ["ready"], ready: ["completed"] };
      const order = await admin.from("ione_mama_chakula_orders").select("id,status,buyer_user_id,buyer_phone,buyer_name,vendor_id,total_tzs,fulfillment_method,delivery_address").eq("id", id).eq("seller_user_id", user.id).maybeSingle();
      if (order.error || !order.data) return json({ success: false, error: "Oda haipo kwenye akaunti yako." }, 404);
      if (!(allowed[order.data.status] || []).includes(next)) return json({ success: false, error: "Hatua hii ya oda haiwezi kufanyika kwa sasa." }, 409);
      const saved = await admin.from("ione_mama_chakula_orders").update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", id).eq("status", order.data.status).select("id,status").maybeSingle();
      if (saved.error || !saved.data) return json({ success: false, error: "Oda imesasishwa na hatua nyingine. Sasisha kisha ujaribu tena." }, 409);
      const { data: vendorContact } = await admin.from("ione_mama_chakula_vendors")
        .select("business_name,phone_number").eq("id", order.data.vendor_id).maybeSingle();
      const vendorName = vendorContact?.business_name || "Mama Chakula";
      const vendorPhone = vendorContact?.phone_number || "";
      const statusMessages: Record<string, string> = {
        accepted: "I|ONE: Habari " + order.data.buyer_name + ", " + vendorName + " amekubali oda yako. Mpigie: " + vendorPhone + ".",
        rejected: "I|ONE: Samahani " + order.data.buyer_name + ", " + vendorName + " hawezi kupokea oda yako kwa sasa. Tafadhali chagua mwingine.",
        preparing: "I|ONE: " + vendorName + " ameanza kuandaa oda yako.",
        ready: "I|ONE: Oda yako iko tayari kwa kuchukua. " + vendorName + " • " + vendorPhone,
        completed: "I|ONE: Oda yako imekamilika. Asante kwa kutumia I|ONE Sokoni."
      };
      if (statusMessages[next]) {
        await sendMamaSms(admin, "mama-food:" + id + ":buyer:" + next, "mama_food_order_" + next + "_buyer", order.data.buyer_phone, statusMessages[next]);
      }
      if (["accepted","rejected","ready","completed"].includes(next)) {
        const titles: Record<string, string> = { accepted: "Oda imekubaliwa", rejected: "Oda imekataliwa", ready: "Chakula kiko tayari", completed: "Oda imekamilika" };
        await sendMamaPush(admin, order.data.buyer_user_id, {
          title: "I|ONE • " + titles[next], body: statusMessages[next],
          url: "./?ionePushDestination=mama-chakula", tag: "ione-mama-food-order-status-" + id
        });
      }
      return json({ success: true, order: saved.data, message: "Hali ya oda imesasishwa." });
    }

    if (action === "authority_dashboard" || action === "approve" || action === "reject") {
      const token = body?.authority_session || req.headers.get("x-ione-authority-session");
      if (!(await authorityOk(admin, token))) return json({ success: false, error: "Authority Press session expired. Unlock Authority Press again." }, 401);
      if (action === "authority_dashboard") {
        const [requests, vendors] = await Promise.all([
          admin.from("ione_mama_chakula_payment_requests").select("id,user_id,vendor_id,business_name,phone_number,amount_tzs,period_days,status,created_at,admin_note").eq("status", "pending").order("created_at").limit(300),
          admin.from("ione_mama_chakula_vendors").select("id,business_name,phone_number,status,paid_until,is_open").order("created_at", { ascending: false }).limit(300)
        ]);
        if (requests.error || vendors.error) return json({ success: false, error: "Imeshindikana kupakia dashibodi ya Mama Chakula." }, 500);
        return json({ success: true, requests: requests.data || [], vendors: vendors.data || [] });
      }
      const id = String(body?.request_id || "");
      const request = await admin.from("ione_mama_chakula_payment_requests").select("*").eq("id", id).eq("status", "pending").maybeSingle();
      if (request.error || !request.data) return json({ success: false, error: "Ombi limekaguliwa tayari au halipo." }, 404);
      const note = String(body?.note || "").trim().slice(0, 500);
      if (action === "reject") {
        const rejected = await admin.from("ione_mama_chakula_payment_requests").update({ status: "rejected", admin_note: note, updated_at: new Date().toISOString() })
          .eq("id", id).eq("status", "pending").select("id").maybeSingle();
        if (rejected.error || !rejected.data) return json({ success: false, error: "Ombi halikukataliwa. Sasisha na ujaribu tena." }, 409);
        return json({ success: true, message: "Ombi la Mama Chakula limekataliwa." });
      }
      const vendor = await admin.from("ione_mama_chakula_vendors").select("id,paid_until").eq("id", request.data.vendor_id).maybeSingle();
      if (vendor.error || !vendor.data) return json({ success: false, error: "Taarifa za Mama Chakula hazipo." }, 404);
      const start = Math.max(Date.now(), Date.parse(vendor.data.paid_until || "") || 0);
      const expiry = new Date(start + PERIOD_DAYS * 86400000).toISOString();
      const approved = await admin.from("ione_mama_chakula_payment_requests").update({ status: "approved", admin_note: note, approved_at: new Date().toISOString(), approved_by: "Authority Press", updated_at: new Date().toISOString() })
        .eq("id", id).eq("status", "pending").select("id").maybeSingle();
      if (approved.error || !approved.data) return json({ success: false, error: "Ombi limebadilishwa na mtu mwingine. Sasisha dashibodi." }, 409);
      const activated = await admin.from("ione_mama_chakula_vendors").update({
        status: "active", paid_until: expiry, approved_at: new Date().toISOString(), approved_by: "Authority Press", updated_at: new Date().toISOString()
      }).eq("id", vendor.data.id).select("id").maybeSingle();
      if (activated.error || !activated.data) {
        await admin.from("ione_mama_chakula_payment_requests").update({ status: "pending", approved_at: null, approved_by: null, updated_at: new Date().toISOString() }).eq("id", id);
        return json({ success: false, error: "Ruhusa haikufunguliwa. Uamuzi umerudishwa nyuma; kagua na ujaribu tena." }, 500);
      }
      return json({ success: true, message: "Malipo yamethibitishwa. Mama Chakula amepewa ruhusa ya siku 30.", paid_until: expiry });
    }

    return json({ success: false, error: "Hatua ya Mama Chakula haijatambuliwa." }, 400);
  } catch (error) {
    console.error("Mama Chakula request failed:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Huduma ya Mama Chakula haipatikani kwa sasa." }, 500);
  }
});
