import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const normPhone = (v: unknown) => {
  let s = String(v || "").replace(/[\s()+-]/g, "");
  if (s.startsWith("0")) s = "255" + s.slice(1);
  if (s.startsWith("7") || s.startsWith("6")) s = "255" + s;
  return /^255[67]\d{8}$/.test(s) ? s : "";
};
const parseApi = (v: any) => v?.data?.payout || v?.data || v?.payout || v || {};
const safeText = (v: unknown, max = 300) => String(v || "").trim().slice(0, max);


async function validAuthoritySession(admin: any, rawToken: unknown): Promise<boolean> {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString())
    .is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const authorityPassword = Deno.env.get("IONE_AUTHORITY_PASSWORD")?.trim();
    const apiKey = (Deno.env.get("BLM_PAY_PAYOUT_API_KEY") || Deno.env.get("BLM_PAY_API_KEY_HEAVENS"))?.trim();
    if (!url || !serviceKey || !authorityPassword || !apiKey) {
      return json({ success: false, error: "Server configuration is missing. Verify IONE_AUTHORITY_PASSWORD and BLMPay payout credentials." }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (!(await validAuthoritySession(admin, body?.authority_session))) {
      return json({ success: false, error: "Authority Press session expired. Unlock again." }, 401);
    }
    const action = safeText(body?.action || "list", 40).toLowerCase();
    const blmOrigin = "https://intoione.space";
    const apiHeaders = { Authorization: "Bearer " + apiKey, "X-BLMPay-Origin": blmOrigin, "Content-Type": "application/json" };

    const quoteFee = async (amount: number) => {
      const res = await fetch("https://pay.blmtec.co.tz/api/v1/payouts/fee?amount=" + encodeURIComponent(String(amount)) + "&channel=mobile", {
        headers: { Authorization: "Bearer " + apiKey, "X-BLMPay-Origin": blmOrigin, Accept: "application/json" },
      });
      const raw = await res.text(); let payload: any = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch {}
      if (!res.ok) throw new Error("BLMPay fee quote failed.");
      const p = parseApi(payload);
      const fee = Math.max(0, Math.floor(Number(p?.fee_amount ?? p?.fees?.value ?? p?.fee?.value ?? 0)));
      const total = Math.floor(Number(p?.total_debit ?? p?.total?.value ?? amount + fee));
      if (!Number.isFinite(total) || total < amount) throw new Error("BLMPay returned an invalid fee quote.");
      return { fee, total };
    };
    const lookupRecipient = async (phone: string) => {
      const response = await fetch("https://pay.blmtec.co.tz/api/v1/payouts/name-lookup", {
        method: "POST",
        headers: { ...apiHeaders, Accept: "application/json" },
        body: JSON.stringify({ channel: "mobile", account_number: phone }),
      });
      const raw = await response.text(); let payload: any = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch {}
      if (!response.ok) throw new Error("BLMPay could not verify this mobile-money recipient. Check the number and payout API permissions.");
      const p = parseApi(payload);
      const name = safeText(p?.account_name || p?.recipient?.name || p?.name, 160);
      if (!name) throw new Error("BLMPay did not return a verified recipient name. No payout can be sent.");
      return name;
    };
    const getEarnedRows = async (authorId: string, urgent: boolean) => {
      let q = admin.from("ione_author_earnings")
        .select("id,order_id,book_id,author_id,sale_amount_tzs,author_share_tzs,status,available_at")
        .eq("author_id", authorId).in("status", ["pending", "available"]).order("earned_at", { ascending: true });
      if (!urgent) q = q.lte("available_at", new Date().toISOString());
      const { data, error } = await q;
      if (error) throw new Error("Could not read author earnings.");
      return data || [];
    };
    const resolveAuthorName = async (authorId: string, rows: any[]) => {
      const { data } = await admin.from("authors").select("full_name,user_id").eq("user_id", authorId).maybeSingle();
      if (data?.full_name) return String(data.full_name);
      const bookIds = [...new Set(rows.map((x) => x.book_id))];
      if (bookIds.length) {
        const { data: books } = await admin.from("heavens_books").select("author_name").in("id", bookIds).limit(1);
        if (books?.[0]?.author_name) return String(books[0].author_name);
      }
      return "Author " + authorId.slice(0, 8);
    };
    const settlePending = async () => {
      const { data: pending, error } = await admin.from("ione_author_payouts")
        .select("id,payout_reference,status").eq("status", "pending").not("payout_reference", "is", null).limit(30);
      if (error) throw new Error("Could not load pending author payouts.");
      for (const p of pending || []) {
        try {
          const response = await fetch("https://pay.blmtec.co.tz/api/v1/payouts/" + encodeURIComponent(String(p.payout_reference)), {
            headers: { Authorization: "Bearer " + apiKey, "X-BLMPay-Origin": url, Accept: "application/json" },
          });
          if (!response.ok) continue;
          const payload = await response.json(); const d = parseApi(payload);
          const status = String(d?.status || payload?.status || "pending").toLowerCase();
          if (["completed", "failed", "reversed"].includes(status)) {
            await admin.from("ione_author_payouts").update({ status, provider_response: payload, completed_at: status === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", p.id);
            if (status === "completed") {
              await admin.from("ione_author_earnings").update({ status: "paid", updated_at: new Date().toISOString() }).eq("payout_id", p.id);
            } else {
              await admin.from("ione_author_earnings").update({ status: "available", payout_id: null, updated_at: new Date().toISOString() }).eq("payout_id", p.id);
            }
          }
        } catch (e) { console.error("Author payout reconciliation failed", p.id, e); }
      }
    };

    if (action === "list") {
      await settlePending();
      const { data: earnings, error } = await admin.from("ione_author_earnings")
        .select("id,order_id,book_id,author_id,sale_amount_tzs,author_share_tzs,provider_fee_share_tzs,platform_share_tzs,status,earned_at,available_at")
        .order("earned_at", { ascending: false }).limit(1000);
      if (error) return json({ success: false, error: "Could not load the author earnings ledger." }, 500);
      const { data: payouts, error: payoutError } = await admin.from("ione_author_payouts")
        .select("id,author_id,author_name,recipient_phone,recipient_network,amount_tzs,provider_fee_tzs,total_debit_tzs,payout_reference,status,payout_reason,requested_at,completed_at")
        .order("requested_at", { ascending: false }).limit(100);
      if (payoutError) return json({ success: false, error: "Could not load payout history." }, 500);
      const groups = new Map<string, any>();
      for (const e of earnings || []) {
        const key = String(e.author_id);
        if (!groups.has(key)) groups.set(key, { author_id: key, sale_count: 0, sales_tzs: 0, author_earnings_tzs: 0, provider_fee_share_tzs: 0, platform_share_tzs: 0, eligible_tzs: 0, pending_tzs: 0, processing_tzs: 0, paid_tzs: 0 });
        const g = groups.get(key); g.sale_count++; g.sales_tzs += Number(e.sale_amount_tzs || 0); g.author_earnings_tzs += Number(e.author_share_tzs || 0);
        g.provider_fee_share_tzs += Number(e.provider_fee_share_tzs || 0); g.platform_share_tzs += Number(e.platform_share_tzs || 0);
        if (e.status === "available" || (e.status === "pending" && new Date(e.available_at) <= new Date())) g.eligible_tzs += Number(e.author_share_tzs || 0);
        else if (e.status === "pending") g.pending_tzs += Number(e.author_share_tzs || 0);
        if (e.status === "processing") g.processing_tzs += Number(e.author_share_tzs || 0);
        if (e.status === "paid") g.paid_tzs += Number(e.author_share_tzs || 0);
      }
      const list = await Promise.all([...groups.values()].map(async (g) => ({ ...g, author_name: await resolveAuthorName(g.author_id, (earnings || []).filter((e: any) => String(e.author_id) === g.author_id)) })));
      return json({ success: true, merchant: { name: "DERRICK KIPAJI OF AFRIKA & CO", number: "140001788", network: "Airtel Money" }, policy: { author_percent: 95, provider_percent: 3, platform_percent: 2, standard: "monthly", urgent_requires_reason: true }, authors: list, recent_payouts: payouts || [] });
    }

    if (action === "quote") {
      const authorId = safeText(body?.author_id, 80), phone = normPhone(body?.recipient_phone);
      const network = safeText(body?.recipient_network, 30).toUpperCase();
      const reason = safeText(body?.payout_reason || "monthly", 30);
      const explanation = safeText(body?.reason_details, 500);
      const urgent = reason === "urgent_exception";
      if (!authorId || !phone || !["AIRTEL", "MPESA", "TIGO", "HALOTEL"].includes(network)) return json({ success: false, error: "Select an author, enter a valid Tanzanian mobile number, and choose a supported network." }, 400);
      if (!["monthly", "urgent_exception"].includes(reason) || (urgent && explanation.length < 12)) return json({ success: false, error: "Urgent payouts require a clear reason of at least 12 characters." }, 400);
      const rows = await getEarnedRows(authorId, urgent);
      const balance = rows.reduce((s: number, x: any) => s + Number(x.author_share_tzs || 0), 0);
      const amount = balance;
      if (amount < 5000) return json({ success: false, error: "Author's eligible balance is below the 5,000 TZS minimum.", balance_tzs: balance }, 409);
      const recipientName = await lookupRecipient(phone);
      const q = await quoteFee(amount);
      return json({ success: true, author_id: authorId, recipient_phone: phone, recipient_name: recipientName, recipient_network: network, payout_reason: reason, reason_details: explanation, balance_tzs: balance, amount_tzs: amount, provider_fee_tzs: q.fee, total_debit_tzs: q.total, reserved_order_count: rows.length });
    }

    if (action === "send") {
      const authorId = safeText(body?.author_id, 80), phone = normPhone(body?.recipient_phone);
      const network = safeText(body?.recipient_network, 30).toUpperCase();
      const reason = safeText(body?.payout_reason || "monthly", 30), explanation = safeText(body?.reason_details, 500);
      const quotedAmount = Math.floor(Number(body?.amount_tzs));
      const urgent = reason === "urgent_exception";
      if (!authorId || !phone || !["AIRTEL", "MPESA", "TIGO", "HALOTEL"].includes(network) || !Number.isFinite(quotedAmount) || quotedAmount < 5000) return json({ success: false, error: "Invalid payout details." }, 400);
      if (!["monthly", "urgent_exception"].includes(reason) || (urgent && explanation.length < 12)) return json({ success: false, error: "Urgent payouts require a clear reason of at least 12 characters." }, 400);
      const rows = await getEarnedRows(authorId, urgent);
      const balance = rows.reduce((s: number, x: any) => s + Number(x.author_share_tzs || 0), 0);
      if (quotedAmount !== balance) return json({ success: false, error: "The payout must match the full eligible author balance. Recalculate before sending." }, 409);
      const recipientName = await lookupRecipient(phone);
      const q = await quoteFee(quotedAmount);
      const rowIds = rows.map((x: any) => x.id);
      if (!rowIds.length) return json({ success: false, error: "No eligible earnings found." }, 409);
      const authorName = await resolveAuthorName(authorId, rows);
      const payoutId = crypto.randomUUID();
      const idem = "I1-AUTH-" + payoutId.replace(/-/g, "").slice(0, 22);
      const { error: createError } = await admin.from("ione_author_payouts").insert({
        id: payoutId, author_id: authorId, author_name: authorName, recipient_phone: phone, recipient_network: network,
        amount_tzs: quotedAmount, provider_fee_tzs: q.fee, total_debit_tzs: q.total, idempotency_key: idem,
        status: "pending", payout_reason: reason, requested_by: "Authority Press"
      });
      if (createError) return json({ success: false, error: "Could not reserve a payout record. No money was sent." }, 500);
      const { data: reserved, error: reserveError } = await admin.from("ione_author_earnings")
        .update({ status: "processing", payout_id: payoutId, updated_at: new Date().toISOString() })
        .in("id", rowIds).in("status", ["pending", "available"]).select("id");
      if (reserveError || !reserved || reserved.length !== rowIds.length) {
        await admin.from("ione_author_payouts").update({ status: "failed", provider_response: { error: "Could not reserve all earnings; no provider request sent." }, updated_at: new Date().toISOString() }).eq("id", payoutId);
        await admin.from("ione_author_earnings").update({ status: "available", payout_id: null, updated_at: new Date().toISOString() }).eq("payout_id", payoutId);
        return json({ success: false, error: "Earnings changed while reserving this payout. Refresh and calculate again. No money was sent." }, 409);
      }
      const send = await fetch("https://pay.blmtec.co.tz/api/v1/payouts/send", {
        method: "POST",
        headers: { ...apiHeaders, "Idempotency-Key": idem },
        body: JSON.stringify({
          amount: quotedAmount, currency: "TZS", channel: "mobile", recipient_phone: phone, network,
          narration: "I|ONE author earnings payout",
          metadata: { author_id: authorId, payout_id: payoutId, source: "ione_author_earnings", reason, reason_details: explanation }
        })
      });
      const raw = await send.text(); let payload: any = {}; try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
      const pd = parseApi(payload);
      const reference = safeText(pd?.reference || pd?.payout_reference || payload?.reference, 200);
      if (!send.ok || !reference) {
        // Do not release funds on an ambiguous network failure; idempotency allows safe reconciliation.
        if (!send.ok) {
          await admin.from("ione_author_payouts").update({ status: "failed", provider_response: payload, updated_at: new Date().toISOString() }).eq("id", payoutId);
          await admin.from("ione_author_earnings").update({ status: "available", payout_id: null, updated_at: new Date().toISOString() }).eq("payout_id", payoutId);
          return json({ success: false, error: "BLMPay rejected the payout. Earnings were released back to available balance.", provider_status: send.status }, 502);
        }
        await admin.from("ione_author_payouts").update({ provider_response: payload, updated_at: new Date().toISOString() }).eq("id", payoutId);
        return json({ success: false, error: "BLMPay response was ambiguous. Earnings remain reserved; contact support before retrying.", payout_id: payoutId }, 502);
      }
      const providerStatus = String(pd?.status || "pending").toLowerCase();
      await admin.from("ione_author_payouts").update({ payout_reference: reference, status: ["completed","failed","reversed"].includes(providerStatus) ? providerStatus : "pending", provider_response: payload, completed_at: providerStatus === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", payoutId);
      if (providerStatus === "completed") {
        await admin.from("ione_author_earnings").update({ status: "paid", updated_at: new Date().toISOString() }).eq("payout_id", payoutId);
      } else if (["failed","reversed"].includes(providerStatus)) {
        await admin.from("ione_author_earnings").update({ status: "available", payout_id: null, updated_at: new Date().toISOString() }).eq("payout_id", payoutId);
      }
      return json({ success: true, payout_id: payoutId, payout_reference: reference, status: providerStatus, amount_tzs: quotedAmount, provider_fee_tzs: q.fee, total_debit_tzs: q.total, message: "Payout submitted. Verify the final provider status before considering it paid." });
    }

    return json({ success: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error("ione-author-payouts error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unexpected payout error." }, 500);
  }
});