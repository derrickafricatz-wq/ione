/* I|ONE Sokoni — isolated Swahili-first vendor onboarding and market entry.
   Vendor access is granted only by the protected ione-sokoni Edge Function. */
(function () {
  "use strict";
  if (window.__ioneSokoniBooted) return;
  window.__ioneSokoniBooted = true;

  const css = `
  #ioneSokoniOverlay{position:fixed;inset:0;z-index:100050;display:none;background:#071713;color:#f3fff8;font-family:Arial,sans-serif;overflow:auto;overscroll-behavior:contain}
  #ioneSokoniOverlay *{box-sizing:border-box}
  .is-shell{width:min(980px,100%);min-height:100%;margin:0 auto;padding:clamp(14px,4vw,28px)}
  .is-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px}
  .is-brand{font-size:11px;letter-spacing:3px;font-weight:900;color:#a9dfbf}
  .is-close,.is-button{border:1px solid #477d61;border-radius:12px;background:#10271c;color:#effff4;font-weight:800;padding:12px 15px;min-height:44px;cursor:pointer}
  .is-close{padding:9px 13px}
  .is-hero{padding:clamp(22px,5vw,42px);border:1px solid #2e6447;border-radius:22px;background:#10271c;margin-bottom:16px}
  .is-kicker{font-size:10px;letter-spacing:2.5px;color:#a6d9b5;font-weight:900}
  .is-hero h1{font-size:clamp(32px,8vw,56px);line-height:1.03;margin:12px 0;font-weight:900;letter-spacing:-1.3px}
  .is-hero p{max-width:650px;color:#c5ded0;line-height:1.65;margin:0}
  .is-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
  .is-category{padding:17px 14px;border:1px solid #294d39;border-radius:16px;background:#0d2118;min-height:130px}
  .is-category b{display:block;margin:10px 0 6px;font-size:15px}
  .is-category span{display:block;color:#b7d1c0;font-size:12px;line-height:1.55}
  .is-card{padding:20px;border:1px solid #294d39;border-radius:18px;background:#0c1e16;margin-top:14px}
  .is-card h2{font-size:20px;margin:0 0 9px}
  .is-muted{color:#b7d1c0;font-size:13px;line-height:1.65}
  .is-form{display:grid;gap:11px;margin-top:15px}
  .is-form label{font-size:12px;font-weight:800;color:#cde6d5}
  .is-form input{width:100%;min-height:48px;padding:13px;border:1px solid #3b654a;border-radius:11px;background:#07140e;color:#f3fff8;font-size:16px;outline:none}
  .is-form input:focus{border-color:#9cddb0}
  .is-button.primary{background:#b6e7c3;color:#0a2414;border-color:#b6e7c3}
  .is-status{min-height:22px;margin-top:10px;font-size:13px;line-height:1.5;color:#d6f5df;overflow-wrap:anywhere}
  .is-status.error{color:#ffb9b9}
  .is-payment{display:none;padding:15px;margin-top:13px;border:1px solid #507a58;border-radius:12px;background:#142b1b;line-height:1.7;font-size:14px}
  .is-payment strong{color:#d7f8df}
  .is-vendors{display:grid;gap:8px;margin-top:12px}
  .is-vendor{padding:12px;border:1px solid #274d36;border-radius:11px;background:#091a11}
  .is-vendor strong{display:block}
  .is-vendor small{color:#b7d1c0}
  .is-footer{font-size:11px;color:#91b39d;text-align:center;margin:24px 0 8px;line-height:1.6}
  .is-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:14px 0}
  .is-metric{padding:12px 10px;border:1px solid #345b42;border-radius:12px;background:#0a1b11;min-width:0}
  .is-metric span{display:block;color:#b7d1c0;font-size:10px;line-height:1.35}
  .is-metric b{display:block;font-size:19px;margin-top:7px;overflow-wrap:anywhere}
  .is-admin-request{padding:14px;border:1px solid #2c5038;border-radius:12px;margin-top:10px;background:#0a1a11}
  .is-admin-request p{margin:5px 0;color:#c2ddcb;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
  .is-admin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .is-admin-actions button{border:1px solid #4b805b;border-radius:9px;padding:10px 12px;background:#183723;color:#effff4;font-weight:800}
  .is-admin-actions .reject{border-color:#764b4b;background:#301b1b}
  @media(max-width:620px){.is-sections{grid-template-columns:1fr}.is-category{min-height:auto}.is-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.is-hero{padding:22px}.is-admin-actions button{flex:1}}
  `;
  const style = document.createElement("style");
  style.id = "ioneSokoniStyles";
  style.textContent = css;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "ioneSokoniOverlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <main class="is-shell" role="dialog" aria-modal="true" aria-labelledby="isTitle">
      <div class="is-top"><div class="is-brand">I|ONE • SOKONI</div><button class="is-close" id="isClose" type="button">Funga ✕</button></div>
      <section class="is-hero">
        <div class="is-kicker">SOKO LA KARIBU • I|ONE</div>
        <h1 id="isTitle">Karibu Sokoni.</h1>
        <p>Nunua na uza karibu nawe. Pata mboga na matunda, chakula kilichoandaliwa, na huduma ya bodaboda katika sehemu moja.</p>
      </section>
      <section class="is-sections" aria-label="Huduma za Sokoni">
        <div class="is-category"><div aria-hidden="true">🥬</div><b>Mama Sokoni</b><span>Mboga, matunda na bidhaa za kila siku kutoka kwa wauzaji waliothibitishwa.</span></div>
        <div class="is-category"><div aria-hidden="true">🍲</div><b>Mama wa Pishi</b><span>Chakula, chapati, supu na vitafunwa vya karibu nawe.</span></div>
        <div class="is-category"><div aria-hidden="true">🏍️</div><b>Boda Yangu</b><span>Huduma ya usafirishaji na ufuatiliaji wa safari halisi itapatikana baada ya kuunganishwa na waendesha bodaboda waliothibitishwa.</span></div>
      </section>
      <section class="is-card">
        <h2>Jiunge kama muuzaji</h2>
        <p class="is-muted">Jaza jina na namba yako ya simu pekee. Ada ni TZS 1,000 kwa siku 30. Baada ya malipo, Authority Press itathibitisha kabla ya kufungua ruhusa ya kuuza.</p>
        <form class="is-form" id="isVendorForm">
          <div><label for="isVendorName">Jina lako</label><input id="isVendorName" name="vendor_name" autocomplete="name" maxlength="120" required placeholder="Andika jina lako"></div>
          <div><label for="isVendorPhone">Namba ya simu</label><input id="isVendorPhone" name="phone_number" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" required placeholder="Mfano: 07XXXXXXXX"></div>
          <button class="is-button primary" type="submit" id="isSubmit">Tuma ombi la kujiunga</button>
        </form>
        <div class="is-status" id="isSubmitStatus" role="status" aria-live="polite"></div>
        <div class="is-payment" id="isPaymentInstructions">
          <strong>Maelekezo ya malipo ya mkono</strong><br>
          Mtandao: <strong>Airtel Money</strong><br>
          Jina la mfanyabiashara: <strong>DERRICK KIPAJI OF AFRIKA &amp; CO</strong><br>
          Namba ya malipo: <strong>140001788</strong><br>
          Kiasi: <strong>TZS 1,000</strong><br>
          <span class="is-muted">Baada ya kulipa, subiri uthibitisho wa Authority Press. Usitumie huduma ya kuuza kabla ruhusa haijafunguliwa.</span>
        </div>
      </section>
      <section class="is-card">
        <h2>Hali ya ombi langu</h2>
        <p class="is-muted">Angalia kama ombi lako bado linasubiri, limekubaliwa, au kama muda wako wa kutumia Sokoni umeisha.</p>
        <button class="is-button" type="button" id="isCheckStatus">Angalia hali yangu</button>
        <div class="is-status" id="isMyStatus" role="status" aria-live="polite"></div>
      </section>
      <section class="is-card">
        <h2>Wauzaji waliothibitishwa</h2>
        <p class="is-muted">Orodha itaonyesha wauzaji ambao ruhusa yao ya Sokoni bado inatumika.</p>
        <button class="is-button" type="button" id="isRefreshVendors">Sasisha orodha</button>
        <div class="is-vendors" id="isVendorList"><p class="is-muted">Bonyeza “Sasisha orodha” ili kuona wauzaji waliothibitishwa.</p></div>
      </section>
      <p class="is-footer">I|ONE Sokoni • Soko la karibu, kwa uwazi na uaminifu.</p>
    </main>`;
  document.body.appendChild(overlay);

  const $ = (id) => document.getElementById(id);
  const escText = (value) => String(value == null ? "" : value);
  function setStatus(id, message, error) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error", !!error);
  }
  function open() {
    overlay.style.display = "block";
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    loadStatus();
  }
  function close() {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  async function readySession() {
    if (typeof heavensSupabase === "undefined") throw new Error("Huduma haijaunganishwa. Tafadhali pakia upya ukurasa.");
    let result = await heavensSupabase.auth.getSession();
    if (result.error) throw result.error;
    if (!result.data.session) {
      const signed = await heavensSupabase.auth.signInAnonymously();
      if (signed.error) throw signed.error;
    }
  }
  async function invoke(action, extra) {
    await readySession();
    const result = await heavensSupabase.functions.invoke("ione-sokoni", { body: Object.assign({ action }, extra || {}) });
    if (result.error) throw result.error;
    if (!result.data || result.data.success !== true) throw new Error(result.data?.error || "Ombi halikukamilika. Jaribu tena.");
    return result.data;
  }
  async function loadStatus() {
    setStatus("isMyStatus", "Inapakia hali yako…");
    try {
      const data = await invoke("my_status");
      if (data.active) {
        const date = new Date(data.vendor.paid_until).toLocaleDateString("sw-TZ", { year: "numeric", month: "long", day: "numeric" });
        setStatus("isMyStatus", "Ruhusa yako inatumika. Inaisha tarehe " + date + ". Unaweza kuendelea kwenye Sokoni.");
      } else if (data.requests?.[0]?.status === "pending") {
        setStatus("isMyStatus", "Ombi lako linasubiri uthibitisho wa malipo kutoka Authority Press.");
        $("isPaymentInstructions").style.display = "block";
      } else if (data.requests?.[0]?.status === "rejected") {
        setStatus("isMyStatus", "Ombi la mwisho halikuidhinishwa. Tafadhali wasiliana na I|ONE Support kabla ya kutuma ombi jipya.", true);
      } else {
        setStatus("isMyStatus", "Bado huna ruhusa inayotumika ya Sokoni. Tuma ombi la kujiunga hapo juu.");
      }
    } catch (e) {
      setStatus("isMyStatus", e.message || "Imeshindikana kupakia hali.", true);
    }
  }
  async function loadVendors() {
    const list = $("isVendorList");
    list.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "is-muted";
    loading.textContent = "Inapakia wauzaji…";
    list.appendChild(loading);
    try {
      const data = await invoke("public_vendors");
      list.replaceChildren();
      if (!data.vendors.length) {
        const empty = document.createElement("p");
        empty.className = "is-muted";
        empty.textContent = "Bado hakuna wauzaji waliothibitishwa wanaoonekana hapa. Orodha itaonekana wanapoidhinishwa.";
        list.appendChild(empty);
        return;
      }
      data.vendors.forEach((vendor) => {
        const item = document.createElement("div");
        item.className = "is-vendor";
        const name = document.createElement("strong");
        name.textContent = escText(vendor.vendor_name);
        const state = document.createElement("small");
        state.textContent = "Muuzaji aliyethibitishwa • Ruhusa inatumika";
        item.append(name, state);
        list.appendChild(item);
      });
    } catch (e) {
      list.replaceChildren();
      const err = document.createElement("p");
      err.className = "is-muted";
      err.textContent = e.message || "Orodha haipatikani kwa sasa.";
      list.appendChild(err);
    }
  }
  $("isClose").addEventListener("click", close);
  $("isCheckStatus").addEventListener("click", loadStatus);
  $("isRefreshVendors").addEventListener("click", loadVendors);
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  $("isVendorForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("isSubmit");
    button.disabled = true;
    button.textContent = "Inatuma ombi…";
    $("isPaymentInstructions").style.display = "none";
    setStatus("isSubmitStatus", "");
    try {
      const name = $("isVendorName").value.trim();
      const phone = $("isVendorPhone").value.trim();
      const data = await invoke("submit", { vendor_name: name, phone_number: phone });
      $("isPaymentInstructions").style.display = "block";
      setStatus("isSubmitStatus", data.already_pending ? "Ombi lako tayari lipo kwenye orodha ya Authority Press." : "Ombi limetumwa. Sasa fuata maelekezo ya malipo hapa chini.");
      await loadStatus();
    } catch (e) {
      setStatus("isSubmitStatus", e.message || "Ombi halikutumwa. Jaribu tena.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Tuma ombi la kujiunga";
    }
  });

  // Add a protected Sokoni dashboard inside Authority Press without altering its existing panels.
  function installAuthorityDashboard() {
    const host = document.querySelector("#authorityPressPanel .authority-panel-inner");
    if (!host || $("ioneSokoniAuthoritySection")) return;
    const section = document.createElement("section");
    section.id = "ioneSokoniAuthoritySection";
    section.className = "authority-panel-section";
    section.innerHTML = `
      <div class="authority-section-kicker">I|ONE SOKONI • AUTHORITY ONLY</div>
      <h3> SOKONI VENDOR DASHBOARD </h3>
      <p class="authority-section-note">Review manual TZS 1,000 vendor payments. Access activates only after Authority Press confirms payment. This dashboard is separate from billboard subscriptions and Author Studio.</p>
      <button type="button" id="isAuthorityRefresh" class="authority-action-button">REFRESH SOKONI</button>
      <div id="isAuthorityMetrics" class="is-metrics"><div class="is-metric"><span>Loading dashboard…</span></div></div>
      <div id="isAuthorityStatus" class="is-status" role="status" aria-live="polite"></div>
      <div id="isAuthorityRequests"></div>`;
    host.appendChild(section);
    $("isAuthorityRefresh").addEventListener("click", loadAuthorityDashboard);
  }
  async function loadAuthorityDashboard() {
    const status = $("isAuthorityStatus");
    const requests = $("isAuthorityRequests");
    const metrics = $("isAuthorityMetrics");
    if (!status || !requests || !metrics) return;
    status.textContent = "Loading protected Sokoni records…";
    requests.replaceChildren();
    try {
      const data = await invoke("authority_dashboard");
      const m = data.metrics || {};
      const metricItems = [
        ["Pending requests", m.pending || 0],
        ["Active vendors", m.activeVendors || 0],
        ["Expired access", m.expiredVendors || 0],
        ["Confirmed payments", m.confirmedPayments || 0],
        ["Total revenue", "TZS " + Number(m.totalRevenueTzs || 0).toLocaleString("en-TZ")]
      ];
      metrics.replaceChildren();
      metricItems.forEach(([label, value]) => {
        const item = document.createElement("div");
        item.className = "is-metric";
        const name = document.createElement("span");
        name.textContent = label;
        const number = document.createElement("b");
        number.textContent = String(value);
        item.append(name, number);
        metrics.appendChild(item);
      });
      const pending = (data.requests || []).filter((r) => r.status === "pending");
      if (!pending.length) {
        const empty = document.createElement("p");
        empty.className = "authority-section-note";
        empty.textContent = "No pending Sokoni vendor payments.";
        requests.appendChild(empty);
      }
      pending.forEach((request) => {
        const card = document.createElement("article");
        card.className = "is-admin-request";
        const title = document.createElement("strong");
        title.textContent = escText(request.vendor_name);
        const phone = document.createElement("p");
        phone.textContent = "Phone: " + escText(request.phone_number);
        const amount = document.createElement("p");
        amount.textContent = "Manual payment to verify: TZS " + Number(request.amount_tzs || 1000).toLocaleString("en-TZ");
        const created = document.createElement("p");
        created.textContent = "Applied: " + new Date(request.created_at).toLocaleString("en-GB");
        const actions = document.createElement("div");
        actions.className = "is-admin-actions";
        const approve = document.createElement("button");
        approve.type = "button";
        approve.textContent = "CONFIRM PAYMENT & ACTIVATE";
        approve.addEventListener("click", () => reviewRequest(request.id, "approve", approve));
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "reject";
        reject.textContent = "REJECT";
        reject.addEventListener("click", () => reviewRequest(request.id, "reject", reject));
        actions.append(approve, reject);
        card.append(title, phone, amount, created, actions);
        requests.appendChild(card);
      });
      status.textContent = "Sokoni dashboard updated. Confirm only after checking the payment was received.";
    } catch (e) {
      status.textContent = e.message || "Could not load Sokoni dashboard.";
      status.classList.add("error");
    }
  }
  async function reviewRequest(id, action, button) {
    button.disabled = true;
    const card = button.closest(".is-admin-request");
    const note = action === "reject" ? (window.prompt("Optional reason for rejecting this request:") || "") : "";
    try {
      const data = await invoke(action, { request_id: id, note });
      if (card) card.remove();
      $("isAuthorityStatus").textContent = data.message || "Saved.";
      $("isAuthorityStatus").classList.remove("error");
      await loadAuthorityDashboard();
    } catch (e) {
      $("isAuthorityStatus").textContent = e.message || "The decision was not saved.";
      $("isAuthorityStatus").classList.add("error");
      button.disabled = false;
    }
  }

  function wireTile() {
    const tile = document.getElementById("openSokoni");
    if (tile) tile.addEventListener("click", open);
    installAuthorityDashboard();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireTile, { once: true });
  else wireTile();
  window.IoneSokoni = Object.freeze({ open, close, refreshStatus: loadStatus, refreshVendors: loadVendors, refreshAuthorityDashboard: loadAuthorityDashboard });
})();