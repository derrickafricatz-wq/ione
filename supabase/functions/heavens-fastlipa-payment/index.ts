import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 180) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, n);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const apiKey = Deno.env.get("FASTLIPA_API_KEY")?.trim();
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!apiKey) return json({ success: false, error: "FASTLIPA_API_KEY is not configured." }, 500);
    if (!url || !anonKey || !serviceKey) return json({ success: false, error: "Supabase server configuration is incomplete." }, 500);
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ success: false, error: "Authentication required." }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ success: false, error: "Invalid or expired login session." }, 401);
    const body = await req.json().catch(() => ({}));
    const bookId = clean(body.book_id, 64), phoneRaw = clean(body.phone_number, 24);
    const first = clean(body.firstname, 80), last = clean(body.lastname, 80);
    const email = clean(body.email || auth.user.email, 254);
    if (!bookId || !phoneRaw) return json({ success: false, error: "book_id and phone_number are required." }, 400);
    const digits = phoneRaw.replace(/\D/g, "");
    const phone = digits.startsWith("0") ? "255" + digits.slice(1) : digits;
    if (!/^255[67][0-9]{8}$/.test(phone)) return json({ success: false, error: "Enter a valid Tanzanian mobile-money number." }, 400);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: book, error: bookError } = await admin.from("heavens_books")
      .select("id,title,price,currency,active,payment_required").eq("id", bookId).eq("active", true).maybeSingle();
    if (bookError) { console.error("FastLipa book lookup failed:", bookError.message); return json({ success: false, error: "Unable to verify this book's price." }, 500); }
    if (!book) return json({ success: false, error: "Book not found or inactive." }, 404);
    const amount = Math.round(Number(book.price));
    if (book.payment_required === false || !Number.isSafeInteger(amount) || amount < 100 || amount > 5000000)
      return json({ success: false, error: "This book price is outside FastLipa's supported TZS range (100–5,000,000)." }, 400);
    const reference = "IONEBOOK-" + crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const webhookUrl = "https://xbemkmvvbkxknuduthsg.supabase.co/functions/v1/heavens-fastlipa-webhook";
    const providerResponse = await fetch("https://api.fastlipa.com/v1/transaction/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ number: phone, amount, reference, name: [first, last].filter(Boolean).join(" ") || email, webhook_url: webhookUrl }),
    });
    const raw = await providerResponse.text();
    let provider: any = {};
    try { provider = raw ? JSON.parse(raw) : {}; } catch { provider = { raw }; }
    if (!providerResponse.ok || provider?.status !== true) {
      console.error("FastLipa create transaction rejected:", providerResponse.status, provider?.code || provider?.message || "unknown");
      return json({ success: false, error: provider?.message || "FastLipa could not start the payment request.", provider_code: provider?.code || null }, providerResponse.status >= 400 && providerResponse.status < 600 ? providerResponse.status : 502);
    }
    const tranid = clean(provider?.data?.tranID || provider?.data?.tranid, 120);
    if (!tranid) return json({ success: false, error: "FastLipa accepted the request but returned no transaction ID. Contact support before trying again.", reference }, 502);
    const { data: order, error: orderError } = await admin.from("book_orders").insert({
      book_id: book.id, customer_id: auth.user.id, customer_email: email || null,
      amount, currency: "TZS", status: "pending", payment_provider: "FastLipa",
      blmpay_reference: reference, blmpay_transaction_id: tranid,
    }).select("id,book_id,customer_id,amount,currency,status,created_at").single();
    if (orderError || !order) {
      console.error("FastLipa transaction created but book order persistence failed:", orderError?.message || "no order returned", reference, tranid);
      return json({ success: false, error: "FastLipa created a payment request, but I|ONE could not save its order. Do not initiate another payment. Contact I|ONE Care with your reference.", reference, tranid }, 500);
    }
    return json({ success: true, provider: "FastLipa", book_id: book.id, book_title: book.title, amount, currency: "TZS", reference, tranid, order_id: order.id, payment_status: provider?.data?.payment_status || "PENDING", payment: provider.data });
  } catch (error) {
    console.error("heavens-fastlipa-payment error:", error instanceof Error ? error.message : "unknown");
    return json({ success: false, error: "FastLipa payment request could not be processed." }, 500);
  }
});