/* I|ONE unified Android and browser Back navigation.
   Each home service launch creates one browser-history layer; Back closes that service first. */
(function(){
  "use strict";
  if(window.__ioneNavigationBackBooted)return;
  window.__ioneNavigationBackBooted=true;
  let sequence=0;\n  let closingFromHistory=false;
  function pushLayer(){
    try{history.pushState({ioneInternalBack:true,ioneLayer:++sequence},"",location.href);}catch(e){console.warn("I|ONE navigation history:",e);}
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    const s=getComputedStyle(el);
    return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>.01&&el.getAttribute("aria-hidden")!=="true";
  }
  function clickFirst(selectors){
    for(const selector of selectors){
      const el=document.querySelector(selector);
      if(el&&visible(el)&&!el.disabled){closingFromHistory=true;el.click();queueMicrotask(()=>{closingFromHistory=false;});return true;}
    }
    return false;
  }
  function closeTopLayer(){
    if(clickFirst(["#ioneDocReaderLive .ione-doc-reader-back","#ioneTransportOverlay #itClose","#ioneSokoniOverlay #isClose","#ioneMamaFood #mfClose","#ioneMiniMarket #mmClose","#ioneExpertOverlay #ioneExpertClose","#ioneRegisterOverlay #ioneRegisterClose"]))return true;
    const healthy=document.getElementById("healthyContainer");
    if(visible(healthy)){
      const exit=[...healthy.querySelectorAll("button")].find(b=>/^(EXIT|BACK|CLOSE)$/i.test(b.textContent.trim()));
      if(exit){exit.click();return true;}
    }
    const coming=document.querySelector(".ione-coming-soon-overlay");
    if(visible(coming)){coming.querySelector("button")?.click();return true;}
    const authority=document.getElementById("authorityPressPanel");
    if(visible(authority)){
      const close=authority.querySelector("[data-authority-close],.authority-close-button,#authorityPressClose");
      if(close){close.click();return true;}
    }
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    return true;
  }
  document.addEventListener("click",event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    if(target.closest("#itClose,#isClose,#mfClose,#mmClose,#ioneExpertClose,#ioneRegisterClose,.ione-doc-reader-back")){\n      if(!closingFromHistory&&history.state?.ioneInternalBack)queueMicrotask(()=>history.back());\n      return;\n    }\n    if(target.closest("[data-register]")){
      try{history.replaceState({ioneInternalBack:true,ioneLayer:++sequence},"",location.href);}catch(_){}
      return;
    }
    if(target.closest(".smart-grid .smart-item,#settingsBtn,#ioneRegisterBtn")){
      pushLayer();
    }
  },true);
  window.addEventListener("popstate",event=>{
    const hasFeature=document.body.classList.contains("ione-non-home")||
      ["ioneSokoniOverlay","ioneTransportOverlay","ioneMamaFood","ioneMiniMarket","ioneExpertOverlay","ioneRegisterOverlay","healthyContainer","ioneDocReaderLive"].some(id=>visible(document.getElementById(id)))||
      !!document.querySelector(".ione-coming-soon-overlay");
    if(event.state?.ioneInternalBack||hasFeature){
      closeTopLayer();
    }
  });
})();