import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

async function authUser(req: Request, admin: any) {
  const match = String(req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Open the I|ONE app session first.");
  const result = await admin.auth.getUser(match[1]);
  if (result.error || !result.data?.user) throw new Error("Your I|ONE session has expired. Refresh and try again.");
  return result.data.user;
}
async function validAuthoritySession(admin: any, rawToken: unknown): Promise<boolean> {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

let adminGlobal: any;
async function sendPush(row: any, payload: any) {
  try {
    const { data: cfg, error } = await adminGlobal.from("ione_push_config")
      .select("vapid_public_key,vapid_private_key,vapid_subject").eq("id", true).maybeSingle();
    if (error || !cfg?.vapid_public_key || !cfg?.vapid_private_key) return false;
    webpush.setVapidDetails(cfg.vapid_subject || "mailto:notifications@ione.app", cfg.vapid_public_key, cfg.vapid_private_key);
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload));
    return true;
  } catch (error: any) {
    const status = Number(error?.statusCode || 0);
    if (status === 404 || status === 410) {
      await adminGlobal.from("ione_push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
    return false;
  }
}
async function pushUser(admin: any, userId: string, payload: any) {
  const { data } = await admin.from("ione_push_subscriptions").select("id,endpoint,p256dh,auth")
    .eq("user_id", userId).eq("active", true);
  let sent = 0;
  for (const row of data || []) if (await sendPush(row, payload)) sent++;
  return sent;
}
async function pushAuthority(admin: any, payload: any) {
  const seen = new Set<string>();
  const { data: devices } = await admin.from("ione_support_authority_devices")
    .select("id,endpoint,p256dh,auth").eq("active", true);
  for (const row of devices || []) {
    seen.add(String(row.endpoint));
    await sendPush(row, payload);
  }
}
async function pushAllUsers(admin: any, payload: any) {
  const { data, error } = await admin.from("ione_push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("active", true);
  if (error) throw error;
  let sent = 0;
  for (const row of data || []) if (await sendPush(row, payload)) sent++;
  return sent;
}
async function getRequest(admin: any, id: string) {
  const { data, error } = await admin.from("ione_find_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !serviceKey) return json({ success: false, error: "Server configuration missing." }, 500);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    adminGlobal = admin;
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 48).toLowerCase();

    if (["create", "client_list", "client_thread"].includes(action)) {
      const user = await authUser(req, admin);
      if (action === "create") {
        const requestType = clean(body?.request_type, 16).toLowerCase();
        const title = clean(body?.title, 140);
        const details = clean(body?.details, 2000);
        const location = clean(body?.location, 160);
        const budget = clean(body?.budget, 80);
        if (!["product", "service"].includes(requestType)) return json({ success: false, error: "Choose product or service." }, 400);
        if (title.length < 2 || details.length < 5) return json({ success: false, error: "Add a clear name and a few details about what you need." }, 400);
        const { data: request, error } = await admin.from("ione_find_requests")
          .insert({ user_id: user.id, request_type: requestType, title, details, location, budget })
          .select("*").single();
        if (error) throw error;
        const acknowledgement = "Thank you for choosing I|ONE! Your request has been received. Our team is reviewing it and will do our best to find a suitable product or service. We will post updates here. Submitting a request does not guarantee availability.";
        const { error: messageError } = await admin.from("ione_find_request_messages")
          .insert({ request_id: request.id, sender_role: "authority", body: acknowledgement });
        if (messageError) throw messageError;
        const reference = "I1-FIM-" + request.id.replace(/-/g, "").slice(0, 8).toUpperCase();
        await pushAuthority(admin, { title: "I|ONE • NEW FIND IT FOR ME REQUEST", body: (title + " • " + requestType).slice(0, 180), url: "./?ioneFindAuthority=1", tag: "ione-find-request-" + request.id });
        return json({ success: true, request: { ...request, reference }, message: acknowledgement });
      }
      if (action === "client_list") {
        const { data, error } = await admin.from("ione_find_requests").select("*")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json({ success: true, requests: (data || []).map((r: any) => ({
          ...r, reference: "I1-FIM-" + String(r.id).replace(/-/g, "").slice(0, 8).toUpperCase()
        })) });
      }
      const id = clean(body?.request_id, 64);
      const request = await getRequest(admin, id);
      if (!request || request.user_id !== user.id) return json({ success: false, error: "Request not found." }, 404);
      const { data: messages, error } = await admin.from("ione_find_request_messages").select("id,request_id,sender_role,body,created_at,read_at")
        .eq("request_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      await admin.from("ione_find_request_messages").update({ read_at: new Date().toISOString() })
        .eq("request_id", id).eq("sender_role", "authority").is("read_at", null);
      return json({ success: true, request: { ...request, reference: "I1-FIM-" + String(request.id).replace(/-/g, "").slice(0, 8).toUpperCase() }, messages: messages || [] });
    }

    if (!(await validAuthoritySession(admin, body?.authority_session))) {
      return json({ success: false, error: "Authority Press session expired. Unlock again." }, 401);
    }
    if (action === "authority_list") {
      const { data, error } = await admin.from("ione_find_requests").select("*").order("created_at", { ascending: false }).limit(250);
      if (error) throw error;
      return json({ success: true, requests: (data || []).map((r: any) => ({
        ...r, reference: "I1-FIM-" + String(r.id).replace(/-/g, "").slice(0, 8).toUpperCase()
      })) });
    }
    if (action === "authority_thread") {
      const id = clean(body?.request_id, 64);
      const request = await getRequest(admin, id);
      if (!request) return json({ success: false, error: "Request not found." }, 404);
      const { data: messages, error } = await admin.from("ione_find_request_messages").select("*")
        .eq("request_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      await admin.from("ione_find_request_messages").update({ read_at: new Date().toISOString() })
        .eq("request_id", id).eq("sender_role", "client").is("read_at", null);
      return json({ success: true, request: { ...request, reference: "I1-FIM-" + String(request.id).replace(/-/g, "").slice(0, 8).toUpperCase() }, messages: messages || [] });
    }
    if (action === "authority_reply") {
      const id = clean(body?.request_id, 64);
      const message = clean(body?.message, 2000);
      if (!message) return json({ success: false, error: "Write a reply first." }, 400);
      const request = await getRequest(admin, id);
      if (!request) return json({ success: false, error: "Request not found." }, 404);
      const { error } = await admin.from("ione_find_request_messages").insert({ request_id: id, sender_role: "authority", body: message });
      if (error) throw error;
      await admin.from("ione_find_requests").update({ updated_at: new Date().toISOString() }).eq("id", id);
      await pushUser(admin, request.user_id, { title: "I|ONE • UPDATE ON YOUR REQUEST", body: message.slice(0, 180), url: "./?ioneFindItForMe=1", tag: "ione-find-private-" + id });
      return json({ success: true });
    }
    if (action === "authority_update") {
      const id = clean(body?.request_id, 64);
      const status = clean(body?.status, 40).toLowerCase();
      const listingUrl = clean(body?.listing_url, 500);
      const allowed = ["new", "reviewing", "finding_supplier", "found", "available", "completed", "unable_to_fulfil", "cancelled"];
      if (!allowed.includes(status)) return json({ success: false, error: "Choose a valid status." }, 400);
      const before = await getRequest(admin, id);
      if (!before) return json({ success: false, error: "Request not found." }, 404);
      const now = new Date().toISOString();
      const update: any = { status, listing_url: listingUrl, updated_at: now };
      if (["completed", "unable_to_fulfil", "cancelled"].includes(status)) update.resolved_at = now;
      else update.resolved_at = null;
      const { data: request, error } = await admin.from("ione_find_requests").update(update).eq("id", id).select("*").single();
      if (error) throw error;
      if (status === "available" && before.status !== "available") {
        const title = "NEW " + (request.request_type === "service" ? "SERVICE" : "PRODUCT") + " AVAILABLE ON I|ONE";
        const bodyText = request.title + (listingUrl ? " • Open the marketplace to view it." : " • Check the marketplace for details.");
        await pushAllUsers(admin, { title, body: bodyText.slice(0, 180), url: listingUrl || "./?market=1", tag: "ione-find-available-" + id });
        await admin.from("ione_find_request_messages").insert({
          request_id: id, sender_role: "authority",
          body: "Good news! We found a suitable match and marked this request as available." + (listingUrl ? " Listing: " + listingUrl : "")
        });
        await pushUser(admin, request.user_id, { title: "I|ONE • WE FOUND IT", body: "Your request “" + request.title + "” has a suitable match. Open Find It for Me to see the update.", url: "./?ioneFindItForMe=1", tag: "ione-find-private-" + id });
      }
      return json({ success: true, request });
    }
    return json({ success: false, error: "Unknown action." }, 400);
  } catch (error: any) {
    console.error("ione-find-it-for-me:", error);
    return json({ success: false, error: error?.message || "Unexpected error." }, 500);
  }
});