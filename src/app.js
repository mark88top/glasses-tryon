/**
 * app.js — Probador de anteojos.
 * Camara o foto -> face landmarks -> pose -> armazon del catalogo dibujado encima.
 * Todo corre local: el video nunca sale del browser.
 */
import { FaceLandmarker, FilesetResolver } from '../vendor/tasks-vision/vision_bundle.mjs';
import { computePose, PoseSmoother, fitAdvice, suggestSize } from './pose.js';
import { buildFrame, normalizeSpec, SHAPE_LABELS } from './geometry.js';
import { GlassesRenderer } from './render.js';
import { Renderer3D } from './render3d.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const CAT_LABEL = { blue_light: 'Luz azul', optical: 'Receta / plano', sunglasses: 'Sol' };
const GENDER_LABEL = { male: 'Masculino', female: 'Femenino', unisex: 'Unisex' };
const FIT_LABEL = { ok: 'te entra', justo: 'justo', mal: 'no es tu talle' };

const S = {
  mode3d: localStorage.getItem('gt_mode') !== 'silueta',   // realista por defecto
  frames3d: null, asset3d: null, loading3d: false,
  catalog: null, models: [], filtered: [],
  current: null, colorIdx: 0, lensIdx: 0,
  measures: null, measuresReady: false,
  favs: new Set(JSON.parse(localStorage.getItem('gt_favs') || '[]')),
  shots: JSON.parse(localStorage.getItem('gt_shots') || '[]'),
  filters: { cat: 'all', gender: 'all', shape: 'all', brand: 'all', ar: false, fav: false, q: '' },
  detailOpen: localStorage.getItem('gt_detail_open') === '1',
  camId: localStorage.getItem('gt_cam') || null,
  resKey: localStorage.getItem('gt_res') || '1080',
  source: null, landmarker: null, photoLandmarks: null,
  frameCache: new Map(),
};

/* ================= catalogo ================= */

async function loadCatalog() {
  const [cat, f3d] = await Promise.all([
    fetch('data/catalog.json').then((r) => r.json()),
    fetch('assets/models/frames3d.json').then((r) => r.json()).catch(() => null),
  ]);
  S.catalog = cat;
  S.models = cat.models;
  S.frames3d = f3d;
}

/** Que montura 3D real le toca a un modelo del catalogo, segun su forma. */
function asset3dFor(m) {
  if (!S.frames3d) return null;
  const id = S.frames3d.fallbackByShape[m.shape];
  return S.frames3d.frames.find((f) => f.id === id) || null;
}

const specOf = (m) => normalizeSpec({
  shape: m.shape, lensWidth: m.lensWidth, bridge: m.bridge, templeLength: m.templeLength,
  material: m.material, doubleBridge: m.doubleBridge, browBar: m.browBar, wrap: m.wrap,
  rimThickness: m.rimThickness, category: m.category,
});

function frameOf(m) {
  if (!S.frameCache.has(m.id)) S.frameCache.set(m.id, buildFrame(specOf(m)));
  return S.frameCache.get(m.id);
}

function styleOf(m, colorIdx = S.colorIdx, lensIdx = S.lensIdx) {
  const fc = m.frameColors[Math.min(colorIdx, m.frameColors.length - 1)] || { hex: '#141414' };
  const lc = (m.lensColors || [])[Math.min(lensIdx, (m.lensColors || []).length - 1)]
    || { hex: '#e9eef2', opacity: 0.1 };
  return {
    frameColor: fc.hex, browColor: fc.hex,
    lensColor: lc.hex, lensOpacity: lc.opacity ?? 0.4, mirrored: !!lc.mirrored,
    material: m.material,
  };
}

const fitOf = (m) => (S.measures ? fitAdvice(S.measures, frameOf(m).spec) : null);

/* ================= miniaturas ================= */

const thumbRenderers = new WeakMap();

// Con 250+ modelos, dibujar todas las miniaturas de una cuelga la pestaña.
// Solo se dibuja la que entra en pantalla, y una sola vez.
const thumbObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const cv = e.target;
    thumbObserver.unobserve(cv);
    if (cv.dataset.drawn) continue;
    cv.dataset.drawn = '1';
    const m = S.models.find((x) => x.id === cv.dataset.model);
    if (m) drawThumb(cv, m);
  }
}, { rootMargin: '220px' });
function drawThumb(canvas, m) {
  const frame = frameOf(m);
  const W = canvas.width, H = canvas.height;
  let r = thumbRenderers.get(canvas);
  if (!r) { r = new GlassesRenderer(canvas); r.mirror = false; thumbRenderers.set(canvas, r); }
  const ctx = r.ctx;
  ctx.clearRect(0, 0, W, H);
  // Fondo propio: sin esto un armazon negro sobre el panel oscuro no se ve.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#5b6577'); bg.addColorStop(1, '#39414f');
  ctx.fillStyle = bg;
  ctx.beginPath();
  const rad = 8;
  ctx.moveTo(rad, 0); ctx.arcTo(W, 0, W, H, rad); ctx.arcTo(W, H, 0, H, rad);
  ctx.arcTo(0, H, 0, 0, rad); ctx.arcTo(0, 0, W, 0, rad); ctx.closePath(); ctx.fill();
  const pxPerMm = (W * 0.93) / (frame.spec.totalWidth + 6);
  const pose = {
    origin: [W / 2, H * 0.56, 0],
    u: [1, 0, 0], v: [0, -1, 0], w: [0, 0, -1],
    pxPerMm, px: [],
  };
  r.draw(pose, frame, styleOf(m, 0, 0), { flat: true });
}

