/* Malbuch Service Worker: speichert alle Dateien für die Offline-Nutzung. */
const CACHE = 'malbuch-v1.4.0';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/motifs.js',
  './js/motifs2.js',
  './js/motifs3.js',
  './motifs/tiere-baer.png',
  './motifs/feen-zaubermaedchen.png',
  './motifs/fantasie-drache.png',
  './motifs/natur-feengarten.png',
  './motifs/fahrzeuge-zug.png',
  './motifs/jahreszeiten-winter.png',
  './motifs/superhelden-heldin.png',
  './motifs/superhelden-held.png',
  './motifs/superhelden-katze.png',
  './motifs/einhoerner-regenbogen.png',
  './motifs/einhoerner-baby.png',
  './motifs/einhoerner-maedchen.png',
  './motifs/weltraum-astronaut.png',
  './motifs/weltraum-alien.png',
  './motifs/ballerina-maedchen.png',
  './motifs/ballerina-hase.png',
  './motifs/mandala-blume.png',
  './motifs/mandala-herz.png',
  './motifs/mandala-schmetterling.png',
  './motifs/mandala-stern.png',
  './motifs/mandala-ornament.png',
  './motifs/landschaft-bauernhof.png',
  './motifs/landschaft-strand.png',
  './motifs/landschaft-bergsee.png',
  './motifs/landschaft-wald.png',
  './motifs/landschaft-unterwasser.png',
  './js/import.js',
  './vendor/jspdf.umd.min.js',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/pdfjs/standard_fonts/FoxitDingbats.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixed.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerif.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  './vendor/pdfjs/standard_fonts/FoxitSymbol.pfb',
  './vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  './vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  './vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  './vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  './vendor/pdfjs/wasm/jbig2.wasm',
  './vendor/pdfjs/wasm/jbig2_nowasm_fallback.js',
  './vendor/pdfjs/wasm/openjpeg.wasm',
  './vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js',
  './vendor/pdfjs/wasm/qcms_bg.wasm',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
