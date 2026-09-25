# ritos-app — ekran yerleşimi laboratuvarı

Bu, `rite-app`'in bir sonraki hâli olarak konuşulan **Ritos**'un ekran yerleşimini gerçek
tarayıcı boyutlarında ve gerçek etkileşimle denemek için ayrı bir Next.js oyun alanı.
`rite-app`'in veri modeline (Supabase) hiç bağlı değil — sabit/örnek içerikle çalışır,
sadece yerleşim fikirlerini test etmek için var. Detaylı tartışma: Ritos Taslağı
(claude.ai artifact).

## Çalıştırma

```
npm install
npm run dev
```

`http://localhost:3000` — pencereyi daraltıp genişleterek geniş-ekran (iPad tipi,
Ajanda sabit ana panel + sürüklenebilir ayraç + sağ ray sekmeleri) ile dar-ekran
(iPhone tipi, alt sekme çubuğu) arasındaki geçişi görebilirsin (kırılma noktası ~760px).

Sağ altta küçük bir "deney" paneli var: Danışmanlık gibi dolu-içerikli bir Tool'a
basınca ne olacağını üç modda (A/B/C — Ritos Taslağı'ndaki tartışmayla aynı) canlı
değiştirip deneyebilirsin.

Bu proje, app-meridyen'in boşalttığı 3000 portunu kullanıyor (rite-app 3001'de kalıyor).

## Home — widget ızgarası (24 eylül)

Home artık iki bölge: üstte SABİT widget'lar (Odak Alanları, Günlük Hatırlatıcı/
Ölçümler, Notlar, Gelenler, Danışmanlık — bizim tasarladığımız, taşınamaz), altta
"Senin alanın" — kullanıcının "Düzenle"ye basıp sürükleyip yeniden boyutlandırarak
kendi widget'larını (şu an Pomodoro/Fotoğraf/Sayaç placeholder olarak) yerleştirdiği
serbest bir ızgara. Fotoğraf widget'ı gerçekten dosya seçtirip önizliyor (kalıcı
değil, sadece tarayıcı belleğinde). Her Tool'un kendi açılış modu var (A/B/C —
sağ alttaki deney panelinden değiştirilebilir), global bir mod değil.
