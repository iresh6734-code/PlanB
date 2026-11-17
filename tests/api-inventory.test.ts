// CLAUDE-API-INVENTORY · El inventario sale de los servidores reales, sin abrir puertos ni escribir fuera de su salida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { ENTRIES, UsageError, captureEntry, childEnvironment, groupOf, mergeInventory, parseArgs, renderMarkdown, routeDiff } from '../tools/api/inventory.mjs';

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

test('la línea de órdenes se valida antes de capturar, leer o escribir', () => {
  const bad: [string[], RegExp][] = [
    [['--entries', ','], /piezas vacías/],
    [['--entries', 'main,,runtime', '--out', 'x.md'], /piezas vacías/],
    [['--entries', 'main,otra', '--out', 'x.md'], /desconocidas: otra/],
    [['--entries', 'main,main', '--out', 'x.md'], /repite/],
    [['--entries'], /necesita un valor/],
    [['--out'], /necesita un valor/],
    [['--out', '--check'], /necesita un valor/],
    [['--doc', 'x.md'], /solo tiene sentido con --check/],
    [['--json', '--check'], /no se pueden combinar/],
    [['--json', '--out', 'x.md'], /no admite --out/],
    [['--check', '--out', 'x.md'], /no escribe/],
    [['--entries', 'main'], /destino explícito/],
    [['--check', '--entries', 'main'], /destino explícito/],
    [['--rutas'], /desconocida/],
    [['--check', '--check'], /repetida/],
  ];
  for (const [argv, message] of bad) assert.throws(() => parseArgs(argv), (e: unknown) => e instanceof UsageError && message.test((e as Error).message), argv.join(' '));
  assert.deepEqual(parseArgs([]), { mode: 'write', entries: ['main', 'runtime', 'team'], out: undefined, doc: undefined });
  assert.equal(parseArgs(['--json', '--entries', 'main']).mode, 'json', 'una selección parcial a la salida estándar no sustituye nada');
  assert.deepEqual(parseArgs(['--check', '--entries', 'main', '--doc', 'x.md']).entries, ['main']);
});

test('con argumentos inválidos el CLI sale con código 2 y no toca el documento existente', t => {
  const dir = scratch(t), doc = path.join(dir, 'api.md');
  fs.writeFileSync(doc, 'MARCADOR-PREVIO-358');
  for (const args of [['--entries', ',', '--out', doc], ['--entries', 'main,otra', '--out', doc], ['--check', '--entries', ',', '--doc', doc], ['--out', doc, '--json']]) {
    const run = cli(...args);
    assert.equal(run.status, 2, args.join(' ') + ': ' + run.stderr);
    assert.match(run.stderr, /Uso: node tools\/api\/inventory\.mjs/);
    assert.equal(fs.readFileSync(doc, 'utf8'), 'MARCADOR-PREVIO-358', 'el documento previo se conserva: ' + args.join(' '));
  }
});

test('el Markdown conserva a qué entrada corresponde cada archivo cuando difieren', () => {
  const r = (url: string, file: string): Route => ({ method: 'GET', url, file, line: 1 });
  const same = renderMarkdown(mergeInventory({ main: [r('/api/x', 'server/a.ts')], runtime: [r('/api/x', 'server/a.ts')] }), ['main', 'runtime']) as string;
  assert.match(same, /\| GET \| `\/api\/x` \| ● \| ● \| `server\/a\.ts` \|/);
  const split = renderMarkdown(mergeInventory({ main: [r('/api/x', 'server/a.ts')], runtime: [r('/api/x', 'server/b.ts')] }), ['main', 'runtime']) as string;
  const swapped = renderMarkdown(mergeInventory({ main: [r('/api/x', 'server/b.ts')], runtime: [r('/api/x', 'server/a.ts')] }), ['main', 'runtime']) as string;
  assert.match(split, /main: `server\/a\.ts` · runtime: `server\/b\.ts`/);
  assert.notEqual(split, swapped, 'cambiar la atribución cambia el documento');
});

test('R3: una selección parcial nunca escribe ni comprueba el documento canónico, y las claves heredadas no son entradas', () => {
  const canonical = path.resolve('docs/api.md');
  const before = fs.existsSync(canonical) ? fs.statSync(canonical).mtimeMs : null;
  for (const argv of [['--entries', 'runtime', '--out', 'docs/api.md'], ['--entries', 'runtime', '--out', canonical], ['--entries', 'main', '--out', './docs/../docs/api.md'],
    ['--check', '--entries', 'runtime', '--doc', 'docs/api.md']]) {
    assert.throws(() => parseArgs(argv), (e: unknown) => e instanceof UsageError && /docs\/api\.md/.test((e as Error).message), argv.join(' '));
  }
  if (process.platform === 'win32') assert.throws(() => parseArgs(['--entries', 'runtime', '--out', 'DOCS/API.MD']), UsageError, 'Windows no distingue mayúsculas');
  for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.throws(() => parseArgs(['--entries', inherited, '--json']), (e: unknown) => e instanceof UsageError && /desconocidas/.test((e as Error).message), inherited);
    assert.throws(() => captureEntry(inherited), /Entrada desconocida/, 'captureEntry también: ' + inherited);
    assert.throws(() => childEnvironment({}, inherited, 'w', 'o'), /Entrada desconocida/);
  }
  assert.equal(parseArgs(['--entries', 'runtime', '--out', 'otra.md']).entries.join(), 'runtime', 'una salida separada sigue permitida');
  const run = cli('--entries', 'runtime', '--out', 'docs/api.md');
  assert.equal(run.status, 2, run.stderr);
  assert.equal(fs.existsSync(canonical) ? fs.statSync(canonical).mtimeMs : null, before, 'docs/api.md intacto');
});
