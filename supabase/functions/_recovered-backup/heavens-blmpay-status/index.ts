import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body:any, status=200){
  return new Response(JSON.stringify(body), {
    status, headers:{...corsHeaders,"Content-Type":"application/json"}
  });
}

function paymentStatus(payload:any){
  // BLMPay may return a top-level response envelope such as {status:"success"}
  // while the actual payment is still {data:{status:"pending"}}. The nested
  // transaction status is authoritative for unlocking a digital book.
  const candidates = [
    payload?.data?.payment?.status,
    payload?.data?.data?.status,
    payload?.data?.status,
    payload?.payment?.data?.status,
    payload?.payment?.status,
    payload?.status
  ];
  const found=candidates.find(v=>v!==undefined && v!==null && String(v).trim());
  return found ? String(found).trim().toLowerCase() : "";
}

function paymentReference(payload:any){
  const candidates = [
    payload?.reference, payload?.payment_reference, payload?.blmpay_reference,
    payload?.payment?.reference, payload?.payment?.payment_reference,
    payload?.payment?.data?.reference, payload?.payment?.data?.payment_reference,
    payload?.data?.reference, payload?.data?.payment_reference,
    payload?.data?.payment?.reference, payload?.data?.payment?.payment_reference,
    payload?.data?.payment?.data?.reference, payload?.data?.payment?.data?.payment_reference
  ];
  const found=candidates.find(v=>v!==undefined && v!==null && String(v).trim());
  return found ? String(found).trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:corsHeaders});
  if (req.method !== "POST") return json({success:false,error:"POST required"},405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({success:false,error:"Missing authorization."},401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {global:{headers:{Authorization:auth}}}
    );
    const {data:{user},error:userError}=await anon.auth.getUser();
    if(userError || !user) return json({success:false,error:"Unauthorized."},401);

    const body=await req.json().catch(()=>({}));
    let reference=String(body?.reference || body?.payment_reference || body?.blmpay_reference || "").trim();
    const bookId=String(body?.book_id || "").trim();

    // If the browser lost localStorage, recover the latest order/reference from
    // the server using the authenticated anonymous customer id.
    if(!reference && bookId){
      const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if(!serviceKey) return json({success:false,error:"SUPABASE_SERVICE_ROLE_KEY is not configured."});

      const admin=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey);
      const {data:orders,error:orderError}=await admin
        .from("book_orders")
        .select("id,book_id,customer_id,amount,currency,status,blmpay_reference,blmpay_transaction_id,created_at,paid_at")
        .eq("book_id",bookId)
        .eq("customer_id",user.id)
        .order("created_at",{ascending:false})
        .limit(1);

      if(orderError) return json({success:false,error:"Could not look up the server payment order.",details:orderError.message});
      const order=orders?.[0];
      if(!order?.blmpay_reference){
        return json({success:false,error:"No server payment order/reference was found for this book.",book_id:bookId});
      }
      reference=String(order.blmpay_reference).trim();
    }

    if(!reference) return json({success:false,error:"Missing BLMPay payment reference or book_id."});

    const apiKey=Deno.env.get("BLM_PAY_API_KEY_HEAVENS");
    if(!apiKey) return json({success:false,error:"BLMPay API key is not configured."});

    const response=await fetch(`https://pay.blmtec.co.tz/api/v1/payments/${encodeURIComponent(reference)}`,{
      method:"GET",
      headers:{
        "Authorization":`Bearer ${apiKey}`,
        "Accept":"application/json",
        "X-BLMPay-Origin":"https://xbemkmvvbkxknuduthsg.supabase.co"
      }
    });

    const raw=await response.text();
    let payload:any={};
    try{payload=raw?JSON.parse(raw):{};}catch{payload={raw};}

    if(!response.ok){
      console.error("BLMPay status HTTP error",response.status,payload);
      return json({success:false,error:"BLMPay status request failed",http_status:response.status,details:payload,reference});
    }

    const status=paymentStatus(payload);
    const payment=payload?.data || payload?.payment || payload;

    // Once BLMPay confirms payment, synchronize the server order/access too.
    // Fail clearly if persistence fails: a paid customer must not be told that
    // access is ready when the server-side access record was not saved.
    if(["completed","paid"].includes(status) && bookId){
      const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if(!serviceKey) {
        console.error("SUPABASE_SERVICE_ROLE_KEY is missing during paid-order synchronization.");
        return json({success:false,error:"Payment was confirmed, but book access could not be synchronized. Please contact support.",reference,book_id:bookId,status},500);
      }

      const admin=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey);
      const {data:orders,error:lookupError}=await admin
        .from("book_orders")
        .select("id,book_id,customer_id")
        .eq("book_id",bookId)
        .eq("customer_id",user.id)
        .eq("blmpay_reference",reference)
        .order("created_at",{ascending:false})
        .limit(1);

      if(lookupError) {
        console.error("Paid book order lookup failed:",lookupError);
        return json({success:false,error:"Payment was confirmed, but the order could not be verified.",reference,book_id:bookId,status},500);
      }

      const order=orders?.[0];
      if(!order) {
        console.error("Paid BLMPay reference has no matching order for authenticated customer/book.");
        return json({success:false,error:"Payment was confirmed, but no matching book order was found. Please contact support.",reference,book_id:bookId,status},409);
      }

      const {error:updateError}=await admin.from("book_orders").update({
        status:"paid",
        blmpay_transaction_id:String(payment?.transaction_id || payment?.transactionId || payment?.id || "") || null,
        paid_at:new Date().toISOString()
      }).eq("id",order.id);

      if(updateError) {
        console.error("Could not mark book order paid:",updateError);
        return json({success:false,error:"Payment was confirmed, but the order status could not be saved.",reference,book_id:bookId,status},500);
      }

      const {error:accessError}=await admin.from("book_access").upsert({
        book_id:bookId,
        customer_id:user.id,
        order_id:order.id
      },{onConflict:"book_id,customer_id"});

      if(accessError) {
        console.error("Could not create book access record:",accessError);
        return json({success:false,error:"Payment was confirmed, but book access could not be saved. Please contact support.",reference,book_id:bookId,status},500);
      }
    }

    return json({
      success:true,
      reference,
      book_id:bookId || null,
      status,
      blmpay_status:status,
      payment,
      raw_response:payload
    });
  }catch(err){
    console.error("heavens-blmpay-status error",err);
    return json({success:false,error:err instanceof Error?err.message:String(err)});
  }
});
