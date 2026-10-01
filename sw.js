// Минимальный service worker: делает сайт устанавливаемым, ничего не кэширует (всегда свежая версия)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
