"use strict";

/* =========================================
   I FIND AI — SERVICE WORKER
   Updated version: v2
   ========================================= */

const CACHE_VERSION = "ifindai-cache-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./offline.html",
  "./privacy.html",
  "./terms.html"
];

const OFFLINE_PAGE = "./offline.html";

/* =========================================
   1. INSTALL
   ========================================= */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const response = await fetch(url, {
              cache: "reload"
            });

            if (response.ok && response.type === "basic") {
              await cache.put(url, response);
            }
          } catch (error) {
            // Missing resources can be cached after a later visit.
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

/* =========================================
   2. ACTIVATE
   ========================================= */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map((name) => {
          if (
            name.startsWith("ifindai-cache-") &&
            name !== CACHE_VERSION
          ) {
            return caches.delete(name);
          }

          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
  );
});

/* =========================================
   3. NAVIGATION REQUESTS
   Network first, offline page fallback.
   ========================================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);

  // Never intercept external resources.
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cache = await caches.open(CACHE_VERSION);

          const cachedPage = await cache.match(request);

          if (cachedPage) return cachedPage;

          const offlinePage = await cache.match(OFFLINE_PAGE);

          if (offlinePage) return offlinePage;

          return new Response(
            "You are offline. Please reconnect and try again.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            }
          );
        }
      })()
    );

    return;
  }

  /* =======================================
     4. STATIC RESOURCES
     Cache first, network fallback.
     ======================================= */

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      const cachedResponse = await cache.match(request);

      if (cachedResponse) return cachedResponse;

      try {
        const response = await fetch(request);

        if (
          response.ok &&
          response.type === "basic"
        ) {
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        return new Response(
          "This resource is unavailable offline.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      }
    })()
  );
});
