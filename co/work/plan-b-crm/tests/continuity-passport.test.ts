import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBaseApp } from '../server/app.js';
import { registerContinuityEvidenceApi } from '../server/continuity-evidence-api.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { ContinuityEvidenceApiResponse } from '../shared/continuity-evidence-api.js';
import { recordFromRehearsal, toPassportRecord } from '../shared/relay-rehearsal.js';
import type { ReadCheckApiState } from '../shared/hubspot-read-check-api.js';
import { buildPassport, passportExport, passportToHtml, passportToJson, safeText, shortId, when, type PassportInputs, type PassportWorkSummary, type RelayRehearsalRecord, type SourceInput } from '../shared/continuity-passport.js';

// Unidad 214. Modelo y presentación del pasaporte con ENTRADAS EXPLÍCITAS. La evidencia de copia viene del servicio REAL de continuidad (createBaseApp + registerContinuityEvidenceApi);
// las demás entradas son contratos construidos a mano (lectura de HubSpot de 212, resumen de trabajo, ensayo de relevo). Nada de esto llama a un proveedor.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { ContinuityPassport } = await import('../src/ContinuityPassport.js');
const NOW = Date.parse('2026-11-05T12:00:00.000Z'), T = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

async function realEvidence(): Promise<ContinuityEvidenceApiResponse> {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    const snapshot = makeFixture('agency'); snapshot.capturedAt = T(45);
    store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: T(44), prompt: '', approved: false }); store.activate();
    registerContinuityEvidenceApi(app, store, () => NOW); await app.ready();
    const response = await app.inject({ url: '/api/v7/continuity/evidence', headers: { host: '127.0.0.1:4513', origin: 'http://127.0.0.1:4513' } });
    assert.equal(response.statusCode, 200); return response.json() as ContinuityEvidenceApiResponse;
  } finally { await app.close(); }
}
const read = <V,>(value: V, at: string | null = T(1)): SourceInput<V> => ({ status: 'read', at, value });
const none = <V,>(): SourceInput<V> => ({ status: 'not-provided', at: null, value: null });
const evidenceOf = (state: ReadCheckApiState['evidence'] extends infer E ? NonNullable<E> : never) => state;
const hubspot = (over: Partial<ReadCheckApiState> = {}, evidence: ReturnType<typeof evidenceOf> | null = null): ReadCheckApiState => ({
  format: 'planb-hubspot-read-check-api-v1', configured: true, portal: { id: '12345', mode: 'rehearsal' }, consent: { reads: 5, writes: 0, freshnessMinutes: 15, allowed: true, reason: null }, running: null,
  view: { state: evidence ? evidence.state : 'saved_unchecked', fresh: !!evidence, label: 'x', detail: 'y', environment: evidence?.environment ?? 'unknown', checkedAt: evidence?.checkedAt ?? null },
  evidence, invalidated: null, issue: null, message: null, ...over,
});
const verified = (minutesAgo: number, over: Partial<NonNullable<ReadCheckApiState['evidence']>> = {}): NonNullable<ReadCheckApiState['evidence']> => ({
  checkedAt: T(minutesAgo), freshUntil: new Date(NOW - minutesAgo * 60_000 + 15 * 60_000).toISOString(), state: 'read_verified', environment: 'rehearsal', accountType: 'SANDBOX', portalId: '12345',
  objects: ['contacts', 'companies', 'deals', 'tasks'].map(entity => ({ entity: entity as 'contacts', outcome: 'readable' as const, httpStatus: 200 })), retryAfterSeconds: null, requests: 5, truncated: 0, blocked: 0, durationMs: 800, message: 'ok', ...over,
});
const work = (counts: PassportWorkSummary['counts']): PassportWorkSummary => ({ status: counts ? 'read' : 'unavailable', at: T(2), counts });
const relay = (over: Partial<RelayRehearsalRecord> = {}): RelayRehearsalRecord => ({ rehearsedAt: T(30), captureId: null, outcome: 'completed', destinationOpened: true, wrongIdRejected: true, reconciledOnce: true, included: ['tareas locales', 'historial'], notInherited: ['aprobaciones ejecutables'], ...over });
async function inputs(over: Partial<PassportInputs> = {}): Promise<PassportInputs> { return { now: NOW, installId: 'a1b2c3d4-0000-4000-8000-000000000001', copy: read(await realEvidence()), hubspot: none(), work: none(), relay: none(), ...over }; }
const all = (p: ReturnType<typeof buildPassport>) => p.sections.flatMap(s => s.claims);
const section = (p: ReturnType<typeof buildPassport>, key: string) => p.sections.find(s => s.key === key)!;

