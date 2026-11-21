import test from 'node:test';
import nodeAssert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Runtime, View, Transport, setupGlobals } from './helpers/independent-interface-harness.js';

// QA091 · UI de devolución (ChangesView / ManualRecovery) frente a servidores antiguos, metadatos incoherentes y carreras.
// Qué ES: los componentes REALES de src/ ejecutados con el arnés propio de hooks de QA073 (tests/helpers/independent-interface-harness.ts):
// hooks genuinos, efectos con cleanups, temporizadores y un fetch ficticio cuyas respuestas se retienen y que puede IGNORAR la cancelación.
// Qué NO es: React DOM, foco real, tamaño de 44 px, móvil, CSS ni lector de pantalla; eso se comprueba en el navegador real
// (tests/e2e/independent-return-integrity.spec.ts). Un manejador "capturado" es la función onClick/onChange de un render anterior, invocada
// directamente (un navegador no lo haría con un control disabled, un script o una pestaña vieja sí). Todo ficticio.
const ROOT = path.resolve(process.env.QA091_UI_ROOT ?? process.env.QA091_SRC ?? process.cwd());
const shared = await import(pathToFileURL(path.join(ROOT, 'shared/recovery-integrity.ts')).href) as typeof import('../shared/recovery-integrity.js');
const { INVALID_RECOVERY_MESSAGE, RecoveryChangesSchema, SavedChangesSchema, inspectPersistedRecoveryPlan } = shared;

let asserted = 0;
const A = {
  eq: (a: unknown, b: unknown, m?: string) => { asserted++; nodeAssert.equal(a, b, m); },
  deep: (a: unknown, b: unknown, m?: string) => { asserted++; nodeAssert.deepEqual(a, b, m); },
  ok: (v: unknown, m?: string) => { asserted++; nodeAssert.ok(v, m); },
  has: (text: string, needle: string, m?: string) => { asserted++; nodeAssert.ok(text.includes(needle), (m ?? 'falta') + ': «' + needle + '» en «' + text.slice(0, 300) + '»'); },
  no: (text: string, needle: string, m?: string) => { asserted++; nodeAssert.ok(!text.includes(needle), (m ?? 'sobra') + ': «' + needle + '»'); }
};
function check(name: string, fn: () => unknown | Promise<unknown>, opts: { todo?: string } = {}) {
  test(name, { timeout: 30000, ...opts }, async () => { const before = asserted; await fn(); nodeAssert.ok(asserted > before, 'el caso no ejecutó ninguna aserción'); });
}

// ---- datos ficticios -----------------------------------------------------------------------------------------------------
const NONE = { state: 'none', code: null, message: null }, VALID = { state: 'valid', code: null, message: null };
const INVALID = { state: 'invalid', code: 'RECOVERY_PLAN_INVALID', message: INVALID_RECOVERY_MESSAGE };
const rec = (entity: string, id: string, values: Record<string, unknown>) => ({ id, entity, values });
const change = (id: number, entity: 'contacts' | 'companies', recordId: string, op: 'create' | 'update') => ({
  id, at: '2026-10-31T10:0' + id + ':00.000Z', entity, recordId, operation: op,
  before: op === 'create' ? null : rec(entity, recordId, { name: 'Antes ' + id, firstname: 'Antes', email: 'a@example.test' }),
  after: rec(entity, recordId, entity === 'companies' ? { name: 'Después ' + id } : { firstname: 'Nuria', lastname: 'Qa091', email: 'n.qa091@example.test' })
});
const CHANGES = [change(1, 'contacts', 'local-qa091-1', 'create'), change(2, 'companies', 'company-1', 'update'), change(3, 'contacts', 'contact-1', 'update')];
const PLAN = {
  id: 'plan-qa091', accountId: 'demo-agency', createdAt: '2026-10-31T10:00:00.000Z', revision: 'rev-A', status: 'review', source: 'simulation', warning: 'Aviso ficticio', approvedAt: null,
  operations: [{ id: 'op-1', entity: 'companies', localId: 'company-1', remoteId: 'company-1', kind: 'update', label: 'Estudio Arce', remoteVersion: 'v1', status: 'pending', error: null, references: [],
    fields: [{ field: 'phone', label: 'Teléfono', base: '900', local: '911', remote: '900', conflict: false, decision: 'local' }] }]
};
const payload = (over: Record<string, unknown> = {}) => ({ changes: CHANGES, plan: null, recoveryIntegrity: NONE, revision: 'a'.repeat(64), pendingChanges: 3, watermark: 0, manualReport: null, ...over });

