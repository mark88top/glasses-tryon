/**
 * Calibrador de monturas 3D: carga cada modelo en Chrome headless, le corre la
 * deteccion de orientacion y saca una tira de vistas (frente / perfil / 3-4).
 * Sin mirar las vistas no hay forma de saber si un modelo quedo al reves.
 */
import puppeteer from '../../.capture/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out');
const PORT = process.env.PORT || '8777';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`http://localhost:${PORT}/test/calib.html`, { waitUntil: 'networkidle2' });
await page.waitForFunction('window.__calibDone === true', { timeout: 180000 });

const report = await page.evaluate(() => window.__calib);
fs.writeFileSync(path.join(OUT, 'calib-report.json'), JSON.stringify(report, null, 1));
await page.screenshot({ path: path.join(OUT, 'calib.png'), fullPage: true });

console.log(`${report.length} modelos | ok: ${report.filter((r) => r.ok).length}`);
for (const r of report) {
  if (!r.ok) { console.log(`  ✗ ${r.id}: ${r.error}`); continue; }
  const d = r.detected;
  console.log(`  ${r.id.padEnd(22)} ejes ${d.axes.x}${d.axes.y}${d.axes.z} signos y${d.signs.y} z${d.signs.z} conf ${d.confidence} alto ${r.stats.aspect.h} fondo ${r.stats.aspect.d}`);
}
if (errs.length) { console.log('\nerrores:'); errs.slice(0, 10).forEach((e) => console.log('  ' + e)); }
await browser.close();
console.log(`\nvistas en ${OUT}/calib.png`);