/* ================= lista y filtros ================= */

function applyFilters() {
  const f = S.filters, q = f.q.trim().toLowerCase();
  S.filtered = S.models.filter((m) => {
    if (f.cat !== 'all' && m.category !== f.cat) return false;
    if (f.gender !== 'all' && m.gender !== f.gender && !(f.gender !== 'unisex' && m.gender === 'unisex')) return false;
    if (f.shape !== 'all' && m.shape !== f.shape) return false;
    if (f.brand !== 'all' && m.brand !== f.brand) return false;
    if (f.ar && !m.argentina) return false;
    if (f.fav && !S.favs.has(m.id)) return false;
    if (q && !(`${m.brand} ${m.model}`.toLowerCase().includes(q))) return false;
    return true;
  });
  // Con las medidas tomadas, lo que te entra sube primero: es la decision de compra.
  if (S.measures) {
    const rank = { ok: 0, justo: 1, mal: 2 };
    S.filtered.sort((a, b) => (rank[fitOf(a).verdict] - rank[fitOf(b).verdict])
      || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  }
  renderList();
}

function renderFilters() {
  const box = $('#filters');
  box.innerHTML = '';
  const brands = [...new Set(S.models.map((m) => m.brand))].sort();
  const shapes = [...new Set(S.models.map((m) => m.shape))].sort();

  const row = (label, key, opts, alt) => {
    const r = el('div', 'f-row');
    r.appendChild(el('div', 'f-label', label));
    const p = el('div', 'pills');
    for (const [val, txt] of opts) {
      const b = el('button', 'pill' + (S.filters[key] === val ? ' on' + (alt ? ' alt' : '') : ''), txt);
      b.onclick = () => { S.filters[key] = val; renderFilters(); applyFilters(); };
      p.appendChild(b);
    }
    r.appendChild(p); box.appendChild(r);
  };

  // Las dos decisiones principales van como pastillas, a un clic de distancia.
  row('Para qué', 'cat', [['all', 'Todos'], ['blue_light', 'Luz azul / pantalla'], ['sunglasses', 'Sol'], ['optical', 'Armazón de receta']], true);
  row('Estilo', 'gender', [['all', 'Todos'], ['male', 'Masculino'], ['female', 'Femenino'], ['unisex', 'Unisex']]);

  // Forma y marca van como desplegables: 14 formas y 39 marcas en pastillas se
  // comian el panel entero y dejaban dos modelos a la vista.
  const pickRow = el('div', 'f-row two');
  const sel = (label, key, opts) => {
    const wrap = el('div');
    wrap.appendChild(el('div', 'f-label', label));
    const sl = el('select', 'sel');
    for (const [val, txt] of opts) {
      const o = el('option', null, txt); o.value = val;
      if (S.filters[key] === val) o.selected = true;
      sl.appendChild(o);
    }
    sl.onchange = () => { S.filters[key] = sl.value; applyFilters(); };
    wrap.appendChild(sl); pickRow.appendChild(wrap);
  };
  const count = (field, val) => S.models.filter((m) => m[field] === val).length;
  sel('Forma', 'shape', [['all', `Todas (${S.models.length})`], ...shapes.map((x) => [x, `${SHAPE_LABELS[x] || x} (${count('shape', x)})`])]);
  sel('Marca', 'brand', [['all', `Todas (${new Set(S.models.map((m) => m.brand)).size})`], ...brands.map((b) => [b, `${b} (${count('brand', b)})`])]);
  box.appendChild(pickRow);

  const r = el('div', 'f-row');
  const p = el('div', 'pills');
  const tgl = (key, txt) => {
    const b = el('button', 'pill' + (S.filters[key] ? ' on' : ''), txt);
    b.onclick = () => { S.filters[key] = !S.filters[key]; renderFilters(); applyFilters(); };
    p.appendChild(b);
  };
  tgl('ar', '🇦🇷 Se consigue acá');
  tgl('fav', '★ Mi lista');
  r.appendChild(p); box.appendChild(r);
}

const cardEls = new Map();

/** Marca la tarjeta activa sin reconstruir la lista (son cientos de nodos). */
function refreshCards() {
  for (const [id, card] of cardEls) {
    card.classList.toggle('on', S.current?.id === id);
    const fav = card.querySelector('.fav');
    if (fav) { const on = S.favs.has(id); fav.classList.toggle('on', on); fav.textContent = on ? '★' : '☆'; }
  }
}

function renderList() {
  const list = $('#list');
  list.innerHTML = '';
  cardEls.clear();
  $('#countTxt').textContent = `${S.filtered.length} de ${S.models.length}`;

  if (!S.filtered.length) {
    list.appendChild(el('div', 'empty', 'No hay modelos con esos filtros.<br>Probá aflojando alguno.'));
    return;
  }

  for (const m of S.filtered) {
    const card = el('div', 'card' + (S.current?.id === m.id ? ' on' : ''));
    const cv = el('canvas', 'thumb'); cv.width = 116; cv.height = 68;
    cv.style.width = '58px'; cv.style.height = '34px';
    cv.dataset.model = m.id;
    card.appendChild(cv);
    thumbObserver.observe(cv);

    const mid = el('div');
    mid.appendChild(el('div', 'c-brand', m.brand));
    mid.appendChild(el('div', 'c-model', m.model));
    const bits = [CAT_LABEL[m.category], (SHAPE_LABELS[m.shape] || m.shape) + (m.shapeGuessed ? '?' : ''), `${m.lensWidth}–${m.bridge}`];
    if (m.priceArs) bits.push(`$${Number(m.priceArs).toLocaleString('es-AR')}`);
    else if (m.priceUsd) bits.push(`US$${m.priceUsd}`);
    mid.appendChild(el('div', 'c-meta', bits.join(' · ')));
    card.appendChild(mid);

    const right = el('div', 'c-right');
    const fit = fitOf(m);
    if (fit) right.appendChild(el('span', `badge ${fit.verdict}`, FIT_LABEL[fit.verdict]));
    else if (m.argentina) right.appendChild(el('span', 'badge ar', '🇦🇷'));
    const fav = el('button', 'fav' + (S.favs.has(m.id) ? ' on' : ''), S.favs.has(m.id) ? '★' : '☆');
    fav.onclick = (e) => { e.stopPropagation(); toggleFav(m); };
    right.appendChild(fav);
    card.appendChild(right);

    card.onclick = () => select(m);
    cardEls.set(m.id, card);
    list.appendChild(card);
  }
}

/* ================= seleccion y detalle ================= */

function select(m) {
  S.current = m; S.colorIdx = 0; S.lensIdx = 0;
  refreshCards(); renderDetail(); renderNowPlaying(); renderHud();
  load3dFor(m);
}

/** Pide la montura 3D del modelo elegido. Mientras carga se sigue viendo la silueta. */
function load3dFor(m) {
  if (!m || !S.mode3d || !r3d) { S.asset3d = null; return; }
  const asset = asset3dFor(m);
  S.asset3d = asset;
  if (!asset) return;
  S.loading3d = true;
  r3d.setFrame(asset.path).then((ok) => {
    S.loading3d = false;
    if (ok) renderNowPlaying();
  }).catch((e) => {
    S.loading3d = false; S.asset3d = null;
    console.warn('no pude cargar la montura 3D:', e.message);
    toast('Esa montura 3D no cargó, muestro la silueta');
  });
}

function renderNowPlaying() {
  const np = $('#nowplaying');
  if (!S.current) { np.style.display = 'none'; return; }
  np.style.display = 'flex';
  const m = S.current;
  $('#npBrand').textContent = m.brand;
  $('#npModel').textContent = m.model;
  const spec = frameOf(m).spec;
  $('#npMeta').textContent = `${CAT_LABEL[m.category]} · ${m.lensWidth}–${m.bridge}–${m.templeLength} · ${spec.totalWidth.toFixed(0)}mm de ancho total`;
  $('#favBtn').className = 'np-btn' + (S.favs.has(m.id) ? ' on' : '');
  $('#favBtn').textContent = S.favs.has(m.id) ? '★' : '☆';
}

function renderDetail() {
  const d = $('#detail');
  if (!S.current) { d.className = ''; d.innerHTML = ''; return; }
  const m = S.current;
  d.className = 'show' + (S.detailOpen ? ' open' : '');
  d.innerHTML = '';

  const swatch = (c, i, idxKey, isLens, cls) => {
    const b = el('button', cls + (S[idxKey] === i ? ' on' : ''));
    b.style.background = isLens && c.mirrored
      ? `linear-gradient(135deg,${c.hex},#fff 45%,${c.hex})` : c.hex;
    b.title = c.name;
    b.onclick = (e) => { e.stopPropagation(); S[idxKey] = i; renderDetail(); };
    return b;
  };

  // Barra siempre visible: lo unico que se usa mientras te probas modelos.
  const bar = el('div', 'd-bar');
  const mini = el('div', 'd-mini');
  m.frameColors.slice(0, 6).forEach((c, i) => mini.appendChild(swatch(c, i, 'colorIdx', false, 'sw')));
  bar.appendChild(mini);
  bar.appendChild(el('div', 'd-name', m.model));
  bar.appendChild(el('span', 'd-chev', '▾'));
  bar.onclick = () => {
    S.detailOpen = !S.detailOpen;
    localStorage.setItem('gt_detail_open', S.detailOpen ? '1' : '0');
    renderDetail();
  };
  d.appendChild(bar);

  // Cuerpo plegado: especificaciones y compra, que no hacen falta a cada segundo.
  const body = el('div', 'd-body');

  if (m.lensColors?.length > 1) {
    const r = el('div', 'd-colors');
    const row = el('div');
    row.appendChild(el('div', 'f-label', 'Cristal'));
    const sw = el('div', 'd-swatches');
    m.lensColors.forEach((c, i) => sw.appendChild(swatch(c, i, 'lensIdx', true, 'sw')));
    const name = m.lensColors[Math.min(S.lensIdx, m.lensColors.length - 1)]?.name;
    if (name) sw.appendChild(el('span', 'c-meta', name));
    row.appendChild(sw); r.appendChild(row); body.appendChild(r);
  }

  const spec = frameOf(m).spec;
  const fit = fitOf(m);
  const lines = [];
  lines.push(`<b>Medidas</b> ${m.lensWidth}–${m.bridge}–${m.templeLength} · ancho total ${spec.totalWidth.toFixed(0)}mm`);
  if (fit) lines.push(`<b>En tu cara</b> ${FIT_LABEL[fit.verdict]} — ${fit.notes.join('; ')}`);
  if (m.blueLightBlock) lines.push(`<b>Filtro</b> ${m.blueLightBlock}`);
  if (m.material) lines.push(`<b>Material</b> ${m.material}`);
  if (m.priceArs) lines.push(`<b>Precio</b> $${Number(m.priceArs).toLocaleString('es-AR')} ARS`);
  else if (m.priceUsd) lines.push(`<b>Precio</b> US$${m.priceUsd}`);
  if (m.notes) lines.push(m.notes);
  if (!m.verified) lines.push(`<span class="d-warn">⚠ Medidas y colores aproximados: confirmá en la óptica antes de comprar.</span>`);
  if (m.shapeGuessed) lines.push(`<span class="d-warn">⚠ La marca no publica la forma de este modelo: la silueta es genérica. Las medidas sí son reales.</span>`);
  if (S.mode3d && S.asset3d) {
    lines.push(`<span class="d-warn">⚠ Montura 3D representativa de la forma «${SHAPE_LABELS[m.shape] || m.shape}» (${S.asset3d.title}, ${S.asset3d.author}), no es el producto real. Lo que sí es exacto es el TAMAÑO: está escalada a ${spec.totalWidth.toFixed(0)}mm de ancho.</span>`);
  }
  body.appendChild(el('div', 'd-specs', lines.join('<br>')));

  const actions = el('div', 'd-actions');
  const url = m.buyUrl || `https://www.google.com/search?q=${encodeURIComponent(`${m.brand} ${m.model} comprar Argentina`)}`;
  const buy = el('a', 'btn', m.buyUrl ? 'Ver en la tienda' : 'Buscar dónde comprarlo');
  buy.href = url; buy.target = '_blank'; buy.rel = 'noopener';
  actions.appendChild(buy);
  const favB = el('button', 'btn ghost', S.favs.has(m.id) ? '★ En mi lista' : '☆ Guardar');
  favB.onclick = () => toggleFav(m);
  actions.appendChild(favB);
  body.appendChild(actions);

  d.appendChild(body);
}

function toggleFav(m) {
  if (S.favs.has(m.id)) S.favs.delete(m.id); else S.favs.add(m.id);
  localStorage.setItem('gt_favs', JSON.stringify([...S.favs]));
  if (S.filters.fav) applyFilters(); else refreshCards();
  renderDetail(); renderNowPlaying();
  toast(S.favs.has(m.id) ? '★ Guardado en tu lista' : 'Sacado de tu lista');
}

/* ================= HUD ================= */

function renderHud() {
  const hud = $('#hud');
  hud.innerHTML = '';
  if (!S.measures) return;
  const me = S.measures, sug = suggestSize(me);
  hud.appendChild(el('div', 'chip', `DIP <b>${me.pd.toFixed(0)} mm</b> · cara <b>${me.faceWidth.toFixed(0)} mm</b>`));
  hud.appendChild(el('div', 'chip', `Tu talle: <b>${sug.reading}</b> (calibre ${sug.range[0]}–${sug.range[1]})`));
  if (S.current) {
    const fit = fitOf(S.current);
    hud.appendChild(el('div', `chip fit-${fit.verdict}`, `${S.current.model}: <b>${FIT_LABEL[fit.verdict]}</b>`));
  }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

/* ================= motor ================= */

const canvas = $('#canvas');
const video = $('#cam');
const renderer = new GlassesRenderer(canvas);
let r3d = null;
const smoother = new PoseSmoother();
let frameCount = 0;

/** Crea el detector. Si no hay WebGL utilizable, cae a CPU en vez de morir. */
async function makeLandmarker(runningMode) {
  const fileset = await FilesetResolver.forVisionTasks('vendor/tasks-vision/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: 'vendor/models/face_landmarker.task', delegate },
    runningMode, numFaces: 1,
    outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
  } catch (e) {
    console.warn('GPU no disponible, uso CPU:', e.message);
    return await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
  }
}

/* --------- camara --------- */

// El browser entrega la resolucion mas alta que la camara soporte de las pedidas.
// Sin pedir explicitamente, Chrome sirve 640x480 y la imagen se ve blanda.
const RESOLUTIONS = [
  { key: '2160', label: '4K · 3840×2160', w: 3840, h: 2160 },
  { key: '1440', label: '1440p · 2560×1440', w: 2560, h: 1440 },
  { key: '1080', label: 'Full HD · 1920×1080', w: 1920, h: 1080 },
  { key: '720', label: 'HD · 1280×720', w: 1280, h: 720 },
  { key: '480', label: 'Baja · 640×480', w: 640, h: 480 },
];

let currentStream = null;

function stopStream() {
  if (currentStream) { for (const t of currentStream.getTracks()) t.stop(); currentStream = null; }
}

async function openStream(deviceId, resKey) {
  const res = RESOLUTIONS.find((r) => r.key === resKey) || RESOLUTIONS[2];
  stopStream();
  const video_ = {
    width: { ideal: res.w }, height: { ideal: res.h },
    // frameRate alto ayuda al seguimiento: con 15fps el armazon va siempre atrasado.
    frameRate: { ideal: 30 },
  };
  if (deviceId) video_.deviceId = { exact: deviceId };
  else video_.facingMode = 'user';

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: video_, audio: false });
  } catch (e) {
    // Si la camara no soporta lo pedido, reintentamos sin exigir resolucion.
    console.warn('resolucion no soportada, reintento libre:', e.message);
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }, audio: false,
    });
  }
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
  // Esperamos a que el video tenga dimensiones reales antes de dimensionar el canvas.
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  smoother.reset();
  frameCount = 0;
  return stream;
}