test('con la evidencia REAL del servicio de continuidad: la copia se acredita como observada con su fecha, sin cifras inventadas ni estado del CRM', async () => {
  const p = buildPassport(await inputs()), copy = section(p, 'copy').claims;
  assert.equal(copy[0]!.basis, 'observed'); assert.match(copy[0]!.text, /Copia local capturada el/); assert.equal(copy[0]!.at, T(45)); assert.match(copy[0]!.scope, /copia activa/);
  assert.ok(copy.some(c => /Estructura, conciliación e historial comprobados en este equipo/.test(c.text) && /No consulta el estado actual del CRM/.test(c.text)));
  assert.ok(copy.some(c => /tareas? en la copia/.test(c.text) && c.basis === 'observed'));
  assert.equal(p.identity.installId, 'a1b2c3d4'); assert.ok(p.identity.copy.captureId); assert.equal(p.identity.copy.capturedAt, T(45)); assert.equal(p.mixedContexts, false);
  assert.deepEqual(p.sections.map(s => s.key), ['copy', 'read', 'work', 'rehearsal', 'unproven']);
});

test('DATOS AUSENTES: sin ninguna fuente todo es «sin comprobar» (desconocido ≠ cero), el próximo paso es preparar la copia y lo no demostrado sigue ahí', () => {
  const p = buildPassport({ now: NOW, installId: null, copy: none(), hubspot: none(), work: none(), relay: none() });
  for (const key of ['copy', 'read', 'work']) assert.ok(section(p, key).claims.every(c => c.basis === 'unverified' && c.currency === 'unknown'), key);
  assert.ok(!all(p).some(c => /\b0\b/.test(c.text) && c.source === 'work-journal'), 'ningún cero inventado');
  assert.equal(p.nextStep!.action, 'open-preparation'); assert.ok(section(p, 'unproven').claims.length >= 3);
  assert.deepEqual(p.provenance.map(r => r.status), ['not-provided', 'not-provided', 'not-provided', 'not-provided']); assert.equal(p.identity.copy.captureId, null);
});

test('TRABAJO LOCAL: «no se pudo leer» es desconocido (no cero); con lectura, los ceros son «ninguno en el momento de la lectura» y un guardado por comprobar manda al próximo paso y a lo no demostrado', async () => {
  const unreadable = buildPassport(await inputs({ work: { status: 'unavailable', at: T(2), value: null } }));
  assert.ok(section(unreadable, 'work').claims.every(c => c.basis === 'unverified' && /se desconoce|no está disponible/.test(c.text)));
  const nullCounts = buildPassport(await inputs({ work: read(work(null)) })); assert.ok(section(nullCounts, 'work').claims.every(c => c.basis === 'unverified'));
  const zeros = buildPassport(await inputs({ work: read(work({ drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0 })) }));
  assert.ok(section(zeros, 'work').claims.every(c => c.basis === 'observed' && /Ningún|Ningún/.test(c.text)));
  const risk = buildPassport(await inputs({ work: read(work({ drafts: 2, unknownOutcome: 3, settled: 5, otherContext: 1, unreadable: 1 })) }));
  const texts = section(risk, 'work').claims.map(c => c.text).join(' | '); assert.match(texts, /3 guardados por comprobar/); assert.match(texts, /2 borradores recuperables/); assert.match(texts, /1 intento de otra copia/); assert.match(texts, /1 entrada ilegible/);
  assert.equal(risk.nextStep!.action, 'open-today'); assert.ok(section(risk, 'unproven').claims.some(c => /no se incluye en ella/.test(c.text)), 'el seguimiento en memoria no viaja en una cápsula');
  assert.ok(!/task-|Llamar a|completed/.test(JSON.stringify(passportExport(risk))), 'sin IDs de tarea ni valores');
});

