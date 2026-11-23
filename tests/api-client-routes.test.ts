// CLAUDE-API-CLIENT-ROUTES (mejora B5 del informe, 17/11/2026; R2 por la revisión 433, 18/11/2026) · El cliente solo
// llama a rutas que existen y están en docs/api.md (el inventario generado desde los servidores reales). Si alguien
// renombra una ruta, escribe mal una dirección o añade una llamada sin documentar, esta prueba lo dice con archivo y línea.
// Cómo: se lee cada archivo de src/ con el árbol sintáctico de TypeScript (cualquier comilla, plantillas y concatenaciones
// en varias líneas). Se miran (1) las llamadas a api/post/download importados de src/api.ts, que anteponen /api, y (2) toda
// expresión de texto que empiece por /api/. La dirección se reconstruye entera: los trozos fijos se comprueban TODOS, también
// los que van después de una variable; cada variable vale por uno o varios segmentos. Una dirección que empieza por una
// variable no se puede comprobar: se lista como indeterminada (visible en la salida), no se da por buena en silencio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const repo = path.resolve('.');
type Route = { method: string; path: string };
const routes: Route[] = [...fs.readFileSync(path.join(repo, 'docs/api.md'), 'utf8').matchAll(/^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/gm)].map(([, method, route]) => ({ method, path: route }));
/** Cada ruta como patrón: un parámetro (`:id`) es un segmento cualquiera y un comodín (`*`), cualquier resto. */
const patterns = routes.map(route => new RegExp('^' + route.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:[A-Za-z_]+/g, '[^/?]+') + '/?$'));

/**
 * Rutas que ya existen en los servidores pero aún no están en docs/api.md porque su regeneración espera a que se acepte
 * CLAUDE-API-INVENTORY. La prueba también falla si una de estas ya está documentada: así la lista no se queda vieja.
 */
// 21/11/2026 (misión maestra A4): docs/api.md regenerado con 183 rutas; las dos de importación CSV ya están documentadas.
const PENDING_DOCS: string[] = [];
/** Rutas que el inventario deja fuera a propósito, según dice el propio docs/api.md («Límites»). */
const NOT_INVENTORIED = [
  { prefix: '/api/team/local-pilot', why: 'piloto local del servicio de equipo (PLANB_TEAM_LOCAL_PILOT)' },
  { prefix: '/api/capsule', why: 'cápsula de rescate: servidor propio (server/rescue-capsule-api.ts)' },
  { prefix: '/api/rescue', why: 'sala de rescate: servidor propio (server/rescue-room-api.ts)' },
];

const DYN = '\u0000';
/** Una dirección reconstruida: trozos fijos y `DYN` donde hay una variable; sin la consulta (`?…`). */
export type Call = { file: string; line: number; address: string; indeterminate: boolean };

/**
 * Aplana una expresión de texto en sus direcciones posibles: literal, plantilla o concatenación con `+` (en cualquier
 * número de líneas). Una condición cuyas ramas son textos (`setup ? 'setup' : 'login'`) da una dirección POR RAMA, que se
 * comprueban por separado (R3, revisión 455); lo que no se puede resolver sin ejecutar queda como hueco de variable.
 */
const MAX_ALTERNATIVES = 16;
function alternatives(node: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(node)) return alternatives(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) { const both = [...alternatives(node.whenTrue), ...alternatives(node.whenFalse)]; return both.length <= MAX_ALTERNATIVES ? both : [DYN]; }
  const join = (left: string[], right: string[]) => { const out = left.flatMap(a => right.map(b => a + b)); return out.length <= MAX_ALTERNATIVES ? out : [DYN]; };
  if (ts.isTemplateExpression(node)) return node.templateSpans.reduce((acc, span) => join(join(acc, alternatives(span.expression)), [span.literal.text]), [node.head.text]);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return join(alternatives(node.left), alternatives(node.right));
  return [DYN];
}
const isTextExpression = (node: ts.Node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)
  || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken);
