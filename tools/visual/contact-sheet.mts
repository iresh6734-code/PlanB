// Hoja de contactos: junta varias capturas en una imagen para revisarlas de un vistazo.
// Uso: npx tsx tools/visual/contact-sheet.mts <salida.png> <columnas> <anchoCelda> <captura1> <captura2> ...
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const [out, colsArg, cellArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg), cell = Number(cellArg);
const html = `<html><body style="margin:0;background:#888;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:6px;padding:6px;align-items:start">` +
  files.map(f => `<figure style="margin:0;background:#fff"><figcaption style="padding:2px 4px;background:#222;color:#fff">${basename(f)}</figcaption><img style="width:${cell}px;display:block" src="data:image/png;base64,${readFileSync(f).toString('base64')}"></figure>`).join('') + '</div></body></html>';
const browser = await chromium.launch(process.env.MISION_CHROME ? { executablePath: process.env.MISION_CHROME } : {});
const page = await browser.newPage({ viewport: { width: cols * (cell + 6) + 6, height: 600 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('OK', out);
