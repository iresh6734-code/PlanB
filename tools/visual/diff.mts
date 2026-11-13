// Dice DÓNDE difieren dos capturas (sin dependencias: compara los píxeles dentro del navegador).
//   npx tsx tools/visual/diff.mts 1366-oportunidades
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.env.PLANB_VISUAL_DIR ?? 'tests/.tmp/visual');
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
// tsx envuelve las funciones con nombre en __name(); dentro de la página ese ayudante no existe.
await page.evaluate('globalThis.__name = value => value');
for (const name of process.argv.slice(2)) {
  const [a, b] = ['reference', 'current'].map(kind => 'data:image/png;base64,' + readFileSync(path.join(dir, kind, name + '.png')).toString('base64'));
  const result = await page.evaluate(async ([first, second]) => {
    const load = (src: string) => new Promise<HTMLImageElement>(resolve => { const image = new Image(); image.onload = () => resolve(image); image.src = src; });
    const [x, y] = await Promise.all([load(first), load(second)]);
    if (x.width !== y.width || x.height !== y.height) return { tamaño: [x.width, x.height, y.width, y.height] };
    const data = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); return context.getImageData(0, 0, image.width, image.height).data; };
    const p = data(x), q = data(y); let count = 0, left = x.width, top = x.height, right = -1, bottom = -1, max = 0;
    for (let i = 0; i < p.length; i += 4) { const delta = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])); if (delta) { count++; max = Math.max(max, delta); const px = (i / 4) % x.width, py = Math.floor(i / 4 / x.width); left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); } }
    return { píxelesDistintos: count, zona: count ? [left, top, right, bottom] : null, diferenciaMáxima: max };
  }, [a, b]);
  console.log(name, JSON.stringify(result));
}
await browser.close();
