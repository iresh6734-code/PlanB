import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { encodePortable } from '../server/crypto.js';
import { exportCapsule, importCapsule, inspectCapsule, loadCapsule, sha256, type Kit } from '../server/rescue-capsule.js';
import { stableStringify } from '../server/rescue-room-journal.js';
import { CapsuleError, MAX_CAPSULE_BYTES, type Capsule } from '../shared/rescue-capsule.js';
import { OTHER_PASSWORD, PASSWORD, TMP, capsuleFiles, envelope, newKit, newRoom, originAt, originUncertain, trackFolder, viewOf, workLocally } from './helpers/rescue-capsule-harness.js';
// Kit de Relevo · integridad: contraseña, daños, formato, componentes de otras revisiones, diario/idempotencia/remoto incoherentes. Ante cualquier fallo NO se publica un destino y el origen conserva su digest.
const folders = () => readdirSync(TMP).filter(n => /^rescue(106|116-staging)-/.test(n)).sort().join();
const digest = (v: unknown) => sha256(stableStringify(v));
/** Fabrica una cápsula VÁLIDA en forma (cifrada con la contraseña real) a partir de otra, aplicando una mutación y, si se pide, recalculando digests para que solo la coherencia/semántica la delate. */
function forge(kit: Kit, base: Capsule, mutate: (c: Capsule) => void, options: { recompute?: boolean } = {}) {
  const c = structuredClone(base); mutate(c);
  if (options.recompute !== false) { const d = { bundle: digest(c.components.bundle), rescue: digest(c.components.rescue), recovery: digest(c.components.recovery), sim: digest(c.components.sim) }; c.digests = { ...d, set: sha256(d.bundle + d.rescue + d.recovery + d.sim) }; }
  const name = 'forja-' + randomUUID().slice(0, 12) + '.capsule'; writeFileSync(join(kit.capsules, name), encodePortable(c, PASSWORD)); return name;
}
async function fixture() { const kit = newKit(), origin = await originAt('return-partial'), e = await exportCapsule(origin, PASSWORD, kit), base = loadCapsule(kit, e.name, PASSWORD).capsule; return { kit, origin, e, base, digestBefore: origin.logicalDigest() }; }
const fails = async (promise: Promise<unknown>, code: string) => { try { await promise; } catch (e) { assert.ok(e instanceof CapsuleError, String(e)); assert.equal(e.code, code, e.message); return e; } throw new Error('Se esperaba ' + code); };
const failsSync = (fn: () => unknown, code: string) => { try { fn(); } catch (e) { assert.ok(e instanceof CapsuleError, String(e)); assert.equal(e.code, code, e.message); return e; } throw new Error('Se esperaba ' + code); };

test('contraseña incorrecta, truncado y alteración se rechazan con el MISMO mensaje, sin revelar contenido y sin publicar nada', async () => {
  const { kit, origin, e, digestBefore } = await fixture(), dirs = folders(), path = join(kit.capsules, e.name), raw = readFileSync(path, 'utf8');
  const wrong = failsSync(() => loadCapsule(kit, e.name, OTHER_PASSWORD), 'DECRYPT_FAILED');
  writeFileSync(join(kit.capsules, 'truncada-0001.capsule'), raw.slice(0, Math.floor(raw.length / 2))); const cut = failsSync(() => loadCapsule(kit, 'truncada-0001.capsule', PASSWORD), 'DECRYPT_FAILED');
  const parsed = JSON.parse(raw) as { data: string }; const i = Math.floor(parsed.data.length / 2); writeFileSync(join(kit.capsules, 'alterada-0001.capsule'), JSON.stringify({ ...parsed, data: parsed.data.slice(0, i) + (parsed.data[i] === 'A' ? 'B' : 'A') + parsed.data.slice(i + 1) }));
  const flipped = failsSync(() => loadCapsule(kit, 'alterada-0001.capsule', PASSWORD), 'DECRYPT_FAILED');
  assert.equal(wrong.message, cut.message); assert.equal(wrong.message, flipped.message, 'un único mensaje: no distingue qué falló');
  for (const m of [wrong.message, cut.message]) { assert.ok(!m.includes(PASSWORD) && !m.includes(OTHER_PASSWORD) && !/Confirmar entrega|demo-rescue/.test(m)); }
  writeFileSync(join(kit.capsules, 'basura-0001.capsule'), 'esto no es una cápsula'); failsSync(() => loadCapsule(kit, 'basura-0001.capsule', PASSWORD), 'DECRYPT_FAILED');
  assert.equal(folders(), dirs, 'ningún destino ni staging'); assert.equal(origin.logicalDigest(), digestBefore); origin.close();
});

