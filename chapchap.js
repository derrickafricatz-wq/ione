/* I|ONE CHAPCHAP — isolated marketplace module
 * This file intentionally owns only the ChapChap UI and data flow.
 * If it fails, the main I|ONE application is left untouched.
 */
(function () {
  "use strict";

  var started = false;
  var mountObserver = null;
  var productCache = [];
  var pollTimer = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function money(value) {
    return "TZS " + Number(value || 0).toLocaleString("en-US");
  }

  function normalizePhone(value) {
    var p = String(value || "").replace(/\D/g, "");
    if (p.indexOf("255") === 0) return p;
    if (p.indexOf("0") === 0) return "255" + p.slice(1);
    if (p.indexOf("6") === 0 || p.indexOf("7") === 0) return "255" + p;
    return p;
  }

  function validPhone(value) {
    return /^255[67]\d{8}$/.test(normalizePhone(value));
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el && typeof el.value === "string" ? el.value.trim() : "";
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
      "#ioneChapOpen{border:1px solid #00ffff;border-radius:12px;padding:9px 14px;background:linear-gradient(145deg,#18ffff,#008f8f);color:#001010;font:900 11px Arial,sans-serif;letter-spacing:1px;box-shadow:0 4px 0 #005858;cursor:pointer}" +
      "#ioneChapMine{border:1px solid #294349;border-radius:12px;padding:9px 12px;background:#0a1113;color:#bfeff2;font:900 10px Arial,sans-serif;cursor:pointer}" +
      "#ioneChapStatus{margin-left:auto;color:#70878c;font:800 9px Arial,sans-serif;letter-spacing:.7px}" +
      "#ioneChapRail{display:flex;gap:11px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;padding:4px 5px 12px;scrollbar-width:none}" +
      "#ioneChapRail::-webkit-scrollbar{display:none}" +
      ".ione-chap-card{flex:0 0 178px;height:222px;scroll-snap-align:start;position:relative;border:1px solid #294349;border-radius:18px;background:linear-gradient(145deg,#101a1d,#050809);overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,.42);transform:perspective(700px) rotateY(-2deg);transition:transform .18s ease,border-color .18s ease;cursor:pointer}" +
      ".ione-chap-card:active{transform:perspective(700px) rotateY(0) scale(.985)}" +
      ".ione-chap-photo{height:126px;background:#091114;overflow:hidden;position:relative}" +
      ".ione-chap-photo img{width:100%;height:100%;object-fit:cover;display:block}" +
      ".ione-chap-price{position:absolute;left:8px;top:8px;padding:6px 8px;border-radius:8px;background:#ffe600;color:#111;font:900 10px Arial,sans-serif;box-shadow:0 3px 0 rgba(0,0,0,.35)}" +
      ".ione-chap-sold{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.68);color:#ff7d7d;font:900 20px Arial,sans-serif;letter-spacing:2px}" +
      ".ione-chap-info{padding:9px 10px}.ione-chap-title{color:#fff;font:900 13px/1.15 Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ione-chap-seller{margin-top:6px;color:#00ffff;font:800 9px Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ione-chap-location{margin-top:5px;color:#71878c;font:700 8px Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".ione-chap-empty{min-width:100%;padding:18px;text-align:center;color:#789096;border:1px dashed #294349;border-radius:14px;font:800 10px/1.5 Arial,sans-serif}" +
      "#ioneChapOverlay{position:fixed;inset:0;z-index:102500;display:none;align-items:center;justify-content:center;padding:15px;background:rgba(0,0,0,.82);backdrop-filter:blur(9px);font-family:Arial,sans-serif;color:#fff}" +
      "#ioneChapOverlay .cc-card{width:min(500px,100%);max-height:94vh;overflow:auto;border:1px solid #00ffff;border-radius:22px;background:linear-gradient(145deg,#101b1f,#05090a);box-shadow:0 25px 80px rgba(0,0,0,.75);padding:18px}" +
      ".cc-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.cc-head h2{margin:0;color:#00ffff;font:900 23px Arial,sans-serif}.cc-close{border:1px solid #334a50;background:#111;color:#fff;border-radius:10px;padding:8px 11px;font-weight:900;cursor:pointer}" +
      ".cc-kicker{color:#789096;font:900 9px Arial,sans-serif;letter-spacing:2px;margin:5px 0 13px}.cc-grid{display:grid;gap:9px}.cc-field label{display:block;color:#00ffff;font:900 9px Arial,sans-serif;letter-spacing:1px;margin:0 0 5px}.cc-field input,.cc-field select,.cc-field textarea{width:100%;box-sizing:border-box;border:1px solid #294349;border-radius:10px;background:#071012;color:#fff;padding:11px;font:700 13px Arial,sans-serif;outline:none}.cc-field textarea{min-height:76px;resize:vertical}.cc-field input:focus,.cc-field select:focus,.cc-field textarea:focus{border-color:#00ffff}.cc-images{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cc-images input{font-size:9px;padding:7px}.cc-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.cc-primary,.cc-secondary{min-height:45px;border-radius:11px;font-weight:900;cursor:pointer}.cc-primary{border:1px solid #00ffff;background:linear-gradient(145deg,#18ffff,#008f8f);color:#001010}.cc-secondary{border:1px solid #334a50;background:#111;color:#fff}.cc-status{min-height:20px;margin-top:10px;text-align:center;color:#9eb0b5;font:800 10px/1.4 Arial,sans-serif}.cc-product-preview{display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:center;margin:5px 0 13px;padding:9px;border:1px solid #294349;border-radius:13px;background:#071012}.cc-product-preview img{width:110px;height:90px;object-fit:cover;border-radius:9px;background:#0b1417}.cc-product-preview h3{margin:0 0 5px;font:900 16px Arial,sans-serif}.cc-product-preview p{margin:3px 0;color:#9fb2b6;font-size:10px}.cc-phone{font-size:18px!important;letter-spacing:1px}.cc-call{display:inline-block;margin-top:8px;padding:9px 11px;border:1px solid #00ffff;border-radius:9px;background:#071719;color:#00ffff;text-decoration:none;font:900 10px Arial,sans-serif}.cc-list{display:grid;gap:8px}.cc-list-item{border:1px solid #294349;border-radius:12px;padding:10px;background:#071012}.cc-list-item strong{display:block;color:#fff;font-size:12px}.cc-list-item span{display:block;margin-top:4px;color:#82979c;font-size:9px}.cc-list-item a{display:inline-block;margin-top:7px;color:#00ffff;font-weight:900;font-size:10px;text-decoration:none}" +
      "@media(max-width:420px){.ione-chap-card{flex-basis:164px;height:214px}.ione-chap-photo{height:119px}.cc-images{grid-template-columns:repeat(2,1fr)}.cc-actions{grid-template-columns:1fr}}";
    document.head.appendChild(style);
  }

  function findMarketingHost() {
    var overlay = document.getElementById("afrilinkOverlay");
    if (!overlay) return null;
    return overlay.querySelector(".afl-head") ||
      overlay.querySelector(".afl-discovery") ||
      overlay.querySelector(".afl-scroll") ||
      overlay;
  }

  function createDock() {
    var discovery = findMarketingHost();
    if (!discovery || document.getElementById("ioneChapDock")) return false;
    var dock = document.createElement("div");
    dock.id = "ioneChapDock";
    dock.innerHTML =
      '<div id="ioneChapBar">' +
      '<button id="ioneChapOpen" type="button">CHAPCHAP • BUY / SELL</button>' +
      '<button id="ioneChapMine" type="button">MY CHAPCHAP</button>' +
      '<span id="ioneChapStatus">SINGLE-PRODUCT MARKET</span>' +
      '</div>' +
      '<div id="ioneChapRail"><div class="ione-chap-empty">Loading ChapChap products…</div></div>';
    if (discovery.classList && discovery.classList.contains("afl-head")) {\n      discovery.parentNode.insertBefore(dock, discovery.nextSibling);\n    } else {\n      discovery.insertBefore(dock, discovery.firstChild);\n    }
    document.getElementById("ioneChapOpen").addEventListener("click", function () { openSell(); });
    document.getElementById("ioneChapMine").addEventListener("click", function () { openMine(); });
    return true;
  }

  function createOverlay() {
    if (document.getElementById("ioneChapOverlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "ioneChapOverlay";
    overlay.innerHTML =
      '<div class="cc-card">' +
        '<div class="cc-head"><h2 id="ioneCcTitle">CHAPCHAP</h2><button class="cc-close" id="ioneChapOverlayClose" type="button">CLOSE</button></div>' +
        '<div class="cc-kicker" id="ioneChapOverlayKicker">I|ONE • SINGLE-PRODUCT MARKET</div>' +
        '<div id="ioneChapOverlayBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("ioneChapOverlayClose").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeOverlay(); });
  }

  function openOverlay(title, kicker, body) {
    createOverlay();
    document.getElementById("ioneCcTitle").textContent = title;
    document.getElementById("ioneChapOverlayKicker").textContent = kicker || "I|ONE • SINGLE-PRODUCT MARKET";
    document.getElementById("ioneChapOverlayBody").innerHTML = body;
    document.getElementById("ioneChapOverlay").style.display = "flex";
    document.body.classList.add("ione-chap-open");
  }

  function closeOverlay() {
    var el = document.getElementById("ioneChapOverlay");
    if (el) el.style.display = "none";
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
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
      '<div class="cc-field"><label>YOUR NAME</label><input id="ioneCcSellerName" maxlength="80" placeholder="Seller name"></div>' +
      '<div class="cc-field"><label>YOUR PHONE</label><input id="ioneCcSellerPhone" class="cc-phone" inputmode="tel" maxlength="15" placeholder="07XXXXXXXX"></div>' +
      '<div class="cc-field"><label>CATEGORY</label>' + categoryHtml() + "</div>" +
      '<div id="ioneCcSmartFields" class="cc-grid"></div>' +
      '<div class="cc-field"><label>PRODUCT NAME</label><input id="ioneCcTitle" maxlength="100" placeholder="One clear product name"></div>' +
      '<div class="cc-field"><label>PRICE • TZS</label><input id="ioneCcPrice" type="number" min="1" step="1" inputmode="numeric" placeholder="Example: 150000"></div>' +
      '<div class="cc-field"><label>LOCATION</label><input id="ioneCcLocation" maxlength="100" placeholder="City / area"></div>' +
      '<div class="cc-field"><label>DESCRIPTION</label><textarea id="ioneCcDescription" maxlength="700" placeholder="Short product description"></textarea></div>' +
      '<div class="cc-field"><label>PRODUCT PHOTOS • 1 TO 4</label><div class="cc-images"><input id="ioneCcImage1" type="file" accept="image/*"><input id="ioneCcImage2" type="file" accept="image/*"><input id="ioneCcImage3" type="file" accept="image/*"><input id="ioneCcImage4" type="file" accept="image/*"></div></div>' +
      '<div class="cc-actions"><button id="ioneCcSellCancel" class="cc-secondary" type="button">CANCEL</button><button id="ioneCcSellSubmit" class="cc-primary" type="button">PUBLISH PRODUCT</button></div>' +
      '<div id="ioneCcSellStatus" class="cc-status"></div>' +
      "</div>"
    );
    renderSmartFields();
    document.getElementById("ioneCcCategory").addEventListener("change", renderSmartFields);
    document.getElementById("ioneCcSellCancel").addEventListener("click", closeOverlay);
    document.getElementById("ioneCcSellSubmit").addEventListener("click", submitListing);
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
    try {
      btn.disabled = true;
      status.textContent = "Checking secure session…";
      var session = await getSession();
      var name = fieldValue("ioneCcSellerName");
      var phone = normalizePhone(fieldValue("ioneCcSellerPhone"));
      var category = fieldValue("ioneCcCategory");
      var title = fieldValue("ioneCcTitle");
      var price = Math.round(Number(fieldValue("ioneCcPrice")));
      var location = fieldValue("ioneCcLocation");
      var description = fieldValue("ioneCcDescription");
      if (!name) throw new Error("Enter your name.");
      if (!validPhone(phone)) throw new Error("Enter a valid Tanzania mobile number.");
      if (!title) throw new Error("Enter the product name.");
      if (!Number.isFinite(price) || price <= 0) throw new Error("Enter a valid price.");
      if (!location) throw new Error("Enter the location.");
      var fileEls = [1,2,3,4].map(function (n) { return document.getElementById("ioneCcImage" + n); });
      var files = fileEls.map(function (el) { return el.files[0]; }).filter(Boolean);
      if (!files.length) throw new Error("Add at least one product photo.");
      status.textContent = "Uploading product photos…";
      var media = await uploadImages(session.user.id, files);
      var attrs = {};
      (smartFields[category] || smartFields.other).forEach(function (spec) {
        var el = document.getElementById("ioneCc_attr_" + spec[0]);
        if (el && el.value.trim()) attrs[spec[0]] = el.value.trim();
      });
      status.textContent = "Publishing product…";
      var sb = getSupabase();
      var result = await sb.from("ione_single_products").insert({
        seller_id: session.user.id,
        seller_name: name,
        seller_phone: phone,
        category: category,
        title: title,
        price_tzs: price,
        location: location,
        description: description,
        attributes: attrs,
        image_urls: media.urls,
        image_paths: media.paths,
        status: "active"
      }).select("id").single();
      if (result.error) throw result.error;
      status.textContent = "LIVE • Your product is now on ChapChap.";
      await loadProducts();
      setTimeout(closeOverlay, 700);
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
      return '<article class="ione-chap-card" data-id="' + esc(p.id) + '">' +
        '<div class="ione-chap-photo">' +
        (image ? '<img src="' + esc(image) + '" alt="' + esc(p.title) + '" loading="lazy">' : "") +
        '<span class="ione-chap-price">' + esc(money(p.price_tzs)) + "</span>" +
        '</div><div class="ione-chap-info">' +
        '<div class="ione-chap-title">' + esc(p.title) + "</div>" +
        '<div class="ione-chap-seller">' + esc(p.seller_name) + "</div>" +
        '<div class="ione-chap-location">' + esc(p.location) + " • " + esc(String(p.category || "").toUpperCase()) + "</div>" +
        "</div></article>";
    }).join("");
    Array.prototype.forEach.call(rail.querySelectorAll(".ione-chap-card"), function (card) {
      card.addEventListener("click", function () { openProduct(card.getAttribute("data-id")); });
    });
  }

  async function loadProducts() {
    var sb = getSupabase();
    var rail = document.getElementById("ioneChapRail");
    if (!sb || !rail) return;
    try {
      var result = await sb.from("ione_single_products")
        .select("id,seller_id,seller_name,seller_phone,category,title,price_tzs,location,description,attributes,image_urls,status,created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(30);
      if (result.error) throw result.error;
      productCache = result.data || [];
      renderRail(productCache);
      var st = document.getElementById("ioneChapStatus");
      if (st) st.textContent = productCache.length + " LIVE PRODUCT" + (productCache.length === 1 ? "" : "S");
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
    var image = Array.isArray(p.image_urls) && p.image_urls[0] ? p.image_urls[0] : "";
    openOverlay("BUY • " + p.title, "CHAPCHAP • BUYER",
      '<div class="cc-product-preview">' +
      (image ? '<img src="' + esc(image) + '" alt="">' : '<div></div>') +
      '<div><h3>' + esc(p.title) + '</h3><p>' + esc(money(p.price_tzs)) + '</p><p>' + esc(p.seller_name) + " • " + esc(p.location) + '</p></div>' +
      "</div>" +
      '<div class="cc-grid">' +
      '<div class="cc-field"><label>SELLER</label><div style="color:#9eb0b5;font-size:11px;line-height:1.45">' + esc(p.description || "Product listed on I|ONE ChapChap.") + "</div></div>" +
      '<div class="cc-field"><label>YOUR MOBILE NUMBER</label><input id="ioneCcBuyerPhone" class="cc-phone" inputmode="tel" maxlength="15" placeholder="07XXXXXXXX"></div>' +
      '<div class="cc-actions"><button id="ioneCcBuyCancel" class="cc-secondary" type="button">CANCEL</button><button id="ioneCcBuySubmit" class="cc-primary" type="button">CONFIRM PAYMENT</button></div>' +
      '<div id="ioneCcBuyStatus" class="cc-status">A payment prompt will be sent to your phone. Enter your mobile-money PIN on the phone.</div>' +
      "</div>"
    );
    document.getElementById("ioneCcBuyCancel").addEventListener("click", closeOverlay);
    document.getElementById("ioneCcBuySubmit").addEventListener("click", function () { startPayment(p); });
  }

  async function startPayment(product) {
    var status = document.getElementById("ioneCcBuyStatus");
    var btn = document.getElementById("ioneCcBuySubmit");
    try {
      btn.disabled = true;
      var phone = normalizePhone(document.getElementById("ioneCcBuyerPhone").value);
      if (!validPhone(phone)) throw new Error("Enter a valid Tanzania mobile number.");
      var session = await getSession();
      status.textContent = "Sending payment request…";
      var sb = getSupabase();
      var result = await sb.functions.invoke("ione-chapchap-payment", { body: { product_id: product.id, phone_number: phone } });
      if (result.error || !result.data || !result.data.success) {
        throw new Error(result.data && result.data.error ? result.data.error : (result.error && result.error.message) || "Payment could not be started.");
      }
      var orderId = result.data.order_id;
      status.textContent = "Payment prompt sent. Enter your PIN on your phone. Waiting for confirmation…";
      await waitForPayment(orderId, product, phone);
    } catch (err) {
      console.error("ChapChap payment:", err);
      if (status) status.textContent = err && err.message ? err.message : "Payment could not be started.";
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
            clearInterval(pollTimer); pollTimer = null;
            status.innerHTML = "PAYMENT CONFIRMED • PRODUCT SOLD.<br><a class=\"cc-call\" href=\"tel:+" + esc(normalizePhone(product.seller_phone)) + "\">CALL SELLER • " + esc(product.seller_phone) + "</a>";
            await loadProducts();
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

  async function openMine() {
    try {
      var session = await getSession();
      var sb = getSupabase();
      var orders = await sb.from("ione_chapchap_orders")
        .select("id,product_id,buyer_phone,amount_tzs,status,created_at,paid_at")
        .eq("seller_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (orders.error) throw orders.error;
      var notes = await sb.from("ione_chapchap_notifications")
        .select("id,order_id,title,body,read_at,created_at")
        .eq("seller_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (notes.error) throw notes.error;
      var body =
        '<div class="cc-list">' +
        (notes.data && notes.data.length ? notes.data.map(function (n) {
          return '<div class="cc-list-item"><strong>' + esc(n.title) + '</strong><span>' + esc(n.body) + '</span>' +
            (n.body && n.body.match(/255[67]\d{8}/) ? '<a href="tel:+' + esc(n.body.match(/255[67]\d{8}/)[0]) + '">CALL BUYER</a>' : "") +
            "</div>";
        }).join("") : '<div class="cc-list-item"><strong>NO SALES YET</strong><span>Your paid ChapChap sales notifications will appear here.</span></div>') +
        (orders.data && orders.data.length ? orders.data.map(function (o) {
          return '<div class="cc-list-item"><strong>ORDER • ' + esc(String(o.status).toUpperCase()) + '</strong><span>' + esc(money(o.amount_tzs)) + " • " + esc(new Date(o.created_at).toLocaleString()) + "</span></div>";
        }).join("") : "") +
        "</div>";
      openOverlay("MY CHAPCHAP", "SELLER • SALES & NOTIFICATIONS", body);
    } catch (err) {
      openOverlay("MY CHAPCHAP", "SELLER", '<div class="cc-status">' + esc(err && err.message ? err.message : "Could not load seller information.") + "</div>");
    }
  }

  async function initialize() {
    if (started) return;
    started = true;
    try {
      injectStyles();
      createDock();
      createOverlay();
      if (typeof ensureHeavensAnonymousSession === "function") ensureHeavensAnonymousSession().catch(function () {});
      await loadProducts();
    } catch (err) {
      console.warn("ChapChap isolated module:", err);
    }
  }

  function bootWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize, { once: true });
      return;
    }
    initialize();
  }

  /* I|ONE may build/open the Marketing overlay after DOMContentLoaded.
     Keep watching only for the specific ChapChap mounting point. */
  function watchForMarketingMount() {
    if (mountObserver || typeof MutationObserver === "undefined") return;
    mountObserver = new MutationObserver(function () {
      if (!document.getElementById("ioneChapDock")) {
        createDock();
        if (document.getElementById("ioneChapDock")) {
          loadProducts();
        }
      }
    });
    mountObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* The existing marketing world is opened by I|ONE. We only mount inside it. */
  bootWhenReady();
  if (typeof MutationObserver !== "undefined") watchForMarketingMount();
  window.ioneChapChapRefresh = loadProducts;
  window.ioneChapChapOpen = openSell;
})();