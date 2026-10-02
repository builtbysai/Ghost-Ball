// Build identifier changes the service-worker bytes with each release.
const RELEASE="ghostball-20261002-p1-2";
// v0.2 transitional service worker: retire all caches from the previous Ghost Ball.
// Intentionally no fetch handler. New code uses network until offline/update UX ships.
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>/^(gb-|ghostball-|ghost-ball-)/.test(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
