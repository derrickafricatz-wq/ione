import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-ione-authority-session","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const normalizePhone=(value:unknown)=>{const d=String(value||"").replace(/\D/g,"");if(d.startsWith("255")&&d.length===12)return d;if(d.startsWith("0")&&d.length===10)return "255"+d.slice(1);if((d.startsWith("6")||d.startsWith("7"))&&d.length===9)return "255"+d;return "";};
async function validAuthoritySession(admin:any,raw:unknown):Promise<boolean>{const token=String(raw||"").trim();if(!/^[0-9a-f]{64}$/i.test(token))return false;const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");const {data,error}=await admin.from("ione_authority_sessions").select("token_hash").eq("token_hash",hash).gt("expires_at",new Date().toISOString()).is("revoked_at",null).maybeSingle();return !error&&!!data;}
const AUTHOR_FIELDS="user_id,real_name,known_author_name,phone,email,status,verification_status,verified_at,verified_by,authority_notes,submitted_at,updated_at";
const cleanRecovery=(v:unknown)=>String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
async function sha256(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("");}
function newRecoveryCode(){const bytes=crypto.getRandomValues(new Uint8Array(16));const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();return "I1-"+hex.match(/.{1,4}/g)!.join("-");}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({success:false,error:"POST required."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service)return json({success:false,error:"Author verification service is not configured."},500);
  const body=await req.json().catch(()=>({})),action=String(body?.action||"my_status");
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  if(action.startsWith("authority_")){
   if(!(await validAuthoritySession(admin,body?.authority_session||req.headers.get("x-ione-authority-session"))))return json({success:false,error:"Authority Press session expired. Unlock again."},401);
   if(action==="authority_list"){
    const {data,error}=await admin.from("ione_author_access").select(AUTHOR_FIELDS).order("submitted_at",{ascending:false}).limit(300);
    if(error)return json({success:false,error:"Could not load author registrations."},500);
    return json({success:true,requests:data||[]});
   }
   if(action==="authority_set_status"){
    const userId=String(body?.user_id||""),next=String(body?.status||"");
    if(!/^[0-9a-f-]{36}$/i.test(userId)||!["active","locked","rejected"].includes(next))return json({success:false,error:"Invalid author or verification status."},400);
    const {data:current,error:findError}=await admin.from("ione_author_access").select("*").eq("user_id",userId).maybeSingle();
    if(findError||!current)return json({success:false,error:"Author registration not found."},404);
    const verified=next==="active";
    const patch={status:next,verification_status:verified?"verified":next==="rejected"?"rejected":"locked",verified_at:verified?new Date().toISOString():current.verified_at,verified_by:verified?"Authority Press":current.verified_by,authority_notes:String(body?.authority_notes||"").trim().slice(0,1000)||null,updated_at:new Date().toISOString()};
    const {data,error}=await admin.from("ione_author_access").update(patch).eq("user_id",userId).select(AUTHOR_FIELDS).single();
    if(error)return json({success:false,error:"Could not save Authority Press verification."},500);
    return json({success:true,request:data});
   }
   return json({success:false,error:"Unknown Authority Press action."},400);
  }
  const authHeader=req.headers.get("Authorization")||"";
  if(!authHeader)return json({success:false,error:"Open your I|ONE account session first."},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
  const {data:auth,error:authError}=await userClient.auth.getUser();
  if(authError||!auth.user)return json({success:false,error:"Your account session expired. Sign in again to restore your author profile."},401);
  const userId=auth.user.id;
  if(action==="my_status"){
   const {data,error}=await admin.from("ione_author_access").select(AUTHOR_FIELDS+",recovery_code_hash,recovery_code_created_at").eq("user_id",userId).maybeSingle();
   if(error)return json({success:false,error:"Could not load your saved author registration."},500);
   const request=data?{...data,has_recovery_code:!!data.recovery_code_hash}:null;
   if(request){delete request.recovery_code_hash;delete request.recovery_code_created_at;}
   return json({success:true,request});
  }
  if(action==="issue_recovery_code"){
   const {data:author,error}=await admin.from("ione_author_access").select("status,verification_status").eq("user_id",userId).maybeSingle();
   if(error||!author)return json({success:false,error:"No author registration was found for this account."},404);
   if(author.status!=="active"||author.verification_status!=="verified")return json({success:false,error:"Authority Press must verify your author profile before a recovery code can be issued."},403);
   const code=newRecoveryCode(),hash=await sha256(cleanRecovery(code));
   const {error:saveError}=await admin.from("ione_author_access").update({recovery_code_hash:hash,recovery_code_created_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",userId);
   if(saveError)return json({success:false,error:"Could not securely save your recovery code."},500);
   return json({success:true,recovery_code:code,message:"Save this code somewhere safe. It is shown only once; generating another code replaces the previous one."});
  }
  if(action==="redeem_recovery_code"){
   const code=cleanRecovery(body?.recovery_code);
   if(!/^I1[0-9A-F]{32}$/.test(code))return json({success:false,error:"Enter the complete I|ONE recovery code."},400);
   const hash=await sha256(code);
   const {data,error}=await admin.rpc("ione_recover_author_by_code",{p_code_hash:hash,p_new_user_id:userId});
   if(error)return json({success:false,error:error.message||"Recovery code could not be accepted."},400);
   return json({success:true,request:data?.request||null,message:"Recovery complete. Your existing author profile and books are now connected to this account."});
  }
  if(action==="submit"){
   const realName=String(body?.real_name||"").trim().replace(/\s+/g," "),known=String(body?.known_author_name||"").trim().replace(/\s+/g," "),phone=normalizePhone(body?.phone),email=String(body?.email||"").trim().toLowerCase();
   if(realName.length<3||realName.length>120)return json({success:false,error:"Enter your full official name."},400);
   if(known.length<2||known.length>120)return json({success:false,error:"Enter the author name shown on your books."},400);
   if(!phone)return json({success:false,error:"Enter a valid Tanzanian phone number."},400);
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({success:false,error:"Enter a valid email address."},400);
   const {data:existing,error:existingError}=await admin.from("ione_author_access").select(AUTHOR_FIELDS).eq("user_id",userId).maybeSingle();
   if(existingError)return json({success:false,error:"Could not check your saved author registration."},500);
   if(existing&&existing.status!=="rejected")return json({success:true,request:existing,message:"Your author registration is already saved. Authority Press will verify it; you do not need to register again."});
   const {data,error}=await admin.from("ione_author_access").upsert({user_id:userId,real_name:realName,known_author_name:known,phone,email,fee_tzs:0,status:"pending_verification",verification_status:"pending_verification",verified_at:null,verified_by:null,authority_notes:null,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"user_id"}).select(AUTHOR_FIELDS).single();
   if(error)return json({success:false,error:error.code==="23505"?"This email is already attached to an author registration. Sign in with that verified email or contact I|ONE support for recovery.":"Could not save your author registration."},500);
   return json({success:true,request:data,message:"Registration saved. Authority Press will verify your name, author name, phone and email. No author access fee is charged."});
  }
  return json({success:false,error:"Unknown author access action."},400);
 }catch(error){console.error("ione-author-access error:",error);return json({success:false,error:"Author registration or verification could not be processed."},500);}
});