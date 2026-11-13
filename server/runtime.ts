import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createBaseApp } from './app.js';
import { lockInstance } from './instance.js';
import { publishEndpoint } from './endpoint.js';
import { registerContinuityEvidenceApi } from './continuity-evidence-api.js';
import { registerWorkSummaryApi } from './work-summary-api.js';
import { registerTaskIntents } from './task-intents-api.js';
import { mountCommitmentRadar } from './commitment-radar-mount.js';
import { mountOperationalRehearsal } from './operational-rehearsal-mount.js';
import { mountDateCheck } from './date-check-mount.js';
import { mountDateCheckReview } from './date-check-review-mount.js';
// Deliberately does not import the generator, provider settings, or CRM connector.
const root = process.cwd();
const releaseLock=lockInstance(resolve(process.env.PLANB_DATA_DIR || join(root,'data')));
const { app, store } = await createBaseApp({
  dbPath: resolve(process.env.PLANB_DATA_DIR || join(root, 'data'), 'planb.sqlite'),
  root, staticDir: join(root, 'dist'), runtime: true, taskRevisions: true
});
registerContinuityEvidenceApi(app, store);
registerTaskIntents(app, store);
// Radar de compromisos y «Ensayar mi semana»: solo ficción, exigen copia de ensayo activa y no llaman a ningún proveedor.
mountCommitmentRadar(app, store);
mountOperationalRehearsal(app, store);
// «Comprobar una fecha» y «Revisar una decisión»: solo ficción, exigen copia de ensayo activa y no llaman a ningún proveedor.
mountDateCheck(app, store);
mountDateCheckReview(app, store);
// The work summary remains unproven until the active copy has verified A4 coverage.
registerWorkSummaryApi(app, store, { covers: () => false });
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
