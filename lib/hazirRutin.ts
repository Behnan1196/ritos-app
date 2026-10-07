// ————————————————————————————————————————————————————————————————
// Hazır rutinler (8 ekim, ilk taslak) — "Hayatına bakalım" › Küçük başla.
// Her rutin bir ya da birkaç hazır alana KODLA bağlanır (ada değil): alan adı değişse ya da dil
// değişse etiket bozulmaz. Metinler dile göre (şimdilik yalnız tr). Kişi bir rutini alınca metin
// onun kartına kopyalanır, artık onundur.
// İleride: paket tablosuna taşınır (uygulama güncellenmeden düzeltilir; uzman kendi listesini ekler).
// gunler: JS getDay (0 = Paz … 6 = Cmt); null = her gün.
// ————————————————————————————————————————————————————————————————

export interface HazirRutin { kod: string; alanlar: string[]; ikon: string; ad: string; alt: string; gunler: number[] | null; ardindan: string | null }

export const CERCEVE = 'ritos-8';

export const HAZIR_RUTINLER: HazirRutin[] = [
  { kod: 'yemek-sonrasi-yuruyus', alanlar: ['hareket'], ikon: '🚶', ad: 'Yemekten sonra 10 dakika yürü', alt: 'Her gün, kısa ve kolay', gunler: null, ardindan: 'Akşam yemeğinden sonra' },
  { kod: 'sabah-esneme', alanlar: ['hareket'], ikon: '🙆', ad: 'Sabah 5 dakika esne', alt: 'Kalkınca bedenini uyandır', gunler: null, ardindan: 'Sabah kalkınca' },
  { kod: 'haftada-iki-yuruyus', alanlar: ['hareket'], ikon: '👟', ad: '20 dakikalık yürüyüş', alt: 'Haftada iki gün', gunler: [2, 4], ardindan: 'Kahvaltıdan sonra' },
  { kod: 'muzikle-hareket', alanlar: ['hareket', 'keyif'], ikon: '💃', ad: 'Sevdiğin bir şarkıyla hareket et', alt: 'Haftada bir, bir şarkı boyu', gunler: [6], ardindan: null },

  { kod: 'ogunle-su', alanlar: ['beslenme'], ikon: '💧', ad: 'Her öğünle bir bardak su iç', alt: 'Her gün', gunler: null, ardindan: 'Öğle yemeğinden sonra' },
  { kod: 'yarisi-sebze', alanlar: ['beslenme'], ikon: '🥗', ad: 'Tabağının yarısı sebze olsun', alt: 'Öğle yemeğinde', gunler: null, ardindan: null },
  { kod: 'meyve-atistirma', alanlar: ['beslenme'], ikon: '🍎', ad: 'Atıştırmalık yerine meyve', alt: 'İkindi vakti', gunler: null, ardindan: null },
  { kod: 'yeni-tarif', alanlar: ['beslenme', 'keyif'], ikon: '🍲', ad: 'Yeni bir sağlıklı tarif dene', alt: 'Haftada bir', gunler: [0], ardindan: null },

  { kod: 'ekran-kapat', alanlar: ['uyku'], ikon: '📵', ad: 'Yatmadan 30 dakika önce ekranı kapat', alt: 'Her gece', gunler: null, ardindan: 'Yatmadan önce' },
  { kod: 'ayni-saatte-kalk', alanlar: ['uyku'], ikon: '⏰', ad: 'Her gün aynı saatte kalk', alt: 'Hafta sonu da', gunler: null, ardindan: 'Belli bir saatte' },
  { kod: 'ogleden-sonra-kahve-yok', alanlar: ['uyku'], ikon: '☕', ad: 'Öğleden sonra kahve içme', alt: 'Bitki çayı iyi bir yerine geçer', gunler: null, ardindan: null },
  { kod: 'yatmadan-gevse', alanlar: ['uyku', 'zihin'], ikon: '🌙', ad: 'Yatmadan önce 5 dakika gevşe', alt: 'Yavaş nefes, hafif esneme', gunler: null, ardindan: 'Yatmadan önce' },

  { kod: 'uc-dakika-nefes', alanlar: ['zihin'], ikon: '🌬️', ad: '3 dakika yavaş nefes', alt: 'Her gün', gunler: null, ardindan: 'Sabah kahvesinden sonra' },
  { kod: 'uc-iyi-sey', alanlar: ['zihin', 'anlam'], ikon: '📝', ad: 'Bugün iyi giden 3 şeyi yaz', alt: 'Her akşam birkaç satır', gunler: null, ardindan: 'Yatmadan önce' },
  { kod: 'telefonsuz-disari', alanlar: ['zihin', 'hareket'], ikon: '🌳', ad: 'Telefonsuz 15 dakika dışarıda ol', alt: 'Haftada üç gün', gunler: [1, 3, 5], ardindan: null },
  { kod: 'sessiz-yarim-saat', alanlar: ['zihin', 'keyif'], ikon: '🕯️', ad: 'Kendine sessiz bir yarım saat', alt: 'Haftada bir', gunler: [3], ardindan: null },

  { kod: 'eski-dostu-ara', alanlar: ['sosyal'], ikon: '📞', ad: 'Eski bir dostunu ara', alt: 'Haftada bir, 10 dakika yeter', gunler: [0], ardindan: 'Öğle yemeğinden sonra' },
  { kod: 'komsuya-cay', alanlar: ['sosyal'], ikon: '🫖', ad: 'Bir komşuna çaya uğra', alt: 'Haftada bir', gunler: [3], ardindan: null },
  { kod: 'arkadasla-yuru', alanlar: ['sosyal', 'hareket'], ikon: '👭', ad: 'Bir arkadaşınla birlikte yürü', alt: 'Haftada bir', gunler: [6], ardindan: null },
  { kod: 'sevdiklerine-mesaj', alanlar: ['sosyal'], ikon: '💬', ad: 'Sevdiklerine bir fotoğraf ya da mesaj gönder', alt: 'Haftada iki kez', gunler: [1, 4], ardindan: 'Akşam yemeğinden sonra' },

  { kod: 'on-sayfa', alanlar: ['ogrenme'], ikon: '📖', ad: 'Her gün 10 sayfa oku', alt: 'Kısa ama her gün', gunler: null, ardindan: 'Yatmadan önce' },
  { kod: 'ogretici-video', alanlar: ['ogrenme'], ikon: '🎧', ad: 'Yeni bir şey öğreten bir video izle', alt: 'Haftada bir', gunler: [5], ardindan: null },
  { kod: 'dil-on-dakika', alanlar: ['ogrenme'], ikon: '🗣️', ad: 'Günde 10 dakika yabancı dil', alt: 'Hafta içi', gunler: [1, 2, 3, 4, 5], ardindan: 'Sabah kahvesinden sonra' },
  { kod: 'birine-anlat', alanlar: ['ogrenme', 'sosyal'], ikon: '🧑‍🏫', ad: 'Öğrendiğin bir şeyi birine anlat', alt: 'Haftada bir', gunler: [0], ardindan: null },

  { kod: 'muzik-dinle', alanlar: ['keyif'], ikon: '🎵', ad: 'Sevdiğin müziği açıp yalnızca dinle', alt: 'Haftada üç kez', gunler: [1, 3, 5], ardindan: 'Akşam yemeğinden sonra' },
  { kod: 'hobi-saati', alanlar: ['keyif'], ikon: '🎨', ad: 'Hobine bir saat ayır', alt: 'Haftada bir', gunler: [6], ardindan: null },
  { kod: 'bitkiler', alanlar: ['keyif'], ikon: '🪴', ad: 'Bitkilerinle ilgilen', alt: 'Haftada iki kez', gunler: [2, 5], ardindan: 'Sabah kahvesinden sonra' },
  { kod: 'guldiren-sey', alanlar: ['keyif', 'zihin'], ikon: '😄', ad: 'Seni güldüren bir şey izle', alt: 'Haftada bir', gunler: [5], ardindan: 'Akşam yemeğinden sonra' },

  { kod: 'karsiliksiz-yardim', alanlar: ['anlam', 'sosyal'], ikon: '🤝', ad: 'Birine karşılıksız bir iyilik yap', alt: 'Haftada bir', gunler: [4], ardindan: null },
  { kod: 'gonullu-saat', alanlar: ['anlam', 'sosyal'], ikon: '🌍', ad: 'Bir gönüllü işe bir saat ayır', alt: 'Haftada bir', gunler: [6], ardindan: null },
  { kod: 'onem-verdiklerim', alanlar: ['anlam'], ikon: '🧭', ad: 'Senin için neyin önemli olduğunu birkaç satır yaz', alt: 'Haftada bir', gunler: [0], ardindan: 'Akşam yemeğinden sonra' },
  { kod: 'bildigini-ogret', alanlar: ['anlam', 'ogrenme'], ikon: '🌱', ad: 'Bildiğin bir şeyi birine öğret', alt: 'Haftada bir', gunler: [3], ardindan: null },
];

