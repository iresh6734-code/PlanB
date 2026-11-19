import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkSummary, toWorkSource, type WorkSummary } from '../shared/work-summary.js';
import { buildPassport, passportToHtml, passportToJson, type PassportWorkSummary, type SourceInput } from '../shared/continuity-passport.js';
import { buildImpactMap, impactToHtml, impactToJson, type ContextualSource, type ImpactInputs } from '../shared/impact-map.js';

const AT = '2026-11-09T09:00:00.000Z', NOW = Date.parse(AT), CTX = 'capture:' + 'a'.repeat(64), OTHER = 'capture:' + 'b'.repeat(64);
const absent = { status: 'not-provided' as const, at: null, value: null }, absentContext = { ...absent, context: null };
function summary(over: Partial<WorkSummary> = {}): WorkSummary {
  const parsed = parseWorkSummary({ format: 'planb-work-summary-v1', status: 'read', scope: { kind: 'active-copy', context: CTX }, at: AT, origin: 'work-journal', provenance: 'durable', coverage: 'none', counts: null, quarantine: null, ...over });
  assert.ok(parsed); return parsed;
}
const passport = (work: SourceInput<PassportWorkSummary>) => buildPassport({ now: NOW, installId: null, copy: absent, hubspot: absent, relay: absent, work });
const map = (work: ContextualSource<PassportWorkSummary>) => buildImpactMap({ now: NOW, expectedContext: CTX, copy: absentContext, inventory: absentContext, queue: absentContext, comparison: absentContext, hubspot: absent, relay: absentContext, work } satisfies ImpactInputs);
const workText = (work: SourceInput<PassportWorkSummary>) => passport(work).sections.find(section => section.key === 'work')!.claims.map(claim => claim.text).join(' ');
const noCounts = (text: string) => { assert.doesNotMatch(text, /Ningún (guardado|borrador)|Sin trabajo local pendiente|\b0 (borradores|guardados)/); assert.match(text, /desconoce|desconocido/); };

test('una lectura correcta sin cobertura conserva pin, fecha y causa; pasaporte y mapa no la llaman fallo ni vacío', () => {
  const source = toWorkSource(summary());
  assert.deepEqual([source.status, source.context, source.at, source.value?.status, source.value?.coverage, source.value?.counts], ['read', CTX, AT, 'read', 'none', null]);
  const p = passport(source), claims = p.sections.find(section => section.key === 'work')!.claims;
  assert.match(claims[0]!.text, /no cubre esta copia/); assert.doesNotMatch(claims[0]!.text, /No se pudo leer/); noCounts(claims[0]!.text);
  assert.equal(claims[0]!.basis, 'unverified'); assert.equal(claims[0]!.currency, 'unknown'); assert.equal(claims[0]!.at, AT);
  assert.equal(p.provenance.find(row => row.source === 'work-journal')!.status, 'read');
  const m = map(source), row = m.rows.find(row => row.id === 'work')!;
  assert.match(row.detail, /no cubre esta copia/); assert.doesNotMatch(row.detail, /no se pudo leer/); noCounts(row.detail);
  assert.equal(row.status, 'unknown'); assert.equal(row.basis, 'unverified'); assert.equal(row.context, CTX);
  assert.equal(m.rows.some(row => /^work:/.test(row.id)), false);
});

test('un fallo real mantiene unavailable aunque coverage sea none; no adopta la explicación de falta de cobertura', () => {
  const source = toWorkSource(summary({ status: 'unavailable' }));
  assert.equal(source.status, 'unavailable'); assert.equal(source.value!.counts, null);
  assert.match(workText(source), /No se pudo leer/); assert.doesNotMatch(workText(source), /no cubre esta copia/);
  const row = map(source).rows.find(row => row.id === 'work')!; assert.match(row.detail, /no se pudo leer/i); noCounts(row.detail);
});

test('una fuente sin cobertura de otra copia no da causa ni recuentos a la copia activa', () => {
  const source = toWorkSource(summary({ scope: { kind: 'active-copy', context: OTHER } }));
  const m = map(source), work = m.rows.find(row => row.id === 'work')!;
  assert.ok(m.rows.find(row => row.id === 'other-context:work'));
  assert.doesNotMatch(work.detail, /no cubre esta copia/); noCounts(work.detail);
  assert.equal(m.provenance.find(row => row.source === 'work')!.usable, false);
});

test('productores anteriores sin coverage conservan sus estados; null no deduce ausencia de cobertura', () => {
  const legacy: ContextualSource<PassportWorkSummary> = { status: 'read', context: CTX, at: AT, value: { status: 'read', at: AT, counts: null } };
  assert.match(workText(legacy), /No se pudo leer/); assert.doesNotMatch(workText(legacy), /no cubre esta copia/);
  assert.match(map(legacy).rows.find(row => row.id === 'work')!.detail, /no se pudo leer/);
  const empty = { ...legacy, value: { ...legacy.value!, counts: { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0 } } };
  assert.match(workText(empty), /Ningún guardado por comprobar/);
  assert.equal(map(empty).rows.find(row => row.id === 'work:uncertain')!.status, 'ok');
});

test('cobertura completa y parcial conservan recuentos y cuarentena en el mismo contexto', () => {
  for (const coverage of ['complete', 'partial'] as const) {
    const source = toWorkSource(summary({ coverage, counts: { drafts: 2, unknownOutcome: 1, settled: 3, otherContext: 4 }, quarantine: { unreadable: coverage === 'partial' ? 1 : 0 } }));
    assert.equal(source.value!.coverage, coverage); assert.equal(source.value!.counts!.drafts, 2);
    assert.match(workText(source), /2 borradores recuperables sin enviar/);
    const m = map(source); assert.equal(m.rows.find(row => row.id === 'work:uncertain')!.status, 'attention');
    assert.equal(!!m.rows.find(row => row.id === 'work:unreadable'), coverage === 'partial');
  }
});

test('el estado externo de la fuente precede a metadatos antiguos; no proporcionado y fallo no adoptan una cobertura anterior', () => {
  const source = toWorkSource(summary());
  assert.doesNotMatch(workText({ ...source, status: 'not-provided' }), /no cubre esta copia/);
  assert.match(workText({ ...source, status: 'unavailable' }), /No se pudo leer/);
  assert.doesNotMatch(map({ ...source, status: 'unavailable' }).rows.find(row => row.id === 'work')!.detail, /no cubre esta copia/);
});

test('JSON y HTML del pasaporte y del mapa exportan la misma causa sin inventar un recuento', () => {
  const source = toWorkSource(summary()), p = passport(source), m = map(source);
  for (const text of [passportToJson(p), passportToHtml(p), impactToJson(m), impactToHtml(m)]) {
    assert.match(text, /no cubre esta copia/); assert.match(text, /no es cero/);
    assert.doesNotMatch(text, /Ningún (guardado|borrador)|Sin trabajo local pendiente/);
  }
});
