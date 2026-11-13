import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BundleSchema } from '../shared/model.js';

// QA052 · BACKUP041 (+ QA056 · F1): banco adverso independiente del verificador de copias portátiles y de la normalización
// de resultados inciertos al restaurar/reiniciar. Los tests 1-12 y el caso F1 original son los de QA052 sin cambios de expectativa.
// Fuentes bajo prueba = QA056_ROOT o QA052_ROOT (snapshot propio, por defecto este checkout). Solo datos ficticios en memoria.
// Cada rechazo exige antes que el original sea válido y que la mutación siga siendo un JSON/esquema válido,
// para que el código esperado sea el de la propiedad estudiada y no un error previo que la enmascare.
const OVERRIDE = process.env.QA056_ROOT ?? process.env.QA052_ROOT;
const ROOT = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = (relative: string) => import(pathToFileURL(path.join(ROOT, relative)).href);
const { inspectRecoveryCopy, MAX_RECOVERY_BYTES } = await load('server/recovery-preflight.ts') as typeof import('../server/recovery-preflight.js');
const { encodePortable, decodePortable } = await load('server/crypto.ts') as typeof import('../server/crypto.js');
const { Store, AppError } = await load('server/store.ts') as typeof import('../server/store.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');
const { Recovery, simulatedRemote } = await load('server/recovery.ts') as typeof import('../server/recovery.js');

const PW = 'qa052-solo-fixture-0001';
type B = any;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const inspect = (value: unknown, options?: any) => inspectRecoveryCopy(typeof value === 'string' ? value : JSON.stringify(value), options);
const codes = (result: { issues: { code: string }[] }) => result.issues.map(issue => issue.code);

function liveStore() {
  const store = new Store(':memory:'), snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  return store;
}
/** Exporta un paquete con dos operaciones locales: una actualización y un alta. */
function history(): { bundle: B; created: string } {
  const store = liveStore();
  try {
    store.saveRecord('contacts', { phone: '611 000 052' }, 'contact-1');
    const created = store.saveRecord('contacts', { firstname: 'Alta', email: 'alta@example.invalid' } as any);
    return { bundle: JSON.parse(JSON.stringify(store.bundle())), created: created.id };
  } finally { store.close(); }
}
const production = (b: B) => {
  Object.assign(b, { format: 'planb-continuity-v3' }); b.snapshot.version = 3; b.spec.version = 3;
  Object.assign(b.snapshot.source, { kind: 'hubspot', isTestData: false, environment: 'production', accountType: 'STANDARD' });
  return b;
};

/** Precondiciones: el original es válido y la mutación sigue siendo esquema-válida (salvo que se declare lo contrario). */
function rejects(label: string, original: B, mutate: (b: B) => void, code: string, opts: { schema?: boolean } = {}) {
  assert.equal(inspect(original).status, 'valid', label + ': el original debe ser válido antes de corromperlo');
  const copy = structuredClone(original); mutate(copy);
  if (opts.schema !== false) assert.ok(BundleSchema.safeParse(copy).success, label + ': la mutación no debe romper el esquema (enmascararía la propiedad)');
  let result: ReturnType<typeof inspectRecoveryCopy>;
  assert.doesNotThrow(() => { result = inspect(copy); }, label + ': nunca una excepción no controlada');
  assert.equal(result!.status, 'invalid', label); assert.equal(result!.issues[0].code, code, label + ': código ' + code + ', obtenido ' + codes(result!)); assert.equal(result!.summary, null, label);
}

test('1 · familias de historial: cada incoherencia se rechaza por el contrato real de restauración, no por el esquema', () => {
  const { bundle, created } = history();
  assert.equal(bundle.changes.length, 2); assert.equal(bundle.changes[0].operation, 'update'); assert.equal(bundle.changes[1].operation, 'create');
  const R = (b: B, id: string) => b.records.find((r: any) => r.id === id);
  const cases: [string, (b: B) => void][] = [
    ['registro activo alterado sin operación', b => { R(b, 'contact-2').values.phone = 'sin historia'; }],
    ['before que no corresponde a la captura', b => { b.changes[0].before.values.phone = 'otro'; }],
    ['after distinto del registro activo', b => { b.changes[0].after.values.phone = 'otro'; }],
    ['update presentado como create', b => { b.changes[0].operation = 'create'; }],
    ['create presentado como update', b => { b.changes[1].operation = 'update'; }],
    ['create con before no nulo', b => { b.changes[1].before = structuredClone(R(b, 'contact-2')); }],
    ['ID de cambio duplicado', b => { b.changes[1].id = b.changes[0].id; }],
    ['IDs fuera de orden', b => { b.changes.reverse(); }],
    ['ID de cambio no positivo', b => { b.changes[0].id = 0; }],
    ['entidad del after distinta de la del cambio', b => { b.changes[0].after.entity = 'companies'; }],
    ['recordId distinto del after', b => { b.changes[0].recordId = 'contact-2'; }],
    ['registro activo añadido sin historia', b => { b.records.push({ entity: 'contacts', id: 'fantasma', values: { firstname: 'F', email: 'f@example.invalid' } }); }],
    ['alta local omitida de los registros activos', b => { b.records = b.records.filter((r: any) => r.id !== created); }],
    ['registro de la captura omitido', b => { b.records = b.records.filter((r: any) => r.id !== 'company-1'); }],
    ['registro activo duplicado', b => { b.records.push(structuredClone(b.records[0])); }],
    ['cambios borrados con registros ya modificados', b => { b.changes = []; }],
    ['generación no aprobada', b => { b.generation.approved = false; }],
    ['captura con registro duplicado', b => { b.snapshot.records.push(structuredClone(b.snapshot.records[0])); }],
    ['referencia rota con historial coherente', b => { R(b, 'contact-1').values.company_id = 'company-fantasma'; b.changes[0].after.values.company_id = 'company-fantasma'; }],
    ['campo obligatorio vacío con historial coherente', b => { R(b, 'contact-1').values.email = ''; b.changes[0].after.values.email = ''; }],
  ];
  for (const [label, mutate] of cases) rejects(label, bundle, mutate, 'INTEGRITY_FAILED');
});

test('2 · límites de registros y de esquema: un JSON de forma errónea es INVALID_BUNDLE y no una excepción', () => {
  const { bundle } = history();
  for (const [label, mutate] of [
    ['más de 10.000 registros activos', (b: B) => { b.records = Array.from({ length: 10_001 }, () => b.records[0]); }],
    ['más de 10.000 registros de captura', (b: B) => { b.snapshot.records = Array.from({ length: 10_001 }, () => b.snapshot.records[0]); }],
    ['clave añadida en la raíz', (b: B) => { b.extra = 1; }],
    ['formato desconocido', (b: B) => { b.format = 'planb-continuity-v9'; }],
    ['exportedAt no es fecha', (b: B) => { b.exportedAt = 'ayer'; }],
    ['watermark negativo', (b: B) => { b.returnState.watermark = -1; }],
    ['cambio con clave extra', (b: B) => { b.changes[0].nota = 'x'; }],
  ] as [string, (b: B) => void][]) rejects(label, bundle, mutate, 'INVALID_BUNDLE', { schema: false });
  for (const [label, text] of [['null', 'null'], ['array', '[]'], ['cadena', '"x"'], ['número', '1'], ['booleano', 'true'], ['objeto vacío', '{}']] as const) assert.equal(inspect(text).issues[0].code, 'INVALID_BUNDLE', label);
  assert.equal(inspect('').issues[0].code, 'INVALID_JSON');
  assert.equal(inspect('{"a":').issues[0].code, 'INVALID_JSON');
  assert.equal(inspect('﻿' + JSON.stringify(bundle)).issues[0].code, 'INVALID_JSON', 'una BOM inicial no es JSON: límite conocido, no excepción');
  assert.equal(inspect('['.repeat(2_000_000)).issues[0].code, 'INVALID_JSON', 'anidamiento extremo no desborda la pila');
});

