import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, GetBucketCorsCommand, PutBucketCorsCommand } from "npm:@aws-sdk/client-s3@3.750.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.750.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-ione-authority-session","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
function cleanText(v:unknown,max:number){return String(v??"").trim().slice(0,max);}
function normalizeContent(raw:unknown){if(!Array.isArray(raw))return[];return raw.slice(0,300).map((item:any)=>{const type=String(item?.type||"").toLowerCase();if(type==="ione_authority_settings")return{type:"ione_authority_settings",start_date:String(item?.start_date||"").slice(0,10),expiry_date:String(item?.expiry_date||"").slice(0,10),video_sound_allowed:item?.video_sound_allowed!==false,allow_copy:item?.allow_copy!==false,allow_download:item?.allow_download!==false,allow_print:item?.allow_print!==false};if(type==="image")return{type:"image",url:cleanText(item?.url,2000),alt:cleanText(item?.alt,200)};if(type==="audio")return{type:"audio",url:cleanText(item?.url,2000),title:cleanText(item?.title,160)||"Instrumental soundtrack"};if(type==="video")return{type:"video",url:cleanText(item?.url,2000),title:cleanText(item?.title,160)||"Muted documentary video"};return{type:"text",text:cleanText(item?.text,12000)};}).filter((x:any)=>x.type==="ione_authority_settings"||((x.type==="image"||x.type==="audio")?/^https?:\/\//i.test(x.url):x.type==="video"?(/^https?:\/\//i.test(x.url)||/^b2:\/\/authority\/[a-z0-9._/-]+$/i.test(x.url)):!!x.text));}
function validContent(c:any[]){if(!c.length)return"Add documentary content before publishing.";if(c[0]?.type!=="image")return"The first documentary content item must be an image. This becomes the documentary's starting image.";return null;}

function b2Client(){
 const bucket=Deno.env.get("B2_BUCKET_NAME"),endpoint=Deno.env.get("B2_ENDPOINT"),accessKeyId=Deno.env.get("B2_KEY_ID"),secretAccessKey=Deno.env.get("B2_APPLICATION_KEY");
 if(!bucket||!endpoint||!accessKeyId||!secretAccessKey)throw new Error("Backblaze B2 configuration is missing. Check the four B2 secrets.");
 const regionMatch=endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
 if(!regionMatch)throw new Error("B2 endpoint format is invalid.");
 return {bucket,client:new S3Client({region:regionMatch[1],endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}})};
}
async function ensureDocumentaryUploadCors(client:S3Client,bucket:string){
 const origin="https://intoione.space";
 let rules:any[]=[];
 try{
  const current=await client.send(new GetBucketCorsCommand({Bucket:bucket}));
  rules=Array.isArray(current.CORSRules)?current.CORSRules:[];
 }catch(e){
  const name=String((e as any)?.name||"");
  const message=String((e as any)?.message||"");
  if(!/NoSuchCORSConfiguration|NoSuchCORSConfiguration|CORS configuration does not exist/i.test(name+" "+message))throw e;
 }
 const alreadyAllowed=rules.some((r:any)=>{
  const origins=Array.isArray(r.AllowedOrigins)?r.AllowedOrigins:[];
  const methods=Array.isArray(r.AllowedMethods)?r.AllowedMethods.map((x:any)=>String(x).toUpperCase()):[];
  const headers=Array.isArray(r.AllowedHeaders)?r.AllowedHeaders.map((x:any)=>String(x).toLowerCase()):[];
  return (origins.includes("*")||origins.includes(origin))&&methods.includes("PUT")&&(headers.includes("*")||headers.includes("content-type"));
 });
 if(alreadyAllowed)return false;
 rules.push({AllowedOrigins:[origin],AllowedMethods:["PUT","GET","HEAD"],AllowedHeaders:["*"],ExposeHeaders:["ETag"],MaxAgeSeconds:3600});
 await client.send(new PutBucketCorsCommand({Bucket:bucket,CORSConfiguration:{CORSRules:rules}}));
 return true;
}

async function presentDocumentary(doc:any,client:S3Client,bucket:string){
 if(!doc)return doc;
 const convert=async(value:unknown)=>{const url=String(value||"");if(!url.startsWith("b2://authority/"))return url;const key=url.slice("b2://".length);return await getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:21600});};
 const content=Array.isArray(doc.content)?await Promise.all(doc.content.map(async(item:any)=>item&&["video","audio","image"].includes(item.type)&&String(item.url||"").startsWith("b2://authority/")?{...item,url:await convert(item.url)}:item)):doc.content;
 return {...doc,cover_image_url:await convert(doc.cover_image_url),content};
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

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),authorityPassword=Deno.env.get("IONE_AUTHORITY_PASSWORD");
  if(!url||!key||!authorityPassword)return json({success:false,error:"Server configuration is missing."},500);
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  let body:any={};try{body=await req.json();}catch{}
  const action=String(body?.action||"list").trim().toLowerCase();

  if(action==="list"||action==="get"){
   let query=admin.from("ione_documentaries").select("id,title,short_description,cover_image_url,content,sort_order,published,created_at,updated_at");
   if(action==="list"){const authorityView=await validAuthoritySession(admin,body?.authority_session || req.headers.get("x-ione-authority-session"));if(!authorityView)query=query.eq("published",true);query=query.order("sort_order",{ascending:true}).order("created_at",{ascending:true});}
   else {const id=cleanText(body?.id,100);if(!id)return json({success:false,error:"Documentary id is required."},400);query=query.eq("id",id).maybeSingle();}
   const {data,error}=await query;if(error)return json({success:false,error:"Could not load the documentary."},500);
   if(action==="get"&&!data)return json({success:false,error:"Documentary not found."},404);
   if(action==="get"&&data?.published!==true&&!(await validAuthoritySession(admin,body?.authority_session || req.headers.get("x-ione-authority-session"))))return json({success:false,error:"Documentary not found."},404);
   const hasB2=(doc:any)=>Array.isArray(doc?.content)&&doc.content.some((item:any)=>String(item?.url||"").startsWith("b2://authority/"))||String(doc?.cover_image_url||"").startsWith("b2://authority/");
   const docs=action==="list"?(data||[]):[data];let rendered=docs;let cfg:any;
   try{if(docs.some(hasB2)){cfg=b2Client();rendered=await Promise.all(docs.map((doc:any)=>presentDocumentary(doc,cfg.client,cfg.bucket)));}}
   catch(e){return json({success:false,error:"Could not prepare private documentary playback.",detail:e instanceof Error?e.message:"B2 configuration error."},502);}
   finally{cfg?.client?.destroy();}
   return json(action==="list"?{success:true,documentaries:rendered}:{success:true,documentary:rendered[0]});
  }

  if(action==="b2_test_upload"){
   if(!(await validAuthoritySession(admin,body?.authority_session || req.headers.get("x-ione-authority-session"))))return json({success:false,error:"Authority Press session expired. Unlock again."},401);
   const bucket= Deno.env.get("B2_BUCKET_NAME");
   const endpoint= Deno.env.get("B2_ENDPOINT");
   const accessKeyId= Deno.env.get("B2_KEY_ID");
   const secretAccessKey= Deno.env.get("B2_APPLICATION_KEY");
   if(!bucket||!endpoint||!accessKeyId||!secretAccessKey)return json({success:false,error:"Backblaze B2 configuration is missing. Check the four B2 secrets."},500);
   const regionMatch=endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
   if(!regionMatch)return json({success:false,error:"B2 endpoint format is invalid."},500);
   const client=new S3Client({region:regionMatch[1],endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
   const path="authority/_ione_connection_test_"+crypto.randomUUID()+".txt";
   try{
    await client.send(new PutObjectCommand({Bucket:bucket,Key:path,Body:"I|ONE Backblaze B2 upload test",ContentType:"text/plain"}));
    await client.send(new DeleteObjectCommand({Bucket:bucket,Key:path}));
    return json({success:true,b2_test:true,message:"Backblaze B2 test upload and cleanup succeeded.",bucket,object_tested:true,cleanup:true});
   }catch(e){
    return json({success:false,error:"Backblaze B2 test upload failed. Check key permissions, bucket, endpoint, and secret names.",detail:e instanceof Error?e.message:"Unknown B2 error."},502);
   }finally{client.destroy();}
  }

  if(action==="prepare_video_upload"){
   if(!(await validAuthoritySession(admin,body?.authority_session || req.headers.get("x-ione-authority-session"))))return json({success:false,error:"Authority Press session expired. Unlock again."},401);
   const mime=String(body?.mime_type||"").toLowerCase().split(";")[0].trim();
   const size=Number(body?.file_size);
   if(!["video/mp4","video/webm","video/quicktime"].includes(mime))return json({success:false,error:"Choose an MP4, WEBM or MOV video."},400);
   if(!Number.isFinite(size)||size<=0||size>1024*1024*1024)return json({success:false,error:"Video file must be 1 GB or smaller."},400);
   const ext=mime==="video/webm"?"webm":mime==="video/quicktime"?"mov":"mp4";
   const path=`authority/${crypto.randomUUID()}.${ext}`;let cfg:any;
   try{cfg=b2Client();const cors_repaired=await ensureDocumentaryUploadCors(cfg.client,cfg.bucket);const uploadUrl=await getSignedUrl(cfg.client,new PutObjectCommand({Bucket:cfg.bucket,Key:path,ContentType:mime}),{expiresIn:900});return json({success:true,path,upload_url:uploadUrl,object_url:`b2://${path}`,mime_type:mime,expires_in:900,cors_repaired});}
   catch(e){return json({success:false,error:"Could not prepare the Backblaze video upload.",detail:e instanceof Error?e.message:"B2 signing failed."},502);}
   finally{cfg?.client?.destroy();}
  }

  if(action==="upload"){
   if(!(await validAuthoritySession(admin,body?.authority_session || req.headers.get("x-ione-authority-session"))))return json({success:false,error:"Authority Press session expired. Unlock again."},401);
   const dataUrl=String(body?.data_url||"");const mime=String(body?.mime_type||"image/jpeg").toLowerCase().split(";")[0].trim();
   const isImage=/^image\/(jpeg|jpg|png|webp|gif)$/.test(mime),isAudio=/^audio\/(mpeg|mp3|mp4|aac|ogg|wav|x-wav|webm|x-m4a|3gpp)$/.test(mime),isVideo=/^video\/(mp4|webm|quicktime)$/.test(mime);
   if(isImage?!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(dataUrl):isAudio?!/^data:audio\/[a-z0-9.+-]+;base64,/i.test(dataUrl):isVideo?!/^data:video\/(mp4|webm|quicktime);base64,/i.test(dataUrl):true)return json({success:false,error:"Choose a supported image, instrumental audio or video file."},400);
   const raw=Uint8Array.from(atob(dataUrl.split(",")[1]),c=>c.charCodeAt(0));
   if(raw.byteLength>(isAudio||isVideo?15:10)*1024*1024)return json({success:false,error:isAudio?"Instrumental audio must be 15 MB or smaller.":isVideo?"Video must be 15 MB or smaller.":"Image must be 10 MB or smaller."},400);
   const ext=isVideo?(mime.includes("quicktime")?"mov":mime.includes("webm")?"webm":"mp4"):isAudio?(mime.includes("mpeg")||mime.includes("mp3")?"mp3":mime.includes("mp4")?"m4a":mime.includes("aac")?"aac":mime.includes("ogg")?"ogg":mime.includes("wav")?"wav":mime.includes("webm")?"webm":"3gp"):(mime.includes("png")?"png":mime.includes("webp")?"webp":mime.includes("gif")?"gif":"jpg");
   const path=`authority/${crypto.randomUUID()}.${ext}`;
   const up=await admin.storage.from("ione-documentary-media").upload(path,raw,{contentType:mime,cacheControl:"31536000",upsert:false});
   if(up.error)return json({success:false,error:isAudio?"Could not upload instrumental audio.":isVideo?"Could not upload documentary video.":"Could not upload documentary image."},500);
   const pub=admin.storage.from("ione-documentary-media").getPublicUrl(path);
   return json({success:true,url:pub.data.publicUrl,path});
  }

  if(action==="save"||action==="delete"){
   if(!(await validAuthoritySession(admin,body?.authority_session || req.headers.get("x-ione-authority-session"))))return json({success:false,error:"Authority Press session expired. Unlock again."},401);
   if(action==="delete"){const id=cleanText(body?.id,100);if(!id)return json({success:false,error:"Documentary id is required."},400);const {error}=await admin.from("ione_documentaries").delete().eq("id",id);if(error)return json({success:false,error:"Could not delete the documentary."},500);return json({success:true});}
   const id=cleanText(body?.id,100),title=cleanText(body?.title,120),short_description=cleanText(body?.short_description,500),content=normalizeContent(body?.content),published=Boolean(body?.published),sort_order=Number.isFinite(Number(body?.sort_order))?Math.max(0,Math.floor(Number(body?.sort_order))):0;
   if(!title)return json({success:false,error:"Documentary title is required."},400);
   if(published){const e=validContent(content);if(e)return json({success:false,error:e},400);}
   const firstImage=content.find((x:any)=>x.type==="image"&&x.url)?.url||"",requestedCover=cleanText(body?.cover_image_url,2000),cover_image_url=requestedCover||firstImage||null;
   if(published&&!cover_image_url)return json({success:false,error:"A starting image is required before publishing."},400);
   const record:any={title,short_description,cover_image_url,content,sort_order,published,updated_at:new Date().toISOString()};
   const result=id?await admin.from("ione_documentaries").update(record).eq("id",id).select("id,title,short_description,cover_image_url,content,sort_order,published,created_at,updated_at").single():await admin.from("ione_documentaries").insert(record).select("id,title,short_description,cover_image_url,content,sort_order,published,created_at,updated_at").single();
   if(result.error)return json({success:false,error:"Could not save the documentary."},500);
   return json({success:true,documentary:result.data});
  }
  return json({success:false,error:"Unknown action."},400);
 }catch(e){return json({success:false,error:e instanceof Error?e.message:"Unexpected server error."},500);}
});