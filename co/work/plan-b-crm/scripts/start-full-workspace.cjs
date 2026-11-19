// Restore the existing CRM on this computer. The commercial pilot keeps its own service and data.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const CRM_ORIGIN = 'http://127.0.0.1:4331';
const PILOT_ORIGIN = 'http://localhost:4334';
const STARTUP_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 1_000;
function workspacePaths(root) {
  return {
    runtime: path.join(root, 'planb-local-crm-completo-2026-10-29', 'runtime'),
    data: path.join(root, 'planb-local-ux-2026-10-27', 'data', 'local'),
  };
}
function cleanEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^FIREBASE_|^GOOGLE_|^HUBSPOT_|^OPENAI_|^ANTHROPIC_|^AZURE_|^AWS_|NODE_OPTIONS|NODE_ENV|^PLANB_/i.test(name)));
}
function matchesExisting(health, endpoint, origin = CRM_ORIGIN) {
  return health?.ok === true && typeof health.instanceId === 'string' && health.instanceId.length > 0 && endpoint?.instanceId === health.instanceId && endpoint?.url === origin;
}
function readEndpoint(data) {
  try { return JSON.parse(fs.readFileSync(path.join(data, '.endpoint.json'), 'utf8')); }
  catch (error) {
    // The server may be publishing the receipt at the same instant as the probe.
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}
function probe(url) {
  return new Promise((resolve, reject) => {
    // A fresh direct socket distinguishes a closed port from a stale keep-alive after a crash.
    const request = http.get(url, { agent: false, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 128 * 1024) {
          request.destroy(new Error('La respuesta del CRM es demasiado grande.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode,
        contentType: response.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}
async function inspectHealth(origin) {
  let response;
  try { response = await probe(origin + '/api/health'); }
  catch (error) { return { kind: error.code === 'ECONNREFUSED' ? 'absent' : 'unreachable' }; }
  if (response.status !== 200) return { kind: 'other' };
  try { return { kind: 'responded', state: JSON.parse(response.body) }; }
  catch { return { kind: 'other' }; }
}
async function verifyHome(origin) {
  try {
    const response = await probe(origin + '/');
    const html = response.contentType?.split(';', 1)[0].trim().toLowerCase();
    return response.status === 200 && html === 'text/html' && /<!doctype\s+html\b|<html[\s>]/i.test(response.body);
  } catch {
    return false;
  }
}
function launchRuntime(runtime, data, port) {
  const log = fs.openSync(path.join(runtime, 'crm.log'), 'a');
  try {
    return spawn(process.execPath, ['--require', path.join(runtime, 'block-external.cjs'), path.join(runtime, 'server.mjs')], {
      cwd: runtime, env: { ...cleanEnvironment(process.env), PLANB_PORT: port, PLANB_DATA_DIR: data, PLANB_TEAM_ORIGIN: PILOT_ORIGIN },
      windowsHide: true, detached: true, stdio: ['ignore', log, log],
    });
  } finally { fs.closeSync(log); }
}
async function ensureWorkspace({ runtime, data, origin, timeout = STARTUP_TIMEOUT_MS }) {
  const { port } = new URL(origin);
  const result = { ok: true, crm: origin, commercial: PILOT_ORIGIN + '/team' };
  let existing = await inspectHealth(origin);
  if (existing.kind === 'unreachable') {
    // Windows can briefly reset a new connection while tearing down the previous process.
    await delay(200);
    existing = await inspectHealth(origin);
  }
  if (existing.kind !== 'absent') {
    if (existing.kind === 'unreachable') throw new Error('El puerto ' + port + ' no respondió a tiempo. Revisa crm.log antes de volver a abrir el CRM.');
    if (!matchesExisting(existing.state, readEndpoint(data), origin)) throw new Error('El servicio del puerto ' + port + ' no coincide con el recibo de esta instalación.');
    if (!(await verifyHome(origin))) throw new Error('El CRM responde en salud, pero su portada no está disponible. Revisa crm.log y los archivos de interfaz.');
    return { ...result, reused: true };
  }

  const child = launchRuntime(runtime, data, port);
  let launchError;
  child.on('error', error => { launchError = error; });
  child.unref();
  const deadline = performance.now() + timeout;
  let homeUnavailable = false;
  while (performance.now() < deadline) {
    if (launchError) throw launchError;
    const { state } = await inspectHealth(origin);
    if (state) {
      const endpoint = readEndpoint(data);
      if (matchesExisting(state, endpoint, origin)) {
        if (await verifyHome(origin)) {
          return endpoint.pid === child.pid ? { ...result, pid: child.pid, reused: false } : { ...result, reused: true };
        }
        homeUnavailable = true;
      }
    }
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('El proceso del CRM terminó antes de confirmar el arranque (' + (child.signalCode ?? child.exitCode) + '). Revisa crm.log.');
    }
    await delay(300);
  }
  if (homeUnavailable) throw new Error('El CRM responde en salud, pero su portada no está disponible. Revisa crm.log y los archivos de interfaz.');
  throw new Error('No se confirmó el arranque del CRM en el puerto ' + port + ' dentro del plazo. Revisa crm.log.');
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
  return ensureWorkspace({ runtime, data, origin: CRM_ORIGIN });
}
module.exports = { CRM_ORIGIN, PILOT_ORIGIN, workspacePaths, cleanEnvironment, matchesExisting, ensureWorkspace, start };
if (require.main === module) start().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
