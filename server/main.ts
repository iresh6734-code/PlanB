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

const root = process.cwd();
const releaseLock=lockInstance(resolve(process.env.PLANB_DATA_DIR || join(root,'data')));
if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'));
const providers = new ProviderSettings(join(root, '.ai.local.json'));
const { app, store } = await createBaseApp({
  dbPath: resolve(process.env.PLANB_DATA_DIR || join(root, 'data'), 'planb.sqlite'),
  root, staticDir: join(root, 'dist'),
  aiConfigured: () => !!providers.read(),
  aiPublic: () => providers.public(),
  hubspotConfigured: () => !!process.env.PLANB_HUBSPOT_TOKEN
  ,external:{capture:importHubspot,remote:hubspotRemote,inspect:inspectConnection}
});
registerGenerator(app, store, providers);
registerTeamSync(app,store,process.env.PLANB_TEAM_ORIGIN,process.env.PLANB_TEAM_DEMO==='1');
const seed = join(root, 'demo.seed.json');
if (!store.snapshot && existsSync(seed)) store.restoreBundle(JSON.parse(readFileSync(seed, 'utf8')));
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
