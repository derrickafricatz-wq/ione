/* I|ONE homepage feature showcase + Authority-managed slides. */
(function(){
  "use strict";
  if(window.__ioneFeatureShowcaseBooted)return;
  window.__ioneFeatureShowcaseBooted=true;
  const FN="ione-app-banners";
  let slides=[];
  let editorItems=[];
  const $=id=>document.getElementById(id);

  function makeSlide(item,clone){
    const card=document.createElement("article");
    card.className="ione-feature-slide";
    if(clone)card.setAttribute("aria-hidden","true");
    const img=document.createElement("img");
    img.src=String(item.url||"");
    img.alt="";
    img.loading=clone?"lazy":"eager";
    img.decoding="async";
    const caption=document.createElement("span");
    caption.className="ione-feature-slide-caption";
    caption.textContent=String(item.caption||"").slice(0,48);
    card.append(img,caption);
    return card;
  }
  function render(){
    const section=$("ioneFeatureShowcase"),track=$("ioneFeatureShowcaseTrack");
    if(!section||!track)return;
    track.replaceChildren();
    if(!slides.length){section.hidden=true;return;}
    section.hidden=false;
    slides.forEach(item=>track.appendChild(makeSlide(item,false)));
    slides.forEach(item=>track.appendChild(makeSlide(item,true)));
    track.style.setProperty("--ione-showcase-duration",Math.max(18,(slides.length*332)/34)+"s");
  }
  async function loadSlides(){
    try{
      const r=await heavensSupabase.functions.invoke(FN,{body:{action:"get"}});
      if(r.error||!r.data?.success)throw r.error||new Error(r.data?.error||"Could not load feature showcase.");
      slides=Array.isArray(r.data.feature_slides)?r.data.feature_slides:[];
      render();
      return slides;
    }catch(e){console.warn("I|ONE feature showcase:",e);return slides;}
  }
  function status(message,error){
    const el=$("ioneFeatureShowcaseAdminStatus");
    if(el){el.textContent=message;el.style.color=error?"#ffaaaa":"#b9e9ce";}
  }
  function renderEditor(){
    const list=$("ioneFeatureShowcaseAdminList");
    if(!list)return;
    list.replaceChildren();
    if(!editorItems.length){
      const empty=document.createElement("p");empty.className="authority-section-note";empty.textContent="No feature images added yet. Upload your first image below.";list.appendChild(empty);return;
    }
    editorItems.forEach((item,index)=>{
      const card=document.createElement("div");
      card.style.cssText="display:grid;grid-template-columns:94px minmax(0,1fr);gap:10px;align-items:center;padding:10px;border:1px solid rgba(0,255,255,.2);border-radius:12px;background:rgba(0,0,0,.22)";
      const img=document.createElement("img");img.src=item.preview||item.url||"";img.alt="";img.style.cssText="width:94px;height:68px;object-fit:cover;border-radius:8px;background:#102126";
      const copy=document.createElement("div");copy.style.cssText="display:grid;gap:7px;min-width:0";
      const label=document.createElement("strong");label.textContent=(index+1)+". "+String(item.caption||"Feature image");label.style.cssText="font-size:12px;overflow-wrap:anywhere";
      const actions=document.createElement("div");actions.style.cssText="display:flex;gap:6px;flex-wrap:wrap";
      [["↑","up",index===0],["↓","down",index===editorItems.length-1],["REMOVE","remove",false]].forEach(([txt,act,disabled])=>{
        const b=document.createElement("button");b.type="button";b.textContent=txt;b.disabled=disabled;b.dataset.index=String(index);b.dataset.action=act;
        b.style.cssText="border:1px solid #426d5c;border-radius:8px;padding:7px 10px;background:#102b22;color:#eafff3;font-weight:800;font-size:11px";
        actions.appendChild(b);
      });
      copy.append(label,actions);card.append(img,copy);list.appendChild(card);
    });
  }
  function installEditor(){
    const banners=$("authoritySaveBanners");
    if(!banners||$("ioneFeatureShowcaseAdmin"))return;
    const host=banners.closest(".authority-panel-section");
    if(!host)return;
    const box=document.createElement("section");
    box.id="ioneFeatureShowcaseAdmin";box.className="authority-panel-section";
    box.innerHTML='<div class="authority-section-kicker">I|ONE HOME EXPERIENCE</div><h3>HOMEPAGE FEATURE SHOWCASE</h3><p class="authority-section-note">Upload feature photos that move continuously across the homepage. Add one short caption per image. Use the arrows to choose the order users see.</p><label style="display:grid;gap:6px;margin:12px 0;font-size:12px;font-weight:800">FEATURE IMAGE<input id="ioneFeatureShowcaseFile" type="file" accept="image/jpeg,image/png,image/webp" style="width:100%;padding:10px;border:1px solid #31594c;border-radius:10px;background:#071512;color:#fff"></label><label style="display:grid;gap:6px;margin:10px 0;font-size:12px;font-weight:800">SHORT CAPTION<input id="ioneFeatureShowcaseCaption" maxlength="48" placeholder="Example: REQUEST TRANSPORT" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #31594c;border-radius:10px;background:#071512;color:#fff"></label><button type="button" id="ioneFeatureShowcaseAdd" class="authority-save-button">ADD FEATURE IMAGE</button><div id="ioneFeatureShowcaseAdminList" style="display:grid;gap:9px;margin-top:12px"></div><div id="ioneFeatureShowcaseAdminStatus" class="authority-save-status">Loading saved feature images…</div><button type="button" id="ioneFeatureShowcaseSave" class="authority-save-button">SAVE HOMEPAGE SHOWCASE</button>';
    host.parentNode.insertBefore(box,host.nextSibling);
    $("ioneFeatureShowcaseAdd").addEventListener("click",async()=>{
      const file=$("ioneFeatureShowcaseFile")?.files?.[0];
      const caption=String($("ioneFeatureShowcaseCaption")?.value||"").trim();
      if(!file){status("Choose an image first.",true);return;}
      if(!/^image\/(jpeg|png|webp)$/.test(file.type)){status("Use a JPG, PNG or WebP image.",true);return;}
      if(editorItems.length>=10){status("You can display up to 10 feature images.",true);return;}
      if(!caption||caption.length>48){status("Add a short caption (1–48 characters).",true);return;}
      const btn=$("ioneFeatureShowcaseAdd");btn.disabled=true;status("Preparing image…");
      try{
        const data=await compressImage(file);
        editorItems.push({caption,data_base64:data,content_type:"image/jpeg",preview:"data:image/jpeg;base64,"+data});
        $("ioneFeatureShowcaseFile").value="";$("ioneFeatureShowcaseCaption").value="";
        renderEditor();status("Image added. Save the showcase to publish it.");
      }catch(e){status(e.message||"Could not prepare image.",true);}
      finally{btn.disabled=false;}
    });
    $("ioneFeatureShowcaseAdminList").addEventListener("click",event=>{
      const btn=event.target.closest("button[data-action]");if(!btn)return;
      const i=Number(btn.dataset.index),act=btn.dataset.action;
      if(!Number.isInteger(i)||!editorItems[i])return;
      if(act==="remove")editorItems.splice(i,1);
      if(act==="up"&&i>0)[editorItems[i-1],editorItems[i]]=[editorItems[i],editorItems[i-1]];
      if(act==="down"&&i<editorItems.length-1)[editorItems[i+1],editorItems[i]]=[editorItems[i],editorItems[i+1]];
      renderEditor();
    });
    $("ioneFeatureShowcaseSave").addEventListener("click",saveEditor);
    refreshEditor();
  }
  async function refreshEditor(){
    const saved=await loadSlides();
    editorItems=saved.map(x=>({id:x.id,path:x.path,caption:x.caption,url:x.url}));
    renderEditor();status("Ready • "+editorItems.length+" image(s)");
  }
  async function saveEditor(){
    const btn=$("ioneFeatureShowcaseSave");if(!btn)return;
    btn.disabled=true;status("Uploading and publishing…");
    try{
      const payload=editorItems.map(x=>x.data_base64?{caption:x.caption,data_base64:x.data_base64,content_type:x.content_type}:{id:x.id,path:x.path,caption:x.caption});
      const r=await heavensSupabase.functions.invoke(FN,{body:{action:"feature_slides_save",slides:payload}});
      if(r.error||!r.data?.success)throw r.error||new Error(r.data?.error||"Could not save the showcase.");
      slides=Array.isArray(r.data.feature_slides)?r.data.feature_slides:[];
      editorItems=slides.map(x=>({id:x.id,path:x.path,caption:x.caption,url:x.url}));
      render();renderEditor();status("PUBLISHED • "+slides.length+" image(s) now appear on the homepage.");
    }catch(e){status(e.message||"Could not publish showcase.",true);}
    finally{btn.disabled=false;}
  }
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{
        try{
          const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
          const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
          const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
          canvas.toBlob(blob=>{
            URL.revokeObjectURL(url);
            if(!blob){reject(new Error("Image conversion failed."));return;}
            if(blob.size>1800000){reject(new Error("Image is too large after compression. Choose a smaller image."));return;}
            const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(new Error("Could not read image."));reader.readAsDataURL(blob);
          },"image/jpeg",.82);
        }catch(e){URL.revokeObjectURL(url);reject(e);}
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Could not open that image."));};
      img.src=url;
    });
  }
  function bindAuthority(){
    const panel=$("authorityPressPanel");
    if(!panel)return;
    const observer=new MutationObserver(()=>{
      if(panel.getAttribute("aria-hidden")==="false"||panel.style.display!=="none")installEditor();
    });
    observer.observe(panel,{attributes:true,attributeFilter:["aria-hidden","style","class"]});
    if(panel.getAttribute("aria-hidden")==="false")installEditor();
    $("authorityPasswordUnlock")?.addEventListener("click",()=>setTimeout(()=>{if(panel.getAttribute("aria-hidden")==="false")installEditor();},400));
  }
  function boot(){
    loadSlides();
    bindAuthority();
    if($("authorityPressPanel")?.getAttribute("aria-hidden")==="false")installEditor();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();