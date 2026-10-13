import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendSubscriptionPush(url, key, details){
  try{
    const r=await fetch((url.replace(/\/$/,""))+"/functions/v1/ione-push",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key},
      body:JSON.stringify({
        action:"service_send",
        title:"I|ONE • SUBSCRIPTION UPDATED",
        body:String(details||"Subscription plans have been updated. Tap to view the current plans.").slice(0,240),
        url:"./?ionePushDestination=subscription",
        tag:"ione-subscription-updated"
      })
    });
    return await r.json().catch(()=>({}));
  }catch(e){
    console.error("subscription push failed",e);
    return {success:false,error:e instanceof Error?e.message:String(e)};
  }
}


async function validAuthoritySession(admin: any, rawToken: unknown): Promise<boolean> {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorityPassword = Deno.env.get("IONE_AUTHORITY_PASSWORD");

    if (!url || !key || !authorityPassword) {
      return json({ success:false, error:"Server configuration is missing." },500);
    }

    const admin = createClient(url, key, { auth:{autoRefreshToken:false,persistSession:false} });
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const action = String(body?.action || "get").trim().toLowerCase();

    if (action === "get") {
      const { data, error } = await admin
        .from("ione_subscription_plans")
        .select("id,name,days,amount,currency,active,updated_at")
        .eq("active", true)
        .order("days", { ascending:true });

      if (error) return json({success:false,error:"Could not load subscription prices."},500);
      return json({success:true,plans:data||[]});
    }

    if (action === "verify") {
      if (!(await validAuthoritySession(admin, body?.authority_session))) return json({success:false,error:"Authority Press session expired. Unlock again."},401);
      return json({success:true});
    }

    if (action === "list_subscriptions") {
      if (!(await validAuthoritySession(admin, body?.authority_session))) return json({success:false,error:"Authority Press session expired. Unlock again."},401);
      const { data: subs, error: subsError } = await admin
        .from("ione_upload_subscriptions")
        .select("id,customer_id,phone_number,plan_name,amount,currency,status,starts_at,expires_at,blmpay_reference,blmpay_transaction_id,created_at,updated_at")
        .order("created_at",{ascending:false}).limit(200);
      if(subsError) return json({success:false,error:"Could not load subscription records."},500);
      const customerIds=[...new Set((subs||[]).map(x=>String(x.customer_id||"")).filter(Boolean))];
      let customers=[];
      if(customerIds.length){
        const {data,error}=await admin.from("ione_upload_customers").select("id,phone_number,customer_name").in("id",customerIds);
        if(error) return json({success:false,error:"Could not load customer records."},500);
        customers=data||[];
      }
      const byId=new Map(customers.map(x=>[String(x.id),x]));
      const records=(subs||[]).map(x=>({...x,customer_name:byId.get(String(x.customer_id||""))?.customer_name||"I|ONE USER",customer_phone:byId.get(String(x.customer_id||""))?.phone_number||x.phone_number||""}));
      return json({success:true,records});
    }

    if (action === "update") {
      if (!(await validAuthoritySession(admin, body?.authority_session))) {
        return json({success:false,error:"Unauthorized authority access."},401);
      }

      const plans = Array.isArray(body?.plans) ? body.plans : [];
      const allowed = new Set(["2weeks","1month","3months"]);
      if (plans.length !== 3 || plans.some(p => !allowed.has(String(p?.id))) || new Set(plans.map(p=>String(p?.id))).size !== 3) {
        return json({success:false,error:"Invalid subscription plan set."},400);
      }

      if (plans.some(p => String(p?.amount ?? "").trim() === "")) {
        return json({success:false,error:"All three subscription prices are required."},400);
      }

      const normalized = plans.map(p => ({
        id:String(p.id),
        amount:Number(p.amount),
      }));

      if (normalized.some(p => !Number.isFinite(p.amount) || p.amount < 0 || !Number.isInteger(p.amount))) {
        return json({success:false,error:"Prices must be whole TZS amounts of zero or more."},400);
      }

      const {data:before,error:beforeError}=await admin
        .from("ione_subscription_plans").select("id,amount").in("id",normalized.map(p=>p.id));
      if(beforeError) return json({success:false,error:"Could not read current subscription prices."},500);
      const beforeMap=new Map((before||[]).map(p=>[String(p.id),Number(p.amount)]));
      const changed=normalized.filter(p=>beforeMap.get(p.id)!==p.amount);
      for (const p of normalized) {
        const { error } = await admin
          .from("ione_subscription_plans")
          .update({amount:p.amount,updated_at:new Date().toISOString()})
          .eq("id",p.id);
        if (error) return json({success:false,error:"Could not save subscription prices."},500);
      }

      const { data, error } = await admin
        .from("ione_subscription_plans")
        .select("id,name,days,amount,currency,active,updated_at")
        .eq("active",true)
        .order("days",{ascending:true});

      if (error) return json({success:false,error:"Prices saved, but could not reload them."},500);
      let push=null;
      if(changed.length){
        const finalPlans=(data||[]).filter(p=>["2weeks","1month","3months"].includes(String(p.id)));
        const labels={ "2weeks":"2 WEEKS", "1month":"1 MONTH", "3months":"3 MONTHS" };
        const details=finalPlans.map(p=>String(labels[p.id]||p.name||p.id)+": TZS "+Number(p.amount||0).toLocaleString("en-US")).join(" • ");
        push=await sendSubscriptionPush(url,key,"LIVE PRICES: "+details+" • Tap to view plans and make payment.");
      }
      return json({success:true,plans:data||[],push});
    }

    return json({success:false,error:"Unknown action."},400);
  } catch (e) {
    return json({success:false,error:e instanceof Error ? e.message : "Unexpected server error."},500);
  }
});