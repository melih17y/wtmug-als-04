// ============================================================
//  Kamera Çevirmeni – app.js  (v6, nihai)
//  Pixel 7 / Android 14 uyumlu PWA
// ============================================================

// ---------- ⚙️ Yapılandırma ----------

// MyMemory'nin günlük ücretsiz limitini (5.000 karakter) 50.000'e
// çıkarmak için buraya kendi geçerli e-posta adresinizi girin.
// Boş bırakırsanız limit 5.000 karakterde kalır.
const MYMEMORY_EMAIL = ''; // örn: 'ornek@gmail.com'

// OCR öncesi görsellerin maksimum kenar uzunluğu (piksel)
const MAKS_GORSEL_BOYUT = 2000;

// ---------- DOM ----------
const kameraOnizleme  = document.getElementById('kameraOnizleme');
const fotoCanvas      = document.getElementById('fotoCanvas');
const kameraAcBtn     = document.getElementById('kameraAcBtn');
const fotoCekBtn      = document.getElementById('fotoCekBtn');
const kameraKapatBtn  = document.getElementById('kameraKapatBtn');
const galeriInput     = document.getElementById('galeriInput');
const metinGiris      = document.getElementById('metinGiris');
const metinCevirBtn   = document.getElementById('metinCevirBtn');
const kaynakDilSelect = document.getElementById('kaynakDil');
const hedefDilSelect  = document.getElementById('hedefDil');
const kameraAlani     = document.querySelector('.kamera-alani');

const sonucAlani      = document.getElementById('sonucAlani');
const okunanMetinEl   = document.getElementById('okunanMetin');
const cevrilenMetinEl = document.getElementById('cevrilenMetin');
const durumMesajiEl   = document.getElementById('durumMesaji');

// ---------- Durum ----------
let kameraAkisi     = null;
let tesseractWorker = null;
let francHazir      = false;
let francFn         = null;

// ---------- Yardımcılar ----------

function durumYaz(mesaj) {
  durumMesajiEl.textContent = mesaj;
  sonucAlani.hidden = false;
}

function sonucTemizle() {
  okunanMetinEl.textContent = '';
  cevrilenMetinEl.textContent = '';
  durumMesajiEl.textContent = '';
  sonucAlani.hidden = true;
}

function butonYukleniyor(btn, metin) {
  if (!btn.dataset.eskiMetin) btn.dataset.eskiMetin = btn.textContent;
  btn.textContent = metin;
  btn.disabled = true;
}

function butonNormaleDon(btn) {
  if (btn.dataset.eskiMetin) {
    btn.textContent = btn.dataset.eskiMetin;
    delete btn.dataset.eskiMetin;
  }
  btn.disabled = false;
}

// ---------- franc (ESM dinamik import) ----------

async function francYukle() {
  if (francHazir) return true;

  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/franc-min@6/+esm');
    const fn = mod.franc || mod.default || mod.francMin;
    if (typeof fn === 'function') {
      francFn = fn;
      francHazir = true;
      console.log('✅ franc ESM başarıyla yüklendi');
      return true;
    }
    console.warn('franc modülü yüklendi ancak fonksiyon export bulunamadı:', mod);
  } catch (e) {
    console.warn('franc ESM yüklenemedi:', e);
  }

  francHazir = false;
  return false;
}

const DIL_ESLEME = {
  tur: 'tr', eng: 'en', deu: 'de', fra: 'fr', spa: 'es',
  ita: 'it', por: 'pt', rus: 'ru', ara: 'ar', nld: 'nl',
  jpn: 'ja', kor: 'ko', chi: 'zh', cmn: 'zh', hin: 'hi'
};

async function kaynakDilAlgila(metin, gorselVar = false) {
  if (!metin || metin.length < 3) return 'en';

  if (francHazir && typeof francFn === 'function') {
    try {
      const iso3 = francFn(metin, { minLength: 3 });
      if (iso3 && iso3 !== 'und') {
        return DIL_ESLEME[iso3] || iso3.slice(0, 2);
      }
    } catch (e) {
      console.warn('franc algılama hatası:', e);
    }
  }

  if (gorselVar && fotoCanvas.width > 0) {
    try {
      const worker = await tesseractWorkerAl();
      const { data } = await worker.detect(fotoCanvas);
      const script = (data?.script || '').toLowerCase();

      const scriptDil = {
        latn: 'en', cyrl: 'ru', arab: 'ar', grek: 'el',
        hani: 'zh', jpan: 'ja', kore: 'ko', hebr: 'he',
        thai: 'th', deva: 'hi'
      };

      if (script && scriptDil[script]) {
        console.log(`Tesseract detect script: ${script} → dil: ${scriptDil[script]}`);
        return scriptDil[script];
      }
    } catch (e) {
      console.warn('Tesseract detect yedeği başarısız:', e);
    }
  }

  return 'en';
}

