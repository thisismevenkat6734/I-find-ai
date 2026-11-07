"use strict";

/* =========================================
   I FIND AI — SERVICE WORKER
   Updated version: v3
   ========================================= */

const CACHE_VERSION = "ifindai-cache-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./image-engine.js",
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
            console.warn("Could not cache:", url, error);
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

      console.info("I FIND AI Service Worker v3 activated.");
    })()
  );
});

/* =========================================
   3. FETCH HANDLER
   ========================================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);

  // Do not intercept external resources.
  if (requestUrl.origin !== self.location.origin) return;

  // Navigation: network first.
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

  // HTML, CSS and JavaScript: network first.
  // This helps load updated code after GitHub commits.
  const isAppCode =
    requestUrl.pathname.endsWith(".js") ||
    requestUrl.pathname.endsWith(".css") ||
    requestUrl.pathname.endsWith(".html");

  if (isAppCode) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);

        try {
          const response = await fetch(request, {
            cache: "no-cache"
          });

          if (response.ok && response.type === "basic") {
            await cache.put(request, response.clone());
          }

          return response;
        } catch (error) {
          const cachedResponse = await cache.match(request);

          if (cachedResponse) return cachedResponse;

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

    return;
  }

  // Other static resources: cache first.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      const cachedResponse = await cache.match(request);

      if (cachedResponse) return cachedResponse;

      try {
        const response = await fetch(request);

        if (response.ok && response.type === "basic") {
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
