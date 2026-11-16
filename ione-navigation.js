/* I|ONE Back navigation • Android system gesture, browser Back and feature overlays.
   A history entry is registered synchronously on the feature-tile click, before the
   feature's own handler runs. A DOM observer covers nested/dynamically-created panels. */
(function(){
  "use strict";
  if(window.__ioneNavigationBackBooted)return;
  window.__ioneNavigationBackBooted=true;

  let sequence=0;
  let pendingLaunches=0;
  let closingFromHistory=false;
  let scanQueued=false;

  const overlays=[
    "#afrilinkOverlay","#aflServiceOverlay","#aflOwnerOverlay","#aflEditorOverlay",
    "#aflIncomingCallOverlay","#aflDeleteOverlay",
    "#transcriptPanel","#healthyContainer","#heavensBookstore","#heavensReader","#heavensPaymentDialog",
    "#ioneManualRecoveryCodeOverlay","#ioneBookReceiptOverlay","#ministryAccessOverlay","#guideOverlay",
    "#authorityPasswordOverlay","#authorityPressPanel","#authorityChapChapPanel",
    "#ioneOpportunitiesOverlay","#ioneOppDetail","#ioneTransportOverlay","#ioneSokoniOverlay","#ioneMamaFood","#ioneMiniMarket",
    "#ioneExpertOverlay","#ioneRegisterOverlay","#ioneDocReaderLive",
    "#ioneDocAccessOverlay","#ioneLiveClassOverlay","#ioneLiveClassManager",".ione-coming-soon-overlay",".ione-feature-overlay"
  ];
  const active=new Set();

  function pushLayer(){
    try{
      const old=history.state&&typeof history.state==="object"?history.state:{};
      history.pushState({...old,ioneInternalBack:true,ioneLayer:++sequence},"",location.href);
      return true;
    }catch(error){
      console.warn("I|ONE Back navigation could not add a history layer:",error);
      return false;
    }
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    // A child's own computed display can be "block" while an ancestor is
    // display:none. Walk the full ancestor chain so hidden nested panels and
    // their close buttons are never treated as active layers.
    for(let node=el;node&&node.nodeType===1;node=node.parentElement){
      if(node.hidden)return false;
      const style=getComputedStyle(node);
      if(style.display==="none"||style.visibility==="hidden"||style.visibility==="collapse")return false;
      const opacity=Number.parseFloat(style.opacity);
      if(Number.isFinite(opacity)&&opacity<=.01)return false;
    }
    return typeof el.getClientRects!=="function"||el.getClientRects().length>0;
  }
  function allVisible(){
    const found=[];
    overlays.forEach(selector=>document.querySelectorAll(selector).forEach(el=>{if(visible(el)&&!found.includes(el))found.push(el);}));
    return found;
  }
  function overlayForClose(button){
    return button.closest("#afrilinkOverlay,#aflServiceOverlay,#aflOwnerOverlay,#aflEditorOverlay,#aflIncomingCallOverlay,#aflDeleteOverlay,#transcriptPanel,#healthyContainer,#heavensBookstore,#heavensReader,#heavensPaymentDialog,#ioneManualRecoveryCodeOverlay,#ioneBookReceiptOverlay,#ministryAccessOverlay,#guideOverlay,#authorityPasswordOverlay,#authorityPressPanel,#authorityChapChapPanel,#ioneOpportunitiesOverlay,#ioneOppDetail,#ioneTransportOverlay,#ioneSokoniOverlay,#ioneMamaFood,#ioneMiniMarket,#ioneExpertOverlay,#ioneRegisterOverlay,#ioneDocReaderLive,#ioneDocAccessOverlay,#ioneLiveClassOverlay,#ioneLiveClassManager,.ione-coming-soon-overlay,.ione-feature-overlay")||button;
  }
  function closeTopLayer(){
    const selectors=[
      "#guideOverlay #closeGuideHome","#guideOverlay #closeGuideMap","#guideOverlay #guideDetailBack",
      "#ministryAccessOverlay #ministryAccessCancel",
      "#heavensBookstore #hbClose","#heavensReader .hr-back",
      "#heavensPaymentDialog .heavens-payment-close",
      "#ioneManualRecoveryCodeOverlay button:last-of-type","#ioneBookReceiptOverlay button:first-of-type",
      "#ioneDocReaderLive .ione-doc-reader-back","#ioneDocAccessClose","#ioneLiveClassOverlay #ilcClose","#ioneLiveClassManager #ilcAdminClose",
      "#ioneOpportunitiesOverlay [data-action=close]","#ioneOppDetail [data-action=detail-close]","#ioneTransportOverlay #itClose","#ioneSokoniOverlay #isClose",
      "#ioneMamaFood #mfClose","#ioneMiniMarket #mmClose",
      "#ioneExpertOverlay #ioneExpertClose","#ioneRegisterOverlay #ioneRegisterClose",
      "#transcriptPanel #closeTranscript","#afrilinkOverlay #aflClose",
      "#aflServiceOverlay #aflServiceClose","#aflOwnerOverlay #aflOwnerClose",
      "#aflEditorOverlay #aflEditorCancel","#aflDeleteOverlay #aflDeleteCancel",
      "#aflIncomingCallOverlay #aflCallDecline","#aflIncomingCallOverlay #aflCallEndActive",
      "#authorityPasswordOverlay #authorityPasswordCancel","#authorityPressPanel #authorityPressClose",
      "#authorityChapChapPanel #authorityChapChapClose",
      ".ione-feature-overlay .ione-feature-close"
    ];
    const candidates=[];
    selectors.forEach(selector=>document.querySelectorAll(selector).forEach(el=>{
      if(visible(el)&&!el.disabled&&!candidates.includes(el))candidates.push(el);
    }));
    const healthy=document.getElementById("healthyContainer");
    if(visible(healthy)){
      const exit=[...healthy.querySelectorAll("button")].find(button=>/^(EXIT|BACK|CLOSE)$/i.test(button.textContent.trim()));
      if(exit)candidates.push(exit);
    }
    const coming=document.querySelector(".ione-coming-soon-overlay");
    if(visible(coming)){const button=coming.querySelector("button");if(button)candidates.push(button);}
    candidates.sort((a,b)=>{
      const za=parseInt(getComputedStyle(overlayForClose(a)).zIndex,10)||0;
      const zb=parseInt(getComputedStyle(overlayForClose(b)).zIndex,10)||0;
      return zb-za;
    });
    if(candidates.length){
      closingFromHistory=true;
      candidates[0].click();
      queueMicrotask(()=>{closingFromHistory=false;});
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    return false;
  }
  function scanOverlays(){
    scanQueued=false;
    const now=new Set(allVisible());
    now.forEach(el=>{
      if(active.has(el))return;
      active.add(el);
      if(pendingLaunches>0)pendingLaunches--;
      else pushLayer();
    });
    [...active].forEach(el=>{if(!now.has(el))active.delete(el);});
  }
  function queueScan(){
    if(scanQueued)return;
    scanQueued=true;
    requestAnimationFrame(scanOverlays);
  }
  const observer=new MutationObserver(queueScan);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["style","class","aria-hidden","hidden"]});
  queueScan();

  window.addEventListener("click",event=>{
    const target=event.target;
    if(!(target instanceof Element))return;

    const close=target.closest([
      "#hbClose",".hr-back",".heavens-payment-close","#ioneManualRecoveryCodeOverlay button:last-of-type","#ioneBookReceiptOverlay button:first-of-type",
      "#closeGuideHome","#closeGuideMap","#ministryAccessCancel",
      "#itClose","#isClose","#ioneOpportunitiesOverlay [data-action=close]","#ioneOppDetail [data-action=detail-close]","#mfClose","#mmClose","#ioneExpertClose","#ioneRegisterClose",
      "#authorityPressClose","#authorityPasswordCancel","#authorityChapChapClose",
      "#closeTranscript","#aflClose","#aflServiceClose","#aflOwnerClose","#aflEditorCancel",
      "#aflDeleteCancel","#aflCallDecline","#aflCallEndActive","#ioneDocAccessClose","#ilcClose","#ilcAdminClose",
      ".ione-feature-overlay .ione-feature-close",".ione-doc-reader-back",
      "#healthyContainer button",".ione-coming-soon-overlay button"
    ].join(","));
    if(close){
      if(!closingFromHistory&&history.state?.ioneInternalBack){
        // The feature has already closed itself. Consume only its own history
        // layer; the resulting popstate sees no visible overlay and is harmless.
        queueMicrotask(()=>history.back());
      }
      return;
    }

    const launch=target.closest(
      "#smartPanel .smart-item,#settingsBtn,.ione-lib-content-button,#ioneDocAccessLaunch,[data-ione-open-feature]"
    );
    if(launch){
      pendingLaunches++;
      pushLayer();
    }
  },true);

  // Some Android WebViews translate the system Back key into Escape before
  // dispatching popstate. Feature modules also have their own Escape handlers.
  // Capture it first and route it through the same history layer so the first
  // Back action closes the feature instead of leaving a stale history entry.
  window.addEventListener("keydown",event=>{
    if(event.defaultPrevented||event.repeat)return;
    const escape=event.key==="Escape";
    const backspace=event.key==="Backspace"&&!/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName||"")&&!event.target?.isContentEditable;
    if(!escape&&!backspace)return;
    if(!allVisible().length)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!history.state?.ioneInternalBack&&!pushLayer()){
      closeTopLayer();
      return;
    }
    history.back();
  },true);

  // Browser Back and Android's installed-PWA Back button normally arrive here
  // as popstate, not as a keyboard event. Listen in capture phase and determine
  // visibility from rendered CSS (aria-hidden can be stale in legacy panels).
  window.addEventListener("popstate",()=>{
    const open=allVisible();
    if(open.length||pendingLaunches>0){
      pendingLaunches=0;
      closeTopLayer();
      // If a panel has no close handler yet, restore a guard entry rather than
      // allowing Android/browser Back to navigate away from the installed app.
      setTimeout(()=>{
        if(allVisible().length)pushLayer();
      },420);
    }
  },true);
})();