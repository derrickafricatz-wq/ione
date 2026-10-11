import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) {
      return json({ success: false, error: "Server configuration is missing." }, 500);
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData } = token ? await userClient.auth.getUser(token) : { data: { user: null } };
    const user = authData?.user || null;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body.action || "").trim().toLowerCase();
    const password = String(body.password || "");
    const isAuthorityAction = ["authority_list", "authority_status", "authority_upload_url", "authority_publish", "authority_unpublish"].includes(action);

    if (isAuthorityAction) {
      // Reuse the existing Authority Press verifier rather than introducing a second password.
      const verifyResponse = await fetch(url + "/functions/v1/ione-subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": anonKey, "Authorization": "Bearer " + anonKey },
        body: JSON.stringify({ action: "verify", password }),
      });
      let verified: Record<string, unknown> = {};
      try { verified = await verifyResponse.json(); } catch { verified = {}; }
      if (!verifyResponse.ok || verified.success !== true) {
        return json({ success: false, error: "Unauthorized Authority Press access." }, 401);
      }
    }

    if (action === "request") {
      if (!user) return json({ success: false, error: "Please reconnect before requesting narration." }, 401);
      const bookId = String(body.book_id || "");
      const { data: book, error: bookError } = await admin.from("heavens_books")
        .select("id,title,author_id,author_name,book_insight,active,narration_path")
        .eq("id", bookId).maybeSingle();
      if (bookError || !book) return json({ success: false, error: "Book not found." }, 404);
      if (String(book.author_id) !== String(user.id)) return json({ success: false, error: "Only the book's author can request narration." }, 403);
      if (!book.active) return json({ success: false, error: "Publish the book before requesting narration." }, 400);
      if (!String(book.author_name || body.author_name || "").trim() || !String(book.book_insight || body.book_insight || "").trim()) {
        return json({ success: false, error: "Add the author name and book insight, then save the book before requesting narration." }, 400);
      }
      const { data: existing } = await admin.from("book_narration_requests").select("id,status")
        .eq("book_id", bookId).maybeSingle();
      if (existing && existing.status !== "rejected") {
        return json({ success: true, already_requested: true, request: existing });
      }
      const payload = {
        book_id: bookId,
        author_id: user.id,
        author_name: String(book.author_name || body.author_name).trim().slice(0, 160),
        book_title: String(book.title || "").trim().slice(0, 200),
        book_insight: String(book.book_insight || body.book_insight).trim().slice(0, 12000),
        status: "requested",
        authority_notes: null,
        audio_path: null,
        published_at: null,
        updated_at: new Date().toISOString(),
      };
      const result = existing
        ? await admin.from("book_narration_requests").update(payload).eq("id", existing.id).select("id,status").single()
        : await admin.from("book_narration_requests").insert(payload).select("id,status").single();
      if (result.error) return json({ success: false, error: "Could not submit the narration request." }, 500);
      return json({ success: true, request: result.data });
    }

    if (action === "audio_url") {
      const bookId = String(body.book_id || "");
      const { data: book, error } = await admin.from("heavens_books")
        .select("id,narration_path,active").eq("id", bookId).maybeSingle();
      if (error || !book || !book.active || !book.narration_path) {
        return json({ success: false, error: "Narration is not published for this book yet." }, 404);
      }
      const { data: signed, error: signError } = await admin.storage.from("book-narrations")
        .createSignedUrl(book.narration_path, 300);
      if (signError || !signed?.signedUrl) return json({ success: false, error: "Could not open narration audio." }, 500);
      return json({ success: true, url: signed.signedUrl, expires_in: 300 });
    }

    if (action === "authority_list") {
      const { data, error } = await admin.from("book_narration_requests")
        .select("id,book_id,author_id,author_name,book_title,book_insight,status,authority_notes,audio_path,requested_at,updated_at,published_at")
        .order("requested_at", { ascending: false }).limit(250);
      if (error) return json({ success: false, error: "Could not load narration requests." }, 500);
      return json({ success: true, requests: data || [] });
    }

    if (action === "authority_status") {
      const requestId = String(body.request_id || "");
      const status = String(body.status || "");
      const allowed = new Set(["in_review", "needs_author", "recording", "rejected"]);
      if (!allowed.has(status)) return json({ success: false, error: "Invalid narration status." }, 400);
      const { data, error } = await admin.from("book_narration_requests")
        .update({ status, authority_notes: String(body.authority_notes || "").slice(0, 4000), updated_at: new Date().toISOString() })
        .eq("id", requestId).select("id,status").single();
      if (error) return json({ success: false, error: "Could not update narration request." }, 500);
      return json({ success: true, request: data });
    }

    if (action === "authority_upload_url") {
      const requestId = String(body.request_id || "");
      const { data: request, error } = await admin.from("book_narration_requests")
        .select("id,book_id,status").eq("id", requestId).maybeSingle();
      if (error || !request) return json({ success: false, error: "Narration request not found." }, 404);
      const path = request.book_id + "/" + crypto.randomUUID() + ".mp3";
      const { data: signed, error: signError } = await admin.storage.from("book-narrations").createSignedUploadUrl(path);
      if (signError || !signed?.token) return json({ success: false, error: "Could not prepare audio upload." }, 500);
      return json({ success: true, path, token: signed.token });
    }

    if (action === "authority_publish") {
      const requestId = String(body.request_id || "");
      const path = String(body.audio_path || "");
      if (!path || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/i.test(path)) {
        return json({ success: false, error: "Choose a valid uploaded MP3 narration." }, 400);
      }
      const { data: request, error: requestError } = await admin.from("book_narration_requests")
        .select("id,book_id,status").eq("id", requestId).maybeSingle();
      if (requestError || !request) return json({ success: false, error: "Narration request not found." }, 404);
      const { data: object, error: objectError } = await admin.storage.from("book-narrations").list(request.book_id, { search: path.split("/").pop(), limit: 10 });
      if (objectError || !(object || []).some((item: { name: string }) => item.name === path.split("/").pop())) {
        return json({ success: false, error: "Uploaded narration file could not be verified." }, 400);
      }
      const now = new Date().toISOString();
      const { error: bookError } = await admin.from("heavens_books").update({ narration_path: path, narration_published_at: now }).eq("id", request.book_id);
      if (bookError) return json({ success: false, error: "Could not publish narration on the book." }, 500);
      const { error: updateError } = await admin.from("book_narration_requests")
        .update({ status: "published", audio_path: path, published_at: now, updated_at: now, authority_notes: String(body.authority_notes || "").slice(0, 4000) })
        .eq("id", requestId);
      if (updateError) return json({ success: false, error: "Narration was attached but request status could not be updated. Retry publishing." }, 500);
      return json({ success: true });
    }

    if (action === "authority_unpublish") {
      const requestId = String(body.request_id || "");
      const { data: request, error } = await admin.from("book_narration_requests")
        .select("id,book_id,audio_path").eq("id", requestId).maybeSingle();
      if (error || !request) return json({ success: false, error: "Narration request not found." }, 404);
      const { error: bookError } = await admin.from("heavens_books")
        .update({ narration_path: null, narration_published_at: null }).eq("id", request.book_id);
      if (bookError) return json({ success: false, error: "Could not remove published narration." }, 500);
      const { error: reqError } = await admin.from("book_narration_requests")
        .update({ status: "recording", audio_path: null, published_at: null, updated_at: new Date().toISOString() }).eq("id", requestId);
      if (reqError) return json({ success: false, error: "Narration removed from book, but request status could not be updated." }, 500);
      return json({ success: true });
    }

    return json({ success: false, error: "Unknown narration action." }, 400);
  } catch (error) {
    console.error("book-narration-manage error:", error);
    return json({ success: false, error: "Unexpected narration service error." }, 500);
  }
});
