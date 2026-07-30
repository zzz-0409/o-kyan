const CACHE_NAME = "run-dash-cache-v19";
const CORE_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/ui/app-icon.svg",
  "./assets/ui/app-icon-192.png",
  "./assets/ui/app-icon-512.png",
  "./assets/ui/title-bg-campus.png",
  "./assets/ui/result-panel-campus.png",
  "./assets/ui/pwa-screenshot-title.png",
  "./assets/ui/pwa-screenshot-play.png",
  "./assets/backgrounds/imagegen-full-road-city-loop-maximum-width.png",
  "./assets/backgrounds/imagegen-city-side-loop.png",
  "./assets/character/imagegen-runner-0.png",
  "./assets/character/imagegen-runner-1.png",
  "./assets/character/imagegen-runner-2.png",
  "./assets/character/imagegen-runner-3.png",
  "./assets/character/imagegen-runner-jump.png",
  "./assets/obstacles/imagegen-car.png",
  "./assets/obstacles/imagegen-hole.png",
  "./assets/gimmicks/imagegen-boost-pad.png",
  "./assets/gimmicks/imagegen-slow-pad.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_SHELL)
        .then(() => Promise.allSettled(
          APP_SHELL
            .filter((url) => !CORE_SHELL.includes(url))
            .map((url) => cache.add(url))
        )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }))
  );
});
