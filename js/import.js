/* Malbuch – eigene Vorlagen importieren (Bild oder PDF). Alles passiert lokal auf dem Gerät.
   PDF-Seiten werden mit dem mitgelieferten pdf.js (vendor/pdfjs) gerendert – kein CDN, kein Netzwerk. */
(function () {
  'use strict';
  const A = window.MalbuchApp;
  const { PW, PH } = A;
  const $ = (s) => document.querySelector(s);
  const fileInput = $('#fileInput'), canvas = $('#impCanvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const thrEl = $('#impThr'), thickEl = $('#impThick'), speckEl = $('#impSpeck'), nameEl = $('#impName');
  const SPECK = [0, 40, 160, 600]; // kleinste erlaubte Fleck-Größe in Pixeln

  const fitted = document.createElement('canvas'); fitted.width = PW; fitted.height = PH;
  const fctx = fitted.getContext('2d', { willReadFrequently: true });
  const out = document.createElement('canvas'); out.width = PW; out.height = PH;
  const octx = out.getContext('2d', { willReadFrequently: true });

  let src = null;        // Bild oder gerenderte PDF-Seite
  let rot = 0;           // 0..3 (x 90°)
  let lum = null;        // Helligkeit 0..255 je Pixel (nach Einpassen)
  let viewMode = 'lines';
  let pdf = null, pdfTask = null, pdfPage = 1;
  let job = 0;
  let imgRect = [0, 0, PW - 1, PH - 1]; // Bildbereich auf der Seite (Rest = weißer Rand)

  // ---------- Datei wählen ----------
  function pick() { fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; if (f) openFile(f); });

  async function openFile(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    nameEl.value = (file.name || 'Meine Vorlage').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40) || 'Meine Vorlage';
    if (pdfTask) { pdfTask.destroy().catch(() => {}); pdfTask = null; }
    pdf = null; pdfPage = 1; src = null; rot = 0; viewMode = 'lines'; syncView(); $('#impPages').classList.add('hidden');
    A.show('importer'); busy(true); hint('');
    try {
      if (isPdf) {
        const lib = await loadPdfjs();
        const data = new Uint8Array(await file.arrayBuffer());
        pdfTask = lib.getDocument({
          data, isEvalSupported: false, enableXfa: false, disableFontFace: false, useSystemFonts: false,
          standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', document.baseURI).href,
          wasmUrl: new URL('vendor/pdfjs/wasm/', document.baseURI).href
        });
        pdf = await pdfTask.promise;
        await showPdfPage(1);
      } else {
        src = await A.blobToImage(file);
        rot = src.naturalWidth > src.naturalHeight ? 1 : 0; // Querformat automatisch drehen
        prepare(true);
      }
    } catch (err) {
      console.warn('Import fehlgeschlagen', err);
      busy(false); A.show('home');
      const c = A.openModal(`<h2>😕 Datei konnte nicht geöffnet werden</h2><p>Bitte ein Bild (PNG, JPG, HEIC) oder eine PDF-Datei wählen.</p><div class="row"><button class="btn primary" data-a="ok">OK</button></div>`);
      c.querySelector('[data-a=ok]').onclick = A.closeModal;
    }
  }

  let pdfjsP = null;
  function loadPdfjs() {
    return pdfjsP || (pdfjsP = import('../vendor/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
      return lib;
    }));
  }
  async function showPdfPage(n) {
    busy(true);
    pdfPage = n; const page = await pdf.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2400 / Math.max(vp1.width, vp1.height), 6);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvas: c, viewport: vp, background: '#ffffff' }).promise;
    page.cleanup();
    src = c; src.naturalWidth = c.width; src.naturalHeight = c.height;
    rot = c.width > c.height ? 1 : 0;
    $('#impPages').classList.toggle('hidden', pdf.numPages < 2);
    $('#impPageLbl').textContent = `Seite ${n} / ${pdf.numPages}`;
    $('#impPrev').disabled = n <= 1; $('#impNext').disabled = n >= pdf.numPages;
    prepare(true);
  }

  // ---------- Einpassen und Helligkeit ----------
  function prepare(auto) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.fillStyle = '#fff'; fctx.fillRect(0, 0, PW, PH);
    const rw = rot % 2 ? h : w, rh = rot % 2 ? w : h;
    const s = Math.min(PW / rw, PH / rh);
    const iw = Math.round(rw * s), ih = Math.round(rh * s);
    imgRect = [Math.round((PW - iw) / 2), Math.round((PH - ih) / 2), Math.round((PW + iw) / 2) - 1, Math.round((PH + ih) / 2) - 1];
    fctx.translate(PW / 2, PH / 2); fctx.rotate(rot * Math.PI / 2);
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(src, -w * s / 2, -h * s / 2, w * s, h * s);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    const d = fctx.getImageData(0, 0, PW, PH).data;
    lum = new Uint8Array(PW * PH);
    for (let i = 0, k = 0; i < lum.length; i++, k += 4) lum[i] = (d[k] * 77 + d[k + 1] * 150 + d[k + 2] * 29) >> 8;
    if (auto) thrEl.value = autoThreshold();
    process();
  }
  // Otsu-Schwelle, etwas Richtung "hell" begrenzt, damit graue Flächen nicht zu Linien werden
  function autoThreshold() {
    const hist = new Float64Array(256); for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
    const N = lum.length; let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, bt = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
      sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2;
      if (v > best) { best = v; bt = t; }
    }
    return Math.max(60, Math.min(200, bt));
  }

  // ---------- Linien erkennen ----------
  function process() {
    if (!lum) return;
    const my = ++job;
    requestAnimationFrame(() => {
      if (my !== job) return;
      const thr = +thrEl.value, thick = +thickEl.value, minSize = SPECK[+speckEl.value];
      $('#impThrVal').textContent = thr; $('#impThickVal').textContent = thick; $('#impSpeckVal').textContent = ['aus', 'wenig', 'mittel', 'viel'][+speckEl.value];
      const N = PW * PH, SOFT = 28;
      let a = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const L = lum[i]; a[i] = L <= thr ? 255 : (L >= thr + SOFT ? 0 : ((thr + SOFT - L) * 255 / SOFT) | 0); }
      if (minSize) removeSpecks(a, minSize);
      extendEdges(a);
      if (thick) a = dilate(a, thick);
      const img = octx.createImageData(PW, PH), d = img.data; let cover = 0;
      for (let i = 0, k = 0; i < N; i++, k += 4) { d[k] = 17; d[k + 1] = 17; d[k + 2] = 17; d[k + 3] = a[i]; if (a[i] > 90) cover++; }
      octx.putImageData(img, 0, 0);
      const frac = cover / N;
      hint(frac > 0.3 ? '⚠️ Sehr viel Schwarz erkannt. Schwelle nach links schieben.' : frac < 0.003 ? '⚠️ Kaum Linien erkannt. Schwelle nach rechts schieben.' : 'Tipp: Lücken in den Linien schließen sich mit „Linien dicker machen“. So bleibt der Füll-Eimer in seiner Fläche.');
      draw(); busy(false);
      window.__lastImport = { thr, thick, minSize, cover: frac };
    });
  }
  function removeSpecks(a, minSize) {
    const W = PW, H = PH, N = W * H, seen = new Uint8Array(N), stack = new Int32Array(N), comp = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (seen[s] || a[s] <= 90) continue;
      let sp = 0, n = 0; stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const i = stack[--sp]; comp[n++] = i; const x = i % W;
        if (x > 0 && !seen[i - 1] && a[i - 1] > 90) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < W - 1 && !seen[i + 1] && a[i + 1] > 90) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (i >= W && !seen[i - W] && a[i - W] > 90) { seen[i - W] = 1; stack[sp++] = i - W; }
        if (i < N - W && !seen[i + W] && a[i + W] > 90) { seen[i + W] = 1; stack[sp++] = i + W; }
      }
      if (n < minSize) for (let k = 0; k < n; k++) a[comp[k]] = 0;
    }
    for (let i = 0; i < N; i++) if (a[i] && a[i] <= 90 && !nearSolid(a, i)) a[i] = 0; // Rest-Grau entfernen
  }
  // Linien, die am Bildrand enden, bis zum Seitenrand verlängern – sonst wären Flächen über den weißen Rand verbunden
  function extendEdges(a) {
    const [x0, y0, x1, y1] = imgRect, W = PW, MAXRUN = 40;
    const side = (len, at, fill) => { // läuft entlang einer Bildkante, verlängert kurze Linien-Stücke
      let k = 0;
      while (k < len) {
        if (a[at(k)] <= 90) { k++; continue; }
        let e = k; while (e < len && a[at(e)] > 90) e++;
        if (e - k <= MAXRUN) for (let j = Math.max(0, k - 1); j < Math.min(len, e + 1); j++) fill(j, a[at(j)]);
        k = e;
      }
    };
    if (x0 > 0) side(y1 - y0 + 1, (k) => (y0 + k) * W + x0, (k, v) => { const r = (y0 + k) * W; for (let x = 0; x < x0; x++) a[r + x] = Math.max(a[r + x], v); });
    if (x1 < W - 1) side(y1 - y0 + 1, (k) => (y0 + k) * W + x1, (k, v) => { const r = (y0 + k) * W; for (let x = x1 + 1; x < W; x++) a[r + x] = Math.max(a[r + x], v); });
    if (y0 > 0) side(x1 - x0 + 1, (k) => y0 * W + x0 + k, (k, v) => { for (let y = 0; y < y0; y++) a[y * W + x0 + k] = Math.max(a[y * W + x0 + k], v); });
    if (y1 < PH - 1) side(x1 - x0 + 1, (k) => y1 * W + x0 + k, (k, v) => { for (let y = y1 + 1; y < PH; y++) a[y * W + x0 + k] = Math.max(a[y * W + x0 + k], v); });
  }
  function nearSolid(a, i) { const W = PW; return a[i - 1] > 90 || a[i + 1] > 90 || a[i - W] > 90 || a[i + W] > 90 || a[i - 2] > 90 || a[i + 2] > 90 || a[i - 2 * W] > 90 || a[i + 2 * W] > 90; }
  function dilate(a, r) { // Maximum-Filter (rund genug durch zwei Durchgänge)
    const W = PW, H = PH, t = new Uint8Array(W * H), o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) { let m = 0; for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) if (a[row + k] > m) m = a[row + k]; t[row + x] = m; } }
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { let m = 0; for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) if (t[k * W + x] > m) m = t[k * W + x]; o[y * W + x] = m; }
    return o;
  }

  function draw() {
    ctx.clearRect(0, 0, PW, PH);
    if (viewMode === 'orig') ctx.drawImage(fitted, 0, 0);
    else ctx.drawImage(out, 0, 0);
  }
  function busy(on) { $('#impBusy').classList.toggle('hidden', !on); }
  function hint(t) { $('#impHint').textContent = t; }
  function syncView() { document.querySelectorAll('.impView button').forEach((b) => b.classList.toggle('sel', b.dataset.v === viewMode)); }

  // ---------- Bedienung ----------
  [thrEl, thickEl, speckEl].forEach((el) => el.addEventListener('input', process));
  document.querySelectorAll('.impView button').forEach((b) => b.onclick = () => { viewMode = b.dataset.v; syncView(); draw(); });
  $('#impRotate').onclick = () => { if (!src) return; rot = (rot + 1) % 4; prepare(false); };
  $('#impAuto').onclick = () => { if (!lum) return; thrEl.value = autoThreshold(); thickEl.value = 1; speckEl.value = 1; process(); };
  $('#impPrev').onclick = () => { if (pdf && pdfPage > 1) showPdfPage(pdfPage - 1); };
  $('#impNext').onclick = () => { if (pdf && pdfPage < pdf.numPages) showPdfPage(pdfPage + 1); };
  $('#impCancel').onclick = () => { cleanup(); A.backHome(); };
  $('#impSave').onclick = async () => {
    if (!lum) return;
    busy(true);
    try {
      const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const outline = await A.toBlob(out, 'image/png');
      const th = document.createElement('canvas'); th.width = 300; th.height = 400; const tx = th.getContext('2d');
      tx.fillStyle = '#fff'; tx.fillRect(0, 0, 300, 400); tx.drawImage(out, 0, 0, 300, 400);
      const thumb = await A.toBlob(th, 'image/jpeg', 0.85);
      await A.DB.tpl.put({ id, name: (nameEl.value || 'Meine Vorlage').trim().slice(0, 40), created: Date.now(), outline, thumb });
      cleanup(); await A.templateSaved(id); A.toast('Vorlage gespeichert');
    } catch (err) { console.warn('Vorlage speichern', err && (err.stack || err)); busy(false); A.toast('Speichern nicht möglich'); }
  };
  function cleanup() { busy(false); if (pdfTask) { pdfTask.destroy().catch(() => {}); pdfTask = null; } pdf = null; src = null; lum = null; ctx.clearRect(0, 0, PW, PH); }

  window.MalbuchImport = { pick, openFile };
})();
