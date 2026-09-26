const CACHE_NAME = "ione-app-v68";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./health-data.js",
  "./lesson-data.js",
  "./ads-data.js",
  "./special-ads.js",
  "./hints.js",
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
          APP_FILES.map((url) =>
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
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return Response.error();
        });
    })
  );
});
