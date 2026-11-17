/* I|ONE Hospitality Spotlight — Authority-published homepage showcase. */
(function(){
  "use strict";
  if(window.__ioneHospitalityShowcaseBooted)return;
  window.__ioneHospitalityShowcaseBooted=true;
  const FN="ione-app-banners";
  let slides=[],editorItems=[];
  const $=id=>document.getElementById(id);
  function goToHospitality(){
    if(typeof window.ioneOpenHospitalityMarket==="function"){window.ioneOpenHospitalityMarket();return;}
    $("openAfrilink")?.click();
    setTimeout(()=>{const c=$("aflBillboardCategory");if(c){c.value="hospitality";c.dispatchEvent(new Event("change",{bubbles:true}));}},350);
  }
  function makeSlide(item,clone){
    const card=document.createElement("article");card.className="ione-hospitality-card";
    if(clone)card.setAttribute("aria-hidden","true");
    const img=document.createElement("img");img.src=String(item.url||"");img.alt=String(item.brand_name||"Hospitality destination");img.loading=clone?"lazy":"eager";img.decoding="async";
    const copy=document.createElement("div");copy.className="ione-hospitality-copy";
    const brand=document.createElement("div");brand.className="ione-hospitality-brand";brand.textContent=String(item.brand_name||"").slice(0,70);
    const headline=document.createElement("h3");headline.className="ione-hospitality-headline";headline.textContent=String(item.headline||"").slice(0,90);
    const message=document.createElement("div");message.className="ione-hospitality-message";message.textContent=String(item.message||"").slice(0,160);
    const button=document.createElement("button");button.type="button";button.className="ione-hospitality-getin";button.textContent="GETIN";button.addEventListener("click",goToHospitality);
    copy.append(brand,headline,message,button);card.append(img,copy);return card;
  }
  function render(){
    const section=$("ioneHospitalityShowcase"),track=$("ioneHospitalityTrack");if(!section||!track)return;
    track.replaceChildren();if(!slides.length){section.hidden=true;return;}
    section.hidden=false;slides.forEach(x=>track.appendChild(makeSlide(x,false)));slides.forEach(x=>track.appendChild(makeSlide(x,true)));
    track.style.setProperty("--ione-hospitality-duration",Math.max(24,(slides.length*410)/32)+"s");
  }
  async function loadSlides(){
    try{
      const r=await heavensSupabase.functions.invoke(FN,{body:{action:"get"}});
      if(r.error||!r.data?.success)throw r.error||new Error(r.data?.error||"Could not load hospitality showcase.");
      slides=Array.isArray(r.data.hospitality_slides)?r.data.hospitality_slides:[];render();return slides;
    }catch(e){console.warn("I|ONE Hospitality Spotlight:",e);return slides;}
  }
  function status(message,error){const el=$("ioneHospitalityAdminStatus");if(el){el.textContent=message;el.style.color=error?"#ffaaaa":"#b9e9ce";}}
  function renderEditor(){
    const list=$("ioneHospitalityAdminList");if(!list)return;list.replaceChildren();
    if(!editorItems.length){const p=document.createElement("p");p.className="authority-section-note";p.textContent="No hospitality images yet. Upload the first destination showcase.";list.appendChild(p);return;}
    editorItems.forEach((item,index)=>{
      const card=document.createElement("div");card.style.cssText="display:grid;grid-template-columns:94px minmax(0,1fr);gap:10px;align-items:center;padding:10px;border:1px solid rgba(218,190,128,.25);border-radius:12px;background:rgba(0,0,0,.22)";
      const img=document.createElement("img");img.src=item.preview||item.url||"";img.alt="";img.style.cssText="width:94px;height:68px;object-fit:cover;border-radius:8px;background:#102126";
      const copy=document.createElement("div");copy.style.cssText="display:grid;gap:6px;min-width:0";
      const label=document.createElement("strong");label.textContent=(index+1)+". "+String(item.brand_name||"Hospitality brand");label.style.cssText="font-size:12px;overflow-wrap:anywhere";
      const headline=document.createElement("small");headline.textContent=String(item.headline||"");headline.style.cssText="color:#c6d5cf;font-size:11px;overflow-wrap:anywhere";
      const actions=document.createElement("div");actions.style.cssText="display:flex;gap:6px;flex-wrap:wrap";
      [["↑","up",index===0],["↓","down",index===editorItems.length-1],["REMOVE","remove",false]].forEach(([txt,act,disabled])=>{const b=document.createElement("button");b.type="button";b.textContent=txt;b.disabled=disabled;b.dataset.index=String(index);b.dataset.action=act;b.style.cssText="border:1px solid #806b43;border-radius:8px;padding:7px 10px;background:#292317;color:#fff1cf;font-weight:800;font-size:11px";actions.appendChild(b);});
      copy.append(label,headline,actions);card.append(img,copy);list.appendChild(card);
    });
  }
  function installEditor(){
    const banners=$("authoritySaveBanners");if(!banners||$("ioneHospitalityShowcaseAdmin"))return;
    const host=banners.closest(".authority-panel-section");if(!host)return;
    const anchor=$("ioneFeatureShowcaseAdmin")||host;
    const box=document.createElement("section");box.id="ioneHospitalityShowcaseAdmin";box.className="authority-panel-section";
    box.innerHTML='<div class="authority-section-kicker">I|ONE MARKET DISCOVERY</div><h3>HOSPITALITY SPOTLIGHT</h3><p class="authority-section-note">Publish curated hotel, lodge, restaurant, resort and venue showcases on the homepage. Each image has its own brand name and promotional message. GETIN opens the Hospitality category in I|ONE Market.</p><label style="display:grid;gap:6px;margin:12px 0;font-size:12px;font-weight:800">HOSPITALITY IMAGE<input id="ioneHospitalityFile" type="file" accept="image/jpeg,image/png,image/webp" style="width:100%;padding:10px;border:1px solid #806b43;border-radius:10px;background:#17150f;color:#fff"></label><label style="display:grid;gap:6px;margin:10px 0;font-size:12px;font-weight:800">BRAND NAME<input id="ioneHospitalityBrand" maxlength="70" placeholder="Example: PALACE HOTEL" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #806b43;border-radius:10px;background:#17150f;color:#fff"></label><label style="display:grid;gap:6px;margin:10px 0;font-size:12px;font-weight:800">UNIQUE HEADLINE<input id="ioneHospitalityHeadline" maxlength="90" placeholder="Example: EXPERIENCE COMFORT. DISCOVER EXCELLENCE." style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #806b43;border-radius:10px;background:#17150f;color:#fff"></label><label style="display:grid;gap:6px;margin:10px 0;font-size:12px;font-weight:800">SHORT PROMOTIONAL MESSAGE<textarea id="ioneHospitalityMessage" maxlength="160" rows="2" placeholder="A short description that makes this destination special." style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #806b43;border-radius:10px;background:#17150f;color:#fff"></textarea></label><button type="button" id="ioneHospitalityAdd" class="authority-save-button">ADD HOSPITALITY IMAGE</button><div id="ioneHospitalityAdminList" style="display:grid;gap:9px;margin-top:12px"></div><div id="ioneHospitalityAdminStatus" class="authority-save-status">Loading hospitality showcase…</div><button type="button" id="ioneHospitalitySave" class="authority-save-button">PUBLISH HOSPITALITY SHOWCASE</button>';
    anchor.parentNode.insertBefore(box,anchor.nextSibling);
    $("ioneHospitalityAdd").addEventListener("click",async()=>{
      const file=$("ioneHospitalityFile")?.files?.[0],brand_name=String($("ioneHospitalityBrand")?.value||"").trim(),headline=String($("ioneHospitalityHeadline")?.value||"").trim(),message=String($("ioneHospitalityMessage")?.value||"").trim();
      if(!file){status("Choose a hospitality image first.",true);return;}
      if(!/^image\/(jpeg|png|webp)$/.test(file.type)){status("Use a JPG, PNG or WebP image.",true);return;}
      if(editorItems.length>=10){status("You can publish up to 10 hospitality images.",true);return;}
      if(!brand_name||brand_name.length>70||!headline||headline.length>90||!message||message.length>160){status("Complete the brand name, unique headline and short promotional message.",true);return;}
      const btn=$("ioneHospitalityAdd");btn.disabled=true;status("Preparing hospitality image…");
      try{const encoded=await compressImage(file);editorItems.push({brand_name,headline,message,data_base64:encoded,content_type:"image/jpeg",preview:"data:image/jpeg;base64,"+encoded});$("ioneHospitalityFile").value="";$("ioneHospitalityBrand").value="";$("ioneHospitalityHeadline").value="";$("ioneHospitalityMessage").value="";renderEditor();status("Image added. Publish the showcase to make it visible on the homepage.");}
      catch(e){status(e.message||"Could not prepare image.",true);}finally{btn.disabled=false;}
    });
    $("ioneHospitalityAdminList").addEventListener("click",event=>{
      const btn=event.target.closest("button[data-action]");if(!btn)return;const i=Number(btn.dataset.index),act=btn.dataset.action;if(!Number.isInteger(i)||!editorItems[i])return;
      if(act==="remove")editorItems.splice(i,1);if(act==="up"&&i>0)[editorItems[i-1],editorItems[i]]=[editorItems[i],editorItems[i-1]];if(act==="down"&&i<editorItems.length-1)[editorItems[i+1],editorItems[i]]=[editorItems[i],editorItems[i+1]];renderEditor();
    });
    $("ioneHospitalitySave").addEventListener("click",saveEditor);refreshEditor();
  }
  async function refreshEditor(){const saved=await loadSlides();editorItems=saved.map(x=>({id:x.id,path:x.path,brand_name:x.brand_name,headline:x.headline,message:x.message,url:x.url}));renderEditor();status("Ready • "+editorItems.length+" published image(s)");}
  async function saveEditor(){
    const btn=$("ioneHospitalitySave");if(!btn)return;btn.disabled=true;status("Uploading and publishing hospitality showcase…");
    try{
      const payload=editorItems.map(x=>x.data_base64?{brand_name:x.brand_name,headline:x.headline,message:x.message,data_base64:x.data_base64,content_type:x.content_type}:{id:x.id,path:x.path,brand_name:x.brand_name,headline:x.headline,message:x.message});
      const r=await heavensSupabase.functions.invoke(FN,{body:{action:"hospitality_slides_save",slides:payload}});
      if(r.error||!r.data?.success)throw r.error||new Error(r.data?.error||"Could not publish hospitality showcase.");
      slides=Array.isArray(r.data.hospitality_slides)?r.data.hospitality_slides:[];editorItems=slides.map(x=>({id:x.id,path:x.path,brand_name:x.brand_name,headline:x.headline,message:x.message,url:x.url}));render();renderEditor();status("PUBLISHED • "+slides.length+" hospitality image(s) now appear on the homepage.");
    }catch(e){status(e.message||"Could not publish hospitality showcase.",true);}finally{btn.disabled=false;}
  }
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{try{const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);if(!blob){reject(new Error("Image conversion failed."));return;}if(blob.size>1800000){reject(new Error("Image is too large after compression. Choose a smaller image."));return;}const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(new Error("Could not read image."));reader.readAsDataURL(blob);},"image/jpeg",.82);}catch(e){URL.revokeObjectURL(url);reject(e);}};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Could not open that image."));};img.src=url;
    });
  }
  function bindAuthority(){
    const panel=$("authorityPressPanel");if(!panel)return;
    const observer=new MutationObserver(()=>{if(panel.getAttribute("aria-hidden")==="false"||panel.style.display!=="none")installEditor();});
    observer.observe(panel,{attributes:true,attributeFilter:["aria-hidden","style","class"]});
    if(panel.getAttribute("aria-hidden")==="false")installEditor();
    $("authorityPasswordUnlock")?.addEventListener("click",()=>setTimeout(()=>{if(panel.getAttribute("aria-hidden")==="false")installEditor();},450));
  }
  function boot(){loadSlides();bindAuthority();if($("authorityPressPanel")?.getAttribute("aria-hidden")==="false")installEditor();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
