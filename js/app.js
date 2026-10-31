/* Malbuch – Hauptlogik. Alles lokal: keine Netzwerkzugriffe, Daten in IndexedDB/localStorage. */
(function () {
  'use strict';
  const { categories, motifs, stamps } = window.MALBUCH_DATA;
  const PW = 1200, PH = 1600;            // Bildgröße in Pixeln (3:4)
  const MOTIF_SCALE = PW / 600;           // Motive sind in 600x800 gezeichnet
  const OUTLINE_WIDTH = 4;                // in Motiv-Einheiten (=8 px)
  const UNDO_BUDGET = 90 * 1024 * 1024;   // max. Speicher für Rückgängig
  const UNDO_MAX = 40;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const SWATCHES = ['#e53935', '#fb8c00', '#fdd835', '#7cb342', '#2e7d32', '#00acc1', '#64b5f6', '#1e3fae',
    '#8e24aa', '#f06292', '#8d6e63', '#ffcc99', '#5d4037', '#9e9e9e', '#212121', '#ffffff'];
  const SIZE_PRESETS = [6, 14, 30, 60];

  // ---------- Einstellungen ----------
  const defaults = { colorMode: 'simple', pencilOnly: false, pressure: true };
  let settings = Object.assign({}, defaults);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('malbuch.settings') || '{}')); } catch (e) { /* ignorieren */ }
  const saveSettings = () => { try { localStorage.setItem('malbuch.settings', JSON.stringify(settings)); } catch (e) { /* voll */ } };

  // ---------- IndexedDB ----------
  // Version 2: zusätzlich 'templates' für eigene, importierte Vorlagen
  const DB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('malbuch', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('pictures')) db.createObjectStore('pictures', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (store, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode); const st = t.objectStore(store);
        let out; const req = fn(st); if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    };
    const api = (store) => ({
      put: (rec) => tx(store, 'readwrite', (s) => s.put(rec)),
      get: (id) => tx(store, 'readonly', (s) => s.get(id)),
      all: () => tx(store, 'readonly', (s) => s.getAll()),
      del: (id) => tx(store, 'readwrite', (s) => s.delete(id)),
      clear: () => tx(store, 'readwrite', (s) => s.clear())
    });
    return Object.assign(api('pictures'), { tpl: api('templates') });
  })();
  // Eigene Vorlagen (nur lokal in IndexedDB); als "Motive" der Kategorie 'vorlagen'
  let templates = [];
  const tplMotif = (r) => ({ id: 'tpl:' + r.id, cat: 'vorlagen', name: r.name, tpl: r });
  async function loadTemplates() {
    try { templates = (await DB.tpl.all()).sort((a, b) => b.created - a.created).map(tplMotif); } catch (e) { console.warn(e); templates = []; }
  }
  const findMotif = (id) => (id && id.startsWith('tpl:') ? templates.find((t) => t.id === id) : motifs.find((x) => x.id === id)) || null;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Zustand ----------
  const state = {
    tool: 'brush', color: '#e53935', hsv: [0, 0.75, 0.9], opacity: 1, size: 14, stamp: 'stern',
    motif: null, pictureId: null, created: 0, dirty: false, category: 'tiere'
  };

  // ---------- Bildschirme ----------
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    if (id === 'editor') requestAnimationFrame(() => { measure(); fitView(); });
  }

  const motifSVG = (m) => `<svg viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg"><path d="${m.d.join('')}" fill="none" stroke="#222" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const stampSVG = (s, color) => `<svg viewBox="0 0 100 100">${s.parts.map(([d, shade]) => `<path d="${d}" fill="${shade ? shadeColor(color, shade) : color}" stroke="rgba(0,0,0,.35)" stroke-width="2"/>`).join('')}</svg>`;

  function renderCats() {
    const nav = $('#cats'); nav.innerHTML = '';
    for (const c of categories) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="ico">${c.icon}</span><span>${c.name}</span>`;
      b.setAttribute('aria-label', c.name); b.dataset.cat = c.id;
      b.classList.toggle('sel', c.id === state.category);
      b.onclick = () => { state.category = c.id; renderCats(); renderMotifs(); };
      nav.appendChild(b);
    }
  }
  function renderMotifs() {
    const g = $('#motifGrid'); g.innerHTML = ''; g.scrollTop = 0;
    if (state.category === 'frei') {
      const t = document.createElement('button'); t.className = 'tile';
      t.innerHTML = `<div class="blankIco">✏️</div><div class="name">Leeres Blatt</div>`;
      t.onclick = () => openNew(null); g.appendChild(t); return;
    }
    if (state.category === 'vorlagen') return renderTemplates(g);
    for (const m of motifs.filter((x) => x.cat === state.category)) {
      const t = document.createElement('button'); t.className = 'tile'; t.setAttribute('aria-label', m.name);
      t.innerHTML = (m.png ? `<img src="${m.png}" alt="" loading="lazy">` : motifSVG(m)) + `<div class="name">${m.name}</div>`;
      t.onclick = () => openNew(m); g.appendChild(t);
    }
  }

  function renderTemplates(g) {
    const add = document.createElement('button'); add.className = 'tile'; add.id = 'tplAdd'; add.setAttribute('aria-label', 'Vorlage importieren (Eltern)');
    add.innerHTML = `<div class="addIco">➕<small>Vorlage importieren</small></div><span class="lockBadge">🔒</span><div class="name">Neu</div>`;
    add.onclick = () => parentGate(() => window.MalbuchImport && window.MalbuchImport.pick());
    g.appendChild(add);
    for (const m of templates) {
      const t = document.createElement('div'); t.className = 'tile tpl';
      const open = document.createElement('button'); open.style.width = '100%'; open.setAttribute('aria-label', m.name);
      const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(m.tpl.thumb); img.onload = () => URL.revokeObjectURL(img.src);
      open.appendChild(img); open.onclick = () => openNew(m);
      const name = document.createElement('div'); name.className = 'name'; name.textContent = m.name;
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑️'; del.setAttribute('aria-label', 'Vorlage löschen (Eltern)');
      del.onclick = () => parentGate(() => confirmDialog('Diese Vorlage wirklich löschen?<br><small>Schon gemalte Bilder bleiben in „Meine Bilder“, aber ohne Linien.</small>', '🗑️ Löschen', async () => {
        await DB.tpl.del(m.tpl.id); await loadTemplates(); renderMotifs(); toast('Vorlage gelöscht');
      }));
      t.append(open, name, del); g.appendChild(t);
    }
  }

  // ---------- Leinwände ----------
  const paintC = $('#paint'), strokeC = $('#strokeLayer'), outlineC = $('#outline');
  [paintC, strokeC, outlineC].forEach((c) => { c.width = PW; c.height = PH; });
  const stage = $('#stage'); stage.style.width = PW + 'px'; stage.style.height = PH + 'px';
  const pctx = paintC.getContext('2d', { willReadFrequently: true });
  const sctx = strokeC.getContext('2d');
  const octx = outlineC.getContext('2d', { willReadFrequently: true });
  const beforeC = document.createElement('canvas'); beforeC.width = PW; beforeC.height = PH;
  const bctx = beforeC.getContext('2d');
  let barrier = null; // Uint8Array: 1 = Konturpixel (Grenze für den Füll-Eimer)

  const urlImgs = new Map();
  function urlToImage(u) {
    if (!urlImgs.has(u)) urlImgs.set(u, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => { urlImgs.delete(u); rej(new Error('Bild ' + u)); }; i.src = u; }));
    return urlImgs.get(u);
  }
  async function drawOutline(m) {
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, PW, PH);
    barrier = null;
    if (!m) return;
    if (m.tpl) { // importierte Vorlage: fertige, transparente Linien-Ebene
      try { const img = await blobToImage(m.tpl.outline); octx.drawImage(img, 0, 0, PW, PH); } catch (e) { console.warn('Vorlage nicht lesbar', e); return; }
    } else if (m.png) { // detailreiches Bild-Motiv: fertige, transparente Linien-Ebene
      try { const img = await urlToImage(m.png); octx.drawImage(img, 0, 0, PW, PH); } catch (e) { console.warn('Motiv nicht ladbar', e); return; }
    } else {
      octx.setTransform(MOTIF_SCALE, 0, 0, MOTIF_SCALE, 0, 0);
      octx.lineWidth = OUTLINE_WIDTH; octx.lineCap = 'round'; octx.lineJoin = 'round'; octx.strokeStyle = '#111';
      for (const d of m.d) octx.stroke(new Path2D(d));
      octx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const a = octx.getImageData(0, 0, PW, PH).data;
    barrier = new Uint8Array(PW * PH);
    for (let i = 0, j = 3; i < barrier.length; i++, j += 4) barrier[i] = a[j] > 90 ? 1 : (a[j] > 0 ? 2 : 0); // 2 = Kantenpixel
  }

  // ---------- Ansicht: Zoom / Drehen ----------
  const viewport = $('#viewport');
  let vrect = { left: 0, top: 0, width: 1, height: 1 };
  let view = new DOMMatrix();
  let viewFitted = true; // true = Kind hat nicht gezoomt -> bei Größenänderung neu einpassen
  function measure() { const r = viewport.getBoundingClientRect(); vrect = { left: r.left, top: r.top, width: r.width, height: r.height }; }
  function applyView() { stage.style.transform = view.toString(); }
  function fitView() {
    const s = Math.min(vrect.width / PW, vrect.height / PH) * 0.94;
    view = new DOMMatrix([s, 0, 0, s, (vrect.width - PW * s) / 2, (vrect.height - PH * s) / 2]);
    viewFitted = true; applyView();
  }
  const toPage = (cx, cy) => {
    const p = view.inverse().transformPoint(new DOMPoint(cx - vrect.left, cy - vrect.top));
    return [p.x, p.y];
  };
  const viewScale = () => Math.hypot(view.a, view.b);
  window.addEventListener('resize', () => { measure(); fitView(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!vrect.width || !viewport.offsetWidth) return; measure(); if (viewFitted) fitView(); }).observe(viewport);
  window.addEventListener('orientationchange', () => setTimeout(() => { measure(); fitView(); }, 300));

  // ---------- Werkzeuge ----------
  const patternCache = new Map();
  function crayonPattern(color) {
    if (patternCache.has(color)) return patternCache.get(color);
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'); const id = x.createImageData(96, 96);
    const [r, g, b] = hexToRgb(color);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 96 * 96; i++) {
      const v = rnd(); const k = i * 4;
      id.data[k] = r; id.data[k + 1] = g; id.data[k + 2] = b;
      id.data[k + 3] = v < 0.28 ? 0 : (v < 0.42 ? 140 : 255);
    }
    x.putImageData(id, 0, 0);
    const p = sctx.createPattern(c, 'repeat');
    if (patternCache.size > 40) patternCache.clear();
    patternCache.set(color, p); return p;
  }
  let brushTip = null, brushTipKey = '';
  function getBrushTip(color) {
    if (brushTipKey === color && brushTip) return brushTip;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const [r, g, b] = hexToRgb(color);
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${r},${g},${b},0.55)`); gr.addColorStop(0.55, `rgba(${r},${g},${b},0.35)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    brushTip = c; brushTipKey = color; return c;
  }

  let stroke = null;   // laufender Strich
  let pending = null;  // Tipp-Werkzeug (Füllen/Stempel) wartet auf Loslassen

  function radiusFor(pressure, isPen) {
    let base = state.size / 2;
    if (state.tool === 'eraser') base *= 1.6;
    if (state.tool === 'brush') base *= 1.3;
    if (isPen && settings.pressure && pressure > 0) base *= 0.35 + 1.3 * Math.min(1, pressure);
    return Math.max(1, base);
  }
  function grow(bb, x, y, r) {
    bb[0] = Math.min(bb[0], x - r); bb[1] = Math.min(bb[1], y - r); bb[2] = Math.max(bb[2], x + r); bb[3] = Math.max(bb[3], y + r);
  }

  function beginStroke(pt, pressure, isPen, pointerId, ptype) {
    const tool = state.tool;
    stroke = { tool, pointerId, ptype, last: pt, lastMid: pt, lastR: radiusFor(pressure, isPen), bb: [Infinity, Infinity, -Infinity, -Infinity], dist: 0 };
    if (tool === 'eraser') {
      bctx.globalCompositeOperation = 'copy'; bctx.drawImage(paintC, 0, 0); bctx.globalCompositeOperation = 'source-over';
    } else {
      strokeC.style.opacity = String(state.opacity);
      sctx.clearRect(0, 0, PW, PH);
    }
    dab(pt, stroke.lastR);
  }
  function ctxFor() { return stroke.tool === 'eraser' ? pctx : sctx; }
  function dab(pt, r) {
    const ctx = ctxFor();
    grow(stroke.bb, pt[0], pt[1], r + 2);
    if (stroke.tool === 'brush') {
      const tip = getBrushTip(state.color); ctx.drawImage(tip, pt[0] - r, pt[1] - r, 2 * r, 2 * r);
    } else {
      ctx.save();
      if (stroke.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = stroke.tool === 'crayon' ? crayonPattern(state.color) : (stroke.tool === 'eraser' ? '#000' : state.color);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  function moveStroke(pt, pressure, isPen) {
    const s = stroke; const r = radiusFor(pressure, isPen);
    const dx = pt[0] - s.last[0], dy = pt[1] - s.last[1]; const d = Math.hypot(dx, dy);
    if (d < 0.8) return;
    s.dist += d;
    if (s.tool === 'brush') {
      const step = Math.max(1, r * 0.22); const n = Math.ceil(d / step);
      for (let i = 1; i <= n; i++) {
        const t = i / n; const rr = s.lastR + (r - s.lastR) * t;
        dab([s.last[0] + dx * t, s.last[1] + dy * t], rr);
      }
    } else {
      const ctx = ctxFor(); const mid = [(s.last[0] + pt[0]) / 2, (s.last[1] + pt[1]) / 2];
      ctx.save();
      if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = s.tool === 'crayon' ? crayonPattern(state.color) : (s.tool === 'eraser' ? '#000' : state.color);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = (s.lastR + r);
      ctx.beginPath(); ctx.moveTo(s.lastMid[0], s.lastMid[1]); ctx.quadraticCurveTo(s.last[0], s.last[1], mid[0], mid[1]); ctx.stroke();
      ctx.restore();
      grow(s.bb, s.last[0], s.last[1], r + 3); grow(s.bb, pt[0], pt[1], r + 3);
      s.lastMid = mid;
    }
    s.last = pt; s.lastR = r;
  }
  function clampBB(bb) {
    const x = Math.max(0, Math.floor(bb[0])), y = Math.max(0, Math.floor(bb[1]));
    const x2 = Math.min(PW, Math.ceil(bb[2])), y2 = Math.min(PH, Math.ceil(bb[3]));
    return x2 > x && y2 > y ? [x, y, x2 - x, y2 - y] : null;
  }
  function endStroke() {
    const s = stroke; stroke = null; if (!s) return;
    if (s.tool !== 'brush' && (s.lastMid[0] !== s.last[0] || s.lastMid[1] !== s.last[1])) { // letztes Stück bis zum Endpunkt
      const ctx = s.tool === 'eraser' ? pctx : sctx;
      ctx.save(); if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = s.tool === 'crayon' ? crayonPattern(state.color) : (s.tool === 'eraser' ? '#000' : state.color);
      ctx.lineCap = 'round'; ctx.lineWidth = 2 * s.lastR;
      ctx.beginPath(); ctx.moveTo(s.lastMid[0], s.lastMid[1]); ctx.lineTo(s.last[0], s.last[1]); ctx.stroke(); ctx.restore();
    }
    const box = clampBB(s.bb);
    if (s.tool === 'eraser') {
      if (box) pushUndo(box, bctx.getImageData(...box), pctx.getImageData(...box));
    } else {
      if (box) {
        const before = pctx.getImageData(...box);
        pctx.save(); pctx.globalAlpha = state.opacity; pctx.drawImage(strokeC, 0, 0); pctx.restore();
        pushUndo(box, before, pctx.getImageData(...box));
      }
      sctx.clearRect(0, 0, PW, PH);
    }
    changed();
  }
  function cancelStroke() {
    const s = stroke; stroke = null; if (!s) return;
    if (s.tool === 'eraser') { pctx.save(); pctx.globalCompositeOperation = 'copy'; pctx.drawImage(beforeC, 0, 0); pctx.restore(); }
    else sctx.clearRect(0, 0, PW, PH);
  }

  function placeStamp(pt) {
    const st = stamps.find((s) => s.id === state.stamp) || stamps[0];
    const size = Math.max(50, Math.min(420, state.size * 5 + 40));
    const x0 = pt[0] - size / 2, y0 = pt[1] - size / 2;
    const box = clampBB([x0 - 2, y0 - 2, x0 + size + 2, y0 + size + 2]); if (!box) return;
    const before = pctx.getImageData(...box);
    pctx.save(); pctx.globalAlpha = state.opacity; pctx.translate(x0, y0); pctx.scale(size / 100, size / 100);
    for (const [d, shade] of st.parts) { pctx.fillStyle = shade ? shadeColor(state.color, shade) : state.color; pctx.fill(new Path2D(d)); }
    pctx.restore();
    pushUndo(box, before, pctx.getImageData(...box));
    changed();
  }

  // Füll-Eimer: Grenze ist die Kontur (bei Motiven) bzw. die Farbe (beim leeren Blatt)
  function floodFill(pt) {
    const x0 = Math.floor(pt[0]), y0 = Math.floor(pt[1]);
    if (x0 < 0 || y0 < 0 || x0 >= PW || y0 >= PH) return false;
    const W = PW, H = PH, N = W * H;
    const img = pctx.getImageData(0, 0, W, H); const d = img.data;
    const mask = new Uint8Array(N);
    let canFill;
    if (barrier) {
      let seed = y0 * W + x0;
      if (barrier[seed] === 1) { // auf die Linie getippt: nächstes freies Pixel suchen
        seed = -1;
        for (let r = 1; r < 14 && seed < 0; r++) for (let dy = -r; dy <= r && seed < 0; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H && !barrier[y * W + x]) { seed = y * W + x; break; }
        }
        if (seed < 0) return false;
      }
      const b = barrier; canFill = (i) => b[i] !== 1;
      return finishFill(seed, canFill, img, mask);
    }
    const comp = (k) => { const a = d[k + 3] / 255; return [d[k] * a + 255 * (1 - a), d[k + 1] * a + 255 * (1 - a), d[k + 2] * a + 255 * (1 - a)]; };
    const s0 = comp((y0 * W + x0) * 4);
    canFill = (i) => { const c = comp(i * 4); return Math.abs(c[0] - s0[0]) + Math.abs(c[1] - s0[1]) + Math.abs(c[2] - s0[2]) < 110; };
    return finishFill(y0 * W + x0, canFill, img, mask);
  }
  function finishFill(seed, canFill, img, mask) {
    const W = PW, H = PH, d = img.data;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    const stack = [seed]; mask[seed] = 1;
    while (stack.length) {
      const i = stack.pop(); const y = (i / W) | 0; let x = i - y * W;
      let l = x; while (l > 0 && !mask[y * W + l - 1] && canFill(y * W + l - 1)) l--;
      let r = x; while (r < W - 1 && !mask[y * W + r + 1] && canFill(y * W + r + 1)) r++;
      for (let k = l; k <= r; k++) mask[y * W + k] = 1;
      if (l < minX) minX = l; if (r > maxX) maxX = r; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= H) continue;
        let inRun = false;
        for (let k = l; k <= r; k++) {
          const j = ny * W + k;
          if (!mask[j] && canFill(j)) { if (!inRun) { stack.push(j); mask[j] = 1; inRun = true; } } else inRun = false;
        }
      }
    }
    // Unter die Kontur hinein erweitern, damit keine weißen Ränder bleiben
    if (barrier) {
      for (let pass = 0; pass < 3; pass++) {
        const add = [];
        for (let y = Math.max(1, minY - 1); y <= Math.min(H - 2, maxY + 1); y++) for (let x = Math.max(1, minX - 1); x <= Math.min(W - 2, maxX + 1); x++) {
          const i = y * W + x; if (mask[i] || !barrier[i]) continue;
          if (mask[i - 1] === 1 || mask[i + 1] === 1 || mask[i - W] === 1 || mask[i + W] === 1) add.push(i);
        }
        for (const i of add) mask[i] = 2;
        for (const i of add) mask[i] = 1;
        minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1); maxX = Math.min(W - 1, maxX + 1); maxY = Math.min(H - 1, maxY + 1);
      }
    }
    const box = [minX, minY, maxX - minX + 1, maxY - minY + 1];
    const before = pctx.getImageData(...box);
    const [r, g, b] = hexToRgb(state.color); const a = Math.round(255 * state.opacity);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const i = y * W + x; if (!mask[i]) continue; const k = i * 4;
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a;
    }
    pctx.putImageData(img, 0, 0, minX, minY, box[2], box[3]);
    pushUndo(box, before, pctx.getImageData(...box));
    changed();
    return true;
  }

  // ---------- Rückgängig / Wiederholen ----------
  let undoStack = [], redoStack = [], undoBytes = 0;
  function pushUndo(box, before, after) {
    const bytes = box[2] * box[3] * 8;
    undoStack.push({ x: box[0], y: box[1], before, after, bytes }); undoBytes += bytes;
    redoStack = [];
    while (undoStack.length > 1 && (undoBytes > UNDO_BUDGET || undoStack.length > UNDO_MAX)) undoBytes -= undoStack.shift().bytes;
    updateUndoButtons();
  }
  function undo() {
    if (stroke) cancelStroke();
    const e = undoStack.pop(); if (!e) return; undoBytes -= e.bytes;
    pctx.putImageData(e.before, e.x, e.y); redoStack.push(e); updateUndoButtons(); changed();
  }
  function redo() {
    const e = redoStack.pop(); if (!e) return;
    pctx.putImageData(e.after, e.x, e.y); undoStack.push(e); undoBytes += e.bytes; updateUndoButtons(); changed();
  }
  function resetHistory() { undoStack = []; redoStack = []; undoBytes = 0; updateUndoButtons(); }
  function updateUndoButtons() { $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length; }

  // ---------- Eingabe: Pointer Events ----------
  const pointers = new Map(); // nur Finger (touch)
  let gesture = null;       // {ids, m0, p0a, p0b}
  let gestureLock = false;  // bis alle Finger weg sind wird nicht gemalt
  let penSeen = false;
  const local = (e) => [e.clientX - vrect.left, e.clientY - vrect.top];

  function startGesture() {
    const ids = Array.from(pointers.keys()).slice(0, 2);
    gesture = { ids, m0: DOMMatrix.fromMatrix(view), a: pointers.get(ids[0]).slice(), b: pointers.get(ids[1]).slice() };
    gestureLock = true; pending = null;
  }
  function updateGesture() {
    const a = pointers.get(gesture.ids[0]), b = pointers.get(gesture.ids[1]); if (!a || !b) return;
    const a0 = gesture.a, b0 = gesture.b;
    const mid0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1, d1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let k = d1 / d0;
    const s0 = Math.hypot(gesture.m0.a, gesture.m0.b);
    k = Math.min(Math.max(k, 0.25 / s0), 8 / s0);
    let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0])) * 180 / Math.PI;
    // sanft an 0/90/180/270 Grad einrasten
    const cur = Math.atan2(gesture.m0.b, gesture.m0.a) * 180 / Math.PI + ang;
    const snap = Math.round(cur / 90) * 90; if (Math.abs(cur - snap) < 4) ang += snap - cur;
    view = new DOMMatrix().translate(mid[0], mid[1]).rotate(ang).scale(k).translate(-mid0[0], -mid0[1]).multiply(gesture.m0);
    viewFitted = false; applyView();
  }

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pop')) return;
    e.preventDefault(); closeStampPop();
    measure();
    try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    const isPen = e.pointerType === 'pen';
    if (isPen) penSeen = true;
    if (e.pointerType === 'touch') {
      pointers.set(e.pointerId, local(e));
      if (pointers.size >= 2) {
        if (stroke && stroke.ptype === 'touch') cancelStroke();
        if (!gesture) startGesture();
        return;
      }
      if (gestureLock) return;
      if (settings.pencilOnly && penSeen) return; // Handballen / Finger malen nicht
    } else if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (stroke) return;
    const pt = toPage(e.clientX, e.clientY);
    if (state.tool === 'fill' || state.tool === 'stamp') { pending = { id: e.pointerId, pt, sx: e.clientX, sy: e.clientY }; return; }
    beginStroke(pt, e.pressure, isPen, e.pointerId, e.pointerType);
  }, { passive: false });

  viewport.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, local(e));
      if (gesture) { updateGesture(); return; }
    }
    if (pending && pending.id === e.pointerId && Math.hypot(e.clientX - pending.sx, e.clientY - pending.sy) > 40) pending = null;
    if (!stroke || stroke.pointerId !== e.pointerId) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const list = evs && evs.length ? evs : [e];
    for (const ev of list) moveStroke(toPage(ev.clientX, ev.clientY), ev.pressure, e.pointerType === 'pen');
  }, { passive: false });

  function pointerEnd(e, cancelled) {
    if (e.pointerType === 'touch') {
      pointers.delete(e.pointerId);
      if (gesture && gesture.ids.includes(e.pointerId)) {
        gesture = null;
        if (pointers.size >= 2) startGesture();
      }
      if (pointers.size === 0) gestureLock = false;
    }
    if (pending && pending.id === e.pointerId) {
      const p = pending; pending = null;
      if (!cancelled) {
        if (state.tool === 'fill') floodFill(p.pt); else placeStamp(p.pt);
      }
    }
    if (stroke && stroke.pointerId === e.pointerId) { if (cancelled) cancelStroke(); else endStroke(); }
  }
  viewport.addEventListener('pointerup', (e) => pointerEnd(e, false));
  viewport.addEventListener('pointercancel', (e) => pointerEnd(e, true));
  viewport.addEventListener('wheel', (e) => { // Maus/Trackpad (zum Testen am Computer)
    e.preventDefault(); measure();
    const p = local(e); const k = Math.exp(-e.deltaY * 0.002);
    const s = viewScale(); const kk = Math.min(Math.max(k, 0.25 / s), 8 / s);
    view = new DOMMatrix().translate(p[0], p[1]).scale(kk).translate(-p[0], -p[1]).multiply(view); viewFitted = false; applyView();
  }, { passive: false });

  // Seite darf nicht scrollen/zoomen, keine Lupen/Kontextmenüs
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll,.cats,.card')) e.preventDefault(); }, { passive: false });
  viewport.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('selectstart', (e) => e.preventDefault());

  // ---------- Farben ----------
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }
  function hsvToRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  }
  function shadeColor(hex, amt) { const [r, g, b] = hexToRgb(hex); const t = amt < 0 ? 0 : 255, p = Math.abs(amt); return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p); }

  function setColor(hex, fromWheel) {
    state.color = hex;
    if (!fromWheel) state.hsv = rgbToHsv(...hexToRgb(hex));
    updateColorUI();
  }
  function setSize(v) { state.size = v; updateColorUI(); }

  function buildColorUI() {
    const sw = $('#swatches'); sw.innerHTML = '';
    for (const c of SWATCHES) {
      const b = document.createElement('button'); b.style.background = c; b.dataset.color = c; b.setAttribute('aria-label', 'Farbe');
      b.onclick = () => { setColor(c); state.opacity = 1; updateColorUI(); };
      sw.appendChild(b);
    }
    const sz = $('#sizePresets'); sz.innerHTML = '';
    SIZE_PRESETS.forEach((v, i) => {
      const b = document.createElement('button'); b.dataset.size = v; b.setAttribute('aria-label', 'Größe ' + (i + 1));
      const px = [8, 16, 26, 38][i]; b.innerHTML = `<i style="width:${px}px;height:${px}px"></i>`;
      b.onclick = () => setSize(v); sz.appendChild(b);
    });
    $$('.modeSwitch button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    drawWheel();
    const wheel = $('#wheel');
    const pick = (e) => {
      const r = wheel.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy; const rad = r.width / 2;
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; const s = Math.min(1, Math.hypot(dx, dy) / rad);
      state.hsv = [h, s, state.hsv[2] || 1]; if (state.hsv[2] < 0.05) state.hsv[2] = 1;
      setColor(rgbToHex(...hsvToRgb(...state.hsv)), true);
    };
    let picking = false;
    wheel.addEventListener('pointerdown', (e) => { e.preventDefault(); picking = true; try { wheel.setPointerCapture(e.pointerId); } catch (er) { /* */ } pick(e); });
    wheel.addEventListener('pointermove', (e) => { if (picking) pick(e); });
    wheel.addEventListener('pointerup', () => { picking = false; });
    wheel.addEventListener('pointercancel', () => { picking = false; });
    $('#slBright').addEventListener('input', (e) => { state.hsv[2] = e.target.value / 100; setColor(rgbToHex(...hsvToRgb(...state.hsv)), true); });
    $('#slAlpha').addEventListener('input', (e) => { state.opacity = e.target.value / 100; updateColorUI(); });
    $('#slSize').addEventListener('input', (e) => setSize(+e.target.value));
  }
  function drawWheel() {
    const c = $('#wheel'), x = c.getContext('2d'), n = c.width, r = n / 2, id = x.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
      const dx = xx - r, dy = y - r, dist = Math.hypot(dx, dy); if (dist > r) continue;
      const [cr, cg, cb] = hsvToRgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, dist / r, 1);
      const k = (y * n + xx) * 4; id.data[k] = cr; id.data[k + 1] = cg; id.data[k + 2] = cb; id.data[k + 3] = dist > r - 1 ? 128 : 255;
    }
    x.putImageData(id, 0, 0);
  }
  function setMode(m) { settings.colorMode = m; saveSettings(); updateColorUI(); requestAnimationFrame(() => { measure(); }); }
  function updateColorUI() {
    const adv = settings.colorMode === 'advanced';
    $('#simplePanel').classList.toggle('hidden', adv); $('#advPanel').classList.toggle('hidden', !adv);
    $$('.modeSwitch button').forEach((b) => b.classList.toggle('sel', b.dataset.mode === settings.colorMode));
    $$('#swatches button').forEach((b) => b.classList.toggle('sel', b.dataset.color === state.color));
    let best = SIZE_PRESETS[0]; for (const v of SIZE_PRESETS) if (Math.abs(v - state.size) < Math.abs(best - state.size)) best = v;
    $$('#sizePresets button').forEach((b) => b.classList.toggle('sel', +b.dataset.size === best));
    $('#slBright').value = Math.round(state.hsv[2] * 100);
    $('#slBright').style.background = `linear-gradient(90deg,#000,${rgbToHex(...hsvToRgb(state.hsv[0], state.hsv[1], 1))})`;
    $('#slAlpha').value = Math.round(state.opacity * 100);
    $('#slAlpha').style.background = `linear-gradient(90deg,transparent,${state.color}),repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/14px 14px`;
    $('#slSize').value = state.size;
    const knob = $('#wheelKnob'); const ang = state.hsv[0] * Math.PI / 180, rr = state.hsv[1] * 50;
    knob.style.left = (50 + rr * Math.cos(ang)) + '%'; knob.style.top = (50 + rr * Math.sin(ang)) + '%'; knob.style.background = state.color;
    const pd = $('#previewDot'); const px = Math.max(6, Math.min(66, state.size * 0.9));
    pd.style.width = pd.style.height = px + 'px'; pd.style.background = state.color; pd.style.opacity = state.opacity;
    pd.style.boxShadow = state.color.toLowerCase() === '#ffffff' ? '0 0 0 2px #ccc' : 'none';
    $('#stampIco').innerHTML = stampSVG(stamps.find((s) => s.id === state.stamp), state.color);
    brushTipKey = '';
  }

  // ---------- Werkzeugleiste & Stempel ----------
  function setTool(t) {
    state.tool = t;
    $$('#tools button').forEach((b) => b.classList.toggle('sel', b.dataset.tool === t));
  }
  $$('#tools button').forEach((b) => {
    b.onclick = () => {
      const was = state.tool; setTool(b.dataset.tool);
      if (b.dataset.tool === 'stamp' && (was === 'stamp' || $('#stampPop').classList.contains('hidden'))) openStampPop(); else closeStampPop();
    };
  });
  function openStampPop() {
    const p = $('#stampPop'); p.innerHTML = '';
    for (const s of stamps) {
      const b = document.createElement('button'); b.innerHTML = stampSVG(s, state.color); b.setAttribute('aria-label', s.name);
      b.classList.toggle('sel', s.id === state.stamp);
      b.onclick = (e) => { e.stopPropagation(); state.stamp = s.id; updateColorUI(); closeStampPop(); };
      p.appendChild(b);
    }
    p.classList.remove('hidden');
  }
  function closeStampPop() { $('#stampPop').classList.add('hidden'); }

  // ---------- Bilder öffnen / speichern ----------
  async function openNew(m) {
    state.motif = m; state.pictureId = null; state.created = Date.now(); state.dirty = false;
    pctx.clearRect(0, 0, PW, PH); sctx.clearRect(0, 0, PW, PH);
    await drawOutline(m); resetHistory();
    show('editor');
  }
  async function openPicture(id) {
    const rec = await DB.get(id); if (!rec) return;
    const m = findMotif(rec.motifId);
    state.motif = m; state.pictureId = rec.id; state.created = rec.created; state.dirty = false;
    pctx.clearRect(0, 0, PW, PH); sctx.clearRect(0, 0, PW, PH);
    await drawOutline(m); resetHistory();
    if (rec.paint) {
      const img = await blobToImage(rec.paint);
      pctx.drawImage(img, 0, 0, PW, PH);
    }
    show('editor');
  }
  function blobToImage(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob); const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
      im.src = url;
    });
  }
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
  function composite(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.drawImage(paintC, 0, 0, w, h); x.drawImage(outlineC, 0, 0, w, h); return c;
  }

  let saveTimer = 0, saving = null;
  function changed() { state.dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); }
  async function save() {
    clearTimeout(saveTimer);
    if (!state.dirty) return saving;
    if (saving) await saving;
    state.dirty = false;
    saving = (async () => {
      try {
        if (!state.pictureId) state.pictureId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const paint = await toBlob(paintC, 'image/png');
        const thumb = await toBlob(composite(300, 400), 'image/jpeg', 0.85);
        await DB.put({ id: state.pictureId, motifId: state.motif ? state.motif.id : null, created: state.created || Date.now(), updated: Date.now(), paint, thumb });
      } catch (err) { console.warn('Speichern fehlgeschlagen', err); state.dirty = true; }
    })();
    await saving; saving = null;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', () => { save(); });

  async function renderGallery() {
    const g = $('#galleryGrid'); g.innerHTML = '';
    let recs = [];
    try { recs = await DB.all(); } catch (e) { console.warn(e); }
    recs.sort((a, b) => b.updated - a.updated);
    $('#galleryEmpty').classList.toggle('hidden', recs.length > 0);
    g.classList.toggle('hidden', recs.length === 0);
    for (const r of recs) {
      const t = document.createElement('div'); t.className = 'tile';
      const m = findMotif(r.motifId);
      const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(r.thumb);
      img.onload = () => URL.revokeObjectURL(img.src);
      const open = document.createElement('button'); open.style.width = '100%'; open.appendChild(img);
      open.setAttribute('aria-label', 'Weitermalen'); open.onclick = () => openPicture(r.id);
      const name = document.createElement('div'); name.className = 'name';
      name.textContent = (m ? m.name : (r.motifId && r.motifId.startsWith('tpl:') ? 'Vorlage' : 'Freies Malen')) + ' · ' + new Date(r.updated).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑️'; del.setAttribute('aria-label', 'Bild löschen (Eltern)');
      del.onclick = () => parentGate(() => confirmDialog('Dieses Bild wirklich löschen?', '🗑️ Löschen', async () => { await DB.del(r.id); renderGallery(); }));
      t.append(open, name, del); g.appendChild(t);
    }
  }

  // ---------- Dialoge ----------
  const modal = $('#modal'), card = $('#modalCard');
  function openModal(html) { card.innerHTML = html; modal.classList.remove('hidden'); return card; }
  function closeModal() { modal.classList.add('hidden'); card.innerHTML = ''; }
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); });

  function parentGate(onOk) {
    const a = 11 + Math.floor(Math.random() * 9), b = 4 + Math.floor(Math.random() * 6); // z. B. 17 + 8
    let ans = '';
    const c = openModal(`<h2>🔒 Für Eltern</h2><p>Bitte rechne:</p><div class="q">${a} + ${b} = ?</div><div class="ans" id="ans">&nbsp;</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del" aria-label="Löschen">⌫</button><button data-k="0">0</button><button data-k="ok" class="ok" aria-label="OK">✓</button></div>
      <div class="row"><button class="btn" data-k="cancel">Abbrechen</button></div>`);
    const out = c.querySelector('#ans');
    c.querySelectorAll('[data-k]').forEach((btn) => btn.onclick = () => {
      const k = btn.dataset.k;
      if (k === 'cancel') return closeModal();
      if (k === 'del') ans = ans.slice(0, -1);
      else if (k === 'ok') {
        if (+ans === a + b && ans !== '') { closeModal(); onOk(); return; }
        out.classList.remove('shake'); void out.offsetWidth; out.classList.add('shake'); ans = '';
      } else if (ans.length < 3) ans += k;
      out.innerHTML = ans || '&nbsp;';
    });
  }
  function confirmDialog(text, okLabel, onOk) {
    const c = openModal(`<h2>${text}</h2><div class="row"><button class="btn" data-a="no">Abbrechen</button><button class="btn danger" data-a="yes">${okLabel}</button></div>`);
    c.querySelector('[data-a=no]').onclick = closeModal;
    c.querySelector('[data-a=yes]').onclick = () => { closeModal(); onOk(); };
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 1800); }

  function settingsDialog() {
    const render = () => {
      const c = openModal(`<h2>⚙️ Einstellungen</h2>
        <div class="setting"><span>Farbauswahl beim Start</span><div class="seg"><button data-m="simple" class="${settings.colorMode === 'simple' ? 'sel' : ''}">Einfach</button><button data-m="advanced" class="${settings.colorMode === 'advanced' ? 'sel' : ''}">Farbrad</button></div></div>
        <div class="setting"><span>Nur der Apple Pencil malt<br><small>Finger nur zum Zoomen und Drehen</small></span><button class="switch ${settings.pencilOnly ? 'on' : ''}" data-s="pencilOnly" aria-label="Nur Apple Pencil"></button></div>
        <div class="setting"><span>Druckstärke vom Apple Pencil nutzen</span><button class="switch ${settings.pressure ? 'on' : ''}" data-s="pressure" aria-label="Druckstärke"></button></div>
        <div class="row"><button class="btn danger" data-a="clear">🗑️ Alle Bilder löschen</button><button class="btn primary" data-a="close">Fertig</button></div>
        <div class="small-note">Alle Bilder bleiben nur auf diesem iPad. Keine Werbung, keine Internetverbindung nötig.<br>Malbuch Version 1.3</div>`);
      c.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { settings.colorMode = b.dataset.m; saveSettings(); updateColorUI(); render(); });
      c.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { settings[b.dataset.s] = !settings[b.dataset.s]; saveSettings(); render(); });
      c.querySelector('[data-a=close]').onclick = closeModal;
      c.querySelector('[data-a=clear]').onclick = () => confirmDialog('Wirklich ALLE Bilder löschen?', '🗑️ Alle löschen', async () => { await DB.clear(); toast('Alle Bilder gelöscht'); });
    };
    render();
  }

  // ---------- PDF ----------
  async function exportPDF() {
    const busy = openModal('<h2>📄 PDF wird erstellt …</h2>');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const img = composite(PW, PH).toDataURL('image/jpeg', 0.92);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const w = 190, h = w * PH / PW; // 190 x 253,3 mm
      doc.setProperties({ title: 'Malbuch', creator: 'Malbuch' });
      doc.addImage(img, 'JPEG', 10, (297 - h) / 2, w, h);
      const blob = doc.output('blob');
      const name = `Malbuch-${state.motif ? state.motif.name : 'Freies-Malen'}-${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[^\wäöüÄÖÜß.-]+/g, '-');
      const file = new File([blob], name, { type: 'application/pdf' });
      window.__lastPdf = { name, size: blob.size };
      const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
      if (busy !== card) return;
      const c = openModal(`<h2>📄 PDF ist fertig</h2><p>${name}</p><div class="row">
        ${canShare ? '<button class="btn primary" data-a="share">📤 Teilen / Sichern</button>' : ''}
        <button class="btn ${canShare ? '' : 'primary'}" data-a="dl">⬇️ Herunterladen</button>
        <button class="btn" data-a="close">Schließen</button></div>`);
      const url = URL.createObjectURL(blob);
      if (canShare) c.querySelector('[data-a=share]').onclick = () => {
        navigator.share({ files: [file], title: 'Malbuch' }).then(closeModal).catch((err) => { if (err && err.name !== 'AbortError') toast('Teilen nicht möglich'); });
      };
      c.querySelector('[data-a=dl]').onclick = () => {
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      };
      c.querySelector('[data-a=close]').onclick = () => { closeModal(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    } catch (err) {
      console.error(err); openModal('<h2>PDF konnte nicht erstellt werden</h2><div class="row"><button class="btn" id="mc">OK</button></div>');
      $('#mc').onclick = closeModal;
    }
  }

  // ---------- Apple Pencil auf Knöpfen ----------
  // iPadOS/Safari löst bei Pencil-Tipps auf Bedienelementen oft KEIN 'click' aus (kleinste Bewegung
  // der Spitze gilt als Wisch-/Scribble-Geste; zusammen mit touch-action:none). Darum erkennen wir
  // Pencil-Tipps selbst über Pointer-Events und lösen den Klick aus. Ein evtl. trotzdem folgender
  // echter Klick wird verworfen, damit nichts doppelt passiert. Schieberegler bekommen Pencil-Ziehen.
  (function penSupport() {
    const CTRL = 'button, [role=button], a[href], summary, input[type=checkbox], input[type=radio]';
    let down = null, synth = null;
    const isPen = (e) => e.pointerType === 'pen';
    document.addEventListener('pointerdown', (e) => {
      if (!isPen(e)) return;
      const range = e.target.closest && e.target.closest('input[type=range]');
      if (range && !range.disabled) { startRange(range, e); return; }
      const el = e.target.closest && e.target.closest(CTRL);
      down = el && !el.disabled ? { el, id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    }, true);
    document.addEventListener('pointerup', (e) => {
      if (!isPen(e) || !down || down.id !== e.pointerId) return;
      const d = down; down = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 24 || e.timeStamp - d.t > 1500) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit && hit.closest(CTRL);
      if (el !== d.el || !el.isConnected || el.disabled) return;
      synth = { el, t: performance.now() };
      el.click(); // pointerup des Stifts zählt als Nutzer-Geste (Dateiauswahl funktioniert)
    }, true);
    document.addEventListener('pointercancel', (e) => { if (down && down.id === e.pointerId) down = null; }, true);
    document.addEventListener('click', (e) => {
      if (!synth || !e.isTrusted) return;
      if (performance.now() - synth.t < 800) { e.preventDefault(); e.stopImmediatePropagation(); }
      synth = null;
    }, true);
    function startRange(r, e) {
      e.preventDefault();
      try { r.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      const set = (ev) => {
        const b = r.getBoundingClientRect(), min = +r.min || 0, max = r.max === '' ? 100 : +r.max, step = +r.step || 1;
        const f = Math.min(1, Math.max(0, (ev.clientX - b.left - 19) / Math.max(1, b.width - 38)));
        const v = Math.round((min + f * (max - min)) / step) * step;
        if (+r.value !== v) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      set(e);
      const mv = (ev) => { if (ev.pointerId === e.pointerId) { ev.preventDefault(); set(ev); } };
      const up = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up); r.removeEventListener('pointercancel', up);
        r.dispatchEvent(new Event('change', { bubbles: true }));
      };
      r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up);
    }
  })();

  // ---------- Verkabelung ----------
  $('#btnGallery').onclick = () => { show('gallery'); renderGallery(); };
  $('#btnSettings').onclick = () => parentGate(settingsDialog);
  $$('.btnHome').forEach((b) => b.onclick = () => show('home'));
  $('#btnBack').onclick = async () => { if (stroke) endStroke(); await save(); show('home'); };
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnFit').onclick = () => { measure(); fitView(); };
  $('#btnPdf').onclick = () => parentGate(exportPDF);

  renderCats(); renderMotifs(); loadTemplates().then(() => { if (state.category === 'vorlagen') renderMotifs(); });
  buildColorUI(); setTool('brush'); setColor(state.color); updateUndoButtons();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }

  // Für automatische Tests
  // Schnittstelle für den Vorlagen-Import (js/import.js)
  window.MalbuchApp = {
    PW, PH, DB, show, toast, openModal, closeModal, parentGate, confirmDialog, blobToImage, toBlob,
    async templateSaved() { await loadTemplates(); state.category = 'vorlagen'; renderCats(); renderMotifs(); show('home'); },
    backHome() { show('home'); }
  };
  window.__malbuch = { templates: () => templates, findMotif, openNew, state, settings, view: () => view, undoStack: () => undoStack, pctx, octx, PW, PH, save, DB, toPage, fitView };
})();