// ---- sesión: arnés + transporte + temporizador manual ----------------------------------------------------------------------
type Ctx = { t: Transport; rt: Runtime; mount: (C: any, props: Record<string, any>) => View; tick: (v: View) => Promise<void> };
async function session(fn: (c: Ctx) => Promise<void>) {
  const restore = setupGlobals(), t = new Transport(), rt = new Runtime(ROOT, { SalesWorkspace: { SalesWorkspace: () => 'PROPOSALS_PRESENT' } }), views: View[] = [];
  const g = globalThis as any, prevFetch = g.fetch, sI = g.setInterval, cI = g.clearInterval; g.fetch = t.fetch;
  const intervals: { fn: () => void; id: number }[] = []; let seq = 0;
  g.setInterval = (fn: () => void) => { const id = ++seq; intervals.push({ fn, id }); return id; };
  g.clearInterval = (id: number) => { const i = intervals.findIndex(x => x.id === id); if (i >= 0) intervals.splice(i, 1); };
  try {
    await fn({ t, rt, mount: (C, props) => { const v = new View(rt, C, props); views.push(v); return v; }, tick: async v => { [...intervals].forEach(i => i.fn()); await v.settle(); } });
  } finally { views.forEach(v => v.unmount()); g.fetch = prevFetch; g.setInterval = sI; g.clearInterval = cI; restore(); }
}
const gets = (t: Transport) => t.where(/\/v2\/changes$/, 'GET');
const button = (v: View, name: string) => v.find({ tag: 'button', text: name });
const off = (v: View, n: any) => v.disabled(n) || n.props['aria-disabled'] === 'true' || n.props['aria-disabled'] === true;
const text = (v: View) => v.text();
const answer = (call: any, body: unknown) => call.resolve(200, body);
async function open(c: Ctx, body: unknown, props: Record<string, any> = {}) {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false, ...props });
  await v.settle(); answer(gets(c.t)[0], body); await v.settle(); return v;
}

