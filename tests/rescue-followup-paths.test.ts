import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RescueRoom, assertOwnRoot } from '../server/rescue-room.js';
import { RescueError } from '../shared/rescue-room.js';
import { TMP, clock, disposeRoomFiles, newRoom } from './helpers/rescue-followup-harness.js';
// RESCUE-115 · marcadores y raíces. Cada caso construye su propia carpeta y la limpia sin borrado recursivo. Lo que no se pueda ejercitar en este equipo se declara.
const MARKER = 'rescue-room.marker.json';
const made: string[] = []; after(() => { for (const d of made) { try { unlinkSync(join(d, 'rescue-room.marker.json')); } catch { /* ausente */ } disposeRoomFiles(d); try { rmdirSync(d); } catch { /* ya no existe o no vacía */ } } }); // limpieza no recursiva aunque falle una aserción
const fresh = (marker?: string | object) => { const id = randomUUID(), dir = join(TMP, 'rescue106-' + id); made.push(dir); mkdirSync(dir, { recursive: true }); if (marker !== undefined) writeFileSync(join(dir, MARKER), typeof marker === 'string' ? marker : JSON.stringify(marker)); return { id, dir }; };
const clean = (dir: string) => { disposeRoomFiles(dir); };
const message = (dir: string) => { try { assertOwnRoot(dir); return 'ACEPTADA'; } catch (e) { return e instanceof RescueError ? e.code + ': ' + e.message : String(e); } };
const good = (id: string) => ({ format: 'planb-rescue-marker-v1', kind: 'rescue106', roomId: id });

test('marcador malformado, vacío, enorme o con forma errónea ⇒ rechazo ROOT_NO_MARKER sin efectos en la carpeta', () => {
  for (const [name, content] of [['JSON roto', '{no es json'], ['vacío', ''], ['array', '[]'], ['número', '42'], ['cadena', '"texto"'], ['enorme', '{"x":"' + 'a'.repeat(3_000_000) + '"}']] as const) {
    const { dir } = fresh(content), before = readdirSync(dir).sort().join();
    assert.match(message(dir), /ROOT_NO_MARKER/, name); assert.equal(readdirSync(dir).sort().join(), before, 'sin efectos: ' + name); clean(dir);
  }
});

test('DEFECTO · un marcador cuyo JSON es «null» debe rechazarse con ROOT_NO_MARKER, no con un TypeError sin controlar', () => {
  const { dir } = fresh('null'); assert.match(message(dir), /ROOT_NO_MARKER/); clean(dir);
});

test('marcador con roomId incorrecto, tipo o formato ajenos ⇒ rechazo; con roomId con separadores o «..» ⇒ rechazo', () => {
  const { id, dir } = fresh(); const cases: [string, object][] = [['roomId de otra sala', { ...good(id), roomId: randomUUID() }], ['kind ajeno', { ...good(id), kind: 'otra-cosa' }], ['formato ajeno', { ...good(id), format: 'planb-rescue-marker-v9' }],
    ['roomId con ..', { ...good(id), roomId: '../' + id }], ['roomId con barra', { ...good(id), roomId: 'x/' + id }], ['roomId ausente', { format: 'planb-rescue-marker-v1', kind: 'rescue106' }]];
  for (const [name, marker] of cases) { writeFileSync(join(dir, MARKER), JSON.stringify(marker)); assert.match(message(dir), /ROOT_NO_MARKER/, name); }
  writeFileSync(join(dir, MARKER), JSON.stringify(good(id))); assert.equal(message(dir), 'ACEPTADA', 'control positivo: el marcador correcto sí se acepta'); clean(dir);
});

test('la carpeta debe colgar DIRECTAMENTE de tests/.tmp y llamarse rescue106-*: recorridos con .., subcarpetas y nombres parecidos ⇒ rechazo', () => {
  const { id, dir } = fresh(good('x')); writeFileSync(join(dir, MARKER), JSON.stringify(good(id)));
  assert.match(message(join(dir, '..', 'rescue106-' + id)), /ACEPTADA/, 'una ruta con .. que normaliza a la carpeta propia es la misma carpeta (control)');
  const nested = join(dir, 'rescue106-anidada'); made.unshift(nested); mkdirSync(nested); writeFileSync(join(nested, MARKER), JSON.stringify(good('anidada'))); assert.match(message(nested), /ROOT_OUTSIDE/, 'anidada dentro de otra sala');
  const sibling = join(TMP, 'rescue106x-' + id); made.push(sibling); mkdirSync(sibling); writeFileSync(join(sibling, MARKER), JSON.stringify(good(id))); assert.match(message(sibling), /ROOT_OUTSIDE/, 'prefijo parecido pero distinto');
  assert.match(message(resolve(TMP, '..')), /ROOT_OUTSIDE|ROOT_NO_MARKER/, 'la carpeta padre'); assert.match(message(resolve('server')), /ROOT_OUTSIDE/);
  unlinkSync(join(nested, MARKER)); rmdirSync(nested); unlinkSync(join(sibling, MARKER)); rmdirSync(sibling); clean(dir);
});

