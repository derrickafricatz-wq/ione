/* I|ONE Offline Books — the only persistent user content is books deliberately opened online. */
(function () {
  "use strict";

  const DB_NAME = "ione-offline-books";
  const DB_VERSION = 3;
  const STORE = "books";
  let dbPromise;
  let statusElement = null;
  let saveCount = 0;
  let failedSaveCount = 0;
  let audioContext = null;

  function openDb() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("Offline book storage is not supported by this browser."));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        // Older versions created a documentary store. Keep it for migration compatibility,
        // but this version never reads, writes, or restores documentary data.
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
      let request;
      try { request = operation(tx.objectStore(STORE)); }
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
      frontCover: String((metadata && metadata.frontCover) || ""),
      pdfCoverPage: !!(metadata && metadata.pdfCoverPage),
      savedAt: Date.now(),
      size: blob.size,
      mimeType: blob.type || "application/pdf"
    };
    await requestStore("readwrite", store => store.put(record));
    updateDot();
    return { id: record.id, title: record.title, savedAt: record.savedAt, size: record.size };
  }

  async function saveFromUrl(id, url, metadata) {
    beginSave();
    let success = false;
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("Book download failed (" + response.status + ").");
      const result = await save(id, await response.blob(), metadata);
      success = true;
      return result;
    } finally {
      endSave(success);
    }
  }

  async function list() {
    const records = await requestStore("readonly", store => store.getAll());
    return (records || []).map(record => ({
      id: record.id, title: record.title, savedAt: record.savedAt, size: record.size,
      frontCover: record.frontCover || "", pdfCoverPage: !!record.pdfCoverPage
    })).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  async function remove(id) {
    await requestStore("readwrite", store => store.delete(normalizeId(id)));
    updateDot();
    return true;
  }

  function ensureStatusElement() {
    if (statusElement && statusElement.isConnected) return statusElement;
    if (!document.body) return null;
    if (!document.getElementById("ioneOfflineBookDotStyle")) {
      const style = document.createElement("style");
      style.id = "ioneOfflineBookDotStyle";
      style.textContent = `
        #ioneOfflineBookDot{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 26px;width:26px;height:30px;min-width:26px;margin:0;padding:0;border:0;background:transparent;cursor:pointer;z-index:30}
        #ioneOfflineBookDot .ione-offline-dot{display:block;width:10px;height:10px;border-radius:50%;background:#89939a;box-shadow:0 0 0 2px rgba(137,147,154,.13);transition:background .18s ease,box-shadow .18s ease}
        #ioneOfflineBookDot.is-saving .ione-offline-dot{background:#ff3048;box-shadow:0 0 0 3px rgba(255,48,72,.16)}
        #ioneOfflineBookDot.is-ready .ione-offline-dot{background:#35df8c;box-shadow:0 0 0 3px rgba(53,223,140,.14)}
        #ioneOfflineBooksPanel{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;background:rgba(0,0,0,.78);font-family:Arial,sans-serif;color:#f2fff8}
        #ioneOfflineBooksPanel .ione-offline-books-card{width:min(520px,100%);max-height:84dvh;overflow:auto;box-sizing:border-box;padding:16px;border:1px solid #285747;border-radius:16px;background:#071711;box-shadow:0 18px 60px #0009}
        #ioneOfflineBooksPanel .ione-offline-book-row{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;box-sizing:border-box;padding:9px;margin-top:8px;border:1px solid #244b3b;border-radius:11px;background:#0b2118;color:#effff7;text-align:left}
        #ioneOfflineBooksPanel .ione-offline-book-cover{width:56px;height:72px;object-fit:cover;border-radius:5px;background:#173529}
        #ioneOfflineBooksPanel .ione-offline-book-title{font-size:13px;font-weight:800;overflow-wrap:anywhere}
        #ioneOfflineBooksPanel .ione-offline-book-meta{margin-top:5px;color:#9dbdaf;font-size:10px}
        #ioneOfflineBooksPanel .ione-offline-book-remove{border:1px solid #526b61;border-radius:7px;background:#132a20;color:#d5f6e5;padding:7px;font-size:10px}
      `;
      document.head.appendChild(style);
    }
    statusElement = document.getElementById("ioneOfflineBookDot");
    if (!statusElement) {
      statusElement = document.createElement("button");
      statusElement.id = "ioneOfflineBookDot";
      statusElement.type = "button";
      statusElement.setAttribute("aria-label", "Open saved offline books");
      statusElement.title = "Saved books";
      statusElement.innerHTML = '<span class="ione-offline-dot" aria-hidden="true"></span>';
      statusElement.addEventListener("click", openSavedBooksPanel);
    }
    const homeControls = document.getElementById("ioneTopActions");
    if (homeControls && statusElement.parentElement !== homeControls) homeControls.appendChild(statusElement);
    else if (!statusElement.isConnected) document.body.appendChild(statusElement);
    updateDot();
    return statusElement;
  }

  function playShortBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      if (audioContext.state !== "running") return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, audioContext.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.09);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + 0.1);
      oscillator.onended = () => { try { oscillator.disconnect(); gain.disconnect(); } catch (_) {} };
    } catch (_) {}
  }

  function beginSave() {
    saveCount += 1;
    const dot = ensureStatusElement();
    if (dot) { dot.classList.add("is-saving"); dot.classList.remove("is-ready"); dot.title = "Saving book for offline reading"; }
    if (saveCount === 1) playShortBeep();
  }

  function endSave(success) {
    saveCount = Math.max(0, saveCount - 1);
    if (!success) failedSaveCount += 1;
    updateDot();
    if (saveCount === 0) {
      const dot = ensureStatusElement();
      if (dot) dot.title = failedSaveCount ? "Some books could not be saved. Tap to view saved books." : "Saved offline books";
      failedSaveCount = 0;
    }
  }

  async function updateDot() {
    const dot = statusElement;
    if (!dot || !dot.isConnected) return;
    if (saveCount > 0) {
      dot.classList.add("is-saving"); dot.classList.remove("is-ready");
      return;
    }
    try {
      const books = await list();
      if (!dot.isConnected) return;
      dot.classList.remove("is-saving");
      dot.classList.toggle("is-ready", books.length > 0);
      dot.title = books.length ? books.length + " saved book" + (books.length === 1 ? "" : "s") : "No saved books yet";
    } catch (_) {
      dot.classList.remove("is-saving", "is-ready");
    }
  }

  function closePanel(panel) { if (panel && panel.isConnected) panel.remove(); }

  async function openSavedBooksPanel() {
    const old = document.getElementById("ioneOfflineBooksPanel");
    if (old) { old.remove(); return; }
    const panel = document.createElement("div");
    panel.id = "ioneOfflineBooksPanel";
    panel.innerHTML = '<section class="ione-offline-books-card" role="dialog" aria-modal="true" aria-label="Saved offline books"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div style="font-size:18px;font-weight:900">SAVED BOOKS</div><div style="margin-top:4px;color:#9dbdaf;font-size:11px">Available even when your internet is off</div></div><button type="button" data-close style="width:34px;height:34px;border:0;border-radius:9px;background:#173529;color:#fff;font-size:21px">×</button></div><div data-status style="padding:14px 0;color:#bfe8d7;font-size:12px">Loading saved books…</div><div data-list></div></section>';
    document.body.appendChild(panel);
    panel.querySelector("[data-close]").addEventListener("click", () => closePanel(panel));
    panel.addEventListener("click", event => { if (event.target === panel) closePanel(panel); });
    const status = panel.querySelector("[data-status]");
    const listEl = panel.querySelector("[data-list]");
    try {
      const books = await list();
      status.textContent = books.length ? books.length + " book" + (books.length === 1 ? "" : "s") + " saved on this device." : "No books saved yet. Open a book while online and it will be saved here.";
      books.forEach(book => {
        const row = document.createElement("div");
        row.className = "ione-offline-book-row";
        const cover = document.createElement("div");
        if (book.frontCover) {
          const img = document.createElement("img"); img.className = "ione-offline-book-cover"; img.src = book.frontCover; img.alt = "";
          cover.appendChild(img);
        } else {
          cover.className = "ione-offline-book-cover";
          cover.style.display = "flex"; cover.style.alignItems = "center"; cover.style.justifyContent = "center";
          cover.style.padding = "3px"; cover.style.boxSizing = "border-box"; cover.style.fontSize = "8px"; cover.style.textAlign = "center";
          cover.textContent = book.title || "BOOK";
        }
        const details = document.createElement("button");
        details.type = "button"; details.style.cssText = "min-width:0;border:0;background:transparent;color:inherit;text-align:left;padding:0";
        const title = document.createElement("div"); title.className = "ione-offline-book-title"; title.textContent = book.title || "Untitled book";
        const meta = document.createElement("div"); meta.className = "ione-offline-book-meta";
        meta.textContent = "Saved " + (book.savedAt ? new Date(book.savedAt).toLocaleDateString() : "offline") + " · " + (book.size ? (book.size / (1024 * 1024)).toFixed(1) + " MB" : "PDF");
        details.append(title, meta);
        details.addEventListener("click", async () => {
          const saved = await get(book.id);
          if (!saved || !saved.blob) { status.textContent = "This saved book is unavailable. Open it online to save it again."; return; }
          closePanel(panel);
          if (typeof window.openPaidPdfReader !== "function") { alert("The book reader is not ready. Reopen I|ONE and try again."); return; }
          window.openPaidPdfReader({
            id: saved.id, supabaseId: saved.id, title: saved.title,
            frontCover: saved.frontCover || "", pdfCoverPage: !!saved.pdfCoverPage,
            offlineSaved: true
          });
        });
        const removeButton = document.createElement("button");
        removeButton.type = "button"; removeButton.className = "ione-offline-book-remove"; removeButton.textContent = "REMOVE";
        removeButton.addEventListener("click", async () => {
          removeButton.disabled = true;
          try { await remove(book.id); row.remove(); status.textContent = "Book removed from this device."; }
          catch (_) { removeButton.disabled = false; status.textContent = "Could not remove this book."; }
        });
        row.append(cover, details, removeButton);
        listEl.appendChild(row);
      });
    } catch (error) {
      status.textContent = error && error.message ? error.message : "Could not load saved books.";
    }
  }

  function start() {
    ensureStatusElement();
    // Deliberately no documentary caching, billboard capture, media downloads,
    // Supabase interception, polling, or offline restoration of other features.
    window.addEventListener("online", updateDot);
  }

  window.IoneOfflineBooks = Object.freeze({ get, save, saveFromUrl, list, remove, openSavedBooksPanel });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();