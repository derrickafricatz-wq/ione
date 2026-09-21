const CACHE_NAME = "afya-care-v48";

/* =========================
   CORE APP FILES
========================= */

const APP_FILES = [

  /* ROOT */
  "/mbingu-duniani/",
  "/mbingu-duniani/index.html",
  "/mbingu-duniani/manifest.json",
  "/mbingu-duniani/sw.js",

  /* DATA FILES */
  "/mbingu-duniani/health-data.js",
  "/mbingu-duniani/lesson-data.js",
  "/mbingu-duniani/ads-data.js",
  "/mbingu-duniani/special-ads.js",
  "/mbingu-duniani/hints.js",

 
/* =========================
     SPECIAL ADS IMAGES ONLY
  ========================= */
  "/mbingu-duniani/images/1.jpg",
  "/mbingu-duniani/images/2.jpg",

   
/* =========================
     ADS IMAGES ONLY
  ========================= */
  "/mbingu-duniani/images/ad3.png",
  "/mbingu-duniani/images/one.jpg",

  /* =========================
     HEALTH CLASS IMAGES ONLY
  ========================= */

];

/* =========================
   INSTALL
========================= */

self.addEventListener("install", (event) => {

  event.waitUntil(

    caches.open(CACHE_NAME)

      .then((cache) => {

        console.log("Caching app files...");

        return cache.addAll(APP_FILES);

      })

  );

  self.skipWaiting();

});

/* =========================
   ACTIVATE
========================= */

self.addEventListener("activate", (event) => {

  event.waitUntil(

    caches.keys().then((keys) => {

      return Promise.all(

        keys.map((key) => {

          if (key !== CACHE_NAME) {

            console.log("Deleting old cache:", key);

            return caches.delete(key);

          }

        })

      );

    })

  );

  self.clients.claim();

});

/* =========================
   FETCH
========================= */

self.addEventListener("fetch", (event) => {

  /* ONLY HANDLE GET REQUESTS */
  if(event.request.method !== "GET") return;

  event.respondWith(

    caches.match(event.request)

      .then((cachedResponse) => {

        /* RETURN CACHE IF FOUND */
        if(cachedResponse){

          return cachedResponse;

        }

        /* OTHERWISE FETCH FROM INTERNET */
        return fetch(event.request)

          .then((networkResponse) => {

            /* INVALID RESPONSE */
            if(
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type !== "basic"
            ){

              return networkResponse;

            }

            /* CLONE RESPONSE */
            const responseClone = networkResponse.clone();

            /* SAVE NEW FILES */
            caches.open(CACHE_NAME)

              .then((cache) => {

                cache.put(event.request, responseClone);

              });

            return networkResponse;

          })

          .catch(() => {

            /* OFFLINE FALLBACK */
            if(event.request.destination === "document"){

              return caches.match("/AFYA-CARE/index.html");

            }

          });

      })

  );

});
