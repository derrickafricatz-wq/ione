(() => {
  "use strict";
  const $ = (id, root = document) => root.querySelector("#" + id);
  const text = (value) => String(value == null ? "" : value);
  const esc = (value) => text(value);
  const style = document.createElement("style");
  style.textContent = `
    #ioneExpertOverlay{position:fixed;inset:0;z-index:100900;display:none;overflow:auto;background:#f7fbf6;color:#243b2d;padding:14px;box-sizing:border-box;font-family:Arial,sans-serif}
    #ioneExpertOverlay *{box-sizing:border-box}
    #ioneExpertOverlay .iex-shell{width:min(940px,100%);margin:0 auto;background:#fff;border:1px solid #d9e7d8;border-radius:22px;padding:clamp(16px,4vw,30px);box-shadow:0 12px 42px rgba(30,70,40,.12)}
    #ioneExpertOverlay .iex-top{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e5eee4;padding-bottom:14px;margin-bottom:16px}
    #ioneExpertOverlay .iex-kicker{font-size:11px;letter-spacing:2px;font-weight:900;color:#59805b}
    #ioneExpertOverlay h1{font-size:clamp(28px,6vw,42px);margin:10px 0;color:#23472c}
    #ioneExpertOverlay h2{font-size:19px;color:#315c39;margin:20px 0 10px}
    #ioneExpertOverlay p,#ioneExpertOverlay small{line-height:1.55;color:#607466}
    #ioneExpertOverlay .iex-card{background:#fbfdf9;border:1px solid #e0eadc;border-radius:15px;padding:14px;margin:12px 0}
    #ioneExpertOverlay .iex-form{display:grid;gap:10px}
    #ioneExpertOverlay label{display:block;font-size:12px;font-weight:800;color:#3b5a43;margin-bottom:5px}
    #ioneExpertOverlay input,#ioneExpertOverlay textarea,#ioneExpertOverlay select{width:100%;padding:11px 12px;border:1px solid #cbdcc8;border-radius:10px;background:#fff;color:#213b29;font:inherit}
    #ioneExpertOverlay textarea{min-height:90px;resize:vertical}
    #ioneExpertOverlay button,#ioneExpertOverlay .iex-button{border:1px solid #c5dcbf;border-radius:11px;background:#eaf4e4;color:#315b38;padding:11px 14px;min-height:42px;font-weight:800;cursor:pointer}
    #ioneExpertOverlay button.primary{background:#e58b55;border-color:#e58b55;color:white}
    #ioneExpertOverlay button:disabled{opacity:.55;cursor:wait}
    #ioneExpertOverlay .iex-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    #ioneExpertOverlay .iex-status{font-size:13px;color:#315b38;margin:8px 0}
    #ioneExpertOverlay .iex-status.error{color:#a12d25}
    #ioneExpertOverlay .iex-reply{border-left:3px solid #d1e6c9;padding:8px 10px;margin:8px 0;background:#f3f8f0;border-radius:0 9px 9px 0}
    #ioneExpertOverlay .iex-advice{border-left:4px solid #e6a26e}
    #ioneExpertOverlay .iex-muted{font-size:12px;color:#708173}
    #ioneExpertAuthority .iex-admin-card{border:1px solid #dce7d8;background:#fff;border-radius:12px;padding:12px;margin:10px 0}
    #ioneExpertAuthority input,#ioneExpertAuthority textarea{width:100%;padding:10px;border:1px solid #d4e1d0;border-radius:8px;margin:5px 0}
    #ioneExpertAuthority button{border:1px solid #c7dbbf;border-radius:9px;padding:9px 12px;background:#eaf4e4;color:#315b38;font-weight:800;margin:4px 4px 4px 0}
    #ioneExpertAuthority button.danger{background:#fff0ec;color:#9c332a;border-color:#e6c2ba}
  `;
  document.head.appendChild(style);

  let root;
  let expertStatus = { is_expert: false };
  function ensureOverlay() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "ioneExpertOverlay";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <main class="iex-shell" role="dialog" aria-modal="true" aria-labelledby="ioneExpertTitle">
        <header class="iex-top"><div><div class="iex-kicker">I|ONE • KNOWLEDGE COMMUNITY</div><strong>Verified experts. Practical answers.</strong></div><button type="button" id="ioneExpertClose">CLOSE</button></header>
        <section><h1 id="ioneExpertTitle">I|ONE Expert</h1><p>Ask a technical question, compare practical answers from several Authority-approved experts, and read official guidance from Authority Press. Experts are verified before they can reply.</p><div id="ioneExpertStatus" class="iex-status" role="status" aria-live="polite">Loading…</div></section>
        <section class="iex-card"><h2>Ask the community</h2><form id="ioneExpertAskForm" class="iex-form">
          <div><label for="ioneExpertDisplayName">Your name</label><input id="ioneExpertDisplayName" maxlength="120" required placeholder="Your name"></div>
          <div><label for="ioneExpertCategory">Topic</label><select id="ioneExpertCategory"><option>Technical support</option><option>Phones and computers</option><option>Internet and networking</option><option>Software and apps</option><option>Business technology</option><option>Electrical and devices</option><option>General</option></select></div>
          <div><label for="ioneExpertArea">Area (optional)</label><input id="ioneExpertArea" maxlength="160" placeholder="Neighbourhood or town, no exact address needed"></div>
          <div><label for="ioneExpertQuestionTitle">Question title</label><input id="ioneExpertQuestionTitle" maxlength="180" required placeholder="Briefly describe the issue"></div>
          <div><label for="ioneExpertQuestionDetails">Explain what happened</label><textarea id="ioneExpertQuestionDetails" maxlength="5000" required placeholder="Device, error message, what you have tried, and the result"></textarea></div>
          <button class="primary" id="ioneExpertAskSubmit" type="submit">Publish question</button>
        </form></section>
        <section class="iex-card"><h2>Become a verified expert</h2><p>Send your specialty and a credential or work sample. Authority Press reviews each application; only approved experts can post expert answers.</p>
          <form id="ioneExpertApplyForm" class="iex-form">
            <div><label for="ioneExpertFullName">Full name</label><input id="ioneExpertFullName" maxlength="120" required></div>
            <div><label for="ioneExpertPhone">Phone number</label><input id="ioneExpertPhone" type="tel" maxlength="20" required placeholder="07XXXXXXXX"></div>
            <div><label for="ioneExpertSpecialty">Specialty</label><input id="ioneExpertSpecialty" maxlength="100" required placeholder="e.g. phone repair, networking, software"></div>
            <div><label for="ioneExpertExperience">Experience and skills</label><textarea id="ioneExpertExperience" maxlength="1200" required placeholder="Describe your experience and the kind of questions you can answer"></textarea></div>
            <div><label for="ioneExpertCredential">Credential or work sample (PDF/JPG/PNG/WEBP, max 5 MB)</label><input id="ioneExpertCredential" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div>
            <button id="ioneExpertApplySubmit" type="submit">Submit for Authority verification</button>
          </form><div id="ioneExpertApplicationStatus" class="iex-status" role="status" aria-live="polite"></div>
        </section>
        <section><div class="iex-row"><h2 style="flex:1">Community questions</h2><button id="ioneExpertRefresh" type="button">Refresh</button></div><div id="ioneExpertQuestions"></div></section>
        <section><h2>Official advice from Authority Press</h2><div id="ioneExpertAdvice"></div></section>
        <section><h2>Verified experts</h2><div id="ioneExpertPeople" class="iex-row"></div></section>
      </main>`;
    document.body.appendChild(root);
    $("ioneExpertClose", root).addEventListener("click", close);
    $("ioneExpertRefresh", root).addEventListener("click", refresh);
    $("ioneExpertAskForm", root).addEventListener("submit", ask);
    $("ioneExpertApplyForm", root).addEventListener("submit", apply);
    return root;
  }
  function status(id, message, error = false) {
    const el = $(id, ensureOverlay());
    if (el) { el.textContent = message || ""; el.classList.toggle("error", !!error); }
  }
  function close() { if (root) { root.style.display = "none"; root.setAttribute("aria-hidden", "true"); } document.body.style.overflow = ""; }
  function open() { ensureOverlay().style.display = "block"; root.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; refresh(); }
  async function invoke(action, extra = {}) {
    if (!heavensSupabase) throw new Error("I|ONE connection is not ready. Reload and try again.");
    const result = await heavensSupabase.functions.invoke("ione-expert", { body: { action, ...extra } });
    if (result.error) {
      let message = result.data?.error || result.error.message || "Request failed.";
      try { const payload = await result.error.context?.clone?.().json(); message = payload?.error || payload?.message || message; } catch (_) {}
      throw new Error(message);
    }
    if (!result.data?.success) throw new Error(result.data?.error || "Request failed.");
    return result.data;
  }
  async function refresh() {
    status("ioneExpertStatus", "Loading questions and advice…");
    try {
      const [state, feed] = await Promise.all([invoke("my_status"), invoke("list_feed")]);
      expertStatus = { ...state, is_expert: !!feed.is_expert };
      status("ioneExpertStatus", state.expert ? "Verified expert access: " + state.expert.specialty : state.application ? "Expert application: " + state.application.status + (state.application.admin_note ? " • " + state.application.admin_note : "") : "Ask a question or apply to become a verified expert.");
      if (state.expert) $("ioneExpertApplyForm", root).style.display = "none";
      renderFeed(feed);
    } catch (error) { status("ioneExpertStatus", error.message || "I|ONE Expert could not load.", true); }
  }
  async function ask(event) {
    event.preventDefault();
    const button = $("ioneExpertAskSubmit", root); button.disabled = true;
    try {
      const result = await invoke("ask", {
        display_name: $("ioneExpertDisplayName", root).value.trim(),
        category: $("ioneExpertCategory", root).value,
        area_name: $("ioneExpertArea", root).value.trim(),
        title: $("ioneExpertQuestionTitle", root).value.trim(),
        details: $("ioneExpertQuestionDetails", root).value.trim()
      });
      status("ioneExpertStatus", result.message); $("ioneExpertAskForm", root).reset(); await refresh();
    } catch (error) { status("ioneExpertStatus", error.message, true); }
    finally { button.disabled = false; }
  }
  async function apply(event) {
    event.preventDefault();
    const button = $("ioneExpertApplySubmit", root), file = $("ioneExpertCredential", root).files?.[0];
    button.disabled = true; status("ioneExpertApplicationStatus", "Uploading private verification document…");
    let path = "";
    try {
      if (!file) throw new Error("Choose a credential or work sample.");
      if (file.size > 5 * 1024 * 1024) throw new Error("File must be 5 MB or smaller.");
      const allowed = ["image/jpeg","image/png","image/webp","application/pdf"];
      if (!allowed.includes(file.type)) throw new Error("Use PDF, JPG, PNG or WEBP.");
      const session = await heavensSupabase.auth.getSession();
      const userId = session.data?.session?.user?.id;
      if (!userId) throw new Error("Sign in again before applying.");
      const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "application/pdf":"pdf" })[file.type];
      path = userId + "/" + ((crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random().toString(36).slice(2))) + "." + ext;
      const upload = await heavensSupabase.storage.from("ione-expert-credentials").upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error("Private credential upload failed. Please retry.");
      const result = await invoke("apply", {
        full_name: $("ioneExpertFullName", root).value.trim(),
        phone_number: $("ioneExpertPhone", root).value.trim(),
        specialty: $("ioneExpertSpecialty", root).value.trim(),
        experience: $("ioneExpertExperience", root).value.trim(),
        credential_path: path
      });
      if (result.already_pending && path) {
        await heavensSupabase.storage.from("ione-expert-credentials").remove([path]);
        path = "";
      }
      status("ioneExpertApplicationStatus", result.message || "Application sent."); $("ioneExpertApplyForm", root).reset(); await refresh();
    } catch (error) {
      if (path) try { await heavensSupabase.storage.from("ione-expert-credentials").remove([path]); } catch (_) {}
      status("ioneExpertApplicationStatus", error.message || "Application failed.", true);
    } finally { button.disabled = false; }
  }
  function renderFeed(feed) {
    const questions = $("ioneExpertQuestions", root); questions.replaceChildren();
    (feed.questions || []).forEach((q) => {
      const card = document.createElement("article"); card.className = "iex-card";
      const title = document.createElement("h2"); title.textContent = q.title;
      const meta = document.createElement("small"); meta.className = "iex-muted"; meta.textContent = q.category + " • " + q.display_name + (q.area_name ? " • " + q.area_name : "") + " • " + new Date(q.created_at).toLocaleString();
      const details = document.createElement("p"); details.textContent = q.details;
      card.append(title, meta, details);
      (q.replies || []).forEach((r) => {
        const reply = document.createElement("div"); reply.className = "iex-reply";
        const who = document.createElement("strong"); who.textContent = (r.role === "authority" ? "Authority Press" : r.display_name) + (r.role === "expert" ? " • Verified expert" : "");
        const body = document.createElement("p"); body.textContent = r.body;
        reply.append(who, body); card.appendChild(reply);
      });
      if (feed.is_expert && q.status !== "closed") {
        const form = document.createElement("form"); form.className = "iex-form";
        const answer = document.createElement("textarea"); answer.maxLength = 5000; answer.required = true; answer.placeholder = "Share a clear, practical answer";
        const button = document.createElement("button"); button.type = "submit"; button.textContent = "Reply as verified expert";
        form.append(answer, button);
        form.addEventListener("submit", async (event) => {
          event.preventDefault(); button.disabled = true;
          try { const result = await invoke("reply", { question_id: q.id, body: answer.value.trim() }); status("ioneExpertStatus", result.message); await refresh(); }
          catch (error) { status("ioneExpertStatus", error.message, true); button.disabled = false; }
        });
        card.appendChild(form);
      }
      questions.appendChild(card);
    });
    if (!(feed.questions || []).length) { const p = document.createElement("p"); p.className = "iex-muted"; p.textContent = "No questions yet. Start the first discussion."; questions.appendChild(p); }
    const advice = $("ioneExpertAdvice", root); advice.replaceChildren();
    (feed.advice || []).forEach((item) => {
      const card = document.createElement("article"); card.className = "iex-card iex-advice";
      const title = document.createElement("h3"); title.textContent = item.title;
      const meta = document.createElement("small"); meta.textContent = item.category + " • " + item.created_by;
      const body = document.createElement("p"); body.textContent = item.body;
      card.append(title, meta, body); advice.appendChild(card);
    });
    const people = $("ioneExpertPeople", root); people.replaceChildren();
    (feed.experts || []).forEach((person) => {
      const chip = document.createElement("span"); chip.className = "iex-card"; chip.style.margin = "0"; chip.textContent = person.full_name + " • " + person.specialty; people.appendChild(chip);
    });
  }

  function ensureAuthorityPanel() {
    const host = document.querySelector("#authorityPressPanel .authority-panel-inner");
    if (!host || $("ioneExpertAuthority")) return;
    const section = document.createElement("section");
    section.id = "ioneExpertAuthority"; section.className = "authority-panel-section";
    section.innerHTML = `<div class="authority-section-kicker">I|ONE EXPERT • AUTHORITY ONLY</div>
      <h3>VERIFY EXPERTS & PUBLISH OFFICIAL ADVICE</h3>
      <p class="authority-section-note">Review credentials before enabling expert replies. Official advice is displayed to I|ONE Expert users.</p>
      <button type="button" id="ioneExpertAuthorityRefresh">REFRESH EXPERT CONTROLS</button>
      <div id="ioneExpertAuthorityStatus" role="status" aria-live="polite"></div>
      <h3>EXPERT APPLICATIONS WAITING FOR REVIEW</h3><div id="ioneExpertAuthorityApplications"></div>
      <h3>QUESTIONS • OFFICIAL RESPONSE</h3><div id="ioneExpertAuthorityQuestions"></div>
      <h3>PUBLISH OFFICIAL ADVICE</h3><form id="ioneExpertAdviceForm">
        <input id="ioneExpertAdviceTitle" maxlength="180" required placeholder="Advice title">
        <input id="ioneExpertAdviceCategory" maxlength="80" placeholder="Category (optional)">
        <textarea id="ioneExpertAdviceBody" maxlength="5000" required placeholder="Clear practical advice"></textarea>
        <button type="submit">PUBLISH ADVICE</button></form><div id="ioneExpertAuthorityAdvice"></div>`;
    host.appendChild(section);
    $("ioneExpertAuthorityRefresh").addEventListener("click", loadAuthority);
    $("ioneExpertAdviceForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
      try {
        const result = await invoke("publish_advice", { title: $("ioneExpertAdviceTitle").value.trim(), category: $("ioneExpertAdviceCategory").value.trim() || "Official advice", body: $("ioneExpertAdviceBody").value.trim() });
        $("ioneExpertAuthorityStatus").textContent = result.message; event.currentTarget.reset(); await loadAuthority();
      } catch (error) { $("ioneExpertAuthorityStatus").textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  async function loadAuthority() {
    ensureAuthorityPanel();
    const status = $("ioneExpertAuthorityStatus"); if (!status) return;
    status.textContent = "Loading expert records…";
    try {
      const data = await invoke("authority_dashboard");
      status.textContent = "Expert controls loaded.";
      const apps = $("ioneExpertAuthorityApplications"); apps.replaceChildren();
      (data.applications || []).forEach((app) => {
        const card = document.createElement("article"); card.className = "iex-admin-card";
        const name = document.createElement("strong"); name.textContent = app.full_name + " • " + app.specialty;
        const details = document.createElement("p"); details.textContent = app.phone_number + " • " + app.experience;
        card.append(name, details);
        if (app.credential_url) { const link = document.createElement("a"); link.href = app.credential_url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "OPEN PRIVATE CREDENTIAL"; card.appendChild(link); }
        const note = document.createElement("input"); note.maxLength = 500; note.placeholder = "Authority review note (optional)";
        const approve = document.createElement("button"); approve.textContent = "VERIFY & ENABLE";
        const reject = document.createElement("button"); reject.className = "danger"; reject.textContent = "REJECT";
        approve.addEventListener("click", () => reviewApplication(app.id, "approve_expert", note.value, approve));
        reject.addEventListener("click", () => reviewApplication(app.id, "reject_expert", note.value, reject));
        card.append(note, approve, reject); apps.appendChild(card);
      });
      if (!(data.applications || []).length) apps.textContent = "No expert applications waiting.";
      const qs = $("ioneExpertAuthorityQuestions"); qs.replaceChildren();
      (data.questions || []).forEach((q) => {
        const card = document.createElement("article"); card.className = "iex-admin-card";
        const title = document.createElement("strong"); title.textContent = q.title;
        const body = document.createElement("p"); body.textContent = q.details;
        const answer = document.createElement("textarea"); answer.maxLength = 5000; answer.placeholder = "Official Authority Press answer";
        const send = document.createElement("button"); send.textContent = "PUBLISH OFFICIAL RESPONSE";
        send.addEventListener("click", async () => { send.disabled = true; try { const result = await invoke("authority_reply", { question_id: q.id, body: answer.value.trim() }); status.textContent = result.message; await loadAuthority(); } catch (error) { status.textContent = error.message; send.disabled = false; } });
        card.append(title, body, answer, send); qs.appendChild(card);
      });
      const advice = $("ioneExpertAuthorityAdvice"); advice.replaceChildren();
      (data.advice || []).forEach((item) => {
        const row = document.createElement("div"); row.className = "iex-admin-card";
        const title = document.createElement("strong"); title.textContent = item.title + (item.published ? "" : " • UNPUBLISHED");
        row.appendChild(title);
        if (item.published) { const unpublish = document.createElement("button"); unpublish.className = "danger"; unpublish.textContent = "UNPUBLISH"; unpublish.addEventListener("click", async () => { try { await invoke("delete_advice", { advice_id: item.id }); await loadAuthority(); } catch (error) { status.textContent = error.message; } }); row.appendChild(unpublish); }
        advice.appendChild(row);
      });
    } catch (error) { status.textContent = error.message || "Could not load Authority Expert controls."; }
  }
  async function reviewApplication(id, action, note, button) {
    button.disabled = true;
    try { const result = await invoke(action, { application_id: id, note }); $("ioneExpertAuthorityStatus").textContent = result.message; await loadAuthority(); }
    catch (error) { $("ioneExpertAuthorityStatus").textContent = error.message; button.disabled = false; }
  }
  function bind() {
    const launch = $("openIoneExpert");
    if (launch && !launch.dataset.ioneExpertBound) { launch.dataset.ioneExpertBound = "1"; launch.addEventListener("click", open); }
    const panel = $("authorityPressPanel");
    if (panel && !panel.dataset.ioneExpertObserver) {
      panel.dataset.ioneExpertObserver = "1";
      const observer = new MutationObserver(() => {
        if (panel.getAttribute("aria-hidden") === "false" || getComputedStyle(panel).display !== "none") {
          ensureAuthorityPanel();
          loadAuthority();
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ["aria-hidden", "style"] });
      const unlock = $("authorityPasswordUnlock");
      if (unlock) unlock.addEventListener("click", () => setTimeout(() => {
        if (panel.getAttribute("aria-hidden") === "false" || getComputedStyle(panel).display !== "none") loadAuthority();
      }, 100));
      const close = $("authorityPressClose");
      if (close) close.addEventListener("click", () => { const section = $("ioneExpertAuthority"); if (section) section.remove(); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true }); else bind();
  window.addEventListener("load", bind, { once: true });
})();
