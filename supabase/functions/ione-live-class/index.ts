import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://intoione.space",
  "https://www.intoione.space",
  "https://derrickafricatz-wq.github.io",
]);
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string,string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(req: Request, data: unknown, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{...cors(req),"Content-Type":"application/json"}});
}
function clean(value: unknown, max=4000) { return String(value ?? "").trim().slice(0,max); }
function streamConfig() {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  if (!account || !token) throw new Error("Cloudflare Stream is not configured. Add the Stream account ID and API token to the ione-live-class Edge Function secrets.");
  return {account,token};
}
async function streamRequest(path:string,method:"GET"|"POST",token:string,body?:unknown,extraHeaders:Record<string,string>={}) {
  const response = await fetch("https://api.cloudflare.com/client/v4"+path,{
    method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json",...extraHeaders},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data:any = await response.json().catch(()=>({}));
  if(!response.ok || data?.success===false) {
    const message=Array.isArray(data?.errors)?data.errors.map((e:any)=>e.message).join("; "):"Cloudflare Stream request failed.";
    throw new Error(message+" (HTTP "+response.status+")");
  }
  return data?.result ?? data;
}
async function validAuthoritySession(admin:any,rawToken:unknown):Promise<boolean>{
  const token=String(rawToken||"").trim();
  if(!/^[0-9a-f]{64}$/i.test(token))return false;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  const {data,error}=await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash",hash).gt("expires_at",new Date().toISOString()).is("revoked_at",null).maybeSingle();
  return !error&&!!data;
}
async function requireAuthority(admin:any,req:Request,body:any){
  const token=body?.authority_session||req.headers.get("x-ione-authority-session");
  if(!(await validAuthoritySession(admin,token)))throw new Error("Authority Press session expired. Unlock Authority Press again.");
}
function base64Url(value:string|Uint8Array){
  const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
  return btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
async function createStreamSignedToken(videoUid:string,expiresInSeconds=3600){
  const keyId=Deno.env.get("CLOUDFLARE_STREAM_SIGNING_KEY_ID");
  const jwkEncoded=Deno.env.get("CLOUDFLARE_STREAM_SIGNING_KEY_JWK_B64");
  if(!keyId||!jwkEncoded)throw new Error("Cloudflare Stream signing key is not configured.");
  let jwk:any;
  try{jwk=JSON.parse(atob(jwkEncoded));}catch{throw new Error("Cloudflare Stream signing JWK secret is invalid.");}
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const now=Math.floor(Date.now()/1000);
  const header=base64Url(JSON.stringify({alg:"RS256",kid:keyId}));
  const payload=base64Url(JSON.stringify({sub:videoUid,kid:keyId,exp:now+Math.min(Math.max(expiresInSeconds,60),3600),nbf:now}));
  const unsigned=header+"."+payload;
  const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));
  return unsigned+"."+base64Url(new Uint8Array(signature));
}
function safePublic(row:any){
  return {
    id:row.id,title:row.title,description:row.description,category:row.category,
    instructor_name:row.instructor_name,class_type:row.class_type,status:row.status,
    price_tzs:Number(row.price_tzs||0),duration_seconds:row.duration_seconds,
    scheduled_start:row.scheduled_start,scheduled_end:row.scheduled_end,
    record_replay:row.record_replay,cover_image_url:row.cover_image_url,
    published_at:row.published_at
  };
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,{success:false,error:"Method not allowed."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceKey)return json(req,{success:false,error:"Supabase server configuration is missing."},500);
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const body:any=await req.json().catch(()=>({}));
    const action=clean(body?.action,60).toLowerCase();

    if(action==="public_list"){
      const {data,error}=await admin.from("ione_live_classes").select("id,title,description,category,instructor_name,class_type,status,price_tzs,duration_seconds,scheduled_start,scheduled_end,record_replay,cover_image_url,published_at")
        .eq("status","published").or("class_type.eq.recorded,scheduled_end.is.null,scheduled_end.gt."+new Date().toISOString()).order("scheduled_start",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false}).limit(60);
      if(error)throw new Error("Could not load published classes.");
      return json(req,{success:true,classes:(data||[]).map(safePublic)});
    }

    if(action==="playback_access"){
      const classId=clean(body?.class_id,64);
      if(!/^[0-9a-f-]{36}$/i.test(classId))return json(req,{success:false,error:"Choose a valid class."},400);
      const {data:row,error}=await admin.from("ione_live_classes").select("id,class_type,status,price_tzs,media_uid,live_input_uid,stream_status,scheduled_start,scheduled_end").eq("id",classId).eq("status","published").maybeSingle();
      if(error||!row)return json(req,{success:false,error:"This class is not available."},404);
      if(row.class_type==="live_broadcast"){
        const now=Date.now();
        if(row.scheduled_start&&new Date(row.scheduled_start).getTime()>now)return json(req,{success:false,error:"This live class has not started yet. Please return at the scheduled time."},409);
        if(row.scheduled_end&&new Date(row.scheduled_end).getTime()<=now)return json(req,{success:false,error:"This live class has ended."},410);
      }
      if(Number(row.price_tzs)>0){
        const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
        if(!bearer)return json(req,{success:false,error:"Sign in and purchase this class before watching."},403);
        const {data:userData,error:userError}=await admin.auth.getUser(bearer);
        if(userError||!userData?.user)return json(req,{success:false,error:"Your session could not be verified."},401);
        const {data:enrollment,error:enrollError}=await admin.from("ione_live_class_enrollments").select("id").eq("class_id",classId).eq("user_id",userData.user.id).eq("payment_status","paid").or("access_expires_at.is.null,access_expires_at.gt."+new Date().toISOString()).maybeSingle();
        if(enrollError||!enrollment)return json(req,{success:false,error:"Payment is not verified for this class."},403);
      }
      const uid=row.class_type==="recorded"?row.media_uid:row.live_input_uid;
      if(!uid||!["ready","live_input_ready","live"].includes(row.stream_status))return json(req,{success:false,error:"The class video is not ready yet."},409);
      const signedToken=await createStreamSignedToken(String(uid),3600);
      return json(req,{success:true,playback_token:signedToken,expires_in:3600});
    }

    await requireAuthority(admin,req,body);

    if(action==="authority_list"){
      const {data,error}=await admin.from("ione_live_classes").select("*").order("created_at",{ascending:false}).limit(100);
      if(error)throw new Error("Could not load Authority classes.");
      return json(req,{success:true,classes:data||[]});
    }
    if(action==="authority_create"){
      const input=body?.class_data||{};
      const title=clean(input.title,140),type=clean(input.class_type,30);
      if(title.length<3)return json(req,{success:false,error:"Enter a class name with at least 3 characters."},400);
      if(!["recorded","live_broadcast","interactive"].includes(type))return json(req,{success:false,error:"Choose a valid class format."},400);
      const price=Number(input.price_tzs);
      if(!Number.isSafeInteger(price)||price<0)return json(req,{success:false,error:"Enter a valid whole-number TZS price."},400);
      const duration=input.duration_seconds==null?null:Number(input.duration_seconds);
      if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>(type==="recorded"?3600:21600)))return json(req,{success:false,error:type==="recorded"?"Recorded lessons can be up to 60 minutes.":"Enter a valid class duration."},400);
      if(type==="live_broadcast"){
        const start=Date.parse(String(input.scheduled_start||"")),end=Date.parse(String(input.scheduled_end||""));
        if(!Number.isFinite(start)||!Number.isFinite(end))return json(req,{success:false,error:"Choose both the live class start and end time."},400);
        if(end<=start)return json(req,{success:false,error:"The live class end time must be after its start time."},400);
      }
      const payload={title,description:clean(input.description,4000),category:clean(input.category,80)||"General",instructor_name:clean(input.instructor_name,120),class_type:type,price_tzs:price,duration_seconds:duration,scheduled_start:input.scheduled_start||null,scheduled_end:input.scheduled_end||null,record_replay:type!=="live_broadcast",status:"draft",stream_status:"not_configured"};
      const {data,error}=await admin.from("ione_live_classes").insert(payload).select("*").single();
      if(error)throw new Error("Could not save the class draft.");
      return json(req,{success:true,class:data});
    }
    if(action==="authority_create_upload"){
      const classId=clean(body?.class_id,64);
      const fileSize=Number(body?.file_size);
      if(!Number.isSafeInteger(fileSize)||fileSize<1)return json(req,{success:false,error:"The selected video file size is invalid."},400);
      const {data:row,error}=await admin.from("ione_live_classes").select("*").eq("id",classId).eq("class_type","recorded").eq("status","draft").maybeSingle();
      if(error||!row)return json(req,{success:false,error:"Recorded class draft was not found."},404);
      const {account,token}=streamConfig();
      const toBase64=(value:string)=>btoa(String.fromCharCode(...new TextEncoder().encode(value)));
      const metadata=[
        "name "+toBase64(clean(body?.file_name,120)||row.title),
        "requiresignedurls",
        "allowedorigins "+toBase64("intoione.space,www.intoione.space"),
        "maxdurationseconds "+toBase64("3600")
      ].join(",");
      const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/stream?direct_user=true",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Tus-Resumable":"1.0.0",
          "Upload-Length":String(fileSize),
          "Upload-Metadata":metadata,
          "Upload-Creator":"ione-live-class"
        }
      });
      if(response.status!==201){
        const failure:any=await response.json().catch(()=>({}));
        const message=Array.isArray(failure?.errors)?failure.errors.map((e:any)=>e.message).join("; "):"Cloudflare could not prepare the resumable upload.";
        throw new Error(message+" (HTTP "+response.status+")");
      }
      const uploadUrl=response.headers.get("Location")||"";
      const mediaUid=response.headers.get("Stream-Media-ID")||"";
      if(!uploadUrl||!mediaUid)throw new Error("Cloudflare did not return the resumable upload URL and video ID.");
      const {error:updateError}=await admin.from("ione_live_classes").update({media_uid:mediaUid,stream_status:"upload_pending"}).eq("id",classId);
      if(updateError)throw new Error("Upload was prepared but the class record could not be updated. Contact Authority before retrying.");
      return json(req,{success:true,upload_url:uploadUrl,media_uid:mediaUid});
    }
    if(action==="authority_check_upload"){
      const classId=clean(body?.class_id,64);
      const {data:row,error}=await admin.from("ione_live_classes").select("media_uid,class_type,status").eq("id",classId).eq("class_type","recorded").maybeSingle();
      if(error||!row?.media_uid)return json(req,{success:false,error:"No uploaded video is linked to this class."},404);
      const {account,token}=streamConfig();
      const media=await streamRequest("/accounts/"+account+"/stream/"+row.media_uid,"GET",token);
      const ready=media?.readyToStream===true||String(media?.status?.state||"").toLowerCase()==="ready";
      const duration=Number(media?.duration||0);
      if(ready&&duration>3600){
        await admin.from("ione_live_classes").update({stream_status:"failed"}).eq("id",classId);
        return json(req,{success:false,error:"The uploaded lesson exceeds the 60-minute limit."},400);
      }
      const next=ready?"ready":(String(media?.status?.state||"").toLowerCase()==="error"?"failed":"processing");
      const {error:updateError}=await admin.from("ione_live_classes").update({stream_status:next,duration_seconds:ready&&duration>0?Math.ceil(duration):undefined}).eq("id",classId);
      if(updateError)throw new Error("Could not save the video processing status.");
      return json(req,{success:true,stream_status:next,duration_seconds:duration||null});
    }
    if(action==="authority_create_live_input"){
      const classId=clean(body?.class_id,64);
      const {data:row,error}=await admin.from("ione_live_classes").select("*").eq("id",classId).eq("class_type","live_broadcast").eq("status","draft").maybeSingle();
      if(error||!row)return json(req,{success:false,error:"Live broadcast draft was not found."},404);
      if(row.live_input_uid)return json(req,{success:false,error:"A live input already exists for this class. Refresh the class list."},409);
      const {account,token}=streamConfig();
      const live=await streamRequest("/accounts/"+account+"/stream/live_inputs","POST",token,{
        defaultCreator:"ione-live-class",enabled:true,preferLowLatency:false,
        recording:{mode:"off",requireSignedURLs:true,allowedOrigins:["intoione.space","www.intoione.space"]}
      },{"Idempotency-Key":"ione-live-class-"+classId});
      const publishUrl=String(live?.webRTC?.url||"");
      if(!publishUrl)throw new Error("Cloudflare did not return the secure browser broadcast URL.");
      const {error:updateError}=await admin.from("ione_live_classes").update({live_input_uid:String(live.uid||""),stream_status:"live_input_ready",record_replay:false}).eq("id",classId);
      if(updateError)throw new Error("Live input was created but its class record could not be updated. Contact Authority before retrying.");
      return json(req,{success:true,live_input_uid:String(live.uid||""),whip_url:publishUrl,replay_available:false});
    }
    if(action==="authority_get_live_input"){
      const classId=clean(body?.class_id,64);
      const {data:row,error}=await admin.from("ione_live_classes").select("live_input_uid,class_type,status").eq("id",classId).eq("class_type","live_broadcast").maybeSingle();
      if(error||!row?.live_input_uid)return json(req,{success:false,error:"No live broadcast input is linked to this class."},404);
      const {account,token}=streamConfig();
      const live=await streamRequest("/accounts/"+account+"/stream/live_inputs/"+row.live_input_uid,"GET",token);
      const whipUrl=String(live?.webRTC?.url||"");
      if(!whipUrl)return json(req,{success:false,error:"The browser broadcast endpoint is unavailable for this live input."},409);
      const nextStatus=live?.status==="connected"?"live":"live_input_ready";
      await admin.from("ione_live_classes").update({stream_status:nextStatus}).eq("id",classId);
      return json(req,{success:true,whip_url:whipUrl,stream_status:nextStatus});
    }
    if(action==="authority_publish"){
      const classId=clean(body?.class_id,64);
      const {data:row,error}=await admin.from("ione_live_classes").select("*").eq("id",classId).eq("status","draft").maybeSingle();
      if(error||!row)return json(req,{success:false,error:"Class draft was not found."},404);
      if(row.class_type==="interactive")return json(req,{success:false,error:"Interactive classrooms are reserved for the next development stage."},409);
      if(row.class_type==="recorded"&&(!row.media_uid||row.stream_status!=="ready"))return json(req,{success:false,error:"Upload and finish processing the recorded lesson before publishing."},409);
      if(row.class_type==="live_broadcast"&&!row.live_input_uid)return json(req,{success:false,error:"Create the secure live broadcast input before publishing."},409);
      const {data,error:updateError}=await admin.from("ione_live_classes").update({status:"published",published_at:new Date().toISOString()}).eq("id",classId).select("*").single();
      if(updateError)throw new Error("Could not publish this class.");
      return json(req,{success:true,class:data});
    }
    if(action==="authority_suspend"){
      const classId=clean(body?.class_id,64);
      const {data,error}=await admin.from("ione_live_classes").update({status:"suspended"}).eq("id",classId).eq("status","published").select("id,status").maybeSingle();
      if(error||!data)return json(req,{success:false,error:"Could not suspend this class."},400);
      return json(req,{success:true,class:data});
    }
    return json(req,{success:false,error:"Unknown Live Class action."},400);
  }catch(error){
    const message=error instanceof Error?error.message:"Unexpected Live Class error.";
    const status=/Authority Press session expired/i.test(message)?401:500;
    return json(req,{success:false,error:message},status);
  }
});
