import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../delivery/plan-b-facturacion.html', import.meta.url);
const source = await readFile(new URL('../src/billing/facturacion.html', import.meta.url), 'utf8');
const { outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: ['src/billing/main.tsx'],
  outdir: 'delivery',
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
const script = outputFiles.find(file => file.path.endsWith('.js'));
const style = outputFiles.find(file => file.path.endsWith('.css'));
if (!script || !style) throw new Error('El paquete necesita los archivos compilados de interfaz y estilos.');

const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'" />`;
const html = source
  .replace('</head>', () => `  ${policy}\n    <style>${style.text.replace(/<\/style/gi, '<\\/style')}</style>\n  </head>`)
  .replace('<script type="module" src="/src/billing/main.tsx"></script>', () => `<script>${script.text.replace(/<\/script/gi, '<\\/script')}</script>`);
await mkdir(dirname(fileURLToPath(output)), { recursive: true });
await writeFile(output, html, 'utf8');
process.stdout.write(`${fileURLToPath(output)}\n`);
