const CACHE_NAME = 'songbird-offline-v3';
const APP_SHELL = [
  './', './index.html', './manifest.json',
  './js/birdnet.js', './js/birdnet-client.js', './js/birdnet-worker.js',
  './js/tfjs-4.14.0.min.js', './js/audio-processor.js',
  './models/birdnet/model.json',
  ...Array.from({length:13},(_,i)=>`./models/birdnet/group1-shard${i+1}of13.bin`),
  './models/birdnet/area-model/model.json',
  './models/birdnet/area-model/group1-shard1of2.bin',
  './models/birdnet/area-model/group1-shard2of2.bin',
  './models/birdnet/labels/en_us.txt', './models/birdnet/labels/pt.txt'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request,response.clone())).catch(()=>{});
    return response;
  })));
});
