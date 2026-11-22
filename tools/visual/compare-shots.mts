// Compara dos carpetas de capturas (las de tools/visual/composition.mts) píxel a píxel, sin dependencias: decodifica y cuenta
// dentro del navegador. Sirve para retirar CSS con seguridad: referencia antes, captura después y aquí se ve qué cambió.
// Uso: npx tsx tools/visual/compare-shots.mts <carpetaA> <carpetaB> [umbral de píxeles distintos, por defecto 0]
import { chromium } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [dirA, dirB, limitArg] = process.argv.slice(2);
const limit = Number(limitArg ?? 0);
const browser = await chromium.launch(process.env.MISION_CHROME ? { executablePath: process.env.MISION_CHROME } : {});
const page = await browser.newPage();
const files = readdirSync(dirA).filter(name => name.endsWith('.png') && existsSync(path.join(dirB, name))).sort();
let changed = 0;
for (const name of files) {
  const a = 'data:image/png;base64,' + readFileSync(path.join(dirA, name)).toString('base64');
  const b = 'data:image/png;base64,' + readFileSync(path.join(dirB, name)).toString('base64');
  const result = await page.evaluate(`(async () => {
    const load = src => new Promise((ok, ko) => { const img = new Image(); img.onload = () => ok(img); img.onerror = ko; img.src = src; });
    const [x, y] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
    const w = Math.max(x.width, y.width), h = Math.max(x.height, y.height);
    const read = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const p = read(x), q = read(y); let diff = 0, top = h, bottom = -1;
    for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) { diff++; const row = Math.floor(i / 4 / w); if (row < top) top = row; if (row > bottom) bottom = row; }
    return { diff, size: [x.width + 'x' + x.height, y.width + 'x' + y.height], rows: diff ? top + '–' + bottom : '' };
  })()`) as { diff: number; size: string[]; rows: string };
  const differs = result.diff > limit || result.size[0] !== result.size[1];
  if (differs) changed++;
  console.log((differs ? 'DIFIERE ' : 'igual   ') + name.padEnd(36) + String(result.diff).padStart(8) + ' px  ' + (result.size[0] === result.size[1] ? result.size[0] : result.size.join(' → ')) + (result.rows ? '  filas ' + result.rows : ''));
}
await browser.close();
console.log(changed ? changed + ' de ' + files.length + ' capturas difieren.' : 'Las ' + files.length + ' capturas son iguales.');
