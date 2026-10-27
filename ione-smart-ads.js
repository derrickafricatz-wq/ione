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
        <button class="isa-btn danger" data-action="delete_campaign" data-id="${esc(c.id)}">DELETE CAMPAIGN</button>
      </div>` : "";
    const publicActions = mode === "explore" ? `
      <div class="isa-actions">
        <a class="isa-btn primary" data-action="visit" data-id="${esc(c.id)}" href="${esc(c.destination_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center">LEARN MORE ↗</a>
        <a class="isa-btn" data-action="contact" data-id="${esc(c.id)}" href="tel:${esc(String(c.contact_phone||"").replace(/[^+0-9]/g,""))}" style="text-decoration:none;display:inline-flex;align-items:center">CONTACT</a>
      </div>` : "";
    return `
      <article class="isa-card" data-campaign-card="${esc(c.id)}">
        ${(mode === "explore" || mode === "authority") ? (c.media_type === "video" ? '<video class="isa-image" autoplay muted loop playsinline preload="metadata" aria-label="Sponsored video advertisement" src="'+esc(c.creative_url)+'"></video>' : '<img class="isa-image" loading="lazy" referrerpolicy="no-referrer" src="'+esc(c.creative_url)+'" alt="Advertisement creative for '+esc(c.advertiser_name)+'" onerror="this.hidden=true">') : ""}
        <div class="isa-card-body">
          <div class="isa-card-top"><span class="isa-sponsor">${mode === "explore" ? "SPONSORED" : "CAMPAIGN"}</span><span class="isa-status ${esc(status)}">${esc(status.replace(/_/g," "))}</span></div>
          <h3>${esc(c.title)}</h3><p>${esc(c.description || "Discover this advertiser on I|ONE.")}</p>
          <div class="isa-meta"><span>${esc(c.advertiser_name || "Advertiser")}</span><span>${esc(c.city || "Tanzania")}</span><span>Ends ${esc(dateText(c.ends_at))}</span>${c.plan_code ? '<span>'+esc(({weekly:'7 days',monthly:'30 days',quarterly:'90 days'}[c.plan_code] || c.plan_code))+' • TZS '+num(c.price_tzs)+'</span>' : ''}</div>
          ${mode === "authority" ? '<div class="isa-notice">Payment: <strong>'+esc(c.payment_status || "pending")+'</strong> · Media: <strong>'+esc(c.media_type || "image")+(c.media_type === "video" ? ' ('+esc(c.media_duration_seconds || 0)+' sec)' : '')+'</strong></div>' : ''}
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
        const data = await invoke("public_list",{placement:"smart_ads"});
        const campaigns = data.campaigns || [];
        content.innerHTML = `
          
          
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
          <div class="isa-notice"><strong>MANUAL PAYMENT</strong><br>Pay to <strong>DERRICK KIPAJI OF AFRIKA & CO</strong> via <strong>Airtel Money</strong>, merchant number <strong>140001788</strong>. Keep your payment confirmation, then contact I|ONE Support by call or WhatsApp at <a href="https://wa.me/255742097868" target="_blank" rel="noopener noreferrer" style="color:#e7cc98">+255 742 097 868</a> and ask for Smart Ads payment verification. Authority checks payment directly and activates the campaign only after verification and creative approval. Maximum 3 submissions per account per 7 days; video limit 2 minutes; maximum file size 50 MB.</div>
          <form class="isa-form" id="ioneSmartAdsCreateForm">
            <label>BUSINESS / ADVERTISER NAME<input name="advertiser_name" required maxlength="100" placeholder="Business or brand name"></label>
            <label>CONTACT PHONE<input name="contact_phone" type="tel" required maxlength="40" placeholder="+255…"></label>
            <label>CAMPAIGN TITLE<input name="title" required minlength="3" maxlength="100" placeholder="What are you promoting?"></label>
            <label>AD DESCRIPTION<textarea name="description" maxlength="800" placeholder="Short, clear message for customers"></textarea></label>
            <label>UPLOAD AD IMAGES / VIDEOS<input name="creative_file" type="file" multiple required accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"></label>
            <p class="isa-help">Choose a file from your phone or computer. Supported: JPG, PNG, WEBP, MP4, WEBM. Image or video is uploaded to I|ONE storage. No external image URL is required.</p>
            <label>DESTINATION LINK (HTTPS)<input name="destination_url" type="url" required placeholder="https://… or WhatsApp link"></label>
            <label>TARGET CITY / AREA<input name="city" maxlength="100" placeholder="Tanzania or a city/area"></label>
            <label>CAMPAIGN GOAL<select name="objective"><option value="website">Website visits</option><option value="contact">Customer contacts</option><option value="awareness">Brand awareness</option></select></label>
            <label>WHERE SHOULD THIS AD APPEAR?<select name="placement"><option value="all">All eligible I|ONE placements</option><option value="smart_ads">Smart Ads only</option><option value="explore">Explore bookshelf</option><option value="book_reader">Inside books</option><option value="documentary">Documentaries</option><option value="expert">Expert section</option><option value="sokoni">Sokoni marketplace</option></select></label>
            <label>DAILY DISPLAY START (Tanzania time)<input name="daily_start_time" type="time"></label>
            <label>DAILY DISPLAY END (Tanzania time)<input name="daily_end_time" type="time"></label>
            <p class="isa-help">Leave both times empty to run all day. When set, the ad appears only during this daily window in Tanzania time.</p>
            <label>ADVERTISING PACKAGE<select name="plan_code" required><option value="weekly">1 week (7 days) — TZS 2,000</option><option value="monthly">1 month (30 days) — TZS 5,000</option><option value="quarterly">3 months (90 days) — TZS 10,000</option></select></label>
            <p class="isa-help">After paying, keep your confirmation and contact I|ONE Support for direct payment verification. No transaction reference is required in this form.</p>

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
    const files = Array.from(form.querySelector('[name="creative_file"]')?.files || []);
    delete values.creative_file;
    const button = form.querySelector('button[type="submit"]');
    busy = true; if(button){button.disabled=true;button.textContent="SUBMITTING…";}
    setStatus("Submitting campaign for review…", false);
    try {
      const creativeLimit = ({weekly:2,monthly:5,quarterly:10})[String(values.plan_code)] || 2;
      if (!files.length) throw new Error("Choose at least one image or video.");
      if (files.length > creativeLimit) throw new Error("This package allows up to " + creativeLimit + " creatives.");
      if (!/^https:\/\//i.test(String(values.destination_url || ""))) throw new Error("Enter a valid HTTPS destination link.");
      const creatives = [];
      for (let i=0;i<files.length;i++) {
        setStatus("Uploading creative " + (i+1) + " of " + files.length + "…", false);
        creatives.push(await uploadCreative(files[i]));
      }
      Object.assign(values, creatives[0]);
      values.creatives = creatives;
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
    if (action === "delete_campaign") {
      if (!confirm("Permanently delete this campaign and stop its ads from displaying? This cannot be undone.")) return;
      button.disabled = true;
      try { await invoke("delete_campaign",{campaign_id:id}); setStatus("Campaign deleted. Its ads will no longer be served.",false); await render(); }
      catch (error) { setStatus(error.message || "Campaign could not be deleted.",true); button.disabled=false; }
      return;
    }
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
  const AREA_FIRST_DELAY_MS = 60 * 1000;
  const AREA_REPEAT_DELAY_MS = 10 * 60 * 1000;
  const AREA_CHECK_INTERVAL_MS = 5000;
  let activeArea = "";
  let activeAreaSince = 0;
  let activeAreaAdShown = false;
  let areaCheckHandle = 0;

  function visible(el) {
    if (!el || !el.isConnected || el.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function detectAdArea() {
    const bookReader = document.getElementById("heavensReader");
    if (visible(bookReader)) return {key:"book_reader", element:bookReader};
    const documentaryReader = document.getElementById("ioneDocReaderLive");
    if (visible(documentaryReader)) return {key:"documentary", element:documentaryReader};
    const bookstore = document.getElementById("heavensBookstore");
    if (visible(bookstore)) return {key:"explore", element:bookstore};
    const sokoni = document.getElementById("ioneSokoniOverlay");
    if (visible(sokoni)) return {key:"sokoni", element:sokoni};
    return null;
  }

  function getAreaSchedule(key) {
    try {
      const value = JSON.parse(localStorage.getItem("ioneSmartAdsAreaScheduleV1") || "{}");
      return value && typeof value === "object" ? value[key] || {} : {};
    } catch (_) { return {}; }
  }

  function saveAreaSchedule(key, patch) {
    try {
      const value = JSON.parse(localStorage.getItem("ioneSmartAdsAreaScheduleV1") || "{}");
      value[key] = Object.assign({}, value[key] || {}, patch);
      localStorage.setItem("ioneSmartAdsAreaScheduleV1", JSON.stringify(value));
    } catch (_) {}
  }

  function chooseRotatingCampaign(campaigns, placement) {
    if (!campaigns.length) return null;
    const schedule = getAreaSchedule(placement);
    const lastId = String(schedule.lastCampaignId || "");
    const lastBrand = String(schedule.lastAdvertiser || "").trim().toLowerCase();
    const lastIndex = campaigns.findIndex(c => String(c.id) === lastId);
    const ordered = lastIndex >= 0
      ? campaigns.slice(lastIndex + 1).concat(campaigns.slice(0, lastIndex + 1))
      : campaigns.slice();
    return ordered.find(c => String(c.advertiser_name || "").trim().toLowerCase() !== lastBrand)
      || ordered.find(c => String(c.id) !== lastId)
      || ordered[0];
  }

  function fadeVideo(video, target, done) {
    if (!video) { if (done) done(); return; }
    const start = Number(video.volume || 0);
    const end = Math.max(0, Math.min(0.12, target));
    const steps = 8;
    let step = 0;
    const tick = () => {
      step++;
      video.volume = Math.max(0, Math.min(0.12, start + (end - start) * (step / steps)));
      if (step < steps) setTimeout(tick, 45);
      else if (done) done();
    };
    tick();
  }

  async function showAreaAd(area) {
    if (readerAdBusy || document.getElementById("ioneSmartAdReaderInterstitial")) return;
    readerAdBusy = true;
    try {
      const placement = area.key;
      const data = await invoke("public_list", {placement});
      const campaigns = (data.campaigns || []).filter(c => c && c.creative_url);
      if (!campaigns.length) { saveAreaSchedule(placement,{retryAfter:Date.now()+60*1000}); readerAdBusy = false; return; }
      if (!visible(area.element)) { readerAdBusy = false; return; }
      const campaign = chooseRotatingCampaign(campaigns, placement);
      if (!campaign) { readerAdBusy = false; return; }
      const creativeList = Array.isArray(campaign.creatives) && campaign.creatives.length ? campaign.creatives : [{creative_url:creative.creative_url,media_type:campaign.media_type,media_duration_seconds:campaign.media_duration_seconds}];
      const scheduleBeforeCreative = getAreaSchedule(placement);
      const previousCreativeIndex = Number(scheduleBeforeCreative.lastCreativeIndex == null ? -1 : scheduleBeforeCreative.lastCreativeIndex);
      const creativeIndex = creativeList.length > 1 ? (previousCreativeIndex + 1) % creativeList.length : 0;
      const creative = creativeList[creativeIndex] || creativeList[0];
      const adIsVideo = creative.media_type === "video";
      const overlay = document.createElement("section");
      overlay.id = "ioneSmartAdReaderInterstitial";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Sponsored advertisement");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(1,7,9,.96);color:#fff;font:14px/1.5 Arial,sans-serif;";
      const media = adIsVideo
        ? '<video id="ioneReaderAdVideo" playsinline muted autoplay preload="auto" aria-label="Sponsored video" style="display:block;width:100%;max-height:78vh;object-fit:contain;background:#000;cursor:pointer" src="'+esc(creative.creative_url)+'"></video>'
        : '<img style="display:block;width:100%;max-height:78vh;object-fit:contain;background:#000;cursor:pointer" src="'+esc(creative.creative_url)+'" alt="Sponsored advertisement">';
      const mediaTag = adIsVideo
        ? media
        : '<a id="ioneReaderAdVisit" href="'+esc(campaign.destination_url || "#")+'" target="_blank" rel="noopener noreferrer" aria-label="Open advertiser offer" style="display:block;width:100%;text-decoration:none">'+media+'</a>';
      overlay.innerHTML = '<div style="position:relative;width:min(680px,100%);max-height:94%;display:flex;align-items:center;justify-content:center;border-radius:16px;overflow:hidden;background:#05090a;box-shadow:0 18px 60px #0008">'+mediaTag+'<button id="ioneReaderAdSkip" type="button" disabled style="position:absolute;right:12px;top:12px;padding:11px 15px;border:1px solid rgba(255,255,255,.7);border-radius:999px;background:rgba(0,0,0,.74);color:#fff;font-weight:900;font-size:12px;backdrop-filter:blur(8px);opacity:.65">SKIP IN 3</button></div>';
      document.body.appendChild(overlay);
      const skip = overlay.querySelector("#ioneReaderAdSkip");
      const video = overlay.querySelector("#ioneReaderAdVideo");
      const closeAd = () => {
        if (video) { video.pause(); video.muted = true; }
        if (overlay.isConnected) overlay.remove();
        readerAdBusy = false;
      };
      skip.addEventListener("click", closeAd);
      if (video) {
        video.addEventListener("ended", closeAd, {once:true});
        video.addEventListener("error", closeAd, {once:true});
        video.volume = 0;
        video.muted = true;
        video.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          if (video.muted) {
            video.muted = false;
            fadeVideo(video, 0.12);
          } else {
            fadeVideo(video, 0, () => { video.muted = true; });
          }
        });
      }
      const imageLink = overlay.querySelector("#ioneReaderAdVisit");
      if (imageLink) imageLink.addEventListener("click", () => invoke("track",{campaign_id:campaign.id,event_type:"click",event_key:newKey()}).catch(()=>{}));
      invoke("track",{campaign_id:campaign.id,event_type:"impression",event_key:newKey()}).catch(()=>{});
      const previous = getAreaSchedule(placement);
      activeAreaAdShown = true;
      saveAreaSchedule(placement, {
        lastShownAt: Date.now(),
        lastCampaignId: String(campaign.id),
        lastAdvertiser: String(campaign.advertiser_name || ""),
        lastCreativeIndex: creativeIndex,
        firstShownAt: previous.firstShownAt || Date.now()
      });
      let seconds = 3;
      const tick = () => {
        if (!skip.isConnected) return;
        seconds--;
        if (seconds <= 0) {
          skip.disabled = false;
          skip.style.opacity = "1";
          skip.textContent = "SKIP AD";
          return;
        }
        skip.textContent = "SKIP IN " + seconds;
        setTimeout(tick,1000);
      };
      setTimeout(tick,1000);
      if (!video) setTimeout(closeAd,30000);
    } catch (_) { readerAdBusy = false; }
  }

  function checkAdArea() {
    const area = detectAdArea();
    if (!area) { activeArea = ""; activeAreaSince = 0; activeAreaAdShown = false; return; }
    if (activeArea !== area.key) { activeArea = area.key; activeAreaSince = Date.now(); activeAreaAdShown = false; }
    if (readerAdBusy) return;
    const schedule = getAreaSchedule(area.key);
    const firstEligibleAt = activeAreaSince + AREA_FIRST_DELAY_MS;
    const repeatEligibleAt = activeAreaAdShown ? Number(schedule.lastShownAt || 0) + AREA_REPEAT_DELAY_MS : firstEligibleAt;
    const eligibleAt = Math.max(activeAreaAdShown ? repeatEligibleAt : firstEligibleAt, Number(schedule.retryAfter || 0));
    if (Date.now() >= eligibleAt) showAreaAd(area);
  }

  function boot() {
    installTile();
    installAuthorityEntry();
    const observer = new MutationObserver(() => {
      installTile();
      installAuthorityEntry();
      checkAdArea();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    checkAdArea();
    if (areaCheckHandle) clearInterval(areaCheckHandle);
    areaCheckHandle = setInterval(checkAdArea, AREA_CHECK_INTERVAL_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
  window.ioneSmartAdsOpen = open;
})();