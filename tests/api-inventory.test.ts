// CLAUDE-API-INVENTORY · El inventario sale de los servidores reales, sin abrir puertos ni escribir fuera de su salida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { ENTRIES, captureEntry, childEnvironment, groupOf, mergeInventory, renderMarkdown, routeDiff } from '../tools/api/inventory.mjs';

type Route = { method: string; url: string; file: string | null; line: number | null };
type Row = { method: string; url: string; group: string; entries: string[]; origins: { entry: string; origin: string | null; file: string | null }[] };

const TOOL = path.resolve('tools/api/inventory.mjs');
const TMP = path.resolve('tests/.tmp');

function scratch(t: test.TestContext): string {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'api-inventory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const cli = (...args: string[]) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 300_000 });

test('agrupa por versión de API y deja aparte lo que no es /api', () => {
  assert.equal(groupOf('/api/v2/records/:entity'), 'v2');
  assert.equal(groupOf('/api/v7/date-check/checks/:id'), 'v7');
  assert.equal(groupOf('/api/v12/futuro'), 'v12', 'versiones de dos cifras');
  assert.equal(groupOf('/api/team/spaces'), 'team');
  assert.equal(groupOf('/api/health'), 'sin versión');
  assert.equal(groupOf('/api/version2/x'), 'sin versión');
  assert.equal(groupOf('/internal/jobs/:tenant/:id'), 'fuera de /api');
});

test('une entradas en una fila por método y ruta, ordenada y sin orígenes repetidos', () => {
  const route = (method: string, url: string, file: string, line: number): Route => ({ method, url, file, line });
  const rows: Row[] = mergeInventory({
    // Una ruta repetida dentro de la misma entrada no debe duplicar la entrada en la fila.
    main: [route('GET', '/api/v2/state', 'server/v2.ts', 10), route('GET', '/api/v2/state', 'server/v2.ts', 10), route('POST', '/api/v2/state', 'server/v2.ts', 12), route('GET', '/api/health', 'server/security.ts', 52)],
    runtime: [route('GET', '/api/v2/state', 'server/v2.ts', 10), route('GET', '/api/health', 'server/security.ts', 52)],
  });
  assert.deepEqual(rows.map(r => r.method + ' ' + r.url), ['GET /api/v2/state', 'POST /api/v2/state', 'GET /api/health']);
  const state = rows[0];
  assert.deepEqual(state.entries, ['main', 'runtime']);
  assert.equal(state.origins.length, 2, 'un origen por entrada');
  assert.deepEqual(rows[1].entries, ['main']);
  const doc: string = renderMarkdown(rows, ['main', 'runtime']);
  assert.match(doc, /\| POST \| `\/api\/v2\/state` \| ● \|  \| `server\/v2\.ts` \|/);
  assert.match(doc, /\| \*\*Total\*\* \| \*\*3\*\* \| \*\*3\*\* \| \*\*2\*\* \|/);
  assert.doesNotMatch(doc, /server\/v2\.ts:\d/, 'el documento no lleva números de línea');
});

test('routeDiff nombra las rutas añadidas y retiradas', () => {
  const before = '| GET | `/api/a` | ● |\n| POST | `/api/b` | ● |\n';
  const after = '| GET | `/api/a` | ● |\n| GET | `/api/c` | ● |\n';
  assert.deepEqual(routeDiff(before, after), { added: ['GET /api/c'], removed: ['POST /api/b'] });
});

test('captura la entrada principal real: orígenes exactos, sin HEAD, sin puerto ni archivo de descubrimiento', () => {
  const { routes, endpointWritten } = captureEntry('main') as { routes: Route[]; endpointWritten: boolean };
  assert.equal(endpointWritten, false, 'listen no llega a publicar la dirección');
  assert.ok(routes.length > 50);
  assert.ok(routes.every(r => r.file && r.file.startsWith('server/') && Number.isInteger(r.line)), 'toda ruta tiene archivo y línea de server/');
  assert.ok(!routes.some(r => r.method === 'HEAD'));
  const find = (method: string, url: string) => routes.find(r => r.method === method && r.url === url);
  assert.equal(find('GET', '/api/health')?.file, 'server/security.ts');
  assert.equal(find('POST', '/api/v2/auth/login')?.file, 'server/security.ts');
  assert.equal(find('POST', '/api/import/fixture')?.file, 'server/generator.ts');
  const source = fs.readFileSync('server/security.ts', 'utf8').split(/\r?\n/);
  const login = find('POST', '/api/v2/auth/login')!;
  assert.match(source[login.line! - 1], /\/api\/v2\/auth\/login/, 'la línea anotada es la que declara la ruta');
});

test('la entrada portátil no sirve rutas que solo existen en la App completa', () => {
  const { routes } = captureEntry('runtime') as { routes: Route[] };
  assert.ok(routes.some(r => r.method === 'GET' && r.url === '/api/health'));
  assert.ok(!routes.some(r => r.url === '/api/import/fixture'), 'el generador no se monta en la entrada portátil');
  assert.ok(Object.keys(ENTRIES).includes('team'));
});

test('--check acepta un documento recién generado y rechaza uno al que le falta una ruta, sin tocar docs/api.md', t => {
  const dir = scratch(t), doc = path.join(dir, 'api.md');
  const real = path.resolve('docs/api.md'), before = fs.existsSync(real) ? fs.statSync(real).mtimeMs : null;
  const write = cli('--entries', 'main', '--out', doc);
  assert.equal(write.status, 0, write.stderr);
  const fresh = cli('--check', '--entries', 'main', '--doc', doc);
  assert.equal(fresh.status, 0, fresh.stderr);

  const lines = fs.readFileSync(doc, 'utf8').split('\n');
  const removed = lines.findIndex(l => l.startsWith('| POST | `/api/v2/auth/login`'));
  assert.ok(removed > 0);
  lines.splice(removed, 1);
  fs.writeFileSync(doc, lines.join('\n'));
  const stale = cli('--check', '--entries', 'main', '--doc', doc);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /Rutas nuevas: .*POST \/api\/v2\/auth\/login/);

  assert.equal(fs.existsSync(real) ? fs.statSync(real).mtimeMs : null, before, 'docs/api.md no se toca al usar --out o --check --doc');
});