test('el tamaño se comprueba ANTES de leer o descifrar: una cápsula mayor que el límite se rechaza (413) sin leer su contenido', async () => {
  const kit = newKit(); const big = join(kit.capsules, 'enorme-0001.capsule'); writeFileSync(big, Buffer.alloc(MAX_CAPSULE_BYTES + 1, 97));
  const t0 = Date.now(); failsSync(() => loadCapsule(kit, 'enorme-0001.capsule', PASSWORD), 'TOO_LARGE'); assert.ok(Date.now() - t0 < 2000, 'no se intentó leer ni descifrar 64 MiB');
});

test('nombre, tipo de archivo y contraseña inválidos: traversal, directorio, extensión ajena y contraseña fuera de rango', async () => {
  const kit = newKit(); for (const bad of ['../x.capsule', '..\\x.capsule', 'a/b.capsule', 'corto.capsule', 'relevo-0000000.txt', '']) failsSync(() => loadCapsule(kit, bad, PASSWORD), 'BAD_NAME');
  mkdirSync(join(kit.capsules, 'directorio-0001.capsule')); failsSync(() => loadCapsule(kit, 'directorio-0001.capsule', PASSWORD), 'NOT_A_FILE'); failsSync(() => loadCapsule(kit, 'no-existe-0001.capsule', PASSWORD), 'NOT_FOUND');
  const origin = newRoom(); for (const pw of ['', 'corta', 'x'.repeat(201)]) await fails(exportCapsule(origin, pw, kit), 'BAD_PASSWORD'); assert.deepEqual(capsuleFiles(kit).filter(n => n.endsWith('.capsule')), ['directorio-0001.capsule'], 'ningún export publicado'); origin.close();
});

test('formato desconocido y esquema desconocido se rechazan; un campo extra no se acepta en silencio', async () => {
  const { kit, base } = await fixture();
  const v9 = join(kit.capsules, 'v9-000000001.capsule'); writeFileSync(v9, encodePortable({ ...base, format: 'planb-rescue-capsule-v9' }, PASSWORD)); failsSync(() => loadCapsule(kit, 'v9-000000001.capsule', PASSWORD), 'FORMAT_UNSUPPORTED');
  const extra = join(kit.capsules, 'extra-00000001.capsule'); writeFileSync(extra, encodePortable({ ...base, inesperado: true }, PASSWORD)); failsSync(() => loadCapsule(kit, 'extra-00000001.capsule', PASSWORD), 'SCHEMA');
  const missing = join(kit.capsules, 'falta-00000001.capsule'); const { components: _c, ...rest } = base; void _c; writeFileSync(missing, encodePortable(rest, PASSWORD)); failsSync(() => loadCapsule(kit, 'falta-00000001.capsule', PASSWORD), 'SCHEMA');
  const idem = forge(kit, base, c => { (c.components.rescue.idem as Record<string, unknown>)['k-malformado'] = { hash: 1 }; }); failsSync(() => loadCapsule(kit, idem, PASSWORD), 'SCHEMA');
  const j = forge(kit, base, c => { (c.components.rescue.journal[0] as unknown as Record<string, unknown>).kind = 'inventado'; }); failsSync(() => loadCapsule(kit, j, PASSWORD), 'SCHEMA');
});

