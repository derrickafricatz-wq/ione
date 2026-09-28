/* I|ONE CHAPCHAP RECEIPT + AUTHORITY VIEW MODULE */
(function(){
  "use strict";
  function sb(){ return typeof heavensSupabase!=="undefined" ? heavensSupabase : null; }
  function esc(v){ return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];}); }
  function money(v){ return "TZS "+Number(v||0).toLocaleString("en-US"); }

  function downloadReceipt(r){
    try{
      if(window.jspdf && window.jspdf.jsPDF){
        var doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"});
        var y=22;
        function line(label,value){doc.setFont("helvetica","bold");doc.text(label,20,y);doc.setFont("helvetica","normal");doc.text(String(value||"—"),62,y);y+=9;}
        doc.setFont("helvetica","bold");doc.setFontSize(16);doc.text("I|ONE CHAPCHAP — OFFICIAL RECEIPT",20,y);y+=14;
        doc.setFontSize(11);
        line("Receipt:",r.receipt_number);line("Product:",r.product_title);line("CLIENT NAME:",r.buyer_full_name);line("PHONE:",r.buyer_phone||r.buyer_contact);line("EMAIL:",r.buyer_email);line("ADDRESS:",r.buyer_address);line("Amount:",money(r.amount_tzs));line("ChapChap fee:",money(r.chapchap_fee_tzs));line("BLMPay ref:",r.blmpay_reference||"—");line("Paid:",r.paid_at?new Date(r.paid_at).toLocaleString():"—");
        y+=5;doc.line(20,y,190,y);y+=10;doc.setFont("helvetica","bold");doc.text("I|ONE Care",20,y);y+=7;doc.setFont("helvetica","normal");doc.text("+255 742 097 868",20,y);y+=7;doc.text("ione.customercare.africa@gmail.com",20,y);
        var safe=String(r.receipt_number||"receipt").replace(/[^a-z0-9_-]/gi,"-");
        doc.save("IONE-ChapChap-"+safe+".pdf");
      }else{
        var blob=new Blob([JSON.stringify(r,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download="IONE-ChapChap-"+String(r.receipt_number||"receipt").replace(/[^a-z0-9_-]/gi,"-")+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);
      }
    }catch(e){alert("The receipt could not be downloaded on this device.");}
  }

  async function getAuthority(){
    var password=String(document.getElementById("authorityPasswordInput")?.value||"");
    if(!password) throw new Error("Unlock Authority Press first.");
    var r=await sb().functions.invoke("ione-chapchap-authority",{body:{action:"list",password:password}});
    if(r.error||!r.data?.success) throw new Error(r.data?.error||r.error?.message||"Could not load Authority Press data.");
    return r.data;
  }

  function receiptButton(r){
    if(!r) return "";
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px">'+
      '<button type="button" class="cc-primary cc-authority-view-receipt" data-receipt=\''+esc(JSON.stringify(r))+'\'>VIEW RECEIPT</button>'+
      '<button type="button" class="cc-secondary cc-authority-download-receipt" data-receipt=\''+esc(JSON.stringify(r))+'\'>DOWNLOAD</button></div>';
  }

  function renderAuthority(filter,data){
    var list=document.getElementById("authorityChapChapOrders"); if(!list)return;
    var orders=data.orders||[];
    var rows=[];
    if(filter==="receipts"){
      rows=orders.filter(function(o){return o.has_receipt && o.receipt;}).map(function(o){
        var r=o.receipt;
        return '<div class="authority-chapchap-order"><strong>'+esc(r.receipt_number||"OFFICIAL RECEIPT")+'</strong><div class="cc-mini">PRODUCT: '+esc(r.product_title||o.product?.title||"—")+'<br>AMOUNT: '+esc(money(r.amount_tzs))+'<br>CHAPCHAP FEE: '+esc(money(r.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.blmpay_reference||"—")+'<br>PAID: '+esc(r.paid_at?new Date(r.paid_at).toLocaleString():"—")+'</div>'+receiptButton(r)+'</div>';
      });
    }else if(filter==="agreements"){
      rows=orders.filter(function(o){return o.has_agreement;}).map(function(o){
        return '<div class="authority-chapchap-order"><strong>SELLER AGREEMENT • RECORDED</strong><div class="cc-mini">PRODUCT: '+esc(o.product?.title||"—")+'<br>SELLER: '+esc(o.product?.seller_name||o.seller_id||"—")+'<br>PHONE: '+esc(o.product?.seller_phone||"—")+'<br>ORDER: '+esc(o.id)+'<br>STATUS: '+esc(String(o.status||"").toUpperCase())+'</div></div>';
      });
    }else if(filter==="payouts"){
      rows=orders.filter(function(o){return !!o.payout_record || String(o.payout_status||"")!=="";}).map(function(o){
        var p=o.payout_record||{};
        return '<div class="authority-chapchap-order"><strong>PAYOUT • '+esc(String(p.status||o.payout_status||"PENDING").toUpperCase())+'</strong><div class="cc-mini">PRODUCT: '+esc(o.product?.title||"—")+'<br>SELLER NET: '+esc(money(o.seller_net_tzs))+'<br>PAYOUT AMOUNT: '+esc(money(p.amount_tzs||o.payout_amount_tzs||0))+'<br>REFERENCE: '+esc(p.blmpay_reference||o.payout_reference||"—")+'</div></div>';
      });
    }else{
      rows=orders.map(function(o){
        return '<div class="authority-chapchap-order"><strong>'+esc(o.product?.title||"CHAPCHAP ORDER")+'</strong><div class="cc-mini">ORDER: '+esc(o.id)+'<br>BUYER: '+esc(o.buyer_full_name||"—")+' • '+esc(o.buyer_phone||"—")+'<br>AMOUNT: '+esc(money(o.amount_tzs))+'<br>STATUS: '+esc(String(o.status||"").toUpperCase())+' • PAYOUT: '+esc(String(o.payout_status||"").toUpperCase())+'</div>'+(o.has_receipt&&o.receipt?receiptButton(o.receipt):'<div class="cc-mini">RECEIPT: PREPARING</div>')+'</div>';
      });
    }
    authorityWriting=true; list.innerHTML=rows.length?rows.join(""):'<div class="authority-chapchap-order"><strong>NOTHING IN THIS SECTION YET</strong><div class="cc-mini">This section will fill automatically when the matching ChapChap record is created.</div></div>';
    setTimeout(function(){authorityWriting=false;},0);
    list.querySelectorAll(".cc-authority-view-receipt").forEach(function(b){b.addEventListener("click",function(){openAuthorityReceipt(JSON.parse(b.dataset.receipt));});});
    list.querySelectorAll(".cc-authority-download-receipt").forEach(function(b){b.addEventListener("click",function(){downloadReceipt(JSON.parse(b.dataset.receipt));});});
  }

  function openAuthorityReceipt(r){
    var panel=document.getElementById("authorityChapChapOrders"); if(!panel)return;
    var old=panel.innerHTML;
    panel.innerHTML='<div class="authority-chapchap-order"><strong>OFFICIAL CHAPCHAP RECEIPT</strong><div class="cc-mini">'+
      '<strong>'+esc(r.receipt_number)+'</strong><br>PRODUCT: '+esc(r.product_title)+'<br>CLIENT: '+esc(r.buyer_full_name||"—")+'<br>PHONE: '+esc(r.buyer_phone||r.buyer_contact||"—")+'<br>EMAIL: '+esc(r.buyer_email||"—")+'<br>ADDRESS: '+esc(r.buyer_address||"—")+'<br>AMOUNT: '+esc(money(r.amount_tzs))+'<br>CHAPCHAP FEE: '+esc(money(r.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.blmpay_reference||"—")+'<br>PAID: '+esc(r.paid_at?new Date(r.paid_at).toLocaleString():"—")+
      '</div>'+receiptButton(r)+'<button type="button" id="ccAuthorityBack" class="cc-secondary" style="width:100%;margin-top:8px">BACK TO LIST</button></div>';
    panel.querySelector(".cc-authority-view-receipt")?.addEventListener("click",function(){openAuthorityReceipt(r);});
    panel.querySelector(".cc-authority-download-receipt")?.addEventListener("click",function(){downloadReceipt(r);});
    panel.querySelector("#ccAuthorityBack")?.addEventListener("click",function(){refreshAuthority();});
  }

  function polishAuthorityPanel(){var p=document.getElementById("authorityChapChapPanel");if(!p||p.dataset.polished)return;p.dataset.polished="1";var st=document.createElement("style");st.textContent="#authorityChapChapPanel{position:relative!important;overflow:hidden!important}#authorityChapChapPanel .authority-chapchap-head{position:sticky!important;top:0!important;z-index:20!important;background:#071012!important;padding:10px!important;padding-right:68px!important;border-bottom:1px solid rgba(0,255,255,.18)!important}#authorityChapChapPanel .authority-chapchap-head h3{margin:2px 0!important;font-size:14px!important;line-height:1.15!important;max-width:calc(100% - 4px)!important}#authorityChapChapClose{position:absolute!important;top:8px!important;right:8px!important;z-index:21!important;min-height:30px!important;height:30px!important;min-width:52px!important;width:52px!important;padding:0 7px!important;border-radius:9px!important;font:900 8px Arial,sans-serif!important;touch-action:manipulation!important}#ioneChapBar{display:flex!important;align-items:center!important;gap:6px!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important;white-space:nowrap!important}#ioneChapBar::-webkit-scrollbar{display:none!important}#ioneChapBar #ioneChapStatus{flex:0 0 auto!important;margin-left:auto!important}#authorityChapChapFilters{gap:8px!important}#authorityChapChapFilters .authority-chapchap-card{min-height:72px!important;border-radius:14px!important;transition:background .12s ease,border-color .12s ease,transform .08s ease!important;transform:none!important;box-shadow:none!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important}#authorityChapChapFilters .authority-chapchap-card:active{transform:scale(.985)!important}#authorityChapChapFilters .authority-chapchap-card.is-selected{border-color:#00ffff!important;background:rgba(0,255,255,.09)!important}#authorityChapChapOrders{scroll-margin-top:60px!important}#authorityChapChapOrders button{touch-action:manipulation!important;-webkit-tap-highlight-color:transparent!important;min-height:42px!important}";document.head.appendChild(st)}
  var authorityFilter="orders",authorityBusy=false,authorityWriting=false;
  async function refreshAuthority(){
    if(authorityBusy)return;
    authorityBusy=true;
    try{var data=await getAuthority();renderAuthority(authorityFilter,data);}
    catch(e){var s=document.getElementById("authorityChapChapLoadStatus");if(s)s.textContent=e.message||"Could not load Authority Press data.";}
    finally{authorityBusy=false;}
  }

  function enhanceAuthority(){
    polishAuthorityPanel();
  }

  async function enhanceMyShop(){ return; }

  async function viewSellerReceipt(orderId,downloadOnly){
    var result=await sb().functions.invoke("ione-chapchap-seller",{body:{action:"sales"}});
    if(result.error||!result.data?.success){alert(result.data?.error||result.error?.message||"Could not load seller sales.");return;}
    var found=(result.data.orders||[]).find(function(o){return String(o.id)===String(orderId);});
    var receipt=found&&found.receipt;
    if(!receipt){alert("Receipt is still being prepared. Please try again shortly.");return;}
    if(downloadOnly){downloadReceipt(receipt);return;}
    var o=document.getElementById("ioneChapOverlay");var list=o?.querySelector(".cc-list");if(!list)return;
    list.innerHTML='<div class="cc-list-item"><strong>OFFICIAL CHAPCHAP RECEIPT</strong><span>'+esc(receipt.receipt_number)+' • '+esc(receipt.product_title)+'</span><span>CLIENT: '+esc(receipt.buyer_full_name||found.buyer_full_name||"—")+'<br>PHONE: '+esc(receipt.buyer_phone||found.buyer_phone||found.buyer_contact||"—")+'<br>EMAIL: '+esc(receipt.buyer_email||found.buyer_email||"—")+'<br>ADDRESS: '+esc(receipt.buyer_address||found.buyer_address||"—")+'<br>AMOUNT: '+esc(money(receipt.amount_tzs))+'<br>FEE: '+esc(money(receipt.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(receipt.blmpay_reference||found.blmpay_reference||"—")+'<br>PAID: '+esc(receipt.paid_at?new Date(receipt.paid_at).toLocaleString():"—")+'</span><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px"><button type="button" id="ccSellerDownload" class="cc-primary">DOWNLOAD RECEIPT</button><button type="button" id="ccSellerBack" class="cc-secondary">BACK</button></div></div>';
    document.getElementById("ccSellerDownload")?.addEventListener("click",function(){downloadReceipt(receipt);});
    document.getElementById("ccSellerBack")?.addEventListener("click",function(){if(o?.querySelector(".cc-list"))o.querySelector(".cc-list").dataset.receiptEnhanced="";enhanceMyShop();});
  }

  async function openSavedBuyerReceipt(){
    var id="";try{id=localStorage.getItem("ione_chapchap_last_paid_order")||""}catch(e){}
    if(!id){alert("No recent ChapChap receipt found on this device.");return;}
    var result=await sb().functions.invoke("ione-chapchap-buyer",{body:{action:"receipt",order_id:id}});
    if(result.error||!result.data?.success||!result.data.receipt){alert(result.data?.error||result.error?.message||"Your receipt is still being prepared. Please try again shortly.");return;}
    var r=result.data.receipt;
    var box=document.getElementById("ioneChapReceiptQuick");
    if(!box){box=document.createElement("div");box.id="ioneChapReceiptQuick";box.style.cssText="position:fixed;inset:0;z-index:103000;display:flex;align-items:center;justify-content:center;padding:15px;background:rgba(0,0,0,.84);font-family:Arial,sans-serif;color:#fff";document.body.appendChild(box);}
    box.innerHTML='<div style="width:min(500px,100%);max-height:92vh;overflow:auto;border:1px solid #00ffff;border-radius:20px;background:#071012;padding:18px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong style="color:#00ffff;font-size:18px">OFFICIAL CHAPCHAP RECEIPT</strong><button id="ccQuickClose" class="cc-secondary" type="button">CLOSE</button></div><div style="margin-top:12px;font-size:12px;line-height:1.7"><strong>'+esc(r.receipt_number)+'</strong><br>PRODUCT: '+esc(r.product_title)+'<br>CLIENT: '+esc(r.buyer_full_name||"—")+'<br>PHONE: '+esc(r.buyer_phone||r.buyer_contact||"—")+'<br>EMAIL: '+esc(r.buyer_email||"—")+'<br>ADDRESS: '+esc(r.buyer_address||"—")+'<br>AMOUNT: '+esc(money(r.amount_tzs))+'<br>CHAPCHAP FEE: '+esc(money(r.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.blmpay_reference||"—")+'<br>PAID: '+esc(r.paid_at?new Date(r.paid_at).toLocaleString():"—")+'</div><button id="ccQuickDownload" class="cc-primary" type="button" style="width:100%;margin-top:14px">DOWNLOAD RECEIPT</button></div>';
    box.style.display="flex";
    box.querySelector("#ccQuickClose").onclick=function(){box.style.display="none";};
    box.querySelector("#ccQuickDownload").onclick=function(){downloadReceipt(r);box.style.display="none";};
  }

  async function openLatestBuyerReceipt(){
    var savedReceipt=null;try{savedReceipt=JSON.parse(localStorage.getItem("ione_chapchap_last_receipt")||"null");}catch(e){} var result=savedReceipt?{error:null,data:{success:true,receipt:savedReceipt}}:await sb().functions.invoke("ione-chapchap-buyer",{body:{action:"latest"}});
    if(result.error||!result.data?.success||!result.data.receipt){
      alert(result.data?.error||result.error?.message||"No completed ChapChap receipt was found for this buyer.");
      return;
    }
    var r=result.data.receipt;
    var box=document.getElementById("ioneChapReceiptQuick");
    if(!box){box=document.createElement("div");box.id="ioneChapReceiptQuick";box.style.cssText="position:fixed;inset:0;z-index:103000;display:flex;align-items:center;justify-content:center;padding:15px;background:rgba(0,0,0,.84);font-family:Arial,sans-serif;color:#fff";document.body.appendChild(box);}
    box.innerHTML='<div style="width:min(500px,100%);max-height:92vh;overflow:auto;border:1px solid #00ffff;border-radius:20px;background:#071012;padding:18px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong style="color:#00ffff;font-size:18px">OFFICIAL CHAPCHAP RECEIPT</strong><button id="ccQuickClose" class="cc-secondary" type="button">CLOSE</button></div><div style="margin-top:12px;font-size:12px;line-height:1.7"><strong>'+esc(r.receipt_number)+'</strong><br>PRODUCT: '+esc(r.product_title)+'<br>CLIENT: '+esc(r.buyer_full_name||"—")+'<br>PHONE: '+esc(r.buyer_phone||r.buyer_contact||"—")+'<br>EMAIL: '+esc(r.buyer_email||"—")+'<br>ADDRESS: '+esc(r.buyer_address||"—")+'<br>AMOUNT: '+esc(money(r.amount_tzs))+'<br>CHAPCHAP FEE: '+esc(money(r.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.blmpay_reference||"—")+'<br>PAID: '+esc(r.paid_at?new Date(r.paid_at).toLocaleString():"—")+'</div><button id="ccQuickDownload" class="cc-primary" type="button" style="width:100%;margin-top:14px">DOWNLOAD RECEIPT</button></div>';
    box.style.display="flex";
    box.querySelector("#ccQuickClose").onclick=function(){box.style.display="none";};
    box.querySelector("#ccQuickDownload").onclick=function(){downloadReceipt(r);box.style.display="none";};
  }

  function enhanceBuyerMarketReceipt(){
    var dock=document.getElementById("ioneChapDock");if(!dock)return;
    var bar=document.getElementById("ioneChapBar");if(!bar)return;
    var old=document.getElementById("ioneChapSavedReceiptBtn");
    if(old)return;
    var b=document.createElement("button");
    b.id="ioneChapSavedReceiptBtn";b.type="button";b.textContent="VIEW RECEIPT";b.className="cc-primary";
    b.style.cssText="flex:0 0 auto;min-height:37px;height:37px;padding:0 10px;border-radius:10px;font:900 9px Arial,sans-serif;white-space:nowrap;touch-action:manipulation;letter-spacing:.25px";
    b.onclick=openLatestBuyerReceipt;
    bar.appendChild(b);
  }

  function openStandaloneReceipt(r){
    if(!r)return;
    var box=document.getElementById("ioneChapReceiptQuick");
    if(!box){box=document.createElement("div");box.id="ioneChapReceiptQuick";box.style.cssText="position:fixed;inset:0;z-index:103000;display:flex;align-items:center;justify-content:center;padding:15px;background:rgba(0,0,0,.84);font-family:Arial,sans-serif;color:#fff";document.body.appendChild(box);}
    box.innerHTML='<div style="width:min(500px,100%);max-height:92vh;overflow:auto;border:1px solid #00ffff;border-radius:20px;background:#071012;padding:18px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong style="color:#00ffff;font-size:18px">OFFICIAL CHAPCHAP RECEIPT</strong><button id="ccQuickClose" class="cc-secondary" type="button">CLOSE</button></div><div style="margin-top:12px;font-size:12px;line-height:1.7"><strong>'+esc(r.receipt_number)+'</strong><br>PRODUCT: '+esc(r.product_title)+'<br>CLIENT: '+esc(r.buyer_full_name||"—")+'<br>PHONE: '+esc(r.buyer_phone||r.buyer_contact||"—")+'<br>EMAIL: '+esc(r.buyer_email||"—")+'<br>ADDRESS: '+esc(r.buyer_address||"—")+'<br>AMOUNT: '+esc(money(r.amount_tzs))+'<br>CHAPCHAP FEE: '+esc(money(r.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.blmpay_reference||"—")+'<br>PAID: '+esc(r.paid_at?new Date(r.paid_at).toLocaleString():"—")+'</div><button id="ccQuickDownload" class="cc-primary" type="button" style="width:100%;margin-top:14px">DOWNLOAD RECEIPT</button></div>';
    box.style.display="flex";
    box.querySelector("#ccQuickClose").onclick=function(){box.style.display="none";};
    box.querySelector("#ccQuickDownload").onclick=function(){downloadReceipt(r);box.style.display="none";};
  }

  function enhanceBuyerReceipt(){
    var box=document.getElementById("ioneCcBuyStatus");if(!box||box.dataset.receiptEnhanced)return;
    if(!/OFFICIAL CHAPCHAP RECEIPT/i.test(box.textContent||""))return;
    box.dataset.receiptEnhanced="1";
    var row=box.querySelector("div[style*='display:grid']");
    if(!row)return;
    var b=document.createElement("button");b.type="button";b.className="cc-primary";b.textContent="DOWNLOAD RECEIPT";b.style.minHeight="45px";
    row.insertBefore(b,row.firstChild);
    b.addEventListener("click",async function(){
      var txt=box.textContent||"",match=txt.match(/(CC-\\d{8}-[A-Z0-9-]+)/i);
      if(!match){alert("Receipt number not found.");return;}
      var result=await sb().functions.invoke("ione-chapchap-buyer",{body:{action:"receipt_by_number",receipt_number:match[1]}});
      if(result.error||!result.data?.success||!result.data.receipt){alert(result.data?.error||result.error?.message||"Receipt is still being prepared.");return;}
      downloadReceipt(result.data.receipt);
    });
  }

  window.ioneChapChapOpenReceipt=function(r){openAuthorityReceipt(r);};
  window.ioneChapChapOpenStandaloneReceipt=function(r){openStandaloneReceipt(r);};
  window.ioneChapChapDownloadReceipt=function(r){downloadReceipt(r);};
  var mo=new MutationObserver(function(){
    if(authorityWriting)return;
    enhanceAuthority();
    enhanceBuyerReceipt();
    enhanceBuyerMarketReceipt();
  });
  mo.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener("load",function(){
    enhanceAuthority();
    enhanceBuyerReceipt();
    enhanceBuyerMarketReceipt();
  });
})();