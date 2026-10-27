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
        .select("id,advertiser_name,title,description,creative_url,destination_url,contact_phone,whatsapp_phone,city,objective,starts_at,ends_at,media_type,media_duration_seconds,plan_code,price_tzs,payment_status,placement,daily_start_time,daily_end_time,marketing_billboard_id")
        .eq("status", "approved").lte("starts_at", now).gte("ends_at", now).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      const placement = clean(body.placement || "smart_ads", 30);
      const validPlacements = ["smart_ads","explore","book_reader","documentary","expert","sokoni"];
      if (!validPlacements.includes(placement)) return json({ success: false, error: "Invalid ad placement." }, 400);
      const localClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      const campaigns = (data || []).filter((campaign: any) => {
        const target = String(campaign.placement || "all");
        if (target !== "all" && target !== placement) return false;
        const start = campaign.daily_start_time ? String(campaign.daily_start_time).slice(0,5) : "";
        const end = campaign.daily_end_time ? String(campaign.daily_end_time).slice(0,5) : "";
        if (!start || !end) return true;
        return start < end ? localClock >= start && localClock < end : localClock >= start || localClock < end;
      });
      const ids = campaigns.map((c: any) => c.id);
      const linkedIds = [...new Set(campaigns.map((c: any) => c.marketing_billboard_id).filter(Boolean))];
      let boards: any[] = [];
      if (linkedIds.length) { const { data, error } = await admin.from("afrilink_billboards").select("id,brand_name,business_type,category,end_at,end_date").in("id", linkedIds); if (error) throw error; boards = data || []; }
      const brandById = new Map(boards.filter((b: any) => (!b.end_at || new Date(b.end_at).getTime() > Date.now()) && (!b.end_date || b.end_at || new Date(b.end_date + "T23:59:59Z").getTime() > Date.now())).map((b: any) => [String(b.id), b]));
      const { data: creativeRows, error: creativeError } = ids.length ? await admin.from("ione_smart_ads_creatives").select("campaign_id,creative_url,media_type,media_duration_seconds,sort_order").in("campaign_id", ids).order("sort_order", {ascending:true}) : {data:[],error:null};
      if (creativeError) throw creativeError;
      const creativesByCampaign = new Map<string, any[]>();
      for (const row of creativeRows || []) { const list = creativesByCampaign.get(String(row.campaign_id)) || []; list.push(row); creativesByCampaign.set(String(row.campaign_id), list); }
      const enriched = campaigns.map((c: any) => ({...c, marketing_brand: c.marketing_billboard_id ? brandById.get(String(c.marketing_billboard_id)) || null : null, creatives: creativesByCampaign.get(String(c.id)) || [{creative_url:c.creative_url,media_type:c.media_type,media_duration_seconds:c.media_duration_seconds}]}));
      return json({ success: true, campaigns: enriched });
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
      const whatsapp_phone = clean(body.whatsapp_phone, 40);
      const title = clean(body.title, 100);
      const description = clean(body.description, 800);
      const creative_url = clean(body.creative_url, 2048);
      const rawDestinationUrl = clean(body.destination_url, 2048);
      const destinationDigits = whatsapp_phone.replace(/\D/g, "");
      const destination_url = rawDestinationUrl || (destinationDigits ? "https://wa.me/" + destinationDigits : "");
      const city = clean(body.city || "Tanzania", 100);
      const objective = ["website","contact","awareness"].includes(body.objective) ? body.objective : "website";
      const planCode = clean(body.plan_code, 20);
      const plans: Record<string, {price:number;days:number}> = {
        weekly: { price: 2000, days: 7 },
        monthly: { price: 5000, days: 30 },
        quarterly: { price: 10000, days: 90 },
      };
      const plan = plans[planCode];
      const marketingBillboardId = clean(body.marketing_billboard_id, 80);
      const mediaType = clean(body.media_type, 10);
      const mediaDuration = Number(body.media_duration_seconds || 0);
      const creativeList = Array.isArray(body.creatives) ? body.creatives : [{creative_url,media_type:mediaType,media_duration_seconds:mediaDuration}];
      const creativeLimit = ({weekly:2,monthly:5,quarterly:10} as Record<string,number>)[planCode] || 0;
      const placement = clean(body.placement || "all", 30);
      const validPlacements = ["all","smart_ads","explore","book_reader","documentary","expert","sokoni"];
      const dailyStart = clean(body.daily_start_time, 8);
      const dailyEnd = clean(body.daily_end_time, 8);
      const validTime = (value: string) => !value || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
      const expectedPrefix = `/storage/v1/object/public/ione-smart-ads/${user.id}/`;
      const allCreativesValid = creativeList.length >= 1 && creativeList.length <= creativeLimit && creativeList.every((item: any) => {
        const media = clean(item?.media_type, 10);
        const duration = Number(item?.media_duration_seconds || 0);
        let parsed: URL;
        try { parsed = new URL(clean(item?.creative_url, 2048)); } catch { return false; }
        return validHttps(parsed.href) && parsed.origin === new URL(url).origin && parsed.pathname.startsWith(expectedPrefix) &&
          ["image","video"].includes(media) && (media === "video" ? Number.isFinite(duration) && duration > 0 && duration <= 120 : duration === 0);
      });
      let creativePath = "";
      let creativeOrigin = "";
      try {
        const parsedCreative = new URL(creative_url);
        creativePath = parsedCreative.pathname;
        creativeOrigin = parsedCreative.origin;
      } catch {}
      let expectedOrigin = "";
      try { expectedOrigin = new URL(url).origin; } catch {}
      if (advertiser_name.length < 2 || contact_phone.length < 5 || whatsapp_phone.replace(/\D/g, "").length < 7 || title.length < 3 ||
          !validHttps(creative_url) || !validHttps(destination_url) || !plan || !allCreativesValid ||
          !["image","video"].includes(mediaType) || !validPlacements.includes(placement) ||
          !validTime(dailyStart) || !validTime(dailyEnd) || Boolean(dailyStart) !== Boolean(dailyEnd) ||
          !expectedOrigin || creativeOrigin !== expectedOrigin ||
          !creativePath.startsWith(expectedPrefix) ||
          (mediaType === "video" && (!Number.isFinite(mediaDuration) || mediaDuration <= 0 || mediaDuration > 120)) ||
          (mediaType === "image" && mediaDuration !== 0)) {
        return json({ success: false, error: "Check advertiser details, uploaded media, package, display schedule, and destination link. Videos must be no longer than 2 minutes." }, 400);
      }
      let billboard: any = null;
      if (marketingBillboardId) {
        if (!/^[0-9a-f-]{36}$/i.test(marketingBillboardId)) return json({ success: false, error: "Invalid I1 Marketing brand selection." }, 400);
        const { data: board, error: boardError } = await admin.from("afrilink_billboards").select("id,owner_id,end_at,end_date").eq("id", marketingBillboardId).eq("owner_id", user.id).maybeSingle();
        if (boardError) throw boardError;
        if (!board || (board.end_at && new Date(board.end_at).getTime() <= Date.now()) || (board.end_date && !board.end_at && new Date(board.end_date + "T23:59:59Z").getTime() <= Date.now())) return json({ success: false, error: "Choose an active I1 Marketing billboard owned by this account." }, 400);
        billboard = board;
      }
      const now = new Date();
      const { count, error: countError } = await admin.from("ione_smart_ads_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id).gte("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 3) return json({ success: false, error: "The limit is 3 ad submissions per account in any 7-day period. Try again when an earlier submission is more than 7 days old." }, 429);
      const { data, error } = await admin.from("ione_smart_ads_campaigns").insert({
        owner_id: user.id, advertiser_name, contact_phone, whatsapp_phone, title, description, creative_url, destination_url, city,
        objective, marketing_billboard_id: billboard?.id || null, status: "pending", starts_at: now.toISOString(),
        ends_at: new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000).toISOString(),
        plan_code: planCode, price_tzs: plan.price, duration_days: plan.days,
        payment_status: "pending", payment_reference: "",
        media_type: mediaType, media_duration_seconds: mediaDuration,
        placement, daily_start_time: dailyStart || null, daily_end_time: dailyEnd || null
      }).select("id,title,status,created_at,ends_at,plan_code,price_tzs,payment_status,placement,daily_start_time,daily_end_time").single();
      if (error) throw error;
      const creativeRows = creativeList.map((item: any, index: number) => ({ campaign_id: data.id, creative_url: clean(item.creative_url, 2048), media_type: clean(item.media_type, 10), media_duration_seconds: Number(item.media_duration_seconds || 0), sort_order: index }));
      const { error: creativeError } = await admin.from("ione_smart_ads_creatives").insert(creativeRows);
      if (creativeError) { await admin.from("ione_smart_ads_campaigns").delete().eq("id", data.id).eq("owner_id", user.id); throw creativeError; }
      return json({ success: true, campaign: data, message: "Advertisement submitted with " + creativeRows.length + " creative(s). Payment is pending Authority verification; the campaign starts only after verification and approval." });
    }

    if (action === "my_campaigns") {
      const user = await userFromRequest(admin, req);
      if (!user) return json({ success: false, error: "Reconnect to I|ONE and try again." }, 401);
      const { data, error } = await admin.from("ione_smart_ads_campaigns").select("*")
        .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const campaigns = data || [];
      const stats = metrics(await eventRows(admin, campaigns.map((c: any) => c.id)));
      const ids = campaigns.map((c: any) => c.id);
      const { data: creativeRows, error: creativeError } = ids.length ? await admin.from("ione_smart_ads_creatives").select("campaign_id,creative_url,media_type,media_duration_seconds,sort_order").in("campaign_id", ids).order("sort_order", {ascending:true}) : {data:[],error:null};
      if (creativeError) throw creativeError;
      const creativesByCampaign = new Map<string, any[]>();
      for (const row of creativeRows || []) { const list = creativesByCampaign.get(String(row.campaign_id)) || []; list.push(row); creativesByCampaign.set(String(row.campaign_id), list); }
      return json({ success: true, campaigns: campaigns.map((c: any) => ({ ...c, creatives: creativesByCampaign.get(String(c.id)) || [{creative_url:c.creative_url,media_type:c.media_type,media_duration_seconds:c.media_duration_seconds}], metrics: stats[c.id] || { impressions:0,clicks:0,contacts:0,conversions:0 } })) });
    }

    if (action === "brand_list") {
      const user = await userFromRequest(admin, req);
      if (!user) return json({ success: false, error: "Reconnect to I|ONE and try again." }, 401);
      const { data, error } = await admin.from("afrilink_billboards").select("id,brand_name,business_type,category,end_at,end_date").eq("owner_id", user.id).order("created_at", {ascending:false}).limit(100);
      if (error) throw error;
      const billboards = (data || []).filter((b: any) => (!b.end_at || new Date(b.end_at).getTime() > Date.now()) && (!b.end_date || b.end_at || new Date(b.end_date + "T23:59:59Z").getTime() > Date.now()));
      return json({ success: true, billboards });
    }
    if (action === "brand_details") {
      const id = clean(body.billboard_id, 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "Invalid brand selection." }, 400);
      const now = new Date().toISOString();
      const { data: campaign, error: campaignError } = await admin.from("ione_smart_ads_campaigns").select("id").eq("marketing_billboard_id", id).eq("status", "approved").lte("starts_at", now).gte("ends_at", now).limit(1).maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return json({ success: false, error: "No active approved campaign is linked to this brand." }, 404);
      const { data: board, error } = await admin.from("afrilink_billboards").select("id,owner_id,brand_name,business_type,category,address,content,waiting_message,booking_info,brand_color,content_color,address_color,end_at,end_date,video_url,video_path,video_bucket,video_duration_sec").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!board || (board.end_at && new Date(board.end_at).getTime() <= Date.now()) || (board.end_date && !board.end_at && new Date(board.end_date + "T23:59:59Z").getTime() <= Date.now())) return json({ success: false, error: "This I1 Marketing brand is no longer active." }, 404);
      return json({ success: true, billboard: board });
    }
    if (action === "delete_campaign") {
      const user = await userFromRequest(admin, req);
      if (!user) return json({ success: false, error: "Reconnect to I|ONE and try again." }, 401);
      const id = clean(body.campaign_id, 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "Invalid campaign ID." }, 400);
      const { data, error } = await admin.from("ione_smart_ads_campaigns").delete().eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ success: false, error: "Campaign not found for this account." }, 404);
      return json({ success: true, message: "Campaign deleted." });
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
        }).eq("id", id).select("id,payment_status,status,price_tzs").single();
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
