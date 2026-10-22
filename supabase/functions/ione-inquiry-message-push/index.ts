import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token === serviceKey) return json({ success: false, error: "User authorization required." }, 401);

    const { data: authData, error: authError } = await db.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id) return json({ success: false, error: "Invalid user session." }, 401);

    const body = await req.json().catch(() => ({}));
    const messageId = String(body?.message_id || "").trim();
    if (!messageId) return json({ success: false, error: "Message ID is required." }, 400);

    const { data: message, error: messageError } = await db.from("afrilink_inquiry_messages")
      .select("id,inquiry_id,sender_id,sender_role,is_voice,is_auto")
      .eq("id", messageId).maybeSingle();
    if (messageError) throw messageError;
    if (!message) return json({ success: false, error: "Message not found." }, 404);
    if (message.is_auto) return json({ success: true, skipped: "automatic_message" });

    const { data: inquiry, error: inquiryError } = await db.from("afrilink_inquiries")
      .select("id,owner_id,client_id").eq("id", message.inquiry_id).maybeSingle();
    if (inquiryError) throw inquiryError;
    if (!inquiry) return json({ success: false, error: "Inquiry not found." }, 404);

    const role = String(message.sender_role || "");
    const expectedSender = role === "owner" ? inquiry.owner_id : role === "client" ? inquiry.client_id : null;
    if (!expectedSender || String(expectedSender) !== String(user.id) || String(message.sender_id) !== String(user.id)) {
      return json({ success: false, error: "You are not authorized to notify for this message." }, 403);
    }

    const recipientId = String(role === "owner" ? inquiry.client_id : inquiry.owner_id);
    const senderId = String(user.id);
    if (!recipientId) return json({ success: false, error: "Message recipient is missing." }, 400);

    const isVoice = message.is_voice === true;
    const recipientTitle = role === "owner"
      ? (isVoice ? "NEW VOICE MESSAGE FROM A BRAND" : "NEW MESSAGE FROM A BRAND")
      : (isVoice ? "NEW CLIENT VOICE MESSAGE" : "NEW CLIENT MESSAGE");
    const recipientBody = role === "owner"
      ? (isVoice ? "Your brand sent you a private voice message." : "Your brand sent you a private message.")
      : (isVoice ? "A client sent your brand a private voice message." : "A client sent your brand a private message.");
    const senderTitle = role === "owner"
      ? (isVoice ? "VOICE MESSAGE SENT TO CLIENT" : "MESSAGE SENT TO CLIENT")
      : (isVoice ? "VOICE MESSAGE SENT TO BRAND" : "MESSAGE SENT TO BRAND");
    const senderBody = role === "owner"
      ? "Your private message was sent to the client."
      : "Your private message was sent to the brand.";

    // Notify both participants through the existing push service. Never include private message text or voice URLs.
    async function sendPush(targetUserId: string, title: string, body: string, suffix: string) {
      const response = await fetch(`${supabaseUrl}/functions/v1/ione-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: "service_send",
          user_id: targetUserId,
          title,
          body,
          url: "./?ionePushDestination=market",
          tag: `ione-inquiry-${message.id}-${suffix}`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success !== true) {
        throw new Error(String(result?.error || response.status));
      }
      return { delivered: Number(result.delivered || 0), failed: Number(result.failed || 0) };
    }

    const recipientResult = await sendPush(recipientId, recipientTitle, recipientBody, "recipient");
    const senderResult = senderId === recipientId
      ? { delivered: 0, failed: 0 }
      : await sendPush(senderId, senderTitle, senderBody, "sender");
    return json({
      success: true,
      recipient: recipientResult,
      sender: senderResult,
      delivered: recipientResult.delivered + senderResult.delivered,
      failed: recipientResult.failed + senderResult.failed,
    });
  } catch (error) {
    console.error("ione-inquiry-message-push error:", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: "Private chat notification failed." });
  }
});