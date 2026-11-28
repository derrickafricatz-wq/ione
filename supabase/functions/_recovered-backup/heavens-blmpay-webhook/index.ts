const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp, x-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createHmacSha256(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );

  return bytesToHex(new Uint8Array(signature));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function maskValue(value: string | null): string {
  if (!value) return "(missing)";

  if (value.length <= 8) {
    return "***";
  }

  return (
    value.substring(0, 4) +
    "..." +
    value.substring(value.length - 4)
  );
}

Deno.serve(async (req) => {
  console.log("==============================================");
  console.log("HEAVEN'S BOOKS BLMPAY WEBHOOK");
  console.log("Request received:", new Date().toISOString());
  console.log("Method:", req.method);
  console.log("==============================================");

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    console.error("Invalid HTTP method");

    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    // =====================================================
    // 1. LOAD HEAVEN'S BOOKS SECRET
    // =====================================================

    const webhookSecret =
      Deno.env.get("BLM_PAY_WEBHOOK_SECRET_HEAVENS")?.trim();

    console.log("Secret configured:", !!webhookSecret);

    if (!webhookSecret) {
      console.error(
        "ERROR: BLM_PAY_WEBHOOK_SECRET_HEAVENS is missing",
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Webhook secret is not configured",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log(
      "Secret length:",
      webhookSecret.length,
    );

    // =====================================================
    // 2. READ RAW BODY
    // =====================================================

    const rawBody = await req.text();

    console.log("Raw body received:", true);
    console.log("Raw body length:", rawBody.length);

    // IMPORTANT:
    // We intentionally do NOT print rawBody because
    // webhook payloads may contain customer/payment data.

    // =====================================================
    // 3. READ ALL POSSIBLE SIGNATURE HEADERS
    // =====================================================

    const signatureHeader =
      req.headers.get("X-Webhook-Signature") ||
      req.headers.get("x-webhook-signature");

    const timestampHeader =
      req.headers.get("X-Webhook-Timestamp") ||
      req.headers.get("x-webhook-timestamp");

    const alternateTimestamp =
      req.headers.get("X-Timestamp") ||
      req.headers.get("x-timestamp");

    console.log(
      "X-Webhook-Signature present:",
      !!signatureHeader,
    );

    console.log(
      "X-Webhook-Timestamp present:",
      !!timestampHeader,
    );

    console.log(
      "X-Timestamp present:",
      !!alternateTimestamp,
    );

    console.log(
      "Signature length:",
      signatureHeader?.length ?? 0,
    );

    console.log(
      "Timestamp length:",
      timestampHeader?.length ?? 0,
    );

    // =====================================================
    // 4. DETERMINE TIMESTAMP
    // =====================================================

    const timestamp =
      timestampHeader ||
      alternateTimestamp ||
      null;

    console.log(
      "Timestamp selected:",
      maskValue(timestamp),
    );

    if (!timestamp) {
      console.error(
        "ERROR: No webhook timestamp found",
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing webhook timestamp",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // =====================================================
    // 5. SIGNATURE REQUIRED
    // =====================================================

    if (!signatureHeader) {
      console.error(
        "ERROR: No webhook signature found",
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing webhook signature",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // =====================================================
    // 6. NORMALIZE RECEIVED SIGNATURE
    // =====================================================

    let receivedSignature =
      signatureHeader.trim();

    const hadSha256Prefix =
      receivedSignature.startsWith("sha256=");

    if (hadSha256Prefix) {
      receivedSignature =
        receivedSignature.substring(7);
    }

    receivedSignature =
      receivedSignature.trim().toLowerCase();

    console.log(
      "Signature prefix sha256=:",
      hadSha256Prefix,
    );

    console.log(
      "Normalized signature length:",
      receivedSignature.length,
    );

    console.log(
      "Received signature preview:",
      maskValue(receivedSignature),
    );

    // =====================================================
    // 7. BLMPAY DOCUMENTED SIGNING FORMAT
    //
    // timestamp + "." + rawBody
    // =====================================================

    const signedMessage =
      `${timestamp}.${rawBody}`;

    console.log(
      "Signed message length:",
      signedMessage.length,
    );

    console.log(
      "Signed message starts with timestamp:",
      signedMessage.startsWith(`${timestamp}.`),
    );

    // =====================================================
    // 8. CALCULATE EXPECTED HMAC
    // =====================================================

    const expectedSignature =
      await createHmacSha256(
        webhookSecret,
        signedMessage,
      );

    console.log(
      "Expected signature length:",
      expectedSignature.length,
    );

    console.log(
      "Expected signature preview:",
      maskValue(expectedSignature),
    );

    // =====================================================
    // 9. COMPARE
    // =====================================================

    const signatureValid =
      safeEqual(
        receivedSignature,
        expectedSignature.toLowerCase(),
      );

    console.log(
      "==============================================",
    );

    console.log(
      "SIGNATURE VERIFICATION:",
      signatureValid
        ? "VALID"
        : "INVALID",
    );

    console.log(
      "Received signature:",
      maskValue(receivedSignature),
    );

    console.log(
      "Calculated signature:",
      maskValue(expectedSignature),
    );

    console.log(
      "==============================================",
    );

    // =====================================================
    // 10. REJECT INVALID SIGNATURE
    // =====================================================

    if (!signatureValid) {
      console.error(
        "SECURITY CHECK FAILED",
      );

      console.error(
        "The webhook reached Heaven's Books, but the HMAC signature does not match.",
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid webhook signature",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // =====================================================
    // 11. SIGNATURE VALID — NOW PARSE JSON
    // =====================================================

    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error(
        "JSON parsing failed:",
        error,
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON payload",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // =====================================================
    // 12. SAFE EVENT INFORMATION
    // =====================================================

    const event =
      payload?.event ||
      payload?.type ||
      null;

    const data =
      payload?.data ||
      {};

    const reference =
      data?.reference ||
      null;

    const transactionId =
      data?.transaction_id ||
      null;

    const status =
      data?.status ||
      null;

    console.log(
      "==============================================",
    );

    console.log(
      "VERIFIED BLMPAY WEBHOOK",
    );

    console.log(
      "Event:",
      event,
    );

    console.log(
      "Reference:",
      reference,
    );

    console.log(
      "Transaction ID:",
      transactionId,
    );

    console.log(
      "Payment status:",
      status,
    );

    console.log(
      "==============================================",
    );

    // =====================================================
    // TEMPORARY TEST RESPONSE
    //
    // DO NOT UNLOCK BOOKS YET.
    // First we prove signature verification.
    // =====================================================

    return new Response(
      JSON.stringify({
        success: true,
        received: true,
        verified: true,
        event: event,
        reference: reference,
        transaction_id: transactionId,
        status: status,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );

  } catch (error) {
    console.error(
      "==============================================",
    );

    console.error(
      "WEBHOOK FUNCTION ERROR:",
      error,
    );

    console.error(
      "==============================================",
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: "Webhook processing failed",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});