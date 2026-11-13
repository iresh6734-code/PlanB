import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { canAccept, canRetry, canVerify, describeOperation, OutcomeRefreshError, type CompactTaskSaveReceipt } from '../shared/task-save-outcome.js';
import { createTaskSaveOutcomes, type ControllerOptions, type SubmitInput } from '../src/task-save-outcome.js';

const snapshot = makeFixture('agency');
const baseline = snapshot.records.find(record => record.entity === 'tasks' && record.id === 'task-2')!;
const entity = makeDemoSpec(snapshot).entities.find(candidate => candidate.id === 'tasks')!;
const input: SubmitInput = {
  taskId: baseline.id,
  taskLabel: 'Instalación ficticia',
  baseline,
  entity,
  patch: { notes: 'Cambio ficticio confirmado' },
  revision: 'a'.repeat(64),
  context: {
    instanceId: 'compact-receipt-test', snapshotId: 'fictitious-323', snapshotName: 'Copia ficticia',
    capturedAt: '2026-11-10T11:00:00.000Z', captureStartedAt: null, accountId: null, generatedAt: null,
    isTestData: true, ready: true, runtime: false,
  },
};
const receipt = (extra: Partial<CompactTaskSaveReceipt> = {}): CompactTaskSaveReceipt => ({
  source: 'server-ack',
  acknowledgement: { changed: true, resultingRevision: 'b'.repeat(64) },
  replayed: false,
  writeResultOmitted: 'response-too-large',
  ...extra,
});

function rig(result: CompactTaskSaveReceipt, onConfirmed?: ControllerOptions['onConfirmed']) {
  let sends = 0;
  let verifies = 0;
  const controller = createTaskSaveOutcomes({
    onConfirmed,
    strategy: {
      async save(_request, hooks) {
        hooks.onDispatch();
        sends++;
        return { kind: 'compact-ack', receipt: result };
      },
      async verify() {
        verifies++;
        return { kind: 'unknown' };
      },
    },
  });
  const submission = controller.submit(input);
  assert.equal(submission.kind, 'started');
  return { controller, submission, sends: () => sends, verifies: () => verifies };
}

test('323 · un acuse sin registro confirma el mismo intento y no habilita comprobar ni reenviar', async () => {
  const ack = receipt();
  const { controller, submission, sends, verifies } = rig(ack);
  const operation = await submission.done;
  assert.equal(operation.attemptId, submission.attemptId);
  assert.equal(operation.status, 'confirmed');
  assert.deepEqual(operation.compactReceipt, ack);
  assert.equal(operation.record, null);
  assert.equal(operation.revised, null, 'el token del acuse no es una revisión leída de la ficha');
  assert.equal(operation.evidence, null);
  assert.equal(canVerify(operation), false);
  assert.equal(canRetry(operation), false);
  assert.equal(canAccept(operation), false);
  await controller.verify(operation.attemptId);
  assert.equal(controller.retry(operation.attemptId).kind, 'refused');
  assert.equal(controller.accept(operation.attemptId), false);
  assert.equal(sends(), 1);
  assert.equal(verifies(), 0);
  assert.match(describeOperation(operation).title, /Guardado confirmado/);
  assert.match(describeOperation(operation).lines.join(' '), /leer su registro actual/);
});

test('323 · la recarga puede fallar y volver a leer sin perder el acuse ni enviar de nuevo', async () => {
  const ack = receipt();
  let reads = 0;
  const { controller, submission, sends } = rig(ack, async (record, operation) => {
    assert.equal(record, null);
    assert.deepEqual(operation.compactReceipt, ack);
    if (++reads === 1) throw new OutcomeRefreshError('list');
  });
  const { attemptId } = await submission.done;
  await controller.whenIdle();
  const failed = controller.get(attemptId)!;
  assert.equal(failed.status, 'confirmed');
  assert.equal(failed.queue.status, 'failed');
  assert.equal(failed.queue.cause, 'list');
  assert.deepEqual(failed.compactReceipt, ack);
  await controller.retryQueue(attemptId);
  const refreshed = controller.get(attemptId)!;
  assert.equal(refreshed.status, 'confirmed');
  assert.equal(refreshed.queue.status, 'ok');
  assert.deepEqual(refreshed.compactReceipt, ack);
  assert.equal(refreshed.record, null);
  assert.equal(reads, 2);
  assert.equal(sends(), 1);
});

test('323 · no-op y replay con metadatos incompletos conservan lo que el servidor acreditó', async () => {
  const noOp = await rig(receipt({
    acknowledgement: { changed: false, resultingRevision: 'a'.repeat(64) },
    replayed: true, writeResultOmitted: 'not-retained',
  })).submission.done;
  const noChange = describeOperation(noOp);
  assert.equal(noOp.status, 'confirmed');
  assert.match(noChange.title, /^Sin cambios/);
  assert.match(noChange.lines.join(' '), /ni se añadió historial/);
  const replay = await rig(receipt({
    acknowledgement: null, replayed: true, writeResultOmitted: 'not-retained',
  })).submission.done;
  assert.equal(replay.status, 'confirmed');
  assert.equal(replay.compactReceipt?.acknowledgement, null);
  assert.match(describeOperation(replay).lines.join(' '), /acuse que conservaba/);
  assert.equal(replay.record, null);
  assert.equal(replay.revised, null);
});
