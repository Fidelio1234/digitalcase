self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      // Se la rete è assente, restituisci una risposta offline
      return new Response('Sei offline', { status: 503 });
    })
  );
});