test('3 · formatos: heredado v1 admitido solo con datos de ensayo; producción exige v3 y cifrado; el destino se compara sin normalizar', () => {
  const { bundle } = history();
  const legacy = structuredClone(bundle); legacy.format = 'planb-continuity-v1';
  assert.equal(inspect(legacy).status, 'valid', 'v1 de ensayo sigue siendo restaurable por el contrato');
  const prod = production(structuredClone(bundle));
  assert.equal(inspect(prod).issues[0].code, 'PRODUCTION_REQUIRES_ENCRYPTION');
  const encrypted = inspect(encodePortable(prod, PW), { password: PW });
  assert.equal(encrypted.status, 'valid'); assert.equal(encrypted.summary!.isTestData, false); assert.ok(codes(encrypted).includes('REAL_DATA_POLICY'));
  const v2prod = structuredClone(prod); v2prod.format = 'planb-continuity-v2';
  assert.equal(inspect(encodePortable(v2prod, PW), { password: PW }).issues[0].code, 'INVALID_BUNDLE', 'datos de producción en v2 no son un paquete válido');
  const id = bundle.snapshot.source.accountId;
  const check = (target: any) => inspect(bundle, { target });
  assert.equal(check({ accountId: id, isTestData: true }).targetIdentityMatches, true);
  for (const [label, target] of [['otro portal', { accountId: id + '-x', isTestData: true }], ['otra clase', { accountId: id, isTestData: false }], ['mayúsculas', { accountId: id.toUpperCase(), isTestData: true }], ['espacios', { accountId: ' ' + id + ' ', isTestData: true }]] as const) {
    const result = check(target); assert.equal(result.status, 'incompatible', label); assert.equal(result.targetIdentityMatches, false, label); assert.ok(codes(result).includes('TARGET_MISMATCH'), label);
  }
  for (const [label, target] of [['vacío', { accountId: '', isTestData: true }], ['solo espacios', { accountId: '   ', isTestData: true }], ['201 caracteres', { accountId: 'a'.repeat(201), isTestData: true }], ['número', { accountId: 7, isTestData: true }], ['clase como texto', { accountId: id, isTestData: 'true' }]] as const) {
    const result = check(target); assert.equal(result.status, 'invalid', label); assert.equal(result.issues[0].code, 'INVALID_TARGET', label); assert.equal(result.targetIdentityMatches, null, label);
  }
});

