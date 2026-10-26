/* I|ONE SMART ADS v1 — isolated campaign creation, discovery and reporting. */
(function () {
  "use strict";
  if (window.__ioneSmartAdsLoaded) return;
  window.__ioneSmartAdsLoaded = true;
  const FUNCTION = "ione-smart-ads";
  let root = null;
  let activeTab = "explore";
  let busy = false;

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const dateText = (value) => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}) : "—";
  };
  const num = (value) => Number(value || 0).toLocaleString();
  const newKey = () => {
    try { return crypto.randomUUID(); } catch (_) { return "ione-" + Date.now() + "-" + Math.random().toString(36).slice(2); }
  };
  function client() { return typeof heavensSupabase !== "undefined" ? heavensSupabase : null; }
  async function ensureSession() {
    const sb = client();
    if (!sb) throw new Error("I|ONE connection is not ready. Reload and try again.");
    let result = await sb.auth.getSession();
    if (result.error) throw result.error;
    if (!result.data.session && typeof ensureHeavensAnonymousSession === "function") {
      await ensureHeavensAnonymousSession();
      result = await sb.auth.getSession();
    }
    if (!result.data.session) {
      const signed = await sb.auth.signInAnonymously();
      if (signed.error) throw signed.error;
    }
  }
  async function invoke(action, extra) {
    const sb = client();
    if (!sb) throw new Error("I|ONE connection is not ready. Reload and try again.");
    if (!String(action).startsWith("authority_") && action !== "track") await ensureSession();
    const body = Object.assign({action}, extra || {});
    if (String(action).startsWith("authority_")) {
      body.authority_session = sessionStorage.getItem("ioneAuthoritySession") || "";
    }
    const result = await sb.functions.invoke(FUNCTION, {body});
    if (result.error || !result.data || !result.data.success) {
      throw new Error(result.data?.error || result.error?.message || "SMART ADS request failed.");
    }
    return result.data;
  }
  async function uploadCreative(file) {
    const sb = client();
    if (!sb) throw new Error("I|ONE connection is not ready. Reload and try again.");
    if (!file) throw new Error("Choose an image or video file from your device.");
    const allowed = ["image/jpeg","image/png","image/webp","video/mp4","video/webm"];
    if (!allowed.includes(file.type)) throw new Error("Use JPG, PNG, WEBP, MP4, or WEBM media.");
    if (file.size > 50 * 1024 * 1024) throw new Error("The maximum ad file size is 50 MB.");
    let duration = 0;
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    if (mediaType === "video") {
      duration = await new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(file);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          const d = Number(video.duration);
          URL.revokeObjectURL(objectUrl);
          if (!Number.isFinite(d) || d <= 0 || d > 120) reject(new Error("Ad videos must be 2 minutes or shorter."));
          else resolve(Math.ceil(d));
        };
        video.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("This video could not be read. Choose another MP4 or WEBM file.")); };
        video.src = objectUrl;
      });
    }
    await ensureSession();
    const auth = await sb.auth.getUser();
    const user = auth?.data?.user;
    if (auth.error || !user?.id) throw new Error("Your I|ONE session is not ready. Reload and try again.");
    const ext = (file.name.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g,"") || "bin";
    const path = user.id + "/" + newKey() + "." + ext;
    const result = await sb.storage.from("ione-smart-ads").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
    if (result.error) throw new Error(result.error.message || "The media upload failed. Please try again.");
    const publicResult = sb.storage.from("ione-smart-ads").getPublicUrl(result.data.path);
    const publicUrl = publicResult?.data?.publicUrl || "";
    if (!publicUrl) throw new Error("The uploaded media URL could not be created.");
    return {creative_url:publicUrl,media_type:mediaType,media_duration_seconds:duration};
  }
  function setStatus(message, isError) {
    const el = root && root.querySelector("#ioneSmartAdsStatus");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "#ffb3a8" : "#a9f0cf";
  }
  function ensureRoot() {
    if (root) return root;
    root = document.createElement("section");
    root.id = "ioneSmartAdsOverlay";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <style>
        #ioneSmartAdsOverlay{position:fixed;inset:0;z-index:100700;display:none;flex-direction:column;overflow:hidden;background:radial-gradient(circle at 80% 0%,rgba(140,111,64,.18),transparent 34%),linear-gradient(180deg,#071114,#030607 70%);color:#f4f6f3;font:14px/1.5 Arial,Helvetica,sans-serif}
        #ioneSmartAdsOverlay *{box-sizing:border-box}
        .isa-head{display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top)) 14px 12px;border-bottom:1px solid rgba(214,180,120,.25);background:rgba(3,9,11,.96)}
        .isa-mark{width:44px;height:44px;display:grid;place-items:center;border:1px solid #c5a46b;border-radius:13px;color:#e5c88d;font-weight:900;letter-spacing:-1px;background:linear-gradient(145deg,#302718,#101719)}
        .isa-headcopy{min-width:0;flex:1}.isa-headcopy strong{display:block;font-size:15px;letter-spacing:1.2px}.isa-headcopy small{display:block;color:#9aaeb0;font-size:10px;letter-spacing:.7px}
        .isa-close{width:42px;height:42px;border:1px solid #53656a;border-radius:13px;background:#111c20;color:#fff;font-size:22px}
        .isa-tabs{display:flex;gap:7px;padding:12px 12px 0;overflow-x:auto;flex:0 0 auto}
        .isa-tab{flex:1;min-width:max-content;padding:10px 13px;border:1px solid #34474b;border-radius:12px;background:#101a1d;color:#b7c6c7;font-size:10px;font-weight:900;letter-spacing:.7px}
        .isa-tab[aria-selected="true"]{border-color:#c5a46b;background:linear-gradient(145deg,#55432a,#1d2728);color:#fff1d2}
        .isa-scroll{flex:1;min-height:0;overflow:auto;padding:15px 13px calc(24px + env(safe-area-inset-bottom));overscroll-behavior:contain}
        .isa-intro{padding:18px;border:1px solid rgba(197,164,107,.3);border-radius:18px;background:linear-gradient(140deg,rgba(45,37,25,.75),rgba(12,24,27,.95));margin-bottom:14px}
        .isa-kicker{font-size:9px;font-weight:900;letter-spacing:2px;color:#d8bb82}.isa-intro h2{margin:8px 0 7px;font-size:24px;line-height:1.16}.isa-intro p{margin:0;color:#b3c1c2;font-size:13px;line-height:1.6}
        .isa-notice{padding:11px 12px;border:1px solid #30484a;border-radius:12px;background:#0c191c;color:#a9c2c2;font-size:11px;line-height:1.5;margin-bottom:13px}
        .isa-card{overflow:hidden;margin:0 0 13px;border:1px solid #2a3e42;border-radius:16px;background:linear-gradient(145deg,#111e22,#080e10);box-shadow:0 8px 24px rgba(0,0,0,.18)}
        .isa-image{display:block;width:100%;max-height:230px;aspect-ratio:16/9;object-fit:cover;background:#11191b}
        .isa-card-body{padding:14px}.isa-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
        .isa-sponsor{display:inline-block;padding:4px 7px;border:1px solid rgba(197,164,107,.45);border-radius:999px;color:#e7cc98;font-size:8px;font-weight:900;letter-spacing:1.1px}
        .isa-status{display:inline-block;padding:4px 7px;border-radius:999px;background:#1b2a2e;color:#b5c9cb;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.5px}
        .isa-status.approved{background:#173629;color:#a8efc4}.isa-status.pending{background:#3b3020;color:#f2d49b}.isa-status.rejected{background:#3b2223;color:#ffc1b9}
        .isa-card h3{margin:0 0 5px;font-size:17px;line-height:1.3;overflow-wrap:anywhere}.isa-card p{margin:0 0 10px;color:#b4c2c4;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
        .isa-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin:8px 0;color:#82999d;font-size:10px}
        .isa-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.isa-btn{min-height:40px;padding:10px 13px;border:1px solid #44595d;border-radius:11px;background:#172428;color:#fff;font-size:10px;font-weight:900;letter-spacing:.5px}
        .isa-btn.primary{border-color:#e2c17f;background:linear-gradient(145deg,#d7b776,#9b7945);color:#15140f}.isa-btn.danger{border-color:#7e4543;color:#ffd2cd;background:#2a1718}.isa-btn:disabled{opacity:.55}
        .isa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:10px 0 14px}.isa-metric{padding:12px;border:1px solid #263b3f;border-radius:13px;background:#0d171a}.isa-metric strong{display:block;font-size:20px;line-height:1.2;color:#f3d69c}.isa-metric span{display:block;margin-top:4px;color:#92a9ac;font-size:9px;letter-spacing:.7px;text-transform:uppercase}
        .isa-form{padding:15px;border:1px solid #2c4145;border-radius:16px;background:#0b1518}.isa-form label{display:block;margin:0 0 12px;color:#b9c8c9;font-size:10px;font-weight:800;letter-spacing:.4px}.isa-form input,.isa-form textarea,.isa-form select{display:block;width:100%;margin-top:6px;padding:12px;border:1px solid #34494d;border-radius:10px;background:#071012;color:#fff;font:13px Arial,sans-serif;outline:none}.isa-form input:focus,.isa-form textarea:focus,.isa-form select:focus{border-color:#c5a46b}.isa-form textarea{min-height:88px;resize:vertical}.isa-form .isa-help{margin:0 0 12px;color:#82989b;font-size:10px;line-height:1.5}
        .isa-empty{padding:24px 15px;text-align:center;border:1px dashed #34484c;border-radius:15px;color:#9db1b4;font-size:12px;line-height:1.6}.isa-statusline{min-height:20px;padding:8px 13px 0;font-size:11px}
        @media(min-width:700px){.isa-scroll{padding-left:max(18px,calc((100% - 740px)/2));padding-right:max(18px,calc((100% - 740px)/2))}.isa-image{max-height:300px}}
      </style>
      <header class="isa-head"><div class="isa-mark">I|1</div><div class="isa-headcopy"><strong>I|ONE SMART ADS</strong><small>MEASURABLE CAMPAIGNS • CLEAR RESULTS</small></div><button class="isa-close" id="ioneSmartAdsClose" aria-label="Close SMART ADS">×</button></header>
      <nav class="isa-tabs" aria-label="SMART ADS sections">
        <button class="isa-tab" data-tab="explore" aria-selected="true">EXPLORE ADS</button>
        <button class="isa-tab" data-tab="mine" aria-selected="false">MY CAMPAIGNS</button>
        <button class="isa-tab" data-tab="create" aria-selected="false">CREATE CAMPAIGN</button>
        <button class="isa-tab" data-tab="authority" aria-selected="false" id="ioneSmartAdsAuthorityTab" hidden>AUTHORITY REVIEW</button>
      </nav>
      <div class="isa-statusline" id="ioneSmartAdsStatus" role="status" aria-live="polite"></div>
      <div class="isa-scroll" id="ioneSmartAdsContent"></div>
    `;
    document.body.appendChild(root);
    root.querySelector("#ioneSmartAdsClose").addEventListener("click", close);
    root.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      root.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === activeTab)));
      render();
    }));
    root.addEventListener("click", handleClick);
    root.addEventListener("submit", handleSubmit);
    return root;
  }
  function open(requestedTab) {
    ensureRoot();
    root.style.display = "flex";
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const token = sessionStorage.getItem("ioneAuthoritySession") || "";
    const authorityTab = root.querySelector("#ioneSmartAdsAuthorityTab");
    authorityTab.hidden = !token;
    const wanted = ["explore", "mine", "create", "authority"].includes(requestedTab) ? requestedTab : "explore";
    activeTab = wanted === "authority" && !token ? "explore" : wanted;
    root.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === activeTab)));
    render();
  }
  function close() {
    if (!root) return;
    root.style.display = "none";
    root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  function campaignCard(c, mode) {
    const status = String(c.status || "approved").toLowerCase();
    const m = c.metrics || {};
    const metricsHtml = mode === "mine" || mode === "authority" ? `
      <div class="isa-grid">
        <div class="isa-metric"><strong>${num(m.impressions)}</strong><span>Impressions</span></div>
        <div class="isa-metric"><strong>${num(m.clicks)}</strong><span>Clicks</span></div>
        <div class="isa-metric"><strong>${num(m.contacts)}</strong><span>Contact actions</span></div>
        <div class="isa-metric"><strong>${num(m.conversions)}</strong><span>Reported conversions</span></div>
      </div>` : "";
    const adminActions = mode === "authority" ? `
      <div class="isa-actions">
        <button class="isa-btn" data-action="verify_payment" data-id="${esc(c.id)}" ${c.payment_status === "verified" ? "disabled" : ""}>VERIFY PAYMENT</button>
        <button class="isa-btn primary" data-action="approve" data-id="${esc(c.id)}" ${c.payment_status !== "verified" ? "disabled" : ""}>APPROVE & ACTIVATE</button>
        <button class="isa-btn" data-action="pause" data-id="${esc(c.id)}">PAUSE</button>
        <button class="isa-btn danger" data-action="reject" data-id="${esc(c.id)}">REJECT</button>
      </div>` : "";
    const ownerActions = mode === "mine" ? `
      <div class="isa-actions">
        <button class="isa-btn primary" data-action="conversion" data-id="${esc(c.id)}">+ RECORD CONVERSION</button>
      </div>` : "";
    const publicActions = mode === "explore" ? `
      <div class="isa-actions">
        <a class="isa-btn primary" data-action="visit" data-id="${esc(c.id)}" href="${esc(c.destination_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center">LEARN MORE ↗</a>
        <a class="isa-btn" data-action="contact" data-id="${esc(c.id)}" href="tel:${esc(String(c.contact_phone||"").replace(/[^+0-9]/g,""))}" style="text-decoration:none;display:inline-flex;align-items:center">CONTACT</a>
      </div>` : "";
    return `
      <article class="isa-card" data-campaign-card="${esc(c.id)}">
        ${(mode === "explore" || mode === "authority") ? (c.media_type === "video" ? '<video class="isa-image" controls playsinline preload="metadata" aria-label="Sponsored video advertisement" src="'+esc(c.creative_url)+'"></video>' : '<img class="isa-image" loading="lazy" referrerpolicy="no-referrer" src="'+esc(c.creative_url)+'" alt="Advertisement creative for '+esc(c.advertiser_name)+'" onerror="this.hidden=true">') : ""}
        <div class="isa-card-body">
          <div class="isa-card-top"><span class="isa-sponsor">${mode === "explore" ? "SPONSORED" : "CAMPAIGN"}</span><span class="isa-status ${esc(status)}">${esc(status.replace(/_/g," "))}</span></div>
          <h3>${esc(c.title)}</h3><p>${esc(c.description || "Discover this advertiser on I|ONE.")}</p>
          <div class="isa-meta"><span>${esc(c.advertiser_name || "Advertiser")}</span><span>${esc(c.city || "Tanzania")}</span><span>Ends ${esc(dateText(c.ends_at))}</span>${c.plan_code ? '<span>'+esc(({weekly:'7 days',monthly:'30 days',quarterly:'90 days'}[c.plan_code] || c.plan_code))+' • TZS '+num(c.price_tzs)+'</span>' : ''}</div>
          ${mode === "authority" ? '<div class="isa-notice">Payment: <strong>'+esc(c.payment_status || "pending")+'</strong> · Reference: <strong>'+esc(c.payment_reference || "not provided")+'</strong> · Media: <strong>'+esc(c.media_type || "image")+(c.media_type === "video" ? ' ('+esc(c.media_duration_seconds || 0)+' sec)' : '')+'</strong></div>' : ''}
          ${metricsHtml}
          ${c.review_note ? '<p><strong>Authority note:</strong> '+esc(c.review_note)+'</p>' : ""}
          ${publicActions}${ownerActions}${adminActions}
        </div>
      </article>`;
  }
  async function render() {
    if (!root) return;
    const content = root.querySelector("#ioneSmartAdsContent");
    content.innerHTML = '<div class="isa-empty">Loading SMART ADS…</div>';
    setStatus("", false);
    try {
      if (activeTab === "explore") {
        const data = await invoke("public_list");
        const campaigns = data.campaigns || [];
        content.innerHTML = `
          <section class="isa-intro"><div class="isa-kicker">ADVERTISE WITH PURPOSE</div><h2>Reach people. Measure actions.</h2><p>Discover approved promotions from businesses and sellers on I|ONE. Every campaign is labelled sponsored.</p></section>
          <div class="isa-notice">Sponsored advertisements are reviewed before publication. Campaigns run across designated I|ONE placements after manual payment verification and Authority approval. Views and clicks are measured separately; a click is not automatically a sale.</div>
          ${campaigns.length ? campaigns.map(c => campaignCard(c,"explore")).join("") : '<div class="isa-empty">No approved campaigns are live yet.<br>Submit an advertisement to get started.</div>'}`;
        campaigns.forEach(c => {
          let key = "";
          try { key = sessionStorage.getItem("ioneSmartAdsImpression:"+c.id) || ""; } catch (_) {}
          if (!key) {
            key = newKey();
            try { sessionStorage.setItem("ioneSmartAdsImpression:"+c.id,key); } catch (_) {}
            invoke("track",{campaign_id:c.id,event_type:"impression",event_key:key}).catch(()=>{});
          }
        });
      } else if (activeTab === "mine") {
        const data = await invoke("my_campaigns");
        const campaigns = data.campaigns || [];
        const totals = campaigns.reduce((a,c) => {
          const m=c.metrics||{}; a.impressions+=Number(m.impressions||0);a.clicks+=Number(m.clicks||0);a.contacts+=Number(m.contacts||0);a.conversions+=Number(m.conversions||0);return a;
        },{impressions:0,clicks:0,contacts:0,conversions:0});
        content.innerHTML = `
          <section class="isa-intro"><div class="isa-kicker">ADVERTISER WORKSPACE</div><h2>Your campaign results</h2><p>Review payment verification, campaign approval, expiry dates, and measurable actions. Campaigns start after Authority verifies payment and approves the advertisement.</p></section>
          <div class="isa-grid">
            <div class="isa-metric"><strong>${num(totals.impressions)}</strong><span>Impressions</span></div>
            <div class="isa-metric"><strong>${num(totals.clicks)}</strong><span>Clicks</span></div>
            <div class="isa-metric"><strong>${num(totals.contacts)}</strong><span>Contact actions</span></div>
            <div class="isa-metric"><strong>${num(totals.conversions)}</strong><span>Reported conversions</span></div>
          </div>
          ${campaigns.length ? campaigns.map(c => campaignCard(c,"mine")).join("") : '<div class="isa-empty">You have not submitted a campaign yet.<br>Choose CREATE CAMPAIGN to get started.</div>'}`;
      } else if (activeTab === "create") {
        content.innerHTML = `
          <section class="isa-intro"><div class="isa-kicker">PAID SMART AD CAMPAIGNS</div><h2>Bring your business into view.</h2><p>Upload your own image or short video, choose a package, then submit for manual payment verification and Authority approval.</p></section>
          <div class="isa-notice"><strong>MANUAL PAYMENT & ACTIVATION</strong><br>Use the existing manual payment method and instructions shown in Author Studio. Enter your payment transaction/reference number below. Authority Press must verify payment and approve the advertisement before it goes live. Your paid period begins on activation. Maximum 3 ad submissions per account in any 7-day period. Videos must be 2 minutes or shorter; maximum file size is 50 MB.</div>
          <form class="isa-form" id="ioneSmartAdsCreateForm">
            <label>BUSINESS / ADVERTISER NAME<input name="advertiser_name" required maxlength="100" placeholder="Business or brand name"></label>
            <label>CONTACT PHONE<input name="contact_phone" type="tel" required maxlength="40" placeholder="+255…"></label>
            <label>CAMPAIGN TITLE<input name="title" required minlength="3" maxlength="100" placeholder="What are you promoting?"></label>
            <label>AD DESCRIPTION<textarea name="description" maxlength="800" placeholder="Short, clear message for customers"></textarea></label>
            <label>UPLOAD AD IMAGE OR VIDEO<input name="creative_file" type="file" required accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"></label>
            <p class="isa-help">Choose a file from your phone or computer. Supported: JPG, PNG, WEBP, MP4, WEBM. Image or video is uploaded to I|ONE storage. No external image URL is required.</p>
            <label>DESTINATION LINK (HTTPS)<input name="destination_url" type="url" required placeholder="https://… or WhatsApp link"></label>
            <label>TARGET CITY / AREA<input name="city" maxlength="100" placeholder="Tanzania or a city/area"></label>
            <label>CAMPAIGN GOAL<select name="objective"><option value="website">Website visits</option><option value="contact">Customer contacts</option><option value="awareness">Brand awareness</option></select></label>
            <label>ADVERTISING PACKAGE<select name="plan_code" required><option value="weekly">1 week (7 days) — TZS 2,000</option><option value="monthly">1 month (30 days) — TZS 5,000</option><option value="quarterly">3 months (90 days) — TZS 10,000</option></select></label>
            <label>MANUAL PAYMENT TRANSACTION / REFERENCE<input name="payment_reference" required maxlength="120" placeholder="Enter the payment reference"></label>
            <p class="isa-help">Payment reference is required for Authority to verify the payment. Submitting this form does not activate the campaign.</p>
            <button class="isa-btn primary" type="submit" style="width:100%">UPLOAD & SUBMIT FOR REVIEW</button>
          </form>`;
      } else if (activeTab === "authority") {
        const data = await invoke("authority_list");
        const campaigns = data.campaigns || [];
        content.innerHTML = `
          <section class="isa-intro"><div class="isa-kicker">AUTHORITY PRESS</div><h2>Campaign review desk</h2><p>Approve suitable campaigns, pause active campaigns, or reject submissions. Only approved campaigns inside their dates appear in Explore Ads.</p></section>
          ${campaigns.length ? campaigns.map(c => campaignCard(c,"authority")).join("") : '<div class="isa-empty">No campaigns have been submitted yet.</div>'}`;
      }
      content.querySelectorAll('[data-action="visit"]').forEach(a => a.addEventListener("click", () => {
        invoke("track",{campaign_id:a.dataset.id,event_type:"click",event_key:newKey()}).catch(()=>{});
      }));
      content.querySelectorAll('[data-action="contact"]').forEach(a => a.addEventListener("click", () => {
        invoke("track",{campaign_id:a.dataset.id,event_type:"contact",event_key:newKey()}).catch(()=>{});
      }));
    } catch (error) {
      content.innerHTML = '<div class="isa-empty">'+esc(error.message || "SMART ADS could not load. Please try again.")+'</div>';
      setStatus(error.message || "Could not load SMART ADS.", true);
    }
  }
  async function handleSubmit(event) {
    if (event.target.id !== "ioneSmartAdsCreateForm") return;
    event.preventDefault();
    if (busy) return;
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    const file = form.querySelector('[name="creative_file"]')?.files?.[0];
    delete values.creative_file;
    const button = form.querySelector('button[type="submit"]');
    busy = true; if(button){button.disabled=true;button.textContent="SUBMITTING…";}
    setStatus("Submitting campaign for review…", false);
    try {
      if (!file) throw new Error("Choose an image or video file first.");
      if (!/^https:\/\//i.test(String(values.destination_url || ""))) throw new Error("Enter a valid HTTPS destination link.");
      setStatus("Checking and uploading your ad media…", false);
      const media = await uploadCreative(file);
      Object.assign(values, media);
      setStatus("Media uploaded. Submitting campaign for payment verification…", false);
      const data = await invoke("create", values);
      setStatus(data.message || "Campaign submitted for review.", false);
      activeTab = "mine";
      root.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === activeTab)));
      await render();
      setStatus(data.message || "Campaign submitted for review.", false);
    } catch (error) {
      setStatus(error.message || "Campaign could not be submitted.", true);
      if(button){button.disabled=false;button.textContent="SUBMIT FOR AUTHORITY REVIEW";}
    } finally { busy = false; }
  }
  async function handleClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || !root.contains(button)) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === "conversion") {
      if (!confirm("Record one real conversion for this campaign? Only record a completed outcome, not a click or enquiry.")) return;
      button.disabled = true;
      try {
        await invoke("record_conversion",{campaign_id:id,event_key:newKey()});
        setStatus("Conversion recorded.",false);
        await render();
      } catch (error) { setStatus(error.message || "Could not record conversion.",true); button.disabled=false; }
      return;
    }
    if (action === "verify_payment") {
      if (!confirm("Have you independently confirmed the advertiser's manual payment? Only verify after checking the payment record.")) return;
      button.disabled = true;
      try {
        await invoke("authority_payment",{campaign_id:id,payment_status:"verified"});
        setStatus("Payment verified. Review the creative and press APPROVE & ACTIVATE separately.",false);
        await render();
      } catch (error) { setStatus(error.message || "Payment verification failed.",true); button.disabled=false; }
      return;
    }
    if (["approve","reject","pause"].includes(action)) {
      let review_note = "";
      if (action === "reject" && !confirm("Reject this campaign?")) return;
      if (action === "approve" && !confirm("Approve this campaign for public display?")) return;
      if (action === "pause" && !confirm("Pause this campaign now?")) return;
      if (action === "reject") review_note = prompt("Optional reason for rejection:") || "";
      button.disabled = true;
      try {
        await invoke("authority_review",{campaign_id:id,status:action==="approve"?"approved":action==="reject"?"rejected":"paused",review_note});
        setStatus("Campaign status updated.",false);
        await render();
      } catch (error) { setStatus(error.message || "Review action failed.",true); button.disabled=false; }
    }
  }
  function installTile() {
    const grid = document.querySelector("#smartPanel .smart-grid");
    if (!grid || document.getElementById("openIoneSmartAds")) return;
    const tile = document.createElement("button");
    tile.className = "smart-item";
    tile.id = "openIoneSmartAds";
    tile.type = "button";
    tile.innerHTML = '<span class="smart-icon" aria-hidden="true">ADS</span><strong>I|ONE SMART ADS</strong><small>CAMPAIGNS • ANALYTICS • RESULTS</small>';
    tile.addEventListener("click", open);
    grid.appendChild(tile);
  }
  function installAuthorityEntry() {
    const panel = document.querySelector("#authorityPressPanel .authority-panel-inner");
    const head = panel && panel.querySelector(".authority-panel-head");
    if (!panel || !head || document.getElementById("ioneAuthoritySmartAdsEntry")) return;
    const section = document.createElement("section");
    section.id = "ioneAuthoritySmartAdsEntry";
    section.className = "authority-panel-section";
    section.style.cssText = "border:1px solid rgba(197,164,107,.42);border-radius:15px;background:linear-gradient(145deg,rgba(48,39,24,.55),rgba(7,20,23,.96));";
    section.innerHTML = '<div class="authority-section-kicker">CAMPAIGN CONTROL • AUTHORITY ONLY</div><h3 style="margin:8px 0">I|ONE SMART ADS</h3><p class="authority-section-note">Review submitted campaigns, approve or reject advertisements, pause active campaigns, and inspect campaign analytics.</p><button type="button" id="ioneAuthoritySmartAdsOpen" class="authority-save-button">OPEN SMART ADS REVIEW</button>';
    head.insertAdjacentElement("afterend", section);
    section.querySelector("#ioneAuthoritySmartAdsOpen").addEventListener("click", function () {
      if (typeof window.ioneSmartAdsOpen === "function") window.ioneSmartAdsOpen("authority");
    });
  }
  let readerAdBusy = false;
  async function maybeShowReaderAd() {
    const reader = document.querySelector("#ioneDocReaderLive, #heavensReader");
    const existingAd = document.getElementById("ioneSmartAdReaderInterstitial");
    if (!reader) {
      if (existingAd) existingAd.remove();
      readerAdBusy = false;
      return;
    }
    if (reader.dataset.ioneSmartAdChecked || readerAdBusy || existingAd) return;
    reader.dataset.ioneSmartAdChecked = "1";
    let count = 0;
    try {
      count = Number(sessionStorage.getItem("ioneSmartAdReaderCount") || "0") + 1;
      sessionStorage.setItem("ioneSmartAdReaderCount", String(count));
    } catch (_) { count = 3; }
    if (count % 3 !== 0) return;
    readerAdBusy = true;
    try {
      const data = await invoke("public_list");
      const campaigns = (data.campaigns || []).filter(c => c && c.creative_url);
      if (!campaigns.length || !document.querySelector("#ioneDocReaderLive, #heavensReader")) {
        readerAdBusy = false;
        return;
      }
      const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
      const overlay = document.createElement("section");
      overlay.id = "ioneSmartAdReaderInterstitial";
      overlay.setAttribute("role","dialog");
      overlay.setAttribute("aria-modal","true");
      overlay.setAttribute("aria-label","Sponsored advertisement");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(1,7,9,.94);color:#fff;font:14px/1.5 Arial,sans-serif;";
      const media = campaign.media_type === "video"
        ? '<video id="ioneReaderAdVideo" playsinline muted autoplay controls style="display:block;width:100%;max-height:48vh;object-fit:contain;background:#000;border-radius:12px" src="'+esc(campaign.creative_url)+'"></video>'
        : '<img style="display:block;width:100%;max-height:48vh;object-fit:contain;background:#000;border-radius:12px" src="'+esc(campaign.creative_url)+'" alt="Sponsored advertisement">';
      overlay.innerHTML = '<div style="width:min(560px,100%);max-height:90%;overflow:auto;border:1px solid rgba(224,195,131,.5);border-radius:18px;background:linear-gradient(145deg,#152327,#080e10);padding:16px;box-shadow:0 18px 60px #0008"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><strong style="font-size:10px;letter-spacing:2px;color:#e7cc98">SPONSORED • I|ONE SMART AD</strong><span id="ioneReaderAdCountdown" style="font-size:11px;color:#bdcbcd">Skip available in 3s</span></div>'+media+'<h2 style="font-size:20px;margin:12px 0 5px">'+esc(campaign.title||"Sponsored advertisement")+'</h2><p style="font-size:12px;color:#b8c8ca;margin:0 0 12px">'+esc(campaign.description||"Discover this advertiser on I|ONE.")+'</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a id="ioneReaderAdVisit" href="'+esc(campaign.destination_url||"#")+'" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;padding:10px 13px;border-radius:10px;background:#dfc17d;color:#17150f;text-decoration:none;font-weight:900;font-size:10px">LEARN MORE</a><button id="ioneReaderAdSkip" type="button" disabled style="padding:10px 13px;border:1px solid #53666a;border-radius:10px;background:#1a292d;color:#fff;font-weight:900;font-size:10px;opacity:.6">SKIP AD</button></div><p style="margin:10px 0 0;color:#7f969a;font-size:9px">This sponsored message supports I|ONE. Your reading or documentary will continue when you skip or the short display ends.</p></div>';
      document.body.appendChild(overlay);
      const skip = overlay.querySelector("#ioneReaderAdSkip");
      const countdown = overlay.querySelector("#ioneReaderAdCountdown");
      const visit = overlay.querySelector("#ioneReaderAdVisit");
      const closeAd = () => {
        if (overlay.isConnected) overlay.remove();
        readerAdBusy = false;
      };
      skip.addEventListener("click", closeAd);
      visit.addEventListener("click", () => invoke("track",{campaign_id:campaign.id,event_type:"click",event_key:newKey()}).catch(()=>{}));
      invoke("track",{campaign_id:campaign.id,event_type:"impression",event_key:newKey()}).catch(()=>{});
      let seconds = 3;
      const tick = () => {
        seconds--;
        if (seconds <= 0) {
          skip.disabled = false;
          skip.style.opacity = "1";
          skip.textContent = "SKIP AD";
          countdown.textContent = "You can skip now";
          return;
        }
        countdown.textContent = "Skip available in "+seconds+"s";
        setTimeout(tick,1000);
      };
      setTimeout(tick,1000);
      setTimeout(closeAd,6500);
    } catch (_) {
      readerAdBusy = false;
    }
  }
  function boot() {
    installTile();
    installAuthorityEntry();
    const observer = new MutationObserver(() => {
      installTile();
      installAuthorityEntry();
      maybeShowReaderAd();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    maybeShowReaderAd();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
  window.ioneSmartAdsOpen = open;
})();