async function buildCamControls() {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const camSel = $('#camSelect'), resSel = $('#resSelect');

  camSel.innerHTML = '';
  devices.forEach((d, i) => {
    const o = el('option', null, d.label || `Cámara ${i + 1}`);
    o.value = d.deviceId;
    if (d.deviceId === S.camId) o.selected = true;
    camSel.appendChild(o);
  });
  // Si la guardada ya no existe (desconectaron la webcam), tomamos la activa.
  const active = currentStream?.getVideoTracks()[0]?.getSettings()?.deviceId;
  if (!devices.some((d) => d.deviceId === S.camId) && active) { S.camId = active; camSel.value = active; }
  camSel.style.display = devices.length > 1 ? '' : 'none';

  resSel.innerHTML = '';
  for (const r of RESOLUTIONS) {
    const o = el('option', null, r.label); o.value = r.key;
    if (r.key === S.resKey) o.selected = true;
    resSel.appendChild(o);
  }

  const reopen = async () => {
    S.camId = camSel.value; S.resKey = resSel.value;
    localStorage.setItem('gt_cam', S.camId);
    localStorage.setItem('gt_res', S.resKey);
    try { await openStream(S.camId, S.resKey); showResInfo(); }
    catch (e) { toast('No pude abrir esa cámara'); console.error(e); }
  };
  camSel.onchange = reopen;
  resSel.onchange = reopen;

  $('#camctl').style.display = 'flex';
  showResInfo();
}

