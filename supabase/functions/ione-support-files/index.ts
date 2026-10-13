import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(d:any,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const iso=()=>new Date().toISOString();
const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const MAX=8*1024*1024;

async function authUser(req:Request,admin:any){
  const h=req.headers.get("Authorization")||""; const m=h.match(/^Bearer\s+(.+)$/i);
  if(!m) throw new Error("AUTH_REQUIRED");
  const r=await admin.auth.getUser(m[1]);
  if(r.error||!r.data?.user) throw new Error("INVALID_SESSION");
  return r.data.user;
}
async function authority(req:Request,admin:any,rawToken:unknown){
  const token=String(rawToken||"").trim();
  if(!/^[0-9a-f]{64}$/i.test(token)) throw new Error("Authority Press session expired. Unlock again.");
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const tokenHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  const {data,error}=await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash",tokenHash).gt("expires_at",new Date().toISOString()).is("revoked_at",null).maybeSingle();
  if(error||!data) throw new Error("Authority Press session expired. Unlock again.");
}
async function conversation(admin:any,cid:string){
  const {data,error}=await admin.from("ione_support_conversations").select("*").eq("id",cid).maybeSingle();
  if(error) throw error; if(!data) throw new Error("Conversation not found."); return data;
}
async function cleanupExpired(admin:any,cid:string){
  const {data:atts,error}=await admin.from("ione_support_attachments").select("id,storage_path").eq("conversation_id",cid).is("deleted_at",null).lte("expires_at",iso());
  if(error) throw error;
  if(!atts?.length)return;
  const paths=atts.map((x:any)=>x.storage_path).filter(Boolean);
  if(paths.length) await admin.storage.from("ione-support-files").remove(paths);
  await admin.from("ione_support_attachments").update({deleted_at:iso()}).in("id",atts.map((x:any)=>x.id));
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")||"", key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    if(!url||!key)return json({success:false,error:"Server configuration missing."},500);
    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    let action="", body:any={};
    const ct=req.headers.get("content-type")||"";
    if(ct.includes("multipart/form-data")){
      const fd=await req.formData(); action=String(fd.get("action")||"authority_upload"); body={password:String(fd.get("password")||""),authority_session:String(fd.get("authority_session")||""),conversation_id:String(fd.get("conversation_id")||""),file:fd.get("file")};
    }else{try{body=await req.json()}catch{} action=String(body?.action||"").trim().toLowerCase();}
    if(action==="authority_messages"){
      await authority(req,admin,body.authority_session); const cid=String(body.conversation_id||""); const c=await conversation(admin,cid); await cleanupExpired(admin,cid);
      const {data:m,error}=await admin.from("ione_support_messages").select("*").eq("conversation_id",cid).eq("authority_visible",true).order("created_at",{ascending:true}); if(error)throw error;
      const ids=(m||[]).map((x:any)=>x.id); const {data:a}=ids.length?await admin.from("ione_support_attachments").select("id,message_id,conversation_id,file_name,mime_type,size_bytes,created_at,expires_at,downloaded_at").in("message_id",ids).is("deleted_at",null).order("created_at",{ascending:true}):{data:[]};
      await admin.from("ione_support_conversations").update({unread_authority:0}).eq("id",cid);
      return json({success:true,conversation:c,messages:m||[],attachments:a||[]});
    }
    if(action==="authority_delete"){
      await authority(req,admin,body.authority_session); const cid=String(body.conversation_id||""); await conversation(admin,cid);
      const {data:a}=await admin.from("ione_support_attachments").select("storage_path").eq("conversation_id",cid);
      const paths=(a||[]).map((x:any)=>x.storage_path).filter(Boolean); if(paths.length)await admin.storage.from("ione-support-files").remove(paths);
      await admin.from("ione_support_attachments").delete().eq("conversation_id",cid);
      await admin.from("ione_support_messages").delete().eq("conversation_id",cid);
      const {error}=await admin.from("ione_support_conversations").delete().eq("id",cid); if(error)throw error;
      return json({success:true,deleted:cid});
    }
    if(action==="authority_download"){
      await authority(req,admin,body.authority_session); const cid=String(body.conversation_id||""),aid=String(body.attachment_id||""); await conversation(admin,cid);
      const {data:a,error}=await admin.from("ione_support_attachments").select("*").eq("id",aid).eq("conversation_id",cid).is("deleted_at",null).maybeSingle(); if(error)throw error;if(!a)throw new Error("File unavailable.");
      if(new Date(a.expires_at).getTime()<=Date.now())return json({success:false,error:"This file has expired."},410);
      const {data:s,error:se}=await admin.storage.from("ione-support-files").createSignedUrl(a.storage_path,300);if(se)throw se;
      return json({success:true,url:s.signedUrl,file_name:a.file_name,mime_type:a.mime_type});
    }
    if(action==="client_download"){
      const user=await authUser(req,admin),cid=String(body.conversation_id||""),aid=String(body.attachment_id||""); const c=await conversation(admin,cid);if(c.client_user_id!==user.id)throw new Error("Not your conversation.");
      const {data:a,error}=await admin.from("ione_support_attachments").select("*").eq("id",aid).eq("conversation_id",cid).eq("client_user_id",user.id).is("deleted_at",null).maybeSingle();if(error)throw error;if(!a)throw new Error("File unavailable.");
      if(new Date(a.expires_at).getTime()<=Date.now())return json({success:false,error:"This file has expired."},410);
      const {data:s,error:se}=await admin.storage.from("ione-support-files").createSignedUrl(a.storage_path,300);if(se)throw se;
      await admin.from("ione_support_attachments").update({downloaded_at:iso()}).eq("id",aid);
      return json({success:true,url:s.signedUrl,file_name:a.file_name,mime_type:a.mime_type});
    }
    if(action==="client_cleanup"){
      const user=await authUser(req,admin),cid=String(body.conversation_id||"");const c=await conversation(admin,cid);if(c.client_user_id!==user.id)throw new Error("Not your conversation.");
      await cleanupExpired(admin,cid); await admin.from("ione_support_attachments").update({deleted_at:iso()}).eq("conversation_id",cid).eq("client_user_id",user.id).not("downloaded_at","is",null).is("deleted_at",null);
      return json({success:true});
    }
    if(action==="client_delete"){
      const user=await authUser(req,admin),cid=String(body.conversation_id||"");const c=await conversation(admin,cid);if(c.client_user_id!==user.id)throw new Error("Not your conversation.");
      const {error}=await admin.from("ione_support_messages").update({client_visible:false}).eq("conversation_id",cid);if(error)throw error;
      await admin.from("ione_support_conversations").update({unread_client:0}).eq("id",cid);
      return json({success:true});
    }
    if(action==="authority_upload" || ct.includes("multipart/form-data")){
      await authority(req,admin,body.authority_session); const cid=String(body.conversation_id||""); const c=await conversation(admin,cid); const file=body.file;
      if(!(file instanceof File))throw new Error("File is required.");
      if(file.size<=0||file.size>MAX)throw new Error("File must be smaller than 8 MB.");
      const mime=String(file.type||"").toLowerCase(); if(!allowed.has(mime))throw new Error("Only JPG, PNG, WEBP and PDF files are allowed.");
      const clean=String(file.name||"file").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120);
      const path=cid+"/"+crypto.randomUUID()+"-"+clean;
      const up=await admin.storage.from("ione-support-files").upload(path,file,{contentType:mime,upsert:false});if(up.error)throw up.error;
      const msg=await admin.from("ione_support_messages").insert({conversation_id:cid,sender_role:"authority",body:"📎 "+clean}).select("*").single();if(msg.error){await admin.storage.from("ione-support-files").remove([path]);throw msg.error;}
      const at=await admin.from("ione_support_attachments").insert({conversation_id:cid,message_id:msg.data.id,client_user_id:c.client_user_id,sender_role:"authority",file_name:clean,mime_type:mime,size_bytes:file.size,storage_path:path}).select("*").single();if(at.error){await admin.from("ione_support_messages").delete().eq("id",msg.data.id);await admin.storage.from("ione-support-files").remove([path]);throw at.error;}
      await admin.from("ione_support_conversations").update({unread_client:(Number(c.unread_client)||0)+1,updated_at:iso(),last_message_at:iso(),status:"open"}).eq("id",cid);
      const pushUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"")+"/functions/v1/ione-push";
      try{
        await fetch(pushUrl,{method:"POST",headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key},
          body:JSON.stringify({action:"service_send",user_id:String(c.client_user_id||""),
            title:"I|ONE • NEW FILE FROM AUTHORITY",body:clean+" • Open I1 Support to view the file.",
            url:"./",tag:"ione-support-file-"+String(msg.data.id)})});
      }catch(pushError){console.error("support file push failed",pushError);}
      return json({success:true,message:msg.data,attachment:at.data});
    }
    return json({success:false,error:"Unknown action."},400);
  }catch(e:any){console.error(e);return json({success:false,error:e?.message||"Unexpected error."},500);}
});