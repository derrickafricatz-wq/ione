/* I|ONE FIND IT FOR ME • isolated client request panel + Authority Press inbox
   Uses the dedicated ione-find-it-for-me Edge Function. Does not alter ChapChap
   purchase, receipt, seller publishing, chat, or payment handlers. */
(function(){
  "use strict";
  if(window.__ioneFindItForMeLoaded)return;
  window.__ioneFindItForMeLoaded=true;
  const FN="ione-find-it-for-me";
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const statusLabel=s=>({new:"Received",reviewing:"Under review",finding_supplier:"Finding a supplier",found:"Possible match found",available:"Available on I|ONE",completed:"Completed",unable_to_fulfil:"Unable to fulfil",cancelled:"Cancelled"}[String(s||"new")]||String(s||"").replace(/_/g," "));
  async function call(body){
    if(typeof ensureHeavensAnonymousSession!=="function")throw new Error("I|ONE secure session is not ready. Please try again.");
    const session=await ensureHeavensAnonymousSession();
    if(!session?.access_token)throw new Error("Your I|ONE session is not ready. Refresh and try again.");
    const response=await fetch(SUPABASE_URL+"/functions/v1/"+FN,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":HEAVENS_SUPABASE_ANON_KEY},body:JSON.stringify({...body,...(sessionStorage.getItem("ioneAuthoritySession")?{authority_session:sessionStorage.getItem("ioneAuthoritySession")}:{})})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.success===false)throw new Error(data.error||"I|ONE could not complete this action.");
    return data;
  }
  function injectStyle(){
    if(document.getElementById("ioneFindItStyle"))return;
    const style=document.createElement("style");style.id="ioneFindItStyle";
    style.textContent=`
      #ioneFindItButton{min-width:0!important;height:39px!important;min-height:39px!important;padding:0 7px!important;border:1px solid #7cf2c3!important;border-radius:11px!important;background:linear-gradient(135deg,#b8f36a,#24a86c)!important;color:#09271b!important;font:1000 8px/1.1 Arial,sans-serif!important;letter-spacing:.15px!important;white-space:normal!important;box-shadow:none!important}
      #ioneFindItButton:active{filter:brightness(1.08)!important}
      .ione-find-overlay{position:fixed;inset:0;z-index:100900;background:rgba(0,5,8,.9);display:none;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}
      .ione-find-card{width:min(560px,100%);max-height:min(88dvh,850px);overflow:auto;overscroll-behavior:contain;border:1px solid rgba(0,255,210,.35);border-radius:20px;background:linear-gradient(155deg,#12272b,#071115 72%);color:#f3ffff;box-shadow:0 20px 70px rgba(0,0,0,.6);padding:17px;box-sizing:border-box;font-family:Arial,sans-serif}
      .ione-find-head{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:12px}
      .ione-find-head h2{margin:0;color:#9affd6;font-size:19px;line-height:1.2}
      .ione-find-close{flex:0 0 auto;border:1px solid #38575b;border-radius:10px;background:#102126;color:#eaffff;padding:9px 11px;font-weight:900}
      .ione-find-note{color:#afc6c8;font-size:12px;line-height:1.6;margin:0 0 13px}
      .ione-find-field{display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:12px;border:1px solid #345156;border-radius:11px;background:#081518;color:#fff;font:13px Arial,sans-serif}
      .ione-find-field::placeholder{color:#71898d}
      .ione-find-label{display:block;color:#a8c5c8;font-size:10px;font-weight:900;letter-spacing:.8px;margin-top:10px}
      .ione-find-submit{width:100%;border:0;border-radius:11px;background:linear-gradient(135deg,#b8f36a,#2bd49b);color:#08281b;font-weight:1000;padding:13px;margin-top:9px}
      .ione-find-status{font-size:12px;line-height:1.5;color:#9ed8c6;white-space:pre-wrap;margin-top:10px}
      .ione-find-request{border:1px solid #2a4449;border-radius:13px;background:rgba(3,13,16,.62);padding:12px;margin:10px 0}
      .ione-find-request strong{display:block;font-size:13px;overflow-wrap:anywhere}
      .ione-find-meta{font-size:10px;color:#9ab2b6;line-height:1.5;margin-top:5px}
      .ione-find-open{border:1px solid #3b6867;border-radius:9px;background:#102a2b;color:#c7fff0;padding:9px 11px;margin-top:9px;font-size:10px;font-weight:900}
      .ione-find-message{max-width:92%;padding:10px 11px;border-radius:12px;margin:8px 0;background:#13282d;border:1px solid #2b454a;font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
      .ione-find-message.authority{margin-left:auto;background:#103a2d;border-color:#23654c}
      .ione-find-message small{display:block;margin-top:6px;color:#8ca9ab;font-size:9px}
      .ione-find-actions{display:flex;gap:8px;flex-wrap:wrap}
      .ione-find-actions>*{flex:1}
      .ione-find-admin .ione-find-field{margin:7px 0}
      @media(max-width:420px){.ione-find-card{padding:13px;border-radius:16px}.ione-find-head h2{font-size:17px}}
    `;
    document.head.appendChild(style);
  }
  function ensureOverlay(){
    let root=document.getElementById("ioneFindItOverlay");if(root)return root;
    root=document.createElement("div");root.id="ioneFindItOverlay";root.className="ione-find-overlay";root.setAttribute("aria-hidden","true");
    root.innerHTML='<section class="ione-find-card" role="dialog" aria-modal="true" aria-labelledby="ioneFindItTitle"><div class="ione-find-head"><h2 id="ioneFindItTitle">FIND IT FOR ME</h2><button type="button" class="ione-find-close" id="ioneFindItClose">CLOSE ✕</button></div><div id="ioneFindItBody"></div></section>';
    document.body.appendChild(root);
    root.querySelector("#ioneFindItClose").onclick=closePanel;
    root.addEventListener("click",e=>{if(e.target===root)closePanel()});
    return root;
  }
  function openPanel(){const root=ensureOverlay();root.style.display="flex";root.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";renderClientHome().catch(showClientError)}
  function closePanel(){const root=document.getElementById("ioneFindItOverlay");if(root){root.style.display="none";root.setAttribute("aria-hidden","true")}document.body.style.overflow=""}
  function body(){return document.getElementById("ioneFindItBody")}
  function showClientError(e){const b=body();if(b)b.innerHTML='<div class="ione-find-status">'+esc(e?.message||"Could not load your requests.")+'</div><button class="ione-find-open" id="ioneFindRetry">TRY AGAIN</button>';document.getElementById("ioneFindRetry")?.addEventListener("click",()=>renderClientHome().catch(showClientError))}
  function renderForm(){
    body().innerHTML='<p class="ione-find-note">Can’t find the product or service you need? Tell I|ONE what you are looking for. Our team will review your request and reply here inside this panel.</p><form id="ioneFindForm"><label class="ione-find-label" for="ioneFindType">WHAT DO YOU NEED?</label><select id="ioneFindType" class="ione-find-field"><option value="product">A product or brand</option><option value="service">A service</option></select><label class="ione-find-label" for="ioneFindTitle">PRODUCT OR SERVICE NAME</label><input required minlength="2" maxlength="140" id="ioneFindTitle" class="ione-find-field" placeholder="e.g. Toyota spare part, solar installer"><label class="ione-find-label" for="ioneFindDetails">DESCRIBE WHAT YOU NEED</label><textarea required minlength="5" maxlength="2000" rows="4" id="ioneFindDetails" class="ione-find-field" placeholder="Brand, model, size, features or service details…"></textarea><label class="ione-find-label" for="ioneFindLocation">LOCATION (OPTIONAL)</label><input maxlength="160" id="ioneFindLocation" class="ione-find-field" placeholder="City or area"><label class="ione-find-label" for="ioneFindBudget">BUDGET (OPTIONAL)</label><input maxlength="80" id="ioneFindBudget" class="ione-find-field" placeholder="e.g. TZS 500,000"><p class="ione-find-note">Your request and replies are private to your I|ONE account. Submitting a request does not guarantee availability.</p><button class="ione-find-submit" id="ioneFindSubmit" type="submit">SEND REQUEST</button><div class="ione-find-status" id="ioneFindFormStatus" aria-live="polite"></div></form><div style="border-top:1px solid #294247;margin-top:16px;padding-top:12px"><button type="button" class="ione-find-open" id="ioneFindViewRequests">MY REQUESTS & REPLIES</button></div>';
    document.getElementById("ioneFindForm").onsubmit=async e=>{e.preventDefault();const btn=document.getElementById("ioneFindSubmit"),st=document.getElementById("ioneFindFormStatus");btn.disabled=true;btn.textContent="SENDING…";st.textContent="Saving your request securely…";try{const r=await call({action:"create",request_type:document.getElementById("ioneFindType").value,title:document.getElementById("ioneFindTitle").value,details:document.getElementById("ioneFindDetails").value,location:document.getElementById("ioneFindLocation").value,budget:document.getElementById("ioneFindBudget").value});body().innerHTML='<div style="text-align:center;padding:18px 4px"><div style="font-size:34px;color:#aaffd7">✓</div><h3 style="margin:8px 0;color:#aaffd7">THANK YOU FOR CHOOSING I|ONE!</h3><p class="ione-find-note">Your request has been received successfully. Our team is reviewing it and will do our best to find a suitable product or service. We will post updates here.</p><p style="color:#fff;font-size:12px;font-weight:900">REFERENCE: '+esc(r.request.reference)+'</p><p class="ione-find-note">Submitting a request does not guarantee availability.</p><button type="button" class="ione-find-submit" id="ioneFindOpenRequest">VIEW YOUR REQUEST & REPLIES</button><button type="button" class="ione-find-open" id="ioneFindBackToForm">SUBMIT ANOTHER REQUEST</button></div>';document.getElementById("ioneFindOpenRequest").onclick=()=>openClientRequests(r.request.id);document.getElementById("ioneFindBackToForm").onclick=renderForm;}catch(err){st.textContent=err?.message||"Your request could not be saved. Please try again.";btn.disabled=false;btn.textContent="SEND REQUEST"}};
    document.getElementById("ioneFindViewRequests").onclick=()=>openClientRequests();
  }
  async function renderClientHome(){body().innerHTML='<p class="ione-find-note">Loading your private requests…</p>';const r=await call({action:"client_list"});const rows=r.requests||[];body().innerHTML='<p class="ione-find-note">Your requests and Authority Press replies stay here. We’ll update the status as our team works on your request.</p><button class="ione-find-submit" id="ioneFindNewRequest">+ NEW REQUEST</button><div id="ioneFindRequestList"></div>';const list=document.getElementById("ioneFindRequestList");list.innerHTML=rows.length?rows.map(x=>'<article class="ione-find-request"><strong>'+esc(x.title)+'</strong><div class="ione-find-meta">'+esc(x.reference)+' • '+esc(statusLabel(x.status))+'<br>'+esc(new Date(x.created_at).toLocaleString())+'</div><button type="button" class="ione-find-open" data-find-open="'+esc(x.id)+'">OPEN REQUEST & REPLIES</button></article>').join(""):'<p class="ione-find-note">No requests yet. Start by telling us what you need.</p>';document.getElementById("ioneFindNewRequest").onclick=renderForm;list.querySelectorAll("[data-find-open]").forEach(b=>b.onclick=()=>openClientRequests(b.dataset.findOpen));}
  async function openClientRequests(id){
    const r=await call({action:"client_list"});const rows=r.requests||[];if(!id){if(!rows.length){renderForm();return}id=rows[0].id}
    const req=rows.find(x=>String(x.id)===String(id));if(!req){await renderClientHome();return}
    const thread=await call({action:"client_thread",request_id:id});
    body().innerHTML='<button type="button" class="ione-find-open" id="ioneFindBack">← MY REQUESTS</button><article class="ione-find-request"><strong>'+esc(req.title)+'</strong><div class="ione-find-meta">'+esc(req.reference)+' • '+esc(statusLabel(req.status))+(req.location?'<br>LOCATION: '+esc(req.location):'')+(req.budget?'<br>BUDGET: '+esc(req.budget):'')+'</div><p class="ione-find-note">'+esc(req.details)+'</p>'+(req.listing_url?'<a href="'+esc(req.listing_url)+'" target="_blank" rel="noopener" class="ione-find-open" style="display:inline-block;text-decoration:none">OPEN MARKETPLACE LISTING ↗</a>':'')+'</article><div id="ioneFindMessages"></div><p class="ione-find-note">This panel is for replies about this request. For a new need, use New Request.</p><button type="button" class="ione-find-submit" id="ioneFindNewFromThread">+ NEW REQUEST</button>';
    document.getElementById("ioneFindBack").onclick=renderClientHome;document.getElementById("ioneFindNewFromThread").onclick=renderForm;
    document.getElementById("ioneFindMessages").innerHTML=(thread.messages||[]).map(m=>'<div class="ione-find-message '+(m.sender_role==="authority"?"authority":"")+'">'+esc(m.body)+'<small>'+esc(m.sender_role==="authority"?"I|ONE AUTHORITY":"YOU")+' • '+esc(new Date(m.created_at).toLocaleString())+'</small></div>').join("")||'<p class="ione-find-note">No replies yet. We’ll post updates here.</p>';
  }
  function mountClientButton(){
    const bar=document.getElementById("ioneChapBar");if(!bar||document.getElementById("ioneFindItButton"))return;
    const b=document.createElement("button");b.id="ioneFindItButton";b.type="button";b.textContent="FIND IT FOR ME";b.setAttribute("aria-label","Find a product or service with I|ONE");b.onclick=e=>{e.preventDefault();e.stopPropagation();openPanel()};
    const mine=document.getElementById("ioneChapMine");if(mine?.parentNode===bar)mine.insertAdjacentElement("afterend",b);else bar.appendChild(b);
    bar.style.gridTemplateColumns="minmax(0,1fr) 82px 104px";
    bar.style.gap="5px";
  }
  async function bindAuthority(){
    const panel=document.getElementById("authorityPressPanel"),inner=panel?.querySelector(".authority-panel-inner");if(!panel||!inner||document.getElementById("ioneFindAuthoritySection"))return;
    const section=document.createElement("div");section.className="authority-panel-section";section.id="ioneFindAuthoritySection";section.innerHTML='<div class="authority-section-kicker">CLIENT REQUESTS</div><h3>FIND IT FOR ME • INBOX</h3><p class="authority-section-note">Review product/service requests and reply privately in each client’s request panel. Mark a suitable match as Available only when the listing is ready; this sends a general notification to all subscribed users.</p><div id="ioneFindAuthorityList" class="ione-authority-live">Loading requests…</div><div id="ioneFindAuthorityDetail" style="display:none;margin-top:12px"></div>';
    inner.appendChild(section);
    const list=document.getElementById("ioneFindAuthorityList"),detail=document.getElementById("ioneFindAuthorityDetail");
    const pass=()=>String(document.getElementById("authorityPasswordInput")?.value||"").trim();
    async function refresh(){list.innerHTML="Loading requests…";try{const r=await call({action:"authority_list"});const rows=r.requests||[];list.innerHTML=rows.length?rows.map(x=>'<article class="ione-find-request"><strong>'+esc(x.title)+' • '+esc(x.request_type.toUpperCase())+'</strong><div class="ione-find-meta">'+esc(x.reference)+' • '+esc(statusLabel(x.status))+'<br>'+esc(new Date(x.created_at).toLocaleString())+'<br>LOCATION: '+esc(x.location||"—")+' • BUDGET: '+esc(x.budget||"—")+'</div><button class="ione-find-open" data-find-admin-open="'+esc(x.id)+'" type="button">OPEN & REPLY</button></article>').join(""):'No client requests yet.';list.querySelectorAll("[data-find-admin-open]").forEach(b=>b.onclick=()=>openAdminThread(b.dataset.findAdminOpen));}catch(e){list.textContent=e.message||"Could not load requests.";}}
    async function openAdminThread(id){try{const r=await call({action:"authority_thread",request_id:id});const x=r.request;detail.style.display="block";detail.innerHTML='<article class="ione-find-request"><strong>'+esc(x.title)+' • '+esc(x.reference)+'</strong><div class="ione-find-meta">TYPE: '+esc(x.request_type)+' • STATUS: '+esc(statusLabel(x.status))+'<br>CLIENT ACCOUNT: '+esc(x.user_id)+'<br>LOCATION: '+esc(x.location||"—")+' • BUDGET: '+esc(x.budget||"—")+'</div><p class="ione-find-note">'+esc(x.details)+'</p><label class="ione-find-label">STATUS</label><select id="ioneFindAdminStatus" class="ione-find-field">'+[['new','Received'],['reviewing','Under review'],['finding_supplier','Finding supplier'],['found','Possible match found'],['available','Available on I|ONE'],['completed','Completed'],['unable_to_fulfil','Unable to fulfil'],['cancelled','Cancelled']].map(([v,l])=>'<option value="'+v+'" '+(x.status===v?'selected':'')+'>'+l+'</option>').join("")+'</select><label class="ione-find-label">MARKETPLACE LISTING URL (OPTIONAL)</label><input id="ioneFindAdminListing" class="ione-find-field" maxlength="500" value="'+esc(x.listing_url||"")+'" placeholder="https://intoione.space/..."><button class="ione-find-submit" id="ioneFindAdminSaveStatus" type="button">SAVE STATUS</button><div id="ioneFindAdminMessages" style="margin-top:12px"></div><label class="ione-find-label">PRIVATE REPLY TO THIS CLIENT</label><textarea id="ioneFindAdminReply" class="ione-find-field" rows="3" maxlength="2000" placeholder="Write the update for this client…"></textarea><button class="ione-find-submit" id="ioneFindAdminSend" type="button">SEND PRIVATE REPLY</button><div class="ione-find-status" id="ioneFindAdminStatusMsg"></div></article>';
      const msgs=document.getElementById("ioneFindAdminMessages");msgs.innerHTML=(r.messages||[]).map(m=>'<div class="ione-find-message '+(m.sender_role==="authority"?"authority":"")+'">'+esc(m.body)+'<small>'+esc(m.sender_role.toUpperCase())+' • '+esc(new Date(m.created_at).toLocaleString())+'</small></div>').join("")||'<p class="ione-find-note">No messages yet.</p>';
      document.getElementById("ioneFindAdminSaveStatus").onclick=async()=>{const btn=document.getElementById("ioneFindAdminSaveStatus"),msg=document.getElementById("ioneFindAdminStatusMsg");btn.disabled=true;try{await call({action:"authority_update",request_id:id,status:document.getElementById("ioneFindAdminStatus").value,listing_url:document.getElementById("ioneFindAdminListing").value});msg.textContent="Status saved. Notifications sent when applicable.";await refresh();await openAdminThread(id)}catch(e){msg.textContent=e.message}finally{btn.disabled=false}};
      document.getElementById("ioneFindAdminSend").onclick=async()=>{const btn=document.getElementById("ioneFindAdminSend"),input=document.getElementById("ioneFindAdminReply"),msg=document.getElementById("ioneFindAdminStatusMsg");if(!input.value.trim()){msg.textContent="Write a reply first.";return}btn.disabled=true;try{await call({action:"authority_reply",request_id:id,message:input.value});msg.textContent="Private reply sent and client notified.";await openAdminThread(id);await refresh()}catch(e){msg.textContent=e.message}finally{btn.disabled=false}};
    }catch(e){detail.style.display="block";detail.textContent=e.message||"Could not open request."}}
    section.dataset.bound="1";section._refresh=refresh;section._open= openAdminThread;
    await refresh();
    if(!section.dataset.polling){section.dataset.polling="1";setInterval(()=>{if(panel.getAttribute("aria-hidden")==="false"&&detail.style.display==="none")refresh().catch(()=>{});},15000);}
  }
  function watchAuthority(){
    const tryBind=()=>{const panel=document.getElementById("authorityPressPanel");if(panel?.getAttribute("aria-hidden")==="false")bindAuthority().catch(console.warn)};
    document.getElementById("authorityPressUnlock")?.addEventListener("click",()=>setTimeout(tryBind,180));
    document.getElementById("authorityPasswordUnlock")?.addEventListener("click",()=>setTimeout(tryBind,180));
    new MutationObserver(tryBind).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["aria-hidden","style"]});
  }
  function init(){
    injectStyle();ensureOverlay();
    const mount=()=>mountClientButton();
    mount();new MutationObserver(mount).observe(document.body,{subtree:true,childList:true});
    watchAuthority();
    const params=new URLSearchParams(location.search);
    if(params.get("ioneFindItForMe")==="1"){setTimeout(openPanel,500);params.delete("ioneFindItForMe");history.replaceState(null,"",location.pathname+(params.toString()?"?"+params.toString():"")+location.hash)}
    if(params.get("ioneFindAuthority")==="1"){setTimeout(()=>{document.getElementById("openAuthority")?.click();setTimeout(()=>{document.getElementById("authorityPressUnlock")?.click()},600)},500)}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();