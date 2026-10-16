const CACHE='nakhoda-static-v3';
const ASSETS=['/offline.html','/icons/pwa-192.png','/icons/pwa-512.png','/icons/pwa-maskable-512.png','/icons/apple-touch-icon.png','/icons/favicon-32.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('nakhoda-shell-')||key.startsWith('nakhoda-static-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||request.headers.has('Authorization'))return;
  // Live data and authenticated HTML are never saved to the service-worker cache.
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>await caches.match('/offline.html')||Response.error()));
  }else if(ASSETS.includes(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
  }
});
