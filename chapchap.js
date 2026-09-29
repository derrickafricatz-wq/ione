/* I|ONE CHAPCHAP — isolated marketplace module
 * This file intentionally owns only the ChapChap UI and data flow.
 * If it fails, the main I|ONE application is left untouched.
 */
(function () {
  "use strict";

  var started = false;
  var productCache = [];
  var pollTimer = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function money(value, currency) {
    var code = currency || "TZS";
    var number = Number(value || 0);
    return code + " " + number.toLocaleString("en-US", code === "USD" ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {maximumFractionDigits: 0});
  }

  function normalizePhone(value) {
    var raw = String(value || "").trim();
    var p = raw.replace(/\D/g, "");
    if (raw.charAt(0) === "+" && p) return p;
    if (p.indexOf("255") === 0) return p;
    if (p.indexOf("0") === 0) return "255" + p.slice(1);
    if (p.indexOf("6") === 0 || p.indexOf("7") === 0) return "255" + p;
    return p;
  }

  function validPhone(value) {
    return /^255[67]\d{8}$/.test(normalizePhone(value));
  }

  function validInternationalPhone(value) {
    return /^\d{8,15}$/.test(normalizePhone(value));
  }

  function parsePrice(value) {
    var raw = String(value || "").replace(/,/g, "").replace(/\s/g, "");
    var n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }

  function formatPriceInput(el) {
    if (!el) return;
    var raw = String(el.value || "").replace(/,/g, "").replace(/[^0-9.]/g, "");
    var parts = raw.split(".");
    var whole = (parts.shift() || "").replace(/^0+(?=\d)/, "");
    if (!whole) whole = "0";
    var decimals = parts.join("").slice(0, 2);
    el.value = decimals ? Number(whole).toLocaleString("en-US") + "." + decimals : Number(whole).toLocaleString("en-US");
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el && typeof el.value === "string" ? el.value : "";
  }

  function getSupabase() {
    return typeof heavensSupabase !== "undefined" ? heavensSupabase : null;
  }

  async function getSession() {
    if (typeof ensureHeavensAnonymousSession !== "function") {
      throw new Error("I|ONE secure session is not ready.");
    }
    var session = await ensureHeavensAnonymousSession();
    if (!session || !session.user) throw new Error("I|ONE secure session could not be created.");
    return session;
  }

  function injectStyles() {
    if (document.getElementById("ioneChapChapStyles")) return;
    var style = document.createElement("style");
    style.id = "ioneChapChapStyles";
    style.textContent =
      "#ioneChapDock{padding:7px 10px 11px;border-bottom:1px solid #1d3034;background:#050809;position:relative;z-index:21}" +
      "#ioneChapBar{display:flex;align-items:center;gap:8px;margin-bottom:8px}" +
      "#ioneChapOpen{min-height:39px;height:39px;padding:0 8px;border-radius:11px;font-size:9px;box-shadow:none;-webkit-tap-highlight-color:transparent}" +
      "#ioneChapMine{border:1px solid #294349;border-radius:12px;padding:9px 12px;background:#0a1113;color:#bfeff2;font:900 10px Arial,sans-serif;cursor:pointer}" +
      "#ioneChapStatus{margin-left:auto;color:#70878c;font:800 9px Arial,sans-serif;letter-spacing:.7px}" +
      "#ioneChapRail{display:flex;gap:11px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;padding:4px 5px 12px;scrollbar-width:none}" +
      "#ioneChapRail::-webkit-scrollbar{display:none}" +
      ".ione-chap-card{flex:0 0 178px;height:222px;scroll-snap-align:start;position:relative;border:1px solid #294349;border-radius:18px;background:linear-gradient(145deg,#142a2f,#050809);overflow:hidden;box-shadow:none;transform:none;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
      ".ione-chap-card:active{transform:none;box-shadow:none}" +
      ".ione-chap-card.pending-payment{cursor:default}.ione-chap-pending{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:10px;text-align:center;background:linear-gradient(to bottom,rgba(0,0,0,.08),rgba(0,0,0,.55));color:#ffe600;font:900 11px/1.25 Arial,sans-serif;letter-spacing:1px;text-shadow:0 2px 5px #000}" +
      ".ione-chap-photo{position:absolute;inset:0;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}" +
      ".ione-chap-photo img{width:100%;height:100%;object-fit:contain;display:block;background:#000}" +
      ".ione-chap-price{position:absolute;left:8px;top:8px;z-index:3;padding:6px 8px;border-radius:8px;background:#ffe600;color:#111;font:900 10px Arial,sans-serif;box-shadow:none}" +
      ".ione-chap-sold{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.68);color:#ff7d7d;font:900 20px Arial,sans-serif;letter-spacing:2px}" +
      ".ione-chap-info{position:absolute;left:0;right:0;bottom:0;padding:34px 10px 10px;background:linear-gradient(to top,rgba(0,0,0,.62),rgba(0,0,0,0));z-index:2}.ione-chap-title{color:#fff;font:900 13px/1.15 Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ione-chap-seller{margin-top:6px;color:#00ffff;font:800 9px Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ione-chap-location{margin-top:5px;color:#71878c;font:700 8px Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".ione-chap-empty{min-width:100%;padding:18px;text-align:center;color:#789096;border:1px dashed #294349;border-radius:14px;font:800 10px/1.5 Arial,sans-serif}" +
      "#ioneChapOverlay{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important;display:none;align-items:stretch!important;justify-content:stretch!important;padding:0!important;margin:0!important;box-sizing:border-box;background:#050809!important;opacity:1!important;isolation:isolate;overflow:hidden!important;font-family:Arial,sans-serif;color:#fff;-webkit-tap-highlight-color:transparent}" +
      "#ioneChapOverlay .cc-card{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;overflow:auto!important;box-sizing:border-box;border:0!important;border-radius:0!important;background:linear-gradient(160deg,#102b32 0%,#071417 42%,#030607 100%)!important;box-shadow:none!important;padding:18px!important;margin:0!important}" +
      "body.ione-chap-open{overflow:hidden!important}" +
      "#ioneChapOverlay .cc-card.cc-mychap{width:min(430px,calc(100vw - 30px))!important;height:auto!important;max-height:calc(100vh - 30px)!important;overflow:auto!important;margin:0 auto!important;border:1px solid rgba(255,79,216,.62)!important;border-radius:20px!important;background:linear-gradient(145deg,#171126 0%,#0a0c16 55%,#071012 100%)!important;box-shadow:0 22px 65px rgba(0,0,0,.7),0 0 28px rgba(255,79,216,.10)!important}" +
      "#ioneChapOverlay.cc-overlay-mychap{align-items:center!important;justify-content:center!important;padding:15px!important;background:rgba(0,0,0,.78)!important}" +
      ".cc-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.cc-head h2{margin:0;color:#00ffff;font:900 23px Arial,sans-serif}.cc-close{border:1px solid #334a50;background:#111;color:#fff;border-radius:10px;padding:8px 11px;font-weight:900;cursor:pointer}" +
      ".cc-kicker{color:#789096;font:900 9px Arial,sans-serif;letter-spacing:2px;margin:5px 0 13px}.cc-grid{display:grid;gap:9px}.cc-field label{display:block;color:#00ffff;font:900 9px Arial,sans-serif;letter-spacing:1px;margin:0 0 5px}.cc-field input,.cc-field select,.cc-field textarea{width:100%;box-sizing:border-box;border:1px solid #294349;border-radius:10px;background:#071012;color:#fff;padding:11px;font:700 13px Arial,sans-serif;outline:none}.cc-field textarea{min-height:76px;resize:vertical}.cc-field input:focus,.cc-field select:focus,.cc-field textarea:focus{border-color:#00ffff}.cc-images{display:block}.cc-image-actions{display:flex;flex-direction:row;align-items:stretch;gap:8px;width:100%;overflow:hidden}.cc-image-btn{flex:1 1 0;min-width:0;height:42px;padding:0 10px;border:1px solid #31535a;border-radius:11px;background:linear-gradient(145deg,#14262b,#071012);color:#eaffff;font:900 9px Arial,sans-serif;letter-spacing:.65px;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 4px 0 #020506;cursor:pointer}.cc-image-btn:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 0 #020506}.cc-image-count{margin-top:7px;text-align:center;color:#71878c;font:800 8px Arial,sans-serif;letter-spacing:.5px}.cc-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.cc-primary,.cc-secondary{min-height:45px;border-radius:11px;font-weight:900;cursor:pointer}.cc-primary{border:1px solid #00ffff;background:linear-gradient(145deg,#18ffff,#008f8f);color:#001010}.cc-secondary{border:1px solid #334a50;background:#111;color:#fff}.cc-status{min-height:20px;margin-top:10px;text-align:center;color:#9eb0b5;font:800 10px/1.4 Arial,sans-serif}.cc-product-preview{display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:center;margin:5px 0 13px;padding:9px;border:1px solid #294349;border-radius:13px;background:#071012}.cc-product-preview img{width:110px;height:90px;object-fit:cover;border-radius:9px;background:#0b1417}.cc-gallery{position:relative;width:100%;height:clamp(150px,28vh,230px);overflow:hidden;border:1px solid #294349;border-radius:15px;background:#000;margin:4px 0 12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}.cc-gallery-img{position:absolute!important;inset:0;width:100%;height:100%;object-fit:contain;display:block;background:#000;opacity:0;transition:opacity .8s ease}.cc-gallery-img:first-child{opacity:1}.cc-product-preview h3{margin:0 0 5px;font:900 16px Arial,sans-serif}.cc-product-preview p{margin:3px 0;color:#9fb2b6;font-size:10px}.cc-phone{font-size:18px!important;letter-spacing:1px}.cc-call{display:inline-block;margin-top:8px;padding:9px 11px;border:1px solid #00ffff;border-radius:9px;background:#071719;color:#00ffff;text-decoration:none;font:900 10px Arial,sans-serif}.cc-list{display:grid;gap:8px}.cc-list-item{border:1px solid #294349;border-radius:12px;padding:10px;background:#071012}.cc-list-item strong{display:block;color:#fff;font-size:12px}.cc-list-item span{display:block;margin-top:4px;color:#82979c;font-size:9px}.cc-list-item a{display:inline-block;margin-top:7px;color:#00ffff;font-weight:900;font-size:10px;text-decoration:none}" +
      "/* I1 Marketing world: identity-light header, discovery first, ChapChap compact, billboards dominant. */" +
      "#afrilinkOverlay .afl-head{padding:5px 7px;gap:5px;min-height:48px;display:flex;align-items:center;overflow:visible;flex-wrap:nowrap}" +"#afrilinkOverlay .afl-head{padding:4px 5px!important;gap:4px!important;min-height:44px!important;height:44px!important;box-sizing:border-box!important;overflow:visible!important;flex-wrap:nowrap!important}" +"#afrilinkOverlay .afl-brand-mark{flex:0 0 29px!important;width:29px!important;height:29px!important;border-radius:8px!important;font-size:10px!important}" +"#afrilinkOverlay .afl-discovery{order:2!important;flex:1 1 0!important;min-width:72px!important;width:auto!important;padding:0!important;margin:0!important}" +"#afrilinkOverlay .afl-discovery-row{gap:3px!important;width:100%!important;display:flex!important}" +"#afrilinkOverlay .afl-discovery-row input{flex:1 1 0!important;min-width:42px!important;width:0!important;height:29px!important;padding:0 6px!important;font-size:7px!important}" +"#afrilinkOverlay .afl-discovery-row input::placeholder{font-size:6px!important}" +"#afrilinkOverlay .afl-discovery-row select{flex:0 0 48px!important;width:48px!important;min-width:48px!important;height:29px!important;padding:0 2px!important;font-size:5.5px!important}" +"#afrilinkOverlay .afl-head-actions{order:3!important;display:flex!important;gap:2px!important;flex:0 0 auto!important;min-width:0!important}" +"#afrilinkOverlay .afl-top-btn{width:30px!important;min-width:30px!important;height:29px!important;min-height:29px!important;padding:0 2px!important;font-size:5.5px!important;border-radius:7px!important;white-space:nowrap!important;overflow:hidden!important}" +"#afrilinkOverlay .afl-upload-top,#afrilinkOverlay .afl-owner-only-top,#afrilinkOverlay .afl-close{min-width:30px!important;width:30px!important}" +
      "#afrilinkOverlay .afl-brand-mark{flex:0 0 36px;width:36px;height:36px;border-radius:10px;font-size:13px;box-shadow:none!important}" +
      "#afrilinkOverlay .afl-head-title{display:none}" +
      "#afrilinkOverlay .afl-head-actions{display:flex;flex:0 0 auto;margin-left:0;gap:3px}" +
      "#afrilinkOverlay .afl-top-btn{min-height:32px;height:32px;padding:0 6px;border-radius:8px;font-size:7px;box-shadow:none!important}" +
      "#afrilinkOverlay .afl-upload-top{min-width:74px}" +
      "#afrilinkOverlay .afl-owner-only-top{min-width:101px}" +
      "#afrilinkOverlay .afl-close{min-width:67px}" +
      "#afrilinkOverlay .afl-scroll{padding:6px 7px 28px}" +
      "/* Search + category are the first market controls, directly below I1. */" +
      "#afrilinkOverlay .afl-discovery{display:block;flex:1 1 auto;min-width:0;width:auto;padding:0;margin:0;border:0;background:transparent}" +
      "#afrilinkOverlay .afl-discovery-row{display:flex;justify-content:flex-start;gap:6px;width:100%;align-items:center}" +
      "#afrilinkOverlay .afl-discovery-row input{flex:1 1 auto;min-width:0;width:1px;padding:7px 6px;font-size:7px;border-radius:9px}" +
      "#afrilinkOverlay .afl-discovery-row select{flex:0 0 58px;width:58px;padding:7px 2px;font-size:6px;border-radius:9px}" +
      "#afrilinkOverlay .afl-discovery-row input::placeholder{font-size:6.5px}" + "#afrilinkOverlay .afl-discovery-hint{display:none}" +
      "/* ChapChap becomes a small horizontal market shelf so billboards remain the visual hero. */" +
      "#ioneChapDock{margin:0 0 7px;padding:5px 4px 4px;border-bottom:1px solid #172a2e;background:transparent}" +
      "#ioneChapBar{display:grid!important;grid-template-columns:minmax(0,1fr) 94px 94px;align-items:center;gap:5px;margin-bottom:4px}" +
      "#ioneChapOpen{min-height:39px;height:39px;padding:0 8px;border-radius:11px;font-size:9px;letter-spacing:.65px;line-height:1.05;background:linear-gradient(135deg,#00ffff,#008cff)!important;border:1px solid #00ffff!important;color:#001014!important;box-shadow:none!important}" +
      "#ioneChapMine{min-height:39px;height:39px;padding:0 7px;border-radius:11px;font-size:8px;line-height:1.05;background:linear-gradient(135deg,#ff4fd8,#7b5cff)!important;border:1px solid #ff8be7!important;color:#fff!important;box-shadow:none!important}" +
      "#ioneChapStatus{margin-left:0;min-width:43px;font-size:7px;line-height:1.05;text-align:center;letter-spacing:.25px}" +
      "#ioneChapRail{gap:7px;padding:2px 0 6px}" +
      ".ione-chap-card{flex:0 0 137px;height:171px;border-radius:15px;transform:none;scroll-snap-align:start;box-shadow:none!important}" +
      ".ione-chap-photo img{width:100%;height:100%;object-fit:cover;object-position:center center;background:#000}" +
      ".ione-chap-price{left:6px;top:6px;padding:4px 6px;border-radius:7px;font-size:8px;opacity:.92;box-shadow:none!important;backdrop-filter:none}" +
      ".ione-chap-info{padding:7px 8px 8px;background:linear-gradient(to top,rgba(0,0,0,.68),rgba(0,0,0,.02))}" +
      ".ione-chap-title{font-size:9px}.ione-chap-seller{font-size:7.5px}.ione-chap-location{font-size:6.5px}" +
      "/* Payment/product graphics remain visible beneath translucent UI elements. */" +
      ".cc-product-preview{background:rgba(7,16,18,.72)}" +
      ".cc-product-preview p span{opacity:.84}" +
      ".cc-call{background:rgba(7,23,25,.68)}" +
      "#ioneChapDock button:active,#ioneChapDock a:active,#ioneChapOverlay button:active,#ioneChapOverlay a:active{box-shadow:none!important;filter:none!important;transform:none!important}" +
      "#ioneChapDock,#ioneChapOverlay{-webkit-tap-highlight-color:transparent}" +
      "#ioneChapDock button,#ioneChapDock a,#ioneChapOverlay button,#ioneChapOverlay a{touch-action:manipulation}" +
      "#ioneChapRail{contain:content}" +
      "/* Full billboard content keeps its existing geometry and remains the visual focus. */" +
      "#afrilinkOverlay .afl-screen img.afl-signage-media{object-fit:contain!important;object-position:center center!important;background:#000}" +
      "@media(max-width:420px){#ioneChapBar{grid-template-columns:minmax(0,1fr) 82px 94px}.ione-chap-card{flex-basis:132px;height:165px}#ioneChapOpen{font-size:8.5px}#ioneChapMine{font-size:7.5px}#afrilinkOverlay .afl-discovery{padding:5px 0 6px}.afl-discovery-row select{width:132px;flex-basis:132px}.afl-top-btn{padding:0 8px;font-size:8px}}";
    
      /* FINAL MICRO HEADER + CUTE FAST CHAPCHAP POLISH */
      style.textContent +=
        "#afrilinkOverlay .afl-head{display:flex!important;align-items:center!important;gap:3px!important;height:44px!important;min-height:44px!important;padding:4px!important;overflow:visible!important}" +
        "#afrilinkOverlay .afl-brand-mark{flex:0 0 28px!important;width:28px!important;height:28px!important;font-size:9px!important;border-radius:8px!important}" +
        "#afrilinkOverlay .afl-discovery{order:2!important;flex:1 1 0!important;min-width:70px!important;padding:0!important;margin:0!important}" +
        "#afrilinkOverlay .afl-discovery-row{gap:2px!important;width:100%!important}" +
        "#afrilinkOverlay .afl-discovery-row input{flex:1 1 0!important;width:0!important;min-width:35px!important;height:28px!important;padding:0 5px!important;font-size:7px!important}" +
        "#afrilinkOverlay .afl-discovery-row select{flex:0 0 45px!important;width:45px!important;min-width:45px!important;height:28px!important;padding:0 1px!important;font-size:5.5px!important}" +
        "#afrilinkOverlay .afl-head-actions{order:3!important;flex:0 0 auto!important;display:flex!important;gap:2px!important;margin:0!important}" +
        "#afrilinkOverlay .afl-top-btn{width:29px!important;min-width:29px!important;height:28px!important;min-height:28px!important;padding:0 1px!important;font-size:5.5px!important;border-radius:7px!important;white-space:nowrap!important;overflow:hidden!important}" +
        "#afrilinkOverlay .afl-upload-top,#afrilinkOverlay .afl-owner-only-top,#afrilinkOverlay .afl-close{width:29px!important;min-width:29px!important}" +
        "#ioneChapDock{padding:6px 4px 7px!important;border:0!important;background:linear-gradient(180deg,rgba(0,255,255,.035),transparent)!important}" +
        "#ioneChapBar{gap:4px!important;margin-bottom:5px!important}" +
        "#ioneChapOpen,#ioneChapMine{position:relative!important;overflow:hidden!important;font-weight:1000!important;letter-spacing:.4px!important;transition:filter .12s ease,transform .12s ease!important}" +
        "#ioneChapOpen:before,#ioneChapMine:before{content:'';position:absolute;top:0;left:-35%;width:22%;height:100%;background:rgba(255,255,255,.48);transform:skewX(-20deg);animation:ioneChapShine 3.8s linear infinite;pointer-events:none!important}" +
        "#ioneChapOpen{background:linear-gradient(135deg,#00ffff 0%,#008cff 52%,#625cff 100%)!important;border-color:#75ffff!important;color:#001014!important}" +
        "#ioneChapMine{background:linear-gradient(135deg,#ff4fd8 0%,#9b55ff 55%,#5f6cff 100%)!important;border-color:#ff9be9!important;color:#fff!important}" +
        "#ioneChapOpen:active,#ioneChapMine:active{filter:brightness(1.08)!important;transform:scale(.985)!important}" +
        "#ioneChapRail{gap:8px!important;padding:3px 2px 7px!important;scroll-behavior:smooth!important;-webkit-overflow-scrolling:touch!important}" +
        ".ione-chap-card{border:1px solid rgba(0,255,255,.28)!important;background:linear-gradient(145deg,#132d34,#06090b)!important;transition:transform .12s ease,border-color .12s ease!important;will-change:transform!important}" +
        ".ione-chap-card:after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.10),transparent 28%,transparent 72%,rgba(0,255,255,.08))!important}" +
        ".ione-chap-card:hover{border-color:rgba(0,255,255,.72)!important;transform:translateY(-2px)!important}" +
        ".ione-chap-price{background:linear-gradient(135deg,#ffe600,#ff9f00)!important;color:#171000!important;border:1px solid rgba(255,255,255,.65)!important}" +
        ".ione-chap-title{font-size:10px!important;text-shadow:0 1px 3px #000!important}" +
        ".ione-chap-seller{color:#6fffff!important}.ione-chap-location{color:#b5c7ca!important}" +
        "@keyframes ioneChapShine{0%{left:-35%;opacity:0}12%{opacity:1}30%{left:115%;opacity:0}100%{left:115%;opacity:0}}" +
        "@media(max-width:420px){#ioneChapBar{grid-template-columns:minmax(0,1fr) 82px 94px!important}.ione-chap-card{flex-basis:132px!important;height:165px!important}#afrilinkOverlay .afl-discovery-row select{width:45px!important;min-width:45px!important;flex-basis:45px!important}#afrilinkOverlay .afl-top-btn{width:29px!important;min-width:29px!important;padding:0 1px!important;font-size:5.5px!important}}";

    style.textContent += "#afrilinkOverlay .afl-head{gap:6px!important;padding:4px 6px!important}"+"#afrilinkOverlay .afl-discovery{flex:1 1 0!important;min-width:0!important;margin:0!important;padding:0!important}"+"#afrilinkOverlay .afl-discovery-row{display:flex!important;gap:6px!important;width:100%!important}"+"#afrilinkOverlay .afl-discovery-row input{flex:1.35 1 0!important;width:0!important;min-width:0!important;height:36px!important;margin:0!important;padding:0 10px!important;font-size:9px!important;font-weight:900!important;letter-spacing:.15px!important;border-radius:11px!important;box-sizing:border-box!important}"+"#afrilinkOverlay .afl-discovery-row select{flex:1 1 0!important;width:0!important;min-width:0!important;height:36px!important;margin:0!important;padding:0 7px!important;font-size:8px!important;font-weight:900!important;letter-spacing:.1px!important;border-radius:11px!important;box-sizing:border-box!important}"+"#afrilinkOverlay .afl-head-actions{flex:1.9 1 0!important;min-width:0!important;display:flex!important;gap:6px!important;padding:0!important;margin:0!important}"+"#afrilinkOverlay .afl-top-btn{flex:1 1 0!important;width:0!important;min-width:0!important;height:36px!important;min-height:36px!important;padding:0 4px!important;font-size:8px!important;font-weight:1000!important;letter-spacing:.2px!important;border-radius:11px!important;box-sizing:border-box!important;white-space:nowrap!important;text-shadow:0 1px 0 rgba(255,255,255,.18)!important}"+"#afrilinkOverlay .afl-upload-top,#afrilinkOverlay .afl-owner-only-top,#afrilinkOverlay .afl-close{flex:1 1 0!important;width:0!important;min-width:0!important}"+"#afrilinkOverlay .afl-discovery-row input,#afrilinkOverlay .afl-discovery-row select,#afrilinkOverlay .afl-top-btn{border:1px solid rgba(130,255,255,.48)!important;box-shadow:inset 0 2px 0 rgba(255,255,255,.26),inset 0 -2px 0 rgba(0,0,0,.22),0 2px 0 rgba(0,0,0,.34)!important;background:linear-gradient(145deg,rgba(0,255,255,.22),rgba(65,80,255,.22) 55%,rgba(190,70,255,.2))!important;transition:transform .08s ease,filter .08s ease,border-color .08s ease!important;-webkit-tap-highlight-color:transparent!important;touch-action:manipulation!important}"+"#afrilinkOverlay .afl-discovery-row input:focus,#afrilinkOverlay .afl-discovery-row select:focus{border-color:rgba(0,255,255,.9)!important;outline:none!important}"+"#afrilinkOverlay .afl-top-btn:active,#afrilinkOverlay .afl-discovery-row select:active{transform:translateY(2px)!important;box-shadow:inset 0 2px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(0,0,0,.2),0 0 0 rgba(0,0,0,0)!important;filter:brightness(1.15)!important}"+"#afrilinkOverlay .afl-close{background:linear-gradient(145deg,rgba(255,90,175,.34),rgba(130,65,255,.28))!important;border-color:rgba(255,150,215,.68)!important}";+"#afrilinkOverlay .afl-discovery-row input{color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;text-shadow:0 1px 2px rgba(0,0,0,.75)!important;background:linear-gradient(145deg,rgba(0,255,255,.34),rgba(35,85,255,.3))!important}"+"#afrilinkOverlay .afl-discovery-row input::placeholder{color:#ffffff!important;opacity:1!important;-webkit-text-fill-color:#ffffff!important;text-shadow:0 1px 2px rgba(0,0,0,.75)!important}"+"#afrilinkOverlay .afl-upload-top{color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;text-shadow:0 1px 2px #061018!important;background:linear-gradient(145deg,#00dfff,#3d65ff 58%,#8a4dff)!important;border-color:rgba(170,255,255,.8)!important}"+"#afrilinkOverlay .afl-upload-top:active{transform:translateY(2px)!important;filter:brightness(1.2)!important}"
    document.head.appendChild(style);
  }

  function createDock() {
    var discovery = document.querySelector("#afrilinkOverlay .afl-discovery");
    var brandMark = document.querySelector("#afrilinkOverlay .afl-brand-mark");
    if (brandMark) brandMark.textContent = "I1";
    var head = document.querySelector("#afrilinkOverlay .afl-head");
    if (head && discovery && discovery.parentNode !== head) head.insertBefore(discovery, head.querySelector(".afl-head-actions") || null);
    if (!discovery || document.getElementById("ioneChapDock")) return;
    var dock = document.createElement("div");
    dock.id = "ioneChapDock";
    dock.innerHTML =
      '<div id="ioneChapBar">' +
      '<button id="ioneChapOpen" type="button">CHAPCHAP • BUY / SELL</button>' +
      '<button id="ioneChapMine" type="button">MY CHAPCHAP</button>' +
      '' +
      '</div>' +
      '<div id="ioneChapRail"><div class="ione-chap-empty">Loading ChapChap products…</div></div>';
    if (head && head.parentNode) head.parentNode.insertBefore(dock, head.nextSibling); else return;
    document.getElementById("ioneChapOpen").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openSell(); });
    document.getElementById("ioneChapMine").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openMine(); });
  }

  function createOverlay() {
    if (document.getElementById("ioneChapOverlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "ioneChapOverlay";
    overlay.innerHTML =
      '<div class="cc-card">' +
        '<div class="cc-head"><h2 id="ioneChapOverlayTitle">CHAPCHAP</h2><button class="cc-close" id="ioneChapOverlayClose" type="button">CLOSE</button></div>' +
        '<div class="cc-kicker" id="ioneChapOverlayKicker">I|ONE • SINGLE-PRODUCT MARKET</div>' +
        '<div id="ioneChapOverlayBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("ioneChapOverlayClose").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeOverlay(); });
  }

  function openOverlay(title, kicker, body) {
    createOverlay();
    document.getElementById("ioneChapOverlayTitle").textContent = title;
    document.getElementById("ioneChapOverlayKicker").textContent = kicker || "I|ONE • SINGLE-PRODUCT MARKET";
    document.getElementById("ioneChapOverlayBody").innerHTML = body;
    document.getElementById("ioneChapOverlay").style.display = "flex";
    document.body.classList.add("ione-chap-open");
    var overlay=document.getElementById("ioneChapOverlay");
    var cc=overlay ? overlay.querySelector(".cc-card") : null;
    var isMyChap=title==="MY CHAPCHAP";
    if(overlay) overlay.classList.toggle("cc-overlay-mychap",isMyChap);
    if(cc) cc.classList.toggle("cc-mychap",isMyChap);
    if(cc && isMyChap){
      cc.style.width="min(430px,calc(100vw - 30px))";
      cc.style.height="auto";
      cc.style.maxWidth="430px";
      cc.style.maxHeight="calc(100vh - 30px)";
      cc.style.borderRadius="20px";
      cc.style.border="1px solid rgba(255,79,216,.62)";
      cc.style.boxShadow="0 22px 65px rgba(0,0,0,.7),0 0 28px rgba(255,79,216,.10)";
      cc.style.margin="0 auto";
    }
    if(cc && !isMyChap){
      overlay.classList.remove("cc-overlay-mychap");
      cc.style.width="100vw";cc.style.height="100vh";cc.style.maxWidth="none";cc.style.maxHeight="none";cc.style.borderRadius="0";cc.style.border="0";cc.style.boxShadow="none";cc.style.margin="0";
    }
    requestAnimationFrame(function(){var el=document.getElementById("ioneChapOverlay");if(el){el.style.display="flex";el.scrollTop=0;}});
  }

  function closeOverlay() {
    var el = document.getElementById("ioneChapOverlay");
    if (el) el.style.display = "none";
    document.body.classList.remove("ione-chap-open");
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (galleryTimer) { clearInterval(galleryTimer); galleryTimer = null; }
  }

  var smartFields = {
    phones: [["brand","Brand / model","text"],["condition","Condition","select:New|Used"],["storage","Storage","text"],["network","Network / SIM","text"]],
    electronics: [["brand","Brand / model","text"],["condition","Condition","select:New|Used"],["warranty","Warranty","text"],["specs","Key specifications","text"]],
    fashion: [["size","Size","text"],["condition","Condition","select:New|Used"],["color","Color","text"],["material","Material","text"]],
    vehicles: [["make","Make / model","text"],["year","Year","number"],["condition","Condition","select:New|Used"],["mileage","Mileage","text"]],
    furniture: [["type","Furniture type","text"],["condition","Condition","select:New|Used"],["material","Material","text"],["dimensions","Dimensions","text"]],
    food: [["portion","Portion / size","text"],["availability","Availability","text"],["delivery","Delivery","text"],["ingredients","Main ingredients","text"]],
    services: [["service_type","Service type","text"],["availability","Availability","text"],["duration","Typical duration","text"],["coverage","Service area","text"]],
    other: [["details","Key detail","text"],["condition","Condition","select:New|Used"],["brand","Brand","text"],["note","Extra detail","text"]]
  };

  function fieldHtml(spec) {
    var key = spec[0], label = spec[1], type = spec[2];
    if (type.indexOf("select:") === 0) {
      var opts = type.slice(7).split("|").map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + "</option>"; }).join("");
      return '<div class="cc-field"><label>' + esc(label) + '</label><select id="ioneCc_attr_' + esc(key) + '"><option value="">SELECT</option>' + opts + "</select></div>";
    }
    return '<div class="cc-field"><label>' + esc(label) + '</label><input id="ioneCc_attr_' + esc(key) + '" type="' + esc(type) + '" maxlength="120" placeholder="' + esc(label) + '"></div>';
  }

  function categoryHtml() {
    return '<select id="ioneCcCategory">' +
      '<option value="phones">PHONES</option><option value="electronics">ELECTRONICS</option>' +
      '<option value="fashion">FASHION</option><option value="vehicles">VEHICLES</option>' +
      '<option value="furniture">FURNITURE</option><option value="food">FOOD</option>' +
      '<option value="services">SERVICES</option><option value="other">OTHER</option>' +
      "</select>";
  }

  function renderSmartFields() {
    var cat = document.getElementById("ioneCcCategory");
    var box = document.getElementById("ioneCcSmartFields");
    if (!cat || !box) return;
    box.innerHTML = (smartFields[cat.value] || smartFields.other).map(fieldHtml).join("");
  }

  function openSell() {
    openOverlay("SELL ON CHAPCHAP", "SELLER • ONE PRODUCT PER LISTING",
      '<div class="cc-grid">' +
      '<div class="cc-field"><label>YOUR FULL NAME</label><input id="ioneCcSellerName" maxlength="100" placeholder="Full legal name"></div>' +
      '<div class="cc-field"><label>YOUR CALL NUMBER • INCLUDE COUNTRY CODE</label><input id="ioneCcSellerPhone" class="cc-phone" inputmode="tel" maxlength="16" placeholder="+255712345678"></div>' +
      '<div class="cc-field"><label>YOUR EMAIL</label><input id="ioneCcSellerEmail" type="email" maxlength="160" placeholder="you@example.com"></div>' +
      '<div class="cc-field"><label>YOUR FULL ADDRESS</label><textarea id="ioneCcSellerAddress" maxlength="240" placeholder="Full address"></textarea></div>' +
      '<div class="cc-field"><label>YOUR LOCATION</label><input id="ioneCcSellerLocation" maxlength="120" placeholder="City / area / region"></div>' +
      '<div class="cc-field"><label>CATEGORY</label>' + categoryHtml() + "</div>" +
      '<div id="ioneCcSmartFields" class="cc-grid"></div>' +
      '<div class="cc-field"><label>PRODUCT NAME</label><input id="ioneCcTitle" maxlength="100" placeholder="One clear product name"></div>' +
      '<div class="cc-field"><label>PRICE</label><div style="display:grid;grid-template-columns:1fr 96px;gap:8px"><input id="ioneCcPrice" type="text" inputmode="decimal" autocomplete="off" placeholder="Example: 250,000.00"><select id="ioneCcCurrency"><option value="TZS">TZS • TANZANIAN SHILLING</option><option value="USD">USD • US DOLLAR</option></select></div></div>' +
      '<div class="cc-field"><label>PRICE TAG COLOR</label><select id="ioneCcTagColor"><option value="#ffe600">GOLD</option><option value="#ff3b30">RED</option><option value="#00a8ff">BLUE</option><option value="#22c55e">GREEN</option><option value="#a855f7">PURPLE</option><option value="#00ffff">CYAN</option><option value="#ffffff">WHITE</option><option value="#111111">BLACK</option></select></div>' +
      '<div class="cc-field"><label>PRODUCT LOCATION</label><input id="ioneCcLocation" maxlength="100" placeholder="Where the product is located"></div>' +
      '<div class="cc-field"><label>DESCRIPTION</label><textarea id="ioneCcDescription" maxlength="700" placeholder="Short product description"></textarea></div>' +
      '<div class="cc-field"><label>PRODUCT PHOTOS • UP TO 4</label><div class="cc-images">' +
      '<div class="cc-image-actions"><button id="ioneCcCameraBtn" class="cc-image-btn" type="button">TAKE PHOTO</button><button id="ioneCcGalleryBtn" class="cc-image-btn" type="button">UPLOAD VIA FILE</button></div>' +
      '<input id="ioneCcCamera" type="file" accept="image/*" capture="environment" hidden>' +
      '<input id="ioneCcGallery" type="file" accept="image/*" multiple hidden>' +
      '<div id="ioneCcImageCount" class="cc-image-count">NO PHOTOS SELECTED • MAX 4</div></div></div>' +
      '<div class="cc-field" style="border:1px solid rgba(0,255,255,.24);border-radius:12px;padding:12px;background:rgba(0,255,255,.035)">' +
      '<label>CHAPCHAP TERMS & CONDITIONS • VERSION 1.0</label>' +
      '<div style="font-size:11px;line-height:1.55;color:#d7e5e8;margin-top:7px">' +
      'I confirm that the information I provide is truthful and that I have the right to sell this product. I will not list stolen, counterfeit, illegal, fraudulent or misleading goods. I will accurately state ownership, condition, availability, price and location, keep my contact details accurate, and revoke a listing when the product is no longer available. Unlawful or fraudulent conduct may be reported to appropriate authorities where required or permitted by law. I understand that ChapChap charges a 1% platform fee and that BLMPay mobile-money processing is charged at the applicable rate (currently 3% for the I|ONE Business verification level). I also understand and agree that all BLMPay payout/send-money fees are my responsibility as the seller and are deducted from my seller balance before the final payout amount is sent to me. BLMPay determines the applicable payout fee for each payout amount.' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:11px;line-height:1.4"><input id="ioneCcTerms" type="checkbox" style="margin-top:2px"> <span>I have read and agree to the ChapChap Terms & Conditions.</span></label>' +
      '</div>' +
      '<div class="cc-actions"><button id="ioneCcSellCancel" class="cc-secondary" type="button">CANCEL</button><button id="ioneCcSellSubmit" class="cc-primary" type="button">PUBLISH PRODUCT</button></div>' +
      '<div id="ioneCcSellStatus" class="cc-status"></div>' +
      "</div>"
    );
    renderSmartFields();
    document.getElementById("ioneCcCategory").addEventListener("change", renderSmartFields);
    var priceInput = document.getElementById("ioneCcPrice");
    if (priceInput) priceInput.addEventListener("input", function () { formatPriceInput(priceInput); });
    document.getElementById("ioneCcSellCancel").addEventListener("click", closeOverlay);
    document.getElementById("ioneCcSellSubmit").addEventListener("click", submitListing);
    var camera = document.getElementById("ioneCcCamera");
    var gallery = document.getElementById("ioneCcGallery");
    var selectedFiles = [];
    function addSelectedFiles(list) {
      Array.prototype.forEach.call(list || [], function (file) {
        if (!file || !file.type || file.type.indexOf("image/") !== 0) return;
        if (selectedFiles.length < 4) selectedFiles.push(file);
      });
      var count = document.getElementById("ioneCcImageCount");
      if (count) count.textContent = selectedFiles.length + " PHOTO" + (selectedFiles.length === 1 ? "" : "S") + " SELECTED • MAX 4";
    }
    document.getElementById("ioneCcCameraBtn").addEventListener("click", function () { camera.click(); });
    document.getElementById("ioneCcGalleryBtn").addEventListener("click", function () { gallery.click(); });
    camera.addEventListener("change", function () { addSelectedFiles(camera.files); camera.value = ""; });
    gallery.addEventListener("change", function () { addSelectedFiles(gallery.files); gallery.value = ""; });
    window.ioneChapSelectedFiles = selectedFiles;
  }

  async function uploadImages(uid, files) {
    var sb = getSupabase();
    if (!sb) throw new Error("Supabase client is not ready.");
    var urls = [], paths = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file) continue;
      if (!file.type || file.type.indexOf("image/") !== 0) throw new Error("Photo " + (i + 1) + " is not an image.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Each photo must be 8 MB or smaller.");
      var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      var path = uid + "/chapchap/" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext;
      var up = await sb.storage.from("afrilink-marketing").upload(path, file, { upsert: false, contentType: file.type });
      if (up.error) throw up.error;
      var pub = sb.storage.from("afrilink-marketing").getPublicUrl(path);
      urls.push(pub.data.publicUrl);
      paths.push(path);
    }
    return { urls: urls, paths: paths };
  }

  async function submitListing() {
    var status = document.getElementById("ioneCcSellStatus");
    var btn = document.getElementById("ioneCcSellSubmit");
    var createdProductId = null;
    try {
      btn.disabled = true;
      status.textContent = "Checking secure session…";
      var session = await getSession();
      var name = fieldValue("ioneCcSellerName");
      var phone = normalizePhone(fieldValue("ioneCcSellerPhone"));
      var email = fieldValue("ioneCcSellerEmail");
      var address = fieldValue("ioneCcSellerAddress");
      var sellerLocation = fieldValue("ioneCcSellerLocation");
      var category = fieldValue("ioneCcCategory");
      var title = fieldValue("ioneCcTitle");
      var price = parsePrice(fieldValue("ioneCcPrice"));
      var currency = fieldValue("ioneCcCurrency") || "TZS";
      var productLocation = fieldValue("ioneCcLocation");
      var description = fieldValue("ioneCcDescription");
      var terms = document.getElementById("ioneCcTerms");
      if (!String(name).replace(/\s/g, "")) throw new Error("Enter your full name.");
      if (!validInternationalPhone(phone)) throw new Error("Enter a valid call number with country code, for example +255712345678.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) throw new Error("Enter a valid email address.");
      if (!String(address).replace(/\s/g, "")) throw new Error("Enter your full address.");
      if (!String(sellerLocation).replace(/\s/g, "")) throw new Error("Enter your location.");
      if (!String(title).replace(/\s/g, "")) throw new Error("Enter the product name.");
      if (!Number.isFinite(price) || price <= 0) throw new Error("Enter a valid price.");
      if (!String(productLocation).replace(/\s/g, "")) throw new Error("Enter the product location.");
      if (!terms || !terms.checked) throw new Error("You must accept the ChapChap Terms & Conditions before publishing.");
      var tagColor = fieldValue("ioneCcTagColor") || "#ffe600";
      var files = window.ioneChapSelectedFiles || [];
      if (!files.length) throw new Error("Add at least one product photo.");
      status.textContent = "Uploading product photos…";
      var media = await uploadImages(session.user.id, files);
      var attrs = {};
      (smartFields[category] || smartFields.other).forEach(function (spec) {
        var el = document.getElementById("ioneCc_attr_" + spec[0]);
        var value = fieldValue("ioneCc_attr_" + spec[0]);
        if (value) attrs[spec[0]] = value;
      });
      status.textContent = "Publishing product…";
      var sb = getSupabase();
      var paymentTzs = currency === "USD" ? Math.round(price * 2656.35) : Math.round(price);
      var result = await sb.from("ione_single_products").insert({
        seller_id: session.user.id,
        seller_name: name,
        seller_phone: phone,
        category: category,
        title: title,
        price_tzs: paymentTzs,
        price_amount: price,
        price_currency: currency,
        price_tag_color: tagColor,
        location: productLocation,
        description: description,
        attributes: attrs,
        image_urls: media.urls,
        image_paths: media.paths,
        status: "active"
      }).select("id").single();
      if (result.error) throw result.error;
      createdProductId = result.data.id;
      status.textContent = "Recording seller agreement…";
      var agreement = await sb.from("ione_chapchap_seller_agreements").insert({
        seller_id: session.user.id,
        product_id: createdProductId,
        seller_name: name,
        seller_phone: phone,
        seller_email: email,
        seller_address: address,
        seller_location: sellerLocation,
        terms_version: "1.0",
        accepted_at: new Date().toISOString()
      }).select("id").single();
      if (agreement.error) {
        await sb.from("ione_single_products").delete().eq("id", createdProductId).eq("seller_id", session.user.id);
        createdProductId = null;
        throw new Error("The seller agreement could not be recorded. Your product was not published.");
      }
      status.textContent = "LIVE • Seller agreement recorded • 1% ChapChap fee disclosed.";
      await loadProducts();
      setTimeout(closeOverlay, 900);
    } catch (err) {
      console.error("ChapChap listing:", err);
      if (status) status.textContent = err && err.message ? err.message : "Could not publish product.";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderRail(rows) {
    var rail = document.getElementById("ioneChapRail");
    if (!rail) return;
    if (!rows.length) {
      rail.innerHTML = '<div class="ione-chap-empty">NO LIVE CHAPCHAP PRODUCTS YET • BE THE FIRST TO SELL</div>';
      return;
    }
    rail.innerHTML = rows.map(function (p) {
      var images = Array.isArray(p.image_urls) ? p.image_urls : [];
      var image = images[0] || "";
      var currency = p.price_currency || "TZS";
      var displayAmount = p.price_amount != null ? p.price_amount : p.price_tzs;
      var tagColor = p.price_tag_color || "#ffe600";
      var pending = String(p.status || "") === "pending_payment";
      return '<article class="ione-chap-card" data-id="' + esc(p.id) + '">' +
        '<div class="ione-chap-photo">' +
        (image ? '<img src="' + esc(image) + '" alt="' + esc(p.title) + '" loading="lazy">' : "") +
        '<span class="ione-chap-price" style="background:' + esc(tagColor) + '">' + esc(money(displayAmount, currency)) + "</span>" +
        '</div><div class="ione-chap-info">' +
        '<div class="ione-chap-title">' + esc(p.title) + "</div>" +
        '<div class="ione-chap-seller">' + esc(p.seller_name) + "</div>" +
        '<div class="ione-chap-location">' + esc(p.location) + " • " + esc(String(p.category || "").toUpperCase()) + "</div>" +
        "</div></article>";
    }).join("");
    Array.prototype.forEach.call(rail.querySelectorAll(".ione-chap-card"), function (card) {
      card.addEventListener("click", function () { openProduct(card.getAttribute("data-id")); });
    if (!rail._ioneSwipeReady) {
      rail._ioneSwipeReady = true;
      var drag = {on:false,x:0,left:0,moved:false};
      rail.addEventListener("pointerdown", function(e){ if (e.pointerType === "mouse" && e.button !== 0) return; drag.on=true; drag.x=e.clientX; drag.left=rail.scrollLeft; drag.moved=false; }, {passive:true});
      rail.addEventListener("pointermove", function(e){ if (!drag.on) return; var dx=e.clientX-drag.x; if (Math.abs(dx)>5) drag.moved=true; if (drag.moved) rail.scrollLeft=drag.left-dx; }, {passive:true});
      rail.addEventListener("pointerup", function(){drag.on=false;},{passive:true});
      rail.addEventListener("pointercancel", function(){drag.on=false;},{passive:true});
    }
    });
  }

  async function loadProducts() {
    var sb = getSupabase();
    var rail = document.getElementById("ioneChapRail");
    if (!sb || !rail) return;
    try {
      var result = await sb.from("ione_single_products")
        .select("id,seller_id,seller_name,seller_phone,category,title,price_tzs,price_amount,price_currency,price_tag_color,location,description,attributes,image_urls,status,created_at")
        .in("status", ["active","pending_payment"])
        .order("created_at", { ascending: false })
        .limit(30);
      if (result.error) throw result.error;
      productCache = result.data || [];
      renderRail(productCache);
      var st = document.getElementById("ioneChapStatus");
      if (st) st.textContent = "";
    } catch (err) {
      console.warn("ChapChap feed:", err);
      rail.innerHTML = '<div class="ione-chap-empty">CHAPCHAP IS TEMPORARILY UNAVAILABLE</div>';
    }
  }

  function getProduct(id) {
    return productCache.find(function (p) { return String(p.id) === String(id); });
  }

  function openProduct(id) {
    var p = getProduct(id);
    if (!p) return;
    var images = Array.isArray(p.image_urls) ? p.image_urls.filter(Boolean) : [];
    var currency = p.price_currency || "TZS";
    var displayAmount = p.price_amount != null ? p.price_amount : p.price_tzs;
    var tagColor = p.price_tag_color || "#ffe600";
    var attrs = p.attributes && typeof p.attributes === "object" ? p.attributes : {};
    var attrMarkup = Object.keys(attrs).filter(function(k){ return String(attrs[k] || "").trim(); }).map(function(k){
      return '<div style="padding:7px 9px;border:1px solid rgba(255,255,255,.1);border-radius:8px"><strong>' + esc(k) + '</strong><br><span>' + esc(attrs[k]) + '</span></div>';
    }).join("");
    var imageMarkup = images.length ? '<div class="cc-gallery" id="ioneCcGalleryView">' +
      images.map(function (url, index) { return '<img class="cc-gallery-img" src="' + esc(url) + '" alt="" style="opacity:' + (index === 0 ? "1" : "0") + ';position:' + (index === 0 ? "relative" : "absolute") + '">'; }).join("") +
      '</div>' : '<div class="cc-gallery"></div>';
    openOverlay("BUY • " + p.title, "CHAPCHAP • BUYER",
      imageMarkup +
      '<div class="cc-product-preview" style="grid-template-columns:1fr">' +
      '<div><h3>' + esc(p.title) + '</h3><p><span style="display:inline-block;padding:6px 9px;border-radius:8px;background:' + esc(tagColor) + ';color:#111;font-weight:900">' + esc(money(displayAmount, currency)) + '</span></p><p>' + esc(p.seller_name) + " • " + esc(p.location) + '</p></div>' +
      "</div>" +
      '<div class="cc-grid">' +
      '<div class="cc-field"><label>PRODUCT DETAILS</label><div style="color:#d7e5e8;font-size:11px;line-height:1.5">' + esc(p.description || "Product listed on I|ONE ChapChap.") + '</div>' + (attrMarkup ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px;font-size:10px;color:#9eb0b5">' + attrMarkup + '</div>' : '') + '</div>' +
      '<div class="cc-actions" style="grid-template-columns:1fr 1fr"><a class="cc-secondary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="tel:+' + esc(normalizePhone(p.seller_phone)) + '">CALL SELLER</a><a class="cc-secondary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/' + esc(normalizePhone(p.seller_phone)) + '">CHAT SELLER</a></div>' +
      '<div class="cc-field"><label>BUYER FULL NAME</label><input id="ioneCcBuyerName" maxlength="100" placeholder="Your full name"></div>' +
      '<div class="cc-field"><label>FULL ADDRESS</label><textarea id="ioneCcBuyerAddress" maxlength="240" placeholder="Your full address"></textarea></div>' +
      '<div class="cc-field"><label>EMAIL</label><input id="ioneCcBuyerEmail" type="email" maxlength="160" placeholder="you@example.com"></div>' +
      '<div class="cc-field"><label>CONTACT</label><input id="ioneCcBuyerContact" class="cc-phone" inputmode="tel" maxlength="16" placeholder="+255712345678"></div>' +
      '<div class="cc-field"><label>BLMPAY MOBILE NUMBER</label><input id="ioneCcBuyerPhone" class="cc-phone" inputmode="tel" maxlength="16" placeholder="+255712345678"></div>' +
      '<div class="cc-field" style="border:1px solid rgba(255,230,0,.28);border-radius:12px;padding:12px;background:rgba(255,230,0,.035)">' +
      '<strong style="font-size:12px">BEFORE YOU PAY</strong><div style="font-size:11px;line-height:1.55;color:#d7e5e8;margin-top:7px">Contact the seller first. Confirm the seller is available, confirm where the seller is, confirm the product is physically available, and agree how and where you will receive it. Your official receipt is important. After receiving the product, immediately inform I|ONE Care by phone, WhatsApp or email.</div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:11px;line-height:1.4"><input id="ioneCcBuyerConfirm" type="checkbox" style="margin-top:2px"> <span>I have contacted/confirmed the seller and understand the receipt and I|ONE Care instructions.</span></label>' +
      '</div>' +
      '<div class="cc-actions"><button id="ioneCcBuyCancel" class="cc-secondary" type="button">CANCEL</button><button id="ioneCcBuySubmit" class="cc-primary" type="button">CONFIRM PAYMENT</button></div>' +
      '<div id="ioneCcBuyStatus" class="cc-status">ChapChap platform fee: 1%. BLMPay processing fees are separate where applicable.</div>' +
      "</div>"
    );
    document.getElementById("ioneCcBuyCancel").addEventListener("click", closeOverlay);
    document.getElementById("ioneCcBuySubmit").addEventListener("click", function () { startPayment(p); });
    startGalleryLoop();
  }

  async function confirmReceived(orderId) {
    var status = document.getElementById("ioneCcBuyStatus");
    var button = document.getElementById("ioneCcReceivedBtn");
    if (button) button.disabled = true;
    try {
      var session = await getSession();
      var sb = getSupabase();
      var result = await sb.functions.invoke("ione-chapchap-payment", {
        body: { action: "received", order_id: orderId, product_id: "" }
      });
      var message = result.data && result.data.error ? result.data.error : "";
      if (!message && result.error && result.error.context) {
        try {
          var errorPayload = await result.error.context.json();
          message = errorPayload && (errorPayload.error || errorPayload.message) ? (errorPayload.error || errorPayload.message) : "";
        } catch (_) {}
      }
      if (result.error || !result.data || !result.data.success) throw new Error(message || (result.error && result.error.message) || "Could not confirm product receipt.");
      if (status) {
        status.innerHTML = '<div style="padding:14px;border:1px solid rgba(0,255,255,.35);border-radius:14px;background:rgba(0,255,255,.035);text-align:center"><strong style="display:block;color:#00ffff;font-size:16px">RECEIPT CONFIRMED</strong><div style="margin-top:8px;font-size:11px;line-height:1.5">I|ONE has recorded that you received the product. Authority Press can now handle the seller payout manually.</div><button id="ioneCcReceiptClose" class="cc-primary" type="button" style="width:100%;margin-top:12px">DONE</button></div>';
        var done=document.getElementById("ioneCcReceiptClose");
        if(done)done.addEventListener("click",closeOverlay);
      }
    } catch (err) {
      if (status) status.textContent = err && err.message ? err.message : "Could not confirm product receipt.";
      if (button) button.disabled = false;
    }
  }

  function printReceipt(r) {
    var w = window.open("", "_blank", "noopener,noreferrer,width=520,height=760");
    if (!w) { alert("Please allow pop-ups to print the receipt."); return; }
    var html = '<!doctype html><html><head><title>I|ONE ChapChap Receipt</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px}p{line-height:1.5}.line{border-top:1px solid #ccc;margin:14px 0;padding-top:10px}</style></head><body><h1>I|ONE CHAPCHAP — OFFICIAL RECEIPT</h1><p><strong>Receipt:</strong> '+esc(r.receipt_number)+'</p><p><strong>Product:</strong> '+esc(r.product_title)+'</p><p><strong>Product price:</strong> '+esc(money(r.amount_tzs))+'</p><p><strong>ChapChap platform fee (1%):</strong> '+esc(money(r.chapchap_fee_tzs))+'</p><p><strong>BLMPay mobile-money fee (3%):</strong> '+esc(money(r.blmpay_payment_fee_tzs||0))+'</p><p><strong>Seller balance after transaction fees:</strong> '+esc(money(r.seller_available_tzs||0))+'</p><p><strong>BLMPay reference:</strong> '+esc(r.blmpay_reference||"—")+'</p><p><strong>Paid:</strong> '+esc(new Date(r.paid_at).toLocaleString())+'</p><div class="line"><strong>I|ONE Care</strong><br>+255 742 097 868<br>ione.customercare.africa@gmail.com</div><p>After receiving the product, immediately inform I|ONE Care.</p><script>window.onload=function(){setTimeout(function(){window.print()},250)};</script></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }

  async function showReceipt(orderId, attempt) {
    var status = document.getElementById("ioneCcBuyStatus");
    attempt = Number(attempt || 0);
    try {
      var sb = getSupabase();
      var result = await sb.from("ione_chapchap_receipts").select("*").eq("order_id", orderId).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        if (attempt < 5) {
          if (status) status.textContent = "PAYMENT CONFIRMED • PREPARING YOUR OFFICIAL RECEIPT…";
          setTimeout(function(){ showReceipt(orderId, attempt + 1); }, 2000);
          return;
        }
        if (status) status.innerHTML = "PAYMENT CONFIRMED. Your official receipt is still being prepared." +
          '<br><button id="ioneCcReceiptRetry" class="cc-secondary" type="button" style="margin-top:8px;width:100%">CHECK RECEIPT AGAIN</button>';
        var retryReceipt=document.getElementById("ioneCcReceiptRetry");
        if(retryReceipt)retryReceipt.addEventListener("click",function(){showReceipt(orderId,0);});
        return;
      }
      var r = result.data;
      try{
        localStorage.setItem("ione_chapchap_last_receipt",JSON.stringify(r));
        localStorage.setItem("ione_chapchap_last_paid_order",String(orderId));
        var paidOrders=JSON.parse(localStorage.getItem("ione_chapchap_paid_orders")||"[]");
        if(!Array.isArray(paidOrders))paidOrders=[];
        paidOrders.unshift(String(orderId));
        localStorage.setItem("ione_chapchap_paid_orders",JSON.stringify([...new Set(paidOrders)].slice(0,50)));
        var cachedReceipts=JSON.parse(localStorage.getItem("ione_chapchap_receipts_cache")||"[]");
        if(!Array.isArray(cachedReceipts))cachedReceipts=[];
        cachedReceipts.unshift(r);
        var receiptMap={};cachedReceipts.forEach(function(x){if(x&&x.order_id)receiptMap[String(x.order_id)]=x;});
        localStorage.setItem("ione_chapchap_receipts_cache",JSON.stringify(Object.values(receiptMap).slice(0,50)));
      }catch(e){}
      if (status) status.innerHTML =
        '<div style="padding:14px;border:1px solid rgba(0,255,255,.3);border-radius:14px;background:rgba(0,255,255,.035);text-align:left">' +
        '<strong style="display:block;font-size:16px;color:#00ffff">OFFICIAL CHAPCHAP RECEIPT</strong>' +
        '<div style="margin-top:8px;font-size:12px;line-height:1.6">' +
        '<strong>' + esc(r.receipt_number) + '</strong><br>' +
        'Product: ' + esc(r.product_title) + '<br>' +
        'Product price: ' + esc(money(r.amount_tzs)) + '<br>' +
        'ChapChap platform fee (1%): ' + esc(money(r.chapchap_fee_tzs)) + '<br>' +
        'BLMPay mobile-money fee (3%): ' + esc(money(r.blmpay_payment_fee_tzs || 0)) + '<br>' +
        'Seller balance after transaction fees: ' + esc(money(r.seller_available_tzs || 0)) + '<br>' +
        'BLMPay reference: ' + esc(r.blmpay_reference || "—") + '<br>' +
        'Paid: ' + esc(new Date(r.paid_at).toLocaleString()) +
        '</div>' +
        '<div style="margin-top:10px;font-size:11px;line-height:1.55">After receiving the product, immediately contact I|ONE Care: <a href="tel:+255742097868">+255 742 097 868</a> • <a href="mailto:ione.customercare.africa@gmail.com">ione.customercare.africa@gmail.com</a>.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><button id="ioneCcViewReceipt" class="cc-primary" type="button" style="min-height:45px;border:1px solid #00ffff;background:linear-gradient(145deg,#18ffff,#008f8f);color:#001010;border-radius:11px;font:900 10px Arial,sans-serif;letter-spacing:.6px;box-shadow:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent">VIEW RECEIPT</button><button id="ioneCcReceivedBtn" class="cc-secondary" type="button">I RECEIVED THE PRODUCT</button></div>' +
        '</div>';
      var view=document.getElementById("ioneCcViewReceipt");
      if(view)view.addEventListener("click",function(e){
        e.preventDefault();
        e.stopPropagation();
        try{localStorage.setItem("ione_chapchap_last_receipt",JSON.stringify(r));}catch(e){}
        if(window.ioneChapChapOpenStandaloneReceipt){window.ioneChapChapOpenStandaloneReceipt(r);return;}
        var saved=document.getElementById("ioneChapSavedReceiptBtn");
        if(saved){saved.click();return;}
        alert("Your official receipt is ready. Please use VIEW RECEIPT again.");
      });
      var received=document.getElementById("ioneCcReceivedBtn");
      if(received)received.addEventListener("click",function(){confirmReceived(orderId);});
    } catch(err) {
      if(status)status.textContent="Payment confirmed, but the receipt could not be loaded yet. Please check again shortly.";
    }
  }

  var galleryTimer = null;

  function startGalleryLoop() {
    if (galleryTimer) clearInterval(galleryTimer);
    var gallery = document.getElementById("ioneCcGalleryView");
    if (!gallery) return;
    var imgs = Array.prototype.slice.call(gallery.querySelectorAll(".cc-gallery-img"));
    if (imgs.length < 2) return;
    var current = 0;
    galleryTimer = setInterval(function () {
      var next = (current + 1) % imgs.length;
      imgs[next].style.position = "absolute";
      imgs[next].style.opacity = "0";
      imgs[next].style.transition = "opacity .8s ease";
      imgs[current].style.transition = "opacity .8s ease";
      imgs[next].style.opacity = "1";
      imgs[current].style.opacity = "0";
      current = next;
    }, 3200);
  }

  async function reconcilePayment(product) {
    var status = document.getElementById("ioneCcBuyStatus");
    var btn = document.getElementById("ioneCcBuySubmit");
    try {
      if (btn) btn.disabled = true;
      if (status) status.textContent = "Checking BLMPay payment status…";
      var session = await getSession();
      var sb = getSupabase();
      var result = await sb.functions.invoke("ione-chapchap-payment", {
        body: { action: "reconcile", product_id: product.id }
      });
      var message = result.data && result.data.error ? result.data.error : "";
      if (!message && result.error && result.error.context) {
        try {
          var errorPayload = await result.error.context.json();
          message = errorPayload && (errorPayload.error || errorPayload.message) ? (errorPayload.error || errorPayload.message) : "";
        } catch (errorRead) {}
      }
      if (result.error || !result.data || !result.data.success) {
        if (status) {
          status.innerHTML = esc(message || "BLMPay is still processing this payment.") +
            '<br><button id="ioneCcCheckAgain" class="cc-secondary" type="button" style="margin-top:8px;width:100%">CHECK PAYMENT STATUS</button>';
          var again = document.getElementById("ioneCcCheckAgain");
          if (again) again.addEventListener("click", function () { reconcilePayment(product); });
        }
        return;
      }
      if (result.data.status === "released") {
        if (status) status.textContent = result.data.message || "Previous payment was cancelled. You can try again now.";
        if (btn) btn.disabled = false;
        await loadProducts();
        return;
      }
      if (result.data.status === "paid") {
        try{localStorage.setItem("ione_chapchap_last_paid_order",String(result.data.order_id||""));}catch(e){}
        if (status) status.innerHTML = "PAYMENT CONFIRMED • PRODUCT SOLD.<br><a class=\"cc-call\" href=\"tel:+" + esc(normalizePhone(product.seller_phone)) + "\">CALL SELLER • " + esc(product.seller_phone) + "</a>";
        await loadProducts();
        await showReceipt(result.data.order_id || product.id);
        return;
      }
    } catch (err) {
      console.warn("ChapChap payment reconciliation:", err);
      if (status) status.innerHTML = esc(err && err.message ? err.message : "Could not check payment status.") +
        '<br><button id="ioneCcCheckAgain" class="cc-secondary" type="button" style="margin-top:8px;width:100%">CHECK PAYMENT STATUS</button>';
      var retry = document.getElementById("ioneCcCheckAgain");
      if (retry) retry.addEventListener("click", function () { reconcilePayment(product); });
    } finally {
      if (btn && !status?.textContent?.toLowerCase().includes("confirmed")) btn.disabled = false;
    }
  }

  async function startPayment(product) {
    var status = document.getElementById("ioneCcBuyStatus");
    var btn = document.getElementById("ioneCcBuySubmit");
    try {
      btn.disabled = true;
      var phone = normalizePhone(fieldValue("ioneCcBuyerPhone"));
      var buyerName = fieldValue("ioneCcBuyerName");
      var buyerAddress = fieldValue("ioneCcBuyerAddress");
      var buyerEmail = fieldValue("ioneCcBuyerEmail").trim();
      var buyerEmailInput = document.getElementById("ioneCcBuyerEmail");
      if (buyerEmailInput) buyerEmailInput.value = buyerEmail;
      var buyerContact = normalizePhone(fieldValue("ioneCcBuyerContact"));
      var buyerConfirm = document.getElementById("ioneCcBuyerConfirm");
      if (!String(buyerName).replace(/\s/g, "")) throw new Error("Enter your full name.");
      if (!String(buyerAddress).replace(/\s/g, "")) throw new Error("Enter your full address.");
      if (!buyerEmail || buyerEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) throw new Error("Enter a valid email address.");
      if (!validPhone(buyerContact)) throw new Error("Enter a valid contact number beginning +255.");
      if (!validPhone(phone)) throw new Error("For BLMPay, enter a Tanzanian number beginning +255.");
      if (!buyerConfirm || !buyerConfirm.checked) throw new Error("Please confirm that you contacted the seller and understand the receipt and I|ONE Care instructions.");
      if (!validPhone(phone)) throw new Error("For the current BLMPay mobile prompt, enter a Tanzanian number beginning +255.");
      var session = await getSession();
      status.textContent = "Sending payment request…";
      var sb = getSupabase();
      var result = await sb.functions.invoke("ione-chapchap-payment", { body: { product_id: product.id, phone_number: phone, buyer_full_name: buyerName, buyer_address: buyerAddress, buyer_email: buyerEmail, buyer_contact: buyerContact } });
      if (result.error || !result.data || !result.data.success) {
        var backendMessage = result.data && result.data.error ? result.data.error : "";
        if (!backendMessage && result.error && result.error.context) {
          try {
            var errorPayload = await result.error.context.json();
            backendMessage = errorPayload && (errorPayload.error || errorPayload.message) ? (errorPayload.error || errorPayload.message) : "";
          } catch (errorRead) {}
        }
        throw new Error(backendMessage || (result.error && result.error.message) || "Payment could not be started.");
      }
      var orderId = result.data.order_id;
      try{
        localStorage.setItem("ione_chapchap_buyer_identity",JSON.stringify({
          buyer_full_name:buyerName,
          buyer_email:buyerEmail,
          buyer_contact:buyerContact
        }));
        var paidOrders=JSON.parse(localStorage.getItem("ione_chapchap_paid_orders")||"[]");
        if(!Array.isArray(paidOrders))paidOrders=[];
        paidOrders.unshift(String(orderId));
        localStorage.setItem("ione_chapchap_paid_orders",JSON.stringify([...new Set(paidOrders)].slice(0,50)));
      }catch(e){}
      status.textContent = "Payment prompt sent. Enter your PIN on your phone. Waiting for confirmation…";
      await waitForPayment(orderId, product, phone);
    } catch (err) {
      console.error("ChapChap payment:", err);
      var msg = err && err.message ? err.message : "Payment could not be started.";
      if (status && /previous payment is still in progress|already reserved for a payment attempt/i.test(msg)) {
        status.innerHTML = esc(msg) +
          '<br><button id="ioneCcCheckAgain" class="cc-secondary" type="button" style="margin-top:8px;width:100%">CHECK PAYMENT STATUS</button>';
        var check = document.getElementById("ioneCcCheckAgain");
        if (check) check.addEventListener("click", function () { reconcilePayment(product); });
      } else if (status) {
        status.textContent = msg;
      }
      if (btn) btn.disabled = false;
    }
  }

  async function waitForPayment(orderId, product, buyerPhone) {
    var sb = getSupabase();
    var status = document.getElementById("ioneCcBuyStatus");
    var startedAt = Date.now();
    if (pollTimer) clearInterval(pollTimer);
    var attempts = 0;
    await new Promise(function (resolve) {
      pollTimer = setInterval(async function () {
        attempts++;
        try {
          var r = await sb.from("ione_chapchap_orders")
            .select("id,status,paid_at,blmpay_reference")
            .eq("id", orderId)
            .maybeSingle();
          if (r.error) throw r.error;
          if (r.data && r.data.status === "paid") {
            try{localStorage.setItem("ione_chapchap_last_paid_order",String(r.data.id||orderId));}catch(e){}
            clearInterval(pollTimer); pollTimer = null;
            status.innerHTML = "PAYMENT CONFIRMED • PRODUCT SOLD.<br><a class=\"cc-call\" href=\"tel:+" + esc(normalizePhone(product.seller_phone)) + "\">CALL SELLER • " + esc(product.seller_phone) + "</a>";
            await loadProducts();
            await showReceipt(orderId);
            resolve();
            return;
          }
          if (r.data && ["failed","expired","cancelled"].indexOf(r.data.status) >= 0) {
            clearInterval(pollTimer); pollTimer = null;
            status.textContent = "Payment was not completed. The product is available again.";
            document.getElementById("ioneCcBuySubmit").disabled = false;
            resolve();
            return;
          }
          if (Date.now() - startedAt > 130000 || attempts > 43) {
            clearInterval(pollTimer); pollTimer = null;
            status.innerHTML = "Still waiting for the payment result. If you completed the PIN, wait a little and refresh ChapChap.<br><a class=\"cc-call\" href=\"tel:+" + esc(normalizePhone(product.seller_phone)) + "\">CALL SELLER</a>";
            document.getElementById("ioneCcBuySubmit").disabled = false;
            resolve();
          } else {
            status.textContent = "Waiting for payment confirmation…";
          }
        } catch (err) {
          console.warn("ChapChap payment check:", err);
          if (Date.now() - startedAt > 130000) {
            clearInterval(pollTimer); pollTimer = null;
            status.textContent = "Payment confirmation is taking longer than expected. Please check your mobile-money message.";
            document.getElementById("ioneCcBuySubmit").disabled = false;
            resolve();
          }
        }
      }, 3000);
    });
  }

  async function revokeChapChapProduct(productId){
    try{
      if(!confirm("CONFIRM REVOKE\n\nThis will remove your product from the ChapChap marketplace.\n\nPress OK to revoke or Cancel to keep it listed.")) return;
      var sb=getSupabase(),session=await getSession(),now=new Date().toISOString();
      var result=await sb.from("ione_single_products").update({status:"revoked",revoked_at:now,updated_at:now}).eq("id",productId).eq("seller_id",session.user.id).eq("status","active").select("id").maybeSingle();
      if(result.error) throw result.error;
      if(!result.data) throw new Error("This product is no longer available to revoke.");
      await loadProducts(); openMine();
    }catch(err){alert(err?.message||"Could not revoke this product.");}
  }

  async function openMine() {
    try {
      var session=await getSession(), sb=getSupabase();
      var ordersResult=await sb.from("ione_chapchap_orders").select("id,product_id,buyer_full_name,buyer_phone,buyer_contact,buyer_email,buyer_address,amount_tzs,commission_tzs,seller_net_tzs,status,blmpay_reference,created_at,paid_at,received_confirmed_at,payout_status,payout_reference").eq("seller_id",session.user.id).in("status",["paid","received","disputed"]).order("created_at",{ascending:false}).limit(50);
      if(ordersResult.error) throw ordersResult.error;
      var sales=ordersResult.data||[], ids=sales.map(function(o){return o.id;}), receipts=[];
      if(ids.length){var rr=await sb.from("ione_chapchap_receipts").select("*").in("order_id",ids);if(rr.error)throw rr.error;receipts=rr.data||[];}
      var receiptMap={};receipts.forEach(function(r){receiptMap[String(r.order_id)]=r;});
      var productsResult=await sb.from("ione_single_products").select("id,title,price_tzs,price_amount,price_currency,status,created_at").eq("seller_id",session.user.id).in("status",["active","pending_payment","sold"]).order("created_at",{ascending:false}).limit(50);
      if(productsResult.error)throw productsResult.error;
      var products=productsResult.data||[],body='<div class="cc-list">';
      if(sales.length){
        body+='<div class="cc-kicker">YOUR SALES</div>'+sales.map(function(o){var r=receiptMap[String(o.id)];return '<div class="cc-list-item"><strong>SALE • '+esc(String(o.status||"PAID").toUpperCase())+'</strong><span>'+esc(money(o.amount_tzs))+' • '+esc(new Date(o.created_at).toLocaleString())+'<br>CLIENT: '+esc(o.buyer_full_name||r?.buyer_full_name||"—")+'<br>PHONE: '+esc(o.buyer_phone||o.buyer_contact||r?.buyer_contact||"—")+'<br>EMAIL: '+esc(o.buyer_email||r?.buyer_email||"—")+'<br>ADDRESS: '+esc(o.buyer_address||r?.buyer_address||"—")+'</span>'+(r?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px"><button type="button" class="cc-primary" data-mine-view="'+esc(o.id)+'">VIEW RECEIPT</button><button type="button" class="cc-secondary" data-mine-download="'+esc(o.id)+'">DOWNLOAD</button></div>':'<span>Receipt is being prepared.</span>')+'</div>';}).join("");
      }else body+='<div class="cc-list-item"><strong>NO SALES YET</strong><span>Your paid ChapChap sales will appear here. This area is private to your seller account.</span></div>';
      body+='<div class="cc-kicker" style="margin-top:14px">YOUR PRODUCTS</div>';
      if(products.length) body+=products.map(function(p){var price=p.price_amount!=null?p.price_amount:p.price_tzs;var action=p.status==="active"?'<button type="button" class="cc-secondary" data-revoke-product="'+esc(p.id)+'" style="width:100%;margin-top:8px;min-height:40px">REVOKE PRODUCT</button>':'<span>STATUS: '+esc(String(p.status||"").toUpperCase())+'</span>';return '<div class="cc-list-item"><strong>'+esc(p.title||"ChapChap product")+'</strong><span>'+esc(money(price,p.price_currency||"TZS"))+' • STATUS: '+esc(String(p.status||"").toUpperCase())+'</span>'+action+'</div>';}).join("");
      else body+='<div class="cc-list-item"><strong>NO PRODUCTS</strong><span>Add your own ChapChap product from CHAPCHAP • BUY / SELL.</span></div>';
      body+='</div>'; openOverlay("MY CHAPCHAP","SELLER • PRIVATE ACCOUNT",body);
      document.querySelectorAll("[data-mine-view],[data-mine-download]").forEach(function(btn){btn.addEventListener("click",function(){var o=sales.find(function(x){return String(x.id)===String(btn.getAttribute("data-mine-view")||btn.getAttribute("data-mine-download"));});var r=o&&receiptMap[String(o.id)];if(!r)return;if(btn.hasAttribute("data-mine-download"))window.ioneChapChapDownloadReceipt?.(r);else window.ioneChapChapOpenStandaloneReceipt?.(r);});});
      document.querySelectorAll("[data-revoke-product]").forEach(function(btn){btn.addEventListener("click",function(){revokeChapChapProduct(btn.getAttribute("data-revoke-product"));});});
    }catch(err){openOverlay("MY CHAPCHAP","SELLER • PRIVATE ACCOUNT",'<div class="cc-status">'+esc(err&&err.message?err.message:"Could not load your private ChapChap account.")+"</div>");}
  }

  async function initialize() {
    if (started) return;
    try {
      injectStyles();
      var discovery = document.querySelector("#afrilinkOverlay .afl-discovery");
      if (!discovery) return false;
      createDock();
      createOverlay();
      if (!document.getElementById("ioneChapDock")) return false;
      started = true;
      if (typeof ensureHeavensAnonymousSession === "function") ensureHeavensAnonymousSession().catch(function () {});
      await loadProducts();
      return true;
    } catch (err) {
      console.warn("ChapChap isolated module:", err);
      return false;
    }
  }

  function bootWhenReady() {
    var tryMount = function () {
      if (started) return;
      initialize();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryMount, { once: true });
    } else {
      tryMount();
    }
    var observer = new MutationObserver(function () {
      if (started) return;
      if (document.querySelector("#afrilinkOverlay .afl-discovery")) {
        tryMount();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { if (!started) tryMount(); }, 500);
    setTimeout(function () { if (!started) tryMount(); }, 1500);
    setTimeout(function () { if (!started) tryMount(); }, 3000);
  }


  /* Final readability polish: keep SEARCH and POST bright and legible. */
  try {
    var readable = document.createElement("style");
    readable.textContent = "#afrilinkOverlay .afl-discovery-row input{color:#fff!important;-webkit-text-fill-color:#fff!important;caret-color:#fff!important;text-shadow:0 1px 3px rgba(0,0,0,.95)!important;background:linear-gradient(135deg,#063a45,#1264a8)!important;border:2px solid rgba(255,255,255,.82)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 2px 5px rgba(0,0,0,.45)!important}" +
      "#afrilinkOverlay .afl-discovery-row input::placeholder{color:#fff!important;opacity:1!important;-webkit-text-fill-color:#fff!important;text-shadow:0 1px 3px rgba(0,0,0,.95)!important}" +
      "#afrilinkOverlay .afl-upload-top{color:#fff!important;-webkit-text-fill-color:#fff!important;text-shadow:0 2px 3px rgba(0,0,0,.95)!important;background:linear-gradient(135deg,#00eaff,#2375ff 55%,#8d4dff)!important;border:2px solid rgba(255,255,255,.9)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 3px 7px rgba(0,0,0,.42)!important}" +
      "#afrilinkOverlay .afl-upload-top:active{transform:translateY(2px)!important;filter:brightness(1.2)!important}";
    document.head.appendChild(readable);
  } catch (e) { console.warn("ChapChap readability polish:", e); }

  /* The existing marketing world is opened by I|ONE. We only mount inside it. */
  bootWhenReady();
  window.ioneChapChapRefresh = loadProducts;
  window.ioneChapChapOpen = openSell;
})();
/* ChapChap receipt module loader */
(function(){try{var s=document.createElement("script");s.src="chapchap-receipts.js?v=11";s.defer=true;document.head.appendChild(s);}catch(e){console.warn("ChapChap receipt module loader:",e);}})();


/* I|ONE SELLER-LEVEL AUTHORITY PAYOUT UI v1 */
(function(){
  "use strict";
  var payoutQuoteCache = {};
  var payoutBusy = false;

  function ccEsc(v){
    return String(v==null?"":v).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }
  function ccMoney(v){ return "TZS "+Number(v||0).toLocaleString("en-US"); }
  function ccStatus(msg){
    var el=document.getElementById("authorityChapChapLoadStatus");
    if(el) el.textContent=msg;
  }
  function ccPassword(){
    return String(document.getElementById("authorityPasswordInput")?.value||"").trim();
  }
  async function ccInvoke(body){
    var r=await heavensSupabase.functions.invoke("ione-chapchap-authority",{body:body});
    if(r.error || !r.data?.success){
      var detail=r.data?.error||r.error?.message||"Authority payout request failed.";
      try{
        var ctx=r.error?.context;
        if(ctx&&typeof ctx.json==="function"){
          var b=await ctx.json();
          detail=b?.error||b?.message||detail;
          if(b?.details) detail+=" • "+JSON.stringify(b.details);
        }
      }catch(_){}
      throw new Error(detail);
    }
    return r.data;
  }

  function installPayoutStyle(){
    if(document.getElementById("ioneSellerPayoutStyle")) return;
    var s=document.createElement("style");
    s.id="ioneSellerPayoutStyle";
    s.textContent=
      ".ione-seller-payout{border:1px solid #31545a;border-radius:16px;padding:13px;margin:9px 0;background:linear-gradient(145deg,#102327,#05090a);box-shadow:0 7px 20px rgba(0,0,0,.25)}"+
      ".ione-seller-payout h3{margin:0;color:#00ffff;font:900 15px Arial,sans-serif}"+
      ".ione-seller-payout .sp-meta{margin-top:5px;color:#9db1b5;font:700 9px/1.45 Arial,sans-serif}"+
      ".ione-seller-payout .sp-balance{margin:10px 0;padding:10px;border-radius:11px;background:#071719;border:1px solid #294349;color:#fff;font:900 15px Arial,sans-serif}"+
      ".ione-seller-payout .sp-balance small{display:block;color:#6f858a;font-size:8px;letter-spacing:1px;margin-bottom:4px}"+
      ".ione-seller-payout .sp-products{display:grid;gap:6px;margin:9px 0}"+
      ".ione-seller-payout .sp-product{padding:8px;border:1px solid #233b40;border-radius:9px;background:#071012;color:#d7e5e7;font:700 9px/1.35 Arial,sans-serif}"+
      ".ione-seller-payout .sp-product b{color:#fff;font-size:10px}"+
      ".ione-seller-payout .sp-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}"+
      ".ione-seller-payout input,.ione-seller-payout select{width:100%;box-sizing:border-box;min-height:42px;padding:9px;border:1px solid #31545a;border-radius:10px;background:#05090a;color:#fff;font:800 11px Arial,sans-serif;outline:none}"+
      ".ione-seller-payout input:focus,.ione-seller-payout select:focus{border-color:#00ffff}"+
      ".ione-seller-payout .sp-wide{grid-column:1/-1}"+
      ".ione-seller-payout button{width:100%;min-height:44px;margin-top:8px;border-radius:11px;border:1px solid #00ffff;background:linear-gradient(145deg,#18ffff,#008f8f);color:#001010;font:900 10px Arial,sans-serif;cursor:pointer}"+
      ".ione-seller-payout button.sp-send{background:linear-gradient(145deg,#ffe600,#ff9b00);border-color:#ffe600}"+
      ".ione-seller-payout button:disabled{opacity:.55;cursor:wait}"+
      ".ione-seller-payout .sp-quote{margin-top:9px;padding:10px;border-radius:11px;background:#071719;border:1px solid #00ffff;color:#dffeff;font:800 10px/1.55 Arial,sans-serif}"+
      ".ione-seller-payout .sp-quote b{color:#fff}"+
      ".ione-payout-history{margin-top:14px;border-top:1px solid #20383d;padding-top:10px}";
    document.head.appendChild(s);
  }

  function sellerCard(g){
    var sid=ccEsc(g.seller_id||"");
    var products=g.products||[];
    var rows=products.map(function(p){
      return '<div class="sp-product"><b>'+ccEsc(p.title||"PRODUCT")+'</b><br>'+
        'SALE: '+ccMoney(p.amount_tzs)+' • SELLER BALANCE: '+ccMoney(p.seller_available_tzs)+'</div>';
    }).join("");
    return '<div class="ione-seller-payout" data-seller-payout="'+sid+'">'+
      '<h3>'+ccEsc(g.seller_name||"SELLER")+'</h3>'+
      '<div class="sp-meta">SELLER ACCOUNT • '+ccEsc(g.seller_phone||"NUMBER NOT ON FILE")+'<br>'+
      'PRODUCTS WITH UNPAID BALANCE: '+products.length+'</div>'+
      '<div class="sp-balance"><small>COMBINED SELLER BALANCE</small>'+ccMoney(g.seller_balance_tzs)+'</div>'+
      '<div class="sp-products">'+rows+'</div>'+
      '<div class="sp-fields">'+
        '<input class="sp-name" value="'+ccEsc(g.seller_name||"")+'" placeholder="Seller name" autocomplete="name">'+
        '<input class="sp-phone" value="'+ccEsc(g.seller_phone||"")+'" inputmode="tel" placeholder="Seller phone" autocomplete="tel">'+
        '<select class="sp-network sp-wide">'+
          '<option value="">SELECT MOBILE NETWORK</option>'+
          '<option value="MPESA">MPESA</option>'+
          '<option value="AIRTEL_MONEY">AIRTEL MONEY</option>'+
          '<option value="MIXX_BY_YAS">MIXX BY YAS</option>'+
          '<option value="HALOPESA">HALOPESA</option>'+
          '<option value="EZYPESA">EZYPESA</option>'+
          '<option value="TTCLPESA">TTCL PESA</option>'+
        '</select>'+
      '</div>'+
      '<button type="button" class="sp-calculate">CALCULATE PAYOUT FEE</button>'+
      '<div class="sp-result"></div>'+
    '</div>';
  }

  function historyHtml(items){
    if(!items||!items.length) return "";
    return '<div class="ione-payout-history"><div class="cc-kicker">RECENT SELLER PAYOUTS</div>'+
      items.slice(0,10).map(function(p){
        return '<div class="cc-list-item"><strong>'+ccEsc(p.seller_name||"SELLER")+' • '+ccEsc(String(p.status||"").toUpperCase())+
          '</strong><span>RECEIVES: '+ccMoney(p.payout_amount_tzs)+' • FEE: '+ccMoney(p.blmpay_fee_tzs)+
          '<br>DEBIT: '+ccMoney(p.total_debit_tzs)+' • NUMBER: '+ccEsc(p.recipient_phone||"—")+
          '<br>BLMPay: '+ccEsc(p.blmpay_reference||"—")+'</span></div>';
      }).join("")+'</div>';
  }

  async function renderSellerPayouts(){
    var list=document.getElementById("authorityChapChapOrders");
    if(!list) return;
    var password=ccPassword();
    if(!password){ccStatus("Unlock Authority Press first.");return;}
    installPayoutStyle();
    ccStatus("Loading seller payout balances…");
    list.innerHTML='<div class="authority-chapchap-order"><strong>LOADING SELLER BALANCES…</strong><div class="cc-mini">Combining all unpaid product balances seller-by-seller.</div></div>';
    try{
      var data=await ccInvoke({action:"list",password:password});
      var groups=data.seller_groups||[];
      if(!groups.length){
        list.innerHTML='<div class="authority-chapchap-order"><strong>NO SELLER PAYOUTS READY</strong><div class="cc-mini">There are no unpaid seller balances currently eligible for payout.</div>'+historyHtml(data.recent_seller_payouts||[])+'</div>';
        ccStatus("CONNECTED • NO UNPAID SELLER BALANCES");
        return;
      }
      list.innerHTML=
        '<div class="authority-chapchap-order"><strong>SELLER-LEVEL PAYOUTS</strong><div class="cc-mini">Each seller is grouped once. All unpaid products belonging to that seller are combined into one payout. Each sale remains a separate receipt.</div></div>'+
        groups.map(sellerCard).join("")+
        historyHtml(data.recent_seller_payouts||[]);
      list.querySelectorAll(".ione-seller-payout").forEach(function(card){
        var sid=card.getAttribute("data-seller-payout");
        var group=groups.find(function(x){return String(x.seller_id)===String(sid);});
        var sel=card.querySelector(".sp-network");
        if(sel && group && group.recipient_network) sel.value=group.recipient_network;
        var btn=card.querySelector(".sp-calculate");
        if(btn) btn.addEventListener("click",function(){calculateSellerPayout(card,group);});
      });
      ccStatus("CONNECTED • SELLER PAYOUTS READY");
    }catch(e){
      list.innerHTML='<div class="authority-chapchap-order"><strong>PAYOUT ERROR</strong><div class="cc-mini">'+ccEsc(e?.message||"Could not load seller payouts.")+'</div></div>';
      ccStatus(e?.message||"Could not load seller payouts.");
    }
  }

  async function calculateSellerPayout(card,group){
    if(payoutBusy) return;
    var name=String(card.querySelector(".sp-name")?.value||"").trim();
    var phone=String(card.querySelector(".sp-phone")?.value||"").trim();
    var network=String(card.querySelector(".sp-network")?.value||"").trim();
    var result=card.querySelector(".sp-result"),btn=card.querySelector(".sp-calculate");
    if(!name){result.innerHTML='<div class="sp-quote">Please enter the seller name.</div>';return;}
    if(!phone){result.innerHTML='<div class="sp-quote">Please enter the seller phone number.</div>';return;}
    if(!network){result.innerHTML='<div class="sp-quote">Please select the seller mobile network.</div>';return;}
    if(!group?.seller_id){result.innerHTML='<div class="sp-quote">Seller account link is missing. Reload the payout section.</div>';return;}
    payoutBusy=true;if(btn)btn.disabled=true;ccStatus("Calculating BLMPay fee for the full seller balance…");
    try{
      var d=await ccInvoke({
        action:"payout_quote",password:ccPassword(),seller_id:group.seller_id,
        seller_name:name,recipient_phone:phone,recipient_network:network
      });
      payoutQuoteCache[String(group.seller_id)]=d;
      result.innerHTML='<div class="sp-quote">'+
        '<b>VERIFIED PAYOUT QUOTE</b><br>'+
        'REGISTERED ACCOUNT: '+ccEsc(d.account_name)+'<br>'+
        'NUMBER: '+ccEsc(d.recipient_phone)+'<br>'+
        'NETWORK: '+ccEsc(d.network)+'<br>'+
        'COMBINED SELLER BALANCE: <b>'+ccMoney(d.seller_balance_tzs)+'</b><br>'+
        'BLMPay PAYOUT FEE: <b>'+ccMoney(d.fee_tzs)+'</b><br>'+
        'SELLER RECEIVES: <b>'+ccMoney(d.amount_tzs)+'</b><br>'+
        'TOTAL DEBIT FROM SELLER BALANCE: <b>'+ccMoney(d.total_debit_tzs)+'</b><br>'+
        'PRODUCTS INCLUDED: '+Number(d.order_count||0)+
        '</div><button type="button" class="sp-send">SEND PAYOUT TO THIS SELLER</button>';
      result.querySelector(".sp-send").addEventListener("click",function(){sendSellerPayout(card,group,d);});
      ccStatus("PAYOUT CALCULATED • VERIFY THE DETAILS BEFORE SEND");
    }catch(e){
      result.innerHTML='<div class="sp-quote">'+ccEsc(e?.message||"Could not calculate the seller payout.")+'</div>';
      ccStatus(e?.message||"Could not calculate seller payout.");
    }finally{
      payoutBusy=false;if(btn)btn.disabled=false;
    }
  }

  async function sendSellerPayout(card,group,d){
    if(payoutBusy) return;
    var result=card.querySelector(".sp-result"),sendBtn=card.querySelector(".sp-send");
    var ok=confirm(
      "CONFIRM SELLER PAYOUT\n\n"+
      "Seller: "+(d.account_name||group.seller_name||"SELLER")+"\n"+
      "Number: "+d.recipient_phone+"\n"+
      "Network: "+d.network+"\n\n"+
      "Combined seller balance: TZS "+Number(d.seller_balance_tzs||0).toLocaleString("en-US")+"\n"+
      "BLMPay payout fee: TZS "+Number(d.fee_tzs||0).toLocaleString("en-US")+"\n"+
      "Seller receives: TZS "+Number(d.amount_tzs||0).toLocaleString("en-US")+"\n"+
      "Total debit: TZS "+Number(d.total_debit_tzs||0).toLocaleString("en-US")+"\n\n"+
      "Press OK to SEND MONEY, or Cancel."
    );
    if(!ok){ccStatus("Payout cancelled. No money was sent.");return;}
    payoutBusy=true;if(sendBtn)sendBtn.disabled=true;ccStatus("Sending seller payout to BLMPay…");
    try{
      var sent=await ccInvoke({
        action:"payout_send",password:ccPassword(),seller_id:group.seller_id,
        account_name:d.account_name,recipient_phone:d.recipient_phone,recipient_network:d.network,
        amount_tzs:d.amount_tzs,fee_tzs:d.fee_tzs,seller_balance_tzs:d.seller_balance_tzs,total_debit_tzs:d.total_debit_tzs
      });
      result.innerHTML='<div class="sp-quote"><b>PAYOUT SUBMITTED</b><br>'+ccEsc(sent.message||"Seller payout submitted to BLMPay.")+
        '<br>BLMPay reference: <b>'+ccEsc(sent.payout?.blmpay_reference||"PROCESSING")+'</b></div>';
      ccStatus(sent.message||"Seller payout submitted.");
      setTimeout(renderSellerPayouts,700);
    }catch(e){
      if(sendBtn)sendBtn.disabled=false;
      result.innerHTML='<div class="sp-quote">'+ccEsc(e?.message||"Payout could not be sent.")+'</div>';
      ccStatus(e?.message||"Payout could not be sent.");
    }finally{payoutBusy=false;}
  }

  function hookPayoutFilter(){
    document.addEventListener("click",function(e){
      var card=e.target.closest && e.target.closest('[data-cc-filter="payouts"]');
      if(card) setTimeout(renderSellerPayouts,35);
    },true);
  }

  function hookPanelRefresh(){
    var observer=new MutationObserver(function(){
      var panel=document.getElementById("authorityPressPanel");
      if(!panel) return;
      var selected=document.querySelector('[data-cc-filter="payouts"].is-selected');
      if(selected && document.getElementById("authorityChapChapOrders") && !document.getElementById("ioneSellerPayoutStyle")) {
        setTimeout(renderSellerPayouts,50);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function bootPayoutUI(){
    hookPayoutFilter();
    hookPanelRefresh();
    if(document.querySelector('[data-cc-filter="payouts"].is-selected')) setTimeout(renderSellerPayouts,100);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bootPayoutUI,{once:true});
  else bootPayoutUI();
})();

