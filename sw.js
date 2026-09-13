/* ============================================================
   SERVICE WORKER — "Ana ekrana / Masaüstüne ekle" (PWA) için
   ------------------------------------------------------------
   Kök dizinde durur ve index.html ile aynı klasörde yaşar;
   böylece kısayoldan açılan sayfa tam kapsama (scope) sahip olur.

   Amaç yalnızca uygulamanın kurulabilmesi ve bağlantı koptuğunda
   beyaz ekran yerine son açılan sayfanın gelmesidir.

   ÖNEMLİ: Strateji "önce ağ, olmazsa önbellek". Yani sunucuya
   yeni bir sürüm yüklediğinizde kullanıcı HER ZAMAN yeni sürümü
   alır; önbellek sadece internet yokken devreye girer.

   Rezervasyon/talep verileri BURADA ÖNBELLEKLENMEZ; bu dosya
   yalnızca uygulama kabuğunu (HTML/manifest/simgeler) çevrimdışıyken
   de açılabilir tutar.
============================================================ */
const ONBELLEK = 'rezervasyon-talep-kabuk-v3';
const KABUK = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(ONBELLEK).then(c => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(adlar => Promise.all(adlar.filter(a => a !== ONBELLEK).map(a => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;   // CDN (React/Tailwind/html2canvas) istekleri hiç karışmadan geçer

  e.respondWith(
    fetch(istek)
      .then(cevap => {
        if (cevap && cevap.ok) {
          const kopya = cevap.clone();
          caches.open(ONBELLEK).then(c => c.put(istek, kopya)).catch(() => {});
        }
        return cevap;
      })
      .catch(() => caches.match(istek).then(c => c || caches.match('./index.html')))
  );
});

/* ------------------------------------------------------------
   UYGULAMA TAMAMEN KAPALIYKEN BİLDİRİM (Firebase Cloud Messaging)
   ------------------------------------------------------------
   Bir Cloud Function yeni talep geldiğinde bu cihaza DATA-ONLY bir
   FCM mesajı gönderir (bkz. functions/index.js) — tarayıcı bunu
   'push' olayı olarak burada teslim eder. Bildirimi biz kendimiz
   gösteririz; böylece tıklanınca yukarıdaki notificationclick
   davranışı (odaklan/aç) tam olarak çalışır.
------------------------------------------------------------ */
self.addEventListener('push', e => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (err) {}
  const veri = payload.data || payload; // FCM data-only mesaj { data: {...} } şeklinde gelir
  const baslik = veri.title || 'Yeni rezervasyon talebi';
  const secenekler = {
    body: veri.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'rz-talep',
    renotify: true
  };
  e.waitUntil(self.registration.showNotification(baslik, secenekler));
});

/* ------------------------------------------------------------
   BİLDİRİME DOKUNULDUĞUNDA (yeni talep bildirimi vb.)
   ------------------------------------------------------------
   Uygulama zaten açık bir sekmede/pencerede ise ona odaklanır;
   değilse yeni bir pencere/sekmede açar. Bildirim, index.html
   içindeki reg.showNotification(...) çağrısıyla veya yukarıdaki
   'push' olayıyla oluşturulur — burada yalnızca tıklama davranışı
   yönetilir.
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
