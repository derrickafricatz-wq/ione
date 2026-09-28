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
        line("Receipt:",r.receipt_number);line("Product:",r.product_title);line("Amount:",money(r.amount_tzs));line("ChapChap fee:",money(r.chapchap_fee_tzs));line("BLMPay ref:",r.blmpay_reference||"—");line("Paid:",r.paid_at?new Date(r.paid_at).toLocaleString():"—");
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
    list.innerHTML=rows.length?rows.join(""):'<div class="authority-chapchap-order"><strong>NOTHING IN THIS SECTION YET</strong><div class="cc-mini">This section will fill automatically when the matching ChapChap record is created.</div></div>';
    list.querySelectorAll(".cc-authority-view-receipt").forEach(function(b){b.addEventListener("click",function(){openAuthorityReceipt(JSON.parse(b.dataset.receipt));});});
    list.querySelectorAll(".cc-authority-download-receipt").forEach(function(b){b.addEventListener("click",function(){downloadReceipt(JSON.parse(b.dataset.receipt));});});
  }

  function openAuthorityReceipt(r){
    var panel=document.getElementById("authorityChapChapOrders"); if(!panel)return;
    var old=panel.innerHTML;
    panel.innerHTML='<div class="authority-chapchap-order"><strong>OFFICIAL CHAPCHAP RECEIPT</strong><div class="cc-mini">'+
      '<strong>'+esc(r.receipt_number)+'</strong><br>PRODUCT: '+esc(r.product_title)+'<br>AMOUNT: '+esc(money(r.amount_tzs))+'<br>CHAPCHAP FEE: '+esc(money(r.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.blmpay_reference||"—")+'<br>PAID: '+esc(r.paid_at?new Date(r.paid_at).toLocaleString():"—")+
      '</div>'+receiptButton(r)+'<button type="button" id="ccAuthorityBack" class="cc-secondary" style="width:100%;margin-top:8px">BACK TO LIST</button></div>';
    panel.querySelector(".cc-authority-view-receipt")?.addEventListener("click",function(){openAuthorityReceipt(r);});
    panel.querySelector(".cc-authority-download-receipt")?.addEventListener("click",function(){downloadReceipt(r);});
    panel.querySelector("#ccAuthorityBack")?.addEventListener("click",function(){refreshAuthority();});
  }

  var authorityFilter="orders",authorityBusy=false;
  async function refreshAuthority(){
    if(authorityBusy)return;
    authorityBusy=true;
    try{var data=await getAuthority();renderAuthority(authorityFilter,data);}
    catch(e){var s=document.getElementById("authorityChapChapLoadStatus");if(s)s.textContent=e.message||"Could not load Authority Press data.";}
    finally{authorityBusy=false;}
  }

  function enhanceAuthority(){
    var filters=document.getElementById("authorityChapChapFilters");
    if(!filters||filters.dataset.receiptModuleBound)return;
    filters.dataset.receiptModuleBound="1";
    filters.addEventListener("click",function(e){
      var card=e.target.closest("[data-cc-filter]");if(!card)return;
      authorityFilter=card.getAttribute("data-cc-filter")||"orders";
      setTimeout(refreshAuthority,80);
    });
    var unlock=document.getElementById("authorityPasswordUnlock");
    if(unlock&&!unlock.dataset.receiptModuleBound){
      unlock.dataset.receiptModuleBound="1";
      unlock.addEventListener("click",function(){setTimeout(refreshAuthority,300);});
    }
  }

  async function enhanceMyShop(){
    var overlay=document.getElementById("ioneChapOverlay"),title=overlay?.querySelector(".cc-head h2");
    if(!overlay||overlay.style.display==="none"||!title||title.textContent!=="MY CHAPCHAP")return;
    var list=overlay.querySelector(".cc-list"); if(!list||list.dataset.receiptEnhanced)return;
    list.dataset.receiptEnhanced="1";
    try{
      var session=await (typeof ensureHeavensAnonymousSession==="function"?ensureHeavensAnonymousSession():null);if(!session?.user)return;
      var orders=await sb().from("ione_chapchap_orders").select("id,product_id,amount_tzs,status,created_at,paid_at,received_confirmed_at,payout_status,payout_reference").eq("seller_id",session.user.id).in("status",["paid","received","disputed"]).order("created_at",{ascending:false}).limit(20);
      if(orders.error)throw orders.error;
      var ids=(orders.data||[]).map(function(o){return o.id});
      var rr=ids.length?await sb().from("ione_chapchap_receipts").select("*").in("order_id",ids):{data:[],error:null};if(rr.error)throw rr.error;
      var map={};(rr.data||[]).forEach(function(r){map[String(r.order_id)]=r;});
      list.innerHTML=(orders.data||[]).length?(orders.data||[]).map(function(o){
        var r=map[String(o.id)];
        return '<div class="cc-list-item"><strong>ORDER • '+esc(String(o.status).toUpperCase())+'</strong><span>'+esc(money(o.amount_tzs))+' • '+esc(new Date(o.created_at).toLocaleString())+'</span>'+(r?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px"><button type="button" class="cc-primary cc-shop-view" data-order="'+esc(o.id)+'">VIEW RECEIPT</button><button type="button" class="cc-secondary cc-shop-download" data-order="'+esc(o.id)+'">DOWNLOAD</button></div>':'<span>Receipt is being prepared.</span>')+'</div>';
      }).join(""):'<div class="cc-list-item"><strong>NO SALES YET</strong><span>Your paid ChapChap sales will appear here.</span></div>';
      list.querySelectorAll(".cc-shop-view").forEach(function(b){b.addEventListener("click",function(){viewSellerReceipt(b.dataset.order);});});
      list.querySelectorAll(".cc-shop-download").forEach(function(b){b.addEventListener("click",function(){viewSellerReceipt(b.dataset.order,true);});});
    }catch(e){list.dataset.receiptEnhanced="";console.warn("ChapChap My Shop receipt enhancement:",e);}
  }

  async function viewSellerReceipt(orderId,downloadOnly){
    var r=await sb().from("ione_chapchap_receipts").select("*").eq("order_id",orderId).maybeSingle();
    if(r.error||!r.data){alert("Receipt is still being prepared. Please try again shortly.");return;}
    if(downloadOnly){downloadReceipt(r.data);return;}
    var o=document.getElementById("ioneChapOverlay");var list=o?.querySelector(".cc-list");if(!list)return;
    list.innerHTML='<div class="cc-list-item"><strong>OFFICIAL CHAPCHAP RECEIPT</strong><span>'+esc(r.data.receipt_number)+' • '+esc(r.data.product_title)+'</span><span>AMOUNT: '+esc(money(r.data.amount_tzs))+'<br>FEE: '+esc(money(r.data.chapchap_fee_tzs))+'<br>BLMPAY: '+esc(r.data.blmpay_reference||"—")+'<br>PAID: '+esc(r.data.paid_at?new Date(r.data.paid_at).toLocaleString():"—")+'</span><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px"><button type="button" id="ccSellerDownload" class="cc-primary">DOWNLOAD RECEIPT</button><button type="button" id="ccSellerBack" class="cc-secondary">BACK</button></div></div>';
    document.getElementById("ccSellerDownload")?.addEventListener("click",function(){downloadReceipt(r.data);});
    document.getElementById("ccSellerBack")?.addEventListener("click",enhanceMyShop);
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
      var r=await sb().from("ione_chapchap_receipts").select("*").eq("receipt_number",match[1]).maybeSingle();
      if(r.error||!r.data){alert("Receipt is still being prepared.");return;}
      downloadReceipt(r.data);
    });
  }

  var mo=new MutationObserver(function(){
    enhanceAuthority();
    enhanceBuyerReceipt();
    enhanceMyShop();
  });
  mo.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(function(){enhanceAuthority();enhanceBuyerReceipt();enhanceMyShop();},700);
  window.addEventListener("load",function(){enhanceAuthority();enhanceBuyerReceipt();enhanceMyShop();});
})();