function showResInfo() {
  const t = currentStream?.getVideoTracks()[0];
  const st = t?.getSettings?.() || {};
  const w = video.videoWidth || st.width, h = video.videoHeight || st.height;
  if (!w) { $('#resInfo').textContent = ''; return; }
  const fps = st.frameRate ? ` · ${Math.round(st.frameRate)}fps` : '';
  $('#resInfo').textContent = `${w}×${h}${fps}`;
}

async function startCamera() {
  $('#gate').innerHTML = '<p>Prendiendo la cámara…</p>';
  await openStream(S.camId, S.resKey);
  S.landmarker = await makeLandmarker('VIDEO');
  S.source = { kind: 'video' };
  renderer.mirror = true;
  ensure3d();
  $('#gate').style.display = 'none';
  // enumerateDevices solo devuelve los nombres reales DESPUES de dar permiso.
  await buildCamControls();
  loop();
}

async function startPhoto(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const maxW = 1280;
  const sc = Math.min(1, maxW / img.naturalWidth);
  canvas.width = Math.round(img.naturalWidth * sc);
  canvas.height = Math.round(img.naturalHeight * sc);

  S.landmarker = await makeLandmarker('IMAGE');
  const res = S.landmarker.detect(img);
  if (!res.faceLandmarks?.length) { alert('No encontré una cara en esa foto. Probá con una de frente y bien iluminada.'); return; }
  S.photoLandmarks = res.faceLandmarks[0];
  S.source = { kind: 'photo', img };
  renderer.mirror = false;
  ensure3d();
  $('#gate').style.display = 'none';
  loop();
}

