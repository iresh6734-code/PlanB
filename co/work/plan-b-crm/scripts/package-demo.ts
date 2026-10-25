import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import archiver from 'archiver';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { runtimeZip } from '../server/exporter.js';

const root = resolve('.'), output = resolve('../../outputs'), release = resolve('release', 'Plan-B-CRM-v2.1');
if(release!==join(root,'release','Plan-B-CRM-v2.1'))throw new Error('Ruta de paquete inesperada.');
if(existsSync(release))rmSync(release,{recursive:true,force:true,maxRetries:3});
mkdirSync(release, { recursive: true }); mkdirSync(output, { recursive: true });
for (const required of ['build/server.mjs','build/runtime.mjs','build/drill.mjs','dist/index.html','runtime-assets/node_modules','NODE-LICENSE.txt','LEEME-V2.md']) {
  if (!existsSync(join(root, required))) throw new Error('Falta preparar ' + required);
}
const seed = new Store(':memory:'), fixture = makeFixture();
seed.importSnapshot(fixture);
seed.saveGeneration(makeDemoSpec(fixture), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
seed.activate(); seed.set('disconnected', true);
const bundle = seed.bundle(); seed.close();
console.log('Preparando datos y recursos…');
writeFileSync(join(release, 'demo.seed.json'), JSON.stringify(bundle, null, 2));
for (const [from, to] of [
  ['build/server.mjs', 'server.mjs'], ['build/runtime.mjs','runtime.mjs'],['build/drill.mjs','drill.mjs'],['scripts/block-external.cjs','block-external.cjs'], ['dist','dist'],
  ['runtime-assets/node_modules','node_modules'], ['NODE-LICENSE.txt','NODE-LICENSE.txt'], ['THIRD-PARTY-LICENSES.txt','THIRD-PARTY-LICENSES.txt'], ['LEEME-V2.md','LEEME.md'],['scripts/inicio-automatico.ps1','INICIO AUTOMATICO.ps1'],['scripts/start-hidden.ps1','INICIAR EN SEGUNDO PLANO.ps1']
]) cpSync(join(root, from), join(release, to), { recursive: true,
  filter: path => !path.split(sep).some(part => ['.bin','lucide-react','react','react-dom','scheduler'].includes(part)) });
cpSync(process.execPath, join(release, 'node.exe'));
writeFileSync(join(release, 'ABRIR PLAN B.cmd'), '@echo off\r\ncd /d "%~dp0"\r\necho Plan B CRM - Demo local. Abre la direccion que aparece a continuacion.\r\n"%~dp0node.exe" server.mjs\r\npause\r\n');
const source = join(release, 'source'); mkdirSync(source, { recursive: true });
for (const file of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','.gitignore','LEEME.md','LEEME-V2.md','COMERCIAL-V2.md','NODE-LICENSE.txt','THIRD-PARTY-LICENSES.txt','PRODUCT.md','IMPLEMENTACION-V2.md']) cpSync(join(root, file), join(source, file));
for (const folder of ['src','server','shared','public','scripts','tests','design']) cpSync(join(root, folder), join(source, folder), {
  recursive: true, filter: path => !path.split(sep).some(part => ['.tmp','node_modules','data','release'].includes(part))
});
const evidence = join(release, 'pruebas'); mkdirSync(evidence, { recursive: true });
for (const file of readdirSync(output).filter(file => file.includes('v2.1')&&/\.(md|txt|json|png|csv|html)$/.test(file))) cpSync(join(output, file), join(evidence, file));
function verifyTree(folder: string) {
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) verifyTree(path);
    else {
      const name = relative(release, path);
      if (/^\.env|^\.ai\.local|\.sqlite(?:-|$)|\.key-setup|^\.planb-key|^\.instance/i.test(entry)) throw new Error('Archivo privado en el paquete: ' + name);
      if (!name.startsWith('node_modules') && !/\.(png|exe)$/.test(name) && /sk-proj-[A-Za-z0-9_-]{24,}/.test(readFileSync(path, 'utf8'))) throw new Error('Credencial detectada: ' + name);
    }
  }
}
verifyTree(release);
console.log('Empaquetando aplicación independiente…');
writeFileSync(join(output, 'Plan-B-independiente-v2.1.zip'), await runtimeZip(bundle, release));
console.log('Empaquetando generador y código fuente…');
await new Promise<void>((done, fail) => {
  const stream = createWriteStream(join(output, 'Plan-B-CRM-v2.1.zip')), archive = archiver('zip', { zlib: { level: 3 } });
  stream.on('close', done); stream.on('error', fail); archive.on('error', fail);
  archive.pipe(stream); archive.directory(release, false); void archive.finalize();
});
for (const file of ['Plan-B-CRM-v2.1.zip','Plan-B-independiente-v2.1.zip']) console.log(file + ' SHA256 ' + createHash('sha256').update(readFileSync(join(output,file))).digest('hex'));
console.log(JSON.stringify({ files: ['Plan-B-CRM-v2.1.zip','Plan-B-independiente-v2.1.zip'], records: bundle.records.length, relations: bundle.snapshot.links.length, secretsExcluded: true }));