const withoutQuery = (address: string) => address.split('?')[0];

export function clientCalls(file: string, text: string): Call[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const relative = path.relative(repo, file).replace(/\\/g, '/');
  // Ayudantes de la App que anteponen /api: solo los que este archivo importa de src/api.ts (otros módulos tienen su propio `post`).
  const helpers = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !/^(\.\.?\/)+api(\.js)?$/.test(statement.moduleSpecifier.text)) continue;
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const element of named.elements) if (['api', 'post', 'download'].includes((element.propertyName ?? element.name).text)) helpers.add(element.name.text);
  }
  const calls: Call[] = [], seen = new Set<ts.Node>();
  const add = (node: ts.Node, address: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    calls.push({ file: relative, line, address: withoutQuery(address), indeterminate: address.startsWith(DYN) });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text) && node.arguments[0]) {
      const argument = node.arguments[0]; seen.add(argument);
      if (!isTextExpression(argument) && !ts.isConditionalExpression(argument)) add(argument, DYN);
      else for (const address of alternatives(argument)) add(argument, address.startsWith(DYN) ? DYN : '/api' + address);
    } else if (isTextExpression(node) && !seen.has(node) && !(node.parent && ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const all = alternatives(node as ts.Expression);
      if (all.some(address => address.startsWith('/api/'))) { seen.add(node); for (const address of all) add(node, address); }
    }
    ts.forEachChild(node, child => { if (!seen.has(child)) visit(child); });
  };
  visit(source);
  return calls;
}

/**
 * ¿Hay alguna ruta documentada que encaje con la dirección? Cada variable se prueba como un segmento («D») y como dos
 * («D/D»), y la dirección resultante debe encajar ENTERA en el patrón de alguna ruta (trozos fijos incluidos).
 */
export function documented(address: string, list = patterns): boolean {
  const parts = address.split(DYN);
  let variants = [parts[0]];
  for (const part of parts.slice(1)) variants = variants.flatMap(prefix => [prefix + 'D' + part, prefix + 'D/D' + part]);
  if (variants.some(variant => list.some(pattern => pattern.test(variant)))) return true;
  // Y al revés: la variable de la llamada puede valer por trozos FIJOS de la ruta (p. ej. 'auth/' + (configurada ? 'login' : 'setup')).
  if (parts.length === 1) return false;
  const call = new RegExp('^' + parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^?]+?') + '/?$');
  return samples.some(sample => call.test(sample));
}
/** Cada ruta con parámetros y comodines sustituidos por un valor de muestra, para la comprobación al revés. */
const samples = routes.map(route => route.path.replace(/:[A-Za-z_]+/g, 'X').replace(/\*/g, 'X'));
const known = (address: string) => PENDING_DOCS.includes(address) || NOT_INVENTORIED.some(item => address.startsWith(item.prefix));
const show = (address: string) => address.replace(new RegExp(DYN, 'g'), '${…}');
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

test('docs/api.md tiene el inventario que esta prueba necesita', () => {
  // 22/11/2026 (Verifica, fase 0): al aparcar Laboratorio, la app de equipos y la IA local quedaron 119 rutas.
  // Solo comprueba que el inventario se leyó entero (tras el aparcado del 22/11 son 96 rutas): un mínimo holgado, no una cifra exacta.
  assert.ok(routes.length > 50, 'se leyeron ' + routes.length + ' rutas');
});

test('cada llamada del cliente a la API va a una ruta documentada', t => {
  const calls = sources(path.join(repo, 'src')).flatMap(file => clientCalls(file, fs.readFileSync(file, 'utf8')));
  assert.ok(calls.length > 50, 'se encontraron ' + calls.length + ' llamadas');
  const indeterminate = calls.filter(call => call.indeterminate);
  t.diagnostic(calls.length + ' llamadas; ' + indeterminate.length + ' indeterminadas (la dirección empieza por una variable): ' + indeterminate.map(call => call.file + ':' + call.line).join(', '));
  const missing = calls.filter(call => !call.indeterminate && !documented(call.address) && !known(call.address));
  assert.deepEqual(missing.map(call => call.file + ':' + call.line + ' → ' + show(call.address)), [], 'llamadas a rutas que no están en docs/api.md');
});

