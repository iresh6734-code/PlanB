import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createBaseApp } from './app.js';
import { registerGenerator } from './generator.js';
import { importHubspot } from './hubspot.js';
import { hubspotRemote } from './hubspot-remote.js';
import { lockInstance } from './instance.js';
import { inspectConnection } from './connection.js';
import { publishEndpoint } from './endpoint.js';
import { registerCopyInspection } from './copy-inspection.js';
import { mountHubspotReadCheck } from './hubspot-read-check-mount.js';
import { mountRelayRehearsal } from './relay-rehearsal-mount.js';
import { registerTaskIntents } from './task-intents-api.js';
import { mountSharedModules } from './modules.js';
import { registerCsvImport } from './csv-import.js';

const root = process.cwd();
const releaseLock=lockInstance(resolve(process.env.PLANB_DATA_DIR || join(root,'data')));
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'));
const { app, store, security } = await createBaseApp({
  dbPath: resolve(process.env.PLANB_DATA_DIR || join(root, 'data'), 'planb.sqlite'),
  root, staticDir: join(root, 'dist'),
  taskRevisions: true,
  hubspotConfigured: () => !!process.env.PLANB_HUBSPOT_TOKEN
  ,external:{capture:importHubspot,remote:hubspotRemote,inspect:inspectConnection}
});
mountHubspotReadCheck(app, store, security);
mountRelayRehearsal(app, store, security);
registerGenerator(app, store);
registerCopyInspection(app,store);
registerTaskIntents(app, store);
// Módulos compartidos con la App portátil (evidencia y resumen de trabajo): ver server/modules.ts.
mountSharedModules(app, store);
// Importar registros desde CSV (vista previa y aplicación con marca): ver server/csv-import.ts.
registerCsvImport(app, store);
const seed = join(root, 'demo.seed.json');
if (!store.snapshot && store.recoveryIntegrity().state!=='invalid' && existsSync(seed)) store.restoreBundle(JSON.parse(readFileSync(seed, 'utf8')));
let port = Number(process.env.PLANB_PORT || 4317);
for (;;) {
  try { await app.listen({ host: '127.0.0.1', port }); break; }
  catch (error) {
    if ((error as { code?: string }).code === 'EADDRINUSE' && !process.env.PLANB_PORT && port < 4327) { port++; continue; }
    throw error;
  }
}
console.log('\nPlan B CRM · Generador local\nAbre http://127.0.0.1:' + port + '\nTus datos se guardan en este ordenador. Cierra esta ventana para detener la app.\n');
publishEndpoint(app,store,port);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => {releaseLock();process.exit(0);}); });
