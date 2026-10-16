const CACHE = "betpulse-sw-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

// Static assets that never change without a new URL/deploy. These are served
// cache-first: previously the SW was network-first for EVERYTHING, so nothing
// was ever answered from cache and every asset request — including the game's
// plane frames and sound sprites, which are re-requested many times per round —
// went to the network for a 200/304. That's the request storm visible in the
// Network panel with sw.js as the initiator.
const STATIC_PATH = /^\/(planes|sounds|images|icons|_next\/static)\//;
const STATIC_EXT = /\.(svg|png|jpe?g|webp|avif|gif|ico|mp3|wav|ogg|woff2?|ttf|otf|js|css)$/i;

function isStatic(url) {
  return STATIC_PATH.test(url.pathname) || STATIC_EXT.test(url.pathname);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Leave cross-origin and non-http(s) requests to the browser.
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    // Cache-first. Range requests (audio seeking, 206 responses) are not
    // cacheable, so they fall through to the network untouched.
    if (req.headers.has("range")) return;
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else (HTML, RSC payloads, API) stays network-first with a cache
  // fallback so the app still opens offline.
  e.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((r) => r ?? new Response("", { status: 503 }))
    )
  );
});
