/* I|ONE Mama Chakula — Swahili-first restaurant menus and food orders. */
(function () {
  "use strict";
  if (window.__ioneMamaChakulaBooted) return;
  window.__ioneMamaChakulaBooted = true;
  const FN = "ione-mama-chakula";
  const PAYMENT = { provider: "HaloPesa", merchant: "DERRICK KIPAJI OF AFRIKA & CO", number: "23544652" };
  const css = `
  #ioneMamaFood{position:fixed;inset:0;z-index:100070;display:none;overflow:auto;overscroll-behavior:contain;background:#fff8ef;color:#38291f;font-family:Arial,sans-serif}
  #ioneMamaFood *{box-sizing:border-box}
  .mf-shell{width:min(1040px,100%);margin:auto;padding:14px 14px calc(30px + env(safe-area-inset-bottom))}
  .mf-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0 13px;background:#fff8ef}
  .mf-brand{font-size:11px;font-weight:900;letter-spacing:2px;color:#a64d2c}
  .mf-btn{border:1px solid #d9b997;border-radius:11px;background:#f0e5d4;color:#523a29;padding:10px 13px;min-height:42px;font-weight:800;cursor:pointer}
  .mf-primary{background:#e87545;border-color:#e87545;color:white}
  .mf-hero{padding:24px;border-radius:19px;background:linear-gradient(135deg,#fff0d9,#f9d6b4);margin-bottom:13px}
  .mf-hero small{font-weight:900;letter-spacing:2px;color:#a64d2c}
  .mf-hero h1{font-size:clamp(29px,7vw,46px);line-height:1.05;margin:9px 0;color:#492c1d}
  .mf-hero p{margin:0;color:#72543e;line-height:1.6}
  .mf-tabs{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px}
  .mf-tabs button{white-space:nowrap}
  .mf-panel{padding:16px;border:1px solid #efd9c2;border-radius:16px;background:#fffdf9;margin:10px 0}
  .mf-panel h2{font-size:19px;margin:0 0 10px}
  .mf-muted{font-size:13px;line-height:1.6;color:#806a58}
  .mf-form{display:grid;gap:10px;margin-top:12px}
  .mf-form label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#654a36}
  .mf-form input,.mf-form textarea,.mf-form select{width:100%;min-height:44px;padding:11px;border:1px solid #e2c6a9;border-radius:10px;background:white;color:#38291f;font:inherit}
  .mf-form textarea{min-height:75px;resize:vertical}
  .mf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .mf-menu-track{display:flex;gap:11px;overflow-x:auto;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;padding:4px 2px 12px;scroll-snap-type:x proximity}
  .mf-menu-card{flex:0 0 min(210px,68vw);width:min(210px,68vw);overflow:hidden;border:1px solid #efd9c2;border-radius:14px;background:#fff;scroll-snap-align:start;text-align:left;padding:0;color:#38291f;cursor:pointer}
  .mf-menu-card img{display:block;width:100%;height:132px;object-fit:cover;background:#f3e5d6}
  .mf-menu-copy{display:block;padding:10px}
  .mf-menu-copy b{display:block;font-size:14px;line-height:1.3}
  .mf-menu-copy small{display:block;color:#8a6448;margin-top:5px}
  .mf-menu-copy strong{display:block;color:#b64f2c;margin-top:7px}
  .mf-menu-card:disabled{opacity:.55;cursor:not-allowed}
  .mf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .mf-row .mf-grow{flex:1;min-width:0}
  .mf-qty{display:inline-flex;align-items:center;gap:10px}
  .mf-qty button{width:34px;height:34px;border:1px solid #dfc3a5;border-radius:9px;background:#fff4e8;font-size:18px;font-weight:900}
  .mf-order{border:1px solid #ecd6bf;border-radius:12px;padding:12px;margin:9px 0;background:#fff}
  .mf-order p{margin:6px 0;font-size:13px;line-height:1.5}
  .mf-status{min-height:20px;margin-top:9px;color:#426b3c;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
  .mf-status.error{color:#a52a22}
  .mf-cart{position:sticky;bottom:0;z-index:4;background:#fff4e6;border:1px solid #e9c8a5;border-radius:14px;padding:12px;margin-top:12px;box-shadow:0 4px 18px #8c5c3220}
  .mf-empty{padding:16px;color:#806a58;font-size:13px}
  .mf-badge{display:inline-block;border-radius:30px;padding:4px 8px;background:#f4e5d3;color:#765032;font-size:10px;font-weight:900}
  @media(min-width:760px){.mf-shell{padding:18px 24px 34px}.mf-menu-card{flex-basis:220px;width:220px}}
  `;
  const style = document.createElement("style"); style.id = "ioneMamaFoodStyles"; style.textContent = css; document.head.appendChild(style);
  const root = document.createElement("div"); root.id = "ioneMamaFood";
  root.innerHTML = `
    <main class="mf-shell" role="dialog" aria-modal="true" aria-label="Mama Chakula">
      <header class="mf-head"><div class="mf-brand">I|ONE • MAMA CHAKULA</div><button class="mf-btn" id="mfClose" type="button">Funga</button></header>
      <section class="mf-hero"><small>CHAKULA CHA KARIBU • I|ONE SOKONI</small><h1>Mama Chakula.</h1><p>Chagua chakula, weka idadi ya sahani, tuma oda moja kwa moja kwa mpishi. Menyu na bei huwekwa na Mama Chakula mwenyewe.</p></section>
      <nav class="mf-tabs"><button class="mf-btn mf-primary" data-tab="menu">Angalia menyu</button><button class="mf-btn" data-tab="join">Jiunge kama Mama Chakula</button><button class="mf-btn" data-tab="orders">Oda zangu</button><button class="mf-btn" data-tab="seller" id="mfSellerTab" style="display:none">Dashibodi ya mpishi</button></nav>
      <section id="mfMenuView">
        <div class="mf-panel"><div class="mf-row"><h2 class="mf-grow">Migahawa iliyo karibu</h2><button class="mf-btn" id="mfRefreshMenu">Sasisha</button></div><p class="mf-muted">Telezesha menyu kushoto au kulia. Chagua chakula kuongeza sahani kwenye kikapu.</p><div id="mfMenuList"><div class="mf-empty">Inapakia menyu…</div></div></div>
        <div class="mf-cart" id="mfCart" style="display:none"><div class="mf-row"><strong class="mf-grow">Kikapu chako</strong><span id="mfCartTotal"></span></div><div id="mfCartLines"></div><form class="mf-form" id="mfCheckout">
          <label>Jina lako<input id="mfBuyerName" required maxlength="120" autocomplete="name"></label>
          <label>Namba ya simu<input id="mfBuyerPhone" required type="tel" inputmode="tel" maxlength="20" placeholder="07XXXXXXXX"></label>
          <label>Unataka kupokea vipi?<select id="mfFulfillment"><option value="pickup">Nitachukulia kwa Mama Chakula</option><option value="delivery">Naomba kupelekewa</option></select></label>
          <label id="mfAddressWrap" style="display:none">Anwani ya kupeleka<input id="mfAddress" maxlength="240" placeholder="Mtaa, eneo na alama ya karibu"></label>
          <label>Maelekezo ya ziada (si lazima)<textarea id="mfBuyerNote" maxlength="600" placeholder="Mfano: pilipili kidogo, bila vitunguu…"></textarea></label>
          <button class="mf-btn mf-primary" id="mfSendOrder" type="submit">Tuma oda kwa Mama Chakula</button>
        </form><div class="mf-status" id="mfCartStatus" role="status"></div></div>
      </section>
      <section id="mfJoinView" style="display:none"><div class="mf-panel"><h2>Usajili wa Mama Chakula</h2><p class="mf-muted">Ada ni TZS 1,000 kwa siku 30. Weka jina la biashara, simu na eneo. Baada ya malipo ya mkono, Authority Press itathibitisha kabla ya menyu yako kuonekana kwa wateja.</p>
        <form class="mf-form" id="mfJoinForm"><label>Jina la biashara / Mama Chakula<input id="mfBusinessName" maxlength="120" required placeholder="Mfano: Mama Asha Chapati"></label><label>Namba ya simu<input id="mfJoinPhone" type="tel" inputmode="tel" maxlength="20" required placeholder="07XXXXXXXX"></label><label>Eneo / anwani ya chakula<input id="mfLocation" maxlength="240" placeholder="Mtaa, soko au eneo ulipo"></label><button class="mf-btn mf-primary" id="mfJoinSubmit">Tuma ombi la usajili</button></form>
        <div class="mf-status" id="mfJoinStatus" role="status"></div><div class="mf-panel" style="display:none" id="mfPayment"><b>Maelekezo ya malipo ya mkono</b><p>Mtandao: <b>${PAYMENT.provider}</b><br>Jina: <b>${PAYMENT.merchant}</b><br>Namba: <b>${PAYMENT.number}</b><br>Kiasi: <b>TZS 1,000</b><br>Muda: <b>Siku 30</b></p><p class="mf-muted">Baada ya kulipa, subiri Authority Press ithibitishe. Usijaribu kuchapisha menyu kabla ruhusa haijafunguliwa.</p></div><button class="mf-btn" id="mfCheckStatus" type="button">Angalia hali ya usajili</button><div class="mf-status" id="mfMyStatus" role="status"></div>
      </div></section>
      <section id="mfOrdersView" style="display:none"><div class="mf-panel"><h2>Oda zangu</h2><button class="mf-btn" id="mfRefreshOrders">Sasisha oda</button><div id="mfBuyerOrders" class="mf-empty">Oda ulizotuma zitaonekana hapa.</div></div></section>
      <section id="mfSellerView" style="display:none"><div class="mf-panel"><div class="mf-row"><h2 class="mf-grow">Dashibodi ya Mama Chakula</h2><button class="mf-btn" id="mfOpenToggle">Nimefungua</button></div><p class="mf-muted" id="mfVendorInfo"></p>
        <h2 style="margin-top:18px">Ongeza chakula kwenye menyu</h2><form class="mf-form" id="mfMenuForm"><input type="hidden" id="mfItemId"><label>Jina la chakula<input id="mfItemName" maxlength="120" required placeholder="Chapati, wali nyama, chips…"></label><div class="mf-grid"><label>Kundi<select id="mfCategory"><option>Chapati</option><option>Wali</option><option>Nyama</option><option>Chips</option><option>Supu</option><option>Vinywaji</option><option>Vitafunwa</option><option>Chakula</option></select></label><label>Bei kwa sahani / kipimo (TZS)<input id="mfPrice" type="number" min="1" step="1" required></label><label>Kipimo<input id="mfPortion" value="sahani" maxlength="30" required></label></div><label>Maelezo (si lazima)<textarea id="mfDescription" maxlength="600"></textarea></label><label>Picha ya chakula (JPG, PNG au WebP; hadi MB 5)<input id="mfPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="mf-row"><button class="mf-btn mf-primary" id="mfSaveItem">Hifadhi kwenye menyu</button><button class="mf-btn" id="mfCancelEdit" type="button" style="display:none">Ghairi uhariri</button></div></form><div class="mf-status" id="mfMenuStatus" role="status"></div><div id="mfMyMenu"></div>
      </div><div class="mf-panel"><div class="mf-row"><h2 class="mf-grow">Oda zinazoingia</h2><button class="mf-btn" id="mfRefreshSellerOrders">Sasisha</button></div><div id="mfSellerOrders" class="mf-empty">Oda za wateja zitaonekana hapa.</div></div></section>
    </main>`;
  document.body.appendChild(root);
  const $ = id => document.getElementById(id);
  let cart = [], menuCache = [], currentVendor = null, refreshTimer = null, seenSeller = new Set();
  const money = n => "TZS " + Number(n || 0).toLocaleString("en-TZ");
  const statusLabels = { new:"Imepokelewa", accepted:"Imekubaliwa", preparing:"Inaandaliwa", ready:"Tayari", completed:"Imekamilika", rejected:"Imekataliwa" };
  async function session() {
    if (typeof heavensSupabase === "undefined") throw new Error("Huduma haijaunganishwa. Pakia ukurasa upya.");
    const s = await heavensSupabase.auth.getSession();
    if (s.error) throw s.error;
    if (!s.data.session) { const a = await heavensSupabase.auth.signInAnonymously(); if (a.error) throw a.error; }
  }
  async function api(action, data = {}, authority = false) {
    await session();
    const headers = {};
    if (authority) { const token = sessionStorage.getItem("ioneAuthoritySession") || ""; if (!token) throw new Error("Fungua Authority Press kwanza."); headers["x-ione-authority-session"] = token; data = { ...data, authority_session: token }; }
    const result = await heavensSupabase.functions.invoke(FN, { body: { action, ...data }, headers });
    if (result.error) {
      const msg = result.data?.error || result.error.message || "Ombi halikukamilika.";
      throw new Error(msg);
    }
    if (!result.data?.success) throw new Error(result.data?.error || "Ombi halikukamilika.");
    return result.data;
  }
  function status(id, msg, error = false) { const el = $(id); if (el) { el.textContent = msg || ""; el.classList.toggle("error", !!error); } }
  function showTab(tab) {
    ["menu","join","orders","seller"].forEach(x => { const el = $(`mf${x[0].toUpperCase()+x.slice(1)}View`); if (el) el.style.display = x === tab ? "block" : "none"; });
    root.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("mf-primary", b.dataset.tab === tab));
    if (tab === "menu") loadMenu();
    if (tab === "orders") loadOrders();
    if (tab === "seller") { loadMyMenu(); loadOrders(); }
  }
  function open() { root.style.display = "block"; document.body.style.overflow = "hidden"; showTab("menu"); checkStatus(); if (refreshTimer) clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (root.style.display !== "none") { loadMenu(); if ($("mfSellerView").style.display !== "none") loadOrders(); } }, 25000); }
  function close() { root.style.display = "none"; document.body.style.overflow = ""; if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
  function renderMenu(menu) {
    const host = $("mfMenuList"); host.replaceChildren();
    if (!menu.length) { const e=document.createElement("div");e.className="mf-empty";e.textContent="Bado hakuna menyu iliyochapishwa. Rudi tena baadaye.";host.appendChild(e);return; }
    const byVendor = new Map();
    menu.forEach(x => { const list=byVendor.get(x.vendor_id)||[];list.push(x);byVendor.set(x.vendor_id,list); });
    for (const [vendorId, items] of byVendor) {
      const section=document.createElement("section");section.style.margin="16px 0";
      const head=document.createElement("div");head.className="mf-row";
      const name=document.createElement("h2");name.className="mf-grow";name.style.fontSize="17px";name.textContent=items[0].vendor_name;
      const openBadge=document.createElement("span");openBadge.className="mf-badge";openBadge.textContent=items[0].vendor_is_open?"INAPOKEA ODA":"IMEFUNGWA KWA SASA";
      head.append(name,openBadge);section.appendChild(head);
      if(items[0].vendor_location){const loc=document.createElement("p");loc.className="mf-muted";loc.textContent=items[0].vendor_location;section.appendChild(loc);}
      const track=document.createElement("div");track.className="mf-menu-track";
      items.forEach(item=>{
        const card=document.createElement("button");card.type="button";card.className="mf-menu-card";card.disabled=!item.vendor_is_open;
        if(item.photo_url){const img=document.createElement("img");img.src=item.photo_url;img.alt=item.item_name;img.loading="lazy";card.appendChild(img);}
        const copy=document.createElement("span");copy.className="mf-menu-copy";
        const n=document.createElement("b");n.textContent=item.item_name;
        const d=document.createElement("small");d.textContent=item.description||item.category+" • "+item.portion_name;
        const p=document.createElement("strong");p.textContent=money(item.price_tzs)+" / "+item.portion_name;
        copy.append(n,d,p);card.appendChild(copy);card.addEventListener("click",()=>addToCart(item));track.appendChild(card);
      });
      section.append(head,track);host.appendChild(section);
    }
  }
  async function loadMenu() { const host=$("mfMenuList"); if(!menuCache.length)host.textContent="Inapakia menyu…"; try { const d=await api("public_menu");menuCache=d.menu||[];renderMenu(menuCache); } catch(e){host.textContent=e.message;} }
  function addToCart(item) {
    if(cart.length && cart[0].vendor_id!==item.vendor_id){ if(!confirm("Kikapu chako kina chakula cha Mama Chakula mwingine. Safisha kikapu na uanze oda mpya?"))return;cart=[]; }
    const line=cart.find(x=>x.id===item.id); if(line)line.quantity++;else cart.push({...item, id:item.id, quantity:1});
    renderCart();
  }
  function renderCart() {
    const panel=$("mfCart");panel.style.display=cart.length?"block":"none";
    const host=$("mfCartLines");host.replaceChildren();
    let total=0;
    cart.forEach(x=>{total+=x.price_tzs*x.quantity;const row=document.createElement("div");row.className="mf-row";row.style.padding="6px 0";
      const label=document.createElement("span");label.className="mf-grow";label.textContent=x.item_name+" • "+money(x.price_tzs);
      const qty=document.createElement("span");qty.className="mf-qty";
      const minus=document.createElement("button");minus.type="button";minus.textContent="−";minus.addEventListener("click",()=>{x.quantity--;if(x.quantity<=0)cart=cart.filter(y=>y.id!==x.id);renderCart();});
      const count=document.createElement("b");count.textContent=String(x.quantity);
      const plus=document.createElement("button");plus.type="button";plus.textContent="+";plus.addEventListener("click",()=>{x.quantity++;renderCart();});
      qty.append(minus,count,plus);row.append(label,qty);host.appendChild(row);
    });
    $("mfCartTotal").textContent=money(total);
  }
  function fileBase64(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=reject;reader.readAsDataURL(file);}); }
  async function checkStatus() {
    try { const d=await api("my_status");currentVendor=d.vendor||null;
      if(d.active){$("mfSellerTab").style.display="inline-block";$("mfPayment").style.display="none";status("mfMyStatus","Ruhusa yako inatumika hadi "+new Date(d.vendor.paid_until).toLocaleDateString("sw-TZ")+". Dashibodi ya mpishi imefunguliwa.");}
      else { $("mfSellerTab").style.display="none";const pending=(d.requests||[]).some(x=>x.status==="pending");status("mfMyStatus",pending?"Ombi lako linasubiri Authority Press kuthibitisha malipo.":"Bado huna ruhusa hai ya Mama Chakula."); }
    } catch(e){status("mfMyStatus",e.message,true);}
  }
  $("mfJoinForm").addEventListener("submit",async e=>{e.preventDefault();const b=$("mfJoinSubmit");b.disabled=true;status("mfJoinStatus","Inatuma ombi…");try{const d=await api("submit",{business_name:$("mfBusinessName").value.trim(),phone_number:$("mfJoinPhone").value.trim(),location_text:$("mfLocation").value.trim()});$("mfPayment").style.display="block";status("mfJoinStatus",d.message||"Ombi limepokelewa.");}catch(err){status("mfJoinStatus",err.message,true);}finally{b.disabled=false;}});
  async function loadMyMenu(){try{const d=await api("my_menu");currentVendor=d.vendor;$("mfVendorInfo").textContent=currentVendor.business_name+" • "+(currentVendor.location_text||"Eneo halijawekwa");$("mfOpenToggle").textContent=currentVendor.is_open?"Nimefungua • Funga":"Nimefunga • Fungua";const host=$("mfMyMenu");host.replaceChildren();(d.menu||[]).forEach(x=>{const card=document.createElement("div");card.className="mf-order mf-row";const label=document.createElement("span");label.className="mf-grow";label.textContent=x.item_name+" • "+money(x.price_tzs)+" / "+x.portion_name+" • "+(x.available?"Inapatikana":"Haipo sasa");const edit=document.createElement("button");edit.className="mf-btn";edit.textContent="Hariri";edit.addEventListener("click",()=>{ $("mfItemId").value=x.id;$("mfItemName").value=x.item_name;$("mfDescription").value=x.description;$("mfCategory").value=x.category;$("mfPrice").value=x.price_tzs;$("mfPortion").value=x.portion_name;$("mfCancelEdit").style.display="inline-block";$("mfMenuForm").scrollIntoView({behavior:"smooth"});});const del=document.createElement("button");del.className="mf-btn";del.textContent="Futa";del.addEventListener("click",async()=>{if(!confirm("Futa chakula hiki kwenye menyu?"))return;try{await api("delete_menu_item",{item_id:x.id});loadMyMenu();}catch(err){status("mfMenuStatus",err.message,true);}});card.append(label,edit,del);host.appendChild(card);});if(!(d.menu||[]).length)host.textContent="Bado hujaweka chakula kwenye menyu."; }catch(e){status("mfMenuStatus",e.message,true);}}
  $("mfMenuForm").addEventListener("submit",async e=>{e.preventDefault();const b=$("mfSaveItem");b.disabled=true;status("mfMenuStatus","Inahifadhi chakula…");try{const payload={item_id:$("mfItemId").value,item_name:$("mfItemName").value,description:$("mfDescription").value,category:$("mfCategory").value,price_tzs:Number($("mfPrice").value),portion_name:$("mfPortion").value};const file=$("mfPhoto").files[0];if(file){if(file.size>5*1024*1024)throw new Error("Picha isizidi MB 5.");payload.image_base64=await fileBase64(file);payload.image_mime=file.type;}const d=await api("save_menu_item",payload);status("mfMenuStatus",d.message);$("mfMenuForm").reset();$("mfItemId").value="";$("mfCancelEdit").style.display="none";await loadMyMenu();await loadMenu();}catch(err){status("mfMenuStatus",err.message,true);}finally{b.disabled=false;}});
  $("mfCancelEdit").addEventListener("click",()=>{$("mfMenuForm").reset();$("mfItemId").value="";$("mfCancelEdit").style.display="none";});
  $("mfOpenToggle").addEventListener("click",async()=>{try{const d=await api("set_open",{is_open:!currentVendor?.is_open});currentVendor.is_open=d.is_open;$("mfOpenToggle").textContent=d.is_open?"Nimefungua • Funga":"Nimefunga • Fungua";}catch(e){status("mfMenuStatus",e.message,true);}});
  $("mfFulfillment").addEventListener("change",()=>{$("mfAddressWrap").style.display=$("mfFulfillment").value==="delivery"?"grid":"none";});
  $("mfCheckout").addEventListener("submit",async e=>{e.preventDefault();if(!cart.length)return;const b=$("mfSendOrder");b.disabled=true;status("mfCartStatus","Inatuma oda…");try{const d=await api("place_order",{items:cart.map(x=>({menu_item_id:x.id,quantity:x.quantity})),buyer_name:$("mfBuyerName").value.trim(),buyer_phone:$("mfBuyerPhone").value.trim(),buyer_note:$("mfBuyerNote").value.trim(),fulfillment_method:$("mfFulfillment").value,delivery_address:$("mfAddress").value.trim()});status("mfCartStatus",d.message);cart=[];renderCart();await loadOrders();}catch(err){status("mfCartStatus",err.message,true);}finally{b.disabled=false;}});
  function renderOrders(host,orders,seller){
    host.replaceChildren();if(!orders.length){host.textContent="Hakuna oda mpya kwa sasa.";return;}
    orders.forEach(o=>{const card=document.createElement("article");card.className="mf-order";const title=document.createElement("b");title.textContent=(seller?o.buyer_name:o.vendor_name||"Mama Chakula")+" • "+money(o.total_tzs);const meta=document.createElement("p");meta.textContent="Hali: "+(statusLabels[o.status]||o.status)+" • "+new Date(o.created_at).toLocaleString("sw-TZ")+" • "+(o.fulfillment_method==="delivery"?"Kupelekewa: "+(o.delivery_address||""): "Kuchukulia");const lines=document.createElement("p");lines.textContent=(o.items||[]).map(x=>x.item_name+" × "+x.quantity+" "+x.portion_name+" ("+money(x.total_tzs)+")").join(" • ");card.append(title,meta,lines);if(seller&&o.buyer_phone){const phone=document.createElement("p");phone.textContent="Simu ya mteja: "+o.buyer_phone;card.appendChild(phone);}if(o.buyer_note){const note=document.createElement("p");note.textContent="Maelekezo: "+o.buyer_note;card.appendChild(note);}if(!seller&&o.vendor_phone){const call=document.createElement("a");call.className="mf-btn";call.href="tel:"+o.vendor_phone;call.textContent="Piga Mama Chakula";call.style.display="inline-block";call.style.textDecoration="none";card.appendChild(call);}if(seller){const actions=document.createElement("div");actions.className="mf-row";const next={new:[["accepted","Kubali oda"],["rejected","Kataa"]],accepted:[["preparing","Anza kuandaa"]],preparing:[["ready","Chakula kiko tayari"]],ready:[["completed","Kamilisha oda"]]}[o.status]||[];next.forEach(([st,label])=>{const b=document.createElement("button");b.className="mf-btn mf-primary";b.textContent=label;b.addEventListener("click",async()=>{b.disabled=true;try{await api("update_order_status",{order_id:o.id,status:st});await loadOrders();}catch(err){alert(err.message);b.disabled=false;}});actions.appendChild(b);});card.appendChild(actions);}card.appendChild(document.createElement("div"));host.appendChild(card);});
  }
  async function loadOrders(){try{const d=await api("my_orders");renderOrders($("mfBuyerOrders"),d.buyer_orders||[],false);renderOrders($("mfSellerOrders"),d.seller_orders||[],true);(d.seller_orders||[]).forEach(o=>{if(o.status==="new"&&!seenSeller.has(o.id)&&seenSeller.size>0&&"Notification"in window&&Notification.permission==="granted")new Notification("I|ONE • Oda mpya ya chakula",{body:o.buyer_name+" ametuma oda mpya."});seenSeller.add(o.id);});}catch(e){$("mfBuyerOrders").textContent=e.message;$("mfSellerOrders").textContent=e.message;}}
  $("mfRefreshMenu").addEventListener("click",loadMenu);$("mfRefreshOrders").addEventListener("click",loadOrders);$("mfRefreshSellerOrders").addEventListener("click",loadOrders);$("mfCheckStatus").addEventListener("click",checkStatus);
  $("mfClose").addEventListener("click",close);root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
  $("mfJoinSubmit").addEventListener("click",()=>{});
  $("mfFulfillment").dispatchEvent(new Event("change"));
  function installAuthority(){
    const host=document.querySelector("#authorityPressPanel .authority-panel-inner");
    if(!host||$("mfAuthoritySection"))return;
    const section=document.createElement("section");section.id="mfAuthoritySection";section.className="authority-panel-section";
    section.innerHTML='<div class="authority-section-kicker">I|ONE • MAMA CHAKULA</div><h3>MAMA CHAKULA • MALIPO NA RUHUSA</h3><p class="authority-section-note">Kagua malipo ya mkono ya TZS 1,000 na uruhusu huduma kwa siku 30. Sehemu hii ni tofauti na Mama Sokoni.</p><button type="button" class="authority-action-button" id="mfAuthorityRefresh">SASISHA MAMA CHAKULA</button><div id="mfAuthorityStatus" class="mf-status" role="status"></div><div id="mfAuthorityRequests"></div><h3 style="margin-top:18px">MAMA CHAKULA WALIOSAJILIWA</h3><div id="mfAuthorityVendors"></div>';
    host.appendChild(section);
    $("mfAuthorityRefresh").addEventListener("click",loadAuthority);
  }
  async function loadAuthority(){
    const box=$("mfAuthorityRequests"),statusBox=$("mfAuthorityStatus");if(!box)return;box.textContent="Inapakia maombi…";
    try{const d=await api("authority_dashboard",{},true);box.replaceChildren();(d.requests||[]).forEach(r=>{const card=document.createElement("article");card.className="is-admin-request";const title=document.createElement("strong");title.textContent=r.business_name;const details=document.createElement("p");details.textContent="Simu: "+r.phone_number+" • TZS "+Number(r.amount_tzs).toLocaleString("en-TZ")+" • Siku "+r.period_days;const date=document.createElement("p");date.textContent=new Date(r.created_at).toLocaleString("sw-TZ");const actions=document.createElement("div");actions.className="is-admin-actions";[["approve","THIBITISHA MALIPO NA RUHUSU"],["reject","KATAA"]].forEach(([action,label])=>{const b=document.createElement("button");b.type="button";b.textContent=label;if(action==="reject")b.className="reject";b.addEventListener("click",async()=>{b.disabled=true;try{const note=action==="reject"?(prompt("Sababu ya kukataa (si lazima):")||""):"";const out=await api(action,{request_id:r.id,note},true);statusBox.textContent=out.message;await loadAuthority();}catch(e){statusBox.textContent=e.message;statusBox.classList.add("error");b.disabled=false;}});actions.appendChild(b);});card.append(title,details,date,actions);box.appendChild(card);});if(!(d.requests||[]).length)box.textContent="Hakuna ombi la malipo linalosubiri.";const vendors=$("mfAuthorityVendors");vendors.replaceChildren();(d.vendors||[]).forEach(v=>{const row=document.createElement("div");row.className="is-admin-request";row.textContent=v.business_name+" • "+v.phone_number+" • "+v.status+" • "+(v.paid_until?new Date(v.paid_until).toLocaleDateString("sw-TZ"):"Bado haijaidhinishwa");vendors.appendChild(row);});}catch(e){statusBox.textContent=e.message;statusBox.classList.add("error");box.textContent="";}}
  const observer=new MutationObserver(installAuthority);observer.observe(document.body,{childList:true,subtree:true});installAuthority();
  function wireCategory(){
    const category=[...document.querySelectorAll("#ioneSokoniOverlay .is-category")].find(el=>el.querySelector("b")?.textContent.trim()==="Mama Chakula");
    if(!category||category.dataset.mamaFoodBound)return;
    category.dataset.mamaFoodBound="1";category.style.cursor="pointer";category.setAttribute("role","button");category.setAttribute("tabindex","0");category.setAttribute("aria-label","Fungua Mama Chakula");
    category.addEventListener("click",open);category.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
  }
  const categoryObserver=new MutationObserver(wireCategory);categoryObserver.observe(document.body,{childList:true,subtree:true});wireCategory();
  window.IoneMamaChakula=Object.freeze({open,close,refresh:loadMenu});
})();