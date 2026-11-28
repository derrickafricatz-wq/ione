import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BLMPAY_API_URL = "https://pay.blmtec.co.tz/api/v1/payments";
const BLMPAY_ORIGIN = "https://xbemkmvvbkxknuduthsg.supabase.co";
const WEBHOOK_URL =
  "https://xbemkmvvbkxknuduthsg.supabase.co/functions/v1/heavens-blmpay-webhook";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getReference(payload: any): string {
  const candidates = [
    payload?.reference,
    payload?.payment_reference,
    payload?.blmpay_reference,
    payload?.payment?.reference,
    payload?.payment?.payment_reference,
    payload?.payment?.data?.reference,
    payload?.payment?.data?.payment_reference,
    payload?.data?.reference,
    payload?.data?.payment_reference,
    payload?.data?.payment?.reference,
    payload?.data?.payment?.payment_reference,
    payload?.data?.payment?.data?.reference,
    payload?.data?.payment?.data?.payment_reference,
  ];
  const found = candidates.find(
    (v) => v !== undefined && v !== null && String(v).trim()
  );
  return found ? String(found).trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = Deno.env.get("BLM_PAY_API_KEY_HEAVENS");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!apiKey) {
      console.error("Missing BLM_PAY_API_KEY_HEAVENS");
      return json({
        success: false,
        error: "BLM Pay API key is not configured",
      }, 500);
    }

    if (!serviceRoleKey || !supabaseUrl || !anonKey) {
      console.error("Missing Supabase server configuration");
      return json({
        success: false,
        error: "Supabase server configuration is incomplete",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return json({
        success: false,
        error: "Authentication required",
      }, 401);
    }

    // Verify the caller's Supabase session.
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return json({
        success: false,
        error: "Invalid or expired login session",
      }, 401);
    }

    // Service-role client is used only inside this Edge Function.
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    const bookId = String(body?.book_id || "").trim();
    const phoneNumber = String(body?.phone_number || "").trim();
    const firstname = String(body?.firstname || "").trim();
    const lastname = String(body?.lastname || "").trim();
    const email = String(body?.email || user.email || "").trim();

    if (!bookId || !phoneNumber || !firstname || !lastname || !email) {
      return json({
        success: false,
        error:
          "book_id, phone_number, firstname, lastname and email are required",
      }, 400);
    }

    /*
     * IMPORTANT:
     * The price is read from the database, never trusted from the browser.
     */
    const { data: book, error: bookError } = await supabase
      .from("heavens_books")
      .select("id, title, price, currency, active, author_id")
      .eq("id", bookId)
      .eq("active", true)
      .maybeSingle();

    if (bookError) {
      console.error("Book lookup error:", bookError);
      return json({
        success: false,
        error: "Unable to find the book",
      }, 500);
    }

    if (!book) {
      return json({
        success: false,
        error: "Book not found or inactive",
      }, 404);
    }

    const amount = Number(book.price);

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({
        success: false,
        error: "This book does not have a valid payment price",
      }, 400);
    }

    const paymentAmount = Math.round(amount);

    /*
     * Create the BLMPay request first.
     */
    const idempotencyKey =
      `HB-${crypto.randomUUID().replace(/-/g, "").slice(0, 26)}`;

    const blmResponse = await fetch(BLMPAY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-BLMPay-Origin": BLMPAY_ORIGIN,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        payment_type: "mobile",
        details: {
          amount: paymentAmount,
          currency: "TZS",
        },
        phone_number: phoneNumber,
        customer: {
          firstname,
          lastname,
          email,
          country: "TZ",
        },
        webhook_url: WEBHOOK_URL,
        metadata: {
          book_id: book.id,
          user_id: user.id,
          book_title: book.title,
          amount: paymentAmount,
          currency: "TZS",
          source: "heavens_books",
        },
      }),
    });

    const responseText = await blmResponse.text();
    let blmData: any = {};
    try {
      blmData = responseText ? JSON.parse(responseText) : {};
    } catch {
      blmData = { raw: responseText };
    }

    console.log("BLMPay response:", JSON.stringify(blmData));

    if (!blmResponse.ok) {
      return json({
        success: false,
        error: "BLM Pay payment request failed",
        blmpay: blmData,
      }, blmResponse.status);
    }

    /*
     * CRITICAL FIX:
     * Save the order immediately, including the authenticated
     * anonymous Supabase user's ID and the BLMPay reference.
     *
     * This is what allows CHECK to recover the payment later,
     * even after localStorage is cleared.
     */
    const reference = getReference(blmData);

    if (!reference) {
      console.error(
        "BLMPay accepted payment but no reference was found:",
        JSON.stringify(blmData)
      );

      return json({
        success: false,
        error:
          "BLMPay accepted the request but did not return a payment reference.",
        blmpay: blmData,
      }, 502);
    }

    const { data: order, error: orderError } = await supabase
      .from("book_orders")
      .insert({
        book_id: book.id,
        customer_id: user.id,
        customer_email: email,
        amount: paymentAmount,
        currency: "TZS",
        status: "pending",
        blmpay_reference: reference,
        payment_provider: "BLMPay",
      })
      .select(
        "id,book_id,customer_id,amount,currency,status,blmpay_reference,created_at"
      )
      .single();

    if (orderError) {
      /*
       * Do NOT tell the customer that payment is safe to recover if
       * the order could not be saved. The BLMPay request already exists,
       * so we return the reference for the current browser to continue,
       * but clearly report that server persistence failed.
       */
      console.error(
        "BOOK ORDER INSERT FAILED:",
        orderError
      );

      return json({
        success: false,
        error:
          "Payment was created by BLMPay, but the server could not save the payment order. Do not pay again. Keep this payment reference and contact support.",
        reference,
        blmpay: blmData,
        database_error: orderError.message,
      }, 500);
    }

    console.log(
      "Heavens Books order saved:",
      JSON.stringify(order)
    );

    return json({
      success: true,
      book_id: book.id,
      book_title: book.title,
      amount: paymentAmount,
      currency: "TZS",
      reference,
      order_id: order.id,
      payment: blmData,
    });
  } catch (error) {
    console.error("Heavens BLMPay payment error:", error);

    return json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Payment request could not be created",
    }, 500);
  }
});