function loop() {
  requestAnimationFrame(loop);
  const ctx = renderer.ctx;

  let landmarks = null;
  if (S.source?.kind === 'video') {
    if (video.readyState < 2 || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth) {   // cambio de camara o de resolucion
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    }
    renderer.drawVideo(video);
    const res = S.landmarker.detectForVideo(video, performance.now());
    landmarks = res.faceLandmarks?.[0] || null;
  } else if (S.source?.kind === 'photo') {
    ctx.drawImage(S.source.img, 0, 0, canvas.width, canvas.height);
    landmarks = S.photoLandmarks;
  } else return;

  if (!landmarks) { smoother.reset(); return; }

  const raw = computePose(landmarks, canvas.width, canvas.height);
  const pose = S.source.kind === 'photo' ? raw : smoother.smooth(raw);

  S.lastPose = pose;
  if (S.current) {
    const frame = frameOf(S.current);
    const style = styleOf(S.current);
    const use3d = S.mode3d && r3d && r3d.current && S.asset3d && !S.loading3d;
    if (use3d) {
      r3d.resize(canvas.width, canvas.height);
      r3d.applyStyle(style);
      const cv = r3d.render(pose, frame.spec.totalWidth, renderer.mirror);
      if (cv) {
        ctx.save();
        if (renderer.mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(cv, 0, 0);
        ctx.restore();
      }
    } else {
      renderer.draw(pose, frame, style);   // silueta: respaldo mientras carga el 3D
    }
  }

  // Las medidas se toman una vez estabilizadas y se refrescan cada tanto.
  frameCount++;
  if (!S.measuresReady && (frameCount > 20 || S.source.kind === 'photo')) {
    S.measures = pose.measures; S.measuresReady = true;
    renderHud(); applyFilters();
    toast(`Te medí: DIP ${pose.measures.pd.toFixed(0)}mm · cara ${pose.measures.faceWidth.toFixed(0)}mm`);
  } else if (S.measuresReady && frameCount % 45 === 0) {
    S.measures = pose.measures; renderHud();   // el HUD se refresca; la lista no se reordena sola
  }
}

function ensure3d() {
  if (r3d || !S.mode3d) return;
  try {
    r3d = new Renderer3D(canvas.width, canvas.height);
    if (S.current) load3dFor(S.current);
  } catch (e) {
    console.warn('sin WebGL, uso siluetas:', e.message);
    S.mode3d = false;
  }
}

/* ================= fotos y modales ================= */

function snapshot() {
  if (!S.source) return;
  const shot = {
    id: Date.now(),
    label: S.current ? `${S.current.brand} ${S.current.model}` : 'Sin anteojos',
    color: S.current ? (S.current.frameColors[S.colorIdx]?.name || '') : '',
    data: canvas.toDataURL('image/jpeg', 0.82),
  };
  S.shots.unshift(shot);
  S.shots = S.shots.slice(0, 24);
  try { localStorage.setItem('gt_shots', JSON.stringify(S.shots)); }
  catch { S.shots = S.shots.slice(0, 8); localStorage.setItem('gt_shots', JSON.stringify(S.shots)); }
  toast('📸 Foto guardada — abrila en "Mis fotos"');
}

function modal(title, bodyEl) {
  const back = el('div');
  back.style.cssText = 'position:fixed;inset:0;background:rgba(6,8,11,.82);backdrop-filter:blur(6px);z-index:50;display:flex;align-items:center;justify-content:center;padding:28px';
  const box = el('div');
  box.style.cssText = 'background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:940px;width:100%;max-height:86vh;overflow:auto;padding:22px';
  const head = el('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px';
  head.appendChild(el('h2', null, title));
  const x = el('button', 'np-btn', '✕'); x.onclick = () => back.remove();
  head.appendChild(x);
  box.appendChild(head); box.appendChild(bodyEl);
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  document.body.appendChild(back);
}

function showGallery() {
  const body = el('div');
  if (!S.shots.length) { body.appendChild(el('div', 'empty', 'Todavía no sacaste ninguna foto.<br>Probate un modelo y apretá espacio.')); modal('Mis fotos', body); return; }
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px';
  for (const s of S.shots) {
    const c = el('div');
    c.style.cssText = 'background:var(--panel2);border:1px solid var(--line);border-radius:11px;overflow:hidden';
    const im = el('img'); im.src = s.data; im.style.cssText = 'width:100%;display:block';
    const cap = el('div', null, `<div style="font-size:12px;font-weight:600">${s.label}</div><div class="c-meta">${s.color}</div>`);
    cap.style.padding = '8px 10px';
    const dl = el('a', 'btn ghost', 'Descargar');
    dl.href = s.data; dl.download = `${s.label.replace(/\W+/g, '-')}.jpg`;
    dl.style.cssText = 'display:block;text-align:center;margin:0 10px 10px;padding:6px;font-size:12px;border-radius:8px;text-decoration:none';
    c.append(im, cap, dl); grid.appendChild(c);
  }
  body.appendChild(grid);
  const clear = el('button', 'btn ghost', 'Borrar todas');
  clear.style.marginTop = '14px';
  clear.onclick = () => { S.shots = []; localStorage.removeItem('gt_shots'); document.querySelector('div[style*="z-index:50"]')?.remove(); };
  body.appendChild(clear);
  modal('Mis fotos', body);
}

async function showCredits() {
  const body = el('div');
  body.style.cssText = 'font-size:12px;line-height:1.7;color:var(--dim)';
  let credits = [];
  try {
    const raw = await (await fetch('assets/models/credits.json')).json();
    credits = Array.isArray(raw) ? raw : (raw.models || raw.assets || []);
  } catch { /* sin archivo de creditos no mostramos nada inventado */ }

  const usados = new Set((S.frames3d?.frames || []).map((f) => f.path));
  const enUso = credits.filter((c) => usados.has(c.path));
  const resto = credits.filter((c) => !usados.has(c.path));

  const tabla = (list) => list.map((c) => `<li><b style="color:var(--txt)">${c.title || c.id}</b> — ${c.author || 'autor no declarado'}
      · <span style="color:var(--acc2)">${c.license}</span>
      ${c.source_url ? `· <a href="${c.source_url}" target="_blank" rel="noopener" style="color:var(--acc)">fuente</a>` : ''}</li>`).join('');

  body.innerHTML = `
    <p>Las monturas 3D que ves puestas sobre tu cara son modelos de terceros.
    Las licencias CC-BY <b style="color:var(--txt)">obligan</b> a acreditar al autor, así que acá están.</p>
    <h3 style="color:var(--txt)">En uso en el probador</h3><ul>${tabla(enUso) || '<li>—</li>'}</ul>
    ${resto.length ? `<h3 style="color:var(--txt)">Descargadas, sin usar</h3><ul>${tabla(resto)}</ul>` : ''}
    <p style="color:var(--dim2)">El detector de caras es MediaPipe (Apache-2.0, Google) y el motor 3D es
    three.js (MIT). Ninguna marca de anteojos auspicia ni avala esta herramienta:
    los nombres de modelo se usan de forma descriptiva para poder comparar medidas y precios.</p>`;
  modal('Créditos y licencias', body);
}

function showGuide() {
  const body = el('div');
  body.style.cssText = 'font-size:13px;line-height:1.75;color:var(--dim)';
  const g = S.catalog.buying_guide;
  let html = '';
  if (S.measures) {
    const sug = suggestSize(S.measures);
    html += `<h3 style="color:var(--txt)">Tus medidas</h3>
      <p>Distancia interpupilar <b style="color:var(--txt)">${S.measures.pd.toFixed(0)} mm</b> ·
      ancho de cara <b style="color:var(--txt)">${S.measures.faceWidth.toFixed(0)} mm</b>.<br>
      Pedí en la óptica un armazón <b style="color:var(--txt)">${sug.reading}</b>
      (calibre ${sug.range[0]}–${sug.range[1]} mm, ancho total cerca de ${sug.frameWidth} mm).<br>
      <span style="color:var(--dim2)">Medido con el iris como regla: el iris humano mide 11,7 mm en casi todos los adultos.</span></p>`;
  }
  if (g) {
    html += '<h3 style="color:var(--txt)">Antes de comprar</h3>';
    for (const [k, v] of Object.entries(g)) {
      html += `<p><b style="color:var(--txt)">${k.replace(/_/g, ' ')}</b><br>${typeof v === 'string' ? v : JSON.stringify(v)}</p>`;
    }
  }
  const lo = S.catalog.lens_only || [];
  if (lo.length) {
    html += `<h3 style="color:var(--txt)">Otra vía: comprar solo los cristales</h3>
      <p>Elegís el armazón que te gustó acá y la óptica le monta cristales planos con
      filtro. Suele salir bastante menos que un par ya armado:</p><ul>`;
    for (const l of lo) {
      const price = l.priceArs ? `$${Number(l.priceArs).toLocaleString('es-AR')} ARS`
        : (l.priceUsd ? `US$${l.priceUsd}` : 'sin precio publicado');
      const link = l.buyUrl ? ` — <a href="${l.buyUrl}" target="_blank" rel="noopener" style="color:var(--acc)">ver</a>` : '';
      html += `<li><b style="color:var(--txt)">${l.brand}</b>: ${l.model} — ${price}${link}</li>`;
    }
    html += '</ul>';
  }

  html += `<h3 style="color:var(--txt)">Cómo leer los números</h3>
    <p><b style="color:var(--txt)">52–18–145</b> es calibre–puente–varilla en milímetros. El calibre es el ancho de
    cada cristal, el puente la separación entre los dos, la varilla el largo de la patilla.
    Sumados, dos calibres + el puente + los terminales dan el ancho total, que es lo que
    tiene que coincidir con el ancho de tu cara.</p>
    <p style="color:var(--dim2)">Los modelos marcados con ⚠ tienen medidas aproximadas de referencia,
    no verificadas contra la ficha del fabricante. La forma que ves es una representación del modelo,
    no una foto del producto: sirve para decidir forma, tamaño y color, no para juzgar terminaciones.</p>`;
  body.innerHTML = html;
  modal('Guía de compra', body);
}

/* ================= arranque ================= */

function bind() {
  $('#startCam').onclick = () => startCamera().catch((e) => {
    $('#gate').innerHTML = `<h1>No pude prender la cámara</h1><p>${e.message}</p>
      <p style="color:var(--dim2)">Si el browser bloqueó el permiso, habilitalo y recargá.</p>`;
  });
  $('#startPhoto').onclick = () => $('#photoInput').click();
  $('#photoInput').onchange = (e) => { if (e.target.files[0]) startPhoto(e.target.files[0]); };
  $('#search').oninput = (e) => { S.filters.q = e.target.value; applyFilters(); };
  const mode = $('#modeBtn');
  const paintMode = () => { mode.textContent = S.mode3d ? '◉ 3D real' : '◻ Silueta'; mode.className = 'btn ghost' + (S.mode3d ? ' on' : ''); };
  mode.onclick = () => {
    S.mode3d = !S.mode3d;
    localStorage.setItem('gt_mode', S.mode3d ? '3d' : 'silueta');
    if (S.mode3d) { ensure3d(); load3dFor(S.current); } else { S.asset3d = null; }
    paintMode(); renderDetail();
  };
  paintMode();
  $('#creditsBtn').onclick = showCredits;
  $('#galleryBtn').onclick = showGallery;
  $('#guideBtn').onclick = showGuide;
  $('#shotBtn').onclick = snapshot;
  $('#favBtn').onclick = () => S.current && toggleFav(S.current);
  $('#offBtn').onclick = () => { S.current = null; refreshCards(); renderDetail(); renderNowPlaying(); renderHud(); };
  $('#prevBtn').onclick = () => step(-1);
  $('#nextBtn').onclick = () => step(1);

  document.onkeydown = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === ' ') { snapshot(); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'f' && S.current) toggleFav(S.current);
    else if (e.key === 'Escape') $('#offBtn').click();
  };
}