/** "Hayatında neyin biraz daha olmasını isterdin?" seçenekleri ve dokundukları hazır alanlar (öneri sırası için). */
export const ISTEKLER: [string, string[]][] = [
  ['Dinlenmek', ['uyku', 'zihin']],
  ['Sevdiklerimle vakit', ['sosyal']],
  ['Kendime zaman', ['keyif', 'zihin']],
  ['Hareket', ['hareket']],
  ['Yeni bir şey öğrenmek', ['ogrenme']],
  ['Bir işe yaramak', ['anlam']],
  ['Huzur', ['zihin', 'anlam']],
  ['Neşe', ['keyif', 'sosyal']],
];

export const ARDINDAN = ['Sabah kalkınca', 'Sabah kahvesinden sonra', 'Kahvaltıdan sonra', 'Öğle yemeğinden sonra', 'Akşam yemeğinden sonra', 'Yatmadan önce', 'Belli bir saatte'];

/** Alan sorusu: "Son zamanlarda … nasıl?" — hazır alanlarda özel cümle, kendi alanında genel. */
export const ALAN_SORUSU: Record<string, string> = {
  hareket: 'Son zamanlarda ne kadar hareket ediyorsun?',
  beslenme: 'Son zamanlarda beslenmen nasıl?',
  uyku: 'Son zamanlarda uykun nasıl?',
  zihin: 'Son zamanlarda içinden nasıl geçiyor, kafan ne kadar rahat?',
  sosyal: 'Sevdiklerinle bağın nasıl?',
  ogrenme: 'Yeni şeyler öğrenmeye vakit buluyor musun?',
  keyif: 'Sana keyif veren şeylere vakit ayırabiliyor musun?',
  anlam: 'Yaptıkların sana anlamlı geliyor mu?',
};

