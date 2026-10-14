/* I|ONE Launch Observatory — isolated anonymous analytics.
 * Never blocks rendering or alters the existing install / marketplace handlers.
 * No names, phone numbers, raw IP addresses, or raw user-agent strings are stored.
 */
(function () {
  "use strict";
  if (window.__ioneLaunchObservatoryLoaded) return;
  window.__ioneLaunchObservatoryLoaded = true;

  const FUNCTION_NAME = "ione-launch-observatory";
  const VISITOR_KEY = "ione_launch_visitor_v1";
  const ALLOWED_EVENTS = new Set(["page_view", "install_click", "install_prompt", "install_confirmed", "installed_app_launch"]);

  function getVisitorKey() {
    try {
      let value = localStorage.getItem(VISITOR_KEY) || "";
      if (!/^[a-zA-Z0-9-]{20,80}$/.test(value)) {
        value = (window.crypto && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
        localStorage.setItem(VISITOR_KEY, value);
      }
      return value;
    } catch (_) {
      try {
        let value = sessionStorage.getItem(VISITOR_KEY) || "";
        if (!/^[a-zA-Z0-9-]{20,80}$/.test(value)) {
          value = "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
          sessionStorage.setItem(VISITOR_KEY, value);
        }
        return value;
      } catch (_) {
        return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      }
    }
  }

  function sourceType() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return "pwa";
      if (navigator.standalone === true) return "ios-home-screen";
    } catch (_) {}
    return "browser";
  }

  const COUNTRY_CACHE_KEY = "ione_launch_country_v1";

  async function getCountryCode() {
    try {
      const cached = JSON.parse(localStorage.getItem(COUNTRY_CACHE_KEY) || "null");
      if (cached && /^[A-Z]{2}$/.test(cached.code || "") && Date.now() - Number(cached.at || 0) < 24 * 60 * 60 * 1000) return cached.code;
    } catch (_) {}
    // A country-only IP lookup is needed because Supabase function calls do not reliably receive cf-ipcountry.
    // Only the resulting country code is sent to I|ONE; raw IP addresses are not stored by this feature.
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch("https://ipapi.co/country/", { method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: controller.signal });
        if (!response.ok) return null;
        const code = (await response.text()).trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
        try { localStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify({ code, at: Date.now() })); } catch (_) {}
        return code;
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (_) { return null; }
  }

  async function track(eventType) {
    if (!ALLOWED_EVENTS.has(eventType)) return;
    try {
      if (typeof heavensSupabase === "undefined" || typeof ensureHeavensAnonymousSession !== "function") return;
      const session = await ensureHeavensAnonymousSession();
      if (!session || !session.user) return;
      const countryCode = await getCountryCode();
      await heavensSupabase.functions.invoke(FUNCTION_NAME, {
        body: { action: "track", event_type: eventType, visitor_key: getVisitorKey(), country_code: countryCode, source: sourceType() }
      });
    } catch (error) {
      // Analytics is best-effort: failures must never affect I|ONE features.
      console.debug("I|ONE analytics skipped:", error);
    }
  }

  function installTracking() {
    document.addEventListener("click", function (event) {
      const button = event.target && event.target.closest ? event.target.closest("#installBtn") : null;
      if (button) track("install_click");
    }, true);

    window.addEventListener("beforeinstallprompt", function () {
      track("install_prompt");
    });

    window.addEventListener("appinstalled", function () {
      track("install_confirmed");
    });

    track("page_view");
    if (sourceType() !== "browser") track("installed_app_launch");
  }

  const styles = `
    #ioneLaunchObservatory{margin:18px 0;padding:16px;border:1px solid rgba(0,255,190,.35);border-radius:16px;background:linear-gradient(145deg,#0a1d1c,#071113);color:#f4ffff;font:14px/1.45 Arial,sans-serif}
    #ioneLaunchObservatory *{box-sizing:border-box}
    #ioneLaunchObservatory .ilo-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    #ioneLaunchObservatory .ilo-kicker{color:#54f4c2;font-size:10px;font-weight:900;letter-spacing:2px}
    #ioneLaunchObservatory .ilo-title{font-size:clamp(19px,4vw,25px);font-weight:900;margin-top:4px}
    #ioneLaunchObservatory .ilo-muted{color:#9ab3b2;font-size:11px}
    #ioneLaunchObservatory .ilo-refresh{border:1px solid #31c9a0;border-radius:10px;background:#10352e;color:#dffff6;padding:10px 13px;font-size:11px;font-weight:900;cursor:pointer}
    #ioneLaunchObservatory .ilo-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    #ioneLaunchObservatory .ilo-card{padding:12px;border:1px solid rgba(160,220,205,.15);border-radius:12px;background:rgba(255,255,255,.035);min-width:0}
    #ioneLaunchObservatory .ilo-label{font-size:10px;letter-spacing:.7px;color:#9ab3b2}
    #ioneLaunchObservatory .ilo-value{font-size:clamp(22px,5vw,30px);font-weight:900;line-height:1.2;margin:7px 0 3px;overflow-wrap:anywhere}
    #ioneLaunchObservatory .ilo-section{margin-top:18px}
    #ioneLaunchObservatory .ilo-section h4{font-size:12px;letter-spacing:1px;margin:0 0 9px;color:#c9fff0}
    #ioneLaunchObservatory .ilo-table{width:100%;border-collapse:collapse;font-size:11px}
    #ioneLaunchObservatory .ilo-table th,#ioneLaunchObservatory .ilo-table td{padding:9px 5px;border-bottom:1px solid rgba(160,220,205,.12);text-align:left}
    #ioneLaunchObservatory .ilo-table th{color:#89aaa4;font-size:9px;letter-spacing:.5px}
    #ioneLaunchObservatory .ilo-table td:nth-child(n+2),#ioneLaunchObservatory .ilo-table th:nth-child(n+2){text-align:right}
    #ioneLaunchObservatory .ilo-trend{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:4px;align-items:end;min-height:115px;padding:10px 0 0}
    #ioneLaunchObservatory .ilo-day{min-width:0;text-align:center;color:#7f9d98;font-size:8px}
    #ioneLaunchObservatory .ilo-bar-wrap{height:82px;display:flex;align-items:end;justify-content:center}
    #ioneLaunchObservatory .ilo-bar{width:100%;max-width:18px;min-height:2px;border-radius:4px 4px 1px 1px;background:linear-gradient(180deg,#42f5bc,#137e73)}
    #ioneLaunchObservatory .ilo-day strong{display:block;color:#caffef;font-size:9px;margin-top:4px}
    #ioneLaunchObservatory .ilo-status{padding:12px;border-radius:10px;background:rgba(255,255,255,.035);color:#9ab3b2;font-size:12px}
    #ioneLaunchObservatory .ilo-error{color:#ffd2a8}
    @media(min-width:650px){#ioneLaunchObservatory .ilo-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}
  `;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function addStyles() {
    if (document.getElementById("ioneLaunchObservatoryStyles")) return;
    const style = document.createElement("style");
    style.id = "ioneLaunchObservatoryStyles";
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function makeSection() {
    if (document.getElementById("ioneLaunchObservatory")) return;
    const inner = document.querySelector("#authorityPressPanel .authority-panel-inner");
    if (!inner) return;
    addStyles();
    const section = document.createElement("section");
    section.id = "ioneLaunchObservatory";
    section.innerHTML = `
      <div class="ilo-head">
        <div><div class="ilo-kicker">I|ONE • LAUNCH INTELLIGENCE</div><div class="ilo-title">Launch Observatory</div><div class="ilo-muted">Anonymous visits, install signals and country growth</div></div>
        <button class="ilo-refresh" type="button" id="ioneLaunchRefresh">REFRESH</button>
      </div>
      <div id="ioneLaunchStatus" class="ilo-status">Preparing launch analytics…</div>
      <div id="ioneLaunchDashboard" style="display:none">
        <div class="ilo-cards" id="ioneLaunchCards"></div>
        <div class="ilo-section"><h4>VISITOR GROWTH • LAST 14 DAYS</h4><div id="ioneLaunchTrend" class="ilo-trend"></div><div class="ilo-muted" style="margin-top:8px">Bars show unique anonymous browsers per reporting day (Tanzania time).</div></div>
        <div class="ilo-section"><h4>COUNTRY LEADERBOARD • LAST 30 DAYS</h4><div id="ioneLaunchCountries"></div></div>
        <div class="ilo-muted" id="ioneLaunchFootnote" style="margin-top:12px"></div>
      </div>`;
    inner.appendChild(section);
    document.getElementById("ioneLaunchRefresh")?.addEventListener("click", function () { loadSummary(true); });
  }

  function setStatus(message, error) {
    const status = document.getElementById("ioneLaunchStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("ilo-error", !!error);
  }

  function formatNum(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function render(data) {
    const dashboard = document.getElementById("ioneLaunchDashboard");
    const cards = document.getElementById("ioneLaunchCards");
    const trend = document.getElementById("ioneLaunchTrend");
    const countries = document.getElementById("ioneLaunchCountries");
    if (!dashboard || !cards || !trend || !countries) return;
    const items = [
      ["UNIQUE BROWSERS", data.visitorsTotal, "All time"],
      ["VISITORS TODAY", data.visitorsToday, "Unique per reporting day"],
      ["INSTALL BUTTON CLICKS", data.installClicksTotal, "Install interest"],
      ["CONFIRMED INSTALLS", data.installConfirmedTotal, "Where browser confirms"],
      ["INSTALLED-APP LAUNCHES", data.appLaunches30d, "Last 30 days"],
      ["COUNTRIES REACHED", data.countries30d, "Last 30 days"]
    ];
    cards.innerHTML = items.map(item => '<div class="ilo-card"><div class="ilo-label">' + esc(item[0]) + '</div><div class="ilo-value">' + esc(formatNum(item[1])) + '</div><div class="ilo-muted">' + esc(item[2]) + '</div></div>').join("");
    const points = Array.isArray(data.trend) ? data.trend : [];
    const max = Math.max(1, ...points.map(p => Number(p.visitors || 0)));
    trend.innerHTML = points.map(p => {
      const height = Math.max(2, Math.round((Number(p.visitors || 0) / max) * 78));
      const label = String(p.date || "").slice(5);
      return '<div class="ilo-day" title="' + esc(p.date) + ': ' + esc(formatNum(p.visitors)) + ' visitors, ' + esc(formatNum(p.installs)) + ' installs"><div class="ilo-bar-wrap"><div class="ilo-bar" style="height:' + height + 'px"></div></div><strong>' + esc(formatNum(p.visitors)) + '</strong><span>' + esc(label) + '</span></div>';
    }).join("");
    const rows = Array.isArray(data.countries) ? data.countries : [];
    countries.innerHTML = rows.length
      ? '<table class="ilo-table"><thead><tr><th># / COUNTRY</th><th>VISITORS</th><th>INSTALLS</th></tr></thead><tbody>' + rows.map((r, i) => '<tr><td>' + (i + 1) + '. ' + esc(r.name || r.code || "Unknown") + '</td><td>' + esc(formatNum(r.visitors30d)) + '</td><td>' + esc(formatNum(r.installs30d)) + '</td></tr>').join("") + '</tbody></table>'
      : '<div class="ilo-status">Country rankings will appear as anonymous visit data arrives.</div>';
    const rate = Number(data.installRate || 0);
    document.getElementById("ioneLaunchFootnote").textContent =
      "Estimated install conversion: " + rate.toFixed(2) + "%. " +
      "Countries reached in the last 30 days: " + formatNum(data.countries30d) + ". " +
      "Country can be unavailable or affected by VPNs. Install confirmation depends on browser support.";
    dashboard.style.display = "block";
    setStatus("Updated " + new Date(data.generatedAt || Date.now()).toLocaleString() + " • Reporting day: Tanzania time.", false);
  }

  let loading = false;
  async function loadSummary(force) {
    if (loading) return;
    const section = document.getElementById("ioneLaunchObservatory");
    if (!section) return;
    const token = sessionStorage.getItem("ioneAuthoritySession") || "";
    const expiresAt = Date.parse(sessionStorage.getItem("ioneAuthoritySessionExpiresAt") || "");
    if (!token || (Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
      setStatus("Unlock Authority Press to view launch analytics.", true);
      return;
    }
    if (typeof heavensSupabase === "undefined" || !heavensSupabase.functions) {
      setStatus("Secure analytics connection is not ready. Existing app features remain unaffected.", true);
      return;
    }
    loading = true;
    const button = document.getElementById("ioneLaunchRefresh");
    if (button) { button.disabled = true; button.textContent = "LOADING…"; }
    setStatus("Loading launch metrics…", false);
    try {
      const session = await ensureHeavensAnonymousSession();
      if (!session || !session.user) throw new Error("App session is not ready.");
      const result = await heavensSupabase.functions.invoke(FUNCTION_NAME, {
        body: { action: "summary", authority_session: token }
      });
      if (result.error) throw result.error;
      if (!result.data || result.data.success !== true) throw new Error(result.data?.error || "Could not load launch analytics.");
      render(result.data);
    } catch (error) {
      setStatus(error && error.message ? error.message : "Launch analytics could not be loaded.", true);
    } finally {
      loading = false;
      if (button) { button.disabled = false; button.textContent = "REFRESH"; }
    }
  }

  let refreshTimer = null;
  function isAuthorityOpen(panel) {
    if (!panel) return false;
    if (panel.getAttribute("aria-hidden") === "false") return true;
    const style = window.getComputedStyle(panel);
    return style.display !== "none" && style.visibility !== "hidden" && panel.getClientRects().length > 0;
  }

  function bindPanel() {
    makeSection();
    const panel = document.getElementById("authorityPressPanel");
    if (!panel) return;
    if (panel.__ioneLaunchObserverBound) return;
    panel.__ioneLaunchObserverBound = true;
    const sync = function () {
      makeSection();
      if (isAuthorityOpen(panel)) {
        loadSummary(false);
        if (!refreshTimer) refreshTimer = window.setInterval(function () {
          if (isAuthorityOpen(panel)) loadSummary(false);
        }, 60000);
      } else if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["aria-hidden", "style", "class"] });
    document.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest("#authorityPasswordUnlock")) {
        window.setTimeout(sync, 600);
      }
    });
    sync();
  }

  function init() {
    installTracking();
    bindPanel();
    if (!document.getElementById("ioneLaunchObservatory")) {
      const observer = new MutationObserver(function () {
        if (document.querySelector("#authorityPressPanel .authority-panel-inner")) {
          bindPanel();
          if (document.getElementById("ioneLaunchObservatory")) observer.disconnect();
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      window.setTimeout(function () { observer.disconnect(); }, 15000);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
