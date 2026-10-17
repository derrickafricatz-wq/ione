/* I|ONE Sokoni — isolated Swahili-first vendor onboarding and market entry.
   Vendor access is granted only by the protected ione-sokoni Edge Function. */
(function () {
  "use strict";
  if (window.__ioneSokoniBooted) return;
  window.__ioneSokoniBooted = true;

  const css = `
  #openSokoni.ione-sokoni-tile{background:#153d31!important;border:1px solid #48765a!important;color:#f3fff8!important}\n  #openSokoni.ione-sokoni-tile .smart-icon{color:#b6e7c3!important}\n  #ioneSokoniOverlay{position:fixed;inset:0;z-index:100050;display:none;background:#071713;color:#f3fff8;font-family:Arial,sans-serif;overflow:auto;overscroll-behavior:contain}
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
  .is-card{padding:20px;border:1px solid #294d39;border-radius:18px;background:#0c1e16;margin-top:14px;box-shadow:0 7px 20px rgba(39,65,45,.055)}
  .is-card h2{font-size:20px;margin:0 0 9px}
  /* Clear visual zones only; existing forms, IDs, actions and data flow stay untouched. */
  #ioneSokoniOverlay .is-card:has(#isVendorForm){border:2px solid #b7d6a1;background:#fbfff7}
  #ioneSokoniOverlay .is-card:has(#isSellerTools),#ioneSokoniOverlay .is-card:has(#isProductForm){border:2px solid #b7d6a1;background:#fbfff7}
  #ioneSokoniOverlay .is-card:has(#isProductCatalog),#ioneSokoniOverlay .is-card:has(#isOrderForm),#ioneSokoniOverlay .is-card:has(#isBuyerOrders){border:2px solid #efc28e;background:#fffaf2}
  #ioneSokoniOverlay .is-card:has(#isRefreshRiders){border:2px solid #c8b4e8;background:#fcf9ff}
  #ioneSokoniOverlay .is-card:has(#isVendorForm)>h2:before,
  #ioneSokoniOverlay .is-card:has(#isSellerTools)>h2:before{content:"MUUZAJI • ";display:block;margin-bottom:7px;color:#42753a;font-size:10px;letter-spacing:1.6px}
  #ioneSokoniOverlay .is-card:has(#isProductCatalog)>h2:before,
  #ioneSokoniOverlay .is-card:has(#isOrderForm)>h2:before,
  #ioneSokoniOverlay .is-card:has(#isBuyerOrders)>h2:before{content:"MNUNUZI • ";display:block;margin-bottom:7px;color:#a85d22;font-size:10px;letter-spacing:1.6px}
  #ioneSokoniOverlay .is-card:has(#isRefreshRiders)>h2:before{content:"BODA YANGU • ";display:block;margin-bottom:7px;color:#77539e;font-size:10px;letter-spacing:1.6px}
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
  .is-product{display:grid;grid-template-columns:82px minmax(0,1fr);gap:12px;align-items:start;padding:12px;border:1px solid #274d36;border-radius:12px;background:#091a11}
  .is-product img{width:82px;height:82px;object-fit:cover;border-radius:9px;background:#183323}
  .is-product strong{display:block;overflow-wrap:anywhere}
  .is-product p{font-size:12px;color:#b7d1c0;line-height:1.5;margin:5px 0}
  .is-product-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
  .is-product-actions button{border:1px solid #477d61;border-radius:8px;background:#10271c;color:#effff4;padding:8px 10px;font-weight:800}

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
  .is-boda-panel{padding:16px;border:1px solid #efcfad;border-radius:18px;background:#fffdf8;margin:16px 0;box-shadow:0 7px 20px rgba(115,77,37,.06)}
  .is-boda-board{border-color:#e8bd8e;background:linear-gradient(150deg,#fffaf2,#fffdf9)}
  .is-boda-passenger{border-color:#edc69c;background:#fffaf3}
  .is-boda-register{border-color:#c8dcb8;background:#fbfff7}
  .is-boda-dashboard{border-color:#a8c99c;background:#f5fff2}
  .is-boda-heading{display:flex;gap:12px;align-items:center;margin-bottom:10px}
  .is-boda-heading>span{display:grid;place-items:center;width:46px;height:46px;flex:0 0 46px;border-radius:14px;background:#f6e0c5;font-size:24px}
  .is-boda-heading h2{margin:0 0 5px!important;font-size:21px}
  .is-boda-heading p{margin:0;color:#725b4b;font-size:12px;line-height:1.55}
  .is-boda-title{margin:0 0 10px;font-size:19px;color:#68452c}
  .is-boda-panel .is-payment{margin:12px 0}
  .is-boda-panel .is-muted{line-height:1.6}
  @media(max-width:620px){.is-sections{grid-template-columns:1fr}.is-category{min-height:auto}.is-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.is-hero{padding:22px}.is-admin-actions button{flex:1}}
  /* Warm, friendly Sokoni market palette and a tidy nine-tile home arrangement. */
    #ioneSokoniOverlay{background:#fff7ec!important;color:#3d2b20!important}
    #ioneSokoniOverlay .is-hero{background:#ffefd8;border-color:#f0c99d;color:#3d2b20}
    #ioneSokoniOverlay .is-hero p,#ioneSokoniOverlay .is-muted{color:#725b4b}
    #ioneSokoniOverlay .is-brand,#ioneSokoniOverlay .is-kicker{color:#a54d2b}
    #ioneSokoniOverlay .is-card,#ioneSokoniOverlay .is-category,#ioneSokoniOverlay .is-vendor,#ioneSokoniOverlay .is-product,#ioneSokoniOverlay .is-admin-request,#ioneSokoniOverlay .is-metric{background:#fffdfa;border-color:#f0d5b7;color:#3d2b20}
    #ioneSokoniOverlay .is-form label{color:#654a38}
    #ioneSokoniOverlay .is-form input,#ioneSokoniOverlay .is-form select{background:#fffdfa;color:#3d2b20;border-color:#e5c5a4}
    #ioneSokoniOverlay .is-button,#ioneSokoniOverlay .is-close{background:#e7f2d9;color:#31583a;border-color:#b9d4a3}
    #ioneSokoniOverlay .is-button.primary{background:#ef8b5b;color:#fff;border-color:#ef8b5b}
    #ioneSokoniOverlay .is-payment{background:#fff2d7;border-color:#edce88;color:#604323}
    #ioneSokoniOverlay .is-payment strong{color:#604323}
    #ioneSokoniOverlay .is-status{color:#426c43}
    #ioneSokoniOverlay .is-status.error{color:#a32222}
    #ioneSokoniOverlay .is-vendor small,#ioneSokoniOverlay .is-product p,#ioneSokoniOverlay .is-admin-request p,#ioneSokoniOverlay .is-metric span{color:#725b4b}
    #ioneSokoniOverlay .is-admin-actions button{background:#e7f2d9;color:#31583a;border-color:#b9d4a3}
    #ioneSokoniOverlay .is-admin-actions .reject{background:#fff0ec;color:#a32222;border-color:#e9b7ab}
    .smart-grid #openSokoni{order:1}
    .smart-grid #openAfrilink{order:2}
    .smart-grid #openTranscript{order:3}
    .smart-grid #openHealth{order:4}
    .smart-grid #openAuthority{order:5}
    .smart-grid #openIoneGift{order:6}
    .smart-grid #openIoneSupport{order:7}
    .smart-grid #openBusBooking{order:8}
    .smart-grid #openFlightBooking{order:9}
    @media(min-width:760px){.smart-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}}
    @media(max-width:759px){.smart-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}}
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
      <div class="is-top"><div class="is-brand">I|ONE • SOKONI</div><button class="is-close" id="isClose" type="button">Funga</button></div>
      <section class="is-hero">
        <div class="is-kicker">SOKO LA KARIBU • I|ONE</div>
        <h1 id="isTitle">Karibu Sokoni.</h1>
        <p>Nunua na uza karibu nawe. Pata mboga na matunda, chakula kilichoandaliwa, na huduma ya bodaboda katika sehemu moja.</p>
      </section>
      <section class="is-sections" aria-label="Huduma za Sokoni">
        <div class="is-category"><div aria-hidden="true">🥬</div><b>Mama Sokoni</b><span>Mboga, matunda na bidhaa za kila siku kutoka kwa wauzaji waliothibitishwa.</span></div>
        <div class="is-category"><div aria-hidden="true">🍲</div><b>Mama wa Pishi</b><span>Chakula, chapati, supu na vitafunwa vya karibu nawe.</span></div>
        <div class="is-category"><div aria-hidden="true">🏍️</div><b>Boda Yangu</b><span>Angalia bodaboda waliothibitishwa, omba safari ya abiria, au jiunge kama dereva. Safari hupokelewa na madereva walioidhinishwa na walio tayari.</span></div>
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
      <section class="is-card" id="isSellerTools" style="display:none">
        <h2>Bidhaa zangu</h2>
        <p class="is-muted">Weka picha halisi ya bidhaa, bei, kipimo na kiasi kilichopo. Orodha itaonekana kwa wanunuzi baada ya kuhifadhi.</p>
        <h3>Mahali pa kuchukulia bidhaa</h3>
        <p class="is-muted">Anwani na eneo hili litaonekana tu kwenye ombi la Boda Yangu linalohusiana na oda.</p>
        <form class="is-form" id="isPickupForm">
          <div><label for="isPickupAddress">Anwani ya kuchukulia</label><input id="isPickupAddress" maxlength="240" required placeholder="Jina la soko, mtaa au alama ya karibu"></div>
          <button class="is-button" type="button" id="isPickupGps">Tumia eneo langu sasa</button>
          <div class="is-muted" id="isPickupCoordinates">Eneo halijachaguliwa.</div>
          <button class="is-button" type="submit">Hifadhi eneo la kuchukulia</button>
        </form>
        <div class="is-status" id="isPickupStatus" role="status" aria-live="polite"></div>
        <form class="is-form" id="isProductForm">
          <div><label for="isProductName">Jina la bidhaa</label><input id="isProductName" maxlength="140" required placeholder="Mfano: Nyanya"></div>
          <div><label for="isProductPhoto">Picha ya bidhaa (JPG, PNG au WebP; hadi MB 5)</label><input id="isProductPhoto" type="file" accept="image/jpeg,image/png,image/webp"></div>
          <div><label for="isProductDescription">Maelezo (si lazima)</label><input id="isProductDescription" maxlength="1200" placeholder="Maelezo mafupi"></div>
          <div><label for="isProductPrice">Bei kwa TZS</label><input id="isProductPrice" type="number" min="0" step="1" inputmode="numeric" required placeholder="Bei"></div>
          <div><label for="isProductUnit">Kipimo</label><input id="isProductUnit" maxlength="40" required placeholder="Mfano: kilo, fungu, kreti, sahani"></div>
          <div><label for="isProductStock">Kiasi kilichopo</label><input id="isProductStock" type="number" min="0" step="0.1" required placeholder="Mfano: 10"></div>
          <button class="is-button primary" type="submit" id="isProductSave">Hifadhi bidhaa</button>
          <button class="is-button" type="button" id="isProductCancel" style="display:none">Ghairi uhariri</button>
        </form>
        <div class="is-status" id="isProductStatus" role="status" aria-live="polite"></div>
        <div class="is-vendors" id="isMyProducts"><p class="is-muted">Bidhaa ulizohifadhi zitaonekana hapa.</p></div>
        <h2 style="margin-top:22px">Maombi ya wanunuzi</h2>
        <p class="is-muted">Kubali ombi tu ikiwa bidhaa ipo. Kiasi cha bidhaa kitapunguzwa baada ya kukubali oda.</p>
        <button class="is-button" type="button" id="isRefreshSellerOrders">Sasisha maombi</button>
        <div class="is-vendors" id="isSellerOrders"><p class="is-muted">Maombi ya wanunuzi yataonekana hapa.</p></div>
      </section>
      <section class="is-card">
        <h2>Wauzaji waliothibitishwa</h2>
        <p class="is-muted">Orodha itaonyesha wauzaji ambao ruhusa yao ya Sokoni bado inatumika.</p>
        <button class="is-button" type="button" id="isRefreshVendors">Sasisha orodha</button>
        <div class="is-vendors" id="isVendorList"><p class="is-muted">Bonyeza “Sasisha orodha” ili kuona wauzaji waliothibitishwa.</p></div>
      </section>
      <section class="is-card">
        <h2>Bidhaa zinazopatikana Sokoni</h2>
        <p class="is-muted">Bidhaa kutoka kwa wauzaji wenye ruhusa hai. Bei na kiasi huwekwa na muuzaji.</p>
        <button class="is-button" type="button" id="isRefreshProducts">Sasisha bidhaa</button>
        <div class="is-vendors" id="isProductCatalog"><p class="is-muted">Bonyeza “Sasisha bidhaa” ili kuona bidhaa zinazopatikana.</p></div>
      </section>
      <section class="is-card" id="isOrderPanel" style="display:none">
        <h2>Omba bidhaa</h2>
        <p class="is-muted" id="isOrderProductLabel"></p>
        <form class="is-form" id="isOrderForm">
          <div><label for="isBuyerName">Jina lako</label><input id="isBuyerName" maxlength="120" required placeholder="Andika jina lako"></div>
          <div><label for="isBuyerPhone">Namba ya simu</label><input id="isBuyerPhone" type="tel" inputmode="tel" maxlength="20" required placeholder="Mfano: 07XXXXXXXX"></div>
          <div><label for="isOrderQuantity">Kiasi unachohitaji</label><input id="isOrderQuantity" type="number" min="0.001" step="0.001" value="1" required></div>
          <div><label for="isOrderNote">Maelezo ya ziada (si lazima)</label><input id="isOrderNote" maxlength="500" placeholder="Mfano: rangi, ukubwa au muda wa kuchukua"></div>
          <label style="display:flex;align-items:center;gap:10px"><input id="isWantsDelivery" type="checkbox" style="width:20px;min-height:20px"> Nahitaji bodaboda kuleta bidhaa</label>
          <div id="isDeliveryDestinationFields" style="display:none">
            <label for="isDeliveryAddress">Anwani ya kupeleka</label><input id="isDeliveryAddress" maxlength="240" placeholder="Mtaa, eneo na alama ya karibu">
            <button class="is-button" type="button" id="isBuyerGps">Tumia GPS yangu kwa eneo la kupeleka</button>
            <div class="is-muted" id="isBuyerCoordinates">Eneo la kupeleka halijachaguliwa.</div>
          </div>
          <button class="is-button primary" type="submit" id="isOrderSubmit">Tuma ombi kwa muuzaji</button>
          <button class="is-button" type="button" id="isOrderCancel">Ghairi</button>
        </form>
        <div class="is-status" id="isOrderStatus" role="status" aria-live="polite"></div>
      </section>
      <section class="is-card">
        <h2>Maombi yangu ya bidhaa</h2>
        <p class="is-muted">Oda ulizotuma na hali yake zitaonekana hapa.</p>
        <button class="is-button" type="button" id="isRefreshBuyerOrders">Sasisha oda zangu</button>
        <div class="is-vendors" id="isBuyerOrders"><p class="is-muted">Oda zako zitaonekana hapa.</p></div>
      </section>
      <section class="is-card">
        <div class="is-boda-panel is-boda-board">
        <div class="is-boda-heading"><span>🏍️</span><div><h2>Boda Yangu</h2><p>Orodha ya madereva waliothibitishwa na walio tayari kupokea safari.</p></div></div>
        <p class="is-muted">Waendesha bodaboda huanza kupokea safari baada ya kuthibitishwa na Authority Press. Ada ya safari itaonyeshwa tofauti na bei ya bidhaa, na muuzaji pamoja na mnunuzi lazima waikubali kabla ya kuchukua bidhaa.</p>
        <button class="is-button" type="button" id="isRefreshRiders">Angalia bodaboda waliopo</button>
        <div class="is-vendors" id="isPublicRiders"><p class="is-muted">Orodha ya bodaboda itasasishwa hapa.</p></div>
        </div>
        <div class="is-boda-panel is-boda-passenger">
        <h3 class="is-boda-title">Omba safari ya abiria</h3>
        <p class="is-muted">Weka eneo la kuanzia na unakoenda. Dereva na abiria watajadiliana nauli moja kwa moja; malipo hayapiti Authority Press.</p>
        <form class="is-form" id="isPassengerTripForm">
          <div><label for="isPassengerName">Jina lako</label><input id="isPassengerName" maxlength="120" required placeholder="Jina kamili"></div>
          <div><label for="isPassengerPhone">Namba ya simu</label><input id="isPassengerPhone" type="tel" inputmode="tel" maxlength="20" required placeholder="07XXXXXXXX"></div>
          <div><label for="isPassengerPickupArea">Eneo la kuchukuliwa</label><input id="isPassengerPickupArea" maxlength="180" required placeholder="Mfano: Mlimani City, Dar es Salaam"></div>
          <button class="is-button" id="isPassengerPickupGps" type="button">Tumia GPS ya eneo la kuchukuliwa</button>
          <div class="is-status" id="isPassengerPickupStatus" role="status" aria-live="polite"></div>
          <div><label for="isPassengerDestination">Unakoenda</label><input id="isPassengerDestination" maxlength="180" required placeholder="Jina la eneo unakoenda"></div>
          <div><label for="isPassengerNote">Maelezo ya ziada (si lazima)</label><input id="isPassengerNote" maxlength="500" placeholder="Alama ya eneo au maelekezo"></div>
          <button class="is-button primary" type="submit" id="isPassengerTripSubmit">Tuma ombi la safari</button>
        </form>
        <div class="is-status" id="isPassengerTripStatus" role="status" aria-live="polite"></div>
        <h3 style="margin-top:22px">Safari za abiria nilizoomba</h3>
        <button class="is-button" type="button" id="isRefreshPassengerTrips">Sasisha safari za abiria</button>
        <div class="is-vendors" id="isPassengerTrips"><p class="is-muted">Maombi na makubaliano ya safari yataonekana hapa.</p></div>
        </div>
        <div class="is-boda-panel is-boda-register">
        <h3 class="is-boda-title">Jiunge kama dereva wa bodaboda</h3>
        <p class="is-muted">Ada ya usajili ni <strong>TZS 5,000 kwa miezi mitatu (siku 90)</strong>. Jaza taarifa zako kwanza, kisha lipa kwa kutumia maelekezo yaliyo hapa chini. Authority Press itakagua taarifa na kuthibitisha malipo kabla ya kukupa ruhusa.</p>
        <div class="is-payment" id="isRiderPaymentInstructions" style="display:block">
          <strong>MAELEKEZO YA MALIPO YA BODA YANGU</strong><br>
          Mtoa huduma / Mtandao: <strong>Airtel Money</strong><br>
          Jina la mfanyabiashara: <strong>DERRICK KIPAJI OF AFRIKA &amp; CO</strong><br>
          Namba ya malipo: <strong>140001788</strong><br>
          Ada: <strong>TZS 5,000</strong><br>
          Muda wa ruhusa: <strong>Miezi 3 (siku 90)</strong><br>
          Baada ya kutuma maombi, lipa ada hii. Ruhusa haitafunguliwa mpaka Authority Press ithibitishe malipo kwa mkono.
        </div>
        <form class="is-form" id="isRiderForm">
          <div><label for="isRiderName">Jina kamili</label><input id="isRiderName" maxlength="120" required autocomplete="name" placeholder="Andika jina lako kamili"></div>
          <div><label for="isRiderPhone">Namba yako ya simu</label><input id="isRiderPhone" type="tel" inputmode="tel" maxlength="20" required placeholder="Mfano: 07XXXXXXXX"></div>
          <div><label for="isRiderDocumentType">Chagua kitambulisho kimoja</label><select id="isRiderDocumentType" required><option value="">Chagua aina ya kitambulisho</option><option value="driving_license">Leseni ya udereva</option><option value="national_id">Kitambulisho cha Taifa (NIDA)</option><option value="rider_group_id">Kitambulisho cha kikundi cha bodaboda</option></select></div>
          <div><label for="isRiderProfileFile">Pakia picha yako ya wasifu</label><input id="isRiderProfileFile" type="file" accept="image/jpeg,image/png,image/webp" required><small class="is-muted">Picha itaonekana kwa watumiaji wa Sokoni. Tumia picha yako halisi, hadi MB 3.</small></div>
          <div><label for="isRiderIdentityFile">Pakia picha au PDF ya kitambulisho</label><input id="isRiderIdentityFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><small class="is-muted">Faili la faragha, hadi MB 5. Litaonekana kwa Authority Press pekee.</small></div>
          <div><label for="isRiderPlate">Namba ya usajili wa pikipiki</label><input id="isRiderPlate" maxlength="24" required placeholder="Mfano: MC 123 ABC"></div>
          <div><label for="isRiderGroup">Jina la kikundi cha bodaboda</label><input id="isRiderGroup" maxlength="140" required placeholder="Jina la kikundi chako"></div>
          <div><label for="isRiderChairmanPhone">Namba ya simu ya mwenyekiti wa kikundi</label><input id="isRiderChairmanPhone" type="tel" inputmode="tel" maxlength="20" required placeholder="Mfano: 07XXXXXXXX"></div>
          <button class="is-button primary" type="submit" id="isRiderSubmit">Tuma maombi ya bodaboda</button>
        </form>
        <div class="is-status" id="isRiderApplyStatus" role="status" aria-live="polite"></div>
        </div>
        <div id="isRiderDashboard" class="is-boda-panel is-boda-dashboard" style="display:none;margin-top:16px">
          <h3>Eneo la dereva</h3>
          <div class="is-status" id="isRiderStatus" role="status" aria-live="polite"></div>
          <button class="is-button" type="button" id="isRiderAvailability">Washa upatikanaji</button>
          <form class="is-form" id="isRiderProfileUpdateForm" style="margin:12px 0">
            <div><label for="isRiderProfileUpdateFile">Sasisha picha ya wasifu wa bodaboda</label><input id="isRiderProfileUpdateFile" type="file" accept="image/jpeg,image/png,image/webp" required><small class="is-muted">Picha hii itaonekana kwa watumiaji wa Sokoni. JPG, PNG au WEBP hadi MB 3.</small></div>
            <button class="is-button" type="submit" id="isRiderProfileUpdateSubmit">Sasisha picha ya wasifu</button>
          </form>
          <div class="is-status" id="isRiderProfileUpdateStatus" role="status" aria-live="polite"></div>
          <button class="is-button" type="button" id="isRefreshOpenTrips">Sasisha maombi ya safari</button>
          <div class="is-vendors" id="isOpenTrips"></div>
        <h3 style="margin-top:22px">Safari zangu</h3>
        <button class="is-button" type="button" id="isRefreshDeliveries">Sasisha safari</button>
        <div class="is-vendors" id="isMyDeliveries"><p class="is-muted">Safari ulizohusika nazo zitaonekana hapa.</p></div>
        <div id="isLiveMap" style="display:none;width:100%;height:300px;border-radius:14px;overflow:hidden;margin-top:14px;background:#dce8df"></div>
        <div class="is-status" id="isMapStatus" role="status" aria-live="polite"></div>
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
    loadProductCatalog();
    loadMyOrders();
    loadPublicRiders();
    loadRiderStatus();
    loadPassengerTrips();
    if (sokoniRefreshHandle) clearInterval(sokoniRefreshHandle);
    sokoniRefreshHandle = setInterval(() => { if (overlay.style.display !== "none") { loadMyOrders(); loadMyDeliveries(); loadPublicRiders(); loadPassengerTrips(); invoke("rider_heartbeat").catch(() => {}); if ($("isRiderDashboard").style.display !== "none") loadOpenTrips(); } }, 20000);
  }
  function close() {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (sokoniRefreshHandle) { clearInterval(sokoniRefreshHandle); sokoniRefreshHandle = null; }
    if (riderWatchId !== null && navigator.geolocation) { navigator.geolocation.clearWatch(riderWatchId); riderWatchId = null; }
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
  const sokoniTranslations = {
    "Method not allowed.":"Njia ya ombi hairuhusiwi.",
    "Server configuration is missing.":"Huduma haijasanidiwa kikamilifu. Tafadhali jaribu baadaye.",
    "Invalid request.":"Ombi si sahihi.",
    "Your session is not ready. Please reload and try again.":"Kipindi chako hakijawa tayari. Pakia ukurasa upya kisha ujaribu tena.",
    "Your session is not ready. Reload and try again.":"Kipindi chako hakijawa tayari. Pakia ukurasa upya kisha ujaribu tena.",
    "Your session is not ready. Please reload and try again.":"Kipindi chako hakijawa tayari. Pakia ukurasa upya kisha ujaribu tena.",
    "Please enter your name and a valid Tanzania phone number.":"Weka jina lako na namba sahihi ya simu ya Tanzania.",
    "Could not check your Sokoni access.":"Imeshindikana kukagua ruhusa yako ya Sokoni.",
    "Could not check your existing request.":"Imeshindikana kukagua ombi lako la awali.",
    "Your request is already waiting for Authority Press to confirm payment.":"Ombi lako tayari linasubiri Authority Press ithibitishe malipo.",
    "A request is already pending. Refresh to check its status.":"Tayari una ombi linalosubiri. Sasisha ukurasa kuangalia hali yake.",
    "We could not submit your request. Please try again.":"Imeshindikana kutuma ombi lako. Tafadhali jaribu tena.",
    "Request received. Pay TZS 1,000 using the official I|ONE manual payment instructions. Access opens only after Authority Press confirms receipt.":"Ombi limepokelewa. Lipa TZS 1,000 kwa kutumia maelekezo rasmi ya malipo ya I|ONE. Ruhusa itafunguliwa baada ya Authority Press kuthibitisha kupokea malipo.",
    "Could not load your Sokoni status.":"Imeshindikana kupakia hali yako ya Sokoni.",
    "Could not load Sokoni products.":"Imeshindikana kupakia bidhaa za Sokoni.",
    "Could not load verified sellers.":"Imeshindikana kupakia wauzaji waliothibitishwa.",
    "Could not load your product listings.":"Imeshindikana kupakia bidhaa zako.",
    "Could not verify your vendor access.":"Imeshindikana kuthibitisha ruhusa yako ya muuzaji.",
    "Your Sokoni access is not active. Contact Authority Press to renew.":"Ruhusa yako ya Sokoni haitumiki. Wasiliana na Authority Press ili kuhuisha.",
    "Enter a product name, valid price, unit and available quantity.":"Weka jina la bidhaa, bei sahihi, kipimo na kiasi kilichopo.",
    "Product not found in your own listings.":"Bidhaa haikupatikana kwenye orodha yako.",
    "Choose a JPG, PNG or WebP photo up to 5 MB.":"Chagua picha ya JPG, PNG au WebP isiyozidi MB 5.",
    "Product photos must be 5 MB or smaller.":"Picha ya bidhaa haipaswi kuzidi MB 5.",
    "Could not upload product photo. Try a smaller image.":"Imeshindikana kupakia picha. Jaribu picha ndogo zaidi.",
    "Could not save product listing.":"Imeshindikana kuhifadhi bidhaa.",
    "Product listing saved.":"Bidhaa imehifadhiwa.",
    "Could not remove product listing.":"Imeshindikana kufuta bidhaa.",
    "Product removed.":"Bidhaa imefutwa.",
    "Enter your name, valid phone number and a valid quantity.":"Weka jina, namba sahihi ya simu na kiasi sahihi.",
    "For Boda Yangu, enter the delivery address and share your current map location.":"Kwa Boda Yangu, weka anwani ya kupeleka na uchague eneo lako kwenye ramani.",
    "This product is unavailable or the requested quantity is no longer in stock.":"Bidhaa haipatikani au kiasi ulichoomba hakipo tena.",
    "You cannot order your own listing.":"Huwezi kuagiza bidhaa uliyoiorodhesha mwenyewe.",
    "This seller's Sokoni access is not currently active.":"Ruhusa ya Sokoni ya muuzaji huyu haitumiki kwa sasa.",
    "Could not send your order request. Please retry.":"Imeshindikana kutuma oda. Tafadhali jaribu tena.",
    "Ombi limetumwa kwa muuzaji. Muuzaji atapitia ombi na kuwasiliana nawe kwa namba uliyotoa.":"Ombi limetumwa kwa muuzaji. Atalipitia na kuwasiliana nawe kwa namba uliyotoa.",
    "Could not load Sokoni order requests.":"Imeshindikana kupakia oda za Sokoni.",
    "Invalid order update.":"Mabadiliko ya oda si sahihi.",
    "Active Sokoni vendor access is required.":"Unahitaji ruhusa hai ya muuzaji wa Sokoni.",
    "Order request not found in your seller account.":"Oda haikupatikana kwenye akaunti yako ya muuzaji.",
    "This order cannot be changed to that status.":"Hali hii haiwezi kutumika kwenye oda hiyo.",
    "Another action already updated this order. Refresh and retry.":"Oda imesasishwa na hatua nyingine. Sasisha kisha ujaribu tena.",
    "Not enough stock remains to accept this order.":"Bidhaa iliyobaki haitoshi kukubali oda hii.",
    "Stock changed while accepting. Refresh the order and try again.":"Kiasi cha bidhaa kimebadilika. Sasisha oda kisha ujaribu tena.",
    "Order accepted and stock updated.":"Oda imekubaliwa na kiasi cha bidhaa kimesasishwa.",
    "Order status was not saved. Refresh and try again.":"Hali ya oda haikuhifadhiwa. Sasisha kisha ujaribu tena.",
    "Enter the pickup address and share its map location.":"Weka anwani ya kuchukulia bidhaa na uchague eneo lake kwenye ramani.",
    "Could not save the pickup location.":"Imeshindikana kuhifadhi eneo la kuchukulia bidhaa.",
    "Pickup location saved for Boda Yangu requests.":"Eneo la kuchukulia bidhaa limehifadhiwa kwa maombi ya Boda Yangu.",
    "Enter your name and a valid Tanzania phone number.":"Weka jina lako na namba sahihi ya simu ya Tanzania.",
    "Your Boda Yangu rider profile already exists. Check its status below.":"Taarifa zako za dereva wa Boda Yangu tayari zipo. Angalia hali yake hapa chini.",
    "Your rider application is already waiting for Authority Press.":"Ombi lako la udereva tayari linasubiri Authority Press.",
    "Could not submit the rider application. Please retry.":"Imeshindikana kutuma ombi la udereva. Tafadhali jaribu tena.",
    "Rider application submitted. Authority Press must verify you before you can receive trips.":"Ombi la udereva limetumwa. Authority Press lazima ikuthibitishe kabla ya kupokea safari.",
    "Could not load rider status.":"Imeshindikana kupakia hali ya dereva.",
    "Only Authority Press verified riders can change availability.":"Madereva waliothibitishwa na Authority Press pekee ndio wanaoweza kuwasha upatikanaji.",
    "Complete your current trip before becoming available again.":"Kamilisha safari uliyonayo kabla ya kupokea nyingine.",
    "Could not update rider availability.":"Imeshindikana kusasisha upatikanaji wa dereva.",
    "Could not load the available rider board.":"Imeshindikana kupakia orodha ya bodaboda waliopo.",
    "This order is not available in your account.":"Oda hii haipatikani kwenye akaunti yako.",
    "This accepted order does not have a valid delivery destination.":"Oda iliyokubaliwa haina eneo sahihi la kupeleka bidhaa.",
    "The seller must save a valid pickup address and map location before requesting Boda Yangu.":"Muuzaji lazima ahifadhi anwani na eneo sahihi la kuchukulia kabla ya kuomba Boda Yangu.",
    "A Boda Yangu request already exists for this order.":"Tayari kuna ombi la Boda Yangu kwa oda hii.",
    "Could not send the delivery request.":"Imeshindikana kutuma ombi la usafirishaji.",
    "Delivery request sent to available verified riders. Delivery fee will be shown separately and must be confirmed by both sides.":"Ombi la usafirishaji limetumwa kwa madereva waliothibitishwa na walio tayari. Ada itaonyeshwa kando na lazima ikubaliwe na mnunuzi na muuzaji.",
    "Turn on your availability to see delivery requests.":"Washa upatikanaji wako ili kuona maombi ya safari.",
    "Could not load delivery requests.":"Imeshindikana kupakia maombi ya safari.",
    "Only available, verified riders with a recent heartbeat can accept trips.":"Madereva waliothibitishwa, walio tayari na waliothibitisha upatikanaji hivi karibuni pekee ndio wanaoweza kukubali safari.",
    "Finish your current trip before accepting another.":"Kamilisha safari uliyonayo kabla ya kukubali nyingine.",
    "Your rider account is already reserved for another trip. Refresh the board.":"Akaunti yako ya dereva imehifadhiwa kwa safari nyingine. Sasisha orodha.",
    "Another rider accepted this trip first. Refresh the board.":"Dereva mwingine amekubali safari hii kwanza. Sasisha orodha.",
    "Enter a valid delivery fee in TZS.":"Weka ada sahihi ya usafirishaji kwa TZS.",
    "Only the assigned rider can set the fee before pickup.":"Dereva aliyepewa safari pekee ndiye anayeweza kuweka ada kabla ya kuchukua bidhaa.",
    "Could not save the delivery fee.":"Imeshindikana kuhifadhi ada ya usafirishaji.",
    "Delivery fee proposed. Buyer and seller must both confirm it.":"Ada ya usafirishaji imependekezwa. Mnunuzi na muuzaji wote wawili lazima waikubali.",
    "A delivery fee must be proposed first, and only the buyer or seller can confirm it.":"Lazima ada ipendekezwe kwanza; mnunuzi au muuzaji pekee ndiye anayeweza kuithibitisha.",
    "Could not confirm the delivery fee.":"Imeshindikana kuthibitisha ada ya usafirishaji.",
    "Your delivery-fee confirmation has been saved.":"Uthibitisho wako wa ada ya usafirishaji umehifadhiwa.",
    "Pickup is locked until both buyer and seller confirm the delivery fee.":"Kuchukua bidhaa kumezuiwa hadi mnunuzi na muuzaji wote wakubali ada.",
    "Mark the parcel picked up before marking it delivered.":"Thibitisha kwanza kuwa bidhaa imechukuliwa kabla ya kusema imefikishwa.",
    "Invalid GPS coordinates.":"Taarifa za GPS si sahihi.",
    "Live location is available only on your assigned trip after the delivery fee is confirmed.":"Eneo la moja kwa moja linapatikana kwenye safari uliyopewa tu baada ya ada kuthibitishwa.",
    "Trip is no longer active; live location sharing has stopped.":"Safari haipo tena kwenye shughuli; kushiriki eneo kumesimama.",
    "Could not load your delivery trips.":"Imeshindikana kupakia safari zako.",
    "Only the buyer or seller can complete a delivered trip.":"Mnunuzi au muuzaji pekee ndiye anayeweza kukamilisha safari iliyofikishwa.",
    "Could not complete the delivery.":"Imeshindikana kukamilisha usafirishaji.",
    "Delivery completed. Live location sharing has stopped.":"Usafirishaji umekamilika. Kushiriki eneo la moja kwa moja kumesimama.",
    "Authority Press session expired. Unlock Authority Press again.":"Kipindi cha Authority Press kimeisha. Fungua Authority Press tena.",
    "Could not load Sokoni dashboard data.":"Imeshindikana kupakia taarifa za dashibodi ya Sokoni.",
    "Could not calculate confirmed Sokoni payments.":"Imeshindikana kuhesabu malipo yaliyothibitishwa ya Sokoni.",
    "This rider application has already been reviewed.":"Ombi hili la dereva tayari limekaguliwa.",
    "Rider application rejected.":"Ombi la dereva limekataliwa.",
    "Rider verified. They can now sign in to Boda Yangu and turn availability on.":"Dereva amethibitishwa. Sasa anaweza kuingia Boda Yangu na kuwasha upatikanaji.",
    "This request has already been reviewed. Refresh the dashboard.":"Ombi hili tayari limekaguliwa. Sasisha dashibodi.",
    "Could not save the decision. Please retry.":"Imeshindikana kuhifadhi uamuzi. Tafadhali jaribu tena.",
    "Request marked as not approved.":"Ombi limewekwa kuwa halijaidhinishwa.",
    "Could not verify vendor record.":"Imeshindikana kuthibitisha taarifa za muuzaji.",
    "Payment decision could not activate vendor access. No approval was recorded; retry safely.":"Uamuzi wa malipo haukuweza kufungua ruhusa ya muuzaji. Hakuna idhini iliyorekodiwa; kagua taarifa kisha ujaribu tena.",
    "Approval was rolled back because payment history could not be saved. Refresh and retry after checking the record.":"Idhini imerudishwa nyuma kwa sababu historia ya malipo haikuhifadhiwa. Kagua rekodi, sasisha kisha ujaribu tena.",
    "Payment confirmed and Sokoni access activated for 30 days.":"Malipo yamethibitishwa na ruhusa ya Sokoni imefunguliwa kwa siku 30.",
    "Unknown Sokoni action.":"Hatua ya Sokoni haijatambuliwa.",
    "Sokoni is temporarily unavailable. Please try again.":"Sokoni haipatikani kwa muda. Tafadhali jaribu tena."
  };
  function swahiliMessage(value) {
    const message = String(value || "");
    return sokoniTranslations[message] || message;
  }
  async function invoke(action, extra) {
    await readySession();
    const result = await heavensSupabase.functions.invoke("ione-sokoni", { body: Object.assign({ action }, extra || {}) });
    if (result.error) {
      let message = result.data?.error || "";
      const response = result.error.context;
      if (!message && response && typeof response.clone === "function") {
        try {
          const payload = await response.clone().json();
          message = payload?.error || payload?.message || "";
        } catch (_) {}
      }
      if (!message) message = result.error.message || "Ombi halikukamilika. Jaribu tena.";
      if (/edge function returned a 2xx status code/i.test(message)) {
        message = "Seva imerudisha hitilafu isiyoeleweka. Tumia akaunti tofauti na muuzaji, kisha hakikisha jina, simu, kiasi na taarifa za uwasilishaji zimejazwa.";
      }
      throw new Error(swahiliMessage(message) || "Ombi halikukamilika. Jaribu tena.");
    }
    if (!result.data || result.data.success !== true) throw new Error(swahiliMessage(result.data?.error) || "Ombi halikukamilika. Jaribu tena.");
    if (result.data.message) result.data.message = swahiliMessage(result.data.message);
    return result.data;
  }
  async function loadStatus() {
    setStatus("isMyStatus", "Inapakia hali yako…");
    try {
      const data = await invoke("my_status");
      if (data.active) {
        const date = new Date(data.vendor.paid_until).toLocaleDateString("sw-TZ", { year: "numeric", month: "long", day: "numeric" });
        setStatus("isMyStatus", "Ruhusa yako inatumika. Inaisha tarehe " + date + ". Unaweza kuendelea kwenye Sokoni.");
        $("isSellerTools").style.display = "block";
        loadMyProducts();
      } else if (data.requests?.[0]?.status === "pending") {
        $("isSellerTools").style.display = "none";
        setStatus("isMyStatus", "Ombi lako linasubiri uthibitisho wa malipo kutoka Authority Press.");
        $("isPaymentInstructions").style.display = "block";
      } else if (data.requests?.[0]?.status === "rejected") {
        $("isSellerTools").style.display = "none";
        setStatus("isMyStatus", "Ombi la mwisho halikuidhinishwa. Tafadhali wasiliana na I|ONE Support kabla ya kutuma ombi jipya.", true);
      } else {
        $("isSellerTools").style.display = "none";
        setStatus("isMyStatus", "Bado huna ruhusa inayotumika ya Sokoni. Tuma ombi la kujiunga hapo juu.");
      }
    } catch (e) {
      setStatus("isMyStatus", e.message || "Imeshindikana kupakia hali.", true);
    }
  }
  let editingProductId = null;
  function resetProductForm() {
    editingProductId = null;
    $("isProductForm").reset();
    $("isProductSave").textContent = "Hifadhi bidhaa";
    $("isProductCancel").style.display = "none";
    setStatus("isProductStatus", "");
  }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
      };
      reader.onerror = () => reject(new Error("Imeshindikana kusoma picha."));
      reader.readAsDataURL(file);
    });
  }
  function renderProductRows(container, products, own) {
    container.replaceChildren();
    if (!products.length) {
      const empty = document.createElement("p");
      empty.className = "is-muted";
      empty.textContent = own ? "Bado hujaweka bidhaa. Tumia fomu iliyo juu kuanza." : "Bado hakuna bidhaa zinazopatikana kwenye orodha.";
      container.appendChild(empty);
      return;
    }
    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "is-product";
      if (product.photo_url) {
        const img = document.createElement("img");
        img.src = product.photo_url;
        img.alt = escText(product.product_name);
        img.loading = "lazy";
        card.appendChild(img);
      } else {
        const placeholder = document.createElement("div");
        placeholder.style.cssText = "width:82px;height:82px;border-radius:9px;background:#183323;display:grid;place-items:center;color:#b6e7c3;font-size:22px";
        placeholder.textContent = "S";
        card.appendChild(placeholder);
      }
      const detail = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = escText(product.product_name);
      const price = document.createElement("p");
      price.textContent = "TZS " + Number(product.price_tzs || 0).toLocaleString("en-TZ") + " / " + escText(product.unit_name);
      const stock = document.createElement("p");
      stock.textContent = "Kiasi kilichopo: " + escText(product.stock_quantity);
      detail.append(title, price, stock);
      if (product.vendor_name) {
        const vendor = document.createElement("p");
        vendor.textContent = "Muuzaji: " + escText(product.vendor_name);
        detail.appendChild(vendor);
      }
      if (product.description) {
        const desc = document.createElement("p");
        desc.textContent = escText(product.description);
        detail.appendChild(desc);
      }
      if (own) {
        const actions = document.createElement("div");
        actions.className = "is-product-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Hariri";
        edit.addEventListener("click", () => {
          editingProductId = product.id;
          $("isProductName").value = product.product_name || "";
          $("isProductDescription").value = product.description || "";
          $("isProductPrice").value = String(product.price_tzs ?? "");
          $("isProductUnit").value = product.unit_name || "";
          $("isProductStock").value = String(product.stock_quantity ?? "");
          $("isProductPhoto").value = "";
          $("isProductSave").textContent = "Hifadhi mabadiliko";
          $("isProductCancel").style.display = "inline-block";
          $("isProductForm").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Futa";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Unataka kufuta bidhaa hii?")) return;
          try {
            const result = await invoke("delete_product", { product_id: product.id });
            setStatus("isProductStatus", result.message);
            await loadMyProducts();
            await loadProductCatalog();
          } catch (e) { setStatus("isProductStatus", e.message || "Imeshindikana kufuta bidhaa.", true); }
        });
        actions.append(edit, remove);
        detail.appendChild(actions);
      } else {
        const actions = document.createElement("div");
        actions.className = "is-product-actions";
        const order = document.createElement("button");
        order.type = "button";
        order.textContent = "Omba bidhaa";
        order.addEventListener("click", () => openOrderForm(product));
        actions.appendChild(order);
        detail.appendChild(actions);
      }
      card.appendChild(detail);
      container.appendChild(card);
    });
  }
  async function loadMyProducts() {
    const box = $("isMyProducts");
    if (!box || $("isSellerTools").style.display === "none") return;
    box.textContent = "Inapakia bidhaa zako…";
    try {
      const data = await invoke("my_products");
      renderProductRows(box, data.products || [], true);
    } catch (e) { box.textContent = e.message || "Bidhaa zako hazipatikani kwa sasa."; }
  }
  async function loadProductCatalog() {
    const box = $("isProductCatalog");
    if (!box) return;
    box.textContent = "Inapakia bidhaa…";
    try {
      const data = await invoke("public_products");
      renderProductRows(box, data.products || [], false);
    } catch (e) { box.textContent = e.message || "Bidhaa hazipatikani kwa sasa."; }
  }
  async function saveProduct(event) {
    event.preventDefault();
    const button = $("isProductSave");
    button.disabled = true;
    setStatus("isProductStatus", "Inahifadhi bidhaa…");
    try {
      const photo = $("isProductPhoto").files?.[0];
      let image_base64 = null;
      let image_mime = null;
      if (photo) {
        if (photo.size > 5 * 1024 * 1024) throw new Error("Picha lazima iwe MB 5 au chini.");
        if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) throw new Error("Tumia picha ya JPG, PNG au WebP.");
        image_base64 = await fileToBase64(photo);
        image_mime = photo.type;
      }
      const payload = {
        product_name: $("isProductName").value.trim(),
        description: $("isProductDescription").value.trim(),
        price_tzs: Number($("isProductPrice").value),
        unit_name: $("isProductUnit").value.trim(),
        stock_quantity: Number($("isProductStock").value)
      };
      if (editingProductId) payload.product_id = editingProductId;
      if (image_base64) { payload.image_base64 = image_base64; payload.image_mime = image_mime; }
      const data = await invoke("save_product", payload);
      setStatus("isProductStatus", data.message || "Bidhaa imehifadhiwa.");
      resetProductForm();
      await Promise.all([loadMyProducts(), loadProductCatalog()]);
    } catch (e) {
      setStatus("isProductStatus", e.message || "Bidhaa haikuhifadhiwa.", true);
    } finally {
      button.disabled = false;
    }
  }

  let selectedOrderProduct = null;
  let buyerDropoff = null;
  let sellerPickup = null;
  let passengerPickup = null;
  let riderWatchId = null;
  let sokoniRefreshHandle = null;
  let currentRiderId = null;
  let selectedMapTripId = null;
  function openOrderForm(product) {
    selectedOrderProduct = product;
    $("isOrderPanel").style.display = "block";
    $("isOrderProductLabel").textContent = product.product_name + " • TZS " + Number(product.price_tzs || 0).toLocaleString("en-TZ") + " / " + product.unit_name + " • Muuzaji: " + product.vendor_name;
    $("isOrderQuantity").value = "1";
    setStatus("isOrderStatus", "");
    $("isOrderPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function submitOrder(event) {
    event.preventDefault();
    if (!selectedOrderProduct) return;
    const button = $("isOrderSubmit");
    button.disabled = true;
    setStatus("isOrderStatus", "Inatuma ombi kwa muuzaji…");
    try {
      const wantsDelivery = $("isWantsDelivery").checked;
      if (wantsDelivery && (!buyerDropoff || !$("isDeliveryAddress").value.trim())) {
        throw new Error("Weka anwani ya kupeleka na bonyeza kitufe cha GPS kwanza.");
      }
      const data = await invoke("place_order", {
        product_id: selectedOrderProduct.id,
        buyer_name: $("isBuyerName").value.trim(),
        buyer_phone: $("isBuyerPhone").value.trim(),
        quantity: Number($("isOrderQuantity").value),
        buyer_note: $("isOrderNote").value.trim(),
        wants_delivery: wantsDelivery,
        delivery_address: wantsDelivery ? $("isDeliveryAddress").value.trim() : "",
        dropoff_lat: wantsDelivery ? buyerDropoff.latitude : null,
        dropoff_lng: wantsDelivery ? buyerDropoff.longitude : null
      });
      setStatus("isOrderStatus", data.message || "Ombi limetumwa.");
      $("isOrderForm").reset();
      $("isOrderPanel").style.display = "none";
      selectedOrderProduct = null;
      await loadMyOrders();
      if (data.order?.id) {
        const buyerOrdersPanel = $("isBuyerOrders");
        if (buyerOrdersPanel) buyerOrdersPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (e) { setStatus("isOrderStatus", e.message || "Ombi halikutumwa.", true); }
    finally { button.disabled = false; }
  }
  async function loadMyOrders() {
    try {
      const data = await invoke("my_orders");
      const buyerBox = $("isBuyerOrders");
      const seenOrderStatuses = window.__ioneSokoniOrderStatuses || (window.__ioneSokoniOrderStatuses = {});
      (data.buyer_orders || []).forEach((order) => {
        const previous = seenOrderStatuses[order.id];
        if (previous && previous !== order.status && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification("I|ONE Sokoni", { body: order.status === "accepted" ? "Muuzaji amekubali oda yako: " + order.product_name : order.status === "rejected" ? "Muuzaji amekataa oda yako: " + order.product_name : "Hali ya oda yako imebadilika: " + order.product_name }); } catch (_) {}
        }
        seenOrderStatuses[order.id] = order.status;
      });
      const seenSellerOrders = window.__ioneSokoniSellerOrders || (window.__ioneSokoniSellerOrders = {});
      const sellerAlertsReady = window.__ioneSokoniSellerAlertsReady === true;
      (data.seller_orders || []).forEach((order) => {
        if (sellerAlertsReady && !seenSellerOrders[order.id] && order.status === "new" && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification("I|ONE Sokoni • Oda mpya", { body: order.product_name + " • " + order.buyer_name + " ametuma ombi jipya." }); } catch (_) {}
        }
        seenSellerOrders[order.id] = order.status;
      });
      window.__ioneSokoniSellerAlertsReady = true;
      if (buyerBox) {
        buyerBox.replaceChildren();
        const buyerRows = data.buyer_orders || [];
        if (!buyerRows.length) {
          const empty = document.createElement("p");
          empty.className = "is-muted";
          empty.textContent = "Bado hujatuma oda yoyote.";
          buyerBox.appendChild(empty);
        }
        buyerRows.forEach((order) => {
          const row = document.createElement("div");
          row.className = "is-vendor";
          const title = document.createElement("strong");
          title.textContent = escText(order.product_name);
          const details = document.createElement("small");
          details.textContent = "Kiasi: " + order.quantity + " " + order.unit_name + " • Jumla: TZS " + Number(order.total_tzs || 0).toLocaleString("en-TZ") + " • Hali: " + orderStatusSw(order.status);
          row.append(title, details);
          if (order.status === "new" && order.seller_phone) {
            const call = document.createElement("a");
            call.className = "is-button";
            call.href = "tel:" + String(order.seller_phone).replace(/[^+0-9]/g, "");
            call.textContent = "Piga simu kwa Mama Sokoni";
            call.style.display = "inline-flex"; call.style.alignItems = "center"; call.style.justifyContent = "center"; call.style.textDecoration = "none"; call.style.marginTop = "8px";
            row.appendChild(call);
          }
          if (order.wants_delivery && order.status === "accepted") {
            const delivery = document.createElement("button"); delivery.type = "button"; delivery.className = "is-button primary"; delivery.textContent = "Omba Boda Yangu";
            delivery.addEventListener("click", async () => { delivery.disabled = true; try { const result = await invoke("request_delivery", { order_id: order.id }); setStatus("isOrderStatus", result.message || "Ombi la bodaboda limetumwa."); await loadMyDeliveries(); } catch (e) { setStatus("isOrderStatus", e.message || "Ombi la bodaboda halikutumwa.", true); delivery.disabled = false; } });
            row.appendChild(delivery);
          }
          buyerBox.appendChild(row);
        });
      }
      const sellerBox = $("isSellerOrders");
      if (sellerBox && $("isSellerTools").style.display !== "none") {
        sellerBox.replaceChildren();
        const sellerRows = data.seller_orders || [];
        if (!sellerRows.length) {
          const empty = document.createElement("p");
          empty.className = "is-muted";
          empty.textContent = "Bado hakuna maombi ya wanunuzi.";
          sellerBox.appendChild(empty);
        }
        sellerRows.forEach((order) => {
          const row = document.createElement("div");
          row.className = "is-vendor";
          const title = document.createElement("strong");
          title.textContent = escText(order.product_name) + " • " + order.quantity + " " + order.unit_name;
          const details = document.createElement("small");
          details.textContent = "Mnunuzi: " + escText(order.buyer_name) + " • " + escText(order.buyer_phone) + " • Jumla: TZS " + Number(order.total_tzs || 0).toLocaleString("en-TZ") + " • Hali: " + orderStatusSw(order.status);
          const note = document.createElement("p");
          note.textContent = order.buyer_note ? "Maelezo: " + order.buyer_note : "";
          row.append(title, details, note);
          if (order.wants_delivery && order.status === "accepted") {
            const delivery = document.createElement("button"); delivery.type = "button"; delivery.className = "is-button primary"; delivery.textContent = "Omba Boda Yangu";
            delivery.addEventListener("click", async () => { delivery.disabled = true; try { const result = await invoke("request_delivery", { order_id: order.id }); setStatus("isProductStatus", result.message || "Ombi la bodaboda limetumwa."); await loadMyDeliveries(); } catch (e) { setStatus("isProductStatus", e.message || "Ombi la bodaboda halikutumwa.", true); delivery.disabled = false; } });
            row.appendChild(delivery);
          }
          if (order.status === "new" || order.status === "accepted") {
            const actions = document.createElement("div");
            actions.className = "is-product-actions";
            const action = (label, status) => {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = label;
              button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                  const result = await invoke("update_order_status", { order_id: order.id, status });
                  setStatus("isProductStatus", result.message || "Oda imesasishwa.");
                  await Promise.all([loadMyOrders(), loadMyProducts(), loadProductCatalog()]);
                } catch (e) { setStatus("isProductStatus", e.message || "Oda haikubadilishwa.", true); button.disabled = false; }
              });
              return button;
            };
            if (order.status === "new") {
              actions.append(action("Kubali oda", "accepted"), action("Kataa", "rejected"));
            } else {
              actions.append(action("Weka imekamilika", "completed"));
            }
            row.appendChild(actions);
          }
          sellerBox.appendChild(row);
        });
      }
    } catch (e) {
      const buyerBox = $("isBuyerOrders");
      if (buyerBox) buyerBox.textContent = e.message || "Oda hazipatikani kwa sasa.";
    }
  }
  function orderStatusSw(status) {
    return ({ new: "Inasubiri", accepted: "Imekubaliwa", rejected: "Imekataliwa", completed: "Imekamilika" })[status] || status;
  }

  function captureGps(statusId, onSuccess) {
    if (!navigator.geolocation) { setStatus(statusId, "Kifaa hiki hakiungi mkono GPS.", true); return; }
    setStatus(statusId, "Inatafuta eneo lako…");
    navigator.geolocation.getCurrentPosition((position) => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      onSuccess(coords);
      setStatus(statusId, "Eneo limechaguliwa. Linatafuta jina la eneo…");
      fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + encodeURIComponent(coords.latitude) + "&lon=" + encodeURIComponent(coords.longitude) + "&zoom=16&addressdetails=1", { headers: { "Accept": "application/json" } })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Geocoding unavailable")))
        .then((place) => {
          const a = place.address || {};
          const area = a.neighbourhood || a.suburb || a.village || a.town || a.city_district || a.city || a.municipality || a.county || a.state;
          const passengerPickupField = document.getElementById("isPassengerPickupArea");
          if (area && passengerPickupField && !passengerPickupField.value.trim()) passengerPickupField.value = area;
          setStatus(statusId, area ? "Eneo: " + area : "Eneo limechaguliwa kwenye ramani.");
        }).catch(() => setStatus(statusId, "Eneo limechaguliwa kwenye ramani."));
    }, () => setStatus(statusId, "GPS haijapatikana. Ruhusu eneo kwenye kivinjari kisha jaribu tena.", true), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }
  async function loadPublicRiders() {
    const box = $("isPublicRiders");
    try {
      const data = await invoke("public_riders");
      box.replaceChildren();
      if (!data.riders?.length) {
        const empty = document.createElement("p"); empty.className = "is-muted";
        empty.textContent = "Hakuna bodaboda aliyethibitisha upatikanaji hivi sasa. Tafadhali angalia tena baadaye.";
        box.appendChild(empty); return;
      }
      data.riders.forEach((rider) => {
        const row = document.createElement("div"); row.className = "is-vendor";
        row.style.display = "flex"; row.style.alignItems = "center"; row.style.gap = "12px";
        if (rider.profile_url) {
          const photo = document.createElement("img");
          photo.src = rider.profile_url; photo.alt = "Picha ya " + rider.rider_name;
          photo.loading = "lazy"; photo.width = 64; photo.height = 64;
          photo.style.cssText = "width:64px;height:64px;object-fit:cover;border-radius:50%;border:2px solid #b9d4a3;flex:0 0 64px";
          row.appendChild(photo);
        }
        const info = document.createElement("div");
        const name = document.createElement("strong"); name.textContent = rider.rider_name;
        const status = document.createElement("small");
        status.textContent = rider.available
          ? "Amethibitishwa • yupo tayari kupokea safari"
          : "Amethibitishwa • hayupo kazini sasa";
        status.style.display = "block";
        status.style.marginTop = "4px";
        status.style.color = rider.available ? "#9bd8a6" : "#b8c4c7";
        info.append(name, status); row.appendChild(info); box.appendChild(row);
      });
    } catch (e) { box.textContent = e.message || "Orodha haipatikani."; }
  }
  async function loadRiderStatus() {
    try {
      const data = await invoke("rider_status");
      $("isRiderDashboard").style.display = data.rider ? "block" : "none";
      if (data.rider) {
        currentRiderId = data.rider.id;
        $("isRiderAvailability").dataset.available = String(!!data.rider.available);
        $("isRiderAvailability").textContent = data.rider.available ? "Zima upatikanaji" : "Washa upatikanaji";
        setStatus("isRiderStatus", data.rider.status === "active" ? (data.rider.available ? "Umeidhinishwa na upo tayari kupokea safari." : "Umeidhinishwa. Washa upatikanaji ukiwa tayari.") : "Akaunti yako imesimamishwa.", data.rider.status !== "active");
      } else if (data.application) {
        setStatus("isRiderApplyStatus", ({ pending: "Ombi lako linasubiri uthibitisho wa Authority Press.", processing: "Authority Press inakagua ombi lako.", rejected: "Ombi halikuidhinishwa. Wasiliana na I|ONE Support.", approved: "Umeidhinishwa." })[data.application.status] || "Hali ya ombi imepatikana.");
      }
      await loadMyDeliveries();
    } catch (e) { setStatus("isRiderApplyStatus", e.message || "Hali ya dereva haipatikani.", true); }
  }
  async function loadOpenTrips() {
    const box = $("isOpenTrips");
    box.replaceChildren();
    try {
      const data = await invoke("rider_open_deliveries");
      const deliveries = data.deliveries || [];
      const passengerTrips = data.passenger_trips || [];
      const seenPassengerRequests = window.__ioneSokoniRiderPassengerRequests || (window.__ioneSokoniRiderPassengerRequests = {});
      const riderTripAlertsReady = window.__ioneSokoniRiderTripAlertsReady === true;
      passengerTrips.forEach((trip) => {
        if (riderTripAlertsReady && !seenPassengerRequests[trip.id] && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification("I|ONE Boda Yangu • Abiria mpya", { body: trip.pickup_area + " → " + trip.destination_area }); } catch (_) {}
        }
        seenPassengerRequests[trip.id] = true;
      });
      window.__ioneSokoniRiderTripAlertsReady = true;
      if (!deliveries.length && !passengerTrips.length) {
        const empty = document.createElement("p"); empty.className = "is-muted";
        empty.textContent = "Hakuna ombi jipya la uwasilishaji au abiria kwa sasa."; box.appendChild(empty); return;
      }
      deliveries.forEach((trip) => {
        const row = document.createElement("article"); row.className = "is-vendor";
        const title = document.createElement("strong"); title.textContent = "Ombi la kupeleka bidhaa ya Sokoni";
        const date = document.createElement("small"); date.textContent = "Limetumwa: " + new Date(trip.created_at).toLocaleString("sw-TZ");
        const accept = document.createElement("button"); accept.type = "button"; accept.className = "is-button primary"; accept.textContent = "Kubali uwasilishaji";
        accept.addEventListener("click", async () => {
          accept.disabled = true;
          try { const result = await invoke("accept_delivery", { delivery_id: trip.id }); setStatus("isRiderStatus", result.message || "Safari imekabidhiwa kwako."); await Promise.all([loadOpenTrips(), loadMyDeliveries(), loadRiderStatus()]); }
          catch (e) { setStatus("isRiderStatus", e.message || "Safari haikukubaliwa.", true); accept.disabled = false; }
        });
        row.append(title, date, accept); box.appendChild(row);
      });
      passengerTrips.forEach((trip) => {
        const row = document.createElement("article"); row.className = "is-vendor";
        const title = document.createElement("strong"); title.textContent = trip.status === "requested" ? "Ombi jipya la abiria" : "Safari ya abiria inayoendelea";
        const route = document.createElement("p"); route.textContent = "Kutoka: " + trip.pickup_area + " • Kwenda: " + trip.destination_area;
        const passenger = document.createElement("small"); passenger.textContent = "Abiria: " + trip.passenger_name + " • " + trip.passenger_phone;
        const note = document.createElement("small"); note.textContent = trip.passenger_note || "";
        const tripStatus = document.createElement("p");
        const tripLabels = { requested: "Inasubiri dereva", accepted: "Umekubali • jadilianeni nauli", fare_proposed: "Nauli imependekezwa", fare_countered: "Nauli imejadiliwa upya", fare_agreed: "Nauli imekubaliwa • anza safari", picked_up: "Abiria amechukuliwa" };
        tripStatus.textContent = "Hali: " + (tripLabels[trip.status] || trip.status);
        row.append(title, route, passenger, note, tripStatus);
        if (Number.isFinite(Number(trip.pickup_lat)) && Number.isFinite(Number(trip.pickup_lng))) {
          const mapLink = document.createElement("a"); mapLink.href = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(trip.pickup_lat + "," + trip.pickup_lng) + "&travelmode=driving";
          mapLink.target = "_blank"; mapLink.rel = "noopener noreferrer"; mapLink.className = "is-button"; mapLink.textContent = "Fungua ramani ya eneo la abiria";
          mapLink.style.display = "inline-flex"; mapLink.style.textDecoration = "none"; row.appendChild(mapLink);
        }
        if (trip.proposed_fare_tzs) {
          const fare = document.createElement("p"); fare.textContent = "Nauli iliyopendekezwa: TZS " + Number(trip.proposed_fare_tzs).toLocaleString("en-TZ") + " • " + (trip.fare_proposed_by === "passenger" ? "Abiria" : "Dereva"); row.appendChild(fare);
        }
        if (trip.status === "requested" && !trip.rider_id) {
          const accept = document.createElement("button"); accept.type = "button"; accept.className = "is-button primary"; accept.textContent = "Kubali ombi la abiria";
          accept.addEventListener("click", async () => {
            accept.disabled = true;
            try { const result = await invoke("passenger_trip_accept", { trip_id: trip.id }); setStatus("isRiderStatus", result.message || "Ombi la abiria limekubaliwa."); await Promise.all([loadOpenTrips(), loadPassengerTrips()]); }
            catch (e) { setStatus("isRiderStatus", e.message || "Ombi halikukubaliwa.", true); accept.disabled = false; }
          });
          row.appendChild(accept);
        } else if (["accepted", "fare_proposed", "fare_countered"].includes(trip.status) && !trip.fare_agreed) {
          if (!trip.proposed_fare_tzs || trip.fare_proposed_by !== "rider") {
            const offer = document.createElement("input"); offer.type = "number"; offer.min = "100"; offer.max = "500000"; offer.step = "100"; offer.placeholder = "Pendekeza nauli (TZS)"; offer.style.cssText = "width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #e5c5a4;margin-top:8px";
            const offerBtn = document.createElement("button"); offerBtn.type = "button"; offerBtn.className = "is-button"; offerBtn.textContent = "Tuma pendekezo la nauli";
            offerBtn.addEventListener("click", async () => { offerBtn.disabled = true; try { const result = await invoke("passenger_trip_offer_fare", { trip_id: trip.id, fare_tzs: Number(offer.value) }); setStatus("isRiderStatus", result.message); await loadOpenTrips(); } catch (e) { setStatus("isRiderStatus", e.message || "Nauli haikutumwa.", true); offerBtn.disabled = false; } });
            row.append(offer, offerBtn);
          }
          if (trip.proposed_fare_tzs && trip.fare_proposed_by === "passenger") {
            const agree = document.createElement("button"); agree.type = "button"; agree.className = "is-button primary"; agree.textContent = "Kubali nauli ya abiria";
            agree.addEventListener("click", async () => { agree.disabled = true; try { const result = await invoke("passenger_trip_agree_fare", { trip_id: trip.id }); setStatus("isRiderStatus", result.message); await loadOpenTrips(); } catch (e) { setStatus("isRiderStatus", e.message || "Nauli haikukubaliwa.", true); agree.disabled = false; } });
            row.appendChild(agree);
          }
        } else if (trip.status === "fare_agreed") {
          const start = document.createElement("p"); start.textContent = "Nauli imekubaliwa. Wasiliana na abiria kisha bonyeza ‘Nimemchukua abiria’ unapoanza safari."; row.appendChild(start);
          const pickup = document.createElement("button"); pickup.type = "button"; pickup.className = "is-button primary"; pickup.textContent = "Nimemchukua abiria";
          pickup.addEventListener("click", async () => { pickup.disabled = true; try { const result = await invoke("passenger_trip_status", { trip_id: trip.id, status: "picked_up" }); setStatus("isRiderStatus", result.message); await loadOpenTrips(); } catch (e) { setStatus("isRiderStatus", e.message || "Hali haikubadilika.", true); pickup.disabled = false; } });
          row.appendChild(pickup);
        }
        row.style.marginBottom = "10px"; box.appendChild(row);
      });
    } catch (e) { box.textContent = e.message || "Maombi ya safari hayapatikani."; }
  }

  async function loadPassengerTrips() {
    const box = $("isPassengerTrips");
    if (!box) return;
    try {
      const data = await invoke("passenger_trip_list");
      box.replaceChildren();
      const trips = data.trips || [];
      if (!trips.length) { const empty = document.createElement("p"); empty.className = "is-muted"; empty.textContent = "Bado hakuna ombi la safari ya abiria."; box.appendChild(empty); return; }
      const labels = { requested: "Inasubiri dereva", accepted: "Dereva amekubali • jadilianeni nauli", fare_proposed: "Dereva amependekeza nauli", fare_countered: "Nauli imejadiliwa upya", fare_agreed: "Nauli imekubaliwa", picked_up: "Abiria amechukuliwa", completed: "Safari imekamilika", cancelled: "Safari imeghairiwa" };
      trips.forEach((trip) => {
        const row = document.createElement("article"); row.className = "is-vendor";
        const title = document.createElement("strong"); title.textContent = trip.pickup_area + " → " + trip.destination_area;
        const status = document.createElement("small"); status.textContent = "Hali: " + (labels[trip.status] || trip.status);
        row.append(title, status);
        if (trip.rider_name) {
          const rider = document.createElement("p"); rider.textContent = "Dereva: " + trip.rider_name; row.appendChild(rider);
          if (trip.is_passenger && trip.rider_phone && ["accepted","fare_proposed","fare_countered","fare_agreed","picked_up"].includes(trip.status)) {
            const call = document.createElement("a"); call.className = "is-button"; call.href = "tel:" + String(trip.rider_phone).replace(/[^+0-9]/g, ""); call.textContent = "Piga simu kwa dereva"; call.style.display = "inline-flex"; call.style.textDecoration = "none"; row.appendChild(call);
          }
        }
        if (trip.is_rider && trip.passenger_phone && ["accepted","fare_proposed","fare_countered","fare_agreed","picked_up"].includes(trip.status)) {
          const callPassenger = document.createElement("a"); callPassenger.className = "is-button"; callPassenger.href = "tel:" + String(trip.passenger_phone).replace(/[^+0-9]/g, ""); callPassenger.textContent = "Piga simu kwa abiria"; callPassenger.style.display = "inline-flex"; callPassenger.style.textDecoration = "none"; row.appendChild(callPassenger);
          if (Number.isFinite(Number(trip.pickup_lat)) && Number.isFinite(Number(trip.pickup_lng))) {
            const navigate = document.createElement("a"); navigate.className = "is-button"; navigate.href = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(trip.pickup_lat + "," + trip.pickup_lng) + "&travelmode=driving";
            navigate.target = "_blank"; navigate.rel = "noopener noreferrer"; navigate.textContent = "Nenda kumchukua abiria"; navigate.style.display = "inline-flex"; navigate.style.textDecoration = "none"; row.appendChild(navigate);
          }
        }
        if (trip.proposed_fare_tzs) {
          const fare = document.createElement("p"); fare.textContent = "Nauli iliyopendekezwa: TZS " + Number(trip.proposed_fare_tzs).toLocaleString("en-TZ") + " • " + (trip.fare_proposed_by === "rider" ? "Dereva" : "Abiria"); row.appendChild(fare);
        }
        if (!trip.fare_agreed && ["accepted","fare_proposed","fare_countered"].includes(trip.status)) {
          const offer = document.createElement("input"); offer.type = "number"; offer.min = "100"; offer.max = "500000"; offer.step = "100"; offer.placeholder = "Pendekeza nauli (TZS)"; offer.style.cssText = "width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #e5c5a4;margin-top:8px";
          const offerBtn = document.createElement("button"); offerBtn.type = "button"; offerBtn.className = "is-button"; offerBtn.textContent = "Tuma pendekezo la nauli";
          offerBtn.addEventListener("click", async () => { offerBtn.disabled = true; try { const result = await invoke("passenger_trip_offer_fare", { trip_id: trip.id, fare_tzs: Number(offer.value) }); setStatus("isPassengerTripStatus", result.message); await loadPassengerTrips(); } catch (e) { setStatus("isPassengerTripStatus", e.message || "Nauli haikutumwa.", true); offerBtn.disabled = false; } });
          row.append(offer, offerBtn);
        }
        const isOtherParty = trip.is_passenger ? trip.fare_proposed_by === "rider" : trip.fare_proposed_by === "passenger";
        if (trip.proposed_fare_tzs && !trip.fare_agreed && isOtherParty && ["fare_proposed","fare_countered"].includes(trip.status)) {
          const agree = document.createElement("button"); agree.type = "button"; agree.className = "is-button primary"; agree.textContent = "Kubali nauli";
          agree.addEventListener("click", async () => { agree.disabled = true; try { const result = await invoke("passenger_trip_agree_fare", { trip_id: trip.id }); setStatus("isPassengerTripStatus", result.message); await loadPassengerTrips(); } catch (e) { setStatus("isPassengerTripStatus", e.message || "Nauli haikukubaliwa.", true); agree.disabled = false; } });
          row.appendChild(agree);
        }
        if (trip.is_rider && trip.status === "fare_agreed") {
          const pickup = document.createElement("button"); pickup.type = "button"; pickup.className = "is-button primary"; pickup.textContent = "Nimemchukua abiria";
          pickup.addEventListener("click", async () => { pickup.disabled = true; try { const result = await invoke("passenger_trip_status", { trip_id: trip.id, status: "picked_up" }); setStatus("isPassengerTripStatus", result.message); await loadPassengerTrips(); } catch (e) { setStatus("isPassengerTripStatus", e.message || "Hali haikubadilika.", true); pickup.disabled = false; } });
          row.appendChild(pickup);
        }
        if (trip.is_passenger && trip.status === "picked_up") {
          const done = document.createElement("button"); done.type = "button"; done.className = "is-button primary"; done.textContent = "Thibitisha safari imekamilika";
          done.addEventListener("click", async () => { done.disabled = true; try { const result = await invoke("passenger_trip_status", { trip_id: trip.id, status: "completed" }); setStatus("isPassengerTripStatus", result.message); await loadPassengerTrips(); } catch (e) { setStatus("isPassengerTripStatus", e.message || "Safari haikukamilika.", true); done.disabled = false; } });
          row.appendChild(done);
        }
        box.appendChild(row);
      });
    } catch (e) { box.textContent = e.message || "Safari za abiria hazipatikani."; }
  }
  function renderDeliveryMap(trip, isRider) {
    const map = $("isLiveMap");
    if (!trip) { selectedMapTripId = null; map.style.display = "none"; map.replaceChildren(); return; }
    selectedMapTripId = trip.id;
    const hasLive = Number.isFinite(Number(trip.rider_lat)) && Number.isFinite(Number(trip.rider_lng)) && !trip.location_stale;
    const lat = hasLive ? Number(trip.rider_lat) : (trip.status === "picked_up" ? Number(trip.dropoff_lat) : Number(trip.pickup_lat));
    const lng = hasLive ? Number(trip.rider_lng) : (trip.status === "picked_up" ? Number(trip.dropoff_lng) : Number(trip.pickup_lng));
    map.style.display = "block"; map.replaceChildren();
    const status = document.createElement("p"); status.className = "is-muted";
    status.textContent = hasLive ? "Eneo la bodaboda limesasishwa " + new Date(trip.location_updated_at).toLocaleTimeString("sw-TZ") : "Eneo la moja kwa moja halijapatikana au limepitwa na wakati. Ramani inaonyesha eneo la safari, si mwendo wa sasa.";
    const iframe = document.createElement("iframe");
    iframe.title = "Ramani ya safari ya Boda Yangu";
    const delta = 0.008;
    iframe.src = "https://www.openstreetmap.org/export/embed.html?bbox=" + [lng-delta,lat-delta,lng+delta,lat+delta].join("%2C") + "&layer=mapnik&marker=" + lat + "%2C" + lng;
    iframe.style.cssText = "width:100%;height:260px;border:0;border-radius:12px";
    const link = document.createElement("a"); link.href = "https://www.openstreetmap.org/?mlat="+lat+"&mlon="+lng+"#map=16/"+lat+"/"+lng;
    link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Fungua ramani kubwa";
    map.append(status, iframe, link);
  }
  async function loadMyDeliveries() {
    const box = $("isMyDeliveries");
    if (!box) return;
    try {
      const data = await invoke("my_deliveries");
      box.replaceChildren();
      const trips = data.deliveries || [];
      if (!trips.length) {
        const empty = document.createElement("p"); empty.className = "is-muted";
        empty.textContent = "Bado hakuna safari zinazohusiana na akaunti yako."; box.appendChild(empty);
        renderDeliveryMap(null, false); return;
      }
      trips.forEach((trip) => {
        const row = document.createElement("article"); row.className = "is-vendor";
        const title = document.createElement("strong"); title.textContent = "Boda Yangu • " + ({requested:"Inasubiri bodaboda",accepted:"Bodaboda amepangiwa",picked_up:"Bidhaa imechukuliwa",delivered:"Imefikishwa",completed:"Safari imekamilika",cancelled:"Safari imeghairiwa"})[trip.status];
        const fee = document.createElement("small"); fee.textContent = "Ada ya safari: " + (trip.delivery_fee_tzs == null ? "Bado haijawekwa" : "TZS " + Number(trip.delivery_fee_tzs).toLocaleString("sw-TZ")) + " • Hali ya ada: " + (trip.buyer_fee_confirmed && trip.seller_fee_confirmed ? "Imekubaliwa na wote" : "Inasubiri makubaliano");
        row.append(title, fee);
        if (trip.status === "accepted" && trip.is_rider && trip.delivery_fee_tzs == null) {
          const feeInput = document.createElement("input"); feeInput.type="number"; feeInput.min="0"; feeInput.step="1"; feeInput.placeholder="Ada ya safari kwa TZS"; feeInput.setAttribute("aria-label","Ada ya safari kwa TZS");
          const propose = document.createElement("button"); propose.type="button"; propose.className="is-button"; propose.textContent="Pendekeza ada";
          propose.addEventListener("click", async()=>{ propose.disabled=true; try { await invoke("set_delivery_fee",{delivery_id:trip.id,delivery_fee_tzs:Number(feeInput.value)}); await loadMyDeliveries(); } catch(e){setStatus("isMapStatus",e.message,true);propose.disabled=false;} });
          row.append(feeInput,propose);
        }
        if (trip.status === "accepted" && (trip.is_buyer || trip.is_seller)) {
          const confirm = document.createElement("button"); confirm.type="button"; confirm.className="is-button"; confirm.textContent="Kubali ada ya safari";
          confirm.addEventListener("click",async()=>{confirm.disabled=true;try{await invoke("confirm_delivery_fee",{delivery_id:trip.id});await loadMyDeliveries();}catch(e){setStatus("isMapStatus",e.message,true);confirm.disabled=false;}});
          row.appendChild(confirm);
        }
        if (trip.status === "accepted" && trip.is_rider && trip.buyer_fee_confirmed && trip.seller_fee_confirmed) {
          const pickup=document.createElement("button");pickup.type="button";pickup.className="is-button";pickup.textContent="Nimechukua bidhaa";
          pickup.addEventListener("click",async()=>{pickup.disabled=true;try{await invoke("update_delivery_status",{delivery_id:trip.id,status:"picked_up"});await loadMyDeliveries();}catch(e){setStatus("isMapStatus",e.message,true);pickup.disabled=false;}});
          row.appendChild(pickup);
        }
        if (trip.status === "picked_up" && trip.is_rider) {
          const delivered=document.createElement("button");delivered.type="button";delivered.className="is-button primary";delivered.textContent="Nimefikisha bidhaa";
          delivered.addEventListener("click",async()=>{delivered.disabled=true;try{await invoke("update_delivery_status",{delivery_id:trip.id,status:"delivered"});await loadMyDeliveries();}catch(e){setStatus("isMapStatus",e.message,true);delivered.disabled=false;}});
          row.appendChild(delivered);
        }
        if (trip.status === "delivered" && (trip.is_buyer || trip.is_seller)) {
          const done=document.createElement("button");done.type="button";done.className="is-button primary";done.textContent="Thibitisha safari imekamilika";
          done.addEventListener("click",async()=>{done.disabled=true;try{await invoke("complete_delivery",{delivery_id:trip.id});await loadMyDeliveries();}catch(e){setStatus("isMapStatus",e.message,true);done.disabled=false;}});
          row.appendChild(done);
        }
        const mapBtn=document.createElement("button");mapBtn.type="button";mapBtn.className="is-button";mapBtn.textContent="Angalia ramani ya safari";
        mapBtn.addEventListener("click",()=>renderDeliveryMap(trip,trip.is_rider));
        row.appendChild(mapBtn);
        if (trip.is_rider && ["accepted", "picked_up"].includes(trip.status)) {
          const gps = document.createElement("button"); gps.type="button"; gps.className="is-button"; gps.textContent="Washa ufuatiliaji wa GPS";
          gps.addEventListener("click",()=>startRiderGps(trip)); row.appendChild(gps);
        }
        box.appendChild(row);
      });
      if (selectedMapTripId) {
        const current = trips.find((trip) => trip.id === selectedMapTripId);
        if (current) renderDeliveryMap(current, current.is_rider);
      }
    } catch (e) { box.textContent = e.message || "Safari hazipatikani."; }
  }
  function startRiderGps(trip) {
    if (!navigator.geolocation || !trip || !trip.id) return;
    if (riderWatchId !== null) navigator.geolocation.clearWatch(riderWatchId);
    setStatus("isMapStatus", "Ruhusu GPS ili wateja waone eneo lako wakati wa safari.");
    riderWatchId = navigator.geolocation.watchPosition(async (position) => {
      try {
        await invoke("update_rider_location", { delivery_id: trip.id, latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus("isMapStatus", "Eneo la GPS limesasishwa wakati wa safari.");
        await loadMyDeliveries();
      } catch (e) { setStatus("isMapStatus", e.message || "Eneo halijasasishwa.", true); }
    }, () => setStatus("isMapStatus", "GPS haipatikani. Wateja wataona kuwa eneo la moja kwa moja halijasasishwa.", true), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
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
  $("isRefreshRiders").addEventListener("click", loadPublicRiders);
  $("isRiderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("isRiderSubmit");
    const file = $("isRiderIdentityFile").files?.[0];
    const profileFile = $("isRiderProfileFile").files?.[0];
    let uploadedPath = "";
    let profilePath = "";
    button.disabled = true;
    setStatus("isRiderApplyStatus", "Inapakia kitambulisho salama na kutuma maombi…");
    try {
      if (!file) throw new Error("Chagua picha au PDF ya kitambulisho chako.");
      if (!profileFile) throw new Error("Pakia picha yako ya wasifu kwanza.");
      if (profileFile.size > 3 * 1024 * 1024) throw new Error("Picha ya wasifu isizidi MB 3.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(profileFile.type)) throw new Error("Picha ya wasifu iwe JPG, PNG au WEBP.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Faili la kitambulisho lisizidi MB 5.");
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(file.type)) throw new Error("Tumia picha ya JPG, PNG, WEBP au faili la PDF.");
      await readySession();
      const sessionResult = await heavensSupabase.auth.getSession();
      if (sessionResult.error || !sessionResult.data.session?.user?.id) throw new Error("Kipindi chako hakiko tayari. Pakia ukurasa upya.");
      const userId = sessionResult.data.session.user.id;
      const profileExtension = ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[profileFile.type];
      const profileRandom = (window.crypto && typeof window.crypto.randomUUID === "function") ? window.crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2, 10));
      profilePath = userId + "/" + profileRandom + "." + profileExtension;
      const profileUpload = await heavensSupabase.storage.from("ione-sokoni-rider-profiles").upload(profilePath, profileFile, { contentType: profileFile.type, upsert: false });
      if (profileUpload.error) throw new Error("Picha ya wasifu haikupakiwa. Jaribu tena.");
      const extension = ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"})[file.type];
      const randomPart = (window.crypto && typeof window.crypto.randomUUID === "function") ? window.crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2, 10));
      uploadedPath = userId + "/" + randomPart + "." + extension;
      const upload = await heavensSupabase.storage.from("ione-sokoni-rider-documents").upload(uploadedPath, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error("Kitambulisho hakikupakiwa. Hakikisha intaneti inafanya kazi kisha ujaribu tena.");
      const result = await invoke("rider_apply", {
        rider_name: $("isRiderName").value.trim(),
        phone_number: $("isRiderPhone").value.trim(),
        identity_document_type: $("isRiderDocumentType").value,
        identity_document_path: uploadedPath,
        profile_path: profilePath,
        motorcycle_plate: $("isRiderPlate").value.trim(),
        rider_group_name: $("isRiderGroup").value.trim(),
        chairman_phone: $("isRiderChairmanPhone").value.trim()
      });
      if (result.already_pending) {
        if (uploadedPath) await heavensSupabase.storage.from("ione-sokoni-rider-documents").remove([uploadedPath]);
        if (profilePath) await heavensSupabase.storage.from("ione-sokoni-rider-profiles").remove([profilePath]);
        uploadedPath = ""; profilePath = "";
      }
      setStatus("isRiderApplyStatus", result.message || "Ombi limetumwa.");
      await loadRiderStatus();
    } catch (e) {
      if (uploadedPath && typeof heavensSupabase !== "undefined") {
        try { await heavensSupabase.storage.from("ione-sokoni-rider-documents").remove([uploadedPath]); } catch (_) {}
      }
      if (profilePath && typeof heavensSupabase !== "undefined") {
        try { await heavensSupabase.storage.from("ione-sokoni-rider-profiles").remove([profilePath]); } catch (_) {}
      }
      setStatus("isRiderApplyStatus", e.message || "Ombi halikutumwa.", true);
    } finally { button.disabled = false; }
  });
  $("isRiderAvailability").addEventListener("click", async () => {
    const button = $("isRiderAvailability");
    button.disabled = true;
    try {
      const available = button.dataset.available !== "true";
      const result = await invoke("rider_availability", { available });
      button.dataset.available = String(result.available);
      button.textContent = result.available ? "Zima upatikanaji" : "Washa upatikanaji";
      setStatus("isRiderStatus", result.message || "Hali imesasishwa.");
      await Promise.all([loadPublicRiders(), loadOpenTrips(), loadRiderStatus()]);
    } catch (e) { setStatus("isRiderStatus", e.message || "Imeshindikana kubadilisha hali.", true); }
    finally { button.disabled = false; }
  });
  $("isRefreshOpenTrips").addEventListener("click", loadOpenTrips);
  $("isRefreshDeliveries").addEventListener("click", loadMyDeliveries);
  $("isRiderProfileUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("isRiderProfileUpdateSubmit"), file = $("isRiderProfileUpdateFile").files?.[0];
    let path = "";
    button.disabled = true;
    try {
      if (!file) throw new Error("Chagua picha ya wasifu.");
      if (file.size > 3 * 1024 * 1024) throw new Error("Picha ya wasifu isizidi MB 3.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Tumia picha ya JPG, PNG au WEBP.");
      const session = await heavensSupabase.auth.getSession();
      const userId = session.data?.session?.user?.id;
      if (!userId) throw new Error("Ingia tena kwenye akaunti yako.");
      const ext = ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[file.type];
      const random = (window.crypto && typeof window.crypto.randomUUID === "function") ? window.crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2));
      path = userId + "/" + random + "." + ext;
      const upload = await heavensSupabase.storage.from("ione-sokoni-rider-profiles").upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error("Picha haikupakiwa. Jaribu tena.");
      const result = await invoke("rider_update_profile", { profile_path: path });
      path = "";
      setStatus("isRiderProfileUpdateStatus", result.message || "Picha ya wasifu imesasishwa.");
      $("isRiderProfileUpdateForm").reset();
      await Promise.all([loadPublicRiders(), loadRiderStatus()]);
    } catch (e) {
      if (path) try { await heavensSupabase.storage.from("ione-sokoni-rider-profiles").remove([path]); } catch (_) {}
      setStatus("isRiderProfileUpdateStatus", e.message || "Picha haikusasishwa.", true);
    } finally { button.disabled = false; }
  });
  $("isRefreshPassengerTrips").addEventListener("click", loadPassengerTrips);
  $("isPassengerPickupGps").addEventListener("click", () => captureGps("isPassengerPickupStatus", (pos) => { passengerPickup = pos; }));
  $("isPassengerTripForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("isPassengerTripSubmit");
    if (!passengerPickup) { setStatus("isPassengerTripStatus", "Tumia GPS kuchagua eneo la kuchukuliwa kwanza.", true); return; }
    button.disabled = true;
    try {
      const result = await invoke("passenger_trip_request", {
        passenger_name: $("isPassengerName").value.trim(), passenger_phone: $("isPassengerPhone").value.trim(),
        pickup_area: $("isPassengerPickupArea").value.trim(), pickup_lat: passengerPickup.latitude, pickup_lng: passengerPickup.longitude,
        destination_area: $("isPassengerDestination").value.trim(), passenger_note: $("isPassengerNote").value.trim()
      });
      setStatus("isPassengerTripStatus", result.message || "Ombi la safari limetumwa.");
      $("isPassengerTripForm").reset(); passengerPickup = null;
      await loadPassengerTrips();
    } catch (e) { setStatus("isPassengerTripStatus", e.message || "Ombi la safari halikutumwa.", true); }
    finally { button.disabled = false; }
  });
  $("isPickupGps").addEventListener("click", () => captureGps("isPickupCoordinates", (pos) => { sellerPickup = pos; }));
  $("isBuyerGps").addEventListener("click", () => captureGps("isBuyerCoordinates", (pos) => { buyerDropoff = pos; }));
  $("isWantsDelivery").addEventListener("change", () => {
    $("isDeliveryDestinationFields").style.display = $("isWantsDelivery").checked ? "block" : "none";
    if (!$("isWantsDelivery").checked) buyerDropoff = null;
  });
  $("isPickupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!sellerPickup) { setStatus("isPickupStatus", "Chagua eneo kwa kutumia GPS kwanza.", true); return; }
    const button = $("isPickupForm").querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await invoke("save_pickup_location", {
        pickup_location: $("isPickupAddress").value.trim(),
        pickup_lat: sellerPickup.latitude, pickup_lng: sellerPickup.longitude
      });
      setStatus("isPickupStatus", result.message || "Eneo limehifadhiwa.");
    } catch (e) { setStatus("isPickupStatus", e.message || "Eneo halikuhifadhiwa.", true); }
    finally { button.disabled = false; }
  });
  $("isClose").addEventListener("click", close);
  $("isCheckStatus").addEventListener("click", loadStatus);
  $("isRefreshVendors").addEventListener("click", loadVendors);
  $("isRefreshProducts").addEventListener("click", loadProductCatalog);
  $("isProductForm").addEventListener("submit", saveProduct);
  $("isProductCancel").addEventListener("click", resetProductForm);
  $("isRefreshSellerOrders").addEventListener("click", loadMyOrders);
  $("isRefreshBuyerOrders").addEventListener("click", loadMyOrders);
  $("isOrderCancel").addEventListener("click", () => { $("isOrderPanel").style.display = "none"; setStatus("isOrderStatus", ""); });
  $("isOrderForm").addEventListener("submit", submitOrder);
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
      <h3> DASHIBODI YA WAFANYABIASHARA WA SOKONI </h3>
      <p class="authority-section-note">Kagua malipo ya mkono ya TZS 1,000. Ruhusa huanza baada ya Authority Press kuthibitisha malipo. Dashibodi hii ni tofauti na usajili wa mabango na Studio ya Waandishi.</p>
      <button type="button" id="isAuthorityRefresh" class="authority-action-button">SASISHA SOKONI</button>
      <div id="isAuthorityMetrics" class="is-metrics"><div class="is-metric"><span>Loading dashboard…</span></div></div>
      <div id="isAuthorityStatus" class="is-status" role="status" aria-live="polite"></div>
      <h3 style="margin-top:22px">THIBITISHA MALIPO YANAYOSUBIRI</h3>
      <div id="isAuthorityRequests"></div>
      <h3 style="margin-top:22px">WAFANYABIASHARA WA SOKONI</h3>
      <div id="isAuthorityVendors" class="is-vendors"></div>
      <h3 style="margin-top:22px">BODA YANGU • UTHIBITISHO WA MADEREVA</h3>
      <p class="authority-section-note">Thibitisha dereva baada ya kukagua utambulisho na mawasiliano yake. Eneo la dereva ni la faragha na hushirikishwa wakati wa safari aliyopewa tu.</p>
      <div id="isAuthorityRiders" class="is-vendors"></div>`;
    host.appendChild(section);
    $("isAuthorityRefresh").addEventListener("click", loadAuthorityDashboard);
  }
  async function loadAuthorityDashboard() {
    const status = $("isAuthorityStatus");
    const requests = $("isAuthorityRequests");
    const metrics = $("isAuthorityMetrics");
    const vendorList = $("isAuthorityVendors");
    const riderList = $("isAuthorityRiders");
    if (!status || !requests || !metrics || !vendorList || !riderList) return;
    status.textContent = "Inapakia taarifa salama za Sokoni…";
    requests.replaceChildren();
    try {
      const data = await invoke("authority_dashboard");
      const m = data.metrics || {};
      const metricItems = [
        ["Maombi yanayosubiri", m.pending || 0],
        ["Wafanyabiashara wenye ruhusa", m.activeVendors || 0],
        ["Ruhusa zilizoisha", m.expiredVendors || 0],
        ["Malipo yaliyothibitishwa", m.confirmedPayments || 0],
        ["Mapato yote", "TZS " + Number(m.totalRevenueTzs || 0).toLocaleString("en-TZ")],
        ["Maombi ya madereva yanayosubiri", m.pendingRiders || 0],
        ["Madereva waliothibitishwa", m.verifiedRiders || 0]
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
        empty.textContent = "Hakuna malipo ya wafanyabiashara wa Sokoni yanayosubiri.";
        requests.appendChild(empty);
      }
      pending.forEach((request) => {
        const card = document.createElement("article");
        card.className = "is-admin-request";
        const title = document.createElement("strong");
        title.textContent = escText(request.vendor_name);
        const phone = document.createElement("p");
        phone.textContent = "Simu: " + escText(request.phone_number);
        const amount = document.createElement("p");
        amount.textContent = "Malipo ya kuthibitisha: TZS " + Number(request.amount_tzs || 1000).toLocaleString("en-TZ");
        const created = document.createElement("p");
        created.textContent = "Tarehe ya ombi: " + new Date(request.created_at).toLocaleString("en-GB");
        const actions = document.createElement("div");
        actions.className = "is-admin-actions";
        const approve = document.createElement("button");
        approve.type = "button";
        approve.textContent = "THIBITISHA MALIPO NA RUHUSU";
        approve.addEventListener("click", () => reviewRequest(request.id, "approve", approve));
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "reject";
        reject.textContent = "KATAA";
        reject.addEventListener("click", () => reviewRequest(request.id, "reject", reject));
        actions.append(approve, reject);
        card.append(title, phone, amount, created, actions);
        requests.appendChild(card);
      });
      vendorList.replaceChildren();
      const registered = data.vendors || [];
      if (!registered.length) {
        const emptyVendor = document.createElement("p");
        emptyVendor.className = "authority-section-note";
        emptyVendor.textContent = "Bado hakuna mfanyabiashara wa Sokoni aliyeidhinishwa.";
        vendorList.appendChild(emptyVendor);
      }
      registered.forEach((vendor) => {
        const row = document.createElement("div");
        row.className = "is-vendor";
        const name = document.createElement("strong");
        name.textContent = escText(vendor.vendor_name);
        const phone = document.createElement("small");
        phone.textContent = "Simu: " + escText(vendor.phone_number);
        const expires = document.createElement("p");
        const expired = Date.parse(vendor.paid_until) <= Date.now();
        expires.textContent = (expired ? "Ruhusa imeisha: " : "Ruhusa inaisha: ") + new Date(vendor.paid_until).toLocaleDateString("en-GB");
        row.append(name, phone, expires);
        vendorList.appendChild(row);
      });
      riderList.replaceChildren();
      const riderApps = data.riderApplications || [];
      if (!riderApps.length) {
        const emptyRider = document.createElement("p");
        emptyRider.className = "authority-section-note";
        emptyRider.textContent = "No rider applications have been submitted.";
        riderList.appendChild(emptyRider);
      }
      riderApps.forEach((application) => {
        const row = document.createElement("article");
        row.className = "is-admin-request";
        if (application.profile_photo_url) {
          const profilePhoto = document.createElement("img");
          profilePhoto.src = application.profile_photo_url; profilePhoto.alt = "Picha ya dereva " + application.rider_name;
          profilePhoto.width = 76; profilePhoto.height = 76;
          profilePhoto.style.cssText = "width:76px;height:76px;object-fit:cover;border-radius:50%;border:2px solid #b9d4a3;margin-bottom:10px";
          row.appendChild(profilePhoto);
        }
        const name = document.createElement("strong");
        name.textContent = escText(application.rider_name);
        const statusLabels = { pending: "INASUBIRI UKAGUZI", processing: "UKAGUZI UNAENDELEA", approved: "AMEIDHINISHWA", rejected: "AMEKATALIWA" };
        const status = document.createElement("p");
        status.textContent = "Hali: " + (statusLabels[application.status] || escText(application.status));
        const phone = document.createElement("p");
        phone.textContent = "Simu ya dereva: " + escText(application.phone_number);
        const plate = document.createElement("p");
        plate.textContent = "Namba ya pikipiki: " + (application.motorcycle_plate ? escText(application.motorcycle_plate) : "Haipo kwenye maombi ya zamani");
        const group = document.createElement("p");
        group.textContent = "Kikundi: " + (application.rider_group_name ? escText(application.rider_group_name) : "Haipo kwenye maombi ya zamani");
        const chairman = document.createElement("p");
        chairman.textContent = "Simu ya mwenyekiti: " + (application.chairman_phone ? escText(application.chairman_phone) : "Haipo kwenye maombi ya zamani");
        const docTypeLabels = { driving_license: "Leseni ya udereva", national_id: "Kitambulisho cha Taifa", rider_group_id: "Kitambulisho cha kikundi" };
        const docType = document.createElement("p");
        docType.textContent = "Aina ya kitambulisho: " + (docTypeLabels[application.identity_document_type] || "Hakikuambatanishwa kwenye ombi la zamani");
        const date = document.createElement("p");
        date.textContent = "Tarehe ya ombi: " + new Date(application.created_at).toLocaleString("en-GB");
        row.append(name, status, phone, plate, group, chairman, docType, date);
        if (application.identity_document_url) {
          const doc = document.createElement("a");
          doc.href = application.identity_document_url;
          doc.target = "_blank";
          doc.rel = "noopener noreferrer";
          doc.textContent = "Fungua kitambulisho cha faragha";
          doc.style.cssText = "display:inline-block;margin:6px 0;color:#a54d2b;font-weight:800;overflow-wrap:anywhere";
          row.appendChild(doc);
        } else {
          const missing = document.createElement("p");
          missing.textContent = "Hakuna faili la kitambulisho lililohifadhiwa kwa ombi hili.";
          row.appendChild(missing);
        }
        if (application.reviewed_at) {
          const reviewed = document.createElement("p");
          reviewed.textContent = "Tarehe ya uamuzi: " + new Date(application.reviewed_at).toLocaleString("en-GB") + (application.reviewed_by ? " • " + application.reviewed_by : "");
          row.appendChild(reviewed);
        }
        if (application.admin_note) {
          const note = document.createElement("p");
          note.textContent = "Maelezo ya Authority: " + escText(application.admin_note);
          row.appendChild(note);
        }
        if (application.status === "pending") {
          const actions = document.createElement("div");
          actions.className = "is-admin-actions";
          const approve = document.createElement("button");
          approve.type = "button";
          approve.textContent = "THIBITISHA DEREVA";
          approve.addEventListener("click", () => reviewRider(application.id, "approve_rider", approve));
          const reject = document.createElement("button");
          reject.type = "button";
          reject.className = "reject";
          reject.textContent = "KATAA";
          reject.addEventListener("click", () => reviewRider(application.id, "reject_rider", reject));
          actions.append(approve, reject);
          row.appendChild(actions);
        }
        riderList.appendChild(row);
      });
      const verifiedRiders = data.riders || [];
      if (verifiedRiders.length) {
        const heading = document.createElement("h4"); heading.textContent = "RUHUSA ZA BODA • TAREHE ZA MALIPO"; riderList.appendChild(heading);
      }
      verifiedRiders.forEach((rider) => {
        const row = document.createElement("article"); row.className = "is-admin-request";
        const name = document.createElement("strong"); name.textContent = escText(rider.rider_name);
        const phone = document.createElement("p"); phone.textContent = "Simu: " + escText(rider.phone_number);
        const accessIsLive = rider.access_payment_confirmed === true && !!rider.access_expires_at && Date.parse(rider.access_expires_at) > Date.now();
        const state = document.createElement("p");
        state.textContent = "Hali: " + (accessIsLive ? "SOKONI IMEWASHWA" : "SOKONI IMEFUNGIWA / RUHUSA IMEISHA");
        const start = document.createElement("input"); start.type = "date"; start.id = "isRiderAccessStart-" + rider.id; start.setAttribute("aria-label", "Tarehe ya kuanza ruhusa");
        const startLabel = document.createElement("label"); startLabel.htmlFor = start.id; startLabel.textContent = "Tarehe ya kuanza ruhusa";
        const expiry = document.createElement("input"); expiry.type = "date"; expiry.id = "isRiderAccessExpiry-" + rider.id; expiry.setAttribute("aria-label", "Tarehe ya mwisho ya ruhusa");
        const expiryLabel = document.createElement("label"); expiryLabel.htmlFor = expiry.id; expiryLabel.textContent = "Tarehe ya mwisho ya ruhusa";
        const dateString = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
        const today = new Date(); start.value = rider.access_started_at ? dateString(new Date(rider.access_started_at)) : dateString(today);
        const defaultExpiry = new Date(today); defaultExpiry.setDate(defaultExpiry.getDate()+90);
        expiry.value = rider.access_expires_at ? dateString(new Date(rider.access_expires_at)) : dateString(defaultExpiry);
        const record = document.createElement("p");
        record.textContent = rider.access_started_at && rider.access_expires_at
          ? "Rekodi: " + new Date(rider.access_started_at).toLocaleDateString("en-GB") + " hadi " + new Date(rider.access_expires_at).toLocaleDateString("en-GB") + " • TZS " + Number(rider.access_amount_tzs || 0).toLocaleString("en-TZ")
          : "Hakuna tarehe za ruhusa zilizorekodiwa bado.";
        const actions = document.createElement("div"); actions.className = "is-admin-actions";
        const give = document.createElement("button"); give.type = "button"; give.textContent = "TOA RUHUSA";
        give.addEventListener("click", async () => {
          if (!start.value || !expiry.value || expiry.value <= start.value) { $("isAuthorityStatus").textContent = "Weka tarehe sahihi ya kuanza na tarehe ya mwisho."; $("isAuthorityStatus").classList.add("error"); return; }
          give.disabled = true;
          try {
            const result = await invoke("set_rider_access", { rider_id: rider.id, grant: true, start_date: start.value, expiry_date: expiry.value });
            $("isAuthorityStatus").textContent = result.message || "Ruhusa imetolewa."; $("isAuthorityStatus").classList.remove("error"); await loadAuthorityDashboard();
          } catch (e) { $("isAuthorityStatus").textContent = e.message || "Ruhusa haikutolewa."; $("isAuthorityStatus").classList.add("error"); give.disabled = false; }
        });
        const revoke = document.createElement("button"); revoke.type = "button"; revoke.className = "reject"; revoke.textContent = "FUNGIA SOKONI";
        revoke.addEventListener("click", async () => {
          revoke.disabled = true;
          try {
            const result = await invoke("set_rider_access", { rider_id: rider.id, grant: false });
            $("isAuthorityStatus").textContent = result.message || "Ruhusa imefungwa."; $("isAuthorityStatus").classList.remove("error"); await loadAuthorityDashboard();
          } catch (e) { $("isAuthorityStatus").textContent = e.message || "Ruhusa haikufungwa."; $("isAuthorityStatus").classList.add("error"); revoke.disabled = false; }
        });
        actions.append(give, revoke); row.append(name, phone, state, startLabel, start, expiryLabel, expiry, record, actions); riderList.appendChild(row);
      });
      status.textContent = "Dashibodi ya Sokoni imesasishwa. Thibitisha malipo kabla ya kutoa ruhusa.";
    } catch (e) {
      status.textContent = e.message || "Imeshindikana kupakia dashibodi ya Sokoni.";
      status.classList.add("error");
    }
  }
  async function reviewRider(id, action, button) {
    button.disabled = true;
    const note = action === "reject_rider" ? (window.prompt("Sababu ya kukataa ombi la dereva (si lazima):") || "") : "";
    try {
      const data = await invoke(action, { application_id: id, note });
      $("isAuthorityStatus").textContent = data.message || "Ombi la dereva limekaguliwa.";
      $("isAuthorityStatus").classList.remove("error");
      await loadAuthorityDashboard();
    } catch (e) {
      $("isAuthorityStatus").textContent = e.message || "Uamuzi wa dereva haukuhifadhiwa.";
      $("isAuthorityStatus").classList.add("error");
      button.disabled = false;
    }
  }
  async function reviewRequest(id, action, button) {
    button.disabled = true;
    const card = button.closest(".is-admin-request");
    const note = action === "reject" ? (window.prompt("Sababu ya kukataa ombi hili (si lazima):") || "") : "";
    try {
      const data = await invoke(action, { request_id: id, note });
      if (card) card.remove();
      $("isAuthorityStatus").textContent = data.message || "Imehifadhiwa.";
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
    try {
      if (new URLSearchParams(window.location.search).get("ionePushDestination") === "sokoni") {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("ionePushDestination");
        window.history.replaceState({}, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
        window.setTimeout(open, 350);
      }
    } catch (_) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireTile, { once: true });
  else wireTile();
  window.IoneSokoni = Object.freeze({ open, close, refreshStatus: loadStatus, refreshVendors: loadVendors, refreshAuthorityDashboard: loadAuthorityDashboard });
})();