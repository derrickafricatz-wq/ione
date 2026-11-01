import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ione-authority-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "ione-transport-documents";
const CATEGORIES = new Set(["taxi", "special_hire", "shuttle", "bus"]);

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const clean = (value: unknown, max = 300) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return "255" + digits.slice(1);
  if (digits.startsWith("6") || digits.startsWith("7")) return "255" + digits;
  return digits;
}

const validPhone = (phone: string) => /^255[67]\d{8}$/.test(phone);
async function sendTransportPush(admin: any, userId: string, payload: any) {
  try {
    const { data: cfg, error: cfgError } = await admin.from("ione_push_config").select("vapid_public_key,vapid_private_key,vapid_subject").eq("id", true).maybeSingle();
    if (cfgError || !cfg?.vapid_public_key || !cfg?.vapid_private_key) return 0;
    webpush.setVapidDetails(cfg.vapid_subject || "mailto:notifications@ione.app", cfg.vapid_public_key, cfg.vapid_private_key);
    const { data: rows, error } = await admin.from("ione_push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId).eq("active", true);
    if (error) return 0;
    let sent = 0;
    for (const row of rows || []) {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload));
        sent++;
      } catch (e: any) {
        const status = Number(e?.statusCode || 0);
        if (status === 404 || status === 410) await admin.from("ione_push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", row.id);
      }
    }
    return sent;
  } catch (e) { console.warn("i1 Transport push delivery skipped:", String(e)); return 0; }
}
async function sendTransportSms(admin: any, jobId: string, eventType: string, userId: string, rawPhone: unknown, rawMessage: string) {
  const apiKey = Deno.env.get("DARSMS_API_KEY");
  const phone = normalizePhone(rawPhone);
  if (!apiKey || !validPhone(phone)) return { status: "skipped" };
  const message = String(rawMessage || "").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!message) return { status: "skipped" };
  const idempotencyKey = jobId + ":" + eventType + ":" + userId;
  let claim: any;
  try {
    claim = await admin.from("ione_transport_sms_log").insert({ idempotency_key: idempotencyKey, job_id: jobId, event_type: eventType, recipient_user_id: userId, recipient_phone: phone, status: "pending" }).select("id").maybeSingle();
  } catch (e: any) {
    console.warn("i1 Transport SMS audit insert failed:", String(e?.message || e));
    return { status: "failed" };
  }
  if (claim?.error) {
    console.warn("i1 Transport SMS audit insert failed:", claim.error.message || claim.error.code);
    return { status: claim.error.code === "23505" ? "duplicate" : "failed" };
  }
  if (!claim?.data?.id) return { status: "duplicate" };
  try {
    const response = await fetch("https://dev.darsms.co.tz/api/v1/integrations/sms/send", {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ senderId: "DARSMS", to: [phone], message }), signal: AbortSignal.timeout(12000)
    });
    let result: any = {}; try { result = await response.json(); } catch (_) {}
    const ok = response.ok && result?.success === true;
    const ids = result?.data?.messageIds;
    const providerId = Array.isArray(ids) ? String(ids[0] || "") : String(ids || "");
    await admin.from("ione_transport_sms_log").update({ status: ok ? "queued" : "failed", provider_message_id: providerId || null, error_message: ok ? null : String(result?.message || ("DARSMS HTTP " + response.status)).slice(0, 240), provider_response: { http_status: response.status, success: ok }, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    return { status: ok ? "queued" : "failed" };
  } catch (e: any) {
    await admin.from("ione_transport_sms_log").update({ status: "failed", error_message: String(e?.message || e).slice(0, 240), updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    return { status: "failed" };
  }
}
async function notifyTransport(admin: any, job: any, recipientUserId: string, recipientPhone: unknown, eventType: string, title: string, body: string, smsText: string) {
  // Alerts are deliberately best-effort: never fail a saved booking or trip transition
  // because a push provider, SMS provider or notification audit write is unavailable.
  const results = await Promise.allSettled([
    sendTransportPush(admin, recipientUserId, { title, body: body.slice(0, 180), url: "./?i1Transport=1&trip=" + encodeURIComponent(job.id), tag: "i1-transport-" + job.id + "-" + eventType }),
    sendTransportSms(admin, job.id, eventType, recipientUserId, recipientPhone, smsText)
  ]);
  for (const result of results) if (result.status === "rejected") console.warn("i1 Transport notification delivery failed:", String(result.reason?.message || result.reason));
}

async function getVerifiedUser(admin: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}
async function validAuthoritySession(admin: any, raw: unknown) {
  const token = String(raw || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).is("revoked_at", null).maybeSingle();
  return !error && !!data;
}
function decodeFile(file: any, key: string) {
  if (!file || typeof file !== "object") return null;
  const mime = String(file.mime || "").toLowerCase();
  const allowed = key === "licence"
    ? new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])
    : new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(mime)) throw new Error(key === "licence"
    ? "Driving licence file must be JPG, PNG, WebP or PDF."
    : "Profile and vehicle photos must be JPG, PNG or WebP.");
  const encoded = String(file.base64 || "");
  if (!encoded || encoded.length > 1450000 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
    throw new Error("Each uploaded file must be 1 MB or smaller.");
  }
  const binary = atob(encoded);
  if (!binary.length || binary.length > 1048576) throw new Error("Each uploaded file must be 1 MB or smaller.");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime === "image/jpeg" ? "jpg" : mime === "application/pdf" ? "pdf" : mime.split("/")[1];
  return { mime, bytes, ext };
}
async function uploadDocument(admin: any, userId: string, applicationId: string, key: string, file: any) {
  if (!file) return null;
  const decoded = decodeFile(file, key);
  if (!decoded) throw new Error("The selected document is empty.");
  const path = userId + "/" + applicationId + "/" + key + "-" + crypto.randomUUID() + "." + decoded.ext;
  const { error } = await admin.storage.from(BUCKET).upload(path, decoded.bytes, {
    contentType: decoded.mime, upsert: false, cacheControl: "3600",
  });
  if (error) throw new Error("Could not upload " + key + " file. Please retry.");
  return path;
}
async function removeFiles(admin: any, paths: (string | null)[]) {
  const saved = paths.filter(Boolean) as string[];
  if (saved.length) await admin.storage.from(BUCKET).remove(saved);
}
async function signedUrl(admin: any, path: string | null) {
  if (!path) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ success: false, error: "Server configuration is missing." }, 500);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    let body: any;
    try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request." }, 400); }
    const action = clean(body?.action, 40).toLowerCase();

    if (action === "submit") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your i1 session is not ready. Reload the app and try again." }, 401);
      const driverName = clean(body?.driver_name, 120);
      const phone = normalizePhone(body?.phone_number);
      const email = clean(body?.email, 254);
      const categories = Array.isArray(body?.service_types)
        ? [...new Set(body.service_types.map((v: unknown) => clean(v, 30).toLowerCase()).filter((v: string) => CATEGORIES.has(v)))]
        : [];
      const area = clean(body?.operating_area, 120);
      const vehicle = clean(body?.vehicle_make_model, 120);
      const plate = clean(body?.vehicle_registration, 30).toUpperCase();
      const color = clean(body?.vehicle_color, 40);
      const seats = Number(body?.passenger_capacity);
      const licenceNumber = clean(body?.licence_number, 80);
      if (driverName.length < 2 || !validPhone(phone) || categories.length < 1 || area.length < 2 ||
          vehicle.length < 2 || plate.length < 2 || !Number.isInteger(seats) || seats < 1 || seats > 60 ||
          licenceNumber.length < 2) {
        return json({ success: false, error: "Complete the driver, contact, service, vehicle and driving-licence details. Use a valid Tanzania phone number." }, 400);
      }
      const { data: existingDriver, error: driverError } = await admin.from("ione_transport_drivers")
        .select("id,verification_status").eq("user_id", user.id).maybeSingle();
      if (driverError) return json({ success: false, error: "Could not check your existing driver profile." }, 500);
      if (existingDriver) return json({ success: true, already_approved: true, message: "Your i1 Transport driver profile has already been approved." });
      const { data: pending, error: pendingError } = await admin.from("ione_transport_driver_applications")
        .select("id,status,created_at").eq("user_id", user.id).in("status", ["pending", "processing"]).maybeSingle();
      if (pendingError) return json({ success: false, error: "Could not check your previous application." }, 500);
      if (pending) return json({ success: true, already_pending: true, application: pending, message: "Your application is already waiting for Authority Press." });
      const files = body?.files || {};
      if (!files.licence) return json({ success: false, error: "Upload a clear photo or PDF of your driving licence." }, 400);
      const applicationId = crypto.randomUUID();
      const uploaded: (string | null)[] = [];
      try {
        const profilePath = await uploadDocument(admin, user.id, applicationId, "profile", files.profile);
        uploaded.push(profilePath);
        const licencePath = await uploadDocument(admin, user.id, applicationId, "licence", files.licence);
        uploaded.push(licencePath);
        const vehiclePath = await uploadDocument(admin, user.id, applicationId, "vehicle", files.vehicle);
        uploaded.push(vehiclePath);
        const saved = await admin.from("ione_transport_driver_applications").insert({
          id: applicationId, user_id: user.id, driver_name: driverName, phone_number: phone, email,
          service_types: categories, operating_area: area, vehicle_make_model: vehicle,
          vehicle_registration: plate, vehicle_color: color, passenger_capacity: seats,
          licence_number: licenceNumber, profile_photo_path: profilePath,
          licence_document_path: licencePath, vehicle_photo_path: vehiclePath, status: "pending",
        }).select("id,status,created_at").single();
        if (saved.error) {
          await removeFiles(admin, uploaded);
          if (saved.error.code === "23505") return json({ success: false, error: "An application is already awaiting review. Refresh to check its status." }, 409);
          console.error("i1 Transport application insert failed:", saved.error.code);
          return json({ success: false, error: "Your application could not be saved. Please try again." }, 500);
        }
        return json({ success: true, application: saved.data, message: "Application submitted. Authority Press will review your details and documents before approving your driver profile." });
      } catch (uploadError) {
        await removeFiles(admin, uploaded);
        return json({ success: false, error: String((uploadError as any)?.message || "Could not save your documents.") }, 400);
      }
    }

    if (action === "my_status") {
      const user = await getVerifiedUser(admin, req);
      if (!user) return json({ success: false, error: "Your i1 session is not ready. Reload and try again." }, 401);
      const [{ data: application, error: applicationError }, { data: driver, error: driverError }] = await Promise.all([
        admin.from("ione_transport_driver_applications")
          .select("id,driver_name,phone_number,service_types,operating_area,vehicle_make_model,vehicle_registration,passenger_capacity,status,admin_note,created_at,reviewed_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("ione_transport_drivers")
          .select("id,verification_status,availability,return_online_after_job,verified_at,driver_name,phone_number,service_types,operating_area,vehicle_make_model,vehicle_registration,vehicle_color,passenger_capacity,profile_photo_path,last_seen_at").eq("user_id", user.id).maybeSingle(),
      ]);
      if (applicationError || driverError) return json({ success: false, error: "Could not load your driver application status." }, 500);
      const safeDriver = driver ? { ...driver, profile_photo_url: await signedUrl(admin, driver.profile_photo_path) } : null;
      if (safeDriver) delete safeDriver.profile_photo_path;
      return json({ success: true, application: application || null, driver: safeDriver });
    }

    if (action === "active_drivers") {
      const service=clean(body?.service_type,30).toLowerCase();
      const area=clean(body?.area,120);
      if(service&&!CATEGORIES.has(service))return json({success:false,error:"Choose a valid transport service."},400);
      let q=admin.from("ione_transport_drivers").select("id,driver_name,service_types,operating_area,vehicle_make_model,vehicle_registration,vehicle_color,passenger_capacity,availability,profile_photo_path,last_seen_at").eq("verification_status","approved").in("availability",["active","busy"]).gt("last_seen_at",new Date(Date.now()-300000).toISOString()).order("availability",{ascending:true}).order("last_seen_at",{ascending:false}).limit(100);
      if(service)q=q.contains("service_types",[service]);
      if(area)q=q.ilike("operating_area","%"+area+"%");
      const {data,error}=await q;if(error)return json({success:false,error:"Could not load drivers."},500);
      const drivers=await Promise.all((data||[]).map(async(d:any)=>{const photo=await signedUrl(admin,d.profile_photo_path);const {profile_photo_path,...safe}=d;return {...safe,profile_photo_url:photo};}));
      return json({success:true,drivers});
    }
    if (action === "create_request") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);
      const driverId=clean(body?.driver_id,50),service=clean(body?.service_type,30).toLowerCase(),name=clean(body?.passenger_name,120),phone=normalizePhone(body?.passenger_phone),pickup=clean(body?.pickup_location,240),destination=clean(body?.destination,240),count=Number(body?.passenger_count),notes=clean(body?.notes,600),pickupLat=body?.pickup_lat==null?null:Number(body.pickup_lat),pickupLng=body?.pickup_lng==null?null:Number(body.pickup_lng);
      const pickupCoordsValid=(pickupLat===null&&pickupLng===null)||(pickupLat!==null&&pickupLng!==null&&Number.isFinite(pickupLat)&&Number.isFinite(pickupLng)&&pickupLat>=-90&&pickupLat<=90&&pickupLng>=-180&&pickupLng<=180);
      if(!/^[0-9a-f-]{36}$/i.test(driverId)||!CATEGORIES.has(service)||name.length<2||!validPhone(phone)||pickup.length<2||destination.length<2||!Number.isInteger(count)||count<1||count>60||!pickupCoordsValid)return json({success:false,error:"Complete your name, valid Tanzania phone, pickup, destination and passenger count."},400);
      const {data:existing,error:existingError}=await admin.from("ione_transport_jobs").select("id").eq("passenger_user_id",user.id).in("status",["requested","accepted","in_progress"]).maybeSingle();
      if(existingError)return json({success:false,error:"Could not check your existing trip."},500);if(existing)return json({success:false,error:"You already have an active request. Open My Trips."},409);
      const {data:driver,error:driverError}=await admin.from("ione_transport_drivers").select("id,user_id,phone_number,driver_name,availability,verification_status,service_types,passenger_capacity,last_seen_at").eq("id",driverId).maybeSingle();
      if(driverError||!driver)return json({success:false,error:"Driver profile not found."},404);
      if(driver.verification_status!=="approved"||driver.availability!=="active"||Date.parse(driver.last_seen_at)<Date.now()-300000)return json({success:false,error:"Driver is no longer active. Refresh the list."},409);
      if(!(driver.service_types||[]).includes(service))return json({success:false,error:"This driver does not provide that service."},400);if(count>driver.passenger_capacity)return json({success:false,error:"Passenger count exceeds vehicle capacity."},400);
      const {data:job,error}=await admin.from("ione_transport_jobs").insert({passenger_user_id:user.id,driver_id:driver.id,driver_user_id:driver.user_id,service_type:service,passenger_name:name,passenger_phone:phone,pickup_location:pickup,destination,passenger_count:count,notes,pickup_lat:pickupLat,pickup_lng:pickupLng,status:"requested"}).select("id,status,service_type,pickup_location,destination,passenger_count,requested_at").single();
      if(error){console.error("ione-transport create_request insert failed:",{code:error.code,message:error.message,details:error.details,hint:error.hint});if(error.code==="23505")return json({success:false,error:"You already have an active request. Open My Trips."},409);return json({success:false,error:"We could not save this trip. Please refresh and try again."},500);}
      // Return the confirmed booking independently of external notification delivery.
      EdgeRuntime.waitUntil(notifyTransport(admin,job,driver.user_id,driver.phone_number,"request_received","i1 Transport • New ride request",name+" requested "+service.replace("_"," ")+" from "+pickup+".","i1 Transport: "+name+" requested a "+service.replace("_"," ")+" trip from "+pickup+". Open i1 Transport to accept."));
      return json({success:true,job,message:"Your trip request has been sent. The driver will be alerted when notifications are available."});
    }
    if (action === "location_update") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);
      const lat=Number(body?.latitude),lng=Number(body?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)return json({success:false,error:"Valid GPS coordinates are required."},400);
      const {data:job,error:jobError}=await admin.from("ione_transport_jobs").select("id").eq("driver_user_id",user.id).in("status",["accepted","in_progress"]).order("accepted_at",{ascending:false}).limit(1).maybeSingle();
      if(jobError||!job)return json({success:false,error:"Location sharing is available only during your accepted trip."},409);
      const now=new Date().toISOString();const {error}=await admin.from("ione_transport_drivers").update({current_lat:lat,current_lng:lng,location_updated_at:now,last_seen_at:now,updated_at:now}).eq("user_id",user.id).eq("verification_status","approved");
      if(error)return json({success:false,error:"Could not update your live location."},500);return json({success:true,updated_at:now});
    }
    if (action === "set_availability" || action === "heartbeat") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);
      if(action==="heartbeat"){const {data,error}=await admin.from("ione_transport_drivers").update({last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("verification_status","approved").select("availability,return_online_after_job").maybeSingle();if(error)return json({success:false,error:"Presence update failed."},500);return json({success:true,driver:data||null});}
      const desired=clean(body?.availability,20).toLowerCase();if(!["active","offline"].includes(desired))return json({success:false,error:"Choose ACTIVE or OFFLINE."},400);
      const {data,error}=await admin.rpc("ione_transport_set_availability",{p_driver_user_id:user.id,p_availability:desired});if(error)return json({success:false,error:"Availability update failed."},500);return json(data);
    }
    if (action === "my_jobs") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);
      const {data:rows,error}=await admin.from("ione_transport_jobs").select("*").or("passenger_user_id.eq."+user.id+",driver_user_id.eq."+user.id).order("requested_at",{ascending:false}).limit(30);if(error)return json({success:false,error:"Could not load trips."},500);
      const jobs=await Promise.all((rows||[]).map(async(j:any)=>{const passenger=j.passenger_user_id===user.id;const {data:d}=await admin.from("ione_transport_drivers").select("driver_name,phone_number,vehicle_make_model,vehicle_registration,availability,profile_photo_path,current_lat,current_lng,location_updated_at").eq("id",j.driver_id).maybeSingle();const safe:any={...(d||{})};const profile_photo_path=safe.profile_photo_path;delete safe.profile_photo_path;const unlocked=["accepted","in_progress","completed"].includes(j.status);const live=["accepted","in_progress"].includes(j.status);return {...j,passenger_phone:!passenger&&unlocked?j.passenger_phone:"",driver:{...safe,phone_number:passenger&&unlocked?safe.phone_number:"",current_lat:live?safe.current_lat:null,current_lng:live?safe.current_lng:null,location_updated_at:live?safe.location_updated_at:null,profile_photo_url:passenger?await signedUrl(admin,profile_photo_path||null):null},viewer_role:passenger?"passenger":"driver"};}));
      return json({success:true,jobs});
    }
    if (action === "accept") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);const id=clean(body?.job_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))return json({success:false,error:"Invalid request."},400);
      const {data,error}=await admin.rpc("ione_transport_claim_job",{p_job_id:id,p_driver_user_id:user.id});if(error)return json({success:false,error:"Could not accept trip."},500);if(data?.success){const {data:job}=await admin.from("ione_transport_jobs").select("*").eq("id",id).maybeSingle();if(job){const {data:driver}=await admin.from("ione_transport_drivers").select("driver_name").eq("id",job.driver_id).maybeSingle();await notifyTransport(admin,job,job.passenger_user_id,job.passenger_phone,"driver_accepted","i1 Transport • Driver accepted",String(driver?.driver_name||"Your driver")+" accepted your request and will contact you shortly.","i1 Transport: Your driver accepted your request. Open i1 Transport to chat or call.");}}return json(data);
    }
    if (action === "decline") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);
      const {data,error}=await admin.from("ione_transport_jobs").update({status:"declined",driver_note:clean(body?.reason||"Driver declined.",600),updated_at:new Date().toISOString()}).eq("id",clean(body?.job_id,50)).eq("driver_user_id",user.id).eq("status","requested").select("id").maybeSingle();if(error||!data)return json({success:false,error:"Request no longer available."},409);const {data:job}=await admin.from("ione_transport_jobs").select("*").eq("id",clean(body?.job_id,50)).maybeSingle();if(job)await notifyTransport(admin,job,job.passenger_user_id,job.passenger_phone,"driver_declined","i1 Transport • Request declined","The selected driver cannot take this trip. Please choose another available driver.","i1 Transport: Your selected driver declined the request. Please choose another driver.");return json({success:true,message:"Request declined."});
    }
    if (action === "start_trip" || action === "complete_trip" || action === "cancel_trip") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);const id=clean(body?.job_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))return json({success:false,error:"Invalid trip."},400);
      const transition=action==="start_trip"?"start":action==="complete_trip"?"complete":"cancel";const {data,error}=await admin.rpc("ione_transport_transition_job",{p_job_id:id,p_actor_user_id:user.id,p_action:transition,p_reason:clean(body?.reason,300)});if(error)return json({success:false,error:"Could not update trip."},500);
      if(data?.success){const {data:job}=await admin.from("ione_transport_jobs").select("*").eq("id",id).maybeSingle();if(job){const {data:driver}=await admin.from("ione_transport_drivers").select("phone_number").eq("id",job.driver_id).maybeSingle();const events=action==="start_trip"?[{uid:job.passenger_user_id,phone:job.passenger_phone,kind:"trip_started",title:"i1 Transport • Trip started",body:"Your driver has started the journey to "+job.destination+".",sms:"i1 Transport: Your driver has started the trip to "+job.destination+"."}]:action==="complete_trip"?[{uid:job.passenger_user_id,phone:job.passenger_phone,kind:"trip_completed_passenger",title:"i1 Transport • Trip completed",body:"Your journey is marked complete. Thank you for travelling with i1.",sms:"i1 Transport: Your trip is complete. Thank you for travelling with i1."},{uid:job.driver_user_id,phone:driver?.phone_number,kind:"trip_completed_driver",title:"i1 Transport • Job complete",body:"Trip completed. Your availability has been updated.",sms:"i1 Transport: Job completed. Your availability has been updated."}]:[{uid:job.passenger_user_id,phone:job.passenger_phone,kind:"trip_cancelled_passenger",title:"i1 Transport • Trip cancelled",body:"Your transport request was cancelled.",sms:"i1 Transport: Your transport trip was cancelled."},{uid:job.driver_user_id,phone:driver?.phone_number,kind:"trip_cancelled_driver",title:"i1 Transport • Trip cancelled",body:"The transport trip was cancelled.",sms:"i1 Transport: The transport trip was cancelled."}];await Promise.all(events.map(e=>notifyTransport(admin,job,e.uid,e.phone,e.kind,e.title,e.body,e.sms)));}}
      return json(data);
    }
    if (action === "get_messages" || action === "send_message") {
      const user=await getVerifiedUser(admin,req);if(!user)return json({success:false,error:"Your i1 session is not ready."},401);const id=clean(body?.job_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))return json({success:false,error:"Invalid trip."},400);
      const {data:job,error:je}=await admin.from("ione_transport_jobs").select("id,passenger_user_id,driver_user_id,status").eq("id",id).maybeSingle();if(je||!job)return json({success:false,error:"Trip not found."},404);
      if(user.id!==job.passenger_user_id&&user.id!==job.driver_user_id)return json({success:false,error:"Not a trip participant."},403);if(!["accepted","in_progress","completed"].includes(job.status))return json({success:false,error:"Chat opens after driver acceptance."},409);
      if(action==="send_message"){const message=clean(body?.message,1000);if(!message)return json({success:false,error:"Write a message first."},400);const {count:recentCount,error:rateError}=await admin.from("ione_transport_messages").select("id",{count:"exact",head:true}).eq("sender_user_id",user.id).gt("created_at",new Date(Date.now()-60000).toISOString());if(rateError)return json({success:false,error:"Could not verify message rate."},500);if((recentCount||0)>=20)return json({success:false,error:"Please wait before sending more messages."},429);const {data,error}=await admin.from("ione_transport_messages").insert({job_id:id,sender_user_id:user.id,message}).select("id,job_id,sender_user_id,message,created_at").single();if(error)return json({success:false,error:"Message could not be sent."},500);const recipient=job.passenger_user_id===user.id?job.driver_user_id:job.passenger_user_id;await sendTransportPush(admin,recipient,{title:"i1 Transport • New chat message",body:"You have a new message in your trip chat.",url:"./?i1Transport=1&trip="+encodeURIComponent(id),tag:"i1-transport-chat-"+id});return json({success:true,message:data});}
      const {data,error}=await admin.from("ione_transport_messages").select("id,job_id,sender_user_id,message,created_at").eq("job_id",id).order("created_at",{ascending:true}).limit(100);if(error)return json({success:false,error:"Could not load chat."},500);return json({success:true,messages:data||[]});
    }

    if (action === "authority_dashboard" || action === "approve" || action === "reject" || action === "suspend_driver" || action === "reinstate_driver") {
      if (!(await validAuthoritySession(admin, body?.authority_session || req.headers.get("x-ione-authority-session")))) {
        return json({ success: false, error: "Authority Press session expired. Unlock Authority Press again." }, 401);
      }
      if (action === "authority_dashboard") {
        const [pendingResult, approvedResult, rejectedResult, driversResult, jobsResult] = await Promise.all([
          admin.from("ione_transport_driver_applications").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(300),
          admin.from("ione_transport_driver_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
          admin.from("ione_transport_driver_applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
          admin.from("ione_transport_drivers").select("id,user_id,driver_name,phone_number,service_types,operating_area,vehicle_make_model,vehicle_registration,passenger_capacity,verification_status,availability,profile_photo_path,last_seen_at").order("created_at", { ascending: false }).limit(300),
          admin.from("ione_transport_jobs").select("id,service_type,passenger_name,pickup_location,destination,status,requested_at,driver_user_id").in("status", ["requested","accepted","in_progress"]).order("requested_at", { ascending: false }).limit(300),
        ]);
        if (pendingResult.error || approvedResult.error || rejectedResult.error || driversResult.error || jobsResult.error) return json({ success: false, error: "Could not load i1 Transport operations." }, 500);
        const applications = await Promise.all((pendingResult.data || []).map(async (row: any) => {
          const { profile_photo_path, licence_document_path, vehicle_photo_path, ...safe } = row;
          return {
            ...safe,
            profile_photo_url: await signedUrl(admin, profile_photo_path),
            licence_document_url: await signedUrl(admin, licence_document_path),
            vehicle_photo_url: await signedUrl(admin, vehicle_photo_path),
          };
        }));
        const drivers = await Promise.all((driversResult.data || []).map(async (d: any) => {
          const photo = await signedUrl(admin, d.profile_photo_path); const { profile_photo_path, ...safe } = d; return { ...safe, profile_photo_url: photo };
        }));
        const names = new Map(drivers.map((d: any) => [d.user_id, d.driver_name]));
        const activeJobs = (jobsResult.data || []).map((j: any) => ({ ...j, driver_name: names.get(j.driver_user_id) || "Verified driver" }));
        return json({ success: true, applications, drivers, active_jobs: activeJobs, metrics: {
          pending: applications.length, approved: approvedResult.count || 0, rejected: rejectedResult.count || 0,
          active: drivers.filter((d: any) => d.availability === "active").length,
          busy: drivers.filter((d: any) => d.availability === "busy").length, open_jobs: activeJobs.length,
        } });
      }

      if (action === "suspend_driver" || action === "reinstate_driver") {
        const id=clean(body?.driver_id,50);if(!/^[0-9a-f-]{36}$/i.test(id))return json({success:false,error:"Invalid driver profile."},400);
        if(action==="suspend_driver"){
          const {data,error}=await admin.from("ione_transport_drivers").update({verification_status:"suspended",availability:"offline",return_online_after_job:false,updated_at:new Date().toISOString()}).eq("id",id).neq("availability","busy").select("id,user_id").maybeSingle();
          if(error||!data)return json({success:false,error:"Driver not found or currently on a trip. Finish or cancel it first."},409);
          await admin.from("ione_transport_jobs").update({status:"declined",driver_note:"Driver suspended by Authority Press.",updated_at:new Date().toISOString()}).eq("driver_user_id",data.user_id).eq("status","requested");
          return json({success:true,message:"Driver suspended and removed from the active list."});
        }
        const {data,error}=await admin.from("ione_transport_drivers").update({verification_status:"approved",availability:"offline",return_online_after_job:true,updated_at:new Date().toISOString()}).eq("id",id).eq("verification_status","suspended").select("id").maybeSingle();
        if(error||!data)return json({success:false,error:"Suspended driver profile not found."},404);return json({success:true,message:"Driver reinstated. They must switch to ACTIVE themselves."});
      }

      const applicationId = clean(body?.application_id, 50);
      if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return json({ success: false, error: "Invalid driver application." }, 400);
      const { data: application, error: loadError } = await admin.from("ione_transport_driver_applications")
        .select("*").eq("id", applicationId).maybeSingle();
      if (loadError || !application) return json({ success: false, error: "Driver application not found." }, 404);
      if (application.status !== "pending") return json({ success: false, error: "This application has already been reviewed. Refresh the dashboard." }, 409);
      const now = new Date().toISOString();
      const claim = await admin.from("ione_transport_driver_applications").update({ status: "processing", updated_at: now })
        .eq("id", applicationId).eq("status", "pending").select("id").maybeSingle();
      if (claim.error || !claim.data) return json({ success: false, error: "Another Authority member is reviewing this application. Refresh the dashboard." }, 409);
      const note = clean(body?.note, 600);
      if (action === "reject") {
        const rejected = await admin.from("ione_transport_driver_applications").update({
          status: "rejected", admin_note: note, reviewed_at: now, reviewed_by: "Authority Press", updated_at: now,
        }).eq("id", applicationId).eq("status", "processing");
        if (rejected.error) {
          await admin.from("ione_transport_driver_applications").update({ status: "pending", updated_at: new Date().toISOString() })
            .eq("id", applicationId).eq("status", "processing");
          return json({ success: false, error: "Could not save the rejection decision. The application was returned to the review queue." }, 500);
        }
        return json({ success: true, message: "Driver application rejected." });
      }

      const driverWrite = await admin.from("ione_transport_drivers").upsert({
        user_id: application.user_id, application_id: application.id, driver_name: application.driver_name,
        phone_number: application.phone_number, service_types: application.service_types,
        operating_area: application.operating_area, vehicle_make_model: application.vehicle_make_model,
        vehicle_registration: application.vehicle_registration, vehicle_color: application.vehicle_color,
        passenger_capacity: application.passenger_capacity, profile_photo_path: application.profile_photo_path,
        verification_status: "approved", availability: "offline", verified_at: now, updated_at: now,
      }, { onConflict: "user_id" }).select("id").single();
      if (driverWrite.error) {
        await admin.from("ione_transport_driver_applications").update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", applicationId).eq("status", "processing");
        console.error("i1 Transport driver profile creation failed:", driverWrite.error.code);
        return json({ success: false, error: "The verified driver profile could not be created. No approval was recorded." }, 500);
      }
      const approved = await admin.from("ione_transport_driver_applications").update({
        status: "approved", admin_note: note, reviewed_at: now, reviewed_by: "Authority Press", updated_at: now,
      }).eq("id", applicationId).eq("status", "processing");
      if (approved.error) {
        await admin.from("ione_transport_drivers").delete().eq("user_id", application.user_id);
        await admin.from("ione_transport_driver_applications").update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", applicationId).eq("status", "processing");
        return json({ success: false, error: "Approval was rolled back because the review record could not be saved." }, 500);
      }
      return json({ success: true, message: "Driver approved. Their verified i1 Transport profile is now registered and starts OFFLINE until they choose to go active." });
    }

    return json({ success: false, error: "Unknown i1 Transport action." }, 400);
  } catch (error) {
    console.error("ione-transport failure:", error);
    return json({ success: false, error: "i1 Transport is temporarily unavailable. Please try again." }, 500);
  }
});
