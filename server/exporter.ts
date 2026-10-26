import archiver from 'archiver';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContinuityBundle } from '../shared/model.js';
import { AppError } from './store.js';
import { encodePortable } from './crypto.js';
import { RELEASE_TAG } from '../shared/version.js';

export async function runtimeZip(bundle: ContinuityBundle, root: string, password?:string, windowsNodePath?:string): Promise<Buffer> {
  if(!bundle.snapshot.source.isTestData&&!password)throw new AppError(403,'Los paquetes con datos reales requieren cifrado y contraseña de recuperación.');
  const runtimeFile = existsSync(join(root, 'runtime.mjs')) ? join(root, 'runtime.mjs') : join(root, 'build', 'runtime.mjs');
  const frontend = join(root, 'dist');
  if (!existsSync(runtimeFile) || !existsSync(join(frontend, 'index.html'))) throw new AppError(503, 'El paquete necesita una compilación completa de la aplicación.');
  if (windowsNodePath) {
    const binary = readFileSync(windowsNodePath);
    const pe = binary.length >= 64 ? binary.readUInt32LE(60) : -1;
    if (binary.toString('ascii', 0, 2) !== 'MZ' || pe < 64 || pe + 4 > binary.length || binary.toString('ascii', pe, pe + 4) !== 'PE\0\0') {
      throw new AppError(422, 'El runtime de Windows debe ser un ejecutable PE válido; no renombres el Node de Linux como node.exe.');
    }
  }
  const archive = archiver('zip', { zlib: { level: 3 } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', data => chunks.push(Buffer.from(data)));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });
  archive.append(readFileSync(runtimeFile), { name: 'runtime.mjs' });
  archive.append(password?encodePortable(bundle,password):JSON.stringify(bundle, null, 2), { name: password?'continuity.encrypted.json':'continuity.seed.json' });
  const worker=existsSync(join(root,'drill.mjs'))?join(root,'drill.mjs'):join(root,'build','drill.mjs');
  if(existsSync(worker))archive.file(worker,{name:'drill.mjs'});
  const guard=existsSync(join(root,'block-external.cjs'))?join(root,'block-external.cjs'):join(root,'scripts','block-external.cjs');
  if(existsSync(guard))archive.file(guard,{name:'block-external.cjs'});
  const launcher=existsSync(join(root,'launch.cjs'))?join(root,'launch.cjs'):join(root,'scripts','launch.cjs');
  if(existsSync(launcher))archive.file(launcher,{name:'launch.cjs'});
  archive.directory(frontend, 'dist');
  const moduleRoot = join(root, 'runtime-assets', 'node_modules');
  const runtimeModules = existsSync(moduleRoot) ? moduleRoot : join(root, 'node_modules');
  archive.directory(runtimeModules, 'node_modules', entry => {
    const name = entry.name.replace(/^node_modules\//, '');
    return !name.split('/').some(part => ['.cache', '.bin', 'lucide-react', 'react', 'react-dom', 'scheduler'].includes(part)) && !name.endsWith('.log') ? entry : false;
  });
  archive.file(windowsNodePath ?? process.execPath, { name: windowsNodePath || process.platform === 'win32' ? 'node.exe' : 'node' });
  const license = join(root, 'NODE-LICENSE.txt');
  if (existsSync(license)) archive.file(license, { name: 'NODE-LICENSE.txt' });
  const frontendLicense=join(root,'THIRD-PARTY-LICENSES.txt');
  if(existsSync(frontendLicense))archive.file(frontendLicense,{name:'THIRD-PARTY-LICENSES.txt'});
  const releaseGuide=join(root,'LEEME-'+RELEASE_TAG+'.md');
  if(existsSync(releaseGuide))archive.file(releaseGuide,{name:'LEEME-'+RELEASE_TAG+'.md'});
  archive.append('@echo off\r\ncd /d "%~dp0"\r\n"%~dp0node.exe" launch.cjs runtime.mjs\r\nif errorlevel 1 pause\r\n', { name: 'ABRIR PLAN B.cmd' });
  archive.append('# Plan B '+RELEASE_TAG+' · Aplicación independiente\n\n1. Extrae todo el ZIP en una carpeta de Windows.\n2. Abre ABRIR PLAN B.cmd. El iniciador abre el navegador local y reutiliza una instancia ya abierta.\n' +
    (password?'3. Configura una contraseña local. Pulsa Restaurar archivo, selecciona continuity.encrypted.json e introduce la contraseña de recuperación que elegiste al exportar. La contraseña no está incluida en el ZIP.\n':'3. Los datos ficticios de continuity.seed.json se cargan en el primer inicio.\n') +
    '\nNode, dependencias y recursos visuales están incluidos. No se necesita HubSpot ni un proveedor IA. Los conectores y sus credenciales no están en este paquete.\n\nLos cambios se conservan en data/planb.sqlite, con valores cifrados y una clave data/.planb-key protegida por DPAPI para tu usuario de Windows. Conserva la carpeta completa y detén el servidor antes de moverla. Para cambiar de usuario o equipo, exporta una copia con contraseña desde la app y restáurala en el destino; copiar solo la base no transfiere DPAPI.\n\nLa base activa prevalece sobre el archivo inicial después de restaurar. Puedes trabajar, exportar cambios JSON/CSV, crear copias cifradas y ejecutar el simulacro aislado. La recuperación manual de producción se comprueba por lectura en el generador; este paquete no tiene conexión a HubSpot. Una exportación no confirma la devolución.\n\nEsta entrega admite un operador, un portal y hasta 10.000 registros totales. Conserva la contraseña de recuperación por separado: no existe un servicio para recuperarla.\n', { name: 'LEEME.md' });
  await archive.finalize();
  return finished;
}
