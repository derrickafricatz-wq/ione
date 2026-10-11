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
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required" }, 405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ success: false, error: "Authentication required." }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ success: false, error: "Server configuration is incomplete." }, 500);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Unauthorized." }, 401);
    const admin = createClient(url, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "my_books") {
      const { data, error } = await admin.from("heavens_books")
        .select("id,title,category,price,currency,front_cover,pdf_path,payment_required,active,created_at")
        .eq("author_id", user.id).order("created_at", { ascending: false });
      if (error) return json({ success: false, error: "Could not load your published books." }, 500);
      return json({ success: true, books: data || [] });
    }

    if (action === "my_access") {
      const [{ data: access, error: accessError }, { data: orders, error: orderError }] = await Promise.all([
        admin.from("book_access").select("book_id").eq("customer_id", user.id),
        admin.from("book_orders").select("book_id").eq("customer_id", user.id).in("status", ["paid", "completed"])
      ]);
      if (accessError || orderError) return json({ success: false, error: "Could not restore your saved book access." }, 500);
      const ids = Array.from(new Set([...(access || []).map((x: any) => String(x.book_id)), ...(orders || []).map((x: any) => String(x.book_id))]));
      return json({ success: true, book_ids: ids });
    }

    const bookId = String(body?.book_id || "").trim();
    if (!validId(bookId)) return json({ success: false, error: "A valid book_id is required." }, 400);

    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (body.price !== undefined) {
        const price = Number(body.price);
        if (!Number.isInteger(price) || price < 0 || price > 1000000000) return json({ success: false, error: "Enter a whole-number price of 0 TZS or more." }, 400);
        patch.price = price;
      }
      if (body.payment_required !== undefined) {
        if (typeof body.payment_required !== "boolean") return json({ success: false, error: "Payment setting must be on or off." }, 400);
        patch.payment_required = body.payment_required;
      }
      if (body.front_cover !== undefined) {
        if (body.front_cover !== null && (typeof body.front_cover !== "string" || body.front_cover.length > 1200000)) return json({ success: false, error: "Cover image is too large." }, 400);
        patch.front_cover = body.front_cover;
      }
      if (!Object.keys(patch).length) return json({ success: false, error: "No book changes were supplied." }, 400);
      const { data, error } = await admin.from("heavens_books").update(patch).eq("id", bookId).eq("author_id", user.id)
        .select("id,title,category,price,currency,front_cover,pdf_path,payment_required,active,created_at").maybeSingle();
      if (error) return json({ success: false, error: "Could not save the book settings." }, 500);
      if (!data) return json({ success: false, error: "This book is not owned by your current author account." }, 404);
      return json({ success: true, book: data });
    }

    if (action === "delete") {
      const { data: book, error: lookupError } = await admin.from("heavens_books")
        .select("id,pdf_path,author_id").eq("id", bookId).eq("author_id", user.id).maybeSingle();
      if (lookupError) return json({ success: false, error: "Could not verify book ownership." }, 500);
      if (!book) return json({ success: false, error: "This book is not owned by your current author account." }, 404);

      const { error: deleteError } = await admin.from("heavens_books").delete().eq("id", bookId).eq("author_id", user.id);
      if (deleteError) return json({ success: false, error: "Could not delete the book record." }, 500);

      let storageWarning = "";
      if (book.pdf_path) {
        const { error: storageError } = await admin.storage.from("paid-book-pdfs").remove([book.pdf_path]);
        if (storageError) {
          storageWarning = " The listing and its payment/access records were deleted, but the private PDF file needs storage cleanup.";
          console.error("PDF storage cleanup failed after book deletion:", storageError);
        }
      }
      return json({ success: true, deleted: true, warning: storageWarning || undefined });
    }

    return json({ success: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error("book-library-manage error:", error);
    return json({ success: false, error: "Unexpected server error." }, 500);
  }
});
