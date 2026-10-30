// Fait fonctionner l'app sans connexion : tous les fichiers sont gardés sur le téléphone.
// Une nouvelle version prend la main dès qu'elle est téléchargée ; la page recharge ou propose « Mettre à jour ».
// Change ce numéro à chaque modification pour forcer la mise à jour (et APP_VERSION dans js/main.js).
const VERSION = "salle-2026-10-30-2";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/main.js",
  "./js/core.js",
  "./js/motion.js",
  "./js/store.js",
  "./js/data.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const isPage = req.mode === "navigate";
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(isPage ? "./index.html" : req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(isPage ? "./index.html" : req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      return res || new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }),
  );
});
