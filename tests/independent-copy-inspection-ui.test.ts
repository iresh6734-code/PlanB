// QA081 · independent audit of src/CopyInspection.tsx lifecycle and guards, inside a HOOK SIMULATOR (see harness header).
// This is NOT ReactDOM: it proves state-machine ordering with explicitly gated promises; layout, focus and real events
// are proven (or not) only by tests/e2e/independent-copy-inspection.spec.ts.
// Responses fed to the view are REAL server answers (produced by the in-memory app) and are then tampered on purpose,
// so the schema alone accepts them. PLANB_QA081_UI_SRC points the same assertions at a mutated copy of the component.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {
  ApiError, MAX_COPY_REVIEW_BYTES, UI_HARNESS_KIND, Transport, drain, evidence, exportPlain, getContext, gatedFile, install, mount, plainFile, review, sha256, waitFor,
  type Install, type Mounted,
} from './helpers/independent-copy-inspection-harness.js';

const unhandled: unknown[] = [];
process.on('unhandledRejection', e => { unhandled.push(e); });
const uniq = () => randomUUID().slice(0, 8);
const RESULT = 'Resultado de esta revisión', GREEN = /Integridad del archivo: válida|Coincide con la referencia/;
const SUBMIT = 'Revisar archivo sin restaurar';

/** A real answer pair for these bytes against the server's current state. */
async function exchange(i: Install, bytes: Buffer, password?: string) {
  const ctx = await getContext(i), a = await review(i, bytes, {password, revision: ctx.revision});
  return {ctx: ctx as any, answer: a.json as any, status: a.status};
}
async function panel(key = 'A', transport = new Transport()) { const m = mount({exportName: 'CopyInspectionPanel', props: {contextKey: key}, transport}); return m; }
async function ready(m: Mounted, ctx: unknown, call = 0) { m.transport.gets()[call].resolve(structuredClone(ctx)); await drain(); m.render(); }
async function submitAndWait(m: Mounted, posts: number) { m.submit(); await waitFor(() => m.transport.posts().length === posts, 'POST #' + posts); }
const resultShown = (m: Mounted) => m.text().includes(RESULT);

test('U0 the harness declares what it is', () => {
  assert.match(UI_HARNESS_KIND, /NOT ReactDOM/);
  const src = fs.readFileSync('src/CopyInspection.tsx', 'utf8');
  assert.ok(!/setInterval|setTimeout|requestAnimationFrame/.test(src), 'the component schedules no timers, so it cannot poll by itself');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.storage/.test(src), 'file and password are never persisted by the component');
  evidence('ui.jsonl', {case: 'U0', harness: UI_HARNESS_KIND});
});

test('U1 choosing a file while the initial GET is held keeps that read; the review then goes out once with the exact bytes', async () => {
  const i = await install();
  try {
    const bytes = await exportPlain(i), {ctx, answer} = await exchange(i, bytes), m = await panel();
    assert.equal(m.transport.gets().length, 1);
    m.choose(plainFile(bytes)); m.type('Contraseña', 'password-' + uniq());
    assert.equal(m.button(SUBMIT).props.disabled, true, 'no reference yet → no submit');
    assert.equal(m.transport.gets().length, 1, 'selecting did not restart the read');
    await ready(m, ctx);
    assert.ok(!m.button(SUBMIT).props.disabled, 'the held reference arrived and enables the submit');
    const pass = 'pw-' + uniq(); m.type('Contraseña', pass);
    await submitAndWait(m, 1);
    const post = m.transport.posts()[0];
    assert.deepEqual(Object.keys(post.body).sort(), ['encoded', 'password', 'referenceRevision']);
    assert.equal(Buffer.from(post.body.encoded, 'base64').compare(bytes), 0, 'bytes sent are the file bytes');
    assert.equal(post.body.referenceRevision, ctx.revision); assert.equal(post.body.password, pass);
    post.resolve(structuredClone(answer)); await drain(); m.render();
    assert.ok(resultShown(m)); assert.ok(m.text().includes(sha256(bytes)), 'digest displayed equals node:crypto digest of the file');
    assert.equal(m.field('Contraseña').props.value, '', 'password is dropped after the accepted answer');
    assert.equal(unhandled.length, 0);
  } finally { await i.close(); }
});

