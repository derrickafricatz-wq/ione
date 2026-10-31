import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      const area = clean(body?.operating_area || "Arusha Region", 120);
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
          .select("id,verification_status,availability,verified_at").eq("user_id", user.id).maybeSingle(),
      ]);
      if (applicationError || driverError) return json({ success: false, error: "Could not load your driver application status." }, 500);
      return json({ success: true, application: application || null, driver: driver || null });
    }

    if (action === "authority_dashboard" || action === "approve" || action === "reject") {
      if (!(await validAuthoritySession(admin, body?.authority_session || req.headers.get("x-ione-authority-session")))) {
        return json({ success: false, error: "Authority Press session expired. Unlock Authority Press again." }, 401);
      }
      if (action === "authority_dashboard") {
        const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
          admin.from("ione_transport_driver_applications").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(300),
          admin.from("ione_transport_driver_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
          admin.from("ione_transport_driver_applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
        ]);
        if (pendingResult.error || approvedResult.error || rejectedResult.error) return json({ success: false, error: "Could not load i1 Transport applications." }, 500);
        const applications = await Promise.all((pendingResult.data || []).map(async (row: any) => {
          const { profile_photo_path, licence_document_path, vehicle_photo_path, ...safe } = row;
          return {
            ...safe,
            profile_photo_url: await signedUrl(admin, profile_photo_path),
            licence_document_url: await signedUrl(admin, licence_document_path),
            vehicle_photo_url: await signedUrl(admin, vehicle_photo_path),
          };
        }));
        return json({ success: true, applications, metrics: {
          pending: applications.length, approved: approvedResult.count || 0, rejected: rejectedResult.count || 0,
        } });
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
