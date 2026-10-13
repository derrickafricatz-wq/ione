import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendUpdatePush(url:string,key:string,event:string,data:any){
  const map:any={
    banners:{title:"I|ONE • NEW BANNER",body:Array.isArray(data?.banners)?data.banners.join(" • "):String(data?.banners||""),url:"./?ionePushDestination=home",tag:"ione-banner-announcement"},
    word_of_day:{title:"I|ONE • WORD OF THE DAY",body:String(data?.word_of_day||""),url:"./?ionePushDestination=home",tag:"ione-word-of-day"},
    top_trending:{title:"I|ONE • TOP TRENDING",body:String(data?.top_trending||""),url:"./?ionePushDestination=market",tag:"ione-top-trending"},
    new_books:{title:"I|ONE • NEW BOOKS",body:String(data?.new_books||""),url:"./?ionePushDestination=books",tag:"ione-new-books"},
    ione_update:{title:"I|ONE • I|ONE UPDATE",body:String(data?.ione_update||""),url:"./",tag:"ione-update"},
    important_notice:{title:"I|ONE • IMPORTANT NOTICE",body:String(data?.important_notice||""),url:"./",tag:"ione-important-notice"}
  };
  const p=map[event]; if(!p||!p.body.trim()) return null;
  try{
    const r=await fetch((url.replace(/\/$/,""))+"/functions/v1/ione-push",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key},
      body:JSON.stringify({action:"service_send",title:p.title,body:p.body.slice(0,240),url:p.url,tag:p.tag})
    });
    return await r.json().catch(()=>({}));
  }catch(e){console.error("I|ONE update push failed",event,e);return {success:false,error:e instanceof Error?e.message:String(e)};}
}


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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorityPassword = Deno.env.get("IONE_AUTHORITY_PASSWORD");
    if (!url || !key || !authorityPassword) return json({ success:false, error:"Server configuration is missing." },500);

    const admin = createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    let body: Record<string,unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body?.action || "get").trim().toLowerCase();

    if (action === "get") {
      const { data,error } = await admin.from("ione_app_banners")
        .select("id,banners,word_of_day,word_of_day_style,top_trending,new_books,ione_update,important_notice,updated_at")
        .eq("id",1).maybeSingle();
      if(error) return json({success:false,error:"Could not load I|ONE communication data."},500);
      const banners=Array.isArray(data?.banners)?data.banners.map((x:unknown)=>String(x||"").trim()).filter(Boolean):[];
      const word_of_day=String(data?.word_of_day||"").trim();
      const allowedStyles=["modern","zigzag","street","elegant","handwritten","classic","luxury","futuristic","tech","impact","retro","marker","arcade","royal","signature","typewriter"];
      const word_of_day_style=allowedStyles.includes(String(data?.word_of_day_style||""))?String(data?.word_of_day_style):"modern";
      const top_trending=String(data?.top_trending||"").trim();
      const new_books=String(data?.new_books||"").trim();
      const ione_update=String(data?.ione_update||"").trim();
      const important_notice=String(data?.important_notice||"").trim();
      return json({success:true,banners,word_of_day,word_of_day_style,top_trending,new_books,ione_update,important_notice});
    }

    if(action==="update"){
      const password=String(body?.password||"");
      if(!(await validAuthoritySession(admin,body?.authority_session))) return json({success:false,error:"Authority Press session expired. Unlock again."},401);
      const raw=Array.isArray(body?.banners)?body.banners:[];
      const banners=raw.map((x:unknown)=>String(x??"").trim()).filter(Boolean).slice(0,10);
      if(!banners.length)return json({success:false,error:"Add at least one banner before saving."},400);
      if(banners.some((x:string)=>x.length>240))return json({success:false,error:"Each banner must be 240 characters or fewer."},400);
      const word_of_day=String(body?.word_of_day||"").trim();
      if(word_of_day.length>300)return json({success:false,error:"Word of the Day must be 300 characters or fewer."},400);
      const allowedStyles=["modern","zigzag","street","elegant","handwritten","classic","luxury","futuristic","tech","impact","retro","marker","arcade","royal","signature","typewriter"];
      const requestedStyle=String(body?.word_of_day_style||"modern").trim().toLowerCase();
      const word_of_day_style=allowedStyles.includes(requestedStyle)?requestedStyle:"modern";
      const top_trending=String(body?.top_trending||"").trim();
      if(top_trending.length>600)return json({success:false,error:"Top Trending must be 600 characters or fewer."},400);
      const new_books=String(body?.new_books||"").trim();
      if(new_books.length>1200)return json({success:false,error:"New Books must be 1200 characters or fewer."},400);
      const ione_update=String(body?.ione_update||"").trim();
      if(ione_update.length>600)return json({success:false,error:"I|ONE Update must be 600 characters or fewer."},400);
      const important_notice=String(body?.important_notice||"").trim();
      if(important_notice.length>600)return json({success:false,error:"Important Notice must be 600 characters or fewer."},400);

      const {data:previous,error:previousError}=await admin.from("ione_app_banners")
        .select("banners,word_of_day,top_trending,new_books,ione_update,important_notice").eq("id",1).maybeSingle();
      if(previousError)return json({success:false,error:"Could not read current I|ONE communication data."},500);
      const {error}=await admin.from("ione_app_banners").upsert({
        id:1,banners,word_of_day,word_of_day_style,top_trending,new_books,ione_update,important_notice,updated_at:new Date().toISOString()
      },{onConflict:"id"});
      if(error)return json({success:false,error:"Could not save I|ONE communication data."},500);
      const requestedEvents=Array.isArray(body?.notify_events)?body.notify_events.map((x:unknown)=>String(x||"").trim()).filter(Boolean):[];
      const validEvents=["banners","word_of_day","top_trending","new_books","ione_update","important_notice"];
      const explicitEvents=requestedEvents.filter((x:string)=>validEvents.includes(x));
      const same=(a:any,b:any)=>JSON.stringify(a??null)===JSON.stringify(b??null);
      const events=explicitEvents.length?explicitEvents:validEvents.filter((event:string)=>{
        if(event==="banners") return !same(previous?.banners,banners);
        return !same(previous?.[event], event==="word_of_day"?word_of_day:event==="top_trending"?top_trending:event==="new_books"?new_books:event==="ione_update"?ione_update:important_notice);
      });
      const pushResults:any[]=[];
      for(const event of events){
        pushResults.push({event,result:await sendUpdatePush(url,key,event,{banners,word_of_day,top_trending,new_books,ione_update,important_notice})});
      }
      return json({success:true,banners,word_of_day,word_of_day_style,top_trending,new_books,ione_update,important_notice,push:pushResults});
    }
    return json({success:false,error:"Unknown action."},400);
  }catch(e){return json({success:false,error:e instanceof Error?e.message:"Unexpected server error."},500);}
});