// ---------- OCR (Tesseract.js) ----------

async function tesseractWorkerAl() {
  if (tesseractWorker) return tesseractWorker;

  durumYaz('OCR motoru hazırlanıyor… (ilk seferde dil paketleri indirilir)');

  const diller = ['eng', 'tur', 'deu', 'fra', 'spa'];

  tesseractWorker = await Tesseract.createWorker(diller, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        durumYaz(`OCR: %${Math.round((m.progress || 0) * 100)}`);
      }
    }
  });

  return tesseractWorker;
}

async function ocrYap(kaynak) {
  const worker = await tesseractWorkerAl();
  const { data } = await worker.recognize(kaynak);
  return (data.text || '').trim();
}

// ---------- Çeviri (MyMemory) ----------

function myMemoryUyariKontrol(metin) {
  const u = metin.toUpperCase();
  if (u.includes('MYMEMORY WARNING')) {
    return 'MyMemory günlük ücretsiz kotası aşıldı. Lütfen yarın tekrar deneyin ya da app.js içindeki MYMEMORY_EMAIL sabitine kendi e-postanızı girin.';
  }
  if (u.includes('PLEASE SELECT TWO DISTINCT LANGUAGES')) {
    return 'Kaynak ve hedef dil aynı olamaz. Lütfen farklı bir hedef dil seçin.';
  }
  if (u.includes('QUERY LENGTH LIMIT')) {
    return 'Metin çok uzun. Lütfen daha kısa bir metin deneyin.';
  }
  if (u.includes('INVALID LANGUAGE')) {
    return 'Geçersiz dil kodu. Lütfen farklı bir dil seçin.';
  }
  return null;
}