/** Haftalık bakışta odak alanı için soru (pazar akşamı Home kartı). */
export const HAFTA_SORUSU: Record<string, string> = {
  hareket: 'Bu hafta bedenin nasıldı, yeterince hareket edebildin mi?',
  beslenme: 'Bu hafta beslenmen nasıldı?',
  uyku: 'Bu hafta uykun nasıldı?',
  zihin: 'Bu hafta içinden nasıl geçti, kafan rahat mıydı?',
  sosyal: 'Bu hafta sevdiklerinle bağın nasıldı?',
  ogrenme: 'Bu hafta yeni bir şeyler öğrenebildin mi?',
  keyif: 'Bu hafta kendine keyif veren şeylere vakit ayırabildin mi?',
  anlam: 'Bu hafta yaptıkların sana anlamlı geldi mi?',
};

/** "Bu ne demek?" — her hazır alanın kişinin hayatında neye karşılık geldiği (Bak adımında açılan pencere). */
export const ALAN_ACIKLAMA: Record<string, { ne: string; neden: string; ornek: string[] }> = {
  hareket: {
    ne: 'Gün içinde bedenini kullanman: yürümek, esnemek, ev ve bahçe işi, spor.',
    neden: 'Düzenli hareket kalbi, kasları ve kemikleri korur; uykuyu ve ruh halini de iyileştirir. Az da olsa her hareket sayılır.',
    ornek: ['Yemekten sonra kısa bir yürüyüş', 'Asansör yerine merdiven', 'Torunla oyun oynamak'],
  },
  beslenme: {
    ne: 'Ne yediğin ve nasıl yediğin: öğünlerin düzeni, sebze ve meyve, su.',
    neden: 'Enerjini ve uzun vadede sağlığını etkiler. Yasak listesi değil, küçük iyileştirmeler önemli.',
    ornek: ['Her öğünle bir bardak su', 'Tabağın yarısı sebze', 'Atıştırmalık yerine meyve'],
  },
  uyku: {
    ne: 'Ne kadar ve ne kadar dinlendirici uyuduğun.',
    neden: 'İyi uyku hafızayı, ruh halini ve bedenin kendini onarmasını destekler. Düzenli saatler çoğu zaman uyku süresi kadar önemlidir.',
    ornek: ['Her gün aynı saatte kalkmak', 'Yatmadan önce ekranı kapatmak'],
  },
  zihin: {
    ne: 'İçinin nasıl olduğu: kaygı, stres, sakinlik, kendine iyi davranabilmek.',
    neden: 'Stresi fark edip ara vermek bedeni de rahatlatır. Nefes, kısa sessiz anlar ve duygularını yazmak işe yarar. Uzun süredir kendini kötü hissediyorsan bir uzmanla konuşmak iyi gelir.',
    ornek: ['Üç dakika yavaş nefes', 'Akşam iyi giden üç şeyi yazmak'],
  },
  sosyal: {
    ne: 'Ailen, arkadaşların, komşuların: derdini anlatabildiğin, birlikte vakit geçirdiğin insanlar.',
    neden: 'Güçlü bağlar sağlıklı ve uzun bir hayatla en çok ilişkilendirilen şeylerden biri. Yalnızlığın sağlığa etkisi küçümsenmeyecek kadar büyük.',
    ornek: ['Eski bir dostu aramak', 'Komşuya çaya uğramak', 'Bir arkadaşla yürüyüş'],
  },
  ogrenme: {
    ne: 'Merakını beslemek: okumak, yeni bir beceri, bir dil, bir kurs.',
    neden: 'Öğrenmek zihni canlı tutar ve kendine güveni artırır. Yaşı yoktur.',
    ornek: ['Her gün birkaç sayfa okumak', 'Yeni bir şey öğreten bir video'],
  },
  keyif: {
    ne: 'Sırf hoşuna gittiği için yaptığın şeyler: hobi, müzik, oyun, gülmek.',
    neden: 'Keyif vakti lüks değil; dinlenmeni ve hayattan tat almanı sağlar.',
    ornek: ['Sevdiğin müziği açıp dinlemek', 'Bitkilerle ilgilenmek', 'Hobine bir saat ayırmak'],
  },
  anlam: {
    ne: 'Yaptıklarının sana önemli gelmesi ve kendinden büyük bir şeye katkı: ailene destek olmak, gönüllülük, inancın, değerlerin, bir şey üretmek.',
    neden: 'Hayatının bir amacı olduğunu hissetmek zor zamanlarda dayanak olur. Herkes için başka bir şey ifade eder; senin için neyin önemli olduğu belirleyicidir.',
    ornek: ['Birine karşılıksız bir iyilik', 'Bildiğin bir şeyi birine öğretmek', 'Senin için önemli olanı birkaç satır yazmak'],
  },
};