function step(d) {
  if (!S.filtered.length) return;
  const i = S.current ? S.filtered.findIndex((m) => m.id === S.current.id) : -1;
  select(S.filtered[(i + d + S.filtered.length) % S.filtered.length]);
}

// Gancho de pruebas: permite manejar la app desde un browser headless.
window.__gt = {
  S, select, applyFilters, snapshot,
  byId: (id) => S.models.find((m) => m.id === id),
  pick: (id) => { const m = S.models.find((x) => x.id === id); if (m) select(m); return !!m; },
  setColors: (c, l) => { S.colorIdx = c; S.lensIdx = l; renderDetail(); },
  ready: () => !!S.source && !!S.measures,
  ready3d: () => !S.loading3d && (!S.asset3d || !!(r3d && r3d.current)),
  asset3d: () => (S.asset3d ? S.asset3d.id : null),
  mats: () => (r3d ? r3d.matReport : null),
  liveMats: () => (r3d ? r3d.liveMats() : null),
  // Canvas 3D crudo, sobre un fondo a eleccion: separa un problema de material
  // de un problema de compuesto.
  raw3d: (bg) => {
    if (!r3d || !r3d.canvas) return null;
    const c = document.createElement('canvas');
    c.width = r3d.canvas.width; c.height = r3d.canvas.height;
    const cx = c.getContext('2d');
    if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, c.width, c.height); }
    cx.drawImage(r3d.canvas, 0, 0);
    return c.toDataURL('image/png');
  },
  style: () => (S.current ? styleOf(S.current) : null),
  set3d: (on) => { S.mode3d = on; if (on) { ensure3d(); load3dFor(S.current); } },
  // Caja de la zona de los anteojos en pixeles del canvas, para recortes de prueba.
  faceBox: () => {
    const p = S.lastPose; if (!p) return null;
    const half = p.measures.faceWidth * p.pxPerMm * 0.78;
    const cx = renderer.mirror ? canvas.width - p.origin[0] : p.origin[0];
    return { x: Math.max(0, cx - half), y: Math.max(0, p.origin[1] - half * 0.62),
             w: Math.min(canvas.width, half * 2), h: Math.min(canvas.height, half * 1.3) };
  },
};

(async function main() {
  await loadCatalog();
  renderFilters();
  applyFilters();
  bind();
  $('#footNote').textContent = `${S.models.length} modelos · ${S.catalog.counts.marcas} marcas`;
})();
