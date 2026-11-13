// Restore the existing CRM on this computer. The commercial pilot keeps its own service and data.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const CRM_ORIGIN = 'http://127.0.0.1:4331';
const PILOT_ORIGIN = 'http://localhost:4334';
function workspacePaths(root) {
  return {
    runtime: path.join(root, 'planb-local-crm-completo-2026-10-29', 'runtime'),
    data: path.join(root, 'planb-local-ux-2026-10-27', 'data', 'local'),
  };
}
function cleanEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^FIREBASE_|^GOOGLE_|^HUBSPOT_|^OPENAI_|^ANTHROPIC_|^AZURE_|^AWS_|NODE_OPTIONS|NODE_ENV|^PLANB_/i.test(name)));
}
function matchesExisting(health, endpoint) {
  return health?.ok === true && typeof health.instanceId === 'string' && health.instanceId.length > 0 && endpoint?.instanceId === health.instanceId && endpoint?.url === CRM_ORIGIN;
}
async function health(url) {
  try { const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1000), redirect: 'error' }); return response.ok ? await response.json() : null; } catch { return null; }
}
async function start() {
  const root = fs.realpathSync(path.resolve(__dirname, '..'));
  const { runtime, data } = workspacePaths(root);
  for (const folder of [runtime, data]) {
    if (!fs.realpathSync(folder).startsWith(root + path.sep)) throw new Error('La instalación debe permanecer en este checkout.');
  }
  if (!fs.existsSync(path.join(data, 'planb.sqlite'))) throw new Error('No se encontró la copia CRM existente. No se creará una copia vacía ni se cargarán muestras.');
  for (const name of ['server.mjs', 'drill.mjs', 'runtime.mjs', 'block-external.cjs', 'dist/index.html']) {
    if (!fs.existsSync(path.join(runtime, name))) throw new Error('Falta preparar la instalación completa: ' + name);
  }
  for (const name of ['demo.seed.json', '.env.local', '.ai.local.json']) {
    if (fs.existsSync(path.join(runtime, name))) throw new Error('La carpeta de ejecución no debe cargar semillas, variables o proveedores adicionales.');
  }
  const endpointFile = path.join(data, '.endpoint.json');
  const existing = await health(CRM_ORIGIN);
  if (existing) {
    const endpoint = fs.existsSync(endpointFile) ? JSON.parse(fs.readFileSync(endpointFile, 'utf8')) : null;
    if (!matchesExisting(existing, endpoint)) throw new Error('El puerto 4331 pertenece a otra instalación. No se modifica.');
    return { ok: true, crm: CRM_ORIGIN, commercial: PILOT_ORIGIN + '/team', reused: true };
  }
  const log = fs.openSync(path.join(runtime, 'crm.log'), 'a');
  let child;
  try {
    child = spawn(process.execPath, ['--require', path.join(runtime, 'block-external.cjs'), path.join(runtime, 'server.mjs')], {
      cwd: runtime, env: { ...cleanEnvironment(process.env), PLANB_PORT: '4331', PLANB_DATA_DIR: data, PLANB_TEAM_ORIGIN: PILOT_ORIGIN },
      windowsHide: true, detached: true, stdio: ['ignore', log, log],
    });
    child.unref();
  } finally { fs.closeSync(log); }
  let launchError;
  child.on('error', error => { launchError = error; });
  for (let i = 0; i < 40; i++) {
    if (launchError) throw launchError;
    const state = await health(CRM_ORIGIN);
    if (state && fs.existsSync(endpointFile)) {
      const endpoint = JSON.parse(fs.readFileSync(endpointFile, 'utf8'));
      if (matchesExisting(state, endpoint) && endpoint.pid === child.pid) return { ok: true, crm: CRM_ORIGIN, commercial: PILOT_ORIGIN + '/team', pid: child.pid, reused: false };
    }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('No se confirmó el CRM. Se conserva la copia y el piloto; revisa crm.log en la carpeta de ejecución.');
}
module.exports = { CRM_ORIGIN, PILOT_ORIGIN, workspacePaths, cleanEnvironment, matchesExisting, start };
if (require.main === module) start().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
