/**
 * build_catalog.mjs — Une la semilla curada con lo que devuelven los agentes de
 * investigacion (data/research/*.json) y escribe data/catalog.json.
 *
 * Regla de merge: el dato VERIFICADO en la pagina del fabricante siempre le gana
 * a la semilla. Lo que ningun agente confirmo queda marcado verified:false para
 * que la UI lo muestre como aproximado y nadie compre por una medida inventada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = path.join(ROOT, 'data', 'research');

// Un hex invalido de la investigacion no puede llegar al renderer: se descarta el color.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const cleanHex = (h) => (typeof h === 'string' && HEX.test(h.trim()) ? h.trim().toLowerCase() : null);
let dropped = 0;

// La investigacion trae la misma marca escrita de dos formas; sin unificar,
// el desplegable muestra "Gunnar" y "Gunnar Optiks" como si fueran distintas.
const BRAND_ALIAS = {
  'gunnar optiks': 'Gunnar',
  'quay australia': 'Quay',
  'ray ban': 'Ray-Ban',
  'rayban': 'Ray-Ban',
  'warby parker eyewear': 'Warby Parker',
  'ambr eyewear': 'Ambr',
  'zenni': 'Zenni Optical',
  'pixel': 'Pixel Eyewear',
};
const canonBrand = (b) => BRAND_ALIAS[String(b || '').trim().toLowerCase()] || String(b || '').trim();

// Algunas entradas no son anteojos: son cristales sueltos que la optica te monta
// en el armazon que elijas. No se pueden "probar", asi que salen del catalogo de
// prueba y van aparte, como opcion de compra en la guia.
const LENS_ONLY = /par de cristales|sin armaz|cristales? (organic|sueltos)|lentes organicas|^lente[s]? /i;

// El mismo modelo llega escrito con y sin el codigo de referencia al final
// ("Sutro" y "Sutro (OO9406)"), y sin normalizar aparece dos veces en el catalogo.
const key = (b, m) =>
  `${canonBrand(b)}|${String(m || '').replace(/\s*\([^)]*\)\s*$/, '')}`
    .toLowerCase().replace(/[^a-z0-9|]/g, '');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Opacidad plausible del cristal segun como lo describen.
function lensOpacity(name = '', { mirrored, polarized, category } = {}) {
  const n = name.toLowerCase();
  if (category === 'blue_light' || /azul|blue|claro|transparent|clear/.test(n)) return /ambar|amber|amarill|yellow/.test(n) ? 0.18 : 0.10;
  if (mirrored) return 0.60;
  if (polarized) return 0.64;
  if (/degrade|gradient/.test(n)) return 0.50;
  if (/oscur|dark|negro|black|gris|grey|gray|g-15|humo|smoke/.test(n)) return 0.62;
  return 0.55;
}

const CATEGORY = { blue_light: 'blue_light', optical_frame: 'optical', optical: 'optical', sunglasses: 'sunglasses' };
const SHAPE_OK = new Set(['rectangle','square','round','oval','panto','hexagonal','octagonal','wayfarer','aviator','cat_eye','browline','geometric','shield','oversized']);

// La investigacion usa nombres de vidriera que no son nuestras siluetas. Sin este
// mapeo, un envolvente deportivo caia en "rectangular" y se dibujaba plano: el
// probador mostraria una forma que no es la del modelo.
const SHAPE_ALIAS = {
  sport: 'shield', wrap: 'shield', wraparound: 'shield', mask: 'shield', shield_wrap: 'shield',
  pantos: 'panto', navigator: 'aviator', pilot: 'aviator', teardrop: 'aviator',
  butterfly: 'oversized', shield_oversized: 'oversized',
  semi_rimless: 'rectangle', 'semi-rimless': 'rectangle', rimless: 'rectangle',
  ovalada: 'oval', redonda: 'round', cuadrada: 'square', rectangular: 'rectangle',
  cateye: 'cat_eye', 'cat-eye': 'cat_eye', clubmaster: 'browline',
  hexagon: 'hexagonal', octagon: 'octagonal', angular: 'geometric',
};
const canonShape = (sh) => {
  const k = String(sh || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (SHAPE_OK.has(k)) return k;
  return SHAPE_ALIAS[k] || null;
};
let shapeFallback = 0, shapeFromName = 0;

// Cuando la investigacion no pudo verificar la forma, el nombre del producto
// suele decirla ("Gray Aviator Glasses", "Black Bravo Browline"). Es mejor que
// mandar todo a rectangular, pero queda marcado como inferido.
const NAME_SHAPE = [
  [/\bbrowline|clubmaster\b/i, 'browline'], [/\bcat[- ]?eye\b/i, 'cat_eye'],
  [/\baviator|pilot|navigator\b/i, 'aviator'], [/\bwayfarer\b/i, 'wayfarer'],
  [/\bhexagon/i, 'hexagonal'], [/\boctagon/i, 'octagonal'],
  [/\bround\b/i, 'round'], [/\boval\b/i, 'oval'], [/\bpanto/i, 'panto'],
  [/\bsquare\b/i, 'square'], [/\brectangl/i, 'rectangle'],
  [/\boversiz|butterfly\b/i, 'oversized'], [/\bgeometric\b/i, 'geometric'],
  [/\bshield|wrap|sport|goggle\b/i, 'shield'],
];
const shapeFromModelName = (name) => {
  for (const [re, sh] of NAME_SHAPE) if (re.test(name || '')) return sh;
  return null;
};

function fromResearch(r) {
  const cat = CATEGORY[r.category] || 'sunglasses';
  let lensColors = [];
  if (Array.isArray(r.lens_colors) && r.lens_colors.length) {
    lensColors = r.lens_colors.map((l) => ({ ...l, hex: cleanHex(l && l.hex) }))
      .filter((l) => { if (!l.hex) { dropped++; return false; } return true; })
      .map((l) => ({
      name: l.name || 'Cristal', hex: l.hex, mirrored: !!l.mirrored, polarized: !!l.polarized,
      opacity: lensOpacity(l.name, { mirrored: l.mirrored, polarized: l.polarized, category: r.category }),
    }));
  } else if (cleanHex(r.lens_tint)) {
    lensColors = [{ name: 'Filtro luz azul', hex: cleanHex(r.lens_tint), mirrored: false, polarized: false, opacity: lensOpacity('', { category: r.category }) }];
  }
  if (!lensColors.length) {
    lensColors = cat === 'sunglasses'
      ? [{ name: 'Gris', hex: '#3a3d42', opacity: 0.62, mirrored: false, polarized: false }]
      : [{ name: 'Transparente', hex: '#e9eef2', opacity: 0.10, mirrored: false, polarized: false }];
  }
  const frameColors = (r.frame_colors || [])
    .map((c) => ({ name: (c && c.name) || 'Color', hex: cleanHex(c && c.hex) }))
    .filter((c) => { if (!c.hex) { dropped++; return false; } return true; });

  return {
    brand: canonBrand(r.brand), model: r.model, category: cat,
    shape: canonShape(r.shape),
    gender: r.gender || 'unisex',
    lensWidth: r.lens_width_mm || null, bridge: r.bridge_mm || null, templeLength: r.temple_mm || null,
    material: r.material || null,
    frameColors: frameColors.length ? frameColors : null,
    lensColors,
    priceUsd: r.price_usd ?? null, priceArs: r.price_ars ?? null,
    buyUrl: r.buy_url || null,
    argentina: r.available_in_argentina === true || r.available_in_argentina === 'true',
    importOnly: r.available_in_argentina === 'import',
    blueLightBlock: r.blue_light_block || r.blueLightBlock || null,
    faceShapes: r.face_shapes_recommended || null,
    iconic: !!r.iconic,
    notes: r.notes || null,
    verified: true,
    source: 'investigado y verificado en la web',
  };
}

function mergeInto(map, entry) {
  const k = key(entry.brand, entry.model);
  const prev = map.get(k);
  if (!prev) { map.set(k, entry); return; }
  const out = { ...prev };
  for (const [field, val] of Object.entries(entry)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (field === 'model' || field === 'brand') continue;   // el nombre lo fija el primero
    out[field] = val;                       // el dato verificado pisa a la semilla
  }
  map.set(k, out);
}

const map = new Map();
for (const s of SEED) mergeInto(map, { ...s, brand: canonBrand(s.brand) });

let researched = 0;
const sources = new Set();
let buyingGuide = null;
if (fs.existsSync(RESEARCH)) {
  for (const f of fs.readdirSync(RESEARCH).filter((f) => f.endsWith('.json'))) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(RESEARCH, f), 'utf8')); }
    catch (e) { console.warn(`  ! ${f} no es JSON valido, lo salteo: ${e.message}`); continue; }
    (data.sources || []).forEach((u) => sources.add(u));
    if (data.buying_guide) buyingGuide = { ...(buyingGuide || {}), ...data.buying_guide };
    for (const m of data.models || []) {
      if (!m.brand || !m.model) continue;
      mergeInto(map, fromResearch(m));
      researched++;
    }
    console.log(`  + ${f}: ${(data.models || []).length} modelos`);
  }
}

// Separamos los cristales sueltos antes de armar el catalogo de prueba.
const all = [...map.values()];
const lensOnly = all.filter((m) => LENS_ONLY.test(m.model || ''));
const wearable = all.filter((m) => !LENS_ONLY.test(m.model || ''));

// Defaults finales y saneo: ningun modelo puede quedar sin forma ni sin medidas.
const models = wearable.map((m) => {
  const cat = m.category === 'optical_frame' ? 'optical' : m.category;
  const lensWidth = m.lensWidth || (cat === 'sunglasses' ? 54 : 51);
  return {
    id: `${slug(m.brand)}--${slug(m.model)}`,
    ...m,
    category: cat,
    shape: canonShape(m.shape)
      || (() => { const g = shapeFromModelName(m.model); if (g) { shapeFromName++; return g; } shapeFallback++; return 'rectangle'; })(),
    shapeGuessed: !canonShape(m.shape),
    lensWidth,
    bridge: m.bridge || Math.round(lensWidth * 0.33),
    templeLength: m.templeLength || 145,
    material: m.material || 'acetato',
    frameColors: (m.frameColors && m.frameColors.length)
      ? m.frameColors.map((c) => ({ name: c.name, hex: cleanHex(c.hex) || '#141414' }))
      : [{ name: 'Negro', hex: '#141414' }],
    lensColors: (m.lensColors || []).map((l) => ({ ...l, hex: cleanHex(l.hex) || '#e9eef2' })),
    gender: ['male', 'female', 'unisex'].includes(m.gender) ? m.gender : 'unisex',
  };
}).sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));

const counts = (field) => models.reduce((a, m) => { a[m[field]] = (a[m[field]] || 0) + 1; return a; }, {});
const out = {
  generated_at: new Date().toISOString(),
  counts: {
    total: models.length,
    verificados: models.filter((m) => m.verified).length,
    categoria: counts('category'), genero: counts('gender'), forma: counts('shape'),
    marcas: new Set(models.map((m) => m.brand)).size,
    en_argentina: models.filter((m) => m.argentina).length,
  },
  buying_guide: buyingGuide,
  // Cristales sueltos: se compran aparte y se montan en cualquier armazon.
  lens_only: lensOnly.map((m) => ({
    brand: m.brand, model: m.model, priceArs: m.priceArs ?? null, priceUsd: m.priceUsd ?? null,
    buyUrl: m.buyUrl || null, notes: m.notes || null,
  })),
  sources: [...sources],
  models,
};

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'catalog.json'), JSON.stringify(out, null, 1));
if (lensOnly.length) console.log(`  ${lensOnly.length} entradas son cristales sueltos -> van aparte, no al probador`);
console.log(`\ncatalog.json -> ${models.length} modelos (${out.counts.verificados} verificados, ${researched} entradas de investigacion)`);
console.log('  categorias:', JSON.stringify(out.counts.categoria));
console.log('  marcas:', out.counts.marcas, '| en Argentina:', out.counts.en_argentina);
if (dropped) console.log(`  ${dropped} colores con hex invalido descartados`);
if (shapeFromName) console.log(`  ${shapeFromName} formas deducidas del nombre del producto`);
if (shapeFallback) console.log(`  ${shapeFallback} modelos sin forma ni pista en el nombre -> rectangular, marcados como inferidos`);