// ======================================================================================================================
// 1 · Contrato de datos entre servidor y UI (esquema compartido), sin componente
// ======================================================================================================================
check('contrato · 3 estados coherentes se aceptan (control) y cada incoherencia, metadato ausente o campo extra se rechaza', () => {
  const ok = (over: any) => RecoveryChangesSchema.safeParse(payload(over)).success;
  A.eq(ok({}), true); A.eq(ok({ recoveryIntegrity: VALID, plan: PLAN }), true); A.eq(ok({ recoveryIntegrity: INVALID, plan: null }), true);
  A.eq(ok({ recoveryIntegrity: VALID, plan: null }), false, 'valid sin plan'); A.eq(ok({ recoveryIntegrity: NONE, plan: PLAN }), false, 'none con plan'); A.eq(ok({ recoveryIntegrity: INVALID, plan: PLAN }), false, 'invalid con plan');
  A.eq(ok({ recoveryIntegrity: undefined }), false, 'servidor antiguo sin metadato'); A.eq(ok({ recoveryIntegrity: { state: 'invalid', code: 'OTRO', message: INVALID_RECOVERY_MESSAGE } }), false, 'código distinto');
  A.eq(ok({ recoveryIntegrity: { state: 'invalid', code: 'RECOVERY_PLAN_INVALID', message: 'otro texto' } }), false, 'mensaje distinto');
  A.eq(ok({ recoveryIntegrity: { ...NONE, extra: 1 } }), false, 'clave extra'); A.eq(ok({ recoveryIntegrity: { state: 'maybe', code: null, message: null } }), false, 'estado desconocido');
  A.eq(ok({ pendingChanges: -1 }), false); A.eq(ok({ watermark: 1.5 }), false); A.eq(ok({ revision: 7 }), false); A.eq(ok({ manualReport: { verifiedAt: 'ayer' } }), false);
});
check('contrato · el historial se valida APARTE de los metadatos: historial válido + metadatos inválidos → solo el historial pasa', () => {
  const bad = payload({ recoveryIntegrity: { state: 'invalid', code: 'RECOVERY_PLAN_INVALID', message: 'distinto' } });
  A.eq(SavedChangesSchema.safeParse(bad.changes).success, true); A.eq(RecoveryChangesSchema.safeParse(bad).success, false);
  A.eq(SavedChangesSchema.safeParse([{ ...CHANGES[0], operation: 'delete' }]).success, false, 'un historial malformado no pasa');
  A.eq(SavedChangesSchema.safeParse([{ ...CHANGES[0], after: { id: 'x' } }]).success, false);
});
check('contrato · la inspección compartida distingue ausencia, nulo y forma inválida sin devolver el contenido', () => {
  A.eq(inspectPersistedRecoveryPlan(null).integrity.state, 'none'); A.eq(inspectPersistedRecoveryPlan(PLAN).integrity.state, 'valid');
  for (const raw of [undefined, 0, '', [], {}, { ...PLAN, status: 'bogus' }, { ...PLAN, extra: 'PRIVATE_QA091_MARKER' }]) {
    const r = inspectPersistedRecoveryPlan(raw as any); A.eq(r.integrity.state, 'invalid'); A.eq(r.plan, null); A.no(JSON.stringify(r), 'PRIVATE_QA091_MARKER');
  }
});

