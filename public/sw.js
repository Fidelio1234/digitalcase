self.addEventListener('install', (event) => {
    self.skipWaiting();
  });
  
  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });
  
  // 🔥 questo è il punto chiave
  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    // Non intercettare: metodi non-GET e richieste cross-origin (es. il service su localhost:3002)
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
      return; // il browser gestisce la richiesta direttamente
    }
    event.respondWith(fetch(event.request));
  });