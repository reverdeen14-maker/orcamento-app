// Guarda as telas do app no iPhone para abrir rápido e sem internet.
// Os dados da planilha nunca ficam aqui: vêm sempre do OneDrive.
const VERSAO = 'orcamento-v16';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'config.js', 'data.js', 'app.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icone-moeda.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Arquivos do app: tenta a rede primeiro (pega atualizações) e usa a cópia guardada se estiver sem internet.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

// Lembrete das 6h: o servidor (orcamento-lembretes) manda a mensagem e aqui ela vira notificação.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Orçamento Família', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || 'orcamento', data: { url: d.url || './' }
  }));
});

// Tocar na notificação abre o app (na aba Contas).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const app = cs.find((c) => c.url.startsWith(self.registration.scope));
    if (app && url.startsWith(self.registration.scope)) return app.navigate(url).then((c) => (c || app).focus()).catch(() => app.focus());
    return self.clients.openWindow(url);
  }));
});