async function cevir(metin, kaynakDil, hedefDil) {
  if (!metin.trim()) throw new Error('Çevrilecek metin boş.');
  if (kaynakDil === hedefDil) return metin;

  const parcalar = metin.match(/[\s\S]{1,400}/g) || [metin];
  const ceviriParcalari = [];

  for (const parca of parcalar) {
    const params = new URLSearchParams({
      q: parca,
      langpair: `${kaynakDil}|${hedefDil}`
    });
    if (MYMEMORY_EMAIL) params.set('de', MYMEMORY_EMAIL);

    const url = `https://api.mymemory.translated.net/get?${params}`;
    const cevap = await fetch(url);
    if (!cevap.ok) throw new Error(`MyMemory HTTP hatası: ${cevap.status}`);

    const json = await cevap.json();
    console.log('MyMemory yanıtı:', json);

    const translated = json?.responseData?.translatedText || '';
    const uyari = myMemoryUyariKontrol(translated);
    if (uyari) throw new Error(uyari);

    if (String(json.responseStatus) !== '200' && !translated) {
      throw new Error(json.responseDetails || `Çeviri hatası (status: ${json.responseStatus})`);
    }
    if (!translated) throw new Error('Çeviri servisi boş yanıt döndürdü.');

    ceviriParcalari.push(translated);

    if (parcalar.length > 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return ceviriParcalari.join(' ').trim();
}

// ---------- Ana iş akışı ----------

async function metniCevir(okunan, gorselVar = false) {
  okunanMetinEl.textContent = `Okunan metin: ${okunan}`;
  durumYaz('Dil algılanıyor…');

  let kaynakDil = kaynakDilSelect.value;

  if (kaynakDil === 'auto') {
    if (!francHazir) await francYukle();
    kaynakDil = await kaynakDilAlgila(okunan, gorselVar);
    durumYaz(`Algılanan dil: ${kaynakDil.toUpperCase()}`);
  }

  const hedefDil = hedefDilSelect.value;

  if (kaynakDil === hedefDil) {
    cevrilenMetinEl.textContent = okunan;
    durumYaz(`Metin zaten ${hedefDil.toUpperCase()} dilinde.`);
    return;
  }

  durumYaz(`Kaynak: ${kaynakDil.toUpperCase()} → Hedef: ${hedefDil.toUpperCase()} – Çevriliyor…`);
  const ceviri = await cevir(okunan, kaynakDil, hedefDil);
  cevrilenMetinEl.textContent = ceviri;
  durumYaz('✅ Çeviri tamamlandı.');
}

async function gorseldenCeviriYap(kaynak) {
  sonucTemizle();
  durumYaz('Metin okunuyor…');

  try {
    const okunan = await ocrYap(kaynak);
    if (!okunan) {
      durumYaz('Görselde okunabilir metin bulunamadı. Lütfen daha net bir görsel deneyin.');
      return;
    }
    await metniCevir(okunan, true);
  } catch (err) {
    console.error(err);
    durumYaz(`Hata: ${err.message}`);
  }
}

async function metindenCeviriYap() {
  const metin = metinGiris.value.trim();
  if (!metin) {
    durumYaz('Lütfen çevrilecek metni girin.');
    return;
  }

  sonucTemizle();
  butonYukleniyor(metinCevirBtn, '⏳ Çevriliyor…');

  try {
    await metniCevir(metin, false);
  } catch (err) {
    console.error(err);
    durumYaz(`Hata: ${err.message}`);
  } finally {
    butonNormaleDon(metinCevirBtn);
  }
}

// ---------- Kamera ----------

async function kamerayiAc() {
  if (!navigator.mediaDevices?.getUserMedia) {
    durumYaz('Kamera API bu tarayıcıda/ortamda desteklenmiyor. HTTPS gerekir.');
    return;
  }

  butonYukleniyor(kameraAcBtn, '⏳ Açılıyor…');
  try {
    kameraAkisi = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    kameraOnizleme.srcObject = kameraAkisi;
    kameraAlani.classList.add('aktif');       // ← ışık efekti aç
    fotoCekBtn.disabled = false;
    kameraKapatBtn.disabled = false;
    butonNormaleDon(kameraAcBtn);
    kameraAcBtn.disabled = true;
    durumYaz('Kamera açıldı. Fotoğraf çekmek için butona basın.');
  } catch (err) {
    console.error('Kamera hatası:', err);
    durumYaz('Kamera açılamadı. HTTPS ve kamera izni gerekli.');
    butonNormaleDon(kameraAcBtn);
  }
}

function kamerayiKapat() {
  if (kameraAkisi) {
    kameraAkisi.getTracks().forEach((t) => t.stop());
    kameraAkisi = null;
  }
  kameraOnizleme.srcObject = null;
  kameraAlani.classList.remove('aktif');      // ← ışık efektini kapat
  kameraAcBtn.disabled = false;
  fotoCekBtn.disabled = true;
  kameraKapatBtn.disabled = true;
  butonNormaleDon(kameraAcBtn);
}

async function fotografCek() {
  if (!kameraAkisi) return;

  const video = kameraOnizleme;
  const g = video.videoWidth;
  const y = video.videoHeight;

  if (!g || !y) {
    durumYaz('Kamera görüntüsü henüz hazır değil, lütfen bekleyin.');
    return;
  }

  const olcek = Math.min(1, MAKS_GORSEL_BOYUT / Math.max(g, y));
  fotoCanvas.width  = Math.round(g * olcek);
  fotoCanvas.height = Math.round(y * olcek);
  fotoCanvas.getContext('2d').drawImage(video, 0, 0, fotoCanvas.width, fotoCanvas.height);

  butonYukleniyor(fotoCekBtn, '⏳ İşleniyor…');
  try {
    await gorseldenCeviriYap(fotoCanvas);
  } finally {
    butonNormaleDon(fotoCekBtn);
  }
}

// ---------- Galeri ----------

galeriInput.addEventListener('change', async (e) => {
  const dosya = e.target.files?.[0];
  if (!dosya) return;

  sonucTemizle();
  durumYaz('Görsel yükleniyor…');

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(dosya);

    const olcek = Math.min(1, MAKS_GORSEL_BOYUT / Math.max(bitmap.width, bitmap.height));
    fotoCanvas.width  = Math.round(bitmap.width * olcek);
    fotoCanvas.height = Math.round(bitmap.height * olcek);
    fotoCanvas.getContext('2d').drawImage(bitmap, 0, 0, fotoCanvas.width, fotoCanvas.height);

    await gorseldenCeviriYap(fotoCanvas);
  } catch (err) {
    console.error(err);
    durumYaz('Görsel okunamadı. Lütfen geçerli bir görsel dosyası seçin.');
  } finally {
    if (bitmap) bitmap.close();
    e.target.value = '';
  }
});

// ---------- Olaylar ----------

kameraAcBtn.addEventListener('click', kamerayiAc);
kameraKapatBtn.addEventListener('click', kamerayiKapat);
fotoCekBtn.addEventListener('click', fotografCek);
metinCevirBtn.addEventListener('click', metindenCeviriYap);
window.addEventListener('pagehide', kamerayiKapat);

// ---------- Başlangıç ----------
francYukle().catch(() => {});

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service Worker kaydı başarısız:', err);
    });
  });
}