import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function countryFromRequest(req: Request): { code: string | null; name: string | null } {
  const raw = String(req.headers.get("cf-ipcountry") || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw) || raw === "XX" || raw === "T1") return { code: null, name: null };
  let name: string | null = raw;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" }).of(raw);
    if (display && display !== raw) name = display;
  } catch (_) {}
  return { code: raw, name };
}

function tzDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values: Record<string, string> = {};
  for (const p of parts) values[p.type] = p.value;
  return values.year + "-" + values.month + "-" + values.day;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return tzDate(d);
}

function safeSource(value: unknown): string {
  const s = String(value || "browser").trim().toLowerCase();
  return ["browser", "pwa", "ios-home-screen"].includes(s) ? s : "browser";
}

async function validateAuthority(admin: ReturnType<typeof createClient>, token: unknown): Promise<boolean> {
  const value = String(token || "").trim();
  if (value.length < 32 || value.length > 256) return false;
  const tokenHash = await sha256(value);
  const { data, error } = await admin.from("ione_authority_sessions")
    .select("expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return false;
  const expires = Date.parse(data.expires_at || "");
  return Number.isFinite(expires) && expires > Date.now();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json({ success: false, error: "Analytics service is not configured." }, 500);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch (_) { return json({ success: false, error: "Invalid request body." }, 400); }
  const action = String(body.action || "track");

  if (action === "summary") {
    if (!(await validateAuthority(admin, body.authority_session))) {
      return json({ success: false, error: "Authority Press session is invalid or expired. Unlock Authority Press again." }, 403);
    }
    const now = new Date();
    const today = tzDate(now);
    const cutoffDate = dateOffset(29);
    const cutoffIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [visitorCount, todayCount, installCount, launchCount, dailyResult, eventsResult] = await Promise.all([
      admin.from("ione_launch_visitors").select("visitor_hash", { count: "exact", head: true }),
      admin.from("ione_launch_daily_visitors").select("visitor_hash", { count: "exact", head: true }).eq("visit_date", today),
      admin.from("ione_launch_events").select("id", { count: "exact", head: true }).eq("event_type", "install_confirmed"),
      admin.from("ione_launch_events").select("id", { count: "exact", head: true }).eq("event_type", "installed_app_launch").gte("created_at", cutoffIso),
      admin.from("ione_launch_daily_visitors").select("visitor_hash,visit_date,country_code,country_name").gte("visit_date", cutoffDate).order("visit_date", { ascending: true }).limit(20000),
      admin.from("ione_launch_events").select("created_at,event_type,country_code,country_name,visitor_hash").gte("created_at", cutoffIso).order("created_at", { ascending: false }).limit(20000),
    ]);
    for (const result of [visitorCount, todayCount, installCount, launchCount, dailyResult, eventsResult]) {
      if (result.error) return json({ success: false, error: "Could not load launch analytics safely." }, 500);
    }

    const dailyRows = dailyResult.data || [];
    const events = eventsResult.data || [];
    const visitorSets = new Map<string, Set<string>>();
    const countryNames = new Map<string, string>();
    const dayVisitors = new Map<string, Set<string>>();
    const dayInstalls = new Map<string, Set<string>>();
    const dayLaunches = new Map<string, Set<string>>();
    const installCountrySets = new Map<string, Set<string>>();
    const dayLabels: string[] = [];
    for (let i = 13; i >= 0; i--) dayLabels.push(dateOffset(i));
    for (const row of dailyRows) {
      const country = String(row.country_code || "UN");
      const name = String(row.country_name || (country === "UN" ? "Unknown" : country));
      countryNames.set(country, name);
      if (!visitorSets.has(country)) visitorSets.set(country, new Set());
      visitorSets.get(country)!.add(String(row.visitor_hash));
      const day = String(row.visit_date);
      if (!dayVisitors.has(day)) dayVisitors.set(day, new Set());
      dayVisitors.get(day)!.add(String(row.visitor_hash));
    }
    for (const e of events) {
      const day = tzDate(new Date(e.created_at));
      const country = String(e.country_code || "UN");
      const name = String(e.country_name || (country === "UN" ? "Unknown" : country));
      countryNames.set(country, name);
      if (e.event_type === "install_confirmed") {
        if (!dayInstalls.has(day)) dayInstalls.set(day, new Set());
        dayInstalls.get(day)!.add(String(e.visitor_hash));
        if (!installCountrySets.has(country)) installCountrySets.set(country, new Set());
        installCountrySets.get(country)!.add(String(e.visitor_hash));
      }
      if (e.event_type === "installed_app_launch") {
        if (!dayLaunches.has(day)) dayLaunches.set(day, new Set());
        dayLaunches.get(day)!.add(String(e.visitor_hash));
      }
    }
    const countries = Array.from(visitorSets.entries()).map(([code, set]) => ({
      code, name: countryNames.get(code) || code, visitors30d: set.size,
      installs30d: installCountrySets.get(code)?.size || 0,
    })).sort((a, b) => b.visitors30d - a.visitors30d).slice(0, 10);
    const trend = dayLabels.map((day) => ({
      date: day,
      visitors: dayVisitors.get(day)?.size || 0,
      installs: dayInstalls.get(day)?.size || 0,
      launches: dayLaunches.get(day)?.size || 0,
    }));
    const visitorsTotal = visitorCount.count || 0;
    const installConfirmedTotal = installCount.count || 0;
    return json({
      success: true,
      generatedAt: now.toISOString(),
      reportingTimeZone: "Africa/Dar_es_Salaam",
      visitorsTotal,
      visitorsToday: todayCount.count || 0,
      installConfirmedTotal,
      installRate: visitorsTotal > 0 ? Math.round((installConfirmedTotal / visitorsTotal) * 10000) / 100 : 0,
      appLaunches30d: launchCount.count || 0,
      countries30d: visitorSets.size,
      countries,
      trend,
      note: "Unique visitors are anonymous browser identifiers; installation confirmation depends on browser support. Country may be unavailable or affected by VPNs."
    });
  }

  if (action !== "track") return json({ success: false, error: "Unknown action." }, 400);

  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return json({ success: false, error: "A valid app session is required." }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  if (userError || !userData?.user) return json({ success: false, error: "App session could not be verified." }, 401);

  const eventType = String(body.event_type || "");
  const allowed = new Set(["page_view", "install_click", "install_prompt", "install_confirmed", "installed_app_launch"]);
  if (!allowed.has(eventType)) return json({ success: false, error: "Unsupported analytics event." }, 400);
  const visitorKey = String(body.visitor_key || "");
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(visitorKey)) return json({ success: false, error: "Invalid anonymous visitor identifier." }, 400);
  const visitorHash = await sha256(visitorKey);
  const country = countryFromRequest(req);
  const source = safeSource(body.source);
  const now = new Date();
  const nowIso = now.toISOString();

  const existingVisitor = await admin.from("ione_launch_visitors").select("visitor_hash").eq("visitor_hash", visitorHash).maybeSingle();
  if (existingVisitor.error) return json({ success: false, error: "Could not record visitor." }, 500);
  if (existingVisitor.data) {
    const update = await admin.from("ione_launch_visitors").update({
      last_seen_at: nowIso,
      ...(country.code ? { last_country_code: country.code, last_country_name: country.name } : {}),
    }).eq("visitor_hash", visitorHash);
    if (update.error) return json({ success: false, error: "Could not update visitor." }, 500);
  } else {
    const insertVisitor = await admin.from("ione_launch_visitors").insert({
      visitor_hash: visitorHash,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      first_country_code: country.code,
      first_country_name: country.name,
      last_country_code: country.code,
      last_country_name: country.name,
    });
    if (insertVisitor.error && insertVisitor.error.code !== "23505") return json({ success: false, error: "Could not register visitor." }, 500);
  }

  if (eventType === "page_view" || eventType === "installed_app_launch") {
    const day = tzDate(now);
    const daily = await admin.from("ione_launch_daily_visitors").upsert({
      visitor_hash: visitorHash,
      visit_date: day,
      country_code: country.code,
      country_name: country.name,
    }, { onConflict: "visitor_hash,visit_date", ignoreDuplicates: true });
    if (daily.error) return json({ success: false, error: "Could not update daily visit totals." }, 500);
  }

  let since: string | null = null;
  if (eventType === "page_view") since = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  else if (eventType === "installed_app_launch") since = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  else if (eventType === "install_click" || eventType === "install_prompt") since = new Date(now.getTime() - 15 * 1000).toISOString();

  let duplicate = false;
  let prior = admin.from("ione_launch_events").select("id").eq("visitor_hash", visitorHash).eq("event_type", eventType).limit(1);
  if (eventType === "install_confirmed") {
    const found = await prior.maybeSingle();
    if (found.error) return json({ success: false, error: "Could not verify install event." }, 500);
    duplicate = !!found.data;
  } else if (since) {
    const found = await prior.gte("created_at", since).maybeSingle();
    if (found.error) return json({ success: false, error: "Could not verify event." }, 500);
    duplicate = !!found.data;
  }
  if (!duplicate) {
    const inserted = await admin.from("ione_launch_events").insert({
      event_type: eventType,
      visitor_hash: visitorHash,
      country_code: country.code,
      country_name: country.name,
      source,
    });
    if (inserted.error) return json({ success: false, error: "Could not record analytics event." }, 500);
  }
  return json({ success: true, duplicate });
});
