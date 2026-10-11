/* I|ONE Offline Books — persistent PDF copies kept outside the rotating app cache. */
(function () {
  "use strict";

  const DB_NAME = "ione-offline-books";
  const DB_VERSION = 1;
  const STORE = "books";
  let dbPromise;

  function openDb() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("Offline book storage is not supported by this browser."));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
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
    const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error("Book download failed (" + response.status + ").");
    const blob = await response.blob();
    return save(id, blob, metadata);
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

  window.IoneOfflineBooks = Object.freeze({ get, save, saveFromUrl, list, remove });
})();