test('el proceso hijo no hereda secretos ni configuración de quien lanza el inventario', () => {
  const work = path.join(TMP, 'work-ficticio'), out = path.join(work, 'routes.json');
  const parent = { Path: '/bin', SystemRoot: '/windows', TEMP: '/t', PLANB_HUBSPOT_TOKEN: 'pat-secreto', GOOGLE_WORKSPACE_CLIENT_SECRET: 's',
    NODE_OPTIONS: '--require x', USERPROFILE: '/usuarios/alguien', PLANB_DATA_DIR: '/datos-reales', DATABASE_URL: 'postgres://real', NODE_ENV: 'production' };
  const env = childEnvironment(parent, 'main', work, out) as Record<string, string>;
  assert.deepEqual(Object.keys(env).sort(), ['NODE_ENV', 'PLANB_API_CAPTURE_OUT', 'PLANB_DATA_DIR', 'PLANB_PORT', 'Path', 'SystemRoot', 'TEMP'].sort());
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PLANB_DATA_DIR, path.join(work, 'data'), 'los datos son siempre los de la carpeta temporal');
  const team = childEnvironment(parent, 'team', work, out) as Record<string, string>;
  assert.equal(team.PLANB_TEAM_DEMO, '1');
  assert.equal(team.PLANB_TEAM_DATA_DIR, path.join(work, 'team'));
  assert.ok(!('DATABASE_URL' in team) && !('PLANB_HUBSPOT_TOKEN' in team));
});

test('captura el servicio de equipo en modo demo con su base incrustada temporal', () => {
  const { routes, endpointWritten } = captureEntry('team') as { routes: Route[]; endpointWritten: boolean };
  assert.equal(endpointWritten, false);
  assert.ok(routes.length > 20);
  assert.ok(routes.every(r => r.file?.startsWith('server/team/') || r.file?.startsWith('server/')), 'orígenes dentro de server/');
  assert.ok(routes.some(r => r.method === 'GET' && r.url === '/api/team/health'));
});
