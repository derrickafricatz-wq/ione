/* I|ONE Live Class — isolated learning experience.
   Public catalogue and Authority controls call the dedicated ione-live-class Edge Function.
   Payment is never inferred from the UI; playback is issued only by the server. */
(function(){
  "use strict";
  if(window.__ioneLiveClassBooted)return;
  window.__ioneLiveClassBooted=true;
  const FN="ione-live-class";
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&gt;",">":"&lt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>"TZS "+Number(v||0).toLocaleString("en-US");
  const sb=()=>typeof heavensSupabase!=="undefined"?heavensSupabase:null;
  let overlay=null,manager=null,activeTab="recorded",classes=[],authorityClasses=[],busy=false;
  let selectedClass=null;

  function invoke(action,extra){
    const client=sb();
    if(!client)throw new Error("I|ONE connection is not ready. Reload and try again.");
    const body=Object.assign({action},extra||{});
    if(action.startsWith("authority_"))body.authority_session=sessionStorage.getItem("ioneAuthoritySession")||"";
    return client.functions.invoke(FN,{body}).then(r=>{
      if(r.error||!r.data||!r.data.success)throw new Error(r.data?.error||r.error?.message||"Live Class request failed.");
      return r.data;
    });
  }
  function status(el,message,error){
    if(!el)return;
    el.textContent=message;
    el.style.color=error?"#ff9d9d":"#a9e9ce";
  }
  function ensureOverlay(){
    if(overlay)return overlay;
    const style=document.createElement("style");
    style.id="ioneLiveClassStyles";
    style.textContent=`
      #ioneLiveClassOverlay{position:fixed;inset:0;z-index:1100;display:none;flex-direction:column;background:radial-gradient(ellipse at 50% 0%,#17343b 0%,#08171c 48%,#050b0e 100%);color:#f4fbfc;font-family:Arial,sans-serif;overflow:hidden}
      #ioneLiveClassOverlay.is-open{display:flex}
      .ilc-head{display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top)) 15px 12px;border-bottom:1px solid rgba(0,255,255,.2);background:rgba(3,12,15,.92)}
      .ilc-back{width:42px;height:42px;flex:0 0 42px;border:1px solid #31cbd1;border-radius:50%;background:#10282d;color:#9effff;font-size:23px}
      .ilc-head-copy{min-width:0;flex:1}.ilc-kicker{font-size:9px;font-weight:900;letter-spacing:2px;color:#6fe6e6}.ilc-head h2{margin:4px 0 0;font-size:19px;letter-spacing:.4px}
      .ilc-scroll{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;padding:15px 14px calc(28px + env(safe-area-inset-bottom))}
      .ilc-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:0 0 16px}
      .ilc-tab{min-height:46px;border:1px solid #29484f;border-radius:12px;background:#0c1d22;color:#c5dadd;font-size:10px;font-weight:900;letter-spacing:.35px}
      .ilc-tab[aria-selected=true]{border-color:#27d8d9;background:linear-gradient(135deg,#0c5157,#123b49);color:#fff;box-shadow:inset 0 0 0 1px rgba(0,255,255,.12)}
      .ilc-intro{padding:16px;border:1px solid rgba(0,255,255,.22);border-radius:17px;background:linear-gradient(130deg,rgba(10,59,64,.76),rgba(10,24,31,.92));margin-bottom:15px}
      .ilc-intro strong{display:block;font-size:19px;line-height:1.25}.ilc-intro p{margin:7px 0 0;color:#a9c2c7;font-size:12px;line-height:1.55}
      .ilc-card{display:grid;gap:9px;padding:14px;margin:0 0 11px;border:1px solid #25444b;border-radius:16px;background:linear-gradient(145deg,#102329,#091317);box-shadow:0 8px 22px rgba(0,0,0,.18)}
      .ilc-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.ilc-chip{display:inline-flex;padding:5px 8px;border:1px solid #32636a;border-radius:999px;color:#8ce9e7;font-size:9px;font-weight:900;letter-spacing:.7px;text-transform:uppercase}
      .ilc-card h3{margin:0;font-size:16px;line-height:1.3}.ilc-meta{color:#9db4b9;font-size:11px;line-height:1.5}.ilc-desc{margin:0;color:#c5d3d6;font-size:12px;line-height:1.55;white-space:pre-wrap}
      .ilc-action{min-height:43px;border:1px solid #2caeb4;border-radius:11px;background:linear-gradient(135deg,#087e83,#145b78);color:#fff;font-size:11px;font-weight:900;letter-spacing:.5px;padding:10px 13px}
      .ilc-action.secondary{background:#10252a;border-color:#38565d;color:#d6eff0}.ilc-action:disabled{opacity:.45;filter:grayscale(.6)}
      .ilc-empty,.ilc-note{padding:16px;border:1px dashed #31525a;border-radius:14px;color:#9bb4b9;font-size:12px;line-height:1.6;text-align:center}
      .ilc-player{width:100%;aspect-ratio:16/9;border:0;border-radius:13px;background:#000}
      #ioneLiveClassManager{position:fixed;inset:0;z-index:1200;display:none;flex-direction:column;background:#071316;color:#fff;font-family:Arial,sans-serif;overflow:hidden}
      #ioneLiveClassManager.is-open{display:flex}
      .ilc-form{display:grid;gap:10px;padding:14px;border:1px solid #29464d;border-radius:16px;background:#0c1d22;margin-bottom:14px}
      .ilc-form label{display:grid;gap:5px;color:#b9d0d4;font-size:10px;font-weight:800;letter-spacing:.5px}
      .ilc-form input,.ilc-form textarea,.ilc-form select{width:100%;box-sizing:border-box;min-height:42px;border:1px solid #31535a;border-radius:9px;background:#061115;color:#fff;padding:10px;font:13px Arial,sans-serif}
      .ilc-form textarea{min-height:74px;resize:vertical}.ilc-form-row{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      .ilc-admin-card{display:grid;gap:8px;padding:12px;border:1px solid #29464d;border-radius:13px;background:#0c1b20;margin-bottom:9px}
      .ilc-secret{padding:10px;border:1px solid #a68b42;border-radius:10px;background:#241f0e;color:#ffe7a2;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
      @media(max-width:360px){.ilc-tab{font-size:9px;padding:6px 3px}.ilc-form-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    overlay=document.createElement("section");
    overlay.id="ioneLiveClassOverlay";overlay.setAttribute("aria-hidden","true");
    overlay.innerHTML=`
      <header class="ilc-head"><button class="ilc-back" type="button" id="ilcClose" aria-label="Close Live Class">‹</button><div class="ilc-head-copy"><div class="ilc-kicker">LEARN • CREATE • DEVELOP</div><h2>I|ONE LIVE CLASS</h2></div></header>
      <div class="ilc-scroll">
        <div class="ilc-tabs" role="tablist" aria-label="Learning formats">
          <button class="ilc-tab" data-tab="recorded" role="tab" aria-selected="true">RECORDED</button>
          <button class="ilc-tab" data-tab="broadcast" role="tab" aria-selected="false">LIVE BROADCAST</button>
          <button class="ilc-tab" data-tab="interactive" role="tab" aria-selected="false">CLASSROOM</button>
        </div>
        <div id="ilcContent" aria-live="polite"><div class="ilc-empty">Loading classes…</div></div>
      </div>`;
    document.body.appendChild(overlay);
    $("ilcClose").addEventListener("click",closeOverlay);
    overlay.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{activeTab=b.dataset.tab;renderTabs();renderPublic();}));
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay.classList.contains("is-open"))closeOverlay();});
    return overlay;
  }
  function renderTabs(){
    if(!overlay)return;
    overlay.querySelectorAll("[data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===activeTab)));
  }
  function openOverlay(){
    ensureOverlay();overlay.classList.add("is-open");overlay.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";activeTab="recorded";renderTabs();loadPublic();
  }
  function closeOverlay(){
    if(!overlay)return;
    overlay.classList.remove("is-open");overlay.setAttribute("aria-hidden","true");
    if(manager){manager.classList.remove("is-open");manager.setAttribute("aria-hidden","true");}
    document.body.style.overflow="";
  }
  function intro(){
    const copy={
      recorded:["Learn at your own pace","Practical lessons from skilled instructors. Purchase access and learn whenever it suits you."],
      broadcast:["Join a live lesson","Watch instructors teach in real time. Upcoming sessions show their scheduled date and starting time."],
      interactive:["Enter the learning room","A two-way classroom for instructors and students, with camera, microphone and discussion. This experience is being prepared for a later release."]
    }[activeTab];
    return '<div class="ilc-intro"><strong>'+esc(copy[0])+'</strong><p>'+esc(copy[1])+'</p></div>';
  }
  function renderPublic(){
    if(!overlay)return;
    renderTabs();
    const host=$("ilcContent");if(!host)return;
    if(activeTab==="interactive"){
      host.innerHTML=intro()+'<div class="ilc-note">Interactive video classrooms are planned for the next development stage. The first release focuses on secure recorded lessons and one-instructor live broadcasts.</div>';
      return;
    }
    const type=activeTab==="recorded"?"recorded":"live_broadcast";
    const items=classes.filter(c=>c.class_type===type);
    host.innerHTML=intro();
    if(!items.length){host.insertAdjacentHTML("beforeend",'<div class="ilc-empty">No '+(type==="recorded"?"recorded training":"live classes")+' have been published yet. Please check again soon.</div>');return;}
    items.forEach(item=>{
      const card=document.createElement("article");card.className="ilc-card";
      const chip=type==="recorded"?"RECORDED TRAINING":(new Date(item.scheduled_start||0)>new Date()?"UPCOMING LIVE CLASS":"LIVE CLASS");
      const date=item.scheduled_start?new Date(item.scheduled_start).toLocaleString():"Schedule to be announced";
      card.innerHTML='<div class="ilc-card-top"><span class="ilc-chip">'+esc(chip)+'</span><strong>'+esc(money(item.price_tzs))+'</strong></div><h3>'+esc(item.title)+'</h3><div class="ilc-meta">'+esc(item.category||"General")+' • '+esc(item.instructor_name||"I|ONE Instructor")+(type==="live_broadcast"?"<br>"+esc(date):"")+'</div><p class="ilc-desc">'+esc(item.description||"")+'</p><button class="ilc-action" type="button" data-play="'+esc(item.id)+'">'+(Number(item.price_tzs)>0?"GET ACCESS":(type==="live_broadcast"?"JOIN LIVE CLASS":"WATCH LESSON"))+'</button>';
      host.appendChild(card);
    });
    host.querySelectorAll("[data-play]").forEach(button=>button.addEventListener("click",()=>playClass(button.dataset.play,button)));
  }
  async function loadPublic(){
    const host=$("ilcContent");if(host)host.innerHTML='<div class="ilc-empty">Loading published classes…</div>';
    try{const data=await invoke("public_list");classes=Array.isArray(data.classes)?data.classes:[];renderPublic();}
    catch(e){if(host)host.innerHTML='<div class="ilc-empty">'+esc(e.message||"Could not load classes.")+'</div>';}
  }
  async function playClass(id,button){
    const item=classes.find(c=>c.id===id);if(!item)return;
    if(Number(item.price_tzs)>0){alert("Paid access is not active yet. I|ONE will enable secure checkout after the training payment provider is configured.");return;}
    button.disabled=true;button.textContent="CHECKING ACCESS…";
    try{
      const data=await invoke("playback_access",{class_id:id});
      const host=$("ilcContent");host.replaceChildren();
      const back=document.createElement("button");back.className="ilc-action secondary";back.textContent="‹ BACK TO CLASSES";back.addEventListener("click",renderPublic);
      const title=document.createElement("h3");title.textContent=item.title;
      const player=document.createElement("iframe");player.className="ilc-player";player.allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen";player.allowFullscreen=true;player.src="https://iframe.videodelivery.net/"+encodeURIComponent(data.playback_token);
      const note=document.createElement("p");note.className="ilc-meta";note.textContent="Secure playback access expires automatically.";
      host.append(back,title,player,note);
    }catch(e){alert(e.message||"Could not open this class.");button.disabled=false;button.textContent="WATCH CLASS";}
  }

  function ensureManager(){
    if(manager)return manager;
    manager=document.createElement("section");manager.id="ioneLiveClassManager";manager.setAttribute("aria-hidden","true");
    manager.innerHTML=`
      <header class="ilc-head"><button class="ilc-back" type="button" id="ilcAdminClose" aria-label="Close manager">‹</button><div class="ilc-head-copy"><div class="ilc-kicker">AUTHORITY PRESS</div><h2>LIVE CLASS MANAGEMENT</h2></div></header>
      <div class="ilc-scroll">
        <form id="ilcCreateForm" class="ilc-form">
          <strong>CREATE A TRAINING CLASS</strong>
          <label>CLASS NAME<input name="title" required maxlength="140" placeholder="Example: Professional Craft Training"></label>
          <label>INSTRUCTOR NAME<input name="instructor_name" maxlength="120" placeholder="Instructor or organization"></label>
          <div class="ilc-form-row">
            <label>CLASS FORMAT<select name="class_type"><option value="recorded">Recorded training</option><option value="live_broadcast">Live broadcast</option><option value="interactive">Interactive classroom (coming soon)</option></select></label>
            <label>CATEGORY<select name="category"><option>Art & Crafts</option><option>Fashion & Tailoring</option><option>Graphic Design</option><option>Photography & Video</option><option>Business</option><option>Digital Skills</option><option>Entrepreneurship</option><option>Other</option></select></label>
          </div>
          <label>DESCRIPTION<textarea name="description" maxlength="4000" placeholder="What will students learn?"></textarea></label>
          <div class="ilc-form-row">
            <label>PRICE (TZS)<input name="price_tzs" type="number" min="0" step="1" value="0" required></label>
            <label>LESSON DURATION (MINUTES)<input name="duration_minutes" type="number" min="1" max="60" placeholder="Recorded: up to 60"></label>
          </div>
          <div class="ilc-form-row" id="ilcScheduleFields">
            <label>START DATE & TIME<input name="scheduled_start" type="datetime-local"></label>
            <label>END DATE & TIME<input name="scheduled_end" type="datetime-local"></label>
          </div>
          <label><span>RECORDED VIDEO (MP4, up to 200 MB; maximum lesson duration 60 minutes)</span><input name="video_file" type="file" accept="video/mp4,video/webm"></label>
          <button class="ilc-action" type="submit" id="ilcCreateButton">SAVE CLASS AS DRAFT</button>
          <div id="ilcAdminStatus" class="ilc-meta" role="status"></div>
        </form>
        <div class="ilc-note">Live broadcast classes receive private RTMPS credentials. Keep the stream key confidential and enter it only in the instructor's broadcasting software. Interactive classrooms are reserved for the next stage.</div>
        <div class="ilc-card-top"><strong>YOUR CLASSES</strong><button class="ilc-action secondary" type="button" id="ilcAdminRefresh">REFRESH</button></div>
        <div id="ilcAdminList"><div class="ilc-empty">Loading…</div></div>
      </div>`;
    document.body.appendChild(manager);
    $("ilcAdminClose").addEventListener("click",closeManager);
    $("ilcAdminRefresh").addEventListener("click",loadAuthority);
    $("ilcCreateForm").addEventListener("submit",createClass);
    $("ilcCreateForm").elements.class_type.addEventListener("change",updateAdminFields);
    updateAdminFields();
    return manager;
  }
  function updateAdminFields(){
    const form=$("ilcCreateForm");if(!form)return;
    const type=form.elements.class_type.value;
    $("ilcScheduleFields").style.display=type==="recorded"?"none":"grid";
    form.elements.video_file.disabled=type!=="recorded";
    form.elements.duration_minutes.disabled=type!=="recorded";
  }
  function openManager(){
    ensureManager();manager.classList.add("is-open");manager.setAttribute("aria-hidden","false");loadAuthority();
  }
  function closeManager(){if(!manager)return;manager.classList.remove("is-open");manager.setAttribute("aria-hidden","true");}
  async function uploadTus(file,uploadUrl,onProgress){
    const head=await fetch(uploadUrl,{method:"HEAD",headers:{"Tus-Resumable":"1.0.0"}});
    if(!head.ok)throw new Error("Could not resume the secure video upload ("+head.status+").");
    let offset=Number(head.headers.get("Upload-Offset")||0);
    if(!Number.isFinite(offset)||offset<0||offset>file.size)throw new Error("Cloudflare returned an invalid upload offset.");
    const chunkSize=8*1024*1024;
    while(offset<file.size){
      const end=Math.min(file.size,offset+chunkSize);
      const response=await fetch(uploadUrl,{
        method:"PATCH",
        headers:{"Tus-Resumable":"1.0.0","Upload-Offset":String(offset),"Content-Type":"application/offset+octet-stream"},
        body:file.slice(offset,end)
      });
      if(!response.ok)throw new Error("Video upload stopped at "+Math.round(offset/file.size*100)+"% (HTTP "+response.status+"). You can retry the upload from Authority Press.");
      const returned=Number(response.headers.get("Upload-Offset"));
      offset=Number.isFinite(returned)&&returned>end-1?returned:end;
      if(typeof onProgress==="function")onProgress(Math.min(100,Math.round(offset/file.size*100)));
    }
  }
  async function uploadRecordedFile(classId,file,message){
    if(!file||!file.size)throw new Error("Choose an MP4 or WebM video file.");
    status(message,"Preparing resumable video upload…");
    const ticket=await invoke("authority_create_upload",{class_id:classId,file_name:file.name,file_size:file.size});
    if(!ticket.upload_url)throw new Error("Cloudflare did not return a video upload URL.");
    await uploadTus(file,ticket.upload_url,percent=>status(message,"Uploading video… "+percent+"%"));
    status(message,"Video uploaded. Checking processing status…");
    await invoke("authority_check_upload",{class_id:classId});
    status(message,"Upload complete. Refresh the class list to confirm processing status.");
  }

  async function createClass(event){
    event.preventDefault();if(busy)return;busy=true;
    const form=$("ilcCreateForm"),button=$("ilcCreateButton"),message=$("ilcAdminStatus");
    const f=new FormData(form),type=String(f.get("class_type"));
    const minutes=Number(f.get("duration_minutes")||0);
    const start=f.get("scheduled_start")?new Date(f.get("scheduled_start")).toISOString():null;
    const end=f.get("scheduled_end")?new Date(f.get("scheduled_end")).toISOString():null;
    const payload={title:f.get("title"),instructor_name:f.get("instructor_name"),class_type:type,category:f.get("category"),description:f.get("description"),price_tzs:Number(f.get("price_tzs")||0),duration_seconds:minutes?minutes*60:null,scheduled_start:start,scheduled_end:end};
    try{
      const file=f.get("video_file");
      button.disabled=true;status(message,"Saving draft…");
      const data=await invoke("authority_create",{class_data:payload});
      let line="Draft created.";
      if(type==="recorded"&&file&&file.size){
        await uploadRecordedFile(data.class.id,file,message);
        line="Draft saved and video uploaded. Refresh to confirm processing status.";
      }else if(type==="live_broadcast"){
        status(message,"Preparing live broadcast input…");
        const stream=await invoke("authority_create_live_input",{class_id:data.class.id});
        line="Live input created. Copy and save the private stream key now.";
        const secret=document.createElement("div");secret.className="ilc-secret";
        secret.innerHTML="<strong>PRIVATE BROADCAST DETAILS — DO NOT SHARE</strong><br>RTMPS server: "+esc(stream.rtmps_url)+"<br>Stream key: "+esc(stream.stream_key);
        message.after(secret);
      }else if(type==="interactive"){
        line="Draft saved. Interactive classroom support will be enabled in a later stage.";
      }
      form.reset();updateAdminFields();status(message,line);await loadAuthority();
    }catch(e){status(message,e.message||"Could not create class.",true);}
    finally{busy=false;button.disabled=false;}
  }
  async function loadAuthority(){
    const list=$("ilcAdminList");if(!list)return;list.innerHTML='<div class="ilc-empty">Loading classes…</div>';
    try{
      const data=await invoke("authority_list");authorityClasses=Array.isArray(data.classes)?data.classes:[];
      list.replaceChildren();
      if(!authorityClasses.length){list.innerHTML='<div class="ilc-empty">No training classes have been created yet.</div>';return;}
      authorityClasses.forEach(item=>{
        const card=document.createElement("article");card.className="ilc-admin-card";
        const head=document.createElement("div");head.className="ilc-card-top";
        const title=document.createElement("strong");title.textContent=item.title;
        const chip=document.createElement("span");chip.className="ilc-chip";chip.textContent=(item.status||"draft")+" • "+(item.stream_status||"not configured");
        head.append(title,chip);
        const meta=document.createElement("div");meta.className="ilc-meta";meta.textContent=item.class_type+" • "+money(item.price_tzs)+" • "+(item.instructor_name||"No instructor");
        card.append(head,meta);
        if(item.class_type==="recorded"&&item.stream_status==="processing"){
          const check=document.createElement("button");check.className="ilc-action secondary";check.textContent="CHECK VIDEO PROCESSING";check.addEventListener("click",async()=>{try{await invoke("authority_check_upload",{class_id:item.id});await loadAuthority();}catch(e){alert(e.message);}});card.append(check);
        }
        if(item.class_type==="recorded"&&item.stream_status!=="ready"){
          const retry=document.createElement("button");retry.className="ilc-action secondary";retry.textContent=item.stream_status==="upload_pending"?"RESUME / REPLACE VIDEO":"UPLOAD TRAINING VIDEO";
          const picker=document.createElement("input");picker.type="file";picker.accept="video/mp4,video/webm";picker.hidden=true;
          picker.addEventListener("change",async()=>{const file=picker.files&&picker.files[0];if(!file)return;retry.disabled=true;try{await uploadRecordedFile(item.id,file,$("ilcAdminStatus"));await loadAuthority();}catch(e){alert(e.message);}finally{retry.disabled=false;}});
          retry.addEventListener("click",()=>picker.click());card.append(retry,picker);
        }
        if(item.class_type==="live_broadcast"&&item.live_input_uid){
          const help=document.createElement("p");help.className="ilc-meta";help.textContent="Live input is ready. Start your encoder at the scheduled time. The class can be published after the stream input is provisioned.";card.append(help);
        }
        if(item.status==="draft"&&((item.class_type==="recorded"&&item.stream_status==="ready")||(item.class_type==="live_broadcast"&&item.stream_status==="live_input_ready"))){
          const publish=document.createElement("button");publish.className="ilc-action";publish.textContent="PUBLISH CLASS";publish.addEventListener("click",async()=>{publish.disabled=true;try{await invoke("authority_publish",{class_id:item.id});await loadAuthority();}catch(e){alert(e.message);publish.disabled=false;}});card.append(publish);
        }
        if(item.status==="published"){
          const suspend=document.createElement("button");suspend.className="ilc-action secondary";suspend.textContent="SUSPEND CLASS";suspend.addEventListener("click",async()=>{suspend.disabled=true;try{await invoke("authority_suspend",{class_id:item.id});await loadAuthority();}catch(e){alert(e.message);suspend.disabled=false;}});card.append(suspend);
        }
        list.appendChild(card);
      });
    }catch(e){list.innerHTML='<div class="ilc-empty">'+esc(e.message||"Could not load Authority classes.")+'</div>';}
  }
  function installAuthoritySection(){
    const panel=$("authorityPressPanel");
    if(!panel||$("ioneLiveClassAuthoritySection"))return;
    const section=document.createElement("section");section.id="ioneLiveClassAuthoritySection";section.className="authority-panel-section";
    section.innerHTML='<div class="authority-section-kicker">LEARNING & SKILLS</div><h3>I|ONE LIVE CLASS</h3><p class="authority-section-note">Create recorded training, schedule live broadcasts, manage pricing and control publication. Video and broadcast credentials are handled by the secure server.</p><button type="button" id="ioneAuthorityManageLiveClass" class="authority-save-button">MANAGE LIVE CLASS</button>';
    const anchor=$("ioneOpportunitiesAuthoritySection");
    if(anchor&&anchor.parentElement)anchor.insertAdjacentElement("afterend",section);else panel.appendChild(section);
    $("ioneAuthorityManageLiveClass").addEventListener("click",openManager);
  }
  function installTile(){
    const tile=$("openIoneLiveClass");
    if(tile&&!tile.dataset.ioneBound){tile.dataset.ioneBound="1";tile.addEventListener("click",openOverlay);}
  }
  function boot(){
    installTile();installAuthoritySection();
    const panel=$("authorityPressPanel");
    if(panel)new MutationObserver(installAuthoritySection).observe(panel,{childList:true,subtree:true});
    setTimeout(installTile,1200);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  window.ioneOpenLiveClass=openOverlay;
  window.ioneRefreshLiveClass=loadPublic;
})();