// ======================================================================================================================
// 2 · ChangesView real
// ======================================================================================================================
check('arranque · sin respuesta aún la devolución está cerrada (fail-closed), no hay POST y se avisa; con respuesta sana se abre (control)', () => session(async c => {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false }); await v.settle();
  A.eq(gets(c.t).length, 1); A.eq(v.all({ tag: 'button', text: 'Preparar revisión' }).length, 0, 'sin asistente antes de la primera respuesta'); A.has(text(v), 'Comprobando el estado de devolución');
  A.eq(v.all({ tag: 'input', type: 'checkbox' }).length, 0, 'sin interruptor de destino todavía');
  answer(gets(c.t)[0], payload()); await v.settle();
  A.eq(off(v, button(v, 'Preparar revisión')), false, 'abierto con estado none y cambios'); A.no(text(v), 'Devolución bloqueada'); A.has(text(v), 'Historial de operaciones'); A.eq(c.t.posts().length, 0);
}));
check('control positivo · estado sano: un clic en "Preparar revisión" envía exactamente un POST /v2/return/preview con el destino elegido', () => session(async c => {
  c.t.on(/\/v2\/return\/preview$/, () => ({ json: PLAN }), 'POST'); const v = await open(c, payload());
  A.no(text(v), 'PROPOSALS_PRESENT');
  v.click(button(v, 'Preparar revisión')); await v.settle(); const posts = c.t.where(/\/v2\/return\/preview$/, 'POST');
  A.eq(posts.length, 1); A.deep(posts[0].body, { simulation: true });
}));
check('servidor antiguo sin metadato: historial visible, devolución bloqueada con explicación y ningún POST', () => session(async c => {
  const { recoveryIntegrity: _omit, ...old } = payload(); const v = await open(c, old);
  A.has(text(v), 'Historial de operaciones'); A.has(text(v), 'no permite comprobar el estado del plan'); A.has(text(v), 'Devolución bloqueada');
  A.ok(off(v, button(v, 'Preparar revisión'))); v.click(button(v, 'Preparar revisión')); await v.settle(); A.eq(c.t.posts().length, 0);
}));
for (const [name, over] of [
  ['valid sin plan', { recoveryIntegrity: VALID, plan: null }], ['none con plan', { recoveryIntegrity: NONE, plan: PLAN }], ['invalid con plan', { recoveryIntegrity: INVALID, plan: PLAN }],
  ['metadatos con código desconocido', { recoveryIntegrity: { state: 'invalid', code: 'X', message: INVALID_RECOVERY_MESSAGE } }]
] as [string, any][]) {
  check('incoherencia plan/estado · ' + name + ' → historial conservado, plan NO mostrado, devolución bloqueada, ningún POST', () => session(async c => {
    const v = await open(c, payload(over));
    A.has(text(v), 'Historial de operaciones'); A.has(text(v), 'Devolución bloqueada'); A.no(text(v), 'Estudio Arce', 'un plan de una respuesta incoherente no se pinta'); A.no(text(v), 'Aprobar plan revisado');
    A.ok(off(v, button(v, 'Preparar revisión'))); v.click(button(v, 'Preparar revisión')); await v.settle(); A.eq(c.t.posts().length, 0);
  }));
}
check('estado inválido declarado por el servidor: mensaje fijo, historial legible y exportaciones siguen sin requerir integridad', () => session(async c => {
  const v = await open(c, payload({ recoveryIntegrity: INVALID, plan: null }));
  A.has(text(v), INVALID_RECOVERY_MESSAGE); A.has(text(v), 'Historial de operaciones'); A.has(text(v), '1–3 de 3 operaciones');
  const refresh = button(v, 'Actualizar estado guardado'); A.eq(refresh.props.style?.minHeight, 44, 'el botón de actualización declara 44 px');
  A.ok(button(v, 'CSV') && button(v, 'JSON'), 'CSV y JSON siguen presentes'); A.eq(v.disabled(button(v, 'CSV')), false); A.eq(v.disabled(button(v, 'JSON')), false);
}));
check('historial inválido: no se muestra un historial parcial, se explica y la devolución sigue bloqueada', () => session(async c => {
  const v = await open(c, payload({ changes: [{ ...CHANGES[0], operation: 'delete' }] }));
  A.has(text(v), 'No se pudo leer un historial de cambios válido'); A.has(text(v), 'Leyendo las operaciones guardadas'); A.eq(v.all({ tag: 'button', text: 'Preparar revisión' }).length, 0);
}));

