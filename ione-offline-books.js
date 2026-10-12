/* I|ONE Offline Books — persistent PDF copies kept outside the rotating app cache. */
(function () {
  "use strict";

  const DB_NAME = "ione-offline-books";
  const DB_VERSION = 2;
  const STORE = "books";
  const DOCS_STORE = "documentaries";
  const MEDIA_CACHE_NAME = "ione-offline-media-v1";
  const DOCS_RECORD_ID = "home-documentaries";
  let dbPromise;

  function openDb() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("Offline book storage is not supported by this browser."));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(DOCS_STORE)) db.createObjectStore(DOCS_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open offline book storage."));
      request.onblocked = () => reject(new Error("Offline book storage is busy. Close other I|ONE tabs and try again."));
    });
    return dbPromise;
  }

  async function requestStore(mode, operation) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = operation(store); }
      catch (error) { reject(error); return; }
      let result;
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error("Offline book storage request failed."));
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Offline book storage transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Offline book storage transaction was cancelled."));
    });
  }

  function normalizeId(id) {
    const value = String(id == null ? "" : id).trim();
    if (!value) throw new Error("This book is missing its library ID.");
    return value;
  }

  async function get(id) {
    return (await requestStore("readonly", store => store.get(normalizeId(id)))) || null;
  }

  async function save(id, blob, metadata) {
    const key = normalizeId(id);
    if (!(blob instanceof Blob) || !blob.size) throw new Error("The downloaded book file is empty.");
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode.apply(null, head) !== "%PDF-") throw new Error("The server response was not a valid PDF file.");
    const record = {
      id: key,
      blob,
      title: String((metadata && metadata.title) || "Untitled Book"),
      savedAt: Date.now(),
      size: blob.size,
      mimeType: blob.type || "application/pdf"
    };
    await requestStore("readwrite", store => store.put(record));
    return { id: record.id, title: record.title, savedAt: record.savedAt, size: record.size };
  }

  async function saveFromUrl(id, url, metadata) {
    const endActivity = beginOfflineActivity("BOOK");
    let success = false;
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("Book download failed (" + response.status + ").");
      const blob = await response.blob();
      const result = await save(id, blob, metadata);
      success = true;
      return result;
    } finally {
      endActivity(success);
    }
  }

  async function list() {
    const records = await requestStore("readonly", store => store.getAll());
    return (records || []).map(record => ({
      id: record.id, title: record.title, savedAt: record.savedAt, size: record.size
    }));
  }

  async function remove(id) {
    await requestStore("readwrite", store => store.delete(normalizeId(id)));
    return true;
  }


  /* ================= I|ONE OFFLINE MEDIA + DOWNLOAD ALERT ================= */
  let activeDownloads = 0;
  let failedDownloads = 0;
  let statusElement = null;
  let beepTimer = 0;
  let audioContext = null;
  let hideStatusTimer = 0;
  let supabaseHooked = false;
  let billboardTimer = 0;
  const MAX_MEDIA_BYTES = 52 * 1024 * 1024;
  const BILLBOARD_STORAGE_KEY = "ioneOfflineMarketBillboards";

  function ensureStatusElement() {
    if (statusElement && statusElement.isConnected) return statusElement;
    if (!document.body) return null;
    if (!document.getElementById("ioneOfflineDownloadAlertStyle")) {
      const style = document.createElement("style");
      style.id = "ioneOfflineDownloadAlertStyle";
      style.textContent = "@keyframes ioneOfflineAlertShake{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-2px) rotate(-3deg)}40%{transform:translateX(2px) rotate(3deg)}60%{transform:translateX(-2px) rotate(-2deg)}80%{transform:translateX(2px) rotate(2deg)}}@keyframes ioneOfflineAlertPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,30,50,.35);opacity:1}50%{box-shadow:0 0 0 6px rgba(255,30,50,0);opacity:.72}}#ioneOfflineDownloadAlert{position:fixed;top:calc(7px + env(safe-area-inset-top));right:8px;z-index:2147483647;display:flex;align-items:center;gap:7px;max-width:min(78vw,260px);padding:8px 11px;border:1px solid #ff6674;border-radius:999px;background:rgba(55,5,12,.96);color:#fff;font:900 9px/1.2 Arial,sans-serif;letter-spacing:.7px;box-shadow:0 5px 18px rgba(0,0,0,.38);pointer-events:none}#ioneOfflineDownloadAlert .ione-offline-alert-light{width:10px;height:10px;flex:0 0 10px;border-radius:50%;background:#ff263d;box-shadow:0 0 9px #ff263d;animation:ioneOfflineAlertShake .42s linear infinite,ioneOfflineAlertPulse .8s ease-in-out infinite}#ioneOfflineDownloadAlert .ione-offline-alert-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#ioneOfflineDownloadAlert.is-complete{border-color:#50e6a0;background:rgba(4,43,28,.96)}#ioneOfflineDownloadAlert.is-complete .ione-offline-alert-light{background:#50e6a0;box-shadow:0 0 9px #50e6a0;animation:none}";
      document.head.appendChild(style);
    }
    statusElement = document.getElementById("ioneOfflineDownloadAlert");
    if (!statusElement) {
      statusElement = document.createElement("div");
      statusElement.id = "ioneOfflineDownloadAlert";
      statusElement.setAttribute("role", "status");
      statusElement.setAttribute("aria-live", "polite");
      statusElement.innerHTML = '<span class="ione-offline-alert-light" aria-hidden="true"></span><span class="ione-offline-alert-text">SAVING FOR OFFLINE</span>';
      document.body.appendChild(statusElement);
    }
    /* Keep the alert in the home controls row beside ACCESS and GUIDE, never floating over them. */
    const homeControls = document.getElementById("ioneTopActions");
    if (homeControls && statusElement.parentElement !== homeControls) {
      homeControls.appendChild(statusElement);
    } else if (!statusElement.isConnected) {
      document.body.appendChild(statusElement);
    }
    Object.assign(statusElement.style, {
      position: homeControls ? "relative" : "fixed",
      top: "auto",
      right: "auto",
      margin: "0",
      maxWidth: "min(32vw, 180px)",
      width: "fit-content",
      flex: "0 1 auto",
      alignSelf: "center",
      zIndex: "20"
    });
    return statusElement;
  }

  function tryResumeAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      if (activeDownloads && !beepTimer && audioContext.state !== "closed") {
        beepTimer = window.setInterval(() => {
          if (!activeDownloads || !audioContext || audioContext.state !== "running") return;
          try {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.11);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.12);
            oscillator.onended = () => { try { oscillator.disconnect(); gain.disconnect(); } catch (_) {} };
          } catch (_) {}
        }, 1250);
      }
    } catch (_) {}
  }

  document.addEventListener("pointerdown", tryResumeAudio, { passive: true });
  document.addEventListener("keydown", tryResumeAudio);
  function beginOfflineActivity(label) {
    activeDownloads += 1;
    if (hideStatusTimer) { clearTimeout(hideStatusTimer); hideStatusTimer = 0; }
    const el = ensureStatusElement();
    if (el) {
      el.classList.remove("is-complete");
      el.style.display = "flex";
      const text = el.querySelector(".ione-offline-alert-text");
      if (text) text.textContent = "SAVING " + String(label || "MEDIA").toUpperCase() + " • " + activeDownloads;
    }
    tryResumeAudio();
    let ended = false;
    return function endOfflineActivity(success) {
      if (ended) return;
      ended = true;
      if (success === false) failedDownloads += 1;
      activeDownloads = Math.max(0, activeDownloads - 1);
      const current = ensureStatusElement();
      if (activeDownloads > 0) {
        const text = current && current.querySelector(".ione-offline-alert-text");
        if (text) text.textContent = "SAVING FOR OFFLINE • " + activeDownloads;
        return;
      }
      if (beepTimer) { clearInterval(beepTimer); beepTimer = 0; }
      if (current) {
        const failed = failedDownloads > 0;
        failedDownloads = 0;
        current.classList.toggle("is-complete", !failed);
        const text = current.querySelector(".ione-offline-alert-text");
        if (text) text.textContent = failed ? "OFFLINE READY • SOME ITEMS SKIPPED" : "OFFLINE READY • SAVED CONTENT";
        /* Keep this home-screen status visible after saving finishes. */
        current.style.display = "flex";
        if (failed) {
          hideStatusTimer = window.setTimeout(() => {
            if (current && !activeDownloads) {
              const text = current.querySelector(".ione-offline-alert-text");
              if (text) text.textContent = "OFFLINE READY • CHECK CONNECTION";
            }
            hideStatusTimer = 0;
          }, 3200);
        }
      }
    };
  }

  function dbStore(storeName, mode, operation) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request;
      try { request = operation(store); } catch (error) { reject(error); return; }
      let result;
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error("Offline media storage request failed."));
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Offline media storage transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Offline media storage transaction was cancelled."));
    }));
  }

  function validMediaUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return "";
    try {
      const url = new URL(raw, location.href);
      return url.protocol === "https:" || url.origin === location.origin ? url.href : "";
    } catch (_) { return ""; }
  }

  async function cacheMediaUrl(value) {
    const url = validMediaUrl(value);
    if (!url || !("caches" in window)) return false;
    try {
      const cache = await caches.open(MEDIA_CACHE_NAME);
      if (await cache.match(url)) return true;
      const endActivity = beginOfflineActivity("MEDIA");
      let success = false;
      try {
        const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit", mode: "cors" });
      if (!response.ok || (response.type !== "basic" && response.type !== "cors" && response.type !== "default")) return false;
      const length = Number(response.headers.get("content-length") || 0);
      if (length > MAX_MEDIA_BYTES) return false;
      const clone = response.clone();
      if (!length) {
        const blob = await clone.blob();
        if (!blob.size || blob.size > MAX_MEDIA_BYTES) return false;
        await cache.put(url, new Response(blob, { status: 200, headers: response.headers }));
      } else {
        await cache.put(url, response.clone());
      }
        success = true;
        return true;
      } catch (error) {
        console.warn("I|ONE offline media cache skipped:", url, error);
        return false;
      } finally {
        endActivity(success);
      }
    } catch (error) {
      console.warn("I|ONE offline media cache skipped:", url, error);
      return false;
    }
  }

  function collectDocumentaryMedia(doc) {
    const urls = [];
    const add = value => { const url = validMediaUrl(value); if (url && !urls.includes(url)) urls.push(url); };
    add(doc && doc.cover_image_url);
    (Array.isArray(doc && doc.content) ? doc.content : []).forEach(block => {
      if (block && ["image", "video", "audio"].includes(String(block.type || "").toLowerCase())) add(block.url);
    });
    return urls;
  }

  async function saveDocumentaryShelf(docs) {
    const selected = (Array.isArray(docs) ? docs : []).filter(doc => doc && typeof doc === "object").slice(0, 2);
    if (!selected.length) return;
    const record = { id: DOCS_RECORD_ID, docs: selected, savedAt: Date.now() };
    await dbStore(DOCS_STORE, "readwrite", store => store.put(record));
    const urls = [];
    selected.forEach(doc => collectDocumentaryMedia(doc).forEach(url => { if (!urls.includes(url)) urls.push(url); }));
    for (const url of urls) await cacheMediaUrl(url);
    console.info("I|ONE offline shelf saved:", selected.length, "documentaries;", urls.length, "media assets");
  }

  async function getSavedDocumentaries() {
    try {
      const record = await dbStore(DOCS_STORE, "readonly", store => store.get(DOCS_RECORD_ID));
      return record && Array.isArray(record.docs) ? record.docs.slice(0, 2) : [];
    } catch (_) { return []; }
  }

  function getSupabaseClient() {
    try { if (typeof heavensSupabase !== "undefined" && heavensSupabase) return heavensSupabase; } catch (_) {}
    return window.heavensSupabase || null;
  }

  function installDocumentaryOfflineHook() {
    const client = getSupabaseClient();
    const functions = client && client.functions;
    if (!functions || typeof functions.invoke !== "function" || functions.__ioneOfflineMediaHook) return !!(functions && functions.__ioneOfflineMediaHook);
    const originalInvoke = functions.invoke.bind(functions);
    functions.__ioneOfflineMediaHook = true;
    functions.invoke = async function (name, options) {
      const isShelf = name === "ione-documentaries" && options && options.body && options.body.action === "list";
      if (!isShelf) return originalInvoke(name, options);
      /* Always try the live endpoint first; navigator.onLine can be stale on mobile. */
      try {
        const result = await originalInvoke(name, options);
        const docs = Array.isArray(result && result.data && result.data.documentaries) ? result.data.documentaries : [];
        if (!result.error && docs.length) saveDocumentaryShelf(docs).catch(error => console.warn("I|ONE offline documentary save failed:", error));
        if (result.error) {
          const saved = await getSavedDocumentaries();
          if (saved.length) return { data: { documentaries: saved }, error: null };
        }
        return result;
      } catch (error) {
        const saved = await getSavedDocumentaries();
        if (saved.length) return { data: { documentaries: saved }, error: null };
        throw error;
      }
    };
    return true;
  }

  function billboardExcluded(element) {
    let node = element;
    while (node && node !== document.body) {
      const label = String((node.id || "") + " " + (typeof node.className === "string" ? node.className : ""));
      if (/(authority|press|editor|admin|dashboard|ione-doc-editor)/i.test(label)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function readSavedBillboards() {
    try {
      const value = JSON.parse(localStorage.getItem(BILLBOARD_STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.slice(0, 2) : [];
    } catch (_) { return []; }
  }

  function saveBillboardMetadata(items) {
    try { localStorage.setItem(BILLBOARD_STORAGE_KEY, JSON.stringify(items.slice(0, 2))); } catch (_) {}
  }

  function captureMarketBillboards() {
    if (navigator.onLine === false || !document.body) return;
    const selector = '[data-billboard], [id*="billboard" i], [class*="billboard" i], [id*="banner" i], [class*="banner" i], .afl-screen, [class*="signage" i]';
    const candidates = Array.from(document.querySelectorAll(selector)).filter(el => !billboardExcluded(el) && el.getClientRects().length && (el.querySelector("img,video") || el.matches("img,video")));
    const stored = readSavedBillboards();
    const seen = new Set(stored.map(item => item.mediaUrl).filter(Boolean));
    const next = stored.slice(0, 2);
    for (const element of candidates) {
      const media = element.matches("img,video") ? element : element.querySelector("video[src],img[src],video[poster]");
      if (!media) continue;
      const mediaUrl = validMediaUrl(media.currentSrc || media.src || media.poster);
      if (!mediaUrl || seen.has(mediaUrl)) continue;
      const titleNode = element.querySelector("h1,h2,h3,strong,[class*='title' i]") || element;
      const descriptionNode = element.querySelector("p,[class*='description' i],[class*='desc' i]");
      const parent = element.parentElement;
      const item = {
        mediaUrl,
        type: media.tagName.toLowerCase() === "video" ? "video" : "image",
        title: String(titleNode.textContent || media.alt || "Market billboard").trim().slice(0, 180),
        description: String(descriptionNode ? descriptionNode.textContent : "").trim().slice(0, 320),
        parentId: parent && parent.id ? parent.id : "",
        parentClass: parent && typeof parent.className === "string" ? parent.className.split(/\s+/).slice(0, 3).join(" ") : ""
      };
      next.push(item);
      seen.add(mediaUrl);
      cacheMediaUrl(mediaUrl).catch(() => {});
      if (next.length >= 2) break;
    }
    if (next.length) saveBillboardMetadata(next.slice(0, 2));
  }

  function restoreMarketBillboards() {
    if (navigator.onLine !== false) return;
    const saved = readSavedBillboards();
    if (!saved.length) return;
    saved.forEach(item => {
      let parent = item.parentId ? document.getElementById(item.parentId) : null;
      if (!parent && item.parentClass) {
        const className = item.parentClass.split(/\s+/).filter(Boolean)[0];
        if (className) {
          try { parent = document.querySelector("." + CSS.escape(className)); } catch (_) {}
        }
      }
      if (!parent || billboardExcluded(parent) || parent.querySelector(".ione-offline-billboard-card")) return;
      const card = document.createElement("div");
      card.className = "ione-offline-billboard-card";
      card.style.cssText = "display:flex;align-items:center;gap:10px;box-sizing:border-box;margin:6px;padding:8px;border:1px solid rgba(255,70,85,.28);border-radius:12px;background:#10191d;color:#fff";
      if (item.type === "video") {
        const video = document.createElement("video");
        video.src = item.mediaUrl; video.muted = true; video.loop = true; video.playsInline = true; video.preload = "metadata";
        video.style.cssText = "width:88px;height:66px;object-fit:cover;border-radius:8px;background:#000";
        card.appendChild(video);
      } else {
        const image = document.createElement("img");
        image.src = item.mediaUrl; image.alt = ""; image.loading = "eager";
        image.style.cssText = "width:88px;height:66px;object-fit:contain;border-radius:8px;background:#000";
        card.appendChild(image);
      }
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = item.title || "Market billboard";
      title.style.cssText = "display:block;font:800 12px/1.4 Arial,sans-serif";
      const desc = document.createElement("span"); desc.textContent = item.description || "Saved for offline viewing";
      desc.style.cssText = "display:block;margin-top:4px;color:#9bb0b5;font:11px/1.4 Arial,sans-serif";
      copy.append(title, desc); card.appendChild(copy); parent.appendChild(card);
    });
  }

  function startOfflineMediaManager() {
    installDocumentaryOfflineHook();
    if (!supabaseHooked) {
      let attempts = 0;
      const retry = window.setInterval(() => {
        attempts += 1;
        if (installDocumentaryOfflineHook() || attempts >= 40) {
          window.clearInterval(retry);
          supabaseHooked = true;
        }
      }, 500);
    }
    if (navigator.onLine === false) restoreMarketBillboards();
    else captureMarketBillboards();
    if (!billboardTimer) billboardTimer = window.setInterval(() => {
      if (navigator.onLine === false) restoreMarketBillboards();
      else captureMarketBillboards();
    }, 2500);
    window.addEventListener("online", () => { captureMarketBillboards(); installDocumentaryOfflineHook(); });
    window.addEventListener("offline", restoreMarketBillboards);
  }

  installDocumentaryOfflineHook();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startOfflineMediaManager, { once: true });
  else startOfflineMediaManager();

  window.IoneOfflineBooks = Object.freeze({ get, save, saveFromUrl, list, remove });
})();
