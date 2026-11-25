import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements } from '../server/verifica/engagements.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';
import type { LedgerEntry } from '../shared/verifica/expediente.js';
import { verifyPackage } from '../shared/verifica/paquete.js';
import type { EngagementWorkflow, ReviewCommand, ReviewFinding, ReviewView } from '../shared/verifica/revision.js';

process.env.NODE_ENV = 'test';
const files = exampleFiles(true);

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'planb-revision-'));
  const dbPath = join(root, 'data', 'planb.sqlite');
  async function open() {
    const { app, store } = await createBaseApp({ dbPath, root, staticDir: join(root, 'dist') });
    registerVerificaEngagements(app, store);
    return { app, store };
  }
  return { ...await open(), open };
}

type App = Awaited<ReturnType<typeof fixture>>['app'];
const prefix = '/api/verifica/engagements';
const create = async (app: App, name: string) => prefix + '/' + (await app.inject({ method: 'POST', url: prefix, payload: { name } })).json().engagement.id;
const status = async (app: App, base: string) => (await app.inject(base + '/expediente')).json().workflow as EngagementWorkflow;
const emit = (app: App, base: string) => app.inject({ method: 'POST', url: base + '/clean-room' });
function upload(app: App, base: string, role: string, file: string, text = files.get(file)) {
  return app.inject({ method: 'PUT', url: `${base}/sources/${role}`, payload: { fileName: file, text } });
}
async function prepare(app: App, base: string) {
  for (const [role, file] of [['previous', 'antes.json'], ['latest', 'ahora.json'], ['invoices', 'facturas.csv'], ['declarations', 'declaraciones.json']]) {
    const result = await upload(app, base, role!, file!);
    assert.equal(result.statusCode, 200, result.body);
  }
}
const decide = (app: App, base: string, finding: ReviewFinding, review: ReviewView, decision: ReviewCommand['decision']) =>
  app.inject({ method: 'PUT', url: `${base}/review/${finding.rule}`, payload: { report: review.report, evidence: finding.evidence,
    previousDecision: finding.previousDecision, statement: finding.statement, decision } satisfies ReviewCommand });

test('Verifica · prepara una entrega vinculada al informe, los hallazgos revisados y la declaración exacta', async () => {
  const { app, store } = await fixture();
  try {
    const base = await create(app, 'Operación ficticia');
    const other = await create(app, 'Operación independiente');
    assert.equal((await status(app, base)).next, 'complete-sources');
    await prepare(app, base);
    assert.equal((await status(app, base)).next, 'issue-report');
    assert.equal((await emit(app, base)).statusCode, 200);
    const initial = await status(app, base);
    assert.equal(initial.next, 'review-findings');
    const review = initial.review!;
    assert.ok(review.findings.length > 1);
    const finding = review.findings[0]!;
    const answer = (text: string) => app.inject({ method: 'PUT', url: `${base}/answers/${finding.rule}`, payload: { text } });
    const pack = (reviewFingerprint: string) => app.inject({ method: 'POST', url: base + '/package', payload: { reviewFingerprint, answers: true } });
    assert.equal((await decide(app, base, finding, review, 'reviewed-declaration')).statusCode, 409);
    assert.equal((await answer('Declaración ficticia del vendedor.')).statusCode, 200);
    assert.equal((await pack(review.fingerprint)).statusCode, 409);
    const id = base.split('/').at(-1)!;
    store.db.exec(`CREATE TEMP TRIGGER fail_review_index BEFORE INSERT ON meta WHEN NEW.key = 'verifica:review-index:${id}'
      BEGIN SELECT RAISE(ABORT, 'fallo de ensayo'); END;`);
    assert.equal((await decide(app, base, finding, review, 'request-information')).statusCode, 500);
    assert.equal(store.get(`verifica:review-entry:${id}:1`, null), null);
    store.db.exec('DROP TRIGGER fail_review_index');
    assert.equal((await decide(app, base, finding, review, 'request-information')).statusCode, 200);
    assert.equal((await decide(app, base, finding, review, 'request-information')).statusCode, 200, 'el reintento devuelve la decisión vigente');
    assert.equal((await status(app, base)).recentDecisions.length, 1);
    assert.equal((await decide(app, base, finding, review, 'reviewed')).statusCode, 409, 'una pantalla antigua no pisa la decisión actual');
    let current = (await status(app, base)).review!;
    for (const item of current.findings) {
      const marked = await decide(app, base, item, current, item.rule === finding.rule ? 'reviewed-declaration' : 'reviewed');
      assert.equal(marked.statusCode, 200, marked.body);
    }
    current = (await status(app, base)).review!;
    assert.equal((await status(app, base)).next, 'prepare-package');
    const delivered = await pack(current.fingerprint);
    assert.equal(delivered.statusCode, 200, delivered.body);
    const pkg = delivered.json();
    assert.equal(verifyPackage(pkg, pkg.fingerprint).reference, 'matched');
    assert.equal((await status(app, base)).reviewedPackage?.fingerprint, pkg.fingerprint);
    assert.equal((await status(app, base)).delivery?.state, 'current');
    assert.equal((await status(app, base)).next, 'reviewed-package-issued');
    assert.ok(!delivered.body.includes(current.fingerprint) && !delivered.body.includes('reviewed-declaration'));
    const ledger = (await app.inject(base + '/expediente')).json().entries;
    assert.ok(ledger.at(-1).refs.some((ref: { kind: string; fingerprint: string }) => ref.kind === 'review' && ref.fingerprint === current.fingerprint));

    const ledgerKey = `verifica:ledger:${id}`;
    const intact = store.get<LedgerEntry[]>(ledgerKey, []);
    const altered = structuredClone(intact);
    altered[0]!.refs[0]!.fingerprint = '2'.repeat(64);
    store.set(ledgerKey, altered);
    assert.equal((await status(app, base)).next, 'check-expediente');
    assert.equal((await pack(current.fingerprint)).statusCode, 409);
    store.set(ledgerKey, intact);

    assert.equal((await answer('Declaración ficticia revisada posteriormente.')).statusCode, 200);
    const changed = await status(app, base);
    assert.equal(changed.next, 'review-findings');
    assert.equal(changed.reviewedPackage, null);
    assert.equal(changed.delivery?.state, 'review-changed');
    assert.equal(changed.delivery?.fingerprint, pkg.fingerprint);
    assert.deepEqual(changed.review!.findings.filter(item => item.state === 'reopened').map(item => item.rule), [finding.rule]);
    const oldDeclaration = current.findings.find(item => item.rule === finding.rule)!;
    assert.equal((await decide(app, base, oldDeclaration, current, 'reviewed-declaration')).statusCode, 409);
    assert.equal((await pack(current.fingerprint)).statusCode, 409);
    assert.equal((await emit(app, base)).statusCode, 200);
    const reissued = await status(app, base);
    assert.equal(reissued.delivery?.state, 'report-changed');
    assert.deepEqual(reissued.delivery?.changedRules, [], 'la nueva emisión mantiene las cifras del informe entregado');
    assert.equal((await status(app, other)).next, 'complete-sources');
  } finally { await app.close(); }
});