// ---- carreras ------------------------------------------------------------------------------------------------------------------
check('carrera · respuesta SANA antigua llega después de una respuesta INVÁLIDA más nueva, con transporte que ignora la cancelación: sigue bloqueado', () => session(async c => {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false }); await v.settle();
  const first = gets(c.t)[0]; await c.tick(v); const second = gets(c.t)[1]; A.ok(second, 'el sondeo lanza una segunda lectura'); A.eq(first.signal?.aborted, true, 'la primera se canceló');
  answer(second, payload({ recoveryIntegrity: INVALID, plan: null })); await v.settle(); A.has(text(v), 'Devolución bloqueada');
  answer(first, payload({ recoveryIntegrity: VALID, plan: PLAN })); await v.settle();
  A.has(text(v), 'Devolución bloqueada'); A.no(text(v), 'Estudio Arce'); A.ok(off(v, button(v, 'Preparar revisión'))); A.eq(c.t.posts().length, 0);
}));
check('control de la carrera · gana la lectura MÁS NUEVA aunque llegue la antigua después (sana nueva + inválida antigua tardía → abierto)', () => session(async c => {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false }); await v.settle();
  const first = gets(c.t)[0]; await c.tick(v); const second = gets(c.t)[1];
  answer(second, payload()); await v.settle(); A.eq(off(v, button(v, 'Preparar revisión')), false);
  answer(first, payload({ recoveryIntegrity: INVALID, plan: null })); await v.settle();
  A.eq(off(v, button(v, 'Preparar revisión')), false, 'una observación antigua no revierte una más nueva'); A.no(text(v), 'Devolución bloqueada');
}));
check('carrera · si el navegador SÍ cancela la lectura vieja, la cancelación no se muestra como error ni cambia el estado', () => session(async c => {
  c.t.honorAbort = true; const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false }); await v.settle();
  await c.tick(v); const [first, second] = gets(c.t); A.eq(first.settled, true, 'la primera terminó por cancelación'); answer(second, payload()); await v.settle();
  A.no(text(v), 'Aborted'); A.no(text(v), 'No se pudo comprobar'); A.eq(off(v, button(v, 'Preparar revisión')), false);
}));
check('manejadores capturados antes del bloqueo no ejecutan nada después (vista previa, decisión, aprobación, autorización y token)', () => session(async c => {
  c.t.on(/\/v2\/return\//, () => ({ json: PLAN }), 'POST');
  const v = await open(c, payload({ recoveryIntegrity: VALID, plan: PLAN })); A.has(text(v), 'Estudio Arce');
  const box = v.all({ tag: 'input', type: 'checkbox' }).at(-1)!; v.check(box, true); await v.settle();
  const captured = {
    preview: button(v, 'Preparar revisión').props.onClick, approve: button(v, 'Aprobar plan revisado').props.onClick,
    decide: v.find({ tag: 'select', label: 'Decisión para Teléfono' }).props.onChange, review: box.props.onChange, simulation: v.all({ tag: 'input', type: 'checkbox' })[0].props.onChange
  };
  await c.tick(v); answer(gets(c.t).at(-1)!, payload({ recoveryIntegrity: INVALID, plan: null })); await v.settle();
  A.has(text(v), 'Devolución bloqueada'); A.eq(c.t.posts().length, 0, 'precondición: aún no hay POST');
  const fire = (fn: () => unknown) => { void Promise.resolve().then(fn).catch(() => undefined); }; // sin esperar: un manejador que SÍ actúa quedaría esperando una lectura posterior y colgaría el caso
  fire(captured.preview); fire(captured.approve); fire(() => captured.decide({ target: { value: 'remote' } })); fire(() => captured.review({ target: { checked: true } })); fire(() => captured.simulation({ target: { checked: false } }));
  await v.settle();
  A.eq(c.t.posts().length, 0, 'ningún POST tras el bloqueo con manejadores capturados'); A.has(text(v), 'Devolución bloqueada');
}));
check('doble acción sin render intermedio: dos invocaciones síncronas del mismo manejador producen un solo POST', () => session(async c => {
  c.t.on(/\/v2\/return\/preview$/, () => 'hold', 'POST'); const v = await open(c, payload());
  const handler = button(v, 'Preparar revisión').props.onClick; void handler(); void handler(); await v.settle();
  A.eq(c.t.where(/\/v2\/return\/preview$/, 'POST').length, 1, 'exactamente una petición');
}));
check('A→B→A · una autorización marcada ("he revisado") no sobrevive a un intervalo bloqueado ni se reactiva al volver a sano', () => session(async c => {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false }); await v.settle();
  answer(gets(c.t)[0], payload({ recoveryIntegrity: VALID, plan: PLAN })); await v.settle();
  const box = () => v.all({ tag: 'input', type: 'checkbox' }).at(-1)!; v.check(box(), true); await v.settle(); A.eq(box().props.checked, true, 'control: se puede marcar en estado sano');
  A.eq(off(v, button(v, 'Aprobar plan revisado')), false, 'control: la aprobación queda habilitada');
  await c.tick(v); answer(gets(c.t).at(-1)!, payload({ recoveryIntegrity: INVALID, plan: null })); await v.settle(); A.has(text(v), 'Devolución bloqueada');
  await c.tick(v); answer(gets(c.t).at(-1)!, payload({ recoveryIntegrity: VALID, plan: PLAN })); await v.settle();
  A.has(text(v), 'Estudio Arce'); A.eq(box().props.checked, false, 'la autorización previa no se reactiva'); A.ok(off(v, button(v, 'Aprobar plan revisado')), 'aprobar sigue cerrado hasta volver a autorizar');
}));
check('error de red en una lectura posterior cierra la devolución (no deja la última lectura sana abierta)', () => session(async c => {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: false }); await v.settle();
  answer(gets(c.t)[0], payload()); await v.settle(); A.eq(off(v, button(v, 'Preparar revisión')), false);
  await c.tick(v); gets(c.t).at(-1)!.reject(new Error('red caída')); await v.settle();
  A.ok(off(v, button(v, 'Preparar revisión')), 'cerrado si no se puede comprobar'); A.has(text(v), 'red caída'); A.eq(c.t.posts().length, 0);
}));