test('U2 selecting B while the read of A is held: A never POSTs and its late success or failure never reaches the screen', async () => {
  for (const fail of [false, true]) {
    const i = await install();
    try {
      const a = await exportPlain(i), b = Buffer.from(JSON.stringify({...JSON.parse(a.toString('utf8')), exportedAt: '2030-01-01T00:00:00.000Z'}));
      const ex = await exchange(i, b), m = await panel(); await ready(m, ex.ctx);
      const held = gatedFile(a, 'a.json'); m.choose(held.file); m.submit(); await waitFor(() => held.reads() === 1, 'A read started');
      m.render(); assert.equal(m.text().includes('Leyendo archivo'), true);
      m.choose(plainFile(b, 'b.json'));
      const mark = m.mark();
      if (fail) held.fail(new Error('A-READ-ERROR-' + uniq())); else held.release();
      await drain();
      assert.equal(m.transport.posts().length, 0, 'the old read must not emit a POST'); assert.equal(m.writesSince(mark), 0, 'and must not write any state');
      m.render(); assert.ok(!/A-READ-ERROR/.test(m.text()));
      await submitAndWait(m, 1);
      assert.equal(Buffer.from(m.transport.posts()[0].body.encoded, 'base64').compare(b), 0, 'only B was sent');
      m.transport.posts()[0].resolve(structuredClone(ex.answer)); await drain(); m.render();
      assert.ok(resultShown(m)); assert.ok(m.text().includes(sha256(b)) && !m.text().includes(sha256(a)));
    } finally { await i.close(); }
  }
});

test('U3 a valid inspection of A held in a transport that ignores abort cannot write after selection change, close or unmount', async () => {
  const i = await install();
  try {
    const a = await exportPlain(i), b = Buffer.from('not json ' + uniq()), exA = await exchange(i, a), exB = await exchange(i, b);
    // (a) selection change
    {
      const m = await panel(); m.transport.ignoreAbort = true; await ready(m, exA.ctx);
      m.choose(plainFile(a)); const pass = 'secret-' + uniq(); m.type('Contraseña', pass); await submitAndWait(m, 1);
      const old = m.transport.posts()[0]; m.choose(plainFile(b, 'b.json'));
      assert.equal(old.signal!.aborted, true, 'selection change aborts the request'); assert.equal(m.field('Contraseña').props.value, '', 'old password dropped');
      const mark = m.mark(); old.resolve(structuredClone(exA.answer)); await drain();
      assert.equal(m.writesSince(mark), 0, 'late valid answer wrote no state'); m.render(); assert.ok(!resultShown(m)); assert.ok(!m.text().includes(sha256(a)));
      await submitAndWait(m, 2); m.transport.posts()[1].resolve(structuredClone(exB.answer)); await drain(); m.render();
      assert.ok(m.text().includes(sha256(b))); assert.ok(!m.text().includes(sha256(a)));
    }
    // (b) close the disclosure; (c) unmount — through the real outer component
    for (const how of ['close', 'unmount'] as const) {
      const m = mount({exportName: 'CopyInspection', props: {contextKey: 'A'}}); assert.equal(m.transport.calls.length, 0, 'closed by default: no request');
      m.toggleDetails(true); await ready(m, exA.ctx); m.choose(plainFile(a)); m.type('Contraseña', 'pw-' + uniq()); await submitAndWait(m, 1);
      const old = m.transport.posts()[0];
      if (how === 'close') m.toggleDetails(false); else m.unmount();
      assert.equal(old.signal!.aborted, true, how + ' aborts');
      const mark = m.mark(); old.resolve(structuredClone(exA.answer)); await drain();
      assert.equal(m.writesSince(mark), 0, how + ': no write after leaving'); assert.equal(m.writes.filter(w => w.afterUnmount).length, 0);
      if (how === 'close') { m.toggleDetails(true); assert.equal(m.transport.gets().length, 2, 'reopen reads the reference again, explicitly'); assert.equal(m.field('Contraseña').props.value, ''); assert.ok(!resultShown(m)); assert.equal(m.button(SUBMIT).props.disabled, true, 'no file survives reopening'); }
    }
    // late FAILURE after unmount
    {
      const m = mount({exportName: 'CopyInspectionPanel', props: {contextKey: 'A'}}); await ready(m, exA.ctx); m.choose(plainFile(a)); await submitAndWait(m, 1);
      const mark = m.mark(); m.unmount(); m.transport.posts()[0].reject(new ApiError(500, 'LATE-ERROR-' + uniq())); await drain();
      assert.equal(m.writesSince(mark), 0);
    }
    assert.equal(unhandled.length, 0);
  } finally { await i.close(); }
});

