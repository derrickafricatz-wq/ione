/* I|ONE unified Android and browser Back navigation.
   Open overlays get history layers; Back closes the topmost layer before leaving the app. */
(function(){
  "use strict";
  if(window.__ioneNavigationBackBooted)return;
  window.__ioneNavigationBackBooted=true;
  let sequence=0,closingFromHistory=false,skipNextPopClose=false,scanQueued=false;
  const known=["#ioneDocReaderLive","#ioneTransportOverlay","#ioneSokoniOverlay","#ioneMamaFood","#ioneMiniMarket","#ioneExpertOverlay","#ioneRegisterOverlay","#healthyContainer",".ione-coming-soon-overlay","#authorityPressPanel"];
  const active=new Set();
  function pushLayer(){
    try{history.pushState({ioneInternalBack:true,ioneLayer:++sequence},"",location.href);}
    catch(e){console.warn("I|ONE navigation history:",e);}
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    const s=getComputedStyle(el);
    return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>.01&&el.getAttribute("aria-hidden")!=="true";
  }
  function overlayForClose(close){
    return close.closest("#ioneDocReaderLive,#ioneTransportOverlay,#ioneSokoniOverlay,#ioneMamaFood,#ioneMiniMarket,#ioneExpertOverlay,#ioneRegisterOverlay,#healthyContainer,.ione-coming-soon-overlay,#authorityPressPanel")||close;
  }
  function closeTopLayer(){
    const candidates=[
      "#ioneDocReaderLive .ione-doc-reader-back","#ioneTransportOverlay #itClose","#ioneSokoniOverlay #isClose",
      "#ioneMamaFood #mfClose","#ioneMiniMarket #mmClose","#ioneExpertOverlay #ioneExpertClose","#ioneRegisterOverlay #ioneRegisterClose"
    ].map(selector=>document.querySelector(selector)).filter(el=>el&&visible(el)&&!el.disabled);
    const healthy=document.getElementById("healthyContainer");
    if(visible(healthy)){
      const exit=[...healthy.querySelectorAll("button")].find(b=>/^(EXIT|BACK|CLOSE)$/i.test(b.textContent.trim()));
      if(exit)candidates.push(exit);
    }
    const coming=document.querySelector(".ione-coming-soon-overlay");
    if(visible(coming)){const b=coming.querySelector("button");if(b)candidates.push(b);}
    const authority=document.getElementById("authorityPressPanel");
    if(visible(authority)){
      const b=authority.querySelector("[data-authority-close],.authority-close-button,#authorityPressClose");
      if(b)candidates.push(b);
    }
    candidates.sort((a,b)=>{
      const za=parseInt(getComputedStyle(overlayForClose(a)).zIndex,10)||0;
      const zb=parseInt(getComputedStyle(overlayForClose(b)).zIndex,10)||0;
      return zb-za;
    });
    if(candidates.length){
      closingFromHistory=true;candidates[0].click();
      queueMicrotask(()=>{closingFromHistory=false;});
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    return true;
  }
  function scanOverlays(){
    scanQueued=false;
    const now=new Set();
    known.forEach(selector=>document.querySelectorAll(selector).forEach(el=>{if(visible(el))now.add(el);}));
    now.forEach(el=>{if(!active.has(el)){active.add(el);pushLayer();}});
    [...active].forEach(el=>{if(!now.has(el))active.delete(el);});
  }
  function queueScan(){
    if(scanQueued)return;scanQueued=true;
    requestAnimationFrame(scanOverlays);
  }
  const observer=new MutationObserver(queueScan);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["style","class","aria-hidden"]});
  queueScan();

  document.addEventListener("click",event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    if(target.closest("#itClose,#isClose,#mfClose,#mmClose,#ioneExpertClose,#ioneRegisterClose,.ione-doc-reader-back")){
      if(!closingFromHistory&&history.state?.ioneInternalBack){
        skipNextPopClose=true;
        queueMicrotask(()=>history.back());
      }
    }
  },true);
  window.addEventListener("popstate",()=>{
    if(skipNextPopClose){skipNextPopClose=false;return;}
    const hasFeature=known.some(selector=>[...document.querySelectorAll(selector)].some(visible));
    if(hasFeature)closeTopLayer();
  });
})();