const CACHE_NAME = "ione-app-v261";
const PDFJS_CACHE_NAME = "ione-pdfjs-v3.11.174";
const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const SUPABASE_JS_CACHE_NAME = "ione-supabase-js-v2";
const PDFJS_OFFLINE_ASSETS = new Set([
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
]);

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./health-data.js",
  "./lesson-data.js",
  "./ads-data.js",
  "./special-ads.js",
  "./book-to-pdf.js",
  "./ione-offline-books.js",
  "./hints.js",
  "./ione-gift-support.js",
  "./ione-find-it-for-me.js",
  "./ione-recovery-vault.js",
  "./ione-launch-observatory.js",
  "./ione-sokoni.js",
  "./ione-expert.js",
  "./chapchap.js",
  "./chapchap-receipts.js",
  "./images/1.jpg",
  "./images/2.jpg",
  "./images/ad3.png",
  "./images/one.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Cache files individually so one missing optional asset cannot
        // prevent the service worker from installing.
        await Promise.all(
          [...APP_FILES, SUPABASE_JS_URL].map((url) =>
            cache.add(url).catch((err) => {
              console.warn("Optional cache skipped:", url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== PDFJS_CACHE_NAME && key !== SUPABASE_JS_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Always fetch the app shell and service worker from the network first.
  // This prevents a broken/stale HTML or SW from trapping the app in an old cache.
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    // Return the cached shell immediately when available, while refreshing it
    // in the background. This prevents a black/blank cold-start while keeping
    // the app shell current after the network responds.
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", clone));
        }
        return response;
      }).catch(async () => (await caches.match("./index.html")) || (await caches.match("./")) || Response.error())
    );
    return;
  }

  if (url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(event.request, {cache:"no-store"}));
    return;
  }

  // Keep the external Supabase client available after it has loaded once online.
  if (url.href === SUPABASE_JS_URL || url.href.startsWith("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/")) {
    event.respondWith((async () => {
      const cache = await caches.open(SUPABASE_JS_CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response && response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(event.request)) || Response.error();
      }
    })());
    return;
  }

  // Only cache small same-origin application assets. Never grow the app cache
  // with remote fonts, large media, videos, or arbitrary API responses.
  if (PDFJS_OFFLINE_ASSETS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(PDFJS_CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response && (response.ok || response.type === "opaque")) {
          try { await cache.put(event.request, response.clone()); } catch (error) {
            console.warn("PDF.js offline cache skipped:", error);
          }
        }
        return response;
      } catch (_) {
        return (await cache.match(event.request)) || Response.error();
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const cacheableDestination = ["script","style","manifest","worker","document"].includes(event.request.destination);
  if (!sameOrigin) {
    // Do not cache or restore arbitrary remote media. Live media remains online-only.
    // Do not wrap Supabase API/REST/function GET requests in the service worker.
    // Let the browser perform them directly; only explicitly saved media above
    // is eligible for offline fallback. This keeps live data/auth requests untouched.
    if (/(^|\.)supabase\.co$/i.test(url.hostname)) return;
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }
  if (!cacheableDestination && event.request.destination !== "image" && event.request.destination !== "video" && event.request.destination !== "audio") {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  // Prefer current app scripts/styles from the network to avoid stale JS
  // paired with a newer HTML shell. Keep cached copies as offline fallbacks.
  const networkFirst = ["script", "style", "worker", "manifest"].includes(event.request.destination);
  if (networkFirst) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(async () => {
        const cachedResponse = await caches.match(event.request) || await caches.match(new URL(url.pathname, self.location.origin).href);
        return cachedResponse || Response.error();
      })
    );
    return;
  }

  // Online always wins: refresh same-origin images/media/assets first, and
  // consult saved cache only when the request genuinely fails. This keeps
  // cached offline copies from masking current products and live content.
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return networkResponse;
    }).catch(async () => {
      const cachedResponse = await caches.match(event.request);
      return cachedResponse || Response.error();
    })
  );
});


/* ================= I|ONE REAL PUSH NOTIFICATIONS ================= */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = String(data.title || "I|ONE");
  const options = {
    body: String(data.body || "New information is available on I|ONE."),
    icon: new URL(data.icon || "./icon-192.png", self.registration.scope).href,
    badge: new URL(data.badge || "./icon-192.png", self.registration.scope).href,
    ...(data.image ? { image: String(data.image) } : {}),
    tag: String(data.tag || "ione-notification"),
    renotify: true,
    data: { url: String(data.url || "./") }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification?.data?.url || "./";

  event.waitUntil(
    self.clients.matchAll({ type:"window", includeUncontrolled:true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try {
            const targetUrl = new URL(target, self.location.origin).href;
            if ("navigate" in client) client.navigate(targetUrl);
          } catch (_) {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