test('U4 context A→B→A with reads pending: textual equality of the key never revives an old operation or an old reference', async () => {
  const i = await install();
  try {
    const bytes = await exportPlain(i), ex1 = await exchange(i, bytes);
    const m = await panel('A'); const g1 = m.transport.gets()[0];
    m.setProps({contextKey: 'B'}); const g2 = m.transport.gets()[1]; m.setProps({contextKey: 'A'}); const g3 = m.transport.gets()[2];
    assert.equal(m.transport.gets().length, 3); assert.equal(g1.signal!.aborted && g2.signal!.aborted, true);
    // A stale reference (older revision) arrives late from the first A; the current A has not answered yet
    const stale = {...structuredClone(ex1.ctx), revision: 'c'.repeat(64), changes: 99, records: 777};
    const mark = m.mark(); g1.resolve(stale); g2.resolve(structuredClone(ex1.ctx)); await drain(); m.render();
    assert.equal(m.writesSince(mark), 0, 'stale reads wrote nothing'); assert.ok(!m.text().includes('777'));
    m.choose(plainFile(bytes)); assert.equal(m.button(SUBMIT).props.disabled, true, 'still waiting for the current read');
    g3.resolve(structuredClone(ex1.ctx)); await drain(); m.render();
    assert.ok(!m.button(SUBMIT).props.disabled); await submitAndWait(m, 1);
    assert.equal(m.transport.posts()[0].body.referenceRevision, ex1.ctx.revision, 'the live reference is the one sent');
    // an operation (file read) started in A, then A→B→A, resolves late
    const m2 = await panel('A'); await ready(m2, ex1.ctx); const held = gatedFile(bytes); m2.choose(held.file); m2.submit(); await waitFor(() => held.reads() === 1, 'read');
    m2.setProps({contextKey: 'B'}); m2.setProps({contextKey: 'A'}); const mark2 = m2.mark(); held.release(); await drain();
    assert.equal(m2.transport.posts().length, 0, 'old operation did not revive'); assert.equal(m2.writesSince(mark2), 0);
  } finally { await i.close(); }
});

test('U5 a real 409: password dropped, context re-read once, no automatic POST; a failing re-read blocks submit until recovered', async () => {
  const i = await install();
  try {
    const bytes = await exportPlain(i), first = await exchange(i, bytes);
    const m = await panel(); await ready(m, first.ctx); m.choose(plainFile(bytes)); m.type('Contraseña', 'pw-' + uniq());
    i.store.saveRecord('contacts', {phone: 'e5-' + uniq()}, 'contact-1');                     // real change between GET and POST
    const real = await review(i, bytes, {revision: first.ctx.revision}); assert.equal(real.status, 409);
    await submitAndWait(m, 1);
    m.transport.posts()[0].reject(new ApiError(409, real.json.error)); await waitFor(() => m.transport.gets().length === 2, 'automatic context re-read'); await drain(); m.render();
    assert.equal(m.field('Contraseña').props.value, ''); assert.ok(!resultShown(m)); assert.ok(m.text().includes('La referencia local cambió'));
    assert.equal(m.transport.posts().length, 1, 'no automatic retry'); assert.equal(m.button(SUBMIT).props.disabled, true, 'blocked while the new reference is pending');
    // the re-read itself fails
    m.transport.gets()[1].reject(new ApiError(500, 'RELOAD-FAILED')); await drain(); m.render();
    assert.ok(m.text().includes('RELOAD-FAILED') && m.text().includes('La referencia local cambió')); assert.equal(m.button(SUBMIT).props.disabled, true, 'no reference → no submit');
    await drain(); assert.equal(m.transport.posts().length, 1);
    // recovery is explicit
    m.click('Actualizar referencia local'); const fresh = await getContext(i); m.transport.gets()[2].resolve(structuredClone(fresh)); await drain(); m.render();
    assert.ok(!m.button(SUBMIT).props.disabled); await submitAndWait(m, 2);
    assert.equal(m.transport.posts()[1].body.referenceRevision, fresh.revision, 'new explicit attempt uses the new revision');
    // a second real 409 whose re-read SUCCEEDS: still no automatic POST, password still empty, explicit retry available
    i.store.saveRecord('contacts', {phone: 'e5b-' + uniq()}, 'contact-1');
    const real2 = await review(i, bytes, {revision: fresh.revision}); assert.equal(real2.status, 409);
    m.transport.posts()[1].reject(new ApiError(409, real2.json.error)); await waitFor(() => m.transport.gets().length === 4, 'second re-read');
    m.transport.gets()[3].resolve(structuredClone(await getContext(i))); await drain(); m.render();
    assert.equal(m.transport.posts().length, 2, 'a successful re-read must not trigger a POST by itself'); assert.ok(!m.button(SUBMIT).props.disabled); assert.equal(m.field('Contraseña').props.value, '');
    assert.equal(unhandled.length, 0, 'every rejection was handled');
  } finally { await i.close(); }
});