test('RescueRoom.open rechaza una raíz inválida SIN crear ni modificar nada en ella (no resiembra)', () => {
  const { dir } = fresh(); const before = readdirSync(dir).join();
  assert.throws(() => RescueRoom.open(dir, { clock }), RescueError); assert.equal(readdirSync(dir).join(), before, 'la carpeta sigue vacía: no se creó base, clave ni marcador'); clean(dir);
  const real = newRoom(); const root = real.root; real.close(); const other = fresh(); writeFileSync(join(other.dir, MARKER), JSON.stringify(good(other.id)));
  assert.throws(() => RescueRoom.open(other.dir, { clock }), /no contiene una captura|ROOM_EMPTY/i); assert.ok(!existsSync(join(other.dir, 'planb.sqlite')) || readdirSync(other.dir).every(n => /^(planb\.sqlite.*|\.planb-key|rescue-room\.marker\.json)$/.test(n)));
  assert.ok(existsSync(root)); clean(other.dir);
});

test('un enlace (unión) como raíz o como padre se rechaza y el marcador-directorio/enlace no se lee como archivo', (t) => {
  const real = newRoom(); const root = real.root; real.close();
  const link = join(TMP, 'rescue106-' + randomUUID()); try { symlinkSync(root, link, 'junction'); } catch (e) { t.diagnostic('unión no creable: ' + (e as NodeJS.ErrnoException).code); return; }
  try { assert.match(message(link), /ROOT_LINK/); } finally { rmdirSync(link); }
  // Marcador que es una unión a un directorio: la guarda de enlace lo rechaza con SU mensaje (distinto del de «ilegible»).
  const { dir } = fresh(); const target = fresh(); const m = join(dir, MARKER);
  try { symlinkSync(target.dir, m, 'junction'); } catch (e) { t.diagnostic('unión-marcador no creable: ' + (e as NodeJS.ErrnoException).code); clean(dir); clean(target.dir); return; }
  try { assert.match(message(dir), /no tiene el marcador del lanzador/, 'rechazado por la guarda de enlace, no por fallo de lectura'); } finally { rmdirSync(m); clean(dir); clean(target.dir); }
});

test('LÍMITE DE ENTORNO · el enlace SIMBÓLICO de archivo como marcador no se puede crear sin privilegio en este equipo: la guarda no se ejercita con éxito/fallo real', (t) => {
  const { dir } = fresh(); const target = join(TMP, 'rescue115-destino-' + randomUUID() + '.json'); writeFileSync(target, JSON.stringify(good(dir.slice(dir.lastIndexOf('rescue106-') + 10))));
  let created = false; try { symlinkSync(target, join(dir, MARKER), 'file'); created = true; } catch (e) { t.diagnostic('enlace simbólico de archivo no creable (' + (e as NodeJS.ErrnoException).code + '): sin privilegio; M12 no es refutable por este camino aquí'); }
  if (created) { try { assert.match(message(dir), /ROOT_NO_MARKER/, 'con un enlace simbólico real la raíz debe rechazarse aunque el destino sea un marcador válido'); } finally { unlinkSync(join(dir, MARKER)); } }
  unlinkSync(target); clean(dir); assert.ok(true);
});

test('la lectura del marcador no sigue contenido de otra carpeta: un marcador válido dentro de OTRA sala no valida esta', () => {
  const a = newRoom(), b = newRoom(); const markerA = readFileSync(join(a.root, MARKER), 'utf8'); a.close(); b.close();
  const { dir } = fresh(markerA); assert.match(message(dir), /ROOT_NO_MARKER/, 'el roomId del marcador copiado no corresponde al nombre de esta carpeta'); clean(dir);
});
