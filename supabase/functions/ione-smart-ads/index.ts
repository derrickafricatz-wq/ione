import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const validHttps = (value: string) => {
  try { const u = new URL(value); return u.protocol === "https:"; } catch { return false; }
};
async function validAuthority(admin: any, raw: unknown) {
  const token = clean(raw, 256);
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}
async function userFromRequest(admin: any, req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
function metrics(events: any[]) {
  const out: Record<string, {impressions:number;clicks:number;contacts:number;conversions:number}> = {};
  for (const e of events || []) {
    const id = String(e.campaign_id);
    out[id] ||= { impressions: 0, clicks: 0, contacts: 0, conversions: 0 };
    if (e.event_type === "impression") out[id].impressions++;
    if (e.event_type === "click") out[id].clicks++;
    if (e.event_type === "contact") out[id].contacts++;
    if (e.event_type === "conversion") out[id].conversions++;
  }
  return out;
}
async function eventRows(admin: any, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await admin.from("ione_smart_ads_events").select("campaign_id,event_type").in("campaign_id", ids).limit(20000);
  if (error) throw error;
  return data || [];
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return json({ success: false, error: "SMART ADS service is not configured." }, 500);
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request body." }, 400); }
  const action = clean(body.action, 40).toLowerCase();

  try {
    if (action === "public_list") {
      const now = new Date().toISOString();
      const { data, error } = await admin.from("ione_smart_ads_campaigns")
        .select("id,advertiser_name,title,description,creative_url,destination_url,contact_phone,city,objective,starts_at,ends_at,media_type,media_duration_seconds,plan_code,price_tzs,payment_status")
        .eq("status", "approved").lte("starts_at", now).gte("ends_at", now).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return json({ success: true, campaigns: data || [] });
    }

    if (action === "track") {
      const campaignId = clean(body.campaign_id, 80);
      const eventType = clean(body.event_type, 30);
      const eventKey = clean(body.event_key, 100);
      if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !["impression","click","contact"].includes(eventType) || !/^[0-9a-f-]{36}$/i.test(eventKey)) {
        return json({ success: false, error: "Invalid tracking event." }, 400);
      }
      const now = new Date().toISOString();
      const { data: campaign, error: campaignError } = await admin.from("ione_smart_ads_campaigns")
        .select("id").eq("id", campaignId).eq("status", "approved").lte("starts_at", now).gte("ends_at", now).maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return json({ success: false, error: "Campaign is not active." }, 404);
      const { error } = await admin.from("ione_smart_ads_events").upsert(
        { campaign_id: campaignId, event_type: eventType, event_key: eventKey },
        { onConflict: "campaign_id,event_type,event_key", ignoreDuplicates: true }
      );
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "create") {
      const user = await userFromRequest(admin, req);
      if (!user) return json({ success: false, error: "Reconnect to I|ONE and try again." }, 401);
      const advertiser_name = clean(body.advertiser_name, 100);
      const contact_phone = clean(body.contact_phone, 40);
      const title = clean(body.title, 100);
      const description = clean(body.description, 800);
      const creative_url = clean(body.creative_url, 2048);
      const destination_url = clean(body.destination_url, 2048);
      const city = clean(body.city || "Tanzania", 100);
      const objective = ["website","contact","awareness"].includes(body.objective) ? body.objective : "website";
      const planCode = clean(body.plan_code, 20);
      const plans: Record<string, {price:number;days:number}> = {
        weekly: { price: 2000, days: 7 },
        monthly: { price: 5000, days: 30 },
        quarterly: { price: 10000, days: 90 },
      };
      const plan = plans[planCode];
      const mediaType = clean(body.media_type, 10);
      const mediaDuration = Number(body.media_duration_seconds || 0);
      const paymentReference = clean(body.payment_reference, 120);
      const expectedPrefix = `/storage/v1/object/public/ione-smart-ads/${user.id}/`;
      let creativePath = "";
      try { creativePath = new URL(creative_url).pathname; } catch {}
      if (advertiser_name.length < 2 || contact_phone.length < 5 || title.length < 3 ||
          !validHttps(creative_url) || !validHttps(destination_url) || !plan ||
          !["image","video"].includes(mediaType) || !paymentReference ||
          !creativePath.startsWith(expectedPrefix) ||
          (mediaType === "video" && (!Number.isFinite(mediaDuration) || mediaDuration <= 0 || mediaDuration > 120)) ||
          (mediaType === "image" && mediaDuration !== 0)) {
        return json({ success: false, error: "Check advertiser details, uploaded media, package, payment reference, and destination link. Videos must be no longer than 2 minutes." }, 400);
      }
      const now = new Date();
      const { count, error: countError } = await admin.from("ione_smart_ads_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id).gte("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 3) return json({ success: false, error: "The limit is 3 ad submissions per account in any 7-day period. Try again when an earlier submission is more than 7 days old." }, 429);
      const { data, error } = await admin.from("ione_smart_ads_campaigns").insert({
        owner_id: user.id, advertiser_name, contact_phone, title, description, creative_url, destination_url, city,
        objective, status: "pending", starts_at: now.toISOString(),
        ends_at: new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000).toISOString(),
        plan_code: planCode, price_tzs: plan.price, duration_days: plan.days,
        payment_status: "pending", payment_reference: paymentReference,
        media_type: mediaType, media_duration_seconds: mediaDuration
      }).select("id,title,status,created_at,ends_at,plan_code,price_tzs,payment_status").single();
      if (error) throw error;
      return json({ success: true, campaign: data, message: "Advertisement submitted. Payment is pending Authority verification; the campaign starts only after verification and approval." });
    }

    if (action === "my_campaigns") {
      const user = await userFromRequest(admin, req);
      if (!user) return json({ success: false, error: "Reconnect to I|ONE and try again." }, 401);
      const { data, error } = await admin.from("ione_smart_ads_campaigns").select("*")
        .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const campaigns = data || [];
      const stats = metrics(await eventRows(admin, campaigns.map((c: any) => c.id)));
      return json({ success: true, campaigns: campaigns.map((c: any) => ({ ...c, metrics: stats[c.id] || { impressions:0,clicks:0,contacts:0,conversions:0 } })) });
    }

    if (action === "record_conversion") {
      const user = await userFromRequest(admin, req);
      if (!user) return json({ success: false, error: "Reconnect to I|ONE and try again." }, 401);
      const campaignId = clean(body.campaign_id, 80);
      const eventKey = clean(body.event_key, 100);
      if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !/^[0-9a-f-]{36}$/i.test(eventKey)) return json({ success: false, error: "Invalid conversion event." }, 400);
      const { data: campaign, error: campaignError } = await admin.from("ione_smart_ads_campaigns").select("id")
        .eq("id", campaignId).eq("owner_id", user.id).maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return json({ success: false, error: "Campaign not found for this account." }, 404);
      const { error } = await admin.from("ione_smart_ads_events").upsert(
        { campaign_id: campaignId, event_type: "conversion", event_key: eventKey },
        { onConflict: "campaign_id,event_type,event_key", ignoreDuplicates: true }
      );
      if (error) throw error;
      return json({ success: true });
    }

    if (action.startsWith("authority_")) {
      if (!(await validAuthority(admin, body.authority_session))) return json({ success: false, error: "Authority Press session expired. Unlock again." }, 401);
      if (action === "authority_list") {
        const { data, error } = await admin.from("ione_smart_ads_campaigns").select("*")
          .order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        const campaigns = data || [];
        const stats = metrics(await eventRows(admin, campaigns.map((c: any) => c.id)));
        return json({ success: true, campaigns: campaigns.map((c: any) => ({ ...c, metrics: stats[c.id] || { impressions:0,clicks:0,contacts:0,conversions:0 } })) });
      }
      if (action === "authority_payment") {
        const id = clean(body.campaign_id, 80);
        const status = clean(body.payment_status, 20);
        if (!/^[0-9a-f-]{36}$/i.test(id) || !["verified","rejected"].includes(status)) {
          return json({ success: false, error: "Invalid payment verification action." }, 400);
        }
        const { data, error } = await admin.from("ione_smart_ads_campaigns").update({
          payment_status: status, updated_at: new Date().toISOString()
        }).eq("id", id).select("id,payment_status,status,price_tzs,payment_reference").single();
        if (error) throw error;
        return json({ success: true, campaign: data, message: status === "verified" ? "Payment verified. Review the advertisement and approve it separately to activate the campaign." : "Payment marked as rejected. The campaign remains inactive." });
      }
      if (action === "authority_review") {
        const id = clean(body.campaign_id, 80);
        const status = clean(body.status, 20);
        const review_note = clean(body.review_note, 500);
        if (!/^[0-9a-f-]{36}$/i.test(id) || !["approved","rejected","paused"].includes(status)) return json({ success: false, error: "Invalid review action." }, 400);
        const { data: existing, error: existingError } = await admin.from("ione_smart_ads_campaigns")
          .select("id,payment_status,duration_days").eq("id", id).maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return json({ success: false, error: "Campaign not found." }, 404);
        if (status === "approved" && existing.payment_status !== "verified") {
          return json({ success: false, error: "Verify the manual payment before approving this advertisement." }, 409);
        }
        const now = new Date();
        const update: Record<string, unknown> = {
          status, review_note, reviewed_at: now.toISOString(), updated_at: now.toISOString()
        };
        if (status === "approved") {
          update.starts_at = now.toISOString();
          update.ends_at = new Date(now.getTime() + Number(existing.duration_days || 7) * 24 * 60 * 60 * 1000).toISOString();
        }
        const { data, error } = await admin.from("ione_smart_ads_campaigns").update(update)
          .eq("id", id).select("id,status,review_note,starts_at,ends_at").single();
        if (error) throw error;
        return json({ success: true, campaign: data });
      }
    }
    return json({ success: false, error: "Unknown SMART ADS action." }, 400);
  } catch (error) {
    console.error("I|ONE SMART ADS error", error);
    return json({ success: false, error: "SMART ADS could not complete this request. Please try again." }, 500);
  }
});
