// Build identifier changes the service-worker bytes with each release.
const RELEASE="ghostball-20261004-overhaul-10";
// Offline-capable without ever serving stale code while online:
//  - same-origin GETs are network-first; every good response refreshes this release's cache
//  - when the network is gone the last good copy is served, so an installed game still opens
//  - a new RELEASE changes these bytes, installs a new worker and retires the old cache
const CACHE=RELEASE;
const SHELL=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./apple-touch-icon.png','./icon-512.png','./icon-maskable-512.png','./favicon.ico'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(SHELL.map(url=>
    fetch(new Request(url,{cache:'reload'})).then(response=>response.ok?cache.put(url,response):null).catch(()=>null)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>/^(gb-|ghostball-|ghost-ball-)/.test(key)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin||request.headers.has('range'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request);
      if(response.ok&&response.type==='basic')cache.put(request,response.clone()).catch(()=>{});
      return response;
    }catch(error){
      const hit=await cache.match(request)||await cache.match(request,{ignoreSearch:true})||
        (request.mode==='navigate'?await cache.match('./index.html'):null);
      if(hit)return hit;
      throw error;
    }
  })());
});