test('LECTURA DE HUBSPOT: guardada ≠ comprobada; fresca = observada y vigente por objeto; parcial dice qué no se leyó; caducada conserva fecha y alcance; otra configuración = historia', async () => {
  const saved = buildPassport(await inputs({ hubspot: read(hubspot()) })), r1 = section(saved, 'read').claims;
  assert.equal(r1[0]!.basis, 'unverified', 'primero lo que se comprobó (nada)'); assert.equal(r1[1]!.basis, 'declared'); assert.match(r1[1]!.text, /no prueba que dé acceso hoy/); assert.equal(saved.nextStep!.action, 'open-integrations');
  const fresh = buildPassport(await inputs({ hubspot: read(hubspot({}, verified(3))) })), f = section(fresh, 'read').claims.find(c => /Lectura comprobada/.test(c.text))!;
  assert.equal(f.basis, 'observed'); assert.equal(f.currency, 'current'); assert.match(f.text, /clientes, empresas, oportunidades, tareas/); assert.match(f.text, /cuenta de ensayo/); assert.match(f.scope, /solo lectura · 5 peticiones/); assert.equal(f.at, T(3));
  assert.ok(section(fresh, 'read').claims.some(c => /no significa que la copia esté al día/.test(c.text)));
  const partial = verified(3, { state: 'partial', objects: verified(3).objects.map(o => o.entity === 'deals' ? { ...o, outcome: 'forbidden' as const, httpStatus: 403 } : o) });
  const pt = section(buildPassport(await inputs({ hubspot: read(hubspot({}, partial)) })), 'read').claims.find(c => /Lectura parcial/.test(c.text))!; assert.match(pt.text, /se pudo leer clientes, empresas, tareas/); assert.match(pt.text, /no se pudo leer oportunidades/);
  const stale = hubspot({}, verified(40)); stale.view = { ...stale.view, fresh: false, state: 'saved_unchecked', detail: 'caducó' };
  const ex = buildPassport(await inputs({ hubspot: read(stale) })), e = section(ex, 'read').claims.find(c => /Lectura comprobada/.test(c.text))!;
  assert.equal(e.currency, 'expired'); assert.match(e.text, /caducó: ya no acredita el acceso actual/); assert.equal(e.at, T(40), 'conserva su fecha'); assert.equal(ex.nextStep!.action, 'open-integrations'); assert.match(ex.nextStep!.reason, /caducó/);
  const other = hubspot({ invalidated: { checkedAt: T(10), portalId: '99999', state: 'read_verified' } }); other.evidence = null;
  const inv = section(buildPassport(await inputs({ hubspot: read(other) })), 'read').claims.find(c => /otra/.test(c.text))!; assert.equal(inv.basis, 'unverified'); assert.match(inv.text, /era de otra y no la acredita/);
  const nocfg = buildPassport(await inputs({ hubspot: read(hubspot({ configured: false, portal: null, evidence: null })) })); assert.equal(section(nocfg, 'read').claims[0]!.basis, 'not-applicable');
  const prod = buildPassport(await inputs({ hubspot: read(hubspot({ portal: { id: '12345', mode: 'production' }, consent: { reads: 5, writes: 0, freshnessMinutes: 15, allowed: false, reason: 'solo ensayo' } })) }));
  assert.notEqual(prod.nextStep?.action, 'open-integrations', 'si la comprobación no está autorizada no se ofrece como acción');
  assert.ok(section(fresh, 'unproven').claims.some(c => /cuenta REAL/.test(c.text)), 'lo comprobado fue una cuenta de ensayo');
});

test('EXPORTAR Y RECUPERAR: el registro de exportación y los informes técnicos son DECLARADOS (no verificados); un ensayo de relevo es observado con su alcance; otra captura no acredita la copia actual y se separa', async () => {
  const base = await inputs(), p = buildPassport({ ...base, relay: read(relay({ captureId: 'capture:' + 'f'.repeat(64) })) }), r = section(p, 'rehearsal').claims;
  assert.ok(r.some(c => /exportación/.test(c.text)), 'hay una afirmación sobre la exportación (presente o ausente)');
  assert.ok(r.filter(c => c.source === 'continuity-evidence').every(c => c.basis !== 'observed'), 'registros de exportación e informes: nunca «observado»');
  const rehearsal = r.find(c => /Ensayo de relevo/.test(c.text))!; assert.equal(rehearsal.basis, 'observed'); assert.match(rehearsal.scope, /mismo equipo · datos ficticios · destino nuevo/); assert.equal(rehearsal.currency, 'expired'); assert.match(rehearsal.text, /OTRA captura/);
  assert.equal(p.mixedContexts, true); assert.equal(p.nextStep!.action === 'start-rehearsal' || p.nextStep!.action === 'open-export', true);
  const ok = buildPassport({ ...base, relay: read(relay({ captureId: (base.copy.value as Extract<ContinuityEvidenceApiResponse, { available: true }>).context.captureId })) }); assert.equal(ok.mixedContexts, false);
  assert.equal(section(ok, 'rehearsal').claims.find(c => /Ensayo de relevo/.test(c.text))!.currency, 'current');
  assert.ok(section(ok, 'rehearsal').claims.some(c => /Viajó en la cápsula: tareas locales; historial/.test(c.text))); assert.ok(section(ok, 'rehearsal').claims.some(c => /No se hereda: aprobaciones ejecutables/.test(c.text)));
  const failed = section(buildPassport({ ...base, relay: read(relay({ outcome: 'failed', destinationOpened: false, wrongIdRejected: false, reconciledOnce: false })) }), 'rehearsal').claims.find(c => /Ensayo de relevo/.test(c.text))!; assert.match(failed.text, /falló/); assert.match(failed.text, /no llegó a abrirse/);
  assert.ok(section(p, 'unproven').claims.some(c => /OTRO ordenador/.test(c.text)) && section(p, 'unproven').claims.some(c => /tiempo de recuperación/.test(c.text)) && section(p, 'unproven').claims.some(c => /autoría/.test(c.text)));
});

