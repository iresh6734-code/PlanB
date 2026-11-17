// CLAUDE-API-CLIENT-ROUTES (mejora B5 del informe, 17/11/2026) · El cliente solo llama a rutas que existen y están en
// docs/api.md (el inventario generado desde los servidores reales). Si alguien renombra una ruta, escribe mal una dirección
// o añade una llamada a una ruta sin documentar, esta prueba lo dice con el archivo y la llamada.
// Alcance: llamadas con los ayudantes de src/api.ts (api, post, download, que anteponen /api) y cadenas literales que
// empiezan por /api/. Si la dirección se construye por partes, se comprueba su parte fija como prefijo de alguna ruta.
// LÍMITE: no ve direcciones que se componen por completo en variables (p. ej. base + path en clientes propios).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve('.');
type Route = { method: string; path: string; pattern: RegExp };
const routes: Route[] = [...fs.readFileSync(path.join(repo, 'docs/api.md'), 'utf8').matchAll(/^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/gm)]
  .map(([, method, route]) => ({ method, path: route, pattern: new RegExp('^' + route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*').replace(/:[A-Za-z_]+/g, '[^/?]+') + '$') }));

/**
 * Rutas que ya existen en los servidores pero aún no están en docs/api.md porque su regeneración espera a que se acepte
 * CLAUDE-API-INVENTORY. La prueba también falla si una de estas ya está documentada: así la lista no se queda vieja.
 */
const PENDING_DOCS = ['/api/v2/import/csv/preview', '/api/v2/import/csv/apply'];
/** Rutas que el inventario deja fuera a propósito, según dice el propio docs/api.md («Límites»). */
const NOT_INVENTORIED = [
  { prefix: '/api/team/local-pilot', why: 'piloto local del servicio de equipo (PLANB_TEAM_LOCAL_PILOT)' },
  { prefix: '/api/capsule', why: 'cápsula de rescate: servidor propio (server/rescue-capsule-api.ts)' },
  { prefix: '/api/rescue', why: 'sala de rescate: servidor propio (server/rescue-room-api.ts)' },
];

const FIXTURE = path.join(repo, 'src', '__fixture__.ts');
type Call = { file: string; line: number; text: string; prefix: string; complete: boolean; index?: number };
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
export function clientCalls(file: string, text: string): Call[] {
  const calls: Call[] = [];
  const add = (index: number, raw: string, rest: string, viaHelper: boolean) => {
    // `complete`: la cadena termina ahí (comilla de cierre sin `+` detrás y sin `${` dentro).
    const cut = raw.search(/\$\{/), literal = cut >= 0 ? raw.slice(0, cut) : raw;
    const complete = cut < 0 && !/^\s*\+/.test(rest);
    const full = (viaHelper ? '/api' : '') + literal.split('?')[0];
    calls.push({ index, file: path.relative(repo, file).replace(/\\/g, '/'), line: text.slice(0, index).split('\n').length, text: raw, prefix: full, complete: complete && !literal.includes('?') ? true : complete });
  };
  // Solo son los ayudantes de la App (que anteponen /api) si el archivo los importa de src/api.ts; otros módulos tienen
  // su propio `post` con otra base, y esos se ven por sus cadenas /api/… literales.
  const helpers = /import\s*\{[^}]*\b(?:api|post|download)\b[^}]*\}\s*from\s*'(?:\.\.?\/)+api(?:\.js)?'/.test(text) || file === FIXTURE;
  if (helpers) for (const m of text.matchAll(/\b(?:api|post|download)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*(['`])(\/[^'`]*)\1([^)]{0,3})/g)) add(m.index!, m[2], m[3], true);
  for (const m of text.matchAll(/(['`])(\/api\/[^'`]*)\1([^)]{0,3})/g)) add(m.index!, m[2], m[3], false);
  return calls.sort((a, b) => a.index! - b.index!);
}
const matches = (call: Call) => call.complete
  ? routes.some(route => route.pattern.test(call.prefix))
  : routes.some(route => route.path.startsWith(call.prefix) || route.pattern.test(call.prefix.replace(/\/$/, '')) || new RegExp(route.pattern.source.replace(/\$$/, '')).test(call.prefix));

test('docs/api.md tiene el inventario que esta prueba necesita', () => {
  assert.ok(routes.length > 150, 'se leyeron ' + routes.length + ' rutas');
});

test('cada llamada del cliente a la API va a una ruta documentada', () => {
  const calls = sources(path.join(repo, 'src')).flatMap(file => clientCalls(file, fs.readFileSync(file, 'utf8')));
  assert.ok(calls.length > 50, 'se encontraron ' + calls.length + ' llamadas');
  const missing = calls.filter(call => !matches(call) && !PENDING_DOCS.some(route => call.prefix === route) && !NOT_INVENTORIED.some(known => call.prefix.startsWith(known.prefix)));
  assert.deepEqual(missing.map(call => call.file + ':' + call.line + ' → ' + call.prefix + (call.complete ? '' : '…')), [], 'llamadas a rutas que no están en docs/api.md');
});

test('la lista de rutas pendientes de documentar no se queda vieja', () => {
  const documented = PENDING_DOCS.filter(route => routes.some(r => r.pattern.test(route)));
  assert.deepEqual(documented, [], 'ya están en docs/api.md: quítalas de PENDING_DOCS');
});

test('el detector entiende las formas de llamada del cliente', () => {
  const calls = clientCalls(FIXTURE, [
    "api<{ a: number }>('/v2/state')",
    "post('/v2/return/preview', body)",
    "api('/v2/records/' + entity + '?q=')",
    "fetch(`/api/team/local-pilot/${id}`)",
    "download('/export/changes?format=csv', 'x.csv')",
  ].join('\n'));
  assert.deepEqual(calls.map(c => [c.prefix, c.complete]), [
    ['/api/v2/state', true], ['/api/v2/return/preview', true], ['/api/v2/records/', false], ['/api/team/local-pilot/', false], ['/api/export/changes', true],
  ]);
  assert.equal(matches({ file: '', line: 0, text: '', prefix: '/api/v2/no-existe', complete: true }), false, 'una ruta inventada no pasa');
});
