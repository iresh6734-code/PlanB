import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmCaptureContract, CaptureContractError, type CaptureBinding, type CapturePage } from '../shared/crm-capture-contract.js';

// Codex acceptance cases, authored from the agreed contract before reading Sonnet's implementation.
const binding: CaptureBinding = { tenantId: 'tenant-a', portalId: 'portal-a', generation: 0 };
const page = (ids: string[], nextCursor: string | null = null, total?: number): CapturePage => ({ ids, nextCursor, ...(total === undefined ? {} : { total }) });
function code(action: () => unknown, expected: string) {
  assert.throws(action, (error: unknown) => error instanceof CaptureContractError && error.code === expected);
}
function invalidated(contract: CrmCaptureContract) {
  code(() => contract.finalize(binding), 'INVALIDATED');
  code(() => contract.addPage(binding, 'contacts', null, page([])), 'INVALIDATED');
}

test('acceptance: interleaved entities share neither cursor nor ID namespace', () => {
  const contract = new CrmCaptureContract(binding, ['contacts', 'companies']);
  contract.addPage(binding, 'contacts', null, page(['shared'], 'cursor', 2));
  contract.addPage(binding, 'companies', null, page(['shared'], 'cursor', 2));
  contract.addPage(binding, 'companies', 'cursor', page(['company-2']));
  contract.addPage(binding, 'contacts', 'cursor', page(['contact-2']));
  const summary = contract.finalize(binding);
  assert.equal(summary.complete, true);
  assert.equal(summary.totalPages, 4);
  assert.equal(summary.totalRecords, 4);
  assert.deepEqual(summary.entities.contacts, { pages: 2, records: 2 });
  assert.deepEqual(summary.entities.companies, { pages: 2, records: 2 });
});

test('acceptance: terminal empty entity is valid without an advertised total', () => {
  const contract = new CrmCaptureContract(binding, ['tasks']);
  contract.addPage(binding, 'tasks', null, page([]));
  assert.equal(contract.finalize(binding).totalRecords, 0);
});

test('acceptance: reaching global limits exactly is valid across entity boundaries', () => {
  const contract = new CrmCaptureContract(binding, ['contacts', 'deals'], { maxRecords: 3, maxPages: 2 });
  contract.addPage(binding, 'contacts', null, page(['1', '2']));
  contract.addPage(binding, 'deals', null, page(['1']));
  assert.equal(contract.finalize(binding).totalRecords, 3);
});

for (const limit of ['maxRecords', 'maxPages'] as const) {
  test(`acceptance: ${limit} is a capture limit rather than a per-entity allowance`, () => {
    const contract = new CrmCaptureContract(binding, ['contacts', 'deals'], { [limit]: 1 });
    contract.addPage(binding, 'contacts', null, page(['one']));
    code(() => contract.addPage(binding, 'deals', null, page(['two'])), 'LIMIT_EXCEEDED');
    invalidated(contract);
  });
}

for (const key of ['tenantId', 'portalId', 'generation'] as const) {
  test(`acceptance: a changed ${key} poisons a collecting capture`, () => {
    const contract = new CrmCaptureContract(binding, ['contacts']);
    contract.addPage(binding, 'contacts', null, page(['1'], 'next'));
    const changed = { ...binding, [key]: key === 'generation' ? 1 : 'other' };
    code(() => contract.addPage(changed, 'contacts', 'next', page(['2'])), 'BINDING_MISMATCH');
    invalidated(contract);
  });
}

test('acceptance: finalize checks generation even when every entity has ended', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1']));
  code(() => contract.finalize({ ...binding, generation: 1 }), 'BINDING_MISMATCH');
  invalidated(contract);
});

test('acceptance: an incomplete finalize cannot be repaired into a publishable capture', () => {
  const contract = new CrmCaptureContract(binding, ['contacts', 'companies']);
  contract.addPage(binding, 'contacts', null, page(['1']));
  code(() => contract.finalize(binding), 'INCOMPLETE');
  invalidated(contract);
});

test('acceptance: constructor detaches binding and entity-list references', () => {
  const mutable = { ...binding };
  const entities: ('contacts' | 'companies')[] = ['contacts'];
  const contract = new CrmCaptureContract(mutable, entities);
  mutable.tenantId = 'mutated';
  mutable.generation = 99;
  entities.push('companies');
  contract.addPage(binding, 'contacts', null, page(['1']));
  assert.deepEqual(contract.finalize(binding).binding, binding);
});

test('acceptance: mutating a previous page cannot rewrite the duplicate detector or summary', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  const first = page(['1'], 'next');
  contract.addPage(binding, 'contacts', null, first);
  (first.ids as string[])[0] = 'different';
  first.nextCursor = null;
  code(() => contract.addPage(binding, 'contacts', 'next', page(['1'])), 'DUPLICATE_ID');
  invalidated(contract);
});

