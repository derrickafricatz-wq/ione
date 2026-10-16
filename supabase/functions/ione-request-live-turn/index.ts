import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://intoione.space",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") {
    if (origin !== "https://intoione.space" && origin !== "https://www.intoione.space") {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(null, { status: 204, headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }
  if (origin !== "https://intoione.space" && origin !== "https://www.intoione.space") {
    return new Response(JSON.stringify({ error: "Forbidden origin" }), { status: 403, headers: corsHeaders });
  }
  const turnKeyId = Deno.env.get("TURN_KEY_ID");
  const turnKeyToken = Deno.env.get("TURN_KEY_API_TOKEN");
  if (!turnKeyId || !turnKeyToken) {
    return new Response(JSON.stringify({ error: "TURN relay is not configured yet" }), { status: 503, headers: corsHeaders });
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: corsHeaders });
  }
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${turnKeyToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 3600 }),
      },
    );
    if (!response.ok) {
      console.error("TURN credential generation failed with status", response.status);
      return new Response(JSON.stringify({ error: "TURN credentials temporarily unavailable" }), { status: 502, headers: corsHeaders });
    }
    const data = await response.json();
    const iceServers = (Array.isArray(data.iceServers) ? data.iceServers : []).map((server: { urls?: string | string[]; username?: string; credential?: string; credentialType?: string }) => {
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url): url is string =>
        typeof url === "string" && !/:53(?:\?|$)/.test(url)
      );
      if (!urls.length) return null;
      return {
        urls,
        ...(server.username ? { username: server.username } : {}),
        ...(server.credential ? { credential: server.credential } : {}),
        ...(server.credentialType ? { credentialType: server.credentialType } : {}),
      };
    }).filter(Boolean);
    if (!iceServers.some((server: { urls: string[] }) => server.urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:")))) {
      return new Response(JSON.stringify({ error: "TURN provider returned no usable relay servers" }), { status: 502, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ iceServers, expiresIn: 3600 }), {
      status: 200,
      headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("TURN credential service error", error);
    return new Response(JSON.stringify({ error: "TURN service temporarily unavailable" }), { status: 502, headers: corsHeaders });
  }
});