test('4 · contenedor cifrado: cada alteración tiene su rechazo previsto y ninguna llega a "válida" ni lanza', () => {
  const { bundle } = history();
  const pristine = JSON.parse(encodePortable(bundle, PW)), good = (envelope: any) => inspect(JSON.stringify(envelope), { password: PW });
  assert.equal(good(pristine).status, 'valid', 'precondición: el sobre original es válido');
  const bytes = () => Buffer.from(pristine.data.slice(5), 'base64');
  const withBytes = (buffer: Buffer) => ({ ...pristine, data: 'enc1:' + buffer.toString('base64') });
  const flip = (index: number) => { const copy = bytes(); copy[index] ^= 0x80; return withBytes(copy); };
  const cases: [string, any, string][] = [
    ['sal de 15 bytes', { ...pristine, salt: randomBytes(15).toString('base64') }, 'INVALID_ENVELOPE'],
    ['sal de 17 bytes', { ...pristine, salt: randomBytes(17).toString('base64') }, 'INVALID_ENVELOPE'],
    ['sal sin relleno base64', { ...pristine, salt: pristine.salt.replace(/=+$/, '') + 'A' }, 'INVALID_ENVELOPE'],
    ['sal con salto de línea', { ...pristine, salt: pristine.salt + '\n' }, 'INVALID_ENVELOPE'],
    ['sal numérica', { ...pristine, salt: 7 }, 'INVALID_ENVELOPE'],
    ['kdf distinto', { ...pristine, kdf: 'pbkdf2' }, 'INVALID_ENVELOPE'],
    ['clave extra en el sobre', { ...pristine, v: 1 }, 'INVALID_ENVELOPE'],
    ['kdf ausente', (({ kdf, ...rest }) => rest)(pristine), 'INVALID_ENVELOPE'],
    ['prefijo de datos distinto', { ...pristine, data: 'enc2:' + pristine.data.slice(5) }, 'INVALID_ENVELOPE'],
    ['datos no canónicos (espacio)', { ...pristine, data: pristine.data + ' ' }, 'INVALID_ENVELOPE'],
    ['datos con alfabeto URL-safe', { ...pristine, data: pristine.data.replace(/\+/g, '-').replace(/\//g, '_') + (/[+/]/.test(pristine.data) ? '' : '?') }, 'INVALID_ENVELOPE'],
    ['datos de 29 bytes', withBytes(bytes().subarray(0, 29)), 'INVALID_ENVELOPE'],
    ['datos numéricos', { ...pristine, data: 5 }, 'INVALID_ENVELOPE'],
    ['bit del IV alterado', flip(0), 'DECRYPT_FAILED'],
    ['bit de la etiqueta alterado', flip(12), 'DECRYPT_FAILED'],
    ['bit del cuerpo alterado', flip(40), 'DECRYPT_FAILED'],
    ['último byte alterado', flip(bytes().length - 1), 'DECRYPT_FAILED'],
    ['un byte menos', withBytes(bytes().subarray(0, bytes().length - 1)), 'DECRYPT_FAILED'],
    ['un byte más', withBytes(Buffer.concat([bytes(), Buffer.from([0])])), 'DECRYPT_FAILED'],
    ['sal intercambiada por otra válida', { ...pristine, salt: randomBytes(16).toString('base64') }, 'DECRYPT_FAILED'],
  ];
  for (const [label, envelope, code] of cases) {
    let result!: ReturnType<typeof inspectRecoveryCopy>;
    assert.doesNotThrow(() => { result = good(envelope); }, label);
    assert.notEqual(result.status, 'valid', label); assert.equal(result.issues[0].code, code, label + ': ' + codes(result)); assert.equal(result.summary, null, label);
    const text = JSON.stringify(result); assert.ok(!text.includes(PW) && !text.includes('enc1:'), label + ': sin contraseña ni ciphertext en el resultado');
  }
  // Un cambio de formato presenta el archivo como no cifrado: se evalúa como paquete en claro.
  assert.equal(good({ ...pristine, format: 'planb-encrypted-v1' }).issues[0].code, 'INVALID_BUNDLE');
  // Reordenar claves o dar formato al JSON no cambia la validez, sí los bytes (y por tanto el hash).
  const reordered = JSON.stringify({ data: pristine.data, salt: pristine.salt, kdf: pristine.kdf, format: pristine.format }), pretty = JSON.stringify(pristine, null, 2);
  for (const text of [reordered, pretty]) assert.equal(inspect(text, { password: PW }).status, 'valid');
  assert.notEqual(inspect(pretty, { password: PW }).artifactHash, inspect(JSON.stringify(pristine), { password: PW }).artifactHash);
});

test('5 · contraseña: ausente, incorrecta, con otra forma o fuera de límites; ignorada en copias sin cifrar', () => {
  const { bundle } = history(), raw = encodePortable(bundle, PW);
  assert.equal(inspect(raw).issues[0].code, 'PASSWORD_REQUIRED');
  assert.equal(inspect(raw, { password: '' }).issues[0].code, 'PASSWORD_REQUIRED');
  for (const [label, password] of [['con espacio delante', ' ' + PW], ['en mayúsculas', PW.toUpperCase()], ['truncada', PW.slice(0, -1)], ['con salto final', PW + '\n']] as const) {
    const result = inspect(raw, { password }); assert.equal(result.issues[0].code, 'DECRYPT_FAILED', label);
    assert.ok(!JSON.stringify(result).includes(password.trim()), label + ': la contraseña intentada no se refleja en el resultado');
  }
  assert.equal(inspect(raw, { password: 'x'.repeat(200) }).issues[0].code, 'DECRYPT_FAILED', '200 caracteres es admisible y simplemente incorrecta');
  assert.equal(inspect(raw, { password: 'x'.repeat(201) }).issues[0].code, 'INVALID_PASSWORD_INPUT');
  assert.equal(inspect(raw, { password: 123 as any }).issues[0].code, 'INVALID_PASSWORD_INPUT');
  assert.equal(inspect(bundle, { password: 'no-se-usa' }).status, 'valid', 'en copias sin cifrar la contraseña es irrelevante');
});

test('6 · el sobre es independiente del código de producción: un cifrado construido desde la especificación se abre y uno con carga útil no JSON se rechaza como fallo de descifrado', () => {
  const { bundle } = history();
  const seal = (plain: string, password = PW) => {
    const salt = randomBytes(16), key = scryptSync(password, salt, 32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return JSON.stringify({ format: 'planb-encrypted-v2', kdf: 'scrypt', salt: salt.toString('base64'), data: 'enc1:' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64') });
  };
  const independent = seal(JSON.stringify(bundle));
  assert.equal(inspect(independent, { password: PW }).status, 'valid', 'el formato descrito (scrypt + AES-256-GCM, iv|tag|cuerpo) basta para abrirlo');
  assert.deepEqual(decodePortable(independent, PW), bundle);
  assert.equal(inspect(seal('esto no es JSON'), { password: PW }).issues[0].code, 'DECRYPT_FAILED', 'límite documentado: contraseña incorrecta y carga corrupta comparten código');
  for (const payload of ['[]', '"x"', 'null', '{"format":"planb-continuity-v2"}']) assert.equal(inspect(seal(payload), { password: PW }).issues[0].code, 'INVALID_BUNDLE', payload);
  assert.equal(inspect(seal(JSON.stringify(bundle), 'otra-contrasena-fixture-9'), { password: PW }).issues[0].code, 'DECRYPT_FAILED');
  // Dos cifrados del mismo contenido: bytes y hashes distintos, mismo resumen semántico.
  const a = inspect(encodePortable(bundle, PW), { password: PW }), b = inspect(encodePortable(bundle, PW), { password: PW });
  assert.notEqual(a.artifactHash, b.artifactHash); assert.deepEqual(a.summary, b.summary);
});

test('7 · tipos de entrada y tamaño: nada que no sea texto admisible lanza, y el límite se mide en bytes UTF-8', () => {
  for (const value of [undefined, null, 42, {}, [], Buffer.from('{}')] as any[]) {
    let result: any; assert.doesNotThrow(() => { result = inspectRecoveryCopy(value); });
    assert.equal(result.status, 'invalid'); assert.equal(result.issues[0].code, 'SIZE_LIMIT'); assert.equal(result.artifactHash, null);
  }
  const exact = ' '.repeat(MAX_RECOVERY_BYTES), over = ' '.repeat(MAX_RECOVERY_BYTES + 1);
  assert.equal(inspect(exact).issues[0].code, 'INVALID_JSON', 'exactamente el límite se examina (y no es JSON)');
  assert.equal(inspect(over).issues[0].code, 'SIZE_LIMIT');
  const multibyte = 'é'.repeat(Math.floor(MAX_RECOVERY_BYTES / 2) + 1);
  assert.ok(multibyte.length < MAX_RECOVERY_BYTES && Buffer.byteLength(multibyte) > MAX_RECOVERY_BYTES);
  assert.equal(inspect(multibyte).issues[0].code, 'SIZE_LIMIT', 'el límite cuenta bytes, no caracteres');
});

test('8 · devolución: aprobación retirada, envío incierto, vínculo de la comprobación manual y mapa de IDs', async () => {
  const store = liveStore();
  let base: B, approved: B, created: string;
  try {
    store.saveRecord('contacts', { phone: '611 000 053' }, 'contact-1');
    created = store.saveRecord('contacts', { firstname: 'Nuevo', email: 'nuevo@example.invalid' } as any).id;
    const engine = new Recovery(store), remote = { ...simulatedRemote(store), source: 'hubspot' as const };
    const plan = await engine.preview(remote); engine.approve(plan.id);
    approved = JSON.parse(JSON.stringify(store.bundle()));
    store.set('recoveryPlan', null); base = JSON.parse(JSON.stringify(store.bundle()));
  } finally { store.close(); }
  assert.equal(approved.returnState.plan.status, 'approved'); assert.ok(approved.returnState.plan.operations.length >= 2);
  // Aprobación: la inspección avisa y una restauración independiente la deja en revisión sin fecha de aprobación.
  const result = inspect(approved);
  assert.equal(result.status, 'valid'); assert.equal(result.summary!.approvalWouldBeReset, true); assert.ok(codes(result).includes('APPROVAL_RESET'));
  const target = new Store(':memory:');
  try {
    target.restoreBundle(structuredClone(approved));
    const restored: any = target.get('recoveryPlan', null);
    assert.equal(restored.status, 'review'); assert.equal(restored.approvedAt, null); assert.equal(target.get('disconnected', false), true);
  } finally { target.close(); }
  // Envío en curso -> incierto; un envío ya aplicado no se degrada; los inciertos se cuentan de nuestro lado.
  const sending = structuredClone(approved); sending.returnState.plan.status = 'applying';
  sending.returnState.plan.operations[0].status = 'sending'; sending.returnState.plan.operations.slice(1).forEach((op: any) => { op.status = 'applied'; });
  const uncertain = inspect(sending);
  assert.equal(uncertain.status, 'valid'); assert.equal(uncertain.summary!.uncertainOperationsAfterRestore, 1); assert.equal(uncertain.summary!.approvalWouldBeReset, false);
  assert.ok(codes(uncertain).includes('REMOTE_RESULT_UNCERTAIN'));
  // Historial total distinto de pendientes: con watermark en el último cambio no hay pendientes, y justo uno menos deja uno.
  const last = base.changes.at(-1).id;
  for (const [watermark, pending] of [[0, base.changes.length], [last - 1, 1], [last, 0]] as const) {
    const data = structuredClone(base); data.returnState.watermark = watermark; const summary = inspect(data).summary!;
    assert.equal(summary.changeLogEntries, base.changes.length); assert.equal(summary.pendingChanges, pending, 'watermark ' + watermark);
  }
  rejects('watermark una posición por delante', base, b => { b.returnState.watermark = last + 1; }, 'INTEGRITY_FAILED');
  // Comprobación manual: ligada a watermark, sesión y captura; cualquier desvío invalida el paquete.
  const manual = (b: B) => ({ id: 'm1', sessionId: b.sessionId ?? '', captureId: b.snapshot.id + ':' + b.snapshot.capturedAt, revision: 'r', watermark: b.returnState.watermark, verifiedAt: '2026-10-30T10:00:00.000Z', method: 'manual_verified', records: 3 });
  const bound = structuredClone(base); bound.returnState.manualReport = manual(bound);
  assert.equal(inspect(bound).status, 'valid', 'precondición: la comprobación manual coherente es válida');
  for (const [label, mutate] of [
    ['otro watermark', (b: B) => { b.returnState.manualReport.watermark += 1; }],
    ['otra sesión', (b: B) => { b.returnState.manualReport.sessionId += 'x'; }],
    ['otra captura', (b: B) => { b.returnState.manualReport.captureId += 'x'; }],
  ] as [string, (b: B) => void][]) rejects('comprobación manual · ' + label, bound, mutate, 'INTEGRITY_FAILED');
  // Mapa de IDs: solo para altas locales.
  const mapped = structuredClone(base); mapped.returnState.mapping = { ['contacts:' + created!]: '9001' };
  assert.equal(inspect(mapped).status, 'valid', 'precondición: mapear un alta local es válido');
  rejects('mapa de un registro que no se creó localmente', mapped, b => { b.returnState.mapping = { 'contacts:contact-1': '9001' }; }, 'INTEGRITY_FAILED');
  rejects('devolución de otra cuenta', base, b => { b.returnState.accountId = 'otra-cuenta'; }, 'INTEGRITY_FAILED');
  // Plan: destino y operaciones deben corresponder a la copia.
  rejects('plan de otra cuenta', approved, b => { b.returnState.plan.accountId = 'otra-cuenta'; }, 'INTEGRITY_FAILED');
  rejects('plan de otro origen', approved, b => { b.returnState.plan.source = 'simulation'; }, 'INTEGRITY_FAILED');
  rejects('operación sobre un registro inexistente', approved, b => { b.returnState.plan.operations[0].localId = 'no-existe'; }, 'INTEGRITY_FAILED');
});

test('9 · el resumen coincide con un recuento propio y la inspección no toca al llamante ni el sistema de archivos', () => {
  const store = liveStore(), cwd = process.cwd(), sandbox = fs.mkdtempSync(path.join(fs.realpathSync(ROOT), 'tests', '.tmp', 'qa052-cwd-'));
  try {
    store.saveRecord('contacts', { phone: '611 000 054' }, 'contact-2');
    for (const n of [1, 2, 3]) store.saveRecord('tasks', { subject: 'T' + n, due_date: '2026-11-0' + n, status: 'pending' } as any);
    const exported = JSON.parse(JSON.stringify(store.bundle())), raw = JSON.stringify(exported);
    const { exportedAt: _, ...stable } = exported;
    const tally: Record<string, number> = {}; for (const r of exported.records) tally[r.entity] = (tally[r.entity] ?? 0) + 1;
    process.chdir(sandbox);
    const first = inspect(raw), second = inspect(raw);
    process.chdir(cwd);
    assert.deepEqual(first, second, 'inspección repetida determinista');
    assert.equal(first.artifactHash, sha(raw));
    const s = first.summary!;
    assert.equal(s.activeRecords, exported.records.length); assert.equal(s.capturedRecords, exported.snapshot.records.length);
    assert.equal(s.changeLogEntries, 4); assert.equal(s.pendingChanges, 4);
    for (const [entity, n] of Object.entries(tally)) assert.equal((s.counts as any)[entity], n, entity);
    assert.deepEqual(fs.readdirSync(sandbox), [], 'no crea ficheros en el directorio de trabajo');
    const { exportedAt: __, ...after } = JSON.parse(JSON.stringify(store.bundle()));
    assert.deepEqual(after, stable, 'el Store del llamante queda intacto');
    assert.equal(store.changesCount, 4);
  } finally { process.chdir(cwd); store.close(); fs.rmSync(sandbox, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- CLI de verificación de copias
const GUARD = path.join(fs.realpathSync(ROOT), 'scripts', 'block-external.cjs'), CLI = path.join(fs.realpathSync(ROOT), 'scripts', 'check-recovery-copy.ts');
const SCRATCH = fs.mkdtempSync(path.join(fs.realpathSync(ROOT), 'tests', '.tmp', 'qa052-cli-recovery-'));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));
function cli(args: string[], input?: string | Buffer) {
  const env: Record<string, string> = {}; for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key]!;
  const run = spawnSync(process.execPath, ['--require', GUARD, '--import', 'tsx', CLI, ...args], { cwd: fs.realpathSync(ROOT), env, input: input ?? '', encoding: 'utf8', timeout: 90_000, windowsHide: true });
  // El aviso experimental de node:sqlite lo emite el runtime al cargar el Store; no es salida de la herramienta.
  const err = (run.stderr ?? '').split(/\r?\n/).filter(line => line && !/ExperimentalWarning|trace-warnings/.test(line)).join('\n');
  return { code: run.status, out: run.stdout ?? '', err, all: (run.stdout ?? '') + err };
}
const put = (name: string, content: string | Buffer) => { const file = path.join(SCRATCH, name); fs.writeFileSync(file, content); return file; };
const listing = () => fs.readdirSync(SCRATCH).sort();
const fileHash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('10 · CLI: ayuda por defecto sin leer archivos ni stdin; uso incorrecto = 2 sin eco; contraseñas solo por stdin', () => {
  const help = cli([]);
  assert.equal(help.code, 0); assert.match(help.out, /Sin --file solo muestra esta ayuda/); assert.equal(help.err, '');
  assert.equal(cli(['--help']).code, 0);
  const canary = 'QA052-ARGV-CANARY-7731';
  for (const args of [['--help', '--file', 'x'], ['--unknown' + canary], ['--file'], ['--file', '--account', 'a'], ['--file', 'a', '--file', 'b'], ['--password', canary, '--file', 'x'], ['--file', 'x', '--account', 'a'], ['--file', 'x', '--data', 'test'], ['--file', 'x', '--account', 'a', '--data', 'otra']]) {
    const run = cli(args); assert.equal(run.code, 2, args.join(' ')); assert.equal(run.out, '', 'sin salida de resultado'); assert.ok(!run.all.includes(canary), 'sin eco de argumentos: ' + args.join(' '));
  }
});

test('11 · CLI: copia válida e inválida, códigos de salida, bytes intactos, sin ficheros nuevos y sin filtrar contenido', () => {
  const store = liveStore(), PRIV = ['QA052-NOMBRE-9921', 'qa052.correo.9921@example.invalid', 'QA052-CAMPO-LIBRE-9921'];
  let bundle: B;
  try { store.saveRecord('contacts', { firstname: PRIV[0], email: PRIV[1], phone: PRIV[2] } as any); bundle = JSON.parse(JSON.stringify(store.bundle())); } finally { store.close(); }
  bundle.snapshot.source.description = 'QA052-ORIGEN-9921'; bundle.snapshot.name = bundle.snapshot.name;
  const plain = put('copia.json', JSON.stringify(bundle)), enc = put('copia-cifrada.json', encodePortable(bundle, PW));
  const broken = structuredClone(bundle); broken.records.find((r: any) => r.id === 'contact-1').values.phone = 'QA052-SIN-HISTORIA'; const bad = put('rota.json', JSON.stringify(broken));
  const before = Object.fromEntries(listing().map(name => [name, fileHash(path.join(SCRATCH, name))])), names = listing();
  const ok = cli(['--file', plain]); assert.equal(ok.code, 0); assert.equal(JSON.parse(ok.out).status, 'valid');
  const good = cli(['--file', enc, '--password-stdin', '--account', bundle.snapshot.source.accountId, '--data', 'test'], PW + '\r\n');
  assert.equal(good.code, 0, good.all); assert.equal(JSON.parse(good.out).targetIdentityMatches, true);
  assert.equal(cli(['--file', enc, '--password-stdin'], 'incorrecta-fixture-123').code, 1);
  assert.equal(cli(['--file', enc]).code, 1, 'sin contraseña: inválida, no error de uso');
  const mismatch = cli(['--file', plain, '--account', 'otro', '--data', 'test']); assert.equal(mismatch.code, 1); assert.equal(JSON.parse(mismatch.out).status, 'incompatible');
  const invalid = cli(['--file', bad]); assert.equal(invalid.code, 1); assert.equal(JSON.parse(invalid.out).issues[0].code, 'INTEGRITY_FAILED');
  const outputs = [ok, good, mismatch, invalid].map(r => r.all).join('\n');
  for (const secret of [...PRIV, 'QA052-ORIGEN-9921', 'QA052-SIN-HISTORIA', PW, 'enc1:']) assert.ok(!outputs.includes(secret), 'sin filtración de ' + secret.slice(0, 8) + '…');
  assert.match(outputs, new RegExp(bundle.snapshot.source.accountId), 'metadato permitido: el ID del portal sí aparece');
  assert.deepEqual(listing(), names, 'no se crean ficheros'); for (const [name, hash] of Object.entries(before)) assert.equal(fileHash(path.join(SCRATCH, name)), hash, name + ' intacto');
});

test('12 · CLI: contraseña por stdin con límites; rutas inexistentes, directorio, sobre el límite, enlace y UTF-8 inválido', t => {
  const { bundle } = history(), enc = put('c.json', encodePortable(bundle, PW));
  assert.equal(cli(['--file', enc, '--password-stdin'], 'x'.repeat(201)).code, 2, '201 caracteres');
  assert.equal(cli(['--file', enc, '--password-stdin'], 'x'.repeat(900)).code, 2, 'más de 802 bytes');
  assert.equal(cli(['--file', enc, '--password-stdin'], PW + '\n').code, 0, 'salto de línea final admitido');
  assert.equal(cli(['--file', path.join(SCRATCH, 'no-existe.json')]).code, 2);
  assert.equal(cli(['--file', SCRATCH]).code, 2, 'un directorio no es copia');
  assert.equal(cli(['--file', put('utf8.json', Buffer.from([0x7b, 0xff, 0xfe, 0x7d]))]).code, 2, 'UTF-8 inválido');
  const big = path.join(SCRATCH, 'grande.bin'), fd = fs.openSync(big, 'w'); fs.ftruncateSync(fd, MAX_RECOVERY_BYTES + 1); fs.closeSync(fd);
  const huge = cli(['--file', big]); assert.equal(huge.code, 2); fs.rmSync(big);
  const link = path.join(SCRATCH, 'enlace.json');
  try { fs.symlinkSync(enc, link); } catch { t.diagnostic('QA052: symlink no disponible en este equipo (límite de entorno): comportamiento con enlaces SIN VERIFICAR'); return; }
  const viaLink = cli(['--file', link]);
  // Observación (no se exige rechazo): esta CLI sigue enlaces, a diferencia de check-backup-coverage. Se documenta el comportamiento actual.
  assert.ok([0, 2].includes(viaLink.code!), 'comportamiento con enlace: salida ' + viaLink.code);
  assert.notEqual(viaLink.code, 1, 'no confunde un enlace con una copia inválida');
});

// ---------------------------------------------------------------- F1 (hallazgo de QA052, corregido en INTEGRITY055; QA056 lo verifica)
// El CUERPO de esta prueba es el de QA052 sin cambios (misma expectativa); solo se retira el prefijo «HALLAZGO» del título porque ya no
// es un defecto abierto. Contra la fuente anterior sigue fallando por la causa original (ver informe QA056).
test('F1 (caso original QA052, sin rebajar) · una operación "sending" fuera de un plan "applying" no sobrevive a la restauración y se cuenta como incierta', async () => {
  const store = liveStore(); let approved: B;
  try {
    store.saveRecord('contacts', { phone: '611 000 099' }, 'contact-1'); store.saveRecord('contacts', { firstname: 'F1', email: 'f1@example.invalid' } as any);
    const engine = new Recovery(store), plan = await engine.preview({ ...simulatedRemote(store), source: 'hubspot' as const }); engine.approve(plan.id);
    approved = JSON.parse(JSON.stringify(store.bundle()));
  } finally { store.close(); }
  const offenders: string[] = [];
  for (const planStatus of ['review', 'approved', 'partial', 'complete']) {
    const data = structuredClone(approved); data.returnState.plan.status = planStatus; data.returnState.plan.operations[0].status = 'sending';
    const result = inspect(data);
    assert.equal(result.status, 'valid', planStatus + ': precondición, el contrato de restauración acepta el paquete');
    const target = new Store(':memory:');
    try {
      target.restoreBundle(structuredClone(data));
      const restored: any = target.get('recoveryPlan', null);
      // Tras restaurar no existe ningún proceso que siga enviando: todo "sending" restante es un resultado remoto desconocido.
      const unknown = restored.operations.filter((op: any) => ['sending', 'uncertain'].includes(op.status)).length;
      if (result.summary!.uncertainOperationsAfterRestore !== unknown || restored.operations.some((op: any) => op.status === 'sending')) offenders.push(planStatus + ' (informa ' + result.summary!.uncertainOperationsAfterRestore + ', quedan ' + unknown + ' sin resolver)');
    } finally { target.close(); }
  }
  assert.deepEqual(offenders, [], 'estados de plan donde la restauración deja "sending" y el verificador informa 0 inciertas');
});

// ================================================================ QA056 · F1 verificado de forma independiente
// Oráculo propio, escrito a partir del contrato del encargo y NO leído de Store/Recovery:
//   · todo «sending» pasa a «uncertain» (el proceso emisor no sobrevive a una restauración/reinicio);
//   · si queda algún sending/uncertain, o el plan era «applying», el plan queda «partial» y sin aprobación efectiva (approvedAt:null);
//   · restaurar una aprobación ordinaria (sin incertidumbre) la devuelve a «review» (solo al restaurar un paquete);
//   · en cualquier otro caso el plan no cambia. El resto de operaciones, datos e historial no cambian nunca.
const PLAN_STATES = ['review', 'approved', 'partial', 'complete', 'applying'] as const;
type OpStatus = 'pending' | 'sending' | 'applied' | 'failed' | 'uncertain' | 'skipped';
const unknownResult = (statuses: OpStatus[]) => statuses.some(s => s === 'sending' || s === 'uncertain');
function oracle(planStatus: string, approvedAt: string | null, statuses: OpStatus[], mode: 'restore' | 'reboot') {
  const unknown = unknownResult(statuses);
  const status = unknown || planStatus === 'applying' ? 'partial' : mode === 'restore' && planStatus === 'approved' ? 'review' : planStatus;
  const retire = unknown || planStatus === 'applying' || (mode === 'restore' && planStatus === 'approved');
  return { status, approvedAt: retire ? null : approvedAt, ops: statuses.map(s => (s === 'sending' ? 'uncertain' : s) as OpStatus), unknown };
}
const STAMP = '2026-10-30T09:00:00.000Z';

/** Paquete con un plan hubspot aprobado real (preview+approve): operación 0 = actualización de contact-1, operación 1 = alta. */
async function approvedBundle() {
  const store = liveStore();
  try {
    store.saveRecord('contacts', { phone: '611 000 561' }, 'contact-1'); store.saveRecord('contacts', { firstname: 'Alta56', email: 'alta56@example.invalid' } as any);
    const engine = new Recovery(store), plan = await engine.preview({ ...simulatedRemote(store), source: 'hubspot' as const }); engine.approve(plan.id);
    return JSON.parse(JSON.stringify(store.bundle())) as B;
  } finally { store.close(); }
}
/** Copia del paquete con N operaciones válidas (las dos reales y clones sobre contactos existentes) en los estados indicados. */
function shaped(base: B, planStatus: string, statuses: OpStatus[], approvedAt: string | null) {
  const data = structuredClone(base), plan = data.returnState.plan, original = plan.operations;
  const contacts = data.records.filter((r: any) => r.entity === 'contacts').map((r: any) => r.id);
  plan.operations = statuses.map((status, index) => ({ ...structuredClone(original[index] ?? original[0]), id: 'op56-' + index, localId: original[index]?.localId ?? contacts[index % contacts.length], status, error: status === 'failed' ? 'fallo previo' : null }));
  plan.status = planStatus; plan.approvedAt = approvedAt;
  return data;
}
const countingRemote = (store: InstanceType<typeof Store>) => {
  const calls: string[] = [], inner = { ...simulatedRemote(store), source: 'hubspot' as const }, remote = { ...inner } as any;
  for (const name of ['verify', 'read', 'create', 'update', 'relate'] as const) remote[name] = (...args: any[]) => { calls.push(name); return (inner as any)[name](...args); };
  return { remote: remote as typeof inner, calls, writes: () => calls.filter(call => ['create', 'update', 'relate'].includes(call)) };
};
async function rejectsWith(action: Promise<unknown> | (() => unknown), pattern: RegExp, label: string) {
  try { await (typeof action === 'function' ? action() : action); } catch (error) {
    assert.ok(error instanceof AppError, label + ': debe ser un AppError controlado, no ' + String(error)); assert.equal(error.status, 409, label + ': HTTP 409'); assert.match(error.message, pattern, label); return;
  }
  assert.fail(label + ': debía rechazarse y no se rechazó');
}
/** Un plan con resultado desconocido no puede editarse, aprobarse, aplicarse, decidirse, refrescarse ni sustituirse; y no toca el remoto. */
async function assertLocked(store: InstanceType<typeof Store>, engine: InstanceType<typeof Recovery>, label: string) {
  const plan: any = store.get('recoveryPlan', null), { remote, calls } = countingRemote(store);
  assert.equal(plan.status, 'partial', label); assert.equal(plan.approvedAt, null, label);
  assert.equal(engine.revision(), plan.revision, label + ': precondición, la revisión local no cambió (el bloqueo se atribuye a la incertidumbre, no a otra causa)');
  await rejectsWith(() => store.saveRecord('contacts', { phone: '611 000 562' }, 'contact-2'), /Resuelve la devolución parcial/, label + ' · editar');
  await rejectsWith(() => engine.approve(plan.id), /resultados inciertos/, label + ' · aprobar');
  await rejectsWith(engine.apply(plan.id, remote), /Revisa y aprueba un plan vigente/, label + ' · aplicar');
  await rejectsWith(() => engine.decide(plan.id, []), /El envío ya se ha iniciado/, label + ' · decidir');
  await rejectsWith(engine.refresh(plan.id, remote), /inciertos/, label + ' · refrescar');
  await rejectsWith(engine.preview(remote), /Resuelve o termina el envío actual/, label + ' · plan nuevo');
  assert.deepEqual(calls, [], label + ': ninguna llamada al remoto (ni reenvío ni lectura) desde una vía bloqueada');
  assert.deepEqual(store.get('recoveryPlan', null), plan, label + ': el plan no cambia al intentar usarlo');
}

const SHAPES: { name: string; ops: OpStatus[] }[] = [
  { name: 'un sending al inicio', ops: ['sending', 'pending', 'pending'] },
  { name: 'sending tras una operación aplicada', ops: ['applied', 'sending', 'pending'] },
  { name: 'dos sending y una aplicada', ops: ['sending', 'sending', 'applied'] },
  { name: 'incertidumbre preexistente (sin sending)', ops: ['uncertain', 'pending', 'applied'] },
  { name: 'sending + uncertain + failed', ops: ['sending', 'uncertain', 'failed'] },
  { name: 'solo el último en vuelo', ops: ['applied', 'skipped', 'sending'] },
  { name: 'control · todo resuelto', ops: ['applied', 'skipped', 'applied'] },
  { name: 'control · todo pendiente', ops: ['pending', 'pending', 'pending'] },
  { name: 'control · aplicada, fallida y omitida', ops: ['applied', 'failed', 'skipped'] },
];

test('F1-1 · restauración: todo sending → uncertain en 5 estados de plan × 9 formas; plan partial sin aprobación; el resto, intacto', async () => {
  const base = await approvedBundle();
  assert.equal(base.returnState.plan.status, 'approved'); assert.ok(base.returnState.plan.operations.length >= 2, 'precondición: plan real con operaciones');
  let cases = 0;
  for (const planStatus of PLAN_STATES) for (const shape of SHAPES) {
    const label = planStatus + ' · ' + shape.name, approvedAt = planStatus === 'review' ? null : STAMP;
    const data = shaped(base, planStatus, shape.ops, approvedAt), pristine = JSON.parse(JSON.stringify(data));
    assert.ok(BundleSchema.safeParse(data).success, label + ': el paquete fabricado es esquema-válido');
    const expected = oracle(planStatus, approvedAt, shape.ops, 'restore'), preflight = inspect(data);
    assert.equal(preflight.status, 'valid', label + ': el contrato de restauración acepta el paquete');
    assert.equal(preflight.summary!.uncertainOperationsAfterRestore, shape.ops.filter(s => s === 'sending' || s === 'uncertain').length, label + ': el resumen del verificador cuenta sending+uncertain');
    assert.equal(preflight.summary!.approvalWouldBeReset, planStatus === 'approved', label + ': aviso de aprobación retirada');
    assert.equal(codes(preflight).includes('REMOTE_RESULT_UNCERTAIN'), expected.unknown, label + ': aviso de incertidumbre');
    const target = new Store(':memory:');
    try {
      target.restoreBundle(data);
      assert.deepEqual(JSON.parse(JSON.stringify(data)), pristine, label + ': la entrada no se muta');
      const restored: any = target.get('recoveryPlan', null);
      assert.equal(restored.status, expected.status, label + ': estado del plan'); assert.equal(restored.approvedAt, expected.approvedAt, label + ': aprobación');
      assert.deepEqual(restored.operations.map((op: any) => op.status), expected.ops, label + ': estado de cada operación');
      assert.ok(!restored.operations.some((op: any) => op.status === 'sending'), label + ': no queda ningún sending');
      restored.operations.forEach((op: any, index: number) => {
        const before = pristine.returnState.plan.operations[index];
        if (before.status === 'sending') { assert.equal(typeof op.error, 'string', label + ': la operación explica el motivo'); assert.ok(op.error.length > 10, label); assert.deepEqual({ ...op, status: null, error: null }, { ...before, status: null, error: null }, label + ': solo cambian estado y mensaje'); }
        else assert.deepEqual(op, before, label + ': la operación no afectada queda idéntica');
      });
      for (const key of ['id', 'accountId', 'createdAt', 'revision', 'source', 'warning'] as const) assert.equal(restored[key], pristine.returnState.plan[key], label + ': ' + key);
      assert.deepEqual(target.records(), pristine.records, label + ': registros intactos'); assert.deepEqual(target.changes(), pristine.changes, label + ': historial intacto');
      assert.deepEqual(target.snapshot, pristine.snapshot, label + ': captura intacta'); assert.equal(target.get('disconnected', false), true);
      // Un reinicio posterior no cambia nada más (idempotente) y, si hay incertidumbre, el plan queda bloqueado.
      const engine = new Recovery(target); assert.deepEqual(target.get('recoveryPlan', null), restored, label + ': reiniciar tras restaurar no vuelve a cambiar el plan');
      if (expected.unknown) await assertLocked(target, engine, label);
    } finally { target.close(); }
    cases++;
  }
  assert.equal(cases, PLAN_STATES.length * SHAPES.length);
});

test('F1-2 · controles positivos: aprobación ordinaria → review; plan completo realmente resuelto sigue completo y no bloquea la edición; applying sin envío en vuelo → revisión', async () => {
  const base = await approvedBundle(), restore = (data: B) => { const target = new Store(':memory:'); target.restoreBundle(data); return target; };
  const ordinary = restore(shaped(base, 'approved', ['pending', 'applied', 'pending'], STAMP));
  try { const plan: any = ordinary.get('recoveryPlan', null); assert.equal(plan.status, 'review'); assert.equal(plan.approvedAt, null); assert.deepEqual(plan.operations.map((o: any) => o.status), ['pending', 'applied', 'pending']); } finally { ordinary.close(); }
  const complete = restore(shaped(base, 'complete', ['applied', 'skipped', 'applied'], STAMP));
  try {
    const plan: any = complete.get('recoveryPlan', null); assert.equal(plan.status, 'complete'); assert.equal(plan.approvedAt, STAMP, 'la fecha de una aprobación ya consumida no se inventa ni se borra');
    assert.doesNotThrow(() => complete.saveRecord('contacts', { phone: '611 000 563' }, 'contact-2'), 'un plan completo realmente resuelto no bloquea la edición');
    assert.equal(new Recovery(complete).plan()!.status, 'complete');
  } finally { complete.close(); }
  for (const ops of [['pending', 'pending', 'pending'], ['applied', 'applied', 'applied'], ['applied', 'pending', 'skipped']] as OpStatus[][]) {
    const applying = restore(shaped(base, 'applying', ops, STAMP));
    try {
      const plan: any = applying.get('recoveryPlan', null);
      assert.equal(plan.status, 'partial', 'applying sin envío en vuelo (' + ops + ') exige revisión'); assert.equal(plan.approvedAt, null);
      assert.deepEqual(plan.operations.map((o: any) => o.status), ops, 'sin inventar resultados: las operaciones quedan como estaban');
      // No queda bloqueado para siempre: se puede volver a aprobar el plan parcial.
      assert.doesNotThrow(() => new Recovery(applying).approve(plan.id), 'un plan partial sin incertidumbre se puede aprobar de nuevo');
    } finally { applying.close(); }
  }
});

test('F1-3 · sin reenvío ni resultado remoto inventado: resolver una incierta exige un registro remoto que lo confirme y, resuelta, el plan se completa sin escribir de nuevo', async () => {
  const base = await approvedBundle(), data = shaped(base, 'approved', ['sending', 'applied', 'applied'], STAMP);
  const target = new Store(':memory:'); target.restoreBundle(data);
  try {
    const engine = new Recovery(target), plan: any = target.get('recoveryPlan', null), op = plan.operations[0];
    assert.equal(op.status, 'uncertain'); assert.equal(op.kind, 'update'); assert.equal(op.remoteId, 'contact-1');
    await assertLocked(target, engine, 'tras restaurar');
    const probe = countingRemote(target);
    await rejectsWith(engine.resolveUncertain(plan.id, op.id, 'id-remoto-inventado', probe.remote), /no confirma|no corresponde/, 'resolver con un ID que no existe');
    await rejectsWith(engine.resolveUncertain(plan.id, op.id, 'contact-1', probe.remote), /no confirma los valores/, 'el registro remoto aún tiene el valor antiguo: no se da por enviado');
    assert.deepEqual(probe.writes(), [], 'resolver solo lee: no escribe en el remoto');
    assert.equal((target.get('recoveryPlan', null) as any).operations[0].status, 'uncertain', 'el rechazo no convierte la incierta en resuelta');
    // Con el cambio realmente presente en el remoto, la operación se resuelve y el flujo posterior no reenvía nada.
    const local = Object.fromEntries(op.fields.filter((f: any) => f.decision === 'local').map((f: any) => [f.field, f.local])); assert.ok(Object.keys(local).length > 0);
    target.set('simulatedRemote', target.snapshot!.records.map(r => r.entity === op.entity && r.id === 'contact-1' ? { ...r, values: { ...r.values, ...local } } : r));
    const fresh = countingRemote(target);
    const resolved = await engine.resolveUncertain(plan.id, op.id, 'contact-1', fresh.remote);
    assert.equal(resolved.operations[0].status, 'applied'); assert.equal(resolved.status, 'partial');
    assert.doesNotThrow(() => engine.approve(plan.id)); const done = await engine.apply(plan.id, fresh.remote);
    assert.equal(done.status, 'complete'); assert.deepEqual(fresh.writes(), [], 'completar el plan no reenvía ninguna operación ya resuelta');
  } finally { target.close(); }
});

test('F1-4 · reinicio: el constructor de Recovery normaliza planes persistidos por versiones anteriores (5 estados × 9 formas) sin llamar al remoto', async () => {
  const base = await approvedBundle();
  for (const planStatus of PLAN_STATES) for (const shape of SHAPES) {
    const label = 'reinicio · ' + planStatus + ' · ' + shape.name, approvedAt = planStatus === 'review' ? null : STAMP;
    const store = liveStore();
    try {
      store.saveRecord('contacts', { phone: '611 000 564' }, 'contact-1'); store.saveRecord('contacts', { firstname: 'Alta56', email: 'alta56@example.invalid' } as any);
      const persisted = shaped(base, planStatus, shape.ops, approvedAt).returnState.plan;
      persisted.revision = new Recovery(store).revision(); store.set('recoveryPlan', persisted);
      const before = JSON.parse(JSON.stringify(persisted)), expected = oracle(planStatus, approvedAt, shape.ops, 'reboot');
      const engine = new Recovery(store), plan: any = store.get('recoveryPlan', null);
      assert.equal(plan.status, expected.status, label); assert.equal(plan.approvedAt, expected.approvedAt, label);
      assert.deepEqual(plan.operations.map((op: any) => op.status), expected.ops, label);
      plan.operations.forEach((op: any, index: number) => { if (before.operations[index].status !== 'sending') assert.deepEqual(op, before.operations[index], label + ': operación no afectada idéntica'); else assert.ok(op.error && op.error.length > 10, label); });
      assert.deepEqual(new Recovery(store).plan(), plan, label + ': segundo reinicio idempotente'); assert.equal(store.get('returnBusy', true), false, label);
      if (expected.unknown) await assertLocked(store, engine, label);
      else if (planStatus === 'approved') { assert.equal(plan.status, 'approved', label); assert.equal(plan.approvedAt, STAMP, label + ': control · una aprobación ordinaria sin incertidumbre NO se retira al reiniciar'); }
    } finally { store.close(); }
  }
});

test('F1-5 · generativo (semillas fijas): restauración y reinicio contra el oráculo propio con 1-5 operaciones de estado aleatorio', async () => {
  const base: B = await approvedBundle(), ALL: OpStatus[] = ['pending', 'sending', 'applied', 'failed', 'uncertain', 'skipped'];
  const rng = (seed: number) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let total = 0;
  for (const seed of [56001, 56002, 56003, 56004]) {
    const next = rng(seed);
    for (let index = 0; index < 40; index++) {
      const where = 'semilla ' + seed + ' caso ' + index, planStatus = PLAN_STATES[Math.floor(next() * 5)];
      const statuses = Array.from({ length: 1 + Math.floor(next() * 5) }, () => ALL[Math.floor(next() * 6)]);
      const approvedAt = next() < 0.5 ? null : STAMP, data = shaped(base, planStatus, statuses, approvedAt);
      const restoreExpected = oracle(planStatus, approvedAt, statuses, 'restore'), bootExpected = oracle(planStatus, approvedAt, statuses, 'reboot');
      assert.equal(inspect(data).summary!.uncertainOperationsAfterRestore, statuses.filter(s => s === 'sending' || s === 'uncertain').length, where + ' · resumen');
      const target = new Store(':memory:');
      try {
        target.restoreBundle(data); const restored: any = target.get('recoveryPlan', null);
        assert.deepEqual([restored.status, restored.approvedAt, restored.operations.map((o: any) => o.status)], [restoreExpected.status, restoreExpected.approvedAt, restoreExpected.ops], where + ' · restauración');
        assert.deepEqual(target.records(), data.records, where); assert.deepEqual(target.changes(), data.changes, where);
        // Reinicio sobre un plan heredado con los mismos estados (sin pasar por restoreBundle).
        target.set('recoveryPlan', structuredClone(shaped(base, planStatus, statuses, approvedAt).returnState.plan));
        new Recovery(target); const rebooted: any = target.get('recoveryPlan', null);
        assert.deepEqual([rebooted.status, rebooted.approvedAt, rebooted.operations.map((o: any) => o.status)], [bootExpected.status, bootExpected.approvedAt, bootExpected.ops], where + ' · reinicio');
      } finally { target.close(); }
      total++;
    }
  }
  assert.equal(total, 160);
});

test('F1-6 · observación de robustez: un plan persistido sin lista de operaciones y fuera de «applying» (se caracteriza, no se exige)', t => {
  const store = liveStore();
  try {
    store.set('recoveryPlan', { id: 'plan-malformado', status: 'review', approvedAt: null, accountId: 'x', source: 'hubspot' });
    let outcome = 'el constructor arranca sin error';
    try { new Recovery(store); } catch (error) { outcome = 'el constructor lanza ' + (error as Error).constructor.name + ': ' + (error as Error).message.slice(0, 80); }
    t.diagnostic('QA056 · plan sin «operations» y estado "review": ' + outcome);
    assert.ok(outcome.length > 0);
  } finally { store.close(); }
});

/** Mapa causal: en vez de parar en el primer fallo, acumula qué PROPIEDAD concreta se incumple en cada combinación, para atribuir un fallo a su causa. */
test('F1-7 · mapa causal (5 estados × 9 formas × restaurar/reiniciar): ninguna propiedad de seguridad se incumple; el mensaje de fallo lista cuáles', async () => {
  const base = await approvedBundle(), histogram: Record<string, string[]> = {};
  const flag = (code: string, label: string) => { (histogram[code] ??= []).push(label); };
  const probe = async (store: InstanceType<typeof Store>, engine: InstanceType<typeof Recovery>, label: string) => {
    const plan: any = store.get('recoveryPlan', null);
    try { store.saveRecord('contacts', { phone: '611 000 565' }, 'contact-2'); flag('EDIT_NOT_BLOCKED', label); } catch (error) { if (!(error instanceof AppError) || error.status !== 409) flag('EDIT_UNEXPECTED_ERROR', label); }
    const { remote, calls, writes } = countingRemote(store);
    let approved = false;
    try { engine.approve(plan.id); approved = true; } catch (error) { if (!(error instanceof AppError) || error.status !== 409) flag('APPROVE_UNEXPECTED_ERROR', label); }
    if (approved) flag('APPROVE_NOT_BLOCKED', label);
    try { await engine.apply(plan.id, remote); } catch { /* bloqueado */ }
    if (writes().length > 0) flag('RESENT_TO_REMOTE', label + ' (' + writes().join(',') + ')');
    else if (calls.length > 0) flag('REMOTE_TOUCHED', label);
  };
  for (const mode of ['restore', 'reboot'] as const) for (const planStatus of PLAN_STATES) for (const shape of SHAPES) {
    const label = mode + ' · ' + planStatus + ' · ' + shape.name, approvedAt = planStatus === 'review' ? null : STAMP, expected = oracle(planStatus, approvedAt, shape.ops, mode);
    const store = mode === 'restore' ? new Store(':memory:') : liveStore();
    try {
      let plan: any;
      if (mode === 'restore') {
        const data = shaped(base, planStatus, shape.ops, approvedAt);
        const count = inspect(data).summary!.uncertainOperationsAfterRestore, want = shape.ops.filter(s => s === 'sending' || s === 'uncertain').length;
        if (count !== want) flag('SUMMARY_UNDERCOUNT', label + ' (informa ' + count + ', hay ' + want + ')');
        store.restoreBundle(data); new Recovery(store);
      } else {
        store.saveRecord('contacts', { phone: '611 000 564' }, 'contact-1'); store.saveRecord('contacts', { firstname: 'Alta56', email: 'alta56@example.invalid' } as any);
        const persisted = shaped(base, planStatus, shape.ops, approvedAt).returnState.plan; persisted.revision = new Recovery(store).revision(); store.set('recoveryPlan', persisted); new Recovery(store);
      }
      plan = store.get('recoveryPlan', null);
      if (plan.operations.some((op: any) => op.status === 'sending')) flag('SENDING_REMAINS', label);
      if (plan.status !== expected.status) flag('PLAN_STATUS_WRONG', label + ' (' + plan.status + ' ≠ ' + expected.status + ')');
      if (plan.approvedAt !== expected.approvedAt) flag('APPROVAL_NOT_RETIRED', label);
      if (JSON.stringify(plan.operations.map((o: any) => o.status)) !== JSON.stringify(expected.ops)) flag('OP_STATUS_WRONG', label);
      if (expected.unknown) await probe(store, new Recovery(store), label);
    } finally { store.close(); }
  }
  const summary = Object.entries(histogram).map(([code, where]) => code + ' ×' + where.length + ' (p. ej. ' + where[0] + ')').join('\n   ');
  assert.deepEqual(Object.keys(histogram), [], 'propiedades incumplidas:\n   ' + summary);
});