test('un componente alterado con su digest sin actualizar se detecta (DIGEST_MISMATCH); con digests recalculados lo delatan la coherencia o la comprobación estándar', async () => {
  const { kit, origin, base, digestBefore } = await fixture(), dirs = folders();
  const stale = forge(kit, base, c => { c.components.sim.records.pop(); }, { recompute: false }); failsSync(() => loadCapsule(kit, stale, PASSWORD), 'DIGEST_MISMATCH');
  const tamperSet = forge(kit, base, c => { c.digests.set = 'a'.repeat(64); }, { recompute: false }); failsSync(() => loadCapsule(kit, tamperSet, PASSWORD), 'DIGEST_MISMATCH');
  const recomputed = forge(kit, base, c => { c.components.sim.records.pop(); }); failsSync(() => loadCapsule(kit, recomputed, PASSWORD), 'INCOHERENT');
  assert.equal(folders(), dirs); assert.equal(origin.logicalDigest(), digestBefore); origin.close();
});

test('componentes de REVISIONES DISTINTAS (copia anterior + diario/simulador posteriores, digests coherentes) se rechazan como incoherentes', async () => {
  const kit = newKit(), origin = newRoom(); await workLocally(origin); const early = await exportCapsule(origin, PASSWORD, kit), a = loadCapsule(kit, early.name, PASSWORD).capsule;
  await origin.crmReturn(envelope(origin)); await origin.prepareReturn(envelope(origin)); await origin.editTask({ ...envelope(origin), taskId: 'task-8', values: { status: 'completed' } });
  const late = await exportCapsule(origin, PASSWORD, kit), b = loadCapsule(kit, late.name, PASSWORD).capsule; assert.notEqual(a.capture.stateVersion, b.capture.stateVersion);
  const oldBundleNewRest = forge(kit, b, c => { c.components.bundle = structuredClone(a.components.bundle); }); const e1 = failsSync(() => loadCapsule(kit, oldBundleNewRest, PASSWORD), 'INCOHERENT'); assert.match(e1.message, /otro instante|cambios o registros/);
  const oldSimNewRest = forge(kit, b, c => { c.components.sim = structuredClone(a.components.sim); }); failsSync(() => loadCapsule(kit, oldSimNewRest, PASSWORD), 'INCOHERENT');
  const oldRescueNewRest = forge(kit, b, c => { c.components.rescue = structuredClone(a.components.rescue); }); failsSync(() => loadCapsule(kit, oldRescueNewRest, PASSWORD), 'INCOHERENT');
  const noPlan = forge(kit, b, c => { c.components.recovery.plan = null; }); failsSync(() => loadCapsule(kit, noPlan, PASSWORD), 'INCOHERENT'); origin.close();
});

test('diario, idempotencia y remoto incoherentes: espacio ajeno, secuencia rota, cambio citado inexistente y create sin registro', async () => {
  const { kit, base } = await fixture();
  const ws = forge(kit, base, c => { c.components.rescue.journal[1].workspaceId = 'otro-espacio-ajeno-0001'; }); failsSync(() => loadCapsule(kit, ws, PASSWORD), 'INCOHERENT');
  const seq = forge(kit, base, c => { c.components.rescue.journal[2].seq = 99; }); failsSync(() => loadCapsule(kit, seq, PASSWORD), 'INCOHERENT');
  const future = forge(kit, base, c => { c.components.rescue.journal[1].stateVersion = c.components.rescue.state.version + 5; }); failsSync(() => loadCapsule(kit, future, PASSWORD), 'INCOHERENT');
  const cited = forge(kit, base, c => { const e = c.components.rescue.journal.find(x => x.kind === 'local-edit')!; e.data = { ...e.data, changeId: 99_999 }; }); failsSync(() => loadCapsule(kit, cited, PASSWORD), 'INCOHERENT');
  const orphan = forge(kit, base, c => { c.components.sim.creates.push({ operationId: 'x', remoteId: 'crm-task-0099', subject: 'huérfano' }); c.components.sim.calls.create += 1; c.capture.simCalls += 1; }); failsSync(() => loadCapsule(kit, orphan, PASSWORD), 'INCOHERENT');
  const idemCount = forge(kit, base, c => { delete c.components.rescue.idem[Object.keys(c.components.rescue.idem)[0]]; }); failsSync(() => loadCapsule(kit, idemCount, PASSWORD), 'INCOHERENT');
  const approval = forge(kit, base, c => { c.capture.approvedPlan = true; }); failsSync(() => loadCapsule(kit, approval, PASSWORD), 'INCOHERENT');
});

