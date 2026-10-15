const CACHE='nakhoda-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/map','/government','/settings','/icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||request.url.includes('/api/')||request.headers.has('Authorization'))return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match(request).then(x=>x||caches.match('/'))));});