test('U6 two submits before the next render send one read and one POST; discarding permits a new explicit attempt and rejects the old answer', async () => {
  const i = await install();
  try {
    const bytes = await exportPlain(i), ex = await exchange(i, bytes), m = await panel(); await ready(m, ex.ctx);
    const held = gatedFile(bytes); m.choose(held.file); m.submit(); m.submit();
    await waitFor(() => held.reads() >= 1, 'read'); await drain(); assert.equal(held.reads(), 1, 'one file read for two submits');
    held.release(); await waitFor(() => m.transport.posts().length === 1, 'POST'); m.submit(); await drain(); assert.equal(m.transport.posts().length, 1, 'one POST for repeated submits');
    m.render(); m.click('Descartar comprobación'); assert.equal(m.transport.posts()[0].signal!.aborted, true);
    assert.ok(!m.button(SUBMIT).props.disabled, 'cancel returns to an actionable state');
    await submitAndWait(m, 2);
    const mark = m.mark(); m.transport.posts()[0].resolve(structuredClone(ex.answer)); await drain();
    assert.equal(m.writesSince(mark), 0, 'identical valid answer to the cancelled attempt is still ignored'); m.render(); assert.ok(!resultShown(m));
    m.transport.posts()[1].resolve(structuredClone(ex.answer)); await drain(); m.render(); assert.ok(resultShown(m));
  } finally { await i.close(); }
});

const tamper: [string, (r: any) => void][] = [
  ['hash and its duplicate (schema-consistent)', r => { r.artifact.sha256 = 'b'.repeat(64); r.inspection.artifactHash = 'b'.repeat(64); }],
  ['byte length', r => { r.artifact.bytes += 1; }],
  ['reference revision and coverage reference (schema-consistent)', r => { r.reference.revision = 'd'.repeat(64); r.coverage.referenceRevision = 'd'.repeat(64); }],
  ['reference identity and summary identity (schema-consistent)', r => { r.reference.accountId = 'other-portal'; r.inspection.summary.accountId = 'other-portal'; }],
  ['reference counts and matching summary counts (schema-consistent)', r => { r.reference.records += 1; r.reference.changes += 1; r.inspection.summary.activeRecords += 1; r.inspection.summary.counts.contacts += 1; r.inspection.summary.changeLogEntries += 1; }],
  ['pending count of the reference', r => { r.reference.pendingChanges = 5; }],
];
test('U7 tampered or foreign answers never display as a result, even when the schema accepts them', async () => {
  const i = await install();
  try {
    const bytes = await exportPlain(i), ex = await exchange(i, bytes);
    const run = async (answer: any) => { const m = await panel(); await ready(m, ex.ctx); m.choose(plainFile(bytes)); await submitAndWait(m, 1); m.transport.posts()[0].resolve(answer); await drain(); m.render(); return m; };
    const control = await run(structuredClone(ex.answer)); assert.ok(resultShown(control), 'positive control: the untouched answer is shown');
    for (const [name, mutate] of tamper) {
      const answer = structuredClone(ex.answer); mutate(answer);
      const m = await run(answer);
      assert.ok(!resultShown(m), name + ' was displayed'); assert.ok(!GREEN.test(m.text()), name); assert.ok(m.text().includes('No se mostrará como válido'), name);
      evidence('ui.jsonl', {case: 'U7', tamper: name, rejected: true});
    }
    // a genuine, self-consistent answer that belongs to ANOTHER reference state, for the same file bytes
    const before = ex.ctx; i.store.saveRecord('contacts', {phone: 'u7-' + uniq()}, 'contact-1');
    const other = await exchange(i, bytes); assert.notEqual(other.ctx.revision, before.revision);
    assert.equal(other.answer.artifact.sha256, sha256(bytes), 'foreign answer even carries the right file hash');
    const m = await run(structuredClone(other.answer)); assert.ok(!resultShown(m), 'answer for another reference displayed'); assert.ok(m.text().includes('No se mostrará como válido'));
  } finally { await i.close(); }
});