test('REGISTRO DE EXPORTACIÓN presente: es DECLARADO (nunca observado), dice si coincide con la revisión activa, que la custodia es declarada y que no se examinaron los bytes', async () => {
  const base = await inputs(), value = structuredClone(base.copy.value) as Extract<ContinuityEvidenceApiResponse, { available: true }>;
  value.facts.export = { present: true, matchesActiveRevision: true, custodyDeclared: true, artifactBytes: 'not-examined', otherDevice: 'not-demonstrated' };
  value.facts.technicalReports = { ...value.facts.technicalReports, stored: 3, declaredPassed: 2, invalid: 1, latestCompletedAt: T(20) };
  const claims = section(buildPassport({ ...base, copy: read(value) }), 'rehearsal').claims, exp = claims.find(c => /registro de exportación/.test(c.text))!, tech = claims.find(c => /informes? técnicos?/.test(c.text))!;
  assert.equal(exp.basis, 'declared'); assert.match(exp.text, /coincide con la revisión activa/); assert.match(exp.text, /custodia consta como declarada/); assert.match(exp.text, /No se han examinado los bytes/); assert.match(exp.scope, /no el fichero/);
  assert.equal(tech.basis, 'declared'); assert.match(tech.text, /2 informes técnicos declaran éxito de 3 guardados \(1 no válidos\)/); assert.match(tech.text, /no mide el tiempo de recuperación/);
  value.facts.export.matchesActiveRevision = false; assert.match(section(buildPassport({ ...base, copy: read(value) }), 'rehearsal').claims.find(c => /registro de exportación/.test(c.text))!.text, /NO coincide con la revisión activa/);
  assert.equal(buildPassport({ ...base, copy: read(value) }).nextStep?.action === 'open-export', false, 'con registro de exportación ya no se pide exportar');
});

test('PRÓXIMO PASO = la primera carencia con acción disponible, en un orden estable', async () => {
  const base = await inputs(), ctx = (base.copy.value as Extract<ContinuityEvidenceApiResponse, { available: true }>).context.captureId;
  assert.equal(buildPassport({ ...base, hubspot: read(hubspot()), work: read(work({ drafts: 0, unknownOutcome: 1, settled: 0, otherContext: 0, unreadable: 0 })) }).nextStep!.action, 'open-integrations');
  assert.equal(buildPassport({ ...base, hubspot: read(hubspot({}, verified(2))), work: read(work({ drafts: 0, unknownOutcome: 1, settled: 0, otherContext: 0, unreadable: 0 })) }).nextStep!.action, 'open-today');
  assert.equal(buildPassport({ ...base, hubspot: read(hubspot({}, verified(2))), work: read(work({ drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0 })), relay: read(relay({ captureId: ctx })) }).nextStep?.action, 'open-export', 'con lectura vigente, sin trabajo pendiente y un ensayo de ESTA captura, la carencia que queda es la exportación (la copia real no trae registro de exportación)');
  const finished = buildPassport({ ...base, hubspot: read(hubspot({}, verified(2))), work: read(work({ drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0 })), relay: read(relay({ captureId: ctx })) });
  assert.ok(['open-export', null].includes(finished.nextStep ? finished.nextStep.action : null), 'sin más carencias de ensayo/lectura/trabajo: solo puede quedar la exportación');
  const unavailable = buildPassport({ ...base, copy: { status: 'unavailable', at: T(1), value: null } }); assert.equal(unavailable.nextStep!.action, 'open-preparation');
});

