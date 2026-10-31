/*
 * Service Worker：让这个页面装到桌面后能秒开、断网也能用。
 * 策略：同源 GET 走「先给缓存，再后台更新」（stale-while-revalidate），
 * 这样打开是瞬时的，内容改了下次打开自动生效，不用手动清缓存。
 *
 * 改了 index.html / app.js / content.js 之后，把 VERSION 加一，
 * 旧的缓存会被清掉。不改也不会出错，只是要等一次延迟生效。
 */
const VERSION = "v3";
const CACHE = "study-desk-" + VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/style.css",
  "./assets/app.js",
  "./data/content.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // 某个文件 404 也不该卡住安装
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // 只接管自己站内的 GET；GitHub API 那些跨域请求一律放行，不进缓存
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) {
      // 有缓存先给用户，网络更新在后台悄悄完成
      e.waitUntil(network);
      return hit;
    }

    const res = await network;
    if (res) return res;

    // 断网且没缓存：导航请求退回首页，避免白屏
    if (req.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    return new Response("离线且未缓存", { status: 503, statusText: "offline" });
  })());
});