// ---- comprobación manual dentro de ChangesView (producción) ------------------------------------------------------------------------------
check('producción · con estado sano la comprobación manual está abierta (control del siguiente caso)', () => session(async c => {
  const v = await open(c, payload(), { production: true });
  const idInput = v.all({ tag: 'input' }).find(n => n.props.inputMode === 'numeric')!; A.ok(idInput, 'hay un campo de ID remoto para el alta'); A.eq(v.disabled(idInput), false, 'se puede escribir con estado sano');
  A.no(text(v), 'puedes reintentar solo la lectura local');
}));
check('producción · con estado inválido la comprobación manual está cerrada y explica que puede reintentarse solo la lectura', () => session(async c => {
  const { ChangesView } = c.rt.load('src/ChangesView.tsx'); const v = c.mount(ChangesView, { runtime: false, production: true }); await v.settle();
  answer(gets(c.t)[0], payload({ recoveryIntegrity: INVALID, plan: null })); await v.settle();
  const id = v.all({ tag: 'input' }).find(n => n.props.inputMode === 'numeric')!; A.ok(v.disabled(id), 'el ID remoto no se puede editar');
  A.has(text(v), 'puedes reintentar solo la lectura local'); const run = v.maybe({ tag: 'button', text: 'Comprobar resultado en HubSpot' });
  A.ok(!run || off(v, run), 'no hay comprobación disponible'); A.eq(c.t.posts().length, 0);
}));

// ---- ManualRecovery aislado ------------------------------------------------------------------------------------------------------------
const OK_RESULT = (revision: string) => ({ passed: true, checks: [{ entity: 'contacts', localId: 'local-qa091-1', passed: true, reason: 'Valores confirmados por lectura.' }, { entity: 'companies', localId: 'company-1', passed: true, reason: 'ok' }, { entity: 'contacts', localId: 'contact-1', passed: true, reason: 'ok' }],
  report: { id: 'rep-1', method: 'manual_verified', revision, sessionId: 's1', captureId: 'c1', watermark: 3, verifiedAt: '2026-10-31T11:00:00.000Z', records: 3 } });