test('EXPORTACIÓN JSON por lista blanca: claves exactas, versión, procedencia; sin fichas, credenciales ni rutas aunque la entrada traiga texto hostil; determinista', async () => {
  const evil = ['C:\\Users\\iresh\\AppData\\secreto\\clave.txt', '/Users/iresh/.planb-key', 'pat-' + 'A'.repeat(60), '<script>alert(1)</script>', 'x'.repeat(5000)];
  const p = buildPassport({ ...(await inputs({ hubspot: read(hubspot({}, verified(3))), work: read(work({ drafts: 1, unknownOutcome: 1, settled: 0, otherContext: 0, unreadable: 0 })) })), relay: read(relay({ included: evil, notInherited: evil })) });
  const json = passportToJson(p), parsed = JSON.parse(json);
  assert.equal(parsed.format, 'planb-continuity-passport-v1'); assert.deepEqual(Object.keys(parsed).sort(), ['format', 'generatedAt', 'identity', 'mixedContexts', 'nextStep', 'notice', 'provenance', 'sections']);
  for (const s of parsed.sections) for (const c of s.claims) assert.deepEqual(Object.keys(c).sort(), ['at', 'basis', 'context', 'currency', 'id', 'scope', 'source', 'text']);
  for (const secret of ['iresh', 'AppData', 'planb-key', 'pat-AAAA', 'secreto', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']) assert.ok(!json.includes(secret), 'no sale «' + secret + '»');
  assert.ok(parsed.sections.flatMap((s: { claims: { text: string }[] }) => s.claims).every((c: { text: string }) => c.text.length < 2500), 'textos largos acotados');
  assert.equal(passportToJson(p), json, 'determinista'); assert.deepEqual(parsed.sections.map((s: { key: string }) => s.key), ['copy', 'read', 'work', 'rehearsal', 'unproven']);
  assert.equal(safeText('  a \n\n b  '), 'a b'); assert.ok(safeText('x'.repeat(500)).length <= 160);
});

test('EXPORTACIÓN HTML: autocontenida, escapa contenido externo, sin scripts ni recursos externos, con CSP restrictiva y separando observado / declarado / sin comprobar', async () => {
  const p = buildPassport({ ...(await inputs({ hubspot: read(hubspot({}, verified(3))) })), relay: read(relay({ included: ['<img src=x onerror=alert(1)>', '"><script>1</script>'] })) });
  const html = passportToHtml(p);
  assert.ok(html.startsWith('<!doctype html>')); assert.doesNotMatch(html, /<script|<img|<link|<iframe|<object|<embed|<form|https?:\/\//i, 'ningún elemento activo ni recurso externo: el texto hostil solo aparece escapado'); assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.match(html, /Observado/); assert.match(html, /Declarado/); assert.match(html, /Sin comprobar/); assert.match(html, /Procedencia/); assert.match(html, /<html lang="es">/);
  assert.ok(!/iresh|AppData|\.planb-key/.test(html));
});

test('FECHAS y ENTRADAS RARAS: instantes no válidos no rompen ni se inventan; un reloj no finito no produce fecha; el orden de evidencia y los IDs de afirmación son estables', async () => {
  assert.equal(when(null), 'sin fecha'); assert.equal(when('no es fecha'), 'fecha no válida'); assert.match(when('2026-11-05T12:00:00.000Z'), /\(Madrid\)/); assert.equal(shortId('capture:abcdef0123456789'), 'abcdef01'); assert.equal(shortId(null), null);
  const p = buildPassport({ now: Number.NaN, installId: null, copy: none(), hubspot: read(hubspot({}, verified(3, { checkedAt: 'basura' }))), work: none(), relay: read(relay({ rehearsedAt: 'otra basura' })) });
  assert.equal(p.generatedAt, ''); assert.equal(when(section(p, 'read').claims[0]!.at), 'sin fecha');
  const ids = all(buildPassport(await inputs())).map(c => c.id); assert.equal(new Set(ids).size, ids.length); assert.deepEqual(ids, all(buildPassport(await inputs())).map(c => c.id));
});

test('PRESENTACIÓN (render de servidor): preguntas, primer dato visible y resto plegado, próximo paso con botón solo si hay acción, chip «caducado» y exportación manual', async () => {
  const stale = hubspot({}, verified(40)); stale.view = { ...stale.view, fresh: false, state: 'saved_unchecked' };
  const p = buildPassport(await inputs({ hubspot: read(stale), work: read(work({ drafts: 1, unknownOutcome: 2, settled: 0, otherContext: 0, unreadable: 0 })) }));
  const withAction = renderToStaticMarkup(createElement(ContinuityPassport, { passport: p, onAction: () => undefined })), without = renderToStaticMarkup(createElement(ContinuityPassport, { passport: p }));
  for (const q of ['¿De qué copia dispongo?', '¿Qué lectura del CRM se comprobó y cuándo?', '¿Qué trabajo local queda pendiente?', '¿Qué se ensayó al exportar y recuperar?', '¿Qué no se ha demostrado?']) assert.ok(withAction.includes(q), q);
  assert.match(withAction, /Próximo paso:/); assert.match(withAction, /<button[^>]*>Abrir Integraciones<\/button>/); assert.doesNotMatch(without, /<button[^>]*>Abrir Integraciones/); assert.match(without, /Desde el menú: abrir integraciones/);
  assert.match(withAction, /cpp-chip-expired[^>]*>caducado/); assert.match(withAction, /<details class="cpp-more">/); assert.match(withAction, /Descargar HTML/); assert.match(withAction, /Descargar JSON/); assert.match(withAction, /no es una copia ni prueba que puedas recuperarte/);
  assert.doesNotMatch(withAction, /<script|dangerouslySetInnerHTML/); assert.ok(!/aria-hidden="true"[^>]*>\s*<\/button>/.test(withAction));
});

// ── R2 · dictamen independiente de 214 ───────────────────────────────────────────────────────────────────────────────────────────────
const MIN = 60_000;
const readClaim = (p: ReturnType<typeof buildPassport>) => section(p, 'read').claims.find(c => c.source === 'hubspot-read-check' && c.basis === 'observed' && /Lectura|Comprobado/.test(c.text))!;
const withExport = (copy: ContinuityEvidenceApiResponse): ContinuityEvidenceApiResponse => { const value = structuredClone(copy) as Extract<ContinuityEvidenceApiResponse, { available: true }>; value.facts.export = { present: true, matchesActiveRevision: true, custodyDeclared: true, artifactBytes: 'not-examined', otherDevice: 'not-demonstrated' }; return value; };

test('R2·F1 VIGENCIA EFECTIVA: se deriva de las fechas y del reloj al generar, no del booleano recibido; justo antes, en el límite y después de freshUntil; fecha, alcance y exportaciones coherentes', async () => {
  const hs = hubspot({}, verified(3)), until = Date.parse(hs.evidence!.freshUntil), base = await inputs({ hubspot: read(hs) });
  const at = (now: number) => buildPassport({ ...base, now });
  const before = at(until - 1), edge = at(until), after = at(until + 1), late = at(NOW + 16 * MIN);
  assert.equal(readClaim(before).currency, 'current'); assert.equal(readClaim(edge).currency, 'current', 'en el límite exacto sigue vigente (misma regla que 212: now <= freshUntil)');
  for (const p of [after, late]) {
    const c = readClaim(p);
    assert.equal(c.currency, 'expired'); assert.match(c.text, /caducó: ya no acredita el acceso actual/); assert.equal(c.at, hs.evidence!.checkedAt, 'conserva la fecha'); assert.match(c.scope, /portal 12345 · solo lectura · 5 peticiones/, 'conserva el alcance'); assert.equal(c.basis, 'observed');
    assert.equal(p.nextStep!.action, 'open-integrations'); assert.match(p.nextStep!.reason, /caducó/);
    assert.ok(section(p, 'unproven').claims.some(x => /no hay una comprobación vigente/.test(x.text)), 'lo no demostrado recoge la caducidad');
    assert.match(passportToJson(p), /"currency": "expired"/); assert.match(passportToHtml(p), /caducado/); assert.match(passportToHtml(p), /caducó: ya no acredita/);
  }
  assert.notEqual(before.nextStep?.action, 'open-integrations', 'vigente: no se ofrece comprobar de nuevo');
  assert.ok(!section(before, 'unproven').claims.some(x => /no hay una comprobación vigente/.test(x.text)));
  // reloj o ventana inválidos: nunca «vigente»
  for (const [name, input] of [['reloj NaN', { ...base, now: Number.NaN }], ['reloj infinito', { ...base, now: Number.POSITIVE_INFINITY }],
    ['freshUntil inválido', { ...base, hubspot: read({ ...hs, evidence: { ...hs.evidence!, freshUntil: 'mañana' } }) }], ['ventana invertida', { ...base, hubspot: read({ ...hs, evidence: { ...hs.evidence!, freshUntil: new Date(Date.parse(hs.evidence!.checkedAt) - MIN).toISOString() } }) }]] as const) {
    const p = buildPassport(input), c = readClaim(p); assert.equal(c.currency, 'unknown', name); assert.match(c.text, /No se puede determinar si sigue vigente/, name); assert.equal(p.nextStep?.action, 'open-integrations', name); assert.match(p.nextStep!.reason, /No se puede determinar/, name);
  }
  // una caducidad ya observada no se revierte con un reloj retrasado
  const expiredAtReceipt = hubspot({}, verified(3)); expiredAtReceipt.view = { ...expiredAtReceipt.view, fresh: false, state: 'saved_unchecked' };
  assert.equal(readClaim(buildPassport({ ...base, hubspot: read(expiredAtReceipt), now: NOW - 60 * MIN })).currency, 'expired');
});

test('R2·F1 «checking» es otro estado: no se describe como caducidad, no oculta la fecha previa y el próximo paso es ver la comprobación en curso, no iniciar otra', async () => {
  const running = hubspot({ running: { since: T(0.5) } }, verified(3)); running.view = { ...running.view, state: 'checking', fresh: false };
  const base = await inputs({ hubspot: read(running) });
  const p = buildPassport(base), prior = readClaim(p), live = section(p, 'read').claims.find(c => /comprobación en curso/.test(c.text))!;
  assert.equal(prior.currency, 'current', 'la observación anterior sigue vigente por sus fechas mientras se comprueba'); assert.doesNotMatch(prior.text, /caducó/);
  assert.equal(live.currency, 'unknown'); assert.doesNotMatch(live.text, /caducó/); assert.match(live.text, /No es una caducidad/); assert.equal(live.at, T(0.5));
  assert.equal(p.nextStep!.action, 'open-integrations'); assert.equal(p.nextStep!.label, 'Ver la comprobación en curso');
  // en curso con la observación ya caducada por el reloj: ambos hechos conviven, sin mezclarlos
  const later = buildPassport({ ...base, now: NOW + 20 * MIN }); assert.equal(readClaim(later).currency, 'expired'); assert.ok(section(later, 'read').claims.some(c => /comprobación en curso/.test(c.text))); assert.equal(later.nextStep!.label, 'Ver la comprobación en curso');
  // en curso sin observación previa
  const first = hubspot({ running: { since: T(0.5) } }); first.view = { ...first.view, state: 'checking' }; const fp = buildPassport(await inputs({ hubspot: read(first) }));
  assert.ok(section(fp, 'read').claims.some(c => /no se ha comprobado/.test(c.text)) && section(fp, 'read').claims.some(c => /comprobación en curso/.test(c.text))); assert.equal(fp.nextStep!.label, 'Ver la comprobación en curso');
});

test('R2·F2 ENSAYO SIN CAPTURA IDENTIFICADA: contexto desconocido ≠ mismo contexto ≠ otro contexto; no cierra la carencia de la copia actual; afirmaciones, próximo paso y exportaciones coherentes', async () => {
  const real = await realEvidence(); assert.ok(real.available); const copy = withExport(real), ctx = (copy as Extract<ContinuityEvidenceApiResponse, { available: true }>).context.captureId;
  const closed = { ...(await inputs({ copy: read(copy), hubspot: read(hubspot({}, verified(2))), work: read(work({ drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0 })) })) };
  const same = buildPassport({ ...closed, relay: read(relay({ captureId: ctx })) });
  assert.equal(same.nextStep, null, 'control positivo: ensayo completado con la captura exacta y las demás carencias cubiertas'); assert.equal(section(same, 'rehearsal').claims.find(c => /Ensayo de relevo/.test(c.text))!.currency, 'current');
  const unknown = buildPassport({ ...closed, relay: read(relay({ captureId: null })) });
  assert.equal(unknown.nextStep?.action, 'start-rehearsal'); assert.match(unknown.nextStep!.reason, /no está ligado a esta copia/);
  const u = section(unknown, 'rehearsal').claims.filter(c => c.source === 'relay-rehearsal'); assert.ok(u.length >= 2);
  assert.ok(u.every(c => c.currency === 'unknown' && c.context === null), 'todas sus afirmaciones quedan con vigencia y contexto desconocidos'); assert.match(u[0]!.text, /No identifica con qué copia se ensayó: no acredita la copia actual/);
  assert.match(u[0]!.text, /completado/, 'conserva lo que sí se sabe del ensayo'); assert.match(u[0]!.scope, /mismo equipo · datos ficticios · destino nuevo/);
  const json = passportToJson(unknown), html = passportToHtml(unknown); assert.match(json, /"currency": "unknown"/); assert.match(json, /No identifica con qué copia se ensayó/); assert.match(html, /No identifica con qué copia se ensayó/); assert.match(html, /Ensayar un relevo con datos ficticios/);
  const other = buildPassport({ ...closed, relay: read(relay({ captureId: 'capture:otra-copia-distinta' })) });
  assert.equal(other.nextStep?.action, 'start-rehearsal'); assert.equal(section(other, 'rehearsal').claims.find(c => /Ensayo de relevo/.test(c.text))!.currency, 'expired'); assert.match(section(other, 'rehearsal').claims.find(c => /Ensayo de relevo/.test(c.text))!.text, /OTRA captura/);
  assert.equal(other.mixedContexts, true); assert.equal(unknown.mixedContexts, false, 'un contexto desconocido no inventa una segunda copia');
  const failed = buildPassport({ ...closed, relay: read(relay({ captureId: ctx, outcome: 'failed', destinationOpened: false })) }); assert.equal(failed.nextStep?.action, 'start-rehearsal'); assert.match(failed.nextStep!.reason, /no se completó/);
});

test('R3 PROCEDENCIA DEL ENSAYO: completar el ensayo FICTICIO cierra «Ensayar un relevo» y deja explícito que la copia activa no está acreditada; sin resultado, fallido, alcance desconocido y otra captura siguen pidiéndolo; la misma captura sí acredita', async () => {
  const real = await realEvidence(); assert.ok(real.available); const copy = withExport(real), ctx = (copy as Extract<ContinuityEvidenceApiResponse, { available: true }>).context.captureId;
  const closed = await inputs({ copy: read(copy), hubspot: read(hubspot({}, verified(2))), work: read(work({ drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0 })) });
  const ok = { ok: true, wrongIdRejected: true, createCalls: 1, duplicates: 0, records: 63, finalStage: 'return-verified', capsule: { bytes: 100063, sha256: 'a'.repeat(64) }, ms: { export: 1, import: 2 } };
  const adapter = (over: Partial<typeof ok> | null, interrupted = false) => toPassportRecord(recordFromRehearsal({ now: NOW - 5 * MIN, result: over === null ? null : { ...ok, ...over }, interrupted }));
  // sin resultado
  const none = buildPassport(closed); assert.equal(none.nextStep?.action, 'start-rehearsal'); assert.match(none.nextStep!.reason, /No hay un ensayo completado/);
  // ficción completada con el adaptador REAL de 216: cierra el paso y conserva la falta de prueba sobre la copia activa
  const record = adapter({}); assert.equal(record.scope, 'fiction'); assert.equal(record.captureId, null, 'la ficción no se asigna a la captura activa');
  const fiction = buildPassport({ ...closed, relay: read(record) });
  assert.equal(fiction.nextStep, null, 'el ensayo ficticio completado satisface la acción ficticia');
  const claims = section(fiction, 'rehearsal').claims.filter(c => c.source === 'relay-rehearsal'); assert.ok(claims.length >= 1 && claims.every(c => c.context === null && c.currency === 'current' && c.basis === 'observed'), 'observado, con su alcance propio y sin contexto de captura');
  assert.match(claims[0]!.text, /Se practicó con datos ficticios: demuestra que el recorrido funciona, pero no acredita la copia actual ni que tu copia activa se recupere/); assert.doesNotMatch(claims[0]!.text, /OTRA captura|No identifica/);
  assert.ok(section(fiction, 'unproven').claims.some(c => /ESTA copia activa se recupere completa en un destino nuevo/.test(c.text)), 'la carencia sobre la copia activa sigue visible');
  assert.equal(fiction.mixedContexts, false);
  const json = passportToJson(fiction), html = passportToHtml(fiction); for (const text of [json, html]) assert.match(text, /no acredita la copia actual ni que tu copia activa se recupere/); assert.match(json, /ESTA copia activa se recupere/); assert.match(html, /ESTA copia activa se recupere/);
  // fallido e interrumpido: siguen pidiéndolo, con su propia razón
  for (const [name, failed] of [['fallido', adapter({ ok: false })], ['interrumpido', adapter(null, true)], ['sin resultado del Kit', adapter(null)]] as const) {
    const p = buildPassport({ ...closed, relay: read(failed) }); assert.equal(p.nextStep?.action, 'start-rehearsal', name); assert.match(p.nextStep!.reason, /no se completó/, name);
  }
  // alcance desconocido (sin procedencia) y sin captura: no cierra
  const unknown = buildPassport({ ...closed, relay: read({ ...record, scope: undefined }) }); assert.equal(unknown.nextStep?.action, 'start-rehearsal'); assert.match(unknown.nextStep!.reason, /no está ligado a esta copia/);
  assert.ok(section(unknown, 'rehearsal').claims.some(c => /No identifica con qué copia se ensayó/.test(c.text)));
  // la procedencia no se deduce de un texto: included que diga «ficticios» sin scope no cierra
  assert.equal(buildPassport({ ...closed, relay: read({ ...record, scope: undefined, included: ['datos ficticios'] }) }).nextStep?.action, 'start-rehearsal');
  // misma captura (registro importado con procedencia de captura): acredita; otra captura: no
  assert.equal(buildPassport({ ...closed, relay: read({ ...record, scope: undefined, captureId: ctx }) }).nextStep, null);
  const other = buildPassport({ ...closed, relay: read({ ...record, scope: undefined, captureId: 'capture:otra-distinta' }) }); assert.equal(other.nextStep?.action, 'start-rehearsal'); assert.equal(other.mixedContexts, true);
  // un ensayo ficticio no oculta carencias anteriores: sin exportación el paso sigue siendo exportar
  assert.equal(buildPassport({ ...closed, copy: read(real), relay: read(record) }).nextStep?.action, 'open-export');
});
