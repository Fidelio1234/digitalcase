self.addEventListener('install', (event) => {
    self.skipWaiting();
  });
  
  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });
  
  // 🔥 questo è il punto chiave
  self.addEventListener('fetch', (event) => {
    event.respondWith(
      fetch(event.request)
    );
  });