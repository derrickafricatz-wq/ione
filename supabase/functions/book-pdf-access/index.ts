import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ success: false, error: "Authentication required." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return json({ success: false, error: "Server configuration is incomplete." }, 500);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Unauthorized." }, 401);

    const body = await req.json().catch(() => ({}));
    const bookId = String(body?.book_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookId)) {
      return json({ success: false, error: "A valid book_id is required." }, 400);
    }

    const admin = createClient(url, serviceKey);
    const { data: book, error: bookError } = await admin
      .from("heavens_books")
      .select("id, author_id, pdf_path, active")
      .eq("id", bookId)
      .eq("active", true)
      .maybeSingle();

    if (bookError) return json({ success: false, error: "Could not verify the book." }, 500);
    if (!book?.pdf_path) return json({ success: false, error: "This book has no uploaded PDF." }, 404);

    // Authors may preview their own PDF. Buyers need a server-side paid order/access record.
    let allowed = book.author_id === user.id;
    if (!allowed) {
      const { data: access, error: accessError } = await admin
        .from("book_access")
        .select("book_id")
        .eq("book_id", bookId)
        .eq("customer_id", user.id)
        .limit(1)
        .maybeSingle();

      if (accessError) return json({ success: false, error: "Could not verify purchase access." }, 500);
      allowed = !!access;

      if (!allowed) {
        const { data: paidOrder, error: orderError } = await admin
          .from("book_orders")
          .select("id")
          .eq("book_id", bookId)
          .eq("customer_id", user.id)
          .eq("status", "paid")
          .limit(1)
          .maybeSingle();
        if (orderError) return json({ success: false, error: "Could not verify payment." }, 500);
        allowed = !!paidOrder;
      }
    }

    if (!allowed) return json({ success: false, error: "Payment is not confirmed for this book." }, 403);

    const { data: signed, error: signedError } = await admin.storage
      .from("paid-book-pdfs")
      .createSignedUrl(book.pdf_path, 300);

    if (signedError || !signed?.signedUrl) {
      return json({ success: false, error: "Could not open the protected PDF." }, 500);
    }

    return json({ success: true, url: signed.signedUrl, expires_in: 300 });
  } catch (error) {
    console.error("book-pdf-access error:", error);
    return json({ success: false, error: "Unexpected server error." }, 500);
  }
});
