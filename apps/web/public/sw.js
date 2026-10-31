// Guarda a casca do aplicativo. Dados de aluno nunca entram neste cache.
const CACHE = "ritmo-v3";
const SHELL = ["/", "/icon.svg", "/manifest.webmanifest"];

/** Guarda a página e os arquivos que ela usa: sem isso, o primeiro acesso não funcionaria offline. */
async function saveShell(cache, page) {
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await cache.addAll(assets);
  await cache.put("/", page);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      await saveShell(cache, await cache.match("/"));
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // A cópia precisa nascer aqui: depois que a página lê a resposta, ela não pode mais ser clonada.
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => saveShell(cache, copy)).catch(() => {}));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
