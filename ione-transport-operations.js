(function () {
  "use strict";
  if (window.__ioneTransportOperationsBooted) return;
  window.__ioneTransportOperationsBooted = true;
  const overlayId = "ioneTransportOverlay";
  const style = document.createElement("style");
  style.textContent = `
    .ito-section{padding:18px;margin-top:14px;border:1px solid #294e3a;border-radius:18px;background:#0b1d15;color:#f2fff7}
    .ito-section h2{margin:0 0 8px;font-size:20px}
    .ito-muted{color:#b6cfbe;font-size:12px;line-height:1.6}
    .ito-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    .ito-btn{min-height:42px;padding:10px 14px;border:1px solid #47775a;border-radius:10px;background:#10271d;color:#f4fff7;font-weight:900;cursor:pointer}
    .ito-btn.primary{background:linear-gradient(145deg,#9ce7b4,#53bd7c);border-color:#b8f2ca;color:#082517}
    .ito-btn:disabled{opacity:.5}
    .ito-filter,.ito-input,.ito-select,.ito-textarea{width:100%;min-height:43px;padding:10px;border:1px solid #365d45;border-radius:9px;background:#06130d;color:#f4fff7;font:14px Arial,sans-serif}
    .ito-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:12px}
    .ito-card{padding:13px;border:1px solid #315b42;border-radius:13px;background:#07170f;min-width:0}
    .ito-card h3{margin:0 0 7px;font-size:15px;color:#fff}
    .ito-meta{color:#b8d2c0;font-size:12px;line-height:1.7;overflow-wrap:anywhere;margin:8px 0}
    .ito-pill{display:inline-block;padding:5px 9px;border:1px solid #427653;border-radius:999px;background:#102b1c;color:#b8f1c8;font-size:10px;font-weight:900}
    .ito-pill.busy{border-color:#8a6940;background:#332514;color:#ffd89c}
    .ito-empty{padding:14px;border:1px dashed #365843;border-radius:12px;color:#b4cbb9;font-size:13px;line-height:1.6}
    .ito-photo{width:46px;height:46px;border-radius:50%;object-fit:cover;background:#1b3d2b;border:1px solid #4c805b}
    .ito-head{display:flex;align-items:center;gap:10px}
    .ito-booking{display:none;margin-top:13px;padding:14px;border:1px solid #477956;border-radius:13px;background:#0b2015}
    .ito-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
    .ito-field label{display:block;margin-bottom:5px;color:#cde5d3;font-size:10px;font-weight:900}
    .ito-field.full{grid-column:1/-1}
    .ito-chat{margin-top:10px;padding:11px;border:1px solid #355b42;border-radius:11px;background:#041009}
    .ito-log{max-height:210px;overflow:auto;display:flex;flex-direction:column;gap:7px;margin:9px 0}
    .ito-msg{max-width:88%;padding:8px 10px;border-radius:10px;background:#173322;color:#eaffef;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
    .ito-msg.mine{align-self:flex-end;background:#275d3a}
    .ito-msg small{display:block;margin-top:3px;color:#a9cbb3;font-size:9px}
    .ito-send{display:flex;gap:7px}
    .ito-send input{flex:1;min-width:0}
    .ito-status{min-height:20px;margin-top:9px;font-size:12px;line-height:1.5;color:#c6e9d0}
    .ito-status.error{color:#ffb8ad}
    @media(max-width:620px){.ito-form{grid-template-columns:1fr}.ito-field.full{grid-column:auto}}
  `;
  document.head.appendChild(style);
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const labels = {taxi:"Taxi",special_hire:"Special Hire",shuttle:"Shuttle",bus:"Bus / Private bus hire"};
  let me = null, directory = [], poll = null, heartbeat = null, chosen = null;
  const say = (id,msg,error) => { const el=$(id); if(el){el.textContent=msg||"";el.classList.toggle("error",!!error);} };
  async function session() {
    if(typeof heavensSupabase==="undefined") throw new Error("i1 connection is not ready. Reload and try again.");
    const s=await heavensSupabase.auth.getSession(); if(s.error)throw s.error;
    if(!s.data.session){const a=await heavensSupabase.auth.signInAnonymously();if(a.error)throw a.error;}
    const current=await heavensSupabase.auth.getSession(); me=current.data.session?.user?.id||null;
    if(!me)throw new Error("Could not establish your i1 session.");
  }
  async function call(body) {
    await session();
    const r=await heavensSupabase.functions.invoke("ione-transport",{body});
    if(r.error||!r.data?.success)throw new Error(r.data?.error||r.error?.message||"Transport request failed.");
    return r.data;
  }
  function install() {
    const overlay=$(overlayId); if(!overlay||$("itoPassenger"))return;
    const shell=overlay.querySelector(".it-shell"); if(!shell)return;
    const passenger=document.createElement("section");passenger.id="itoPassenger";passenger.className="ito-section";
    passenger.innerHTML=`
      <h2>Find your i1 Transport driver</h2>
      <p class="ito-muted">ACTIVE drivers can receive a journey request. BUSY drivers remain visible so you can see they have already accepted a trip.</p>
      <div class="ito-actions"><select id="itoFilter" class="ito-filter" style="max-width:240px"><option value="">All services</option><option value="taxi">Taxi</option><option value="special_hire">Special Hire</option><option value="shuttle">Shuttle</option><option value="bus">Bus / Private bus hire</option></select><button class="ito-btn" id="itoRefresh">REFRESH DRIVERS</button></div>
      <div class="ito-grid" id="itoDrivers"><div class="ito-empty">Loading verified drivers…</div></div>
      <form class="ito-booking" id="itoBooking">
        <h2>Request this driver</h2><p class="ito-muted" id="itoChosen"></p><input type="hidden" id="itoDriverId">
        <div class="ito-form">
          <div class="ito-field"><label>YOUR NAME</label><input id="itoName" class="ito-input" maxlength="120" required placeholder="Full name"></div>
          <div class="ito-field"><label>PHONE NUMBER</label><input id="itoPhone" class="ito-input" maxlength="20" required placeholder="+255 7XX XXX XXX"></div>
          <div class="ito-field"><label>SERVICE</label><select id="itoService" class="ito-select" required></select></div>
          <div class="ito-field"><label>PASSENGERS</label><input id="itoCount" class="ito-input" type="number" min="1" max="60" value="1" required></div>
          <div class="ito-field"><label>PICKUP LOCATION</label><input id="itoPickup" class="ito-input" maxlength="240" required placeholder="Pickup point"></div>
          <div class="ito-field"><label>DESTINATION</label><input id="itoDestination" class="ito-input" maxlength="240" required placeholder="Where are you going?"></div>
          <div class="ito-field full"><label>EXTRA DETAILS (OPTIONAL)</label><textarea id="itoNotes" class="ito-textarea" rows="2" maxlength="600" placeholder="Landmark, luggage or useful details"></textarea></div>
          <div class="ito-field full"><div class="ito-actions"><button class="ito-btn primary" id="itoSend" type="submit">SEND TRANSPORT REQUEST</button><button class="ito-btn" type="button" id="itoCancelBooking">CANCEL</button></div><div class="ito-status" id="itoBookingStatus"></div></div>
        </div>
      </form>
      <h2 style="margin-top:22px">My Trips</h2><div class="ito-grid" id="itoPassengerTrips"><div class="ito-empty">Your trip requests will appear here.</div></div>`;
    const driver=document.createElement("section");driver.id="itoDriver";driver.className="ito-section";driver.style.display="none";
    driver.innerHTML=`
      <h2>Driver dashboard</h2><p class="ito-muted" id="itoDriverWelcome">Your Authority-verified driver workspace.</p>
      <div class="ito-actions"><span class="ito-pill" id="itoAvailability">OFFLINE</span><button class="ito-btn primary" id="itoGoActive">GO ACTIVE</button><button class="ito-btn" id="itoGoOffline">GO OFFLINE</button><button class="ito-btn" id="itoDriverRefresh">REFRESH JOBS</button></div>
      <p class="ito-muted" id="itoDriverHint">You only appear in the passenger directory while ACTIVE.</p>
      <h2 style="margin-top:20px">Incoming requests & current trip</h2><div class="ito-grid" id="itoDriverTrips"><div class="ito-empty">No requests yet.</div></div>`;
    shell.append(passenger,driver);
    $("itoRefresh").addEventListener("click",refresh);
    $("itoFilter").addEventListener("change",refresh);
    $("itoDriverRefresh").addEventListener("click",refresh);
    $("itoCancelBooking").addEventListener("click",()=>{$("itoBooking").style.display="none";chosen=null;});
    $("itoDrivers").addEventListener("click",e=>{const b=e.target.closest("[data-ito-request]");if(b)selectDriver(b.dataset.itoRequest);});
    $("itoBooking").addEventListener("submit",sendRequest);
    $("itoPassengerTrips").addEventListener("click",tripClick);
    $("itoDriverTrips").addEventListener("click",tripClick);
    $("itoDriver").addEventListener("click",availabilityClick);
    document.addEventListener("submit",chatSubmit);
  }
  function selectDriver(id) {
    chosen=directory.find(d=>d.id===id);if(!chosen)return;
    $("itoDriverId").value=id;$("itoChosen").textContent=chosen.driver_name+" • "+chosen.vehicle_make_model+" • "+chosen.passenger_capacity+" seats";
    $("itoService").innerHTML=(chosen.service_types||[]).map(s=>'<option value="'+esc(s)+'">'+esc(labels[s]||s)+'</option>').join("");
    $("itoBooking").style.display="block";$("itoBooking").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function sendRequest(e) {
    e.preventDefault();const b=$("itoSend");b.disabled=true;b.textContent="SENDING…";
    try {
      const r=await call({action:"create_request",driver_id:$("itoDriverId").value,service_type:$("itoService").value,passenger_name:$("itoName").value,passenger_phone:$("itoPhone").value,pickup_location:$("itoPickup").value,destination:$("itoDestination").value,passenger_count:$("itoCount").value,notes:$("itoNotes").value});
      say("itoBookingStatus",r.message||"Request sent.");$("itoBooking").reset();$("itoBooking").style.display="none";chosen=null;await refresh();
    } catch(err){say("itoBookingStatus",err.message,true);}
    finally{b.disabled=false;b.textContent="SEND TRANSPORT REQUEST";}
  }
  async function refresh() {
    try {
      const [d,j]=await Promise.all([call({action:"active_drivers",service_type:$("itoFilter")?.value||""}),call({action:"my_jobs"})]);
      directory=d.drivers||[];renderDrivers(directory);renderTrips(j.jobs||[]);
    } catch(err){$("itoDrivers").innerHTML='<div class="ito-empty">'+esc(err.message)+'</div>';}
  }
  function renderDrivers(rows) {
    const host=$("itoDrivers");if(!host)return;
    if(!rows.length){host.innerHTML='<div class="ito-empty">No verified drivers are active in this service right now. Please refresh later.</div>';return;}
    host.innerHTML=rows.map(d=>{
      const busy=d.availability==="busy",photo=d.profile_photo_url?'<img class="ito-photo" src="'+esc(d.profile_photo_url)+'" alt="Driver photo">':'<div class="ito-photo"></div>';
      return '<article class="ito-card"><div class="ito-head">'+photo+'<div style="min-width:0"><h3>'+esc(d.driver_name)+'</h3><span class="ito-pill '+(busy?'busy':'')+'">'+(busy?'BUSY • ON A TRIP':'ACTIVE • READY')+'</span></div></div><div class="ito-meta"><b>Vehicle:</b> '+esc(d.vehicle_make_model)+'<br><b>Services:</b> '+esc((d.service_types||[]).map(s=>labels[s]||s).join(" • "))+'<br><b>Area:</b> '+esc(d.operating_area)+'<br><b>Capacity:</b> '+esc(d.passenger_capacity)+' passengers</div>'+(busy?'<p class="ito-muted">This driver has already accepted a trip.</p>':'<button class="ito-btn primary" data-ito-request="'+esc(d.id)+'">REQUEST THIS DRIVER</button>')+'</article>';
    }).join("");
  }
  function renderTrips(jobs) {
    const openChats=[...document.querySelectorAll(".ito-chat")].filter(x=>x.style.display==="block").map(x=>x.id.slice(8));
    const p=jobs.filter(j=>j.viewer_role==="passenger"),d=jobs.filter(j=>j.viewer_role==="driver");
    $("itoPassengerTrips").innerHTML=p.length?p.map(j=>passengerCard(j)).join(""):'<div class="ito-empty">No trips yet. Choose an ACTIVE driver above.</div>';
    $("itoDriverTrips").innerHTML=d.length?d.map(j=>driverCard(j)).join(""):'<div class="ito-empty">No incoming requests or current trips.</div>';
    openChats.forEach(id=>openChat(id));
  }
  function chatShell(j){return '<div class="ito-chat" id="itoChat-'+esc(j.id)+'" style="display:none"></div>';}
  function passengerCard(j) {
    const active=["accepted","in_progress","completed"].includes(j.status),phone=j.driver?.phone_number;
    return '<article class="ito-card" data-ito-job="'+esc(j.id)+'"><h3>'+esc(labels[j.service_type]||j.service_type)+' • '+esc(j.status.toUpperCase().replace("_"," "))+'</h3><div class="ito-meta"><b>From:</b> '+esc(j.pickup_location)+'<br><b>To:</b> '+esc(j.destination)+'<br><b>Driver:</b> '+esc(j.driver?.driver_name||"Assigned driver")+(j.driver?.vehicle_make_model?'<br><b>Vehicle:</b> '+esc(j.driver.vehicle_make_model):"")+(phone?'<br><b>Phone:</b> '+esc(phone):"")+'<br><b>Passengers:</b> '+esc(j.passenger_count)+'</div>'+(active?'<button class="ito-btn" data-ito-chat="'+esc(j.id)+'">OPEN DRIVER CHAT</button>':"")+(["requested","accepted","in_progress"].includes(j.status)?'<button class="ito-btn" data-ito-action="cancel_trip" data-ito-id="'+esc(j.id)+'">CANCEL TRIP</button>':"")+chatShell(j)+'</article>';
  }
  function driverCard(j) {
    const pending=j.status==="requested",accepted=j.status==="accepted",started=j.status==="in_progress";
    return '<article class="ito-card" data-ito-job="'+esc(j.id)+'"><h3>'+esc(labels[j.service_type]||j.service_type)+' • '+esc(j.status.toUpperCase().replace("_"," "))+'</h3><div class="ito-meta"><b>Passenger:</b> '+esc(j.passenger_name)+(j.passenger_phone?' • '+esc(j.passenger_phone):"")+'<br><b>Pickup:</b> '+esc(j.pickup_location)+'<br><b>Destination:</b> '+esc(j.destination)+'<br><b>Passengers:</b> '+esc(j.passenger_count)+(j.notes?'<br><b>Details:</b> '+esc(j.notes):"")+'</div>'+(pending?'<button class="ito-btn primary" data-ito-action="accept" data-ito-id="'+esc(j.id)+'">ACCEPT JOB</button><button class="ito-btn" data-ito-action="decline" data-ito-id="'+esc(j.id)+'">DECLINE</button>':"")+(accepted?'<button class="ito-btn primary" data-ito-action="start_trip" data-ito-id="'+esc(j.id)+'">START TRIP</button>':"")+(started?'<button class="ito-btn primary" data-ito-action="complete_trip" data-ito-id="'+esc(j.id)+'">JOB COMPLETE</button>':"")+(accepted||started||j.status==="completed"?'<button class="ito-btn" data-ito-chat="'+esc(j.id)+'">OPEN PASSENGER CHAT</button>':"")+(accepted||started?'<button class="ito-btn" data-ito-action="cancel_trip" data-ito-id="'+esc(j.id)+'">CANCEL TRIP</button>':"")+chatShell(j)+'</article>';
  }
  async function tripClick(e) {
    const chat=e.target.closest("[data-ito-chat]");if(chat){await openChat(chat.dataset.itoChat);return;}
    const b=e.target.closest("[data-ito-action]");if(!b)return;
    const action=b.dataset.itoAction,id=b.dataset.itoId;
    if(action==="cancel_trip"&&!confirm("Cancel this transport trip?"))return;
    if(action==="complete_trip"&&!confirm("Confirm this trip is complete? Your availability will return to ACTIVE."))return;
    b.disabled=true;
    try{const r=await call({action,job_id:id});if(!r.success)throw new Error(r.error||"Trip update failed.");await refresh();await status();}
    catch(err){alert(err.message);b.disabled=false;}
  }
  async function openChat(id) {
    const host=$("itoChat-"+id);if(!host)return;host.style.display="block";host.innerHTML='<div class="ito-muted">Loading trip chat…</div>';
    try {
      const r=await call({action:"get_messages",job_id:id});
      host.innerHTML='<b class="ito-muted">TRIP CHAT</b><div class="ito-log" id="itoLog-'+esc(id)+'">'+(r.messages||[]).map(m=>'<div class="ito-msg '+(m.sender_user_id===me?'mine':'')+'">'+esc(m.message)+'<small>'+esc(new Date(m.created_at).toLocaleString())+'</small></div>').join("")+'</div><form class="ito-send" data-ito-chat-form="'+esc(id)+'"><input class="ito-input" name="message" maxlength="1000" required placeholder="Write a message…"><button class="ito-btn primary">SEND</button></form>';
      const log=$("itoLog-"+id);if(log)log.scrollTop=log.scrollHeight;
    }catch(err){host.innerHTML='<div class="ito-status error">'+esc(err.message)+'</div>';}
  }
  async function chatSubmit(e) {
    const f=e.target.closest("[data-ito-chat-form]");if(!f)return;e.preventDefault();
    const id=f.dataset.itoChatForm,input=f.querySelector("input"),b=f.querySelector("button");b.disabled=true;
    try{await call({action:"send_message",job_id:id,message:input.value});await openChat(id);}
    catch(err){const host=$("itoChat-"+id);if(host)host.insertAdjacentHTML("beforeend",'<div class="ito-status error">'+esc(err.message)+'</div>');}
    finally{b.disabled=false;}
  }
  function availability(value,returnOnline) {
    const pill=$("itoAvailability");if(!pill)return;pill.textContent=String(value||"offline").toUpperCase();pill.className="ito-pill "+(value==="busy"?"busy":"");
    $("itoDriverHint").textContent=value==="busy"?(returnOnline===false?"On a trip. You will go OFFLINE when it is complete.":"On a trip. You will return to ACTIVE when complete."):value==="active"?"You are visible to passengers. Accepting a job automatically makes you BUSY.":"You are hidden from passengers. Switch to ACTIVE when ready.";
    $("itoGoActive").disabled=value==="active"||(value==="busy"&&returnOnline!==false);$("itoGoOffline").disabled=value==="offline"||(value==="busy"&&returnOnline===false);
  }
  async function availabilityClick(e) {
    if(!["itoGoActive","itoGoOffline"].includes(e.target.id))return;
    const desired=e.target.id==="itoGoActive"?"active":"offline";
    try{const r=await call({action:"set_availability",availability:desired});if(!r.success)throw new Error(r.error||"Availability update failed.");availability(r.availability,r.return_online_after_job);await refresh();}
    catch(err){say("itoDriverHint",err.message,true);}
  }
  async function status() {
    const r=await call({action:"my_status"});const driver=r.driver,app=r.application;
    if(driver?.verification_status==="approved"){
      $("itDriverForm").style.display="none";$("itMyStatus").innerHTML='<div class="it-application-status"><span class="it-status-pill">AUTHORITY APPROVED</span><p>Your verified i1 Transport driver profile is ready. Switch to ACTIVE when you are ready to receive trips.</p></div>';
      $("itoDriver").style.display="block";$("itoDriverWelcome").textContent=driver.driver_name+" • "+driver.vehicle_make_model+" • "+driver.vehicle_registration;availability(driver.availability,driver.return_online_after_job);
    } else {
      $("itoDriver").style.display="none";
      $("itDriverForm").style.display="block";
      if(app){const note=app.admin_note?'<br><b>Authority note:</b> '+esc(app.admin_note):'';$("itMyStatus").innerHTML='<div class="it-application-status"><span class="it-status-pill">'+esc(String(app.status||"pending").toUpperCase())+'</span><p>Your driver application was submitted on '+esc(app.created_at?new Date(app.created_at).toLocaleDateString():"—")+'.'+note+'</p></div>';}
      else $("itMyStatus").innerHTML="";
    }
  }
  async function openNetwork() {
    install();if(!$("itoPassenger"))return;
    try{await session();await status();await refresh();}catch(err){say("itoBookingStatus",err.message,true);}
    if(poll)clearInterval(poll);if(heartbeat)clearInterval(heartbeat);
    poll=setInterval(()=>{if($(overlayId)?.style.display==="block")refresh();},12000);
    heartbeat=setInterval(async()=>{if($(overlayId)?.style.display!=="block")return;try{const r=await call({action:"heartbeat"});if(r.driver)availability(r.driver.availability,r.driver.return_online_after_job);}catch(_){}},30000);
  }
  function closeNetwork(){if(poll)clearInterval(poll);if(heartbeat)clearInterval(heartbeat);poll=null;heartbeat=null;}
  function installAuthority() {
    const host=document.querySelector("#authorityPressPanel .authority-panel-inner");if(!host||$("itoAuthority"))return;
    const section=document.createElement("section");section.id="itoAuthority";section.className="ito-section";
    section.innerHTML='<h2>i1 TRANSPORT • OPERATIONS CONTROL</h2><p class="ito-muted">Review driver applications, monitor active drivers and trips, and suspend or reinstate verified profiles.</p><div class="ito-grid"><div class="ito-card"><h3 id="itoPending">—</h3><div class="ito-muted">PENDING</div></div><div class="ito-card"><h3 id="itoApproved">—</h3><div class="ito-muted">APPROVED</div></div><div class="ito-card"><h3 id="itoRejected">—</h3><div class="ito-muted">REJECTED</div></div><div class="ito-card"><h3 id="itoActive">—</h3><div class="ito-muted">ACTIVE DRIVERS</div></div><div class="ito-card"><h3 id="itoBusy">—</h3><div class="ito-muted">BUSY DRIVERS</div></div><div class="ito-card"><h3 id="itoOpenJobs">—</h3><div class="ito-muted">OPEN TRIPS</div></div></div><div class="ito-actions"><button class="ito-btn primary" id="itoAuthRefresh">REFRESH TRANSPORT</button></div><div class="ito-status" id="itoAuthStatus"></div><h3>Verified driver management</h3><div id="itoAuthDrivers"></div><h3>Live trip monitoring</h3><div id="itoAuthJobs"></div>';
    host.appendChild(section);$("itoAuthRefresh").addEventListener("click",authorityLoad);section.addEventListener("click",authorityClick);
  }
  async function authorityLoad() {
    installAuthority();if(!$("itoAuthStatus"))return;
    const token=sessionStorage.getItem("ioneAuthoritySession")||"";if(!token){say("itoAuthStatus","Unlock Authority Press to manage transport.",true);return;}
    say("itoAuthStatus","Loading transport operations…");
    try{
      const r=await call({action:"authority_dashboard",authority_session:token}),m=r.metrics||{};
      $("itoPending").textContent=m.pending??0;$("itoApproved").textContent=m.approved??0;$("itoRejected").textContent=m.rejected??0;$("itoActive").textContent=m.active??0;$("itoBusy").textContent=m.busy??0;$("itoOpenJobs").textContent=m.open_jobs??0;
      $("itoAuthDrivers").innerHTML=(r.drivers||[]).map(d=>'<article class="it-card"><h3>'+esc(d.driver_name)+' • '+esc(d.verification_status.toUpperCase())+'</h3><div class="ito-meta">'+esc(d.phone_number)+'<br>'+esc(d.vehicle_make_model)+' • '+esc(d.vehicle_registration)+'<br>'+esc((d.service_types||[]).map(s=>labels[s]||s).join(" • "))+'<br>Availability: '+esc(d.availability.toUpperCase())+' • '+esc(d.operating_area)+'</div>'+(d.verification_status==="approved"?'<button class="ito-btn" data-ito-authority="suspend_driver" data-ito-driver="'+esc(d.id)+'" '+(d.availability==="busy"?"disabled":"")+'>SUSPEND DRIVER</button>':'<button class="ito-btn primary" data-ito-authority="reinstate_driver" data-ito-driver="'+esc(d.id)+'">REINSTATE DRIVER</button>')+'</article>').join("")||'<div class="ito-empty">No verified driver profiles yet.</div>';
      $("itoAuthJobs").innerHTML=(r.active_jobs||[]).map(j=>'<article class="it-card"><h3>'+esc(j.service_type)+' • '+esc(j.status.toUpperCase())+'</h3><div class="ito-meta">Passenger: '+esc(j.passenger_name)+'<br>Driver: '+esc(j.driver_name)+'<br>'+esc(j.pickup_location)+' → '+esc(j.destination)+'<br>'+esc(new Date(j.requested_at).toLocaleString())+'</div></article>').join("")||'<div class="ito-empty">No active transport trips.</div>';
      say("itoAuthStatus","Transport operations loaded.",false);
    }catch(err){say("itoAuthStatus",err.message,true);}
  }
  async function authorityClick(e) {
    const b=e.target.closest("[data-ito-authority]");if(!b)return;
    const action=b.dataset.itoAuthority,id=b.dataset.itoDriver;
    if(!confirm(action==="suspend_driver"?"Suspend this driver? They will be removed from the passenger directory.":"Reinstate this driver? They will return OFFLINE."))return;
    b.disabled=true;
    try{const token=sessionStorage.getItem("ioneAuthoritySession")||"";const r=await call({action,driver_id:id,authority_session:token});say("itoAuthStatus",r.message||"Saved.");await authorityLoad();}
    catch(err){say("itoAuthStatus",err.message,true);b.disabled=false;}
  }
  function watch() {
    const overlay=$(overlayId);if(!overlay)return;
    install();
    const observer=new MutationObserver(()=>{if(overlay.style.display==="block")openNetwork();else closeNetwork();});
    observer.observe(overlay,{attributes:true,attributeFilter:["style"]});
    const panel=$("authorityPressPanel");if(panel){const authObserver=new MutationObserver(()=>{if(getComputedStyle(panel).display!=="none")authorityLoad();});authObserver.observe(panel,{attributes:true,attributeFilter:["style","class","aria-hidden"]});}
    const authButton=$("openAuthority");if(authButton)authButton.addEventListener("click",()=>setTimeout(authorityLoad,700));
    if(overlay.style.display==="block")openNetwork();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watch,{once:true});else watch();
})();