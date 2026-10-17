import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function clean(value: unknown, max = 3000) { return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max); }
function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return "255" + digits.slice(1);
  if (digits.startsWith("6") || digits.startsWith("7")) return "255" + digits;
  return digits;
}
function validPhone(value: string) { return /^255[67]\d{8}$/.test(value); }
async function getUser(admin: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
async function authorityValid(admin: any, raw: unknown) {
  const token = String(raw || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ success: false, error: "Server configuration is missing." }, 500);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request." }, 400); }
    const action = clean(body?.action, 80).toLowerCase();

    if (action === "my_status") {
      const user = await getUser(admin, req);
      if (!user) return json({ success: false, error: "Sign in to use I|ONE Expert." }, 401);
      const [{ data: expert }, { data: application }] = await Promise.all([
        admin.from("ione_experts").select("id,full_name,specialty,status,approved_at").eq("user_id", user.id).maybeSingle(),
        admin.from("ione_expert_applications").select("id,status,full_name,specialty,admin_note,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      ]);
      return json({ success: true, expert: expert || null, application: application || null });
    }

    if (action === "apply") {
      const user = await getUser(admin, req);
      if (!user) return json({ success: false, error: "Sign in before applying to become an expert." }, 401);
      const fullName = clean(body?.full_name, 120), phone = normalizePhone(body?.phone_number);
      const specialty = clean(body?.specialty, 100), experience = clean(body?.experience, 1200);
      const credentialPath = clean(body?.credential_path, 300);
      if (fullName.length < 2 || !validPhone(phone) || specialty.length < 2 || experience.length < 10) {
        return json({ success: false, error: "Enter your full name, valid Tanzania phone number, specialty, and a short experience description." }, 400);
      }
      const parts = credentialPath.split("/");
      if (parts.length !== 2 || parts[0] !== user.id || !/^[A-Za-z0-9._-]{5,180}$/.test(parts[1]) || !/\.(jpg|png|webp|pdf)$/i.test(parts[1])) {
        return json({ success: false, error: "Upload one valid credential or work sample before submitting." }, 400);
      }
      const listed = await admin.storage.from("ione-expert-credentials").list(user.id, { search: parts[1], limit: 20 });
      if (listed.error || !(listed.data || []).some((item: any) => item.name === parts[1])) return json({ success: false, error: "The credential file could not be verified. Upload it again." }, 400);
      const { data: existing } = await admin.from("ione_experts").select("id,status").eq("user_id", user.id).maybeSingle();
      if (existing?.status === "approved") return json({ success: false, error: "You already have verified I|ONE Expert access." }, 409);
      const { data: pending } = await admin.from("ione_expert_applications").select("id").eq("user_id", user.id).eq("status", "pending").maybeSingle();
      if (pending) return json({ success: true, already_pending: true, message: "Your application is already waiting for Authority Press." });
      const saved = await admin.from("ione_expert_applications").insert({
        user_id: user.id, full_name: fullName, phone_number: phone, specialty, experience,
        credential_path: credentialPath, status: "pending"
      }).select("id,status,created_at").single();
      if (saved.error) return json({ success: false, error: "Could not submit your expert application. Please retry." }, 500);
      return json({ success: true, application: saved.data, message: "Application sent. Authority Press will verify your credentials before expert access is enabled." });
    }

    if (action === "list_feed") {
      const user = await getUser(admin, req);
      if (!user) return json({ success: false, error: "Sign in to view I|ONE Expert discussions." }, 401);
      const [questionsResult, adviceResult, expertResult, myExpertResult] = await Promise.all([
        admin.from("ione_expert_questions").select("id,user_id,display_name,title,details,category,area_name,status,created_at,updated_at").order("created_at", { ascending: false }).limit(60),
        admin.from("ione_expert_advice").select("id,title,category,body,created_by,created_at").eq("published", true).order("created_at", { ascending: false }).limit(30),
        admin.from("ione_experts").select("full_name,specialty,approved_at").eq("status", "approved").order("approved_at", { ascending: false }).limit(100),
        admin.from("ione_experts").select("id,status").eq("user_id", user.id).maybeSingle()
      ]);
      if (questionsResult.error || adviceResult.error || expertResult.error) return json({ success: false, error: "Could not load I|ONE Expert." }, 500);
      const questions = questionsResult.data || [];
      const ids = questions.map((q: any) => q.id);
      let replies: any[] = [];
      if (ids.length) {
        const replyResult = await admin.from("ione_expert_replies").select("id,question_id,user_id,display_name,role,body,created_at").in("question_id", ids).order("created_at", { ascending: true }).limit(500);
        if (replyResult.error) return json({ success: false, error: "Could not load expert replies." }, 500);
        replies = replyResult.data || [];
      }
      return json({ success: true, questions: questions.map((q: any) => ({ ...q, replies: replies.filter((r: any) => r.question_id === q.id) })),
        advice: adviceResult.data || [], experts: expertResult.data || [], is_expert: myExpertResult.data?.status === "approved" });
    }

    if (action === "ask") {
      const user = await getUser(admin, req);
      if (!user) return json({ success: false, error: "Sign in to ask the community." }, 401);
      const displayName = clean(body?.display_name, 120), title = clean(body?.title, 180);
      const details = clean(body?.details, 5000), category = clean(body?.category || "General", 80);
      const area = clean(body?.area_name, 160);
      if (displayName.length < 2 || title.length < 8 || details.length < 15) return json({ success: false, error: "Enter your name, a clear title (at least 8 characters), and explain the issue in more detail." }, 400);
      const saved = await admin.from("ione_expert_questions").insert({ user_id: user.id, display_name: displayName, title, details, category, area_name: area, status: "open" }).select("id,status,created_at").single();
      if (saved.error) return json({ success: false, error: "Could not publish your question. Please retry." }, 500);
      return json({ success: true, question: saved.data, message: "Your question is live for verified experts to review." });
    }

    if (action === "reply") {
      const user = await getUser(admin, req);
      if (!user) return json({ success: false, error: "Sign in before replying." }, 401);
      const questionId = clean(body?.question_id, 80), text = clean(body?.body, 5000);
      if (!/^[0-9a-f-]{36}$/i.test(questionId) || text.length < 5) return json({ success: false, error: "Write a useful reply before sending." }, 400);
      const { data: expert } = await admin.from("ione_experts").select("id,full_name,status").eq("user_id", user.id).maybeSingle();
      if (!expert || expert.status !== "approved") return json({ success: false, error: "Only Authority-approved experts can answer questions. Apply for verification in I|ONE Expert." }, 403);
      const { data: question } = await admin.from("ione_expert_questions").select("id,status").eq("id", questionId).maybeSingle();
      if (!question || question.status === "closed") return json({ success: false, error: "This question is closed or unavailable." }, 404);
      const saved = await admin.from("ione_expert_replies").insert({ question_id: questionId, user_id: user.id, display_name: expert.full_name, role: "expert", body: text }).select("id").single();
      if (saved.error) return json({ success: false, error: "Could not save your expert reply." }, 500);
      await admin.from("ione_expert_questions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", questionId);
      return json({ success: true, message: "Expert reply published." });
    }

    const authorityActions = ["authority_dashboard", "approve_expert", "reject_expert", "authority_reply", "publish_advice", "delete_advice"];
    if (authorityActions.includes(action)) {
      if (!(await authorityValid(admin, body?.authority_session || req.headers.get("x-ione-authority-session")))) {
        return json({ success: false, error: "Authority Press session expired. Unlock Authority Press again." }, 401);
      }
      if (action === "authority_dashboard") {
        const [{ data: applications, error: appError }, { data: questions, error: qError }, { data: advice, error: adviceError }] = await Promise.all([
          admin.from("ione_expert_applications").select("id,user_id,full_name,phone_number,specialty,experience,credential_path,status,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(200),
          admin.from("ione_expert_questions").select("id,title,details,category,display_name,status,created_at").neq("status", "closed").order("created_at", { ascending: false }).limit(100),
          admin.from("ione_expert_advice").select("id,title,category,body,published,created_at").order("created_at", { ascending: false }).limit(100)
        ]);
        if (appError || qError || adviceError) return json({ success: false, error: "Could not load Authority Expert controls." }, 500);
        const safeApplications = await Promise.all((applications || []).map(async (app: any) => {
          let credential_url = null;
          if (app.credential_path) {
            const signed = await admin.storage.from("ione-expert-credentials").createSignedUrl(app.credential_path, 600);
            if (!signed.error) credential_url = signed.data.signedUrl;
          }
          const { credential_path: _private, ...safe } = app;
          return { ...safe, credential_url };
        }));
        const questionIds = (questions || []).map((question: any) => question.id);
        let replies: any[] = [];
        if (questionIds.length) {
          const replyResult = await admin.from("ione_expert_replies")
            .select("id,question_id,display_name,role,body,created_at")
            .in("question_id", questionIds).order("created_at", { ascending: true }).limit(500);
          if (replyResult.error) return json({ success: false, error: "Could not load official question replies." }, 500);
          replies = replyResult.data || [];
        }
        const questionsWithReplies = (questions || []).map((question: any) => ({
          ...question, replies: replies.filter((reply: any) => reply.question_id === question.id)
        }));
        return json({ success: true, applications: safeApplications, questions: questionsWithReplies, advice: advice || [] });
      }
      if (action === "approve_expert" || action === "reject_expert") {
        const applicationId = clean(body?.application_id, 80);
        if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return json({ success: false, error: "Invalid expert application." }, 400);
        const { data: app } = await admin.from("ione_expert_applications").select("*").eq("id", applicationId).maybeSingle();
        if (!app || app.status !== "pending") return json({ success: false, error: "This application is no longer pending." }, 409);
        const now = new Date().toISOString(), note = clean(body?.note, 500);
        if (action === "reject_expert") {
          const saved = await admin.from("ione_expert_applications").update({ status: "rejected", admin_note: note, reviewed_at: now, reviewed_by: "Authority Press", updated_at: now }).eq("id", app.id).eq("status", "pending");
          if (saved.error) return json({ success: false, error: "Could not save the expert decision." }, 500);
          return json({ success: true, message: "Expert application rejected." });
        }
        const { error: expertError } = await admin.from("ione_experts").upsert({
          user_id: app.user_id, full_name: app.full_name, phone_number: app.phone_number, specialty: app.specialty,
          experience: app.experience, status: "approved", approved_at: now, updated_at: now
        }, { onConflict: "user_id" });
        if (expertError) return json({ success: false, error: "Could not create verified expert access." }, 500);
        const saved = await admin.from("ione_expert_applications").update({ status: "approved", admin_note: note, reviewed_at: now, reviewed_by: "Authority Press", updated_at: now }).eq("id", app.id).eq("status", "pending");
        if (saved.error) {
          await admin.from("ione_experts").delete().eq("user_id", app.user_id);
          return json({ success: false, error: "Approval was rolled back because the review record could not be saved." }, 500);
        }
        return json({ success: true, message: "Expert verified and access enabled." });
      }
      if (action === "authority_reply") {
        const questionId = clean(body?.question_id, 80), text = clean(body?.body, 5000);
        if (!/^[0-9a-f-]{36}$/i.test(questionId) || text.length < 5) return json({ success: false, error: "Write an official response first." }, 400);
        const saved = await admin.from("ione_expert_replies").insert({ question_id: questionId, user_id: null, display_name: "Authority Press", role: "authority", body: text });
        if (saved.error) return json({ success: false, error: "Could not publish the official response." }, 500);
        await admin.from("ione_expert_questions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", questionId);
        return json({ success: true, message: "Official response published." });
      }
      if (action === "publish_advice") {
        const title = clean(body?.title, 180), category = clean(body?.category || "Official advice", 80), text = clean(body?.body, 5000);
        if (title.length < 5 || text.length < 15) return json({ success: false, error: "Enter an advice title and useful advice text." }, 400);
        const saved = await admin.from("ione_expert_advice").insert({ title, category, body: text, published: true, created_by: "Authority Press" }).select("id").single();
        if (saved.error) return json({ success: false, error: "Could not publish official advice." }, 500);
        return json({ success: true, message: "Official advice published." });
      }
      if (action === "delete_advice") {
        const id = clean(body?.advice_id, 80);
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "Invalid advice record." }, 400);
        const saved = await admin.from("ione_expert_advice").update({ published: false, updated_at: new Date().toISOString() }).eq("id", id);
        if (saved.error) return json({ success: false, error: "Could not unpublish advice." }, 500);
        return json({ success: true, message: "Official advice unpublished." });
      }
    }
    return json({ success: false, error: "Unknown I|ONE Expert action." }, 400);
  } catch (error) {
    console.error("ione-expert request failed:", error);
    return json({ success: false, error: "I|ONE Expert is temporarily unavailable. Please retry." }, 500);
  }
});
