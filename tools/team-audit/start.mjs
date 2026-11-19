#!/usr/bin/env node
// CLAUDE-TEAM-AUDIT · Ensayo propio del espacio de equipo para auditarlo.
//
//   node tools/team-audit/start.mjs            arranca y deja servidor y Vite en marcha (Ctrl+C para parar)
//   node tools/team-audit/start.mjs --audit    arranca, ejecuta tools/team-audit/run.mjs y lo para todo al terminar
//
// - Servidor de equipo en modo demo en 127.0.0.1:4531, con datos ficticios NUEVOS en tests/.tmp/perf-team-<fecha>/data,
//   directorio de trabajo propio (no lee .env.local) y red exterior bloqueada (--require scripts/block-external.cjs).
// - Vite en 127.0.0.1:5299 con /api/team hacia 4531. Nada más se proxifica: la auditoría solo usa /team.
// No usa 4431/5198 (ensayo de la sesión principal) ni toca dist/ o build/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEAM_PORT = 4531, UI_PORT = 5299;

// Modo interno: el proceso hijo que ejecuta el servidor de equipo (ya con la red bloqueada por --require).
if (process.argv[2] === '--serve-team') {
  const folder = process.argv[3];
  mkdirSync(folder, { recursive: true });
  Object.assign(process.env, { PLANB_TEAM_DEMO: '1', PLANB_TEAM_PORT: String(TEAM_PORT), PLANB_TEAM_DATA_DIR: folder, NODE_ENV: 'test' });
  process.chdir(dirname(folder));
  await import(pathToFileURL(join(REPO, 'server', 'team', 'main.ts')).href);
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const work = join(REPO, 'tests', '.tmp', 'perf-team-' + stamp), data = join(work, 'data');
  mkdirSync(data, { recursive: true });
  // Entorno mínimo: sin credenciales ni variables PLANB_*/HUBSPOT_*/GOOGLE_* de quien lo lanza.
  const keep = ['path', 'pathext', 'systemroot', 'systemdrive', 'windir', 'comspec', 'temp', 'tmp', 'userprofile', 'appdata', 'localappdata', 'homedrive', 'homepath', 'username', 'number_of_processors', 'processor_architecture', 'os'];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => keep.includes(key.toLowerCase())));
  const team = spawn(process.execPath, ['--require', join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', fileURLToPath(import.meta.url), '--serve-team', data],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let teamLog = '';
  const ready = new Promise((resolveReady, reject) => {
    const onData = chunk => { teamLog += chunk; if (teamLog.includes('Equipo de ensayo local')) resolveReady(); };
    team.stdout.setEncoding('utf8').on('data', onData); team.stderr.setEncoding('utf8').on('data', onData);
    team.on('exit', code => reject(new Error('El servidor de equipo terminó (' + code + '): ' + teamLog.slice(-600))));
    setTimeout(() => reject(new Error('El servidor de equipo no arrancó en 90 s: ' + teamLog.slice(-600))), 90_000);
  });
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const target = 'http://127.0.0.1:' + TEAM_PORT;
  const vite = await createServer({
    configFile: false, root: REPO, plugins: [react()], cacheDir: join(work, '.vite'), logLevel: 'warn',
    optimizeDeps: { entries: ['index.html'] },
    server: { host: '127.0.0.1', port: UI_PORT, strictPort: true,
      proxy: { '/api/team': { target, changeOrigin: true, headers: { origin: target } } },
      watch: { ignored: ['**/planb-*/**', '**/tests/**', '**/data/**', '**/build/**', '**/dist/**', '**/coordination/**', '**/delivery/**', '**/tools/**', '**/server/**'] } },
  });
  const stop = async () => { await vite.close().catch(() => {}); if (process.platform === 'win32') spawn('taskkill', ['/pid', String(team.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else team.kill('SIGTERM'); };
  try {
    await Promise.all([ready, vite.listen()]);
    const url = 'http://127.0.0.1:' + UI_PORT + '/team';
    console.log('Ensayo de equipo listo · ' + url + ' · datos en ' + work);
    if (process.argv.includes('--audit')) {
      const { audit } = await import('./run.mjs');
      const code = await audit({ url, outDir: join(work, 'audit') });
      await stop();
      process.exit(code);
    }
    process.on('SIGINT', () => void stop().then(() => process.exit(0)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await stop();
    process.exit(1);
  }
}
