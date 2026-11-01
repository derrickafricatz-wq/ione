/* i1 Transport — driver onboarding and Authority Press verification.
   This first release opens verified driver applications; it does not alter Boda Yangu. */
(function () {
  "use strict";
  if (window.__ioneTransportBooted) return;
  window.__ioneTransportBooted = true;

  const style = document.createElement("style");
  style.textContent = `
    #openBusBooking.ione-transport-tile{background:linear-gradient(145deg,#174b3b,#0c3028 68%,#09211f)!important;border:1px solid #78c7a0!important;color:#f2fff7!important}
    #openBusBooking.ione-transport-tile .smart-icon{font-size:27px;color:#b7f0cd}
    #openBusBooking.ione-transport-tile strong{letter-spacing:.5px}
    #ioneTransportOverlay{position:fixed;inset:0;z-index:100800;display:none;overflow:auto;overscroll-behavior:contain;background:#071410;color:#f3fff7;font-family:Arial,sans-serif}
    #ioneTransportOverlay *{box-sizing:border-box}
    .it-shell{width:min(1000px,100%);min-height:100%;margin:0 auto;padding:clamp(14px,4vw,30px)}
    .it-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
    .it-brand{font-size:11px;font-weight:900;letter-spacing:3px;color:#9de1b5}
    .it-close,.it-btn{min-height:44px;padding:12px 16px;border:1px solid #47775a;border-radius:12px;background:#10271d;color:#f4fff7;font-weight:900;cursor:pointer}
    .it-close{padding:9px 14px}
    .it-hero{padding:clamp(22px,5vw,42px);border:1px solid #2f6447;border-radius:23px;background:linear-gradient(145deg,#123b2b,#0b241c);margin-bottom:15px}
    .it-kicker{font-size:10px;font-weight:900;letter-spacing:2.5px;color:#a6e4b9}
    .it-hero h1{margin:11px 0 8px;font-size:clamp(34px,8vw,58px);line-height:1;letter-spacing:-1.4px;color:#f3fff7}
    .it-hero p{max-width:720px;margin:0;color:#c7dfcf;font-size:14px;line-height:1.7}
    .it-services{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}
    .it-service{min-width:0;padding:16px 12px;border:1px solid #294e3a;border-radius:16px;background:#0d2118}
    .it-service .it-emoji{font-size:25px}
    .it-service strong{display:block;margin:8px 0 5px;font-size:13px;color:#f4fff7}
    .it-service span{display:block;color:#b4cfbd;font-size:11px;line-height:1.5}
    .it-note{padding:14px 16px;border:1px solid #315b42;border-radius:14px;background:#0c2017;color:#c9e5d1;font-size:13px;line-height:1.6;margin:14px 0}
    .it-card{padding:19px;border:1px solid #294e3a;border-radius:18px;background:#0b1d15;margin-top:14px}
    .it-card h2{margin:0 0 8px;font-size:20px;color:#f2fff7}
    .it-muted{color:#b6cfbe;font-size:12px;line-height:1.6}
    .it-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:15px}
    .it-field{min-width:0}
    .it-field.full{grid-column:1/-1}
    .it-field label,.it-label{display:block;margin-bottom:6px;color:#cde5d3;font-size:11px;font-weight:900;letter-spacing:.5px}
    .it-field input,.it-field select,.it-field textarea{width:100%;min-height:46px;padding:12px;border:1px solid #365d45;border-radius:10px;background:#06130d;color:#f4fff7;font:14px Arial,sans-serif;outline:none}
    .it-field input:focus,.it-field select:focus,.it-field textarea:focus{border-color:#9be0b0}
    .it-field input[type=file]{font-size:12px;padding:9px}
    .it-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .it-check{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #31553e;border-radius:10px;background:#08170f;color:#e5f6e9;font-size:12px;font-weight:700}
    .it-check input{width:17px;height:17px;min-height:0;accent-color:#69c78b}
    .it-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
    .it-btn.primary{background:linear-gradient(145deg,#9ce7b4,#53bd7c);border-color:#b8f2ca;color:#082517}
    .it-btn:disabled{opacity:.55;cursor:wait}
    .it-status{min-height:22px;margin-top:12px;color:#c6e9d0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
    .it-status.error{color:#ffb8ad}
    .it-status.success{color:#9de5b3}
    .it-status-pill{display:inline-flex;padding:6px 10px;border:1px solid #4a865d;border-radius:999px;background:#102c1c;color:#b9f1c7;font-size:10px;font-weight:900;letter-spacing:.8px}
    .it-application-status{margin-top:12px;padding:14px;border:1px solid #315b42;border-radius:12px;background:#08170f;color:#d9f0df;font-size:13px;line-height:1.65}
    #ioneTransportAuthority{margin-top:18px;border:1px solid #315a43;border-radius:17px;padding:17px;background:linear-gradient(145deg,rgba(31,91,57,.12),rgba(6,17,11,.2))}
    #ioneTransportAuthority h3{margin:0;color:#f2fff7;font-size:20px}
    .it-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:13px 0}
    .it-metric{padding:12px;border:1px solid #31513c;border-radius:12px;background:#09180f}
    .it-metric strong{display:block;font-size:24px;color:#b5efc6}
    .it-metric span{display:block;margin-top:4px;color:#a8c5b1;font-size:10px;font-weight:800}
    .it-app-card{padding:14px;margin:10px 0;border:1px solid #355d43;border-radius:13px;background:#07150d;color:#e9f6ec;overflow-wrap:anywhere}
    .it-app-card h4{margin:0 0 7px;font-size:16px;color:#fff}
    .it-app-meta{color:#b9d2c1;font-size:12px;line-height:1.65}
    .it-doc-links{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
    .it-doc-links a{color:#a7e8bb;font-size:12px;font-weight:800;text-decoration:underline}
    .it-app-card textarea{width:100%;min-height:55px;margin-top:8px;padding:9px;border:1px solid #31553e;border-radius:9px;background:#041009;color:#fff}
    .it-app-card button{margin:8px 7px 0 0;min-height:38px;padding:9px 12px;border:1px solid #5c9369;border-radius:9px;background:#173b25;color:#eaffef;font-weight:900}
    .it-app-card button.danger{border-color:#8c4a42;background:#351b18;color:#ffd5cf}
    @media(max-width:620px){.it-services{grid-template-columns:repeat(2,minmax(0,1fr))}.it-form{grid-template-columns:1fr}.it-field.full{grid-column:auto}.it-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.it-shell{padding:12px}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "ioneTransportOverlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <main class="it-shell">
      <header class="it-top"><div class="it-brand">I|ONE • PRIVATE MOBILITY</div><button class="it-close" id="itClose" type="button">CLOSE ✕</button></header>
      <section class="it-hero">
        <div class="it-kicker">ARUSHA REGION • AUTHORITY-VERIFIED NETWORK</div>
        <h1>i1 Transport</h1>
        <p>One connected transport network for private journeys. Choose Taxi, Special Hire, Shuttle or Bus services. Drivers apply here and every application is reviewed by Authority Press before approval.</p>
      </section>
      <section class="it-services" aria-label="Transport services">
        <article class="it-service"><div class="it-emoji">🚕</div><strong>Taxi</strong><span>Private point-to-point journeys around Arusha</span></article>
        <article class="it-service"><div class="it-emoji">🚘</div><strong>Special Hire</strong><span>Private hires, business trips and airport transfers</span></article>
        <article class="it-service"><div class="it-emoji">🚐</div><strong>Shuttle</strong><span>Group transport and scheduled shuttle services</span></article>
        <article class="it-service"><div class="it-emoji">🚌</div><strong>Bus</strong><span>Bus operators, routes and ticketing in the same network</span></article>
      </section>
      <div class="it-note"><strong>Verified-driver standard:</strong> Submitting an application does not make a driver active. Authority Press must review the driver's details and driving-licence document and approve the application first.</div>
      <section class="it-card">
        <h2>Register as an i1 Transport driver</h2>
        <p class="it-muted">Complete your profile carefully. Your documents are stored privately and can only be reviewed by authorized Authority Press staff.</p>
        <form class="it-form" id="itDriverForm">
          <div class="it-field"><label for="itDriverName">FULL NAME</label><input id="itDriverName" name="driver_name" maxlength="120" required placeholder="Name as shown on your licence"></div>
          <div class="it-field"><label for="itDriverPhone">PHONE NUMBER</label><input id="itDriverPhone" name="phone_number" type="tel" maxlength="20" required placeholder="+255 7XX XXX XXX"></div>
          <div class="it-field"><label for="itDriverEmail">EMAIL (OPTIONAL)</label><input id="itDriverEmail" name="email" type="email" maxlength="254" placeholder="name@example.com"></div>
          <div class="it-field"><label for="itDriverArea">OPERATING AREA</label><input id="itDriverArea" name="operating_area" maxlength="120" required value="" placeholder="e.g. Dar es Salaam, Pwani, Arusha, Mwanza or your service area"></div>
          <div class="it-field full"><span class="it-label">TRANSPORT SERVICE(S) YOU PROVIDE</span><div class="it-categories">
            <label class="it-check"><input type="checkbox" name="service_types" value="taxi"> Taxi</label>
            <label class="it-check"><input type="checkbox" name="service_types" value="special_hire"> Special Hire</label>
            <label class="it-check"><input type="checkbox" name="service_types" value="shuttle"> Shuttle</label>
            <label class="it-check"><input type="checkbox" name="service_types" value="bus"> Bus</label>
          </div></div>
          <div class="it-field"><label for="itVehicle">VEHICLE MAKE / MODEL</label><input id="itVehicle" name="vehicle_make_model" maxlength="120" required placeholder="e.g. Toyota Noah"></div>
          <div class="it-field"><label for="itPlate">VEHICLE REGISTRATION</label><input id="itPlate" name="vehicle_registration" maxlength="30" required placeholder="Registration number"></div>
          <div class="it-field"><label for="itColor">VEHICLE COLOUR</label><input id="itColor" name="vehicle_color" maxlength="40" placeholder="e.g. White"></div>
          <div class="it-field"><label for="itSeats">PASSENGER CAPACITY</label><input id="itSeats" name="passenger_capacity" type="number" min="1" max="60" step="1" required placeholder="Number of passengers"></div>
          <div class="it-field full"><label for="itLicenceNumber">DRIVING LICENCE NUMBER</label><input id="itLicenceNumber" name="licence_number" maxlength="80" required placeholder="Enter your valid driving licence number"></div>
          <div class="it-field"><label for="itProfilePhoto">DRIVER PROFILE PHOTO (OPTIONAL)</label><input id="itProfilePhoto" type="file" accept="image/jpeg,image/png,image/webp"><span class="it-muted">JPG, PNG or WebP • up to 1 MB</span></div>
          <div class="it-field"><label for="itLicenceFile">DRIVING LICENCE DOCUMENT *</label><input id="itLicenceFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><span class="it-muted">Clear JPG, PNG, WebP or PDF • up to 1 MB</span></div>
          <div class="it-field full"><label for="itVehiclePhoto">VEHICLE PHOTO (OPTIONAL)</label><input id="itVehiclePhoto" type="file" accept="image/jpeg,image/png,image/webp"><span class="it-muted">Show the vehicle clearly • up to 1 MB</span></div>
          <div class="it-field full"><div class="it-actions"><button class="it-btn primary" id="itSubmit" type="submit">SUBMIT DRIVER APPLICATION</button><button class="it-btn" id="itCheckStatus" type="button">CHECK MY STATUS</button></div><div class="it-status" id="itFormStatus" role="status" aria-live="polite"></div><div id="itMyStatus"></div></div>
        </form>
      </section>
    </main>`;
  document.body.appendChild(overlay);

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function setStatus(id, message, type) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("error", "success");
    if (type) el.classList.add(type);
  }
  async function readySession() {
    if (typeof heavensSupabase === "undefined") throw new Error("i1 is not connected. Reload the app and try again.");
    const current = await heavensSupabase.auth.getSession();
    if (current.error) throw current.error;
    if (!current.data.session) {
      const signed = await heavensSupabase.auth.signInAnonymously();
      if (signed.error) throw signed.error;
    }
  }
  async function invoke(body) {
    await readySession();
    const result = await heavensSupabase.functions.invoke("ione-transport", { body });
    if (result.error || !result.data?.success) throw new Error(result.data?.error || result.error?.message || "i1 Transport request failed.");
    return result.data;
  }
  function filePayload(file, key) {
    if (!file) return Promise.resolve(null);
    if (file.size > 1048576) return Promise.reject(new Error("Each uploaded file must be 1 MB or smaller."));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        if (comma < 0) return reject(new Error("The selected file could not be prepared."));
        resolve({ mime: file.type, name: file.name, base64: value.slice(comma + 1) });
      };
      reader.readAsDataURL(file);
    });
  }
  function open() {
    overlay.style.display = "block";
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // i1 Transport operations module loads the driver and passenger workspaces.
  }
  function close() {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  $("itClose").addEventListener("click", close);
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && overlay.style.display === "block") close(); });
  const tile = $("openBusBooking");
  if (tile) {
    tile.classList.remove("smart-coming-soon");
    tile.classList.add("ione-transport-tile");
    tile.innerHTML = '<span class="smart-icon" aria-hidden="true">🚕</span><strong>i1 TRANSPORT</strong><small>TAXI • SPECIAL HIRE • SHUTTLE • BUS</small>';
    tile.addEventListener("click", open);
  }

  function renderMyStatus(data) {
    const host = $("itMyStatus");
    if (!host) return;
    const app = data.application;
    const driver = data.driver;
    if (!app && !driver) { host.innerHTML = ""; return; }
    if (driver?.verification_status === "approved") {
      host.innerHTML = '<div class="it-application-status"><span class="it-status-pill">AUTHORITY APPROVED</span><p>Your i1 Transport driver profile is verified. Your availability starts OFFLINE; it will only become visible to passengers when you are enabled for active service.</p></div>';
      return;
    }
    const status = String(app?.status || "pending").toUpperCase();
    const note = app?.admin_note ? "<br><strong>Authority note:</strong> " + esc(app.admin_note) : "";
    host.innerHTML = '<div class="it-application-status"><span class="it-status-pill">' + esc(status) + '</span><br>Your driver application was submitted on ' + esc(app?.created_at ? new Date(app.created_at).toLocaleDateString() : "—") + "." + note + "</div>";
    if (app?.status === "approved") $("itDriverForm").style.display = "none";
  }
  async function loadMyStatus(showMessage) {
    try {
      const data = await invoke({ action: "my_status" });
      renderMyStatus(data);
      if (showMessage && !data.application && !data.driver) setStatus("itFormStatus", "Driver applications are open. Complete the form to request verification.", "success");
    } catch (error) {
      if (showMessage) setStatus("itFormStatus", error.message || "Could not check your status.", "error");
    }
  }
  $("itCheckStatus").addEventListener("click", () => loadMyStatus(true));
  $("itDriverForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("itSubmit");
    button.disabled = true;
    button.textContent = "SUBMITTING…";
    setStatus("itFormStatus", "Preparing your driver profile and documents…");
    try {
      const form = $("itDriverForm");
      const values = new FormData(form);
      const categories = Array.from(form.querySelectorAll('input[name="service_types"]:checked')).map(input => input.value);
      const [profile, licence, vehicle] = await Promise.all([
        filePayload($("itProfilePhoto").files[0], "profile"),
        filePayload($("itLicenceFile").files[0], "licence"),
        filePayload($("itVehiclePhoto").files[0], "vehicle"),
      ]);
      const data = await invoke({
        action: "submit",
        driver_name: values.get("driver_name"),
        phone_number: values.get("phone_number"),
        email: values.get("email"),
        service_types: categories,
        operating_area: values.get("operating_area"),
        vehicle_make_model: values.get("vehicle_make_model"),
        vehicle_registration: values.get("vehicle_registration"),
        vehicle_color: values.get("vehicle_color"),
        passenger_capacity: values.get("passenger_capacity"),
        licence_number: values.get("licence_number"),
        files: { profile, licence, vehicle },
      });
      setStatus("itFormStatus", data.message || "Application submitted.", "success");
      if (data.already_pending || data.already_approved) await loadMyStatus(false);
      else {
        form.reset();
        $("itDriverArea").value = "";
        await loadMyStatus(false);
      }
    } catch (error) {
      setStatus("itFormStatus", error.message || "Could not submit your application.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "SUBMIT DRIVER APPLICATION";
    }
  });

  function installAuthoritySection() {
    const host = document.querySelector("#authorityPressPanel .authority-panel-inner");
    if (!host || $("ioneTransportAuthority")) return;
    const section = document.createElement("section");
    section.id = "ioneTransportAuthority";
    section.innerHTML = `
      <div class="authority-section-kicker">I|ONE TRANSPORT • AUTHORITY ONLY</div>
      <h3>DRIVER APPLICATIONS & VERIFICATION</h3>
      <p class="it-muted">Review each driver's identity, licence and vehicle documents. Approval creates a verified driver profile; new drivers remain OFFLINE until availability is enabled.</p>
      <div class="it-metrics">
        <div class="it-metric"><strong id="itAuthPending">—</strong><span>PENDING REVIEW</span></div>
        <div class="it-metric"><strong id="itAuthApproved">—</strong><span>APPROVED</span></div>
        <div class="it-metric"><strong id="itAuthRejected">—</strong><span>REJECTED</span></div>
      </div>
      <div class="it-actions"><button class="it-btn primary" id="itAuthRefresh" type="button">REFRESH APPLICATIONS</button></div>
      <div class="it-status" id="itAuthStatus" role="status" aria-live="polite"></div>
      <div id="itAuthApplications"></div>`;
    host.appendChild(section);
    $("itAuthRefresh").addEventListener("click", loadAuthority);
    $("itAuthApplications").addEventListener("click", handleAuthorityAction);
  }
  async function loadAuthority() {
    installAuthoritySection();
    if (!$("itAuthStatus")) return;
    const token = sessionStorage.getItem("ioneAuthoritySession") || "";
    if (!token) { setStatus("itAuthStatus", "Unlock Authority Press to review transport applications.", "error"); return; }
    setStatus("itAuthStatus", "Loading driver applications…");
    try {
      const data = await invoke({ action: "authority_dashboard", authority_session: token });
      $("itAuthPending").textContent = String(data.metrics?.pending ?? 0);
      $("itAuthApproved").textContent = String(data.metrics?.approved ?? 0);
      $("itAuthRejected").textContent = String(data.metrics?.rejected ?? 0);
      const host = $("itAuthApplications");
      if (!data.applications?.length) {
        host.innerHTML = '<div class="it-app-card">No pending i1 Transport driver applications.</div>';
      } else {
        host.innerHTML = data.applications.map(app => {
          const services = (app.service_types || []).map(v => ({
            taxi:"Taxi",special_hire:"Special Hire",shuttle:"Shuttle",bus:"Bus"
          }[v] || v)).join(" • ");
          const links = [
            app.profile_photo_url ? '<a href="' + esc(app.profile_photo_url) + '" target="_blank" rel="noopener">Driver photo</a>' : "",
            app.licence_document_url ? '<a href="' + esc(app.licence_document_url) + '" target="_blank" rel="noopener">Driving licence document</a>' : "",
            app.vehicle_photo_url ? '<a href="' + esc(app.vehicle_photo_url) + '" target="_blank" rel="noopener">Vehicle photo</a>' : "",
          ].filter(Boolean).join("");
          return '<article class="it-app-card" data-app-id="' + esc(app.id) + '">' +
            '<h4>' + esc(app.driver_name) + '</h4>' +
            '<div class="it-app-meta"><strong>Phone:</strong> ' + esc(app.phone_number) + '<br><strong>Services:</strong> ' + esc(services) +
            '<br><strong>Area:</strong> ' + esc(app.operating_area) + '<br><strong>Vehicle:</strong> ' + esc(app.vehicle_make_model) +
            '<br><strong>Registration:</strong> ' + esc(app.vehicle_registration) + '<br><strong>Colour / capacity:</strong> ' +
            esc(app.vehicle_color || "Not supplied") + " / " + esc(app.passenger_capacity) + " passengers" +
            '<br><strong>Licence number:</strong> ' + esc(app.licence_number) + '<br><strong>Submitted:</strong> ' +
            esc(new Date(app.created_at).toLocaleString()) + '</div>' +
            (links ? '<div class="it-doc-links">' + links + '</div>' : '<div class="it-muted">No document links were returned.</div>') +
            '<textarea data-note placeholder="Optional Authority note for this decision"></textarea>' +
            '<button type="button" data-action="approve">APPROVE DRIVER</button>' +
            '<button type="button" class="danger" data-action="reject">REJECT APPLICATION</button></article>';
        }).join("");
      }
      setStatus("itAuthStatus", "Applications loaded. Review documents before approving.", "success");
    } catch (error) {
      setStatus("itAuthStatus", error.message || "Could not load transport applications.", "error");
    }
  }
  async function handleAuthorityAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest("[data-app-id]");
    if (!card) return;
    const action = button.dataset.action;
    const note = card.querySelector("textarea")?.value || "";
    if (action === "reject" && !window.confirm("Reject this i1 Transport driver application?")) return;
    if (action === "approve" && !window.confirm("Approve this driver after checking the licence and vehicle documents?")) return;
    const token = sessionStorage.getItem("ioneAuthoritySession") || "";
    button.disabled = true;
    button.textContent = action === "approve" ? "APPROVING…" : "REJECTING…";
    try {
      const data = await invoke({ action, application_id: card.dataset.appId, note, authority_session: token });
      setStatus("itAuthStatus", data.message || "Decision saved.", "success");
      await loadAuthority();
    } catch (error) {
      setStatus("itAuthStatus", error.message || "Could not save the decision.", "error");
      button.disabled = false;
      button.textContent = action === "approve" ? "APPROVE DRIVER" : "REJECT APPLICATION";
    }
  }

  function watchAuthority() {
    installAuthoritySection();
    const panel = $("authorityPressPanel");
    if (panel && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        if (getComputedStyle(panel).display !== "none") {
          installAuthoritySection();
          loadAuthority();
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ["style", "class", "aria-hidden"] });
    }
    const authorityButton = $("openAuthority");
    if (authorityButton) authorityButton.addEventListener("click", () => setTimeout(loadAuthority, 500));
  }
  // i1 Transport Authority operations are mounted by ione-transport-operations.js.
})();