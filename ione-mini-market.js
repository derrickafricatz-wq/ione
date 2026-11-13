/* I|ONE Mini Market — Swahili-first restaurant menus and food orders. */
(function () {
  "use strict";
  if (window.__ioneMiniMarketBooted) return;
  window.__ioneMiniMarketBooted = true;
  const FN = "ione-mini-market";
  const PAYMENT = { provider: "HaloPesa", merchant: "DERRICK KIPAJI OF AFRIKA & CO", number: "23544652" };
  const css = `
  #ioneMiniMarket{position:fixed;inset:0;z-index:100070;display:none;overflow:auto;overscroll-behavior:contain;background:#fff8ef;color:#38291f;font-family:Arial,sans-serif}
  #ioneMiniMarket *{box-sizing:border-box}
  .mm-shell{width:min(1040px,100%);margin:auto;padding:14px 14px calc(30px + env(safe-area-inset-bottom))}
  .mm-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0 13px;background:#fff8ef}
  .mm-brand{font-size:11px;font-weight:900;letter-spacing:2px;color:#a64d2c}
  .mm-btn{border:1px solid #d9b997;border-radius:11px;background:#f0e5d4;color:#523a29;padding:10px 13px;min-height:42px;font-weight:800;cursor:pointer}
  .mm-primary{background:#e87545;border-color:#e87545;color:white}
  .mm-hero{padding:24px;border-radius:19px;background:linear-gradient(135deg,#fff0d9,#f9d6b4);margin-bottom:13px}
  .mm-hero small{font-weight:900;letter-spacing:2px;color:#a64d2c}
  .mm-hero h1{font-size:clamp(29px,7vw,46px);line-height:1.05;margin:9px 0;color:#492c1d}
  .mm-hero p{margin:0;color:#72543e;line-height:1.6}
  .mm-tabs{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px}
  .mm-tabs button{white-space:nowrap}
  .mm-panel{padding:16px;border:1px solid #efd9c2;border-radius:16px;background:#fffdf9;margin:10px 0}
  .mm-panel h2{font-size:19px;margin:0 0 10px}
  .mm-muted{font-size:13px;line-height:1.6;color:#806a58}
  .mm-form{display:grid;gap:10px;margin-top:12px}
  .mm-form label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#654a36}
  .mm-form input,.mm-form textarea,.mm-form select{width:100%;min-height:44px;padding:11px;border:1px solid #e2c6a9;border-radius:10px;background:white;color:#38291f;font:inherit}
  .mm-form textarea{min-height:75px;resize:vertical}
  .mm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .mm-menu-track{display:flex;gap:11px;overflow-x:auto;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;padding:4px 2px 12px;scroll-snap-type:x proximity}
  .mm-menu-card{flex:0 0 min(210px,68vw);width:min(210px,68vw);overflow:hidden;border:1px solid #efd9c2;border-radius:14px;background:#fff;scroll-snap-align:start;text-align:left;padding:0;color:#38291f;cursor:pointer}
  .mm-menu-card img{display:block;width:100%;height:132px;object-fit:cover;background:#f3e5d6}
  .mm-menu-copy{display:block;padding:10px}
  .mm-menu-copy b{display:block;font-size:14px;line-height:1.3}
  .mm-menu-copy small{display:block;color:#8a6448;margin-top:5px}
  .mm-menu-copy strong{display:block;color:#b64f2c;margin-top:7px}
  .mm-menu-card:disabled{opacity:.55;cursor:not-allowed}
  .mm-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .mm-row .mm-grow{flex:1;min-width:0}
  .mm-qty{display:inline-flex;align-items:center;gap:10px}
  .mm-qty button{width:34px;height:34px;border:1px solid #dfc3a5;border-radius:9px;background:#fff4e8;font-size:18px;font-weight:900}
  .mm-order{border:1px solid #ecd6bf;border-radius:12px;padding:12px;margin:9px 0;background:#fff}
  .mm-order p{margin:6px 0;font-size:13px;line-height:1.5}
  .mm-status{min-height:20px;margin-top:9px;color:#426b3c;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
  .mm-status.error{color:#a52a22}
  .mm-cart{position:sticky;bottom:0;z-index:4;background:#fff4e6;border:1px solid #e9c8a5;border-radius:14px;padding:12px;margin-top:12px;box-shadow:0 4px 18px #8c5c3220}
  .mm-empty{padding:16px;color:#806a58;font-size:13px}
  .mm-badge{display:inline-block;border-radius:30px;padding:4px 8px;background:#f4e5d3;color:#765032;font-size:10px;font-weight:900}
  @media(min-width:760px){.mm-shell{padding:18px 24px 34px}.mm-menu-card{flex-basis:220px;width:220px}}
  `;
  const style = document.createElement("style"); style.id = "ioneMiniMarketStyles"; style.textContent = css; document.head.appendChild(style);
  const root = document.createElement("div"); root.id = "ioneMiniMarket";
  root.innerHTML = `
    <main class="mm-shell" role="dialog" aria-modal="true" aria-label="Mini Market">
      <header class="mm-head"><div class="mm-brand">I|ONE • MINI MARKET</div><button class="mm-btn" id="mmClose" type="button">Funga</button></header>
      <section class="mm-hero"><small>BIDHAA ZA KARIBU • I|ONE SOKONI</small><h1>Mini Market.</h1><p>Chagua bidhaa, weka idadi ya kipande, tuma oda moja kwa moja kwa muuzaji. Bidhaa na bei huwekwa na Mini Market mwenyewe.</p></section>
      <nav class="mm-tabs"><button class="mm-btn mm-primary" data-tab="menu">Angalia bidhaa</button><button class="mm-btn" data-tab="join">Jiunge kama Mini Market</button><button class="mm-btn" data-tab="orders">Oda zangu</button><button class="mm-btn" data-tab="seller" id="mmSellerTab" style="display:none">Dashibodi ya muuzaji</button></nav>
      <section id="mmMenuView">
        <div class="mm-panel"><div class="mm-row"><h2 class="mm-grow">Maduka yaliyo karibu</h2><button class="mm-btn" id="mmRefreshMenu">Sasisha</button></div><p class="mm-muted">Telezesha bidhaa kushoto au kulia. Chagua bidhaa kuongeza kwenye kikapu.</p><div id="mmMenuList"><div class="mm-empty">Inapakia bidhaa…</div></div></div>
        <div class="mm-cart" id="mmCart" style="display:none"><div class="mm-row"><strong class="mm-grow">Kikapu chako</strong><span id="mmCartTotal"></span></div><div id="mmCartLines"></div><form class="mm-form" id="mmCheckout">
          <label>Jina lako<input id="mmBuyerName" required maxlength="120" autocomplete="name"></label>
          <label>Namba ya simu<input id="mmBuyerPhone" required type="tel" inputmode="tel" maxlength="20" placeholder="07XXXXXXXX"></label>
          <label>Unataka kupokea vipi?<select id="mmFulfillment"><option value="pickup">Nitachukulia kwa Mini Market</option><option value="delivery">Naomba kupelekewa</option></select></label>
          <label id="mmAddressWrap" style="display:none">Anwani ya kupeleka<input id="mmAddress" maxlength="240" placeholder="Mtaa, eneo na alama ya karibu"></label>
          <label>Maelekezo ya ziada (si lazima)<textarea id="mmBuyerNote" maxlength="600" placeholder="Mfano: pilipili kidogo, bila vitunguu…"></textarea></label>
          <button class="mm-btn mm-primary" id="mmSendOrder" type="submit">Tuma oda kwa Mini Market</button>
        </form><div class="mm-status" id="mmCartStatus" role="status"></div></div>
      </section>
      <section id="mmJoinView" style="display:none"><div class="mm-panel"><h2>Usajili wa Mini Market</h2><p class="mm-muted">Ada ni TZS 1,000 kwa siku 30. Weka jina la biashara, simu na eneo. Baada ya malipo ya mkono, Authority Press itathibitisha kabla ya bidhaa yako kuonekana kwa wateja.</p>
        <form class="mm-form" id="mmJoinForm"><label>Jina la biashara / Mini Market<input id="mmBusinessName" maxlength="120" required placeholder="Mfano: Duka la Asha"></label><label>Namba ya simu<input id="mmJoinPhone" type="tel" inputmode="tel" maxlength="20" required placeholder="07XXXXXXXX"></label><label>Eneo / anwani ya duka<input id="mmLocation" maxlength="240" placeholder="Mtaa, soko au eneo ulipo"></label><button class="mm-btn mm-primary" id="mmJoinSubmit">Tuma ombi la usajili</button></form>
        <div class="mm-status" id="mmJoinStatus" role="status"></div><div class="mm-panel" style="display:none" id="mmPayment"><b>Maelekezo ya malipo ya mkono</b><p>Mtandao: <b>${PAYMENT.provider}</b><br>Jina: <b>${PAYMENT.merchant}</b><br>Namba: <b>${PAYMENT.number}</b><br>Kiasi: <b>TZS 1,000</b><br>Muda: <b>Siku 30</b></p><p class="mm-muted">Baada ya kulipa, subiri Authority Press ithibitishe. Usijaribu kuchapisha bidhaa kabla ruhusa haijafunguliwa.</p></div><button class="mm-btn" id="mmCheckStatus" type="button">Angalia hali ya usajili</button><div class="mm-status" id="mmMyStatus" role="status"></div>
      </div></section>
      <section id="mmOrdersView" style="display:none"><div class="mm-panel"><h2>Oda zangu</h2><button class="mm-btn" id="mmRefreshOrders">Sasisha oda</button><div id="mmBuyerOrders" class="mm-empty">Oda ulizotuma zitaonekana hapa.</div></div></section>
      <section id="mmSellerView" style="display:none"><div class="mm-panel"><div class="mm-row"><h2 class="mm-grow">Dashibodi ya Mini Market</h2><button class="mm-btn" id="mmOpenToggle">Nimefungua</button></div><p class="mm-muted" id="mmVendorInfo"></p>
        <h2 style="margin-top:18px">Ongeza bidhaa dukani</h2><form class="mm-form" id="mmMenuForm"><input type="hidden" id="mmItemId"><label>Jina la bidhaa<input id="mmItemName" maxlength="120" required placeholder="Chapati, wali nyama, chips…"></label><div class="mm-grid"><label>Kundi<select id="mmCategory"><option>Vyakula</option><option>Vinywaji</option><option>Usafi</option><option>Mahitaji ya nyumbani</option><option>Urembo</option><option>Vifaa</option><option>Nyingine</option></select></label><label>Bei kwa kipande / kipimo (TZS)<input id="mmPrice" type="number" min="1" step="1" required></label><label>Kipimo<input id="mmPortion" value="kipande" maxlength="30" required></label></div><label>Maelezo (si lazima)<textarea id="mmDescription" maxlength="600"></textarea></label><label>Picha ya bidhaa (JPG, PNG au WebP; hadi MB 5)<input id="mmPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="mm-row"><button class="mm-btn mm-primary" id="mmSaveItem">Hifadhi bidhaa</button><button class="mm-btn" id="mmCancelEdit" type="button" style="display:none">Ghairi uhariri</button></div></form><div class="mm-status" id="mmMenuStatus" role="status"></div><div id="mmMyMenu"></div>
      </div><div class="mm-panel"><div class="mm-row"><h2 class="mm-grow">Oda zinazoingia</h2><button class="mm-btn" id="mmRefreshSellerOrders">Sasisha</button></div><div id="mmSellerOrders" class="mm-empty">Oda za wateja zitaonekana hapa.</div></div></section>
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
    ["menu","join","orders","seller"].forEach(x => { const el = $(`mm${x[0].toUpperCase()+x.slice(1)}View`); if (el) el.style.display = x === tab ? "block" : "none"; });
    root.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("mm-primary", b.dataset.tab === tab));
    if (tab === "menu") loadMenu();
    if (tab === "orders") loadOrders();
    if (tab === "seller") { loadMyMenu(); loadOrders(); }
  }
  function open() { root.style.display = "block"; document.body.style.overflow = "hidden"; showTab("menu"); checkStatus(); if (refreshTimer) clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (root.style.display !== "none") { loadMenu(); if ($("mmSellerView").style.display !== "none") loadOrders(); } }, 25000); }
  function close() { root.style.display = "none"; document.body.style.overflow = ""; if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
  function renderMenu(menu) {
    const host = $("mmMenuList"); host.replaceChildren();
    if (!menu.length) { const e=document.createElement("div");e.className="mm-empty";e.textContent="Bado hakuna bidhaa zilizowekwa. Rudi tena baadaye.";host.appendChild(e);return; }
    const byVendor = new Map();
    menu.forEach(x => { const list=byVendor.get(x.vendor_id)||[];list.push(x);byVendor.set(x.vendor_id,list); });
    for (const [vendorId, items] of byVendor) {
      const section=document.createElement("section");section.style.margin="16px 0";
      const head=document.createElement("div");head.className="mm-row";
      const name=document.createElement("h2");name.className="mm-grow";name.style.fontSize="17px";name.textContent=items[0].vendor_name;
      const openBadge=document.createElement("span");openBadge.className="mm-badge";openBadge.textContent=items[0].vendor_is_open?"INAPOKEA ODA":"IMEFUNGWA KWA SASA";
      head.append(name,openBadge);section.appendChild(head);
      if(items[0].vendor_phone){const call=document.createElement("a");call.className="mm-btn";call.href="tel:"+String(items[0].vendor_phone).replace(/[^+0-9]/g,"");call.textContent="Piga simu • "+items[0].vendor_phone;call.style.display="inline-flex";call.style.textDecoration="none";section.appendChild(call);}
      if(items[0].vendor_location){const loc=document.createElement("p");loc.className="mm-muted";loc.textContent=items[0].vendor_location;section.appendChild(loc);}
      const track=document.createElement("div");track.className="mm-menu-track";
      items.forEach(item=>{
        const card=document.createElement("button");card.type="button";card.className="mm-menu-card";card.disabled=!item.vendor_is_open;
        if(item.photo_url){const img=document.createElement("img");img.src=item.photo_url;img.alt=item.item_name;img.loading="lazy";card.appendChild(img);}
        const copy=document.createElement("span");copy.className="mm-menu-copy";
        const n=document.createElement("b");n.textContent=item.item_name;
        const d=document.createElement("small");d.textContent=item.description||item.category+" • "+item.unit_name;
        const p=document.createElement("strong");p.textContent=money(item.price_tzs)+" / "+item.unit_name;
        copy.append(n,d,p);card.appendChild(copy);card.addEventListener("click",()=>addToCart(item));track.appendChild(card);
      });
      section.append(head,track);host.appendChild(section);
    }
  }
  async function loadMenu() { const host=$("mmMenuList"); if(!menuCache.length)host.textContent="Inapakia bidhaa…"; try { const d=await api("public_products");menuCache=d.menu||[];renderMenu(menuCache); } catch(e){host.textContent=e.message;} }
  function addToCart(item) {
    if(cart.length && cart[0].vendor_id!==item.vendor_id){ if(!confirm("Kikapu chako kina bidhaa cha Mini Market mwingine. Safisha kikapu na uanze oda mpya?"))return;cart=[]; }
    const line=cart.find(x=>x.id===item.id); if(line)line.quantity++;else cart.push({...item, id:item.id, quantity:1});
    renderCart();
  }
  function renderCart() {
    const panel=$("mmCart");panel.style.display=cart.length?"block":"none";
    const host=$("mmCartLines");host.replaceChildren();
    let total=0;
    cart.forEach(x=>{total+=x.price_tzs*x.quantity;const row=document.createElement("div");row.className="mm-row";row.style.padding="6px 0";
      const label=document.createElement("span");label.className="mm-grow";label.textContent=x.item_name+" • "+money(x.price_tzs);
      const qty=document.createElement("span");qty.className="mm-qty";
      const minus=document.createElement("button");minus.type="button";minus.textContent="−";minus.addEventListener("click",()=>{x.quantity--;if(x.quantity<=0)cart=cart.filter(y=>y.id!==x.id);renderCart();});
      const count=document.createElement("b");count.textContent=String(x.quantity);
      const plus=document.createElement("button");plus.type="button";plus.textContent="+";plus.addEventListener("click",()=>{x.quantity++;renderCart();});
      qty.append(minus,count,plus);row.append(label,qty);host.appendChild(row);
    });
    $("mmCartTotal").textContent=money(total);
  }
  function fileBase64(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=reject;reader.readAsDataURL(file);}); }
  async function checkStatus() {
    try { const d=await api("my_status");currentVendor=d.vendor||null;
      if(d.active){$("mmSellerTab").style.display="inline-block";$("mmPayment").style.display="none";status("mmMyStatus","Ruhusa yako inatumika hadi "+new Date(d.vendor.paid_until).toLocaleDateString("sw-TZ")+". Dashibodi ya muuzaji imefunguliwa.");}
      else { $("mmSellerTab").style.display="none";const pending=(d.requests||[]).some(x=>x.status==="pending");status("mmMyStatus",pending?"Ombi lako linasubiri Authority Press kuthibitisha malipo.":"Bado huna ruhusa hai ya Mini Market."); }
    } catch(e){status("mmMyStatus",e.message,true);}
  }
  $("mmJoinForm").addEventListener("submit",async e=>{e.preventDefault();const b=$("mmJoinSubmit");b.disabled=true;status("mmJoinStatus","Inatuma ombi…");try{const d=await api("submit",{business_name:$("mmBusinessName").value.trim(),phone_number:$("mmJoinPhone").value.trim(),location_text:$("mmLocation").value.trim()});$("mmPayment").style.display="block";status("mmJoinStatus",d.message||"Ombi limepokelewa.");}catch(err){status("mmJoinStatus",err.message,true);}finally{b.disabled=false;}});
  async function loadMyMenu(){try{const d=await api("my_products");currentVendor=d.vendor;$("mmVendorInfo").textContent=currentVendor.business_name+" • "+(currentVendor.location_text||"Eneo halijawekwa");$("mmOpenToggle").textContent=currentVendor.is_open?"Nimefungua • Funga":"Nimefunga • Fungua";const host=$("mmMyMenu");host.replaceChildren();(d.menu||[]).forEach(x=>{const card=document.createElement("div");card.className="mm-order mm-row";const label=document.createElement("span");label.className="mm-grow";label.textContent=x.item_name+" • "+money(x.price_tzs)+" / "+x.unit_name+" • "+(x.available?"Inapatikana":"Haipo sasa");const edit=document.createElement("button");edit.className="mm-btn";edit.textContent="Hariri";edit.addEventListener("click",()=>{ $("mmItemId").value=x.id;$("mmItemName").value=x.item_name;$("mmDescription").value=x.description;$("mmCategory").value=x.category;$("mmPrice").value=x.price_tzs;$("mmPortion").value=x.unit_name;$("mmCancelEdit").style.display="inline-block";$("mmMenuForm").scrollIntoView({behavior:"smooth"});});const del=document.createElement("button");del.className="mm-btn";del.textContent="Futa";del.addEventListener("click",async()=>{if(!confirm("Futa bidhaa hii dukani?"))return;try{await api("delete_product",{item_id:x.id});loadMyMenu();}catch(err){status("mmMenuStatus",err.message,true);}});card.append(label,edit,del);host.appendChild(card);});if(!(d.menu||[]).length)host.textContent="Bado hujaweka bidhaa dukani."; }catch(e){status("mmMenuStatus",e.message,true);}}
  $("mmMenuForm").addEventListener("submit",async e=>{e.preventDefault();const b=$("mmSaveItem");b.disabled=true;status("mmMenuStatus","Inahifadhi bidhaa…");try{const payload={item_id:$("mmItemId").value,item_name:$("mmItemName").value,description:$("mmDescription").value,category:$("mmCategory").value,price_tzs:Number($("mmPrice").value),unit_name:$("mmPortion").value};const file=$("mmPhoto").files[0];if(file){if(file.size>5*1024*1024)throw new Error("Picha isizidi MB 5.");payload.image_base64=await fileBase64(file);payload.image_mime=file.type;}const d=await api("save_product",payload);status("mmMenuStatus",d.message);$("mmMenuForm").reset();$("mmItemId").value="";$("mmCancelEdit").style.display="none";await loadMyMenu();await loadMenu();}catch(err){status("mmMenuStatus",err.message,true);}finally{b.disabled=false;}});
  $("mmCancelEdit").addEventListener("click",()=>{$("mmMenuForm").reset();$("mmItemId").value="";$("mmCancelEdit").style.display="none";});
  $("mmOpenToggle").addEventListener("click",async()=>{try{const d=await api("set_open",{is_open:!currentVendor?.is_open});currentVendor.is_open=d.is_open;$("mmOpenToggle").textContent=d.is_open?"Nimefungua • Funga":"Nimefunga • Fungua";}catch(e){status("mmMenuStatus",e.message,true);}});
  $("mmFulfillment").addEventListener("change",()=>{$("mmAddressWrap").style.display=$("mmFulfillment").value==="delivery"?"grid":"none";});
  $("mmCheckout").addEventListener("submit",async e=>{e.preventDefault();if(!cart.length)return;const b=$("mmSendOrder");b.disabled=true;status("mmCartStatus","Inatuma oda…");try{const d=await api("place_order",{items:cart.map(x=>({product_id:x.id,quantity:x.quantity})),buyer_name:$("mmBuyerName").value.trim(),buyer_phone:$("mmBuyerPhone").value.trim(),buyer_note:$("mmBuyerNote").value.trim(),fulfillment_method:$("mmFulfillment").value,delivery_address:$("mmAddress").value.trim()});status("mmCartStatus",d.message);cart=[];renderCart();await loadOrders();}catch(err){status("mmCartStatus",err.message,true);}finally{b.disabled=false;}});
  function renderOrders(host,orders,seller){
    host.replaceChildren();if(!orders.length){host.textContent="Hakuna oda mpya kwa sasa.";return;}
    orders.forEach(o=>{const card=document.createElement("article");card.className="mm-order";const title=document.createElement("b");title.textContent=(seller?o.buyer_name:o.vendor_name||"Mini Market")+" • "+money(o.total_tzs);const meta=document.createElement("p");meta.textContent="Hali: "+(statusLabels[o.status]||o.status)+" • "+new Date(o.created_at).toLocaleString("sw-TZ")+" • "+(o.fulfillment_method==="delivery"?"Kupelekewa: "+(o.delivery_address||""): "Kuchukulia");const lines=document.createElement("p");lines.textContent=(o.items||[]).map(x=>x.item_name+" × "+x.quantity+" "+x.unit_name+" ("+money(x.total_tzs)+")").join(" • ");card.append(title,meta,lines);
      if(seller&&o.buyer_phone){const phone=document.createElement("p");phone.textContent="Simu ya mteja: "+o.buyer_phone;card.appendChild(phone);const callBuyer=document.createElement("a");callBuyer.className="mm-btn mm-primary";callBuyer.href="tel:"+String(o.buyer_phone).replace(/[^+0-9]/g,"");callBuyer.textContent="Mpigie mteja";callBuyer.style.display="inline-flex";callBuyer.style.alignItems="center";callBuyer.style.justifyContent="center";callBuyer.style.textDecoration="none";callBuyer.style.margin="5px 6px 5px 0";callBuyer.setAttribute("aria-label","Mpigie mteja "+o.buyer_name);card.appendChild(callBuyer);}if(o.buyer_note){const note=document.createElement("p");note.textContent="Maelekezo: "+o.buyer_note;card.appendChild(note);}if(!seller&&o.vendor_phone){const call=document.createElement("a");call.className="mm-btn";call.href="tel:"+o.vendor_phone;call.textContent="Piga Mini Market";call.style.display="inline-block";call.style.textDecoration="none";card.appendChild(call);}if(seller){const actions=document.createElement("div");actions.className="mm-row";const next={new:[["accepted","Kubali oda"],["rejected","Kataa"]],accepted:[["preparing","Anza kuandaa"]],preparing:[["ready","Bidhaa ziko tayari"]],ready:[["completed","Kamilisha oda"]]}[o.status]||[];next.forEach(([st,label])=>{const b=document.createElement("button");b.className="mm-btn mm-primary";b.textContent=label;b.addEventListener("click",async()=>{b.disabled=true;try{await api("update_order_status",{order_id:o.id,status:st});await loadOrders();}catch(err){alert(err.message);b.disabled=false;}});actions.appendChild(b);});card.appendChild(actions);}card.appendChild(document.createElement("div"));host.appendChild(card);});
  }
  async function loadOrders(){try{const d=await api("my_orders");renderOrders($("mmBuyerOrders"),d.buyer_orders||[],false);renderOrders($("mmSellerOrders"),d.seller_orders||[],true);(d.seller_orders||[]).forEach(o=>{if(o.status==="new"&&!seenSeller.has(o.id)&&seenSeller.size>0&&"Notification"in window&&Notification.permission==="granted")new Notification("I|ONE • Oda mpya ya bidhaa",{body:o.buyer_name+" ametuma oda mpya."});seenSeller.add(o.id);});}catch(e){$("mmBuyerOrders").textContent=e.message;$("mmSellerOrders").textContent=e.message;}}
  $("mmRefreshMenu").addEventListener("click",loadMenu);$("mmRefreshOrders").addEventListener("click",loadOrders);$("mmRefreshSellerOrders").addEventListener("click",loadOrders);$("mmCheckStatus").addEventListener("click",checkStatus);
  $("mmClose").addEventListener("click",close);root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
  $("mmJoinSubmit").addEventListener("click",()=>{});
  $("mmFulfillment").dispatchEvent(new Event("change"));
  function installAuthority(){
    const host=document.querySelector("#authorityPressPanel .authority-panel-inner");
    if(!host||$("mmAuthoritySection"))return;
    const section=document.createElement("section");section.id="mmAuthoritySection";section.className="authority-panel-section";
    section.innerHTML='<div class="authority-section-kicker">I|ONE • MINI MARKET</div><h3>MINI MARKET • MALIPO NA RUHUSA</h3><p class="authority-section-note">Kagua malipo ya mkono ya TZS 1,000 na uruhusu huduma kwa siku 30. Sehemu hii ni tofauti na Mama Sokoni.</p><button type="button" class="authority-action-button" id="mmAuthorityRefresh">SASISHA MINI MARKET</button><div id="mmAuthorityStatus" class="mm-status" role="status"></div><div id="mmAuthorityRequests"></div><h3 style="margin-top:18px">MINI MARKET WALIOSAJILIWA</h3><div id="mmAuthorityVendors"></div>';
    host.appendChild(section);
    $("mmAuthorityRefresh").addEventListener("click",loadAuthority);
  }
  async function loadAuthority(){
    const box=$("mmAuthorityRequests"),statusBox=$("mmAuthorityStatus");if(!box)return;box.textContent="Inapakia maombi…";
    try{const d=await api("authority_dashboard",{},true);box.replaceChildren();(d.requests||[]).forEach(r=>{const card=document.createElement("article");card.className="is-admin-request";const title=document.createElement("strong");title.textContent=r.business_name;const details=document.createElement("p");details.textContent="Simu: "+r.phone_number+" • TZS "+Number(r.amount_tzs).toLocaleString("en-TZ")+" • Siku "+r.period_days;const date=document.createElement("p");date.textContent=new Date(r.created_at).toLocaleString("sw-TZ");const actions=document.createElement("div");actions.className="is-admin-actions";[["approve","THIBITISHA MALIPO NA RUHUSU"],["reject","KATAA"]].forEach(([action,label])=>{const b=document.createElement("button");b.type="button";b.textContent=label;if(action==="reject")b.className="reject";b.addEventListener("click",async()=>{b.disabled=true;try{const note=action==="reject"?(prompt("Sababu ya kukataa (si lazima):")||""):"";const out=await api(action,{request_id:r.id,note},true);statusBox.textContent=out.message;await loadAuthority();}catch(e){statusBox.textContent=e.message;statusBox.classList.add("error");b.disabled=false;}});actions.appendChild(b);});card.append(title,details,date,actions);box.appendChild(card);});if(!(d.requests||[]).length)box.textContent="Hakuna ombi la malipo linalosubiri.";const vendors=$("mmAuthorityVendors");vendors.replaceChildren();(d.vendors||[]).forEach(v=>{const row=document.createElement("div");row.className="is-admin-request";row.textContent=v.business_name+" • "+v.phone_number+" • "+v.status+" • "+(v.paid_until?new Date(v.paid_until).toLocaleDateString("sw-TZ"):"Bado haijaidhinishwa");vendors.appendChild(row);});}catch(e){statusBox.textContent=e.message;statusBox.classList.add("error");box.textContent="";}}
  const observer=new MutationObserver(installAuthority);observer.observe(document.body,{childList:true,subtree:true});installAuthority();
  function wireCategory(){
    const category=[...document.querySelectorAll("#ioneSokoniOverlay .is-category")].find(el=>el.querySelector("b")?.textContent.trim()==="Mini Market");
    if(!category||category.dataset.miniMarketBound)return;
    category.dataset.miniMarketBound="1";category.style.cursor="pointer";category.setAttribute("role","button");category.setAttribute("tabindex","0");category.setAttribute("aria-label","Fungua Mini Market");
    category.addEventListener("click",open);category.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
  }
  const categoryObserver=new MutationObserver(wireCategory);categoryObserver.observe(document.body,{childList:true,subtree:true});wireCategory();
  window.IoneMiniMarket=Object.freeze({open,close,refresh:loadMenu});
})();