import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { ROOT, TMP, importCapsule, join, prepared, tidy, watch } from './helpers/rescue-capsule-followup-harness.js';
// QA-136 · aislamiento del arnés: esta ejecución trabaja en SU raíz, identifica sus destinos por el reclamo de su propia cápsula y no cuenta ni toca carpetas ajenas aunque se parezcan a las suyas.
// helpers/rescue-capsule-followup-parallel.mjs lanza dos ejecuciones simultáneas con PLANB_QA136_BASE distintos y pasa a cada una el identificador del señuelo de la otra (PLANB_QA136_OTHER).
const MINE = process.env.PLANB_QA136_CANARY ?? randomUUID(), OTHER = process.env.PLANB_QA136_OTHER ?? null;
const lookalike = () => readdirSync(TMP).filter(n => /^rescue(106|116-staging)-[0-9a-f-]{36}$/.test(n));
const plant = () => {
  const room = join(TMP, 'rescue106-' + MINE), stage = join(TMP, 'rescue116-staging-' + MINE);
  mkdirSync(room, { recursive: true }); writeFileSync(join(room, 'rescue-room.marker.json'), JSON.stringify({ format: 'planb-rescue-marker-v1', kind: 'rescue106', roomId: MINE })); writeFileSync(join(room, 'canary.txt'), 'ajeno: no tocar');
  mkdirSync(stage, { recursive: true }); writeFileSync(join(stage, 'rescue-room.marker.json'), JSON.stringify({ format: 'planb-rescue-marker-v1', kind: 'rescue106', roomId: MINE })); writeFileSync(join(stage, 'canary.txt'), 'ajeno: no tocar');
  return { room, stage };
};

test('1 · la ejecución tiene raíz propia: cwd y tests/.tmp colgando de ella, bajo la base indicada, sin compartir carpeta con otras ejecuciones', () => {
  assert.equal(resolve(process.cwd()).toLowerCase(), resolve(ROOT).toLowerCase()); assert.ok(TMP.toLowerCase().startsWith(resolve(ROOT).toLowerCase() + sep)); assert.match(ROOT, /rescue136-[0-9a-f-]{36}$/);
  if (process.env.PLANB_QA136_BASE) assert.ok(resolve(ROOT).toLowerCase().startsWith(resolve(process.env.PLANB_QA136_BASE).toLowerCase() + sep), 'la raíz cuelga de la base pedida');
  if (OTHER) assert.ok(!existsSync(join(TMP, 'rescue106-' + OTHER)) && !existsSync(join(TMP, 'rescue116-staging-' + OTHER)), 'nada de la otra ejecución es visible aquí');
});

test('2 · con carpetas SEÑUELO parecidas (mismo patrón, marcador válido) en mi tests/.tmp: un flujo completo no las cuenta, no las toca y mis destinos salen solo de mi reclamo', async () => {
  const { room, stage } = plant(), p = await prepared(), w = watch(p.kit, p.input.name), r = await importCapsule(p.kit, p.input); w.trackAll();
  assert.deepEqual([...w.ids], [r.destination.roomId], 'mis destinos: solo el que anuncia mi reclamo'); assert.equal(w.published().length, 1); assert.ok(!w.ids.has(MINE), 'el señuelo no es mío');
  // el estilo de 116 (listar y contar por patrón) SÍ vería el señuelo: es la interferencia que esta técnica evita
  assert.ok(lookalike().includes('rescue106-' + MINE) && lookalike().includes('rescue116-staging-' + MINE), 'control: un listado por patrón cuenta el señuelo como si fuera un destino/staging');
  assert.equal(readFileSync(join(room, 'canary.txt'), 'utf8'), 'ajeno: no tocar'); assert.equal(readFileSync(join(stage, 'canary.txt'), 'utf8'), 'ajeno: no tocar'); p.origin.close();
});

test('3 · mi limpieza solo retira directorios VACÍOS: el señuelo (con contenido) sobrevive a ella y a todo el flujo; después lo retiro yo, que lo planté y conozco su contenido', () => {
  const left = tidy(), mine = left.filter(k => k.includes(MINE)); assert.ok(mine.some(k => k.endsWith('canary.txt')), 'el contenido del señuelo se conserva: ' + left.join(' | '));
  for (const d of ['rescue106-', 'rescue116-staging-']) { const dir = join(TMP, d + MINE); assert.equal(readFileSync(join(dir, 'canary.txt'), 'utf8'), 'ajeno: no tocar'); assert.ok(existsSync(join(dir, 'rescue-room.marker.json')), 'ni siquiera se tocó su marcador'); }
  process.stdout.write('# SEÑUELO-INTACTO ' + MINE + ' ROOT ' + ROOT + '\n');
  for (const d of ['rescue106-', 'rescue116-staging-']) { const dir = join(TMP, d + MINE); for (const f of ['canary.txt', 'rescue-room.marker.json']) unlinkSync(join(dir, f)); rmdirSync(dir); }
});