async function manual(c: Ctx, refresh: () => Promise<void>, over: Record<string, any> = {}) {
  const { ManualRecovery } = c.rt.load('src/ManualRecovery.tsx'); const v = c.mount(ManualRecovery, { changes: CHANGES, revision: 'rev-m', pending: 3, refresh, ...over }); await v.settle();
  const idField = v.all({ tag: 'input' }).find(n => n.props.inputMode === 'numeric')!; v.type(idField, '5001'); await v.settle();
  const box = v.all({ tag: 'input', type: 'checkbox' })[0]; v.check(box, true); await v.settle(); return v;
}
const verifyBtn = (v: View) => v.find({ tag: 'button', text: 'Comprobar resultado en HubSpot' });
check('acuse manual confirmado + lectura local fallida: el acuse se conserva, se ofrece reintentar SOLO la lectura y jamás se repite el POST', () => session(async c => {
  let reads = 0, failing = true; const refresh = async () => { reads++; if (failing) throw new Error('GET local caído'); };
  c.t.on(/manual-recovery\/verify$/, () => ({ json: OK_RESULT('rev-m') }), 'POST'); const v = await manual(c, refresh);
  A.eq(off(v, verifyBtn(v)), false, 'control: la comprobación está habilitada antes de enviar'); v.click(verifyBtn(v)); await v.settle(); await v.settle();
  A.eq(c.t.where(/manual-recovery\/verify$/, 'POST').length, 1); A.has(text(v), 'El servidor confirmó la comprobación de esta revisión'); A.has(text(v), 'La comprobación se confirmó, pero no se pudo actualizar el estado local');
  A.eq(reads, 1); const retry = () => v.find({ tag: 'button', text: 'Reintentar actualización local' });
  v.click(retry()); await v.settle(); A.eq(reads, 2, 'el reintento solo vuelve a leer'); A.has(text(v), 'El servidor confirmó la comprobación de esta revisión', 'el acuse sigue visible tras otro fallo');
  failing = false; v.click(retry()); await v.settle(); A.eq(reads, 3); A.no(text(v), 'no se pudo actualizar el estado local'); A.has(text(v), 'El servidor confirmó la comprobación');
  A.eq(c.t.where(/manual-recovery\/verify$/, 'POST').length, 1, 'ni un solo POST más'); A.eq(v.maybe({ tag: 'button', text: 'Comprobar resultado en HubSpot' }), null, 'no se ofrece comprobar de nuevo lo ya confirmado');
}));
check('manual · con bloqueo de integridad no hay comprobación posible; el acuse previo no se borra por el bloqueo', () => session(async c => {
  let reads = 0; const refresh = async () => { reads++; };
  c.t.on(/manual-recovery\/verify$/, () => ({ json: OK_RESULT('rev-m') }), 'POST'); const v = await manual(c, refresh);
  v.click(verifyBtn(v)); await v.settle(); await v.settle(); A.has(text(v), 'El servidor confirmó la comprobación'); A.eq(c.t.posts().length, 1);
  v.update({ integrityBlocked: true }); await v.settle(); A.has(text(v), 'El servidor confirmó la comprobación', 'el acuse persiste durante el bloqueo'); A.has(text(v), 'puedes reintentar solo la lectura local');
  A.eq(c.t.posts().length, 1);
}));
check('manual · bloqueo ANTES de comprobar: ni el botón ni un manejador capturado envían nada', () => session(async c => {
  const v = await manual(c, async () => {}); const captured = verifyBtn(v).props.onClick; v.update({ integrityBlocked: true }); await v.settle();
  A.ok(off(v, verifyBtn(v)) || v.disabled(verifyBtn(v)), 'botón cerrado'); void Promise.resolve().then(captured).catch(() => undefined); await v.settle(); A.eq(c.t.posts().length, 0, 'un manejador capturado no puede enviar tras el bloqueo');
}));
check('manual · doble invocación síncrona del manejador de comprobar: un solo POST', () => session(async c => {
  c.t.on(/manual-recovery\/verify$/, () => 'hold', 'POST'); const v = await manual(c, async () => {}); const h = verifyBtn(v).props.onClick; void h(); void h(); await v.settle();
  A.eq(c.t.where(/manual-recovery\/verify$/, 'POST').length, 1);
}));
check('manual · respuesta 409 del servidor: se muestra el error y se actualiza el estado local (una lectura), sin repetir el POST', () => session(async c => {
  let reads = 0; c.t.on(/manual-recovery\/verify$/, () => ({ status: 409, json: { error: INVALID_RECOVERY_MESSAGE, details: { code: 'RECOVERY_PLAN_INVALID' } } }), 'POST');
  const v = await manual(c, async () => { reads++; }); v.click(verifyBtn(v)); await v.settle(); await v.settle();
  A.has(text(v), INVALID_RECOVERY_MESSAGE); A.eq(reads, 1); A.eq(c.t.where(/manual-recovery\/verify$/, 'POST').length, 1);
}));
