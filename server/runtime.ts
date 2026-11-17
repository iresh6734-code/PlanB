import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createBaseApp } from './app.js';
import { lockInstance } from './instance.js';
import { publishEndpoint } from './endpoint.js';
import { registerTaskIntents } from './task-intents-api.js';
import { mountSharedModules } from './modules.js';
// Deliberately does not import the generator, provider settings, or CRM connector.
const root = process.cwd();
const releaseLock=lockInstance(resolve(process.env.PLANB_DATA_DIR || join(root,'data')));
const { app, store } = await createBaseApp({
  dbPath: resolve(process.env.PLANB_DATA_DIR || join(root, 'data'), 'planb.sqlite'),
  root, staticDir: join(root, 'dist'), runtime: true, taskRevisions: true
});
registerTaskIntents(app, store);
// Módulos compartidos con la App portátil (evidencia, Laboratorio, resumen de trabajo): ver server/modules.ts.
mountSharedModules(app, store);
// Preserve damaged return evidence; never replace it automatically with the package seed.
if (!store.snapshot && store.recoveryIntegrity().state!=='invalid') {
  const encrypted=join(root,'continuity.encrypted.json');
  const seed = join(root, 'continuity.seed.json');
  if (!existsSync(seed)&&!existsSync(encrypted)) throw new Error('Falta el archivo de inicio. Extrae el paquete completo antes de iniciar.');
  if(existsSync(seed))store.restoreBundle(JSON.parse(readFileSync(seed, 'utf8')));
  else console.log('Copia cifrada: abre la página local e importa continuity.encrypted.json con tu contraseña de recuperación.');
}
let port = Number(process.env.PLANB_PORT || 4318);
for (;;) {
  try { await app.listen({ host: '127.0.0.1', port }); break; }
  catch (error) {
    if ((error as { code?: string }).code === 'EADDRINUSE' && !process.env.PLANB_PORT && port < 4328) { port++; continue; }
    throw error;
  }
}
console.log('\nPlan B · Aplicación independiente\nAbre http://127.0.0.1:' + port + '\nNo se utilizan servicios externos. Conserva la carpeta data con tus cambios.\n');
publishEndpoint(app,store,port);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => {releaseLock();process.exit(0);}); });
