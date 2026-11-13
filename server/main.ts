import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createBaseApp } from './app.js';
import { registerGenerator } from './generator.js';
import { ProviderSettings } from './provider.js';
import { importHubspot } from './hubspot.js';
import { hubspotRemote } from './hubspot-remote.js';
import { lockInstance } from './instance.js';
import { inspectConnection } from './connection.js';
import { publishEndpoint } from './endpoint.js';
import { registerTeamSync } from './team-sync.js';
import { registerCopyInspection } from './copy-inspection.js';
import { mountHubspotReadCheck } from './hubspot-read-check-mount.js';
import { registerContinuityEvidenceApi } from './continuity-evidence-api.js';
import { mountRelayRehearsal } from './relay-rehearsal-mount.js';
import { registerWorkSummaryApi } from './work-summary-api.js';
import { registerTaskIntents } from './task-intents-api.js';
import { mountCommitmentRadar } from './commitment-radar-mount.js';
import { mountOperationalRehearsal } from './operational-rehearsal-mount.js';
import { mountDateCheck } from './date-check-mount.js';
import { mountDateCheckReview } from './date-check-review-mount.js';

const root = process.cwd();
const releaseLock=lockInstance(resolve(process.env.PLANB_DATA_DIR || join(root,'data')));
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'));
const providers = new ProviderSettings(join(root, '.ai.local.json'));
const { app, store, security } = await createBaseApp({
  dbPath: resolve(process.env.PLANB_DATA_DIR || join(root, 'data'), 'planb.sqlite'),
  root, staticDir: join(root, 'dist'),
  taskRevisions: true,
  aiConfigured: () => !!providers.read(),
  aiPublic: () => providers.public(),
  hubspotConfigured: () => !!process.env.PLANB_HUBSPOT_TOKEN
  ,external:{capture:importHubspot,remote:hubspotRemote,inspect:inspectConnection}
});
mountHubspotReadCheck(app, store, security);
mountRelayRehearsal(app, store, security);
registerGenerator(app, store, providers);
registerCopyInspection(app,store);
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
registerTeamSync(app,store,process.env.PLANB_TEAM_ORIGIN,process.env.PLANB_TEAM_DEMO==='1');
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
