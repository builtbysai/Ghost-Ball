// v0.1 transitional service worker: retire all caches from the previous Ghost Ball.
// Intentionally no fetch handler. New code uses network until offline/update UX ships.
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gb-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
