/* ============================================================
   CLOUD FUNCTION — Yeni talep geldiğinde yöneticiye push bildirimi
   ------------------------------------------------------------
   Tetikleyici: rezervasyon/talepler/{talepKey} altına yeni bir
   kayıt yazıldığında çalışır (öğretmen bir rezervasyon talebi
   gönderdiğinde). durum "bekliyor" ise, rezervasyon/bildirimTokenleri
   altında kayıtlı tüm yönetici cihazlarına DATA-ONLY bir FCM
   mesajı gönderir. Bildirimin görünümünü sw.js'teki 'push'
   dinleyicisi oluşturur (bkz. self.registration.showNotification).

   Geçersiz/süresi dolmuş token'lar (uygulama kaldırılmış, izin
   geri alınmış vb.) otomatik olarak veritabanından silinir.

   KURULUM (bir kereye mahsus):
     1) Bu "functions" klasörünü proje kökünüze (index.html ile
        aynı seviyeye değil, ayrı bir klasör olarak) koyun.
     2) Terminalde: cd functions && npm install
     3) Proje kökünde firebase.json yoksa: firebase init functions
        (mevcut "rezervasyon1453" projesini seçin, bu index.js'in
        üzerine yazılmasını kabul etmeyin — üzerine kopyalayın.)
     4) Firebase projesinin Blaze (kullandıkça öde) planında
        olması gerekir — Cloud Functions dış ağ çağrısı yapıyor.
     5) Dağıtım: firebase deploy --only functions
============================================================ */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

exports.talepBildirimGonder = functions
    .region('europe-west1')
    .database.ref('/rezervasyon/talepler/{talepKey}')
    .onCreate(async (snapshot, context) => {
        const talep = snapshot.val();
        if (!talep || talep.durum !== 'bekliyor') return null;

        const tokenlerSnap = await admin.database().ref('/rezervasyon/bildirimTokenleri').once('value');
        const tokenlerVal = tokenlerSnap.val() || {};
        const tokenEntries = Object.entries(tokenlerVal).filter(([, v]) => v && v.token);
        if (!tokenEntries.length) return null;
        const tokenList = tokenEntries.map(([, v]) => v.token);

        const ogretmen = (talep.teacher || '').toString().toLocaleUpperCase('tr-TR');
        const baslik = 'Yeni rezervasyon talebi';
        const govde = [ogretmen, talep.location, talep.lessonLabel].filter(Boolean).join(' · ');

        const mesaj = {
            data: {
                title: baslik,
                body: govde,
                talepKey: context.params.talepKey
            },
            tokens: tokenList
        };

        const sonuc = await admin.messaging().sendEachForMulticast(mesaj);

        // Geçersiz / süresi dolmuş token'ları temizle
        const silinecekler = [];
        sonuc.responses.forEach((r, i) => {
            if (!r.success) {
                const kod = r.error && r.error.code;
                if (kod === 'messaging/invalid-registration-token' || kod === 'messaging/registration-token-not-registered') {
                    const [key] = tokenEntries[i];
                    silinecekler.push(admin.database().ref(`/rezervasyon/bildirimTokenleri/${key}`).remove());
                }
            }
        });
        await Promise.all(silinecekler);

        return null;
    });