test('acceptance: final summary is deeply frozen and finalization is idempotent', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1'], null, 1));
  const summary = contract.finalize(binding);
  assert.ok(Object.isFrozen(summary));
  assert.ok(Object.isFrozen(summary.binding));
  assert.ok(Object.isFrozen(summary.entities));
  assert.ok(Object.isFrozen(summary.entities.contacts));
  assert.strictEqual(contract.finalize({ ...binding }), summary);
  assert.throws(() => { (summary.entities.contacts as { records: number }).records = 90; }, TypeError);
  code(() => contract.addPage(binding, 'contacts', null, page(['2'])), 'FINALIZED');
  assert.strictEqual(contract.finalize(binding), summary);
});

test('acceptance: a skipped cursor fails closed instead of silently losing a page', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1'], 'expected'));
  code(() => contract.addPage(binding, 'contacts', 'different', page(['2'])), 'CURSOR_MISMATCH');
  invalidated(contract);
});

test('acceptance: a three-page cursor cycle is rejected before finalization', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1'], 'a'));
  contract.addPage(binding, 'contacts', 'a', page(['2'], 'b'));
  code(() => contract.addPage(binding, 'contacts', 'b', page(['3'], 'a')), 'CURSOR_LOOP');
  invalidated(contract);
});

test('acceptance: an unknown entity cannot smuggle records past configured counts', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  code(() => contract.addPage(binding, 'companies', null, page(['1'])), 'UNKNOWN_ENTITY');
  invalidated(contract);
});

test('acceptance: an empty page advertising progress is rejected', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  code(() => contract.addPage(binding, 'contacts', null, page([], 'next')), 'EMPTY_PAGE');
  invalidated(contract);
});

test('acceptance: advertised totals cannot change mid-capture', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1'], 'next', 2));
  code(() => contract.addPage(binding, 'contacts', 'next', page(['2'], null, 3)), 'TOTAL_CHANGED');
  invalidated(contract);
});

test('acceptance: count agreement does not excuse a duplicate in the final page', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1'], 'next', 2));
  code(() => contract.addPage(binding, 'contacts', 'next', page(['1'], null, 2)), 'DUPLICATE_ID');
  invalidated(contract);
});

test('acceptance: a missing advertised record prevents a complete summary', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  code(() => contract.addPage(binding, 'contacts', null, page(['1'], null, 2)), 'COUNT_MISMATCH');
  invalidated(contract);
});

test('acceptance: a duplicate in one page invalidates the entire capture', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  code(() => contract.addPage(binding, 'contacts', null, page(['1', '1'])), 'DUPLICATE_ID');
  invalidated(contract);
});

for (const malformed of [null, {}, { ids: '1', nextCursor: null }, { ids: [1], nextCursor: null }, { ids: [' x'], nextCursor: null }, { ids: ['x'], nextCursor: '' }, { ids: ['x'], nextCursor: null, total: NaN }]) {
  test(`acceptance: malformed runtime page ${JSON.stringify(malformed)} fails closed`, () => {
    const contract = new CrmCaptureContract(binding, ['contacts']);
    code(() => contract.addPage(binding, 'contacts', null, malformed as unknown as CapturePage), 'INVALID_INPUT');
    invalidated(contract);
  });
}

for (const limits of [{ maxRecords: 0 }, { maxPages: -1 }, { maxRecords: 0.5 }, { maxPages: Infinity }, { maxRecords: Number.MAX_SAFE_INTEGER + 1 }]) {
  test(`acceptance: invalid constructor limits ${JSON.stringify(limits)} are rejected`, () => {
    code(() => new CrmCaptureContract(binding, ['contacts'], limits), 'INVALID_INPUT');
  });
}

test('acceptance: an omitted page limit still bounds a hostile endless traversal', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  for (let index = 0; index < 1000; index++) {
    contract.addPage(binding, 'contacts', index === 0 ? null : String(index), page([String(index)], String(index + 1)));
  }
  code(() => contract.addPage(binding, 'contacts', '1000', page(['last'])), 'LIMIT_EXCEEDED');
  invalidated(contract);
});

test('acceptance: omitted totals on later pages cannot discard the original total', () => {
  const contract = new CrmCaptureContract(binding, ['contacts']);
  contract.addPage(binding, 'contacts', null, page(['1'], 'next', 3));
  code(() => contract.addPage(binding, 'contacts', 'next', page(['2'])), 'COUNT_MISMATCH');
  invalidated(contract);
});

test('acceptance: an entity cannot resume after its terminal page while others collect', () => {
  const contract = new CrmCaptureContract(binding, ['contacts', 'companies']);
  contract.addPage(binding, 'contacts', null, page(['1']));
  assert.throws(() => contract.addPage(binding, 'contacts', null, page(['2'])), CaptureContractError);
  invalidated(contract);
});

test('acceptance: capture binding and entity configuration are validated at construction', () => {
  for (const malformed of [{ ...binding, tenantId: '' }, { ...binding, portalId: ' portal' }, { ...binding, generation: -1 }, { ...binding, generation: NaN }]) {
    code(() => new CrmCaptureContract(malformed, ['contacts']), 'INVALID_INPUT');
  }
  code(() => new CrmCaptureContract(binding, []), 'INVALID_INPUT');
  code(() => new CrmCaptureContract(binding, ['contacts', 'contacts']), 'INVALID_INPUT');
  code(() => new CrmCaptureContract(binding, ['__proto__' as 'contacts']), 'INVALID_INPUT');
});
