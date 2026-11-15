/* I|ONE shared registration centre — keeps service pages focused on customers. */
(() => {
  "use strict";
  if (window.__ioneRegisterBooted) return;
  window.__ioneRegisterBooted = true;
  const css = `
    #ioneRegisterOverlay{position:fixed;inset:0;z-index:2147482500;display:none;overflow:auto;box-sizing:border-box;padding:calc(16px + env(safe-area-inset-top)) 14px calc(20px + env(safe-area-inset-bottom));background:rgba(2,12,13,.88);backdrop-filter:blur(7px);font-family:Arial,sans-serif;color:#f4fffb}
    #ioneRegisterOverlay *{box-sizing:border-box}
    #ioneRegisterOverlay .ir-shell{width:min(720px,100%);margin:0 auto;padding:18px;border:1px solid #315d4a;border-radius:20px;background:#0b211a;box-shadow:0 18px 55px rgba(0,0,0,.38)}
    #ioneRegisterOverlay .ir-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
    #ioneRegisterOverlay .ir-kicker{font-size:10px;font-weight:900;letter-spacing:2px;color:#9bd9b3}
    #ioneRegisterOverlay h2{margin:7px 0 4px;font-size:clamp(25px,6vw,34px);color:#fff}
    #ioneRegisterOverlay p{margin:0 0 16px;color:#b8d3c2;font-size:13px;line-height:1.55}
    #ioneRegisterOverlay .ir-close{min-height:42px;padding:10px 14px;border:1px solid #52775f;border-radius:11px;background:#17382a;color:#fff;font-weight:800}
    #ioneRegisterOverlay .ir-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #ioneRegisterOverlay .ir-item{display:flex;align-items:center;gap:12px;min-width:0;min-height:76px;padding:13px;border:1px solid #315a43;border-radius:14px;background:#102a1e;color:#f4fff7;text-align:left;cursor:pointer}
    #ioneRegisterOverlay .ir-item:active{transform:scale(.985)}
    #ioneRegisterOverlay .ir-icon{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:12px;background:#1e4731;font-size:22px}
    #ioneRegisterOverlay .ir-copy{display:grid;gap:4px;min-width:0}
    #ioneRegisterOverlay .ir-copy strong{font-size:13px;line-height:1.25}
    #ioneRegisterOverlay .ir-copy small{font-size:10px;line-height:1.35;color:#a8c9b2}
    #ioneRegisterOverlay .ir-status{min-height:18px;margin-top:12px;color:#ffcf9b;font-size:12px;line-height:1.5}
    @media(max-width:440px){#ioneRegisterOverlay .ir-shell{padding:14px}#ioneRegisterOverlay .ir-list{grid-template-columns:1fr}#ioneRegisterOverlay .ir-item{min-height:66px}}
    #ioneTopActions #ioneRegisterBtn{min-height:36px;padding:8px 12px;border:1px solid #70b88a;border-radius:9px;background:#174b35;color:#fff;font:900 10px Arial,sans-serif;letter-spacing:.8px;box-shadow:none}
  `;
  const style=document.createElement("style");style.id="ioneRegisterStyles";style.textContent=css;document.head.appendChild(style);
  const overlay=document.createElement("div");overlay.id="ioneRegisterOverlay";overlay.setAttribute("aria-hidden","true");
  overlay.innerHTML=`<main class="ir-shell" role="dialog" aria-modal="true" aria-labelledby="ioneRegisterTitle">
    <header class="ir-head"><div><div class="ir-kicker">I|ONE • SERVICE PROVIDERS</div><h2 id="ioneRegisterTitle">Registration centre</h2></div><button class="ir-close" type="button" id="ioneRegisterClose">CLOSE</button></header>
    <p>Choose the service you want to provide. Customers can continue using each service without registering as a provider.</p>
    <div class="ir-list">
      <button class="ir-item" type="button" data-register="expert"><span class="ir-icon">EX</span><span class="ir-copy"><strong>I|ONE Expert</strong><small>Apply to become a verified expert</small></span></button>
      <button class="ir-item" type="button" data-register="sokoni-vendor"><span class="ir-icon">🥬</span><span class="ir-copy"><strong>Mama Sokoni</strong><small>Register as a seller</small></span></button>
      <button class="ir-item" type="button" data-register="sokoni-rider"><span class="ir-icon">🏍️</span><span class="ir-copy"><strong>Sokoni Riders</strong><small>Register Boda Boda or Bajaji</small></span></button>
      <button class="ir-item" type="button" data-register="mama-food"><span class="ir-icon">🍲</span><span class="ir-copy"><strong>Mama Chakula</strong><small>Register as a food vendor</small></span></button>
      <button class="ir-item" type="button" data-register="mini-market"><span class="ir-icon">🛒</span><span class="ir-copy"><strong>Mini Market</strong><small>Register your shop</small></span></button>
      <button class="ir-item" type="button" data-register="transport"><span class="ir-icon">🚕</span><span class="ir-copy"><strong>i1 Transport</strong><small>Apply as a verified driver</small></span></button>
    </div><div class="ir-status" id="ioneRegisterStatus" role="status" aria-live="polite"></div>
  </main>`;
  document.body.appendChild(overlay);
  const close=()=>{overlay.style.display="none";overlay.setAttribute("aria-hidden","true");document.body.style.overflow="";};
  const open=()=>{overlay.style.display="block";overlay.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";const s=document.getElementById("ioneRegisterStatus");if(s)s.textContent="";};
  const actions={
    expert:()=>window.IoneExpert?.openRegistration(),
    "sokoni-vendor":()=>window.IoneSokoni?.openRegistration("vendor"),
    "sokoni-rider":()=>window.IoneSokoni?.openRegistration("rider"),
    "mama-food":()=>window.IoneMamaChakula?.openRegistration(),
    "mini-market":()=>window.IoneMiniMarket?.openRegistration(),
    transport:()=>window.IoneTransport?.openRegistration()
  };
  overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
  overlay.querySelectorAll("[data-register]").forEach(button=>button.addEventListener("click",()=>{
    const key=button.dataset.register,action=actions[key];
    if(typeof action!=="function"){const status=document.getElementById("ioneRegisterStatus");if(status)status.textContent="This registration service is still loading. Please try again.";return;}
    close();action();
  }));
  document.getElementById("ioneRegisterClose").addEventListener("click",close);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay.style.display==="block")close();});
  document.getElementById("ioneRegisterBtn")?.addEventListener("click",open);
  window.IoneRegister=Object.freeze({open,close});
})();