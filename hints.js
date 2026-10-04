const lessonHints = [
  "1 •",
  "2 •",
  "3 •",
  "4 •",
  "5 ."
];

/* ================= I|ONE REAL PUSH NOTIFICATIONS =================
   Kept in this already-loaded lightweight file so the main app remains untouched.
*/
(function(){
  "use strict";

  const PUSH_FUNCTION = "ione-push";
  let vapidPublicKey = "";

  function sb(){ return typeof heavensSupabase !== "undefined" ? heavensSupabase : null; }
  const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  const userDisabled=()=>{ try{return localStorage.getItem("ionePushUserDisabled")==="1";}catch(_){return false;} };
  const markEnabled=()=>{ try{localStorage.setItem("ionePushEnabled","1");localStorage.removeItem("ionePushUserDisabled");}catch(_){} };
  const markDisabled=()=>{ try{localStorage.removeItem("ionePushEnabled");localStorage.setItem("ionePushUserDisabled","1");}catch(_){} };

  async function waitForSupabase(maxMs=20000){
    const end=Date.now()+maxMs;
    while(!sb() && Date.now()<end) await sleep(400);
    return sb();
  }

  async function callPush(body){
    const client=sb();
    if(!client) throw new Error("I|ONE connection is not ready.");
    const r=await client.functions.invoke(PUSH_FUNCTION,{body});
    if(r.error) throw new Error(r.data?.error || r.error.message || "Push service request failed.");
    if(!r.data?.success) throw new Error(r.data?.error || "Push service request failed.");
    return r.data;
  }

  function uint8FromBase64Url(base64String){
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function getPushConfig(){
    if(!vapidPublicKey){
      try{ vapidPublicKey=localStorage.getItem("ioneVapidPublicKey") || ""; }catch(_){}
    }
    if(vapidPublicKey) return {success:true,publicKey:vapidPublicKey,cached:true};
    const data=await callPush({action:"config"});
    if(!data?.publicKey) throw new Error("Push configuration is missing its VAPID public key.");
    vapidPublicKey=data.publicKey;
    try{ localStorage.setItem("ioneVapidPublicKey",vapidPublicKey); }catch(_){}
    return data;
  }

  async function pushUserId(){
    try{
      const client=sb();
      if(!client || !client.auth || !client.auth.getSession) return null;
      const s=await client.auth.getSession();
      return s?.data?.session?.user?.id || null;
    }catch(_){ return null; }
  }

  async function savePushSubscription(subscription){
    const raw=subscription.toJSON();
    const userId=await pushUserId();
    return callPush({
      action:"subscribe",
      subscription:{endpoint:raw.endpoint,keys:raw.keys || {}},
      user_id:userId,
      user_agent:navigator.userAgent
    });
  }

  async function getOrCreatePushSubscription(){
    await waitForSupabase(20000);
    await getPushConfig();
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:uint8FromBase64Url(vapidPublicKey)
      });
    }
    await savePushSubscription(subscription);
    markEnabled();
    return subscription;
  }

  async function ensurePushSubscription(){
    if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
    if(Notification.permission !== "granted") return false;
    await getOrCreatePushSubscription();
    return true;
  }

  window.ioneEnsurePushSubscription = ensurePushSubscription;

  async function pushSubscribe(){
    if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){
      throw new Error("This device/browser does not support I|ONE push notifications.");
    }

    const permission = await Notification.requestPermission();
    if(permission !== "granted"){
      try{ await updateNotificationBell(); }catch(_) {}
      if(permission === "denied"){
        throw new Error("Notifications are blocked for I|ONE in this browser. Open the browser site settings for I|ONE, set Notifications to Allow, then press ACCESS DENIED again.");
      }
      throw new Error("Notification permission was not granted.");
    }

    await getOrCreatePushSubscription();
    await updateNotificationBell();
    return true;
  }

  async function syncExistingPush(){
    try{
      if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
      if(Notification.permission !== "granted") { await updateNotificationBell(); return false; }

      // An explicit OFF choice is respected across app restarts.
      if(userDisabled()){ await updateNotificationBell(); return false; }

      // Permission is already granted, so startup can safely restore/create
      // the real browser PushSubscription without showing another prompt.
      await getOrCreatePushSubscription();
      await updateNotificationBell();
      return true;
    }catch(e){
      console.warn("I|ONE push startup sync:",e);
      try{ await updateNotificationBell(); }catch(_) {}
      return false;
    }
  }

  async function disablePush(){
    if(!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try{
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if(subscription){
        const endpoint=subscription.endpoint;
        try{ await callPush({action:"unsubscribe",endpoint}); }catch(e){ console.warn("I|ONE push unsubscribe:",e); }
        try{ await subscription.unsubscribe(); }catch(e){ console.warn("I|ONE browser unsubscribe:",e); }
      }
    }finally{
      markDisabled();
      await updateNotificationBell();
    }
  }

  async function updateNotificationBell(){
    const button=document.getElementById("ioneNotificationBtn");
    if(!button) return;
    let on=false;
    try{ on=localStorage.getItem("ionePushEnabled")==="1"; }catch(_) {}
    if("serviceWorker" in navigator && "PushManager" in window && ("Notification" in window ? Notification.permission==="granted" : true)){
      try{
        const registration=await navigator.serviceWorker.ready;
        const subscription=await registration.pushManager.getSubscription();
        on=!!subscription;
        if(!on && userDisabled()) on=false;
      }catch(_) {}
    }
    button.dataset.state=on?"on":"off";
    button.innerHTML=on
      ? '<span class="ione-notification-main">ACCESS TRENDING</span><span id="ioneNotificationState">ACTIVE</span>'
      : '<span class="ione-notification-main">ACCESS DENIED</span><span id="ioneNotificationState">INACTIVE</span>';
    button.title=on?"ACCESS TRENDING ACTIVE — press once to turn off":"ACCESS DENIED INACTIVE — press once to turn on";
    button.setAttribute("aria-label",button.title);
  }

  async function togglePushFromBell(){
    const button=document.getElementById("ioneNotificationBtn");
    if(button) { button.disabled=true; button.setAttribute("aria-busy","true"); }
    try{
      if("Notification" in window && Notification.permission==="granted"){
        const registration=await navigator.serviceWorker.ready;
        const subscription=await registration.pushManager.getSubscription();
        if(subscription){
          await disablePush();
          return;
        }
      }
      await pushSubscribe();
      await updateNotificationBell();
    }catch(e){
      alert(e?.message || "Could not change I|ONE notification settings.");
      await updateNotificationBell();
    }finally{
      if(button) { button.disabled=false; button.removeAttribute("aria-busy"); }
    }
  }

  window.ioneTogglePushNotifications=togglePushFromBell;
  window.ioneUpdateNotificationBell=updateNotificationBell;

  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible" && !userDisabled()) syncExistingPush();
  });
  window.addEventListener("focus",()=>{ if(!userDisabled()) syncExistingPush(); });

  function createButton(){
    if(document.getElementById("ionePushEnableButton")) return;
    if(!("Notification" in window)) return;
    if(Notification.permission === "granted") return;

    const button = document.createElement("button");
    button.id = "ionePushEnableButton";
    button.type = "button";
    button.textContent = "ENABLE I|ONE NOTIFICATIONS";
    button.style.cssText = [
      "position:fixed","top:72px","right:12px","z-index:9999","min-height:40px",
      "padding:10px 13px","border:1px solid rgba(255,255,255,.38)","border-radius:14px",
      "background:linear-gradient(145deg,#08dce8,#075d92)","color:#fff",
      "font:900 10px/1.1 Arial,sans-serif","letter-spacing:1px",
      "box-shadow:0 6px 0 rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.25)","cursor:pointer"
    ].join(";");

    button.addEventListener("click", async function(){
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "CONNECTING…";
      try{
        await pushSubscribe();
        button.remove();
        await updateNotificationBell();
      }catch(e){
        button.disabled = false;
        button.textContent = original;
        alert(e?.message || "Could not enable I|ONE notifications.");
      }
    });

    document.body.appendChild(button);
  }

  window.ioneEnablePushNotifications = pushSubscribe;

  window.ioneSendAuthorityPush = async function(options){
    options = options || {};
    const password = String(options.password || "").trim();
    if(!password) throw new Error("Authority session is missing.");
    try{ await ensurePushSubscription(); }catch(_){ try{ await syncExistingPush(); }catch(__){} }
    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        return await callPush({
          action:"send",
          password,
          title:String(options.title || "I|ONE").slice(0,80),
          body:String(options.body || "").trim().slice(0,240),
          url:String(options.url || "./").slice(0,500),
          tag:String(options.tag || "ione-authority").slice(0,80)
        });
      }catch(e){
        lastError=e;
        if(attempt===0) await sleep(180);
      }
    }
    throw lastError || new Error("Authority notification failed.");
  };

  async function handlePushDestination(){
    try{
      const params=new URLSearchParams(location.search);
      const destination=params.get("ionePushDestination");
      if(!destination) return;
      history.replaceState({},document.title,location.pathname+location.hash);
      await sleep(350);
      if(destination==="subscription"){
        if(typeof ioneSubscriptionGate==="function") ioneSubscriptionGate("publish");
      }else if(destination==="market"){
        document.getElementById("openAfrilink")?.click();
      }else if(destination==="books"){
        if(typeof openHeavensBookstore==="function") await openHeavensBookstore();
      }else if(destination==="home"){
        document.getElementById("openAuthority")?.closest("button")?.blur();
        document.querySelector("#smartPanel")?.classList?.add("show");
      }
    }catch(e){ console.warn("I|ONE push destination:",e); }
  }

  async function start(){
    setTimeout(async()=>{
      // Keep trying after startup races. We never request permission here;
      // Chrome only gets a prompt from the user's explicit button action.
      for(const delay of [0,1200,3000,7000,15000]){
        if(delay) await sleep(delay);
        if(userDisabled()) break;
        if("Notification" in window && Notification.permission==="granted"){
          const ok=await syncExistingPush();
          if(ok) break;
        }else{
          await updateNotificationBell();
        }
      }
      setTimeout(handlePushDestination,500);
    },0);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();