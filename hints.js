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
    const data=await callPush({action:"config"});
    vapidPublicKey=data.publicKey;
    return data;
  }

  async function pushSubscribe(){
    if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){
      throw new Error("This device/browser does not support I|ONE push notifications.");
    }

    const permission = await Notification.requestPermission();
    if(permission !== "granted"){
      throw new Error(permission === "denied"
        ? "Notifications are blocked in this browser. Allow them in browser site settings."
        : "Notification permission was not granted.");
    }

    await getPushConfig();

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if(!subscription){
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:uint8FromBase64Url(vapidPublicKey)
      });
    }

    const raw = subscription.toJSON();
    await callPush({
      action:"subscribe",
      subscription:{endpoint:raw.endpoint,keys:raw.keys || {}},
      user_agent:navigator.userAgent
    });

    localStorage.setItem("ionePushEnabled","1");
    return true;
  }

  async function syncExistingPush(){
    try{
      if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
      if(Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if(!subscription) return;
      const raw = subscription.toJSON();
      await callPush({
        action:"subscribe",
        subscription:{endpoint:raw.endpoint,keys:raw.keys || {}},
        user_agent:navigator.userAgent
      });
      localStorage.setItem("ionePushEnabled","1");
    }catch(e){
      console.warn("I|ONE push sync:",e);
    }
  }

  function createButton(){
    if(document.getElementById("ionePushEnableButton")) return;
    if(!("Notification" in window)) return;
    if(Notification.permission === "granted") return;

    const button = document.createElement("button");
    button.id = "ionePushEnableButton";
    button.type = "button";
    button.textContent = "🔔 ENABLE I|ONE NOTIFICATIONS";
    button.style.cssText = [
      "position:fixed",
      "top:72px",
      "right:12px",
      "z-index:9999",
      "min-height:40px",
      "padding:10px 13px",
      "border:1px solid rgba(255,255,255,.38)",
      "border-radius:14px",
      "background:linear-gradient(145deg,#08dce8,#075d92)",
      "color:#fff",
      "font:900 10px/1.1 Arial,sans-serif",
      "letter-spacing:1px",
      "box-shadow:0 6px 0 rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.25)",
      "cursor:pointer"
    ].join(";");

    button.addEventListener("click", async function(){
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "CONNECTING…";
      try{
        await pushSubscribe();
        button.remove();
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
    return callPush({
      action:"send",
      password,
      title:String(options.title || "I|ONE").slice(0,80),
      body:String(options.body || "").trim().slice(0,240),
      url:String(options.url || "./").slice(0,500),
      tag:String(options.tag || "ione-authority").slice(0,80)
    });
  };

  async function handlePushDestination(){
    try{
      const params=new URLSearchParams(location.search);
      const destination=params.get("ionePushDestination");
      if(!destination) return;
      history.replaceState({},document.title,location.pathname+location.hash);
      await new Promise(resolve=>setTimeout(resolve,350));
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
    if(!sb()) return;
    syncExistingPush();
    setTimeout(createButton,900);
    setTimeout(handlePushDestination,500);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
