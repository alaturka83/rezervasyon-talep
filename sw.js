/* ============================================================
   SERVICE WORKER — "Ana ekrana / Masaüstüne ekle" (PWA) için
   ------------------------------------------------------------
   Kök dizinde durur ve index.html ile aynı klasörde yaşar;
   böylece kısayoldan açılan sayfa tam kapsama (scope) sahip olur.

   Strateji: "önce ağ, olmazsa önbellek". Sunucuya yeni sürüm
   yüklendiğinde kullanıcı HER ZAMAN yeni sürümü alır; önbellek
   yalnızca internet yokken devreye girer.

   Rezervasyon/talep verileri BURADA ÖNBELLEKLENMEZ; yalnızca
   uygulama kabuğu (HTML/manifest/simgeler) tutulur.

   v5 — ERR_FAILED düzeltmesi (okul-ariza-takip ile aynı):
   • respondWith() hiçbir durumda "undefined" döndürmüyor.
   • Sayfa (navigation) istekleri ayrı ele alınıyor; ağ yoksa
     index.html'e, o da yoksa gerçek bir çevrimdışı sayfasına düşülüyor.
   • Yönlendirmeli cevaplar önbelleğe alınmıyor.
   • Kurulumda tek bir dosya inmese bile SW kurulumu çökmüyor.
============================================================ */
const ONBELLEK = 'rezervasyon-talep-kabuk-v5';
const INDEX = new URL('./index.html', self.location.href).href;
const KABUK = [
  INDEX,
  new URL('./manifest.json', self.location.href).href,
  new URL('./icon-192.png', self.location.href).href,
  new URL('./icon-512.png', self.location.href).href,
  new URL('./icon-maskable.png', self.location.href).href
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(ONBELLEK).then(c =>
      Promise.all(KABUK.map(u => c.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(adlar => Promise.all(adlar.filter(a => a !== ONBELLEK).map(a => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

function cevrimdisiSayfa() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Çevrimdışı</title><body style="font-family:sans-serif;padding:24px;text-align:center">' +
    '<h2>Bağlantı yok</h2><p>Rezervasyon sistemi açılamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.</p>' +
    '<p><a href="./">Yeniden dene</a></p></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', e => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;   // CDN (React/Tailwind/html2canvas/Firebase) istekleri karışmadan geçer

  // ---- Sayfa açılışı: ağ → önbellekteki index.html → çevrimdışı sayfası
  if (istek.mode === 'navigate') {
    e.respondWith(
      fetch(istek)
        .then(cevap => {
          if (cevap && cevap.ok && !cevap.redirected && cevap.type === 'basic') {
            const kopya = cevap.clone();
            caches.open(ONBELLEK).then(c => c.put(INDEX, kopya)).catch(() => {});
          }
          return cevap;
        })
        .catch(() => caches.match(INDEX).then(c => c || cevrimdisiSayfa()))
    );
    return;
  }

  // ---- Diğer aynı-kaynak istekler (manifest, simgeler vb.)
  e.respondWith(
    fetch(istek)
      .then(cevap => {
        if (cevap && cevap.ok && !cevap.redirected && cevap.type === 'basic') {
          const kopya = cevap.clone();
          caches.open(ONBELLEK).then(c => c.put(istek, kopya)).catch(() => {});
        }
        return cevap;
      })
      .catch(() => caches.match(istek).then(c => c || new Response('', { status: 504, statusText: 'Offline' })))
  );
});

/* ------------------------------------------------------------
   BİLDİRİME DOKUNULDUĞUNDA (yeni talep bildirimi vb.)
   Uygulama açık bir sekmede ise ona odaklanır; değilse yeni
   pencerede açar. Bildirim index.html'deki reg.showNotification
   çağrısıyla oluşturulur; burada yalnızca tıklama yönetilir.
------------------------------------------------------------ */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