test('un paquete de la capa estándar incompatible (válido en forma, rechazado por restoreBundle) se rechaza al inspeccionar e importar, sin destino ni staging y con el origen intacto', async () => {
  const { kit, origin, base, digestBefore } = await fixture(), dirs = folders();
  const bad = forge(kit, base, c => { const rec = c.components.bundle.records.find(r => r.entity === 'contacts')!; rec.values = { ...rec.values, email: 'no-es-un-correo' }; c.capture.recordCount = c.components.bundle.records.length; });
  await fails(inspectCapsule(kit, bad, PASSWORD), 'BUNDLE_REJECTED');
  const insp = { sha256: sha256(readFileSync(join(kit.capsules, bad), 'utf8')) }, rev = loadCapsule(kit, bad, PASSWORD).revision;
  await assert.rejects(importCapsule(kit, { name: bad, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: rev }), /integridad|no supera|Error|paquete/i);
  assert.equal(folders(), dirs, 'no se publicó ningún destino ni quedó staging'); assert.ok(!existsSync(join(kit.capsules, bad + '.import-claim')), 'el reclamo se liberó para poder reintentar con otra cápsula'); assert.equal(origin.logicalDigest(), digestBefore); origin.close();
});

test('la aprobación está ligada al contenido exacto: otro SHA, otra revisión o un archivo sustituido tras inspeccionar se rechazan (409) y liberan el reclamo', async () => {
  const kit = newKit(), origin = await originAt('local-work'), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD), dirs = folders();
  await fails(importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: 'f'.repeat(64), expectedRevision: insp.revision }), 'CONTENT_CHANGED'); await fails(importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: 'f'.repeat(64) }), 'CONTENT_CHANGED');
  assert.equal(folders(), dirs); const ok = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); assert.match(ok.destination.folder, /^rescue106-/); trackFolder(join(TMP, ok.destination.folder));
  await fails(importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }), 'ALREADY_IMPORTED'); origin.close();
});

test('la contraseña no aparece en ningún archivo del kit, ni en los errores, ni en el destino', async () => {
  const kit = newKit(), origin = await originAt('return-partial'), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD);
  const imp = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); trackFolder(join(TMP, imp.destination.folder));
  const scan = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? scan(join(dir, d.name)) : [join(dir, d.name)]);
  for (const f of [...scan(kit.dir), ...scan(join(TMP, imp.destination.folder)).filter(p => !/planb\.sqlite|\.planb-key/.test(p))]) assert.ok(!readFileSync(f).includes(Buffer.from(PASSWORD)), 'contraseña en ' + f);
  const sqlite = readFileSync(join(TMP, imp.destination.folder, 'planb.sqlite')); assert.ok(!sqlite.includes(Buffer.from(PASSWORD)), 'contraseña en la base del destino');
  assert.ok(!JSON.stringify(imp).includes(PASSWORD) && !JSON.stringify(insp).includes(PASSWORD) && !JSON.stringify(e).includes(PASSWORD)); origin.close(); void viewOf; void originUncertain;
});
