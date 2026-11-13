import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { PASSWORD, envelope, exportCapsule, join, loadCapsule, newKit, originAt, viewOf, type Kit } from './helpers/rescue-capsule-followup-harness.js';
import { Store } from '../server/store.js';
// QA-136 · exportación durante una mutación del escritor PROPIO (exclusión) frente a cambios EXTERNOS del simulador o de la base (detección y reintento). Raíz propia; sin listar carpetas ajenas.
// Distinción que se comprueba: el escritor propio se SERIALIZA (la mutación espera, no se detecta); un escritor ajeno NO puede ser excluido y solo se DETECTA si cambia el contenido durante la lectura.
const caps = (kit: Kit) => readdirSync(kit.capsules).filter(n => n.endsWith('.capsule'));
const poke = (root: string) => { const f = join(root, 'crm-sim.json'), s = JSON.parse(readFileSync(f, 'utf8')); s.counter += 1; writeFileSync(f, JSON.stringify(s)); return s.counter as number; };

for (const phase of ['capture:start', 'capture:after-bundle', 'capture:after-sim'] as const) test('1 · mutación del escritor PROPIO pedida en «' + phase + '»: espera, la cápsula es de UNA versión y la mutación se aplica después [REPRODUCIDO]', async () => {
  const kit = newKit(), origin = await originAt('local-work'), v0 = viewOf(origin).version; let mutation: Promise<unknown> | null = null, settled = false, settledAtHook = true, versionAtHook = -1;
  const exp = await exportCapsule(origin, PASSWORD, kit, { captureHook: async step => { if (step !== phase) return; mutation = origin.setEstimate({ ...envelope(origin), taskId: 'task-9', minutes: 25 }); void mutation.then(() => { settled = true; }); await new Promise(r => setTimeout(r, 150)); settledAtHook = settled; versionAtHook = viewOf(origin).version; } });
  assert.equal(settledAtHook, false, 'la mutación seguía esperando cuando terminó la captura'); assert.equal(versionAtHook, v0, 'durante la captura la versión no avanzó'); assert.equal(exp.attempts, 1, 'una mutación propia NO provoca reintento: se serializa, no se detecta');
  const cap = loadCapsule(kit, exp.name, PASSWORD).capsule; assert.equal(cap.capture.stateVersion, v0); await mutation; assert.equal(viewOf(origin).version, v0 + 1, 'la mutación se aplicó después'); assert.notEqual(cap.components.rescue.state.estimates['task-9'], 25, 'la cápsula NO contiene la mutación posterior'); origin.close();
});

test('2 · mutación del escritor propio pedida DESPUÉS de capturar (durante el cifrado): se aplica y la cápsula sigue siendo del instante de la captura; el origen ya difiere de ella [REPRODUCIDO]', async () => {
  const kit = newKit(), origin = await originAt('local-work'), v0 = viewOf(origin).version; let mutation: Promise<unknown> | null = null;
  kit.onStep = step => { if (step === 'export:encrypted') mutation = origin.setEstimate({ ...envelope(origin), taskId: 'task-9', minutes: 25 }); };
  const exp = await exportCapsule(origin, PASSWORD, kit); await mutation; const cap = loadCapsule(kit, exp.name, PASSWORD).capsule;
  assert.equal(cap.capture.stateVersion, v0); assert.equal(viewOf(origin).version, v0 + 1, 'el origen avanzó mientras se publicaba la cápsula'); assert.notEqual(cap.components.rescue.state.estimates['task-9'], 25, 'instantánea de la captura: la cápsula no incluye la mutación'); origin.close();
});

for (const phase of ['capture:start', 'capture:after-bundle', 'capture:after-sim'] as const) test('3 · cambio del SIMULADOR por un escritor AJENO en «' + phase + '»: se detecta, se reintenta y la cápsula contiene el estado final; si no cesa, no se publica nada [REPRODUCIDO]', async () => {
  const kit = newKit(), origin = await originAt('return-partial'); let once = true, expected = 0;
  const ok = await exportCapsule(origin, PASSWORD, kit, { captureHook: step => { if (step === phase && once) { once = false; expected = poke(origin.root); } } });
  assert.equal(ok.attempts, 2); assert.equal(loadCapsule(kit, ok.name, PASSWORD).capsule.components.sim.counter, expected, 'estado FINAL del simulador, no una mezcla'); const files = caps(kit).length;
  await assert.rejects(exportCapsule(origin, PASSWORD, kit, { maxAttempts: 3, captureHook: step => { if (step === phase) poke(origin.root); } }), (e: unknown) => (e as { code?: string }).code === 'CAPTURE_UNSTABLE');
  assert.equal(caps(kit).length, files, 'no se publicó una cápsula mezclada'); origin.close();
});

test('4 · un escritor AJENO cambia el simulador DESPUÉS de la captura (antes de publicar): NO se detecta; la cápsula es del instante capturado y el origen ya difiere [REPRODUCIDO — por diseño de instantánea]', async () => {
  const kit = newKit(), origin = await originAt('return-partial'); let after = 0; kit.onStep = step => { if (step === 'export:captured') after = poke(origin.root); };
  const exp = await exportCapsule(origin, PASSWORD, kit), cap = loadCapsule(kit, exp.name, PASSWORD).capsule; assert.equal(exp.attempts, 1); assert.ok(after > cap.components.sim.counter, 'el simulador del origen ya cambió y la cápsula conserva el valor anterior');
  assert.equal(origin.crm.readState().counter, after); origin.close();
});

test('5 · un segundo escritor ajeno sobre la BASE del origen (otra instancia de Store) cambia un registro durante la captura: se detecta por el digest lógico y se reintenta [REPRODUCIDO]', async () => {
  const kit = newKit(), origin = await originAt('local-work'), other = new Store(join(origin.root, 'planb.sqlite')); let once = true, changed: string | null = null;
  try {
    const exp = await exportCapsule(origin, PASSWORD, kit, { captureHook: step => { if (step !== 'capture:after-bundle' || !once) return; once = false; const rec = other.records().find(r => r.entity === 'tasks') ?? other.records()[0]; const values = { ...rec.values }; const key = Object.keys(values).find(k => typeof values[k] === 'string')!; values[key] = String(values[key]) + ' (editado por otro escritor)'; other.saveRecord(rec.entity, values, rec.id); changed = rec.id + ':' + key; } });
    assert.ok(changed, 'el escritor ajeno escribió'); assert.equal(exp.attempts, 2, 'el cambio externo en la base se detectó y forzó un reintento'); const cap = loadCapsule(kit, exp.name, PASSWORD).capsule, [id, key] = (changed as string).split(':');
    const rec = (cap.components.bundle as { records: { id: string; values: Record<string, unknown> }[] }).records.find(r => r.id === id)!; assert.match(String(rec.values[key]), /editado por otro escritor/, 'la cápsula contiene la versión final');
  } finally { other.close(); origin.close(); }
});
