/**
 * Prueba de humo visual: levanta la app en un Chrome headless, le carga una foto
 * de cara y saca capturas con distintos modelos puestos. Sin esto no hay forma
 * de saber si los anteojos caen donde tienen que caer.
 */
import puppeteer from '../../.capture/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
const PORT = process.env.PORT || '8777';
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'ray-ban--rb3025-aviator-classic',
  'ray-ban--rb2140-wayfarer-original',
  'ray-ban--rb3016-clubmaster',
  'gunnar--intercept',
  'oakley--sutro',
  'ray-ban--rb3447-round-metal',
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 2 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
await page.click('#startPhoto');
const input = await page.$('#photoInput');
await input.uploadFile(path.join(DIR, process.env.FACE || 'face.jpg'));

await page.waitForFunction('window.__gt && window.__gt.ready()', { timeout: 60000 });
console.log('detector listo, cara detectada');

const measures = await page.evaluate(() => window.__gt.S.measures);
console.log('medidas:', Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, +v.toFixed(1)])));

for (const id of MODELS) {
  const ok = await page.evaluate((i) => window.__gt.pick(i), id);
  if (!ok) { console.log(`  ! no existe ${id}`); continue; }
  // Las monturas 3D pesan varios MB: hay que esperar a que termine de cargar.
  await page.waitForFunction('window.__gt.ready3d()', { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  const fit = await page.evaluate(() => {
    const m = window.__gt.S.current;
    return { modelo: `${m.brand} ${m.model}`, asset: window.__gt.asset3d() };
  });
  const stage = await page.$('#stage');
  await stage.screenshot({ path: path.join(OUT, `${id}.png`) });

  // Recorte pegado a la cara: es donde se ve si el armazon esta bien hecho.
  const box = await page.evaluate(() => {
    const c = document.querySelector('#canvas');
    const r = c.getBoundingClientRect();
    const b = window.__gt.faceBox();
    if (!b) return null;
    const sx = r.width / c.width, sy = r.height / c.height;
    return { x: r.x + b.x * sx, y: r.y + b.y * sy, width: b.w * sx, height: b.h * sy };
  });
  if (process.env.RAW3D) {
    for (const [tag, bg] of [['sobre-blanco', '#ffffff'], ['sobre-rojo', '#cc2222'], ['sin-fondo', null]]) {
      const url = await page.evaluate((b) => window.__gt.raw3d(b), bg);
      if (url) fs.writeFileSync(path.join(OUT, `raw3d-${tag}-${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('    canvas 3D crudo guardado');
  }
  if (process.env.MATS) {
    const info = await page.evaluate(() => ({ style: window.__gt.style(), live: window.__gt.liveMats() }));
    console.log('    estilo:', JSON.stringify(info.style));
    console.log('    lentes vivas:', JSON.stringify(info.live?.lens));
  }
  if (box && box.width > 8) await page.screenshot({ path: path.join(OUT, `${process.env.PREFIX || 'zoom-'}${id}.png`), clip: box });
  console.log(`  ✓ ${fit.modelo}${fit.asset ? `  [3D: ${fit.asset}]` : '  [silueta]'}`);
}

// Una captura del panel completo, para revisar la UI.
await page.screenshot({ path: path.join(OUT, '_ui.png') });

await browser.close();
if (logs.length) { console.log('\nconsola del browser:'); logs.slice(0, 25).forEach((l) => console.log('  ' + l)); }
console.log(`\ncapturas en ${OUT}`);