test('U8 wrong password, 401/404/409/422/500, malformed report, network and read errors never leave or inherit a green result', async () => {
  const i = await install();
  try {
    const bytes = await exportPlain(i), ex = await exchange(i, bytes);
    const fails: [string, (c: any) => void][] = [
      ['401', c => c.reject(new ApiError(401, 'Desbloquea tu copia local para continuar.'))], ['404', c => c.reject(new ApiError(404, 'x'))], ['422', c => c.reject(new ApiError(422, 'Revisa los datos enviados.'))],
      ['500', c => c.reject(new ApiError(500, 'No se pudo completar la operación.'))], ['network', c => c.reject(new TypeError('Failed to fetch'))],
      ['empty object', c => c.resolve({})], ['null', c => c.resolve(null)], ['string', c => c.resolve('ok')],
      ['report without coverage verdict', c => { const r = structuredClone(ex.answer); delete r.coverage; c.resolve(r); }],
      ['status valid but summary null', c => { const r = structuredClone(ex.answer); r.inspection.summary = null; c.resolve(r); }],
    ];
    for (const [name, act] of fails) {
      const m = await panel(); await ready(m, ex.ctx); m.choose(plainFile(bytes)); await submitAndWait(m, 1);
      m.transport.posts()[0].resolve(structuredClone(ex.answer)); await drain(); m.render(); assert.ok(resultShown(m), 'first attempt succeeded');   // inherited-green setup
      m.submit(); await waitFor(() => m.transport.posts().length === 2, 'second'); m.render(); assert.ok(!resultShown(m), 'previous result cleared as soon as a new attempt starts');
      act(m.transport.posts()[1]); await drain(); m.render();
      assert.ok(!resultShown(m), name + ': result displayed'); assert.ok(!GREEN.test(m.text()), name + ': green text'); assert.ok(m.text().length > 0 && m.all(n => n.props.role === 'alert').length === 1, name + ': an alert explains the failure');
      assert.ok(!m.button(SUBMIT).props.disabled, name + ': explicit retry stays available');
    }
    // read error of the file itself
    const m = await panel(); await ready(m, ex.ctx); const held = gatedFile(bytes); m.choose(held.file); m.submit(); await waitFor(() => held.reads() === 1, 'read'); held.fail(new Error('DISK-READ-FAILED')); await drain(); m.render();
    assert.ok(m.text().includes('DISK-READ-FAILED') && !resultShown(m) && m.transport.posts().length === 0);
    // wrong password from the REAL server: honest invalid report, no coverage line
    const enc = Buffer.from(JSON.stringify({format: 'planb-encrypted-v2', kdf: 'scrypt', salt: Buffer.alloc(16, 1).toString('base64'), data: 'enc1:' + Buffer.alloc(40, 2).toString('base64')}));
    const bad = await exchange(i, enc, 'definitely-wrong-' + uniq()); assert.equal(bad.status, 200);
    const m2 = await panel(); await ready(m2, bad.ctx); m2.choose(plainFile(enc)); await submitAndWait(m2, 1); m2.transport.posts()[0].resolve(structuredClone(bad.answer)); await drain(); m2.render();
    assert.ok(m2.text().includes('no supera la comprobación de integridad')); assert.ok(!m2.text().includes('Coincide con la referencia')); assert.ok(m2.text().includes('No hay un dictamen de cobertura'));
    assert.equal(unhandled.length, 0);
  } finally { await i.close(); }
});

test('U9 files above 32 MiB are refused before reading; closed block makes no request and reading is lazy', async () => {
  const m = mount({exportName: 'CopyInspection', props: {contextKey: 'A'}});
  await drain(); assert.equal(m.transport.calls.length, 0, 'folded: no GET, no POST, no polling'); assert.equal(m.instances(), 1, 'only the outer shell exists');
  m.toggleDetails(true); assert.equal(m.transport.gets().length, 1); await drain(); assert.equal(m.transport.calls.length, 1, 'open: exactly one read, nothing else');
  const i = await install();
  try {
    await ready(m, await getContext(i)); let reads = 0;
    m.choose({name: 'big.json', size: MAX_COPY_REVIEW_BYTES + 1, arrayBuffer: async () => { reads++; return new ArrayBuffer(0); }} as unknown as File);
    m.render(); m.submit(); await drain(); assert.equal(reads, 0); assert.equal(m.transport.posts().length, 0); assert.ok(m.text().includes('supera el límite'));
    assert.equal(m.button(SUBMIT).props.disabled, true);
  } finally { await i.close(); }
});