test('la lista de rutas pendientes de documentar no se queda vieja', () => {
  assert.deepEqual(PENDING_DOCS.filter(route => documented(route)), [], 'ya están en docs/api.md: quítalas de PENDING_DOCS');
});

test('el detector entiende las formas de llamada del cliente', () => {
  const file = path.join(repo, 'src', '__fixture__.ts');
  const calls = clientCalls(file, [
    "import { api, post, download } from './api.js';",
    "api<{ a: number }>('/v2/state');",
    "post(\"/v2/return/preview\", body);",
    "api('/v2/records/' + entity + '?q=');",
    "fetch(`/api/team/local-pilot/${id}`);",
    "download('/export/changes?format=csv', 'x.csv');",
  ].join('\n'));
  assert.deepEqual(calls.map(c => [show(c.address), c.indeterminate]), [
    ['/api/v2/state', false], ['/api/v2/return/preview', false], ['/api/v2/records/${…}', false], ['/api/team/local-pilot/${…}', false], ['/api/export/changes', false],
  ]);
  assert.equal(documented('/api/v2/no-existe'), false, 'una ruta inventada no pasa');
});

test('R2 · los tres casos de la revisión 433 y el control positivo de la concatenación documentada', () => {
  const file = path.join(repo, 'src', '__fixture__.ts');
  // 1. Importación y llamada con comillas dobles.
  const doubleQuoted = clientCalls(file, 'import { api } from "./api.js";\napi("/v2/ruta-inventada-433");');
  assert.deepEqual(doubleQuoted.map(c => c.address), ['/api/v2/ruta-inventada-433']);
  assert.equal(documented(doubleQuoted[0].address), false, 'se extrae y se rechaza');
  // 2. Un sufijo fijo inventado después de las variables ya no pasa por el prefijo.
  const suffix = clientCalls(file, "import { api } from './api.js';\napi('/v2/records/' + entity + '/' + id + '/ruta-inventada-433');")[0];
  assert.equal(documented(suffix.address), false, 'el sufijo estático también se comprueba');
  // 3. La misma concatenación partida en varias líneas es UNA dirección, no un fragmento suelto.
  const multiline = clientCalls(file, "import { api } from './api.js';\napi('/v2/records/'\n  + entity\n  + '/'\n  + id);");
  assert.deepEqual(multiline.map(c => show(c.address)), ['/api/v2/records/${…}/${…}']);
  // Control positivo: la concatenación documentada (lectura de una ficha) sigue pasando.
  assert.equal(documented(multiline[0].address), true, '/api/v2/records/:entity/:id está documentada');
  // R3 (revisión 455): cada rama literal de una condición se comprueba por separado; una rama ausente ya no pasa por la otra.
  const branches = clientCalls(file, "import { post } from './api.js';\npost('/v2/auth/' + (setup ? 'setup' : 'ruta-ausente-455'), body);");
  assert.deepEqual(branches.map(c => c.address), ['/api/v2/auth/setup', '/api/v2/auth/ruta-ausente-455']);
  assert.deepEqual(branches.map(c => documented(c.address)), [true, false], 'la rama válida pasa y la ausente falla');
  const valid = clientCalls(file, "import { post } from './api.js';\npost(`/v2/auth/${setup ? 'setup' : 'login'}`, body);");
  assert.ok(valid.length === 2 && valid.every(c => documented(c.address)), 'las dos direcciones documentadas siguen pasando');
  // Una dirección que empieza por una variable se marca indeterminada, no se aprueba en silencio.
  const dynamic = clientCalls(file, "import { api } from './api.js';\napi(base + '/x');")[0];
  assert.equal(dynamic.indeterminate, true);
});
