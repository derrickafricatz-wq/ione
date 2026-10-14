import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TERMS_VERSION = "ione-manual-subscription-v1";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function normalizeTanzaniaPhone(value: string) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("255")) return phone;
  if (phone.startsWith("0")) return "255" + phone.slice(1);
  if (phone.startsWith("7") || phone.startsWith("6")) return "255" + phone;
  return phone;
}
function validTanzaniaPhone(phone: string) { return /^255[67]\d{8}$/.test(phone); }
async function validAuthoritySession(admin: any, rawToken: unknown): Promise<boolean> {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ success:false, error:"Server configuration is missing." }, 500);
    const admin = createClient(url, key, { auth:{ autoRefreshToken:false, persistSession:false } });
    let body:any={}; try { body=await req.json(); } catch { return json({success:false,error:"Invalid JSON request."},400); }
    const action=String(body?.action||"").trim().toLowerCase();
    const now=new Date();

    if (action === "submit") {
      const userId=String(body?.user_id||"").trim();
      const customerName=String(body?.customer_name||"").trim().replace(/\s+/g," ");
      const phone=normalizeTanzaniaPhone(String(body?.phone_number||""));
      const planId=String(body?.plan_id||"").trim().toLowerCase();
      const mode=String(body?.request_mode||"publish")==="renew"?"renew":"publish";
      const billboardId=String(body?.billboard_id||"").trim();
      const brandName=String(body?.brand_name||"").trim().slice(0,160);
      if (!/^[0-9a-f-]{36}$/i.test(userId) || customerName.length<2 || customerName.length>120 || !validTanzaniaPhone(phone) || !planId || body?.terms_accepted!==true) {
        return json({success:false,error:"Enter your full name, a valid Tanzania phone number, choose a plan and accept the Terms and Conditions."},400);
      }
      const {data:plan,error:planError}=await admin.from("ione_subscription_plans")
        .select("id,name,days,amount,currency,active").eq("id",planId).eq("active",true).maybeSingle();
      if(planError||!plan) return json({success:false,error:"That subscription plan is not currently available. Refresh and try again."},400);
      let customer;
      const {data:existingCustomer,error:customerLookupError}=await admin.from("ione_upload_customers")
        .select("id,phone_number,customer_name").eq("phone_number",phone).maybeSingle();
      if(customerLookupError) return json({success:false,error:"Could not save customer details."},500);
      if(existingCustomer) {
        const updated=await admin.from("ione_upload_customers").update({customer_name:customerName,updated_at:now.toISOString()})
          .eq("id",existingCustomer.id).select("id,phone_number,customer_name").single();
        if(updated.error) return json({success:false,error:"Could not update customer details."},500);
        customer=updated.data;
      } else {
        const inserted=await admin.from("ione_upload_customers").insert({phone_number:phone,customer_name:customerName})
          .select("id,phone_number,customer_name").single();
        if(inserted.error) {
          // Handle two simultaneous first-time submissions for the same phone safely.
          const retry=await admin.from("ione_upload_customers").select("id,phone_number,customer_name").eq("phone_number",phone).maybeSingle();
          if(retry.error||!retry.data) return json({success:false,error:"Could not save customer details. Please retry."},500);
          customer=retry.data;
        } else customer=inserted.data;
      }
      const {data:pending,error:pendingError}=await admin.from("ione_manual_subscription_requests")
        .select("id,status").eq("customer_id",customer.id).eq("status","pending").maybeSingle();
      if(pendingError) return json({success:false,error:"Could not check existing requests."},500);
      if(pending) return json({success:true,request_id:pending.id,customer_id:customer.id,already_pending:true,message:"Your manual subscription request is already waiting for I|ONE support."});
      const safeBillboardId=/^[0-9a-f-]{36}$/i.test(billboardId)?billboardId:null;
      const {data:request,error:insertError}=await admin.from("ione_manual_subscription_requests").insert({
        customer_id:customer.id,user_id:userId,plan_id:plan.id,plan_name:plan.name,plan_days:plan.days,
        amount:plan.amount,currency:plan.currency||"TZS",request_mode:mode,billboard_id:safeBillboardId,
        brand_name:brandName||null,terms_accepted:true,terms_version:TERMS_VERSION,status:"pending"
      }).select("id,customer_id,plan_id,plan_name,amount,currency,status,created_at").single();
      if(insertError) { console.error("Manual subscription request insert:",insertError); return json({success:false,error:"Could not submit your request. Please try again."},500); }
      return json({success:true,request_id:request.id,customer_id:customer.id,request, message:"Request submitted. Contact I|ONE support after making your manual payment. Access opens after the team verifies payment."});
    }

    if (action === "authority_list") {
      if (!(await validAuthoritySession(admin,body?.authority_session||req.headers.get("x-ione-authority-session")))) return json({success:false,error:"Authority Press session expired. Unlock again."},401);
      const {data:rows,error}=await admin.from("ione_manual_subscription_requests")
        .select("id,customer_id,user_id,plan_id,plan_name,plan_days,amount,currency,request_mode,billboard_id,brand_name,status,subscription_id,approved_at,approved_by,admin_note,created_at,terms_version")
        .order("created_at",{ascending:false}).limit(200);
      if(error) return json({success:false,error:"Could not load manual subscription requests."},500);
      const ids=[...new Set((rows||[]).map((r:any)=>r.customer_id).filter(Boolean))];
      let customers:any[]=[];
      if(ids.length){const c=await admin.from("ione_upload_customers").select("id,phone_number,customer_name").in("id",ids);if(c.error)return json({success:false,error:"Could not load customer details."},500);customers=c.data||[];}
      const map=new Map(customers.map((c:any)=>[String(c.id),c]));
      return json({success:true,requests:(rows||[]).map((r:any)=>({...r,customer_name:map.get(String(r.customer_id))?.customer_name||"I|ONE CUSTOMER",customer_phone:map.get(String(r.customer_id))?.phone_number||""}))});
    }

    if (action === "approve") {
      if (!(await validAuthoritySession(admin,body?.authority_session||req.headers.get("x-ione-authority-session")))) return json({success:false,error:"Authority Press session expired. Unlock again."},401);
      const requestId=String(body?.request_id||"").trim();
      const adminNote=String(body?.admin_note||"").trim().slice(0,1000);
      const {data:r,error:rError}=await admin.from("ione_manual_subscription_requests").select("*").eq("id",requestId).maybeSingle();
      if(rError||!r) return json({success:false,error:"Manual subscription request was not found."},404);
      if(r.status==="approved") return json({success:false,error:"This request has already been approved. Refresh the list to see its subscription."},409);
      if(r.status!=="pending") return json({success:false,error:"This request is already being processed or is not pending."},409);
      // Claim the request before creating an entitlement so two admins cannot grant access twice.
      const claim=await admin.from("ione_manual_subscription_requests").update({status:"processing",updated_at:now.toISOString()})
        .eq("id",r.id).eq("status","pending").select("id").maybeSingle();
      if(claim.error||!claim.data) return json({success:false,error:"Another action is already processing this request. Refresh the list."},409);
      const restorePending=async()=>{await admin.from("ione_manual_subscription_requests").update({status:"pending",updated_at:new Date().toISOString()}).eq("id",r.id).eq("status","processing");};
      // Re-read the customer and plan snapshot from the saved request; never trust client-supplied price or duration.
      const {data:customer,error:cError}=await admin.from("ione_upload_customers").select("id,phone_number,customer_name").eq("id",r.customer_id).single();
      if(cError||!customer){await restorePending();return json({success:false,error:"Customer record is missing."},500);}
      const startsAt=now.toISOString();
      let expiryBase=now.getTime();
      if(r.request_mode==="renew") {
        const active=await admin.from("ione_upload_subscriptions").select("expires_at")
          .eq("customer_id",r.customer_id).eq("status","active").gt("expires_at",startsAt)
          .order("expires_at",{ascending:false}).limit(1).maybeSingle();
        if(active.error){await restorePending();return json({success:false,error:"Could not check the current subscription."},500);}
        if(active.data?.expires_at) expiryBase=Math.max(expiryBase,Date.parse(active.data.expires_at)||expiryBase);
      }
      const actualStarts=new Date(expiryBase).toISOString();
      const expiresAt=new Date(expiryBase+Number(r.plan_days)*86400000).toISOString();
      const {data:sub,error:subError}=await admin.from("ione_upload_subscriptions").insert({
        user_id:r.user_id,customer_id:r.customer_id,phone_number:customer.phone_number,plan_name:r.plan_name,
        amount:r.amount,currency:r.currency,status:"active",starts_at:actualStarts,expires_at:expiresAt,
        blmpay_reference:null,blmpay_transaction_id:null
      }).select("id,customer_id,plan_name,amount,currency,status,starts_at,expires_at").single();
      if(subError) {console.error("Manual subscription activation:",subError);await restorePending();return json({success:false,error:"Payment can be confirmed, but subscription activation failed. Please retry."},500);}
      // Match the existing automatic renewal behavior: extend the existing billboard's
      // end_at/end_date so it returns to the public Market feed without republishing.
      let previousBillboard:any=null;
      if (r.request_mode === "renew" && r.billboard_id) {
        const previous = await admin.from("afrilink_billboards").select("id,end_date,end_at")
          .eq("id",r.billboard_id).eq("owner_id",r.user_id).maybeSingle();
        if(previous.error||!previous.data){
          await admin.from("ione_upload_subscriptions").delete().eq("id",sub.id);
          await restorePending();
          return json({success:false,error:"Subscription was not activated because the original billboard could not be safely renewed. Refresh and contact support."},409);
        }
        previousBillboard=previous.data;
        const renewal = await admin.from("afrilink_billboards")
          .update({ end_date: expiresAt.slice(0,10), end_at: expiresAt, updated_at: now.toISOString() })
          .eq("id", r.billboard_id).eq("owner_id", r.user_id).select("id").maybeSingle();
        if (renewal.error || !renewal.data) {
          await admin.from("ione_upload_subscriptions").delete().eq("id", sub.id);
          await restorePending();
          return json({success:false,error:"Subscription was not activated because the original billboard could not be safely renewed. Refresh and contact support."},409);
        }
      }
      const {data:updated,error:updateError}=await admin.from("ione_manual_subscription_requests").update({
        status:"approved",subscription_id:sub.id,approved_at:now.toISOString(),approved_by:"Authority Press",admin_note:adminNote||null,updated_at:now.toISOString()
      }).eq("id",r.id).eq("status","processing").select("id").maybeSingle();
      if(updateError||!updated) {
        // Roll back the entitlement if finalization fails; the request remains auditable.
        await admin.from("ione_upload_subscriptions").delete().eq("id",sub.id);
        if(previousBillboard){
          await admin.from("afrilink_billboards").update({end_date:previousBillboard.end_date,end_at:previousBillboard.end_at})
            .eq("id",previousBillboard.id).eq("owner_id",r.user_id);
        }
        await restorePending();
        return json({success:false,error:"Request approval could not be finalized. Refresh and try again."},409);
      }
      return json({success:true,subscription:sub,request_id:r.id,message:"Manual subscription approved and access activated."});
    }

    if (action === "reject") {
      if (!(await validAuthoritySession(admin,body?.authority_session||req.headers.get("x-ione-authority-session")))) return json({success:false,error:"Authority Press session expired. Unlock again."},401);
      const id=String(body?.request_id||"").trim();
      const {data,error}=await admin.from("ione_manual_subscription_requests").update({status:"rejected",admin_note:String(body?.admin_note||"").trim().slice(0,1000)||null,updated_at:now.toISOString()})
        .eq("id",id).eq("status","pending").select("id").maybeSingle();
      if(error||!data) return json({success:false,error:"Request could not be rejected; refresh the list."},409);
      return json({success:true});
    }
    return json({success:false,error:"Unsupported action."},400);
  } catch (e) {
    console.error("ione-manual-subscriptions:",e);
    return json({success:false,error:"Manual subscription request failed. Please retry."},500);
  }
});
