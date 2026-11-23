/* Service worker: solo guarda archivos propios del sitio (páginas, estilos, íconos, fotos).
   NUNCA toca peticiones a otros dominios (Apps Script): el estado STOP SITE, las cartas
   y los datos siempre vienen frescos del servidor. */
const CACHE = 'rincon-v11';
const SHELL = ['./', 'index.html', 'regalo.html', 'lugares.html', 'fotos.html', 'fechas.html', 'cartas.html', 'linea.html', 'favoritos.html', 'pendientes.html', 'hub.css', 'hub.js', 'busy.js', 'intro.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;       // todo lo externo va directo a la red
  if (r.mode === 'navigate' || /\.(html|js|css)$|lista\.json$/.test(u.pathname)) {            // HTML: red primero, caché si no hay conexión
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; })));
});
