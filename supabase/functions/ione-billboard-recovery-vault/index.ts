import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const cors = {"Access-Control-Allow-Origin":"https://intoione.space","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store, max-age=0"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
const b64Bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function decryptRecoveryCode(ciphertext:string,ivText:string,serviceKey:string){
 const material=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("ione-recovery-vault-v1:"+serviceKey));
 const key=await crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["decrypt"]);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64Bytes(ivText)},key,b64Bytes(ciphertext)));
}
async function encryptRecoveryCode(code:string,serviceKey:string){
 const material=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("ione-recovery-vault-v1:"+serviceKey));
 const key=await crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["encrypt"]);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(code));
 const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
 return {encrypted_code:b64(new Uint8Array(encrypted)),iv:b64(iv)};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{status:200,headers:cors});
 if(req.method!=="POST")return json({success:false,error:"POST required."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!serviceKey)return json({success:false,error:"Server configuration missing."},500);
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"list").trim().toLowerCase();
  const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  if(action==="store"){
   const bearer=String(req.headers.get("Authorization")||"").match(/^Bearer\\s+(.+)$/i);
   if(!bearer)return json({success:false,error:"Owner session required."},401);
   const {data:authData,error:authError}=await admin.auth.getUser(bearer[1]);
   const user=authData?.user;if(authError||!user?.id)return json({success:false,error:"Invalid owner session."},401);
   const billboardId=String(body?.billboard_id||"").trim(),token=String(body?.recovery_code||"").trim();
   if(!billboardId||!/^I1-[A-Za-z0-9_-]{20,60}$/.test(token))return json({success:false,error:"Valid billboard and recovery code required."},400);
   const {data:billboard,error:billError}=await admin.from("afrilink_billboards").select("id,owner_id").eq("id",billboardId).maybeSingle();
   if(billError)throw billError;
   if(!billboard||String(billboard.owner_id)!==String(user.id))return json({success:false,error:"Only the verified billboard owner can save its recovery code."},403);
   const tokenHash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
   const {data:record,error:recordError}=await admin.from("ione_billboard_recovery_codes").select("token_hash,expires_at,claimed_at").eq("billboard_id",billboardId).eq("token_hash",tokenHash).maybeSingle();
   if(recordError)throw recordError;
   if(!record||record.claimed_at||new Date(record.expires_at).getTime()<=Date.now())return json({success:false,error:"This code is not the active recovery code for that billboard."},409);
   const encrypted=await encryptRecoveryCode(token,serviceKey);
   const {error:vaultError}=await admin.from("ione_billboard_recovery_vault").upsert({billboard_id:billboardId,encrypted_code:encrypted.encrypted_code,iv:encrypted.iv,code_hash:tokenHash,updated_at:new Date().toISOString()},{onConflict:"billboard_id"});
   if(vaultError)throw vaultError;
   return json({success:true,saved:true});
  }
  const session=String(body?.authority_session||req.headers.get("x-ione-authority-session")||"").trim();
  if(!/^[0-9a-f]{64}$/i.test(session))return json({success:false,error:"Authority Press session expired. Unlock again."},401);
  const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const sessionHash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(session)));
  const {data:authSession,error:sessionError}=await admin.from("ione_authority_sessions").select("token_hash").eq("token_hash",sessionHash).gt("expires_at",new Date().toISOString()).is("revoked_at",null).maybeSingle();
  if(sessionError||!authSession)return json({success:false,error:"Authority Press session expired. Unlock again."},401);
  const [boards,codes,vault]=await Promise.all([
   admin.from("afrilink_billboards").select("id,brand_name,created_at").order("created_at",{ascending:false}).limit(500),
   admin.from("ione_billboard_recovery_codes").select("billboard_id,token_hash,expires_at,claimed_at,created_at").order("created_at",{ascending:false}).limit(2000),
   admin.from("ione_billboard_recovery_vault").select("billboard_id,encrypted_code,iv,code_hash").limit(1000)
  ]);
  if(boards.error||codes.error||vault.error)throw new Error("Could not load the recovery vault records.");
  const latest=new Map<string,any>();for(const row of codes.data||[])if(!latest.has(String(row.billboard_id)))latest.set(String(row.billboard_id),row);
  const vaultMap=new Map((vault.data||[]).map((v:any)=>[String(v.billboard_id),v]));
  const companies=[];
  for(const b of boards.data||[]){
   const r=latest.get(String(b.id)),saved:any=vaultMap.get(String(b.id));let status="NOT ISSUED",code:string|null=null,expires_at:string|null=null;
   if(r&&r.claimed_at)status="REPLACED / USED";
   else if(r&&new Date(r.expires_at).getTime()<=Date.now())status="EXPIRED";
   else if(r&&saved&&saved.code_hash===r.token_hash){try{code=await decryptRecoveryCode(saved.encrypted_code,saved.iv,serviceKey);status="ACTIVE";expires_at=r.expires_at}catch{console.error("Recovery vault decrypt failed for billboard",b.id);status="VAULT ERROR"}}
   else if(r)status="CODE NOT RETAINED";
   companies.push({billboard_id:b.id,brand_name:String(b.brand_name||"Unnamed company"),registered_at:b.created_at,status,recovery_code:code,expires_at});
  }
  return json({success:true,companies,generated_at:new Date().toISOString()});
 }catch(error){console.error("ione-billboard-recovery-vault:",error instanceof Error?error.message:String(error));return json({success:false,error:"Could not load the Company Recovery Vault."},500)}
});