test('Verifica · una reemisión conserva la revisión si la evidencia coincide y reabre al cambiar la fuente', async () => {
  const rig = await fixture();
  let base = '';
  try {
    base = await create(rig.app, 'Expediente con historial');
    await prepare(rig.app, base);
    assert.equal((await emit(rig.app, base)).statusCode, 200);
    const review = (await status(rig.app, base)).review!;
    const invoice = review.findings.find(item => item.rule === 'won-without-invoice')!;
    const other = review.findings.find(item => item.rule === 'bulk-deletion')!;
    assert.ok(invoice && other);
    for (const item of [invoice, other]) assert.equal((await decide(rig.app, base, item, review, 'reviewed')).statusCode, 200);
    assert.equal((await emit(rig.app, base)).statusCode, 200);
    const reissued = (await status(rig.app, base)).review!;
    assert.notEqual(reissued.report, review.report, 'cambian los seudónimos de la emisión');
    assert.equal(reissued.findings.find(item => item.rule === invoice.rule)?.state, 'reviewed');

    const csv = files.get('facturas.csv')!;
    const rows = csv.trimEnd().split(/\r?\n/);
    assert.equal((await upload(rig.app, base, 'invoices', 'actualizadas.csv', rows.slice(0, -1).join('\r\n') + '\r\n')).statusCode, 200);
    assert.equal((await status(rig.app, base)).next, 'refresh-report');
    assert.equal((await decide(rig.app, base, invoice, review, 'reviewed')).statusCode, 409);
    assert.equal((await emit(rig.app, base)).statusCode, 200);
  } finally { await rig.app.close(); }

  const second = await rig.open();
  try {
    const reopened = await status(second.app, base);
    assert.equal(reopened.review?.findings.find(item => item.rule === 'won-without-invoice')?.state, 'reopened');
    assert.equal(reopened.review?.findings.find(item => item.rule === 'bulk-deletion')?.state, 'reviewed');
    assert.equal(reopened.recentDecisions.length, 2);
    assert.equal(reopened.recentDecisions[0]?.previous, reopened.recentDecisions[1]?.fingerprint);
    const scope = (await second.app.inject(base + '/expediente')).json().closureScope;
    const closed = await second.app.inject({ method: 'POST', url: base + '/close', payload: { confirmName: 'Expediente con historial', scopeFingerprint: scope.fingerprint } });
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal(closed.json().closure.deleted.byKind['review-entry'], 2);
    assert.equal(closed.json().closure.deleted.byKind['review-index'], 1);
  } finally { await second.app.close(); }
});

test('Verifica · una limitación de cobertura entra en la revisión aunque no sea una alarma', async () => {
  const { app } = await fixture();
  try {
    const base = await create(app, 'Encargo sin facturas');
    await prepare(app, base);
    assert.equal((await app.inject({ method: 'DELETE', url: base + '/sources/invoices' })).statusCode, 200);
    assert.equal((await emit(app, base)).statusCode, 200);
    const review = (await status(app, base)).review!;
    const limitations = review.findings.find(item => item.rule === 'won-without-invoice');
    assert.equal(limitations?.alarm, false);
    assert.equal(limitations?.basis, 'unverified');
    assert.equal(limitations?.state, 'pending');
  } finally { await app.close(); }
});
