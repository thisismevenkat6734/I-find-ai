"use strict";

/* =========================================
   I FIND AI — SERVICE WORKER
   File: sw.js
   ========================================= */

const CACHE_VERSION = "ifindai-cache-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

/* =========================================
   1. INSTALL
   ========================================= */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // Cache each resource independently.
      // One missing resource should not break installation.
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
            // Resource will be fetched when the network is available.
          }
        })
      );
    })
  );

  self.skipWaiting();
});

/* =========================================
   2. ACTIVATE
   ========================================= */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName.startsWith("ifindai-cache-") &&
            cacheName !== CACHE_VERSION
          ) {
            return caches.delete(cacheName);
          }

          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
  );
});

/* =========================================
   3. FETCH
   ========================================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle safe GET requests.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Do not cache external websites or third-party resources.
  if (url.origin !== self.location.origin) return;

  // Navigation: network first, cached homepage as fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put("./index.html", response.clone());
          }

          return response;
        } catch (error) {
          const cachedPage = await caches.match("./index.html");

          if (cachedPage) return cachedPage;

          return new Response(
            "I FIND AI is offline. Please reconnect to the internet and try again.",
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

  // Same-origin static resources: cache first, then network.
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);

      if (cachedResponse) return cachedResponse;

      try {
        const response = await fetch(request);

        if (
          response.ok &&
          response.type === "basic"
        ) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        return new Response("Resource unavailable offline.", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        });
      }
    })()
  );
});
