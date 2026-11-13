import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { CrmSnapshot } from '../shared/model.js';
import type { WorkspaceSearchContext } from '../shared/workspace-search.js';
import { Runtime, View, Transport, setupGlobals } from './helpers/independent-interface-harness.js';

const generation = { provider: 'demo' as const, model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false };
async function setup(snapshot = makeFixture('agency')) {
  const value = await createBaseApp({ root: '.', staticDir: 'none', dbPath: ':memory:', runtime: true });
  value.store.importSnapshot(snapshot); value.store.saveGeneration(makeDemoSpec(snapshot), generation); value.store.activate(); return value;
}
const search = async (app: Awaited<ReturnType<typeof setup>>['app']) => (await app.inject({ url: '/api/v2/search?q=contact-1' })).json();
const selection = (source: { captureId: string; revision: string }) => '/api/v2/search-record?entity=contacts&id=contact-1&captureId=' + encodeURIComponent(source.captureId) + '&revision=' + source.revision;
function tables(store: Awaited<ReturnType<typeof setup>>['store']) { return ['meta', 'records', 'changes', 'captures', 'archives'].map(t => store.db.prepare('SELECT * FROM ' + t).all()); }
async function replace(value: Awaited<ReturnType<typeof setup>>, snapshot: CrmSnapshot) {
  value.store.importSnapshot(snapshot); value.store.saveGeneration(makeDemoSpec(snapshot), generation); value.store.activate();
}
async function stale(value: Awaited<ReturnType<typeof setup>>, old: Awaited<ReturnType<typeof search>>) {
  const before = tables(value.store), current = await search(value.app);
  assert.notEqual(current.source.contextRevision, old.source.contextRevision); assert.notEqual(current.source.revision, old.source.revision);
  assert.equal((await value.app.inject({ url: selection(old.source) })).statusCode, 409);
  assert.equal((await value.app.inject({ url: '/api/v2/search?q=contact-1&contextRevision=' + old.source.contextRevision })).statusCode, 409);
  assert.equal((await value.app.inject({ url: selection(current.source) })).statusCode, 200); assert.deepEqual(tables(value.store), before);
}

test('compact App state and search expose the same full-capture identity without writing tables', async () => {
  const value = await setup(); try {
    const before = tables(value.store), state = (await value.app.inject({ url: '/api/v2/state' })).json(), result = await search(value.app);
    assert.deepEqual(state.snapshot.records, []);
    assert.deepEqual(state.workspaceSearchContext, Object.fromEntries(Object.entries(result.source).filter(([key]) => key !== 'revision')));
    assert.equal(state.workspaceSearchContext.instanceId, value.store.get('instanceId', null)); assert.match(result.source.contextRevision, /^[a-f0-9]{64}$/); assert.deepEqual(tables(value.store), before);
  } finally { await value.app.close(); }
});

test('identical portals and contents in distinct installations cannot share a search or selection token', async () => {
  const snapshot = makeFixture('agency'), a = await setup(snapshot), b = await setup(structuredClone(snapshot));
  try { const first = await search(a.app); assert.deepEqual(a.store.records(), b.store.records()); assert.notEqual(a.store.get('instanceId', null), b.store.get('instanceId', null)); await stale(b, first); }
  finally { await a.app.close(); await b.app.close(); }
});

test('same installation and IDs/dates/spec/records reject selections after changing the source account', async () => {
  const snapshot = makeFixture('agency'), value = await setup(snapshot); try {
    const old = await search(value.app), spec = value.store.spec, records = value.store.records(), changed = structuredClone(snapshot); changed.source.accountId = 'fiction-portal-145-other';
    await replace(value, changed); assert.deepEqual(value.store.spec, spec); assert.deepEqual(value.store.records(), records); await stale(value, old);
  } finally { await value.app.close(); }
});

test('a new capture start with the same capture ID/date and identical active data invalidates the old context', async () => {
  const snapshot = makeFixture('agency'), value = await setup(snapshot); try {
    const old = await search(value.app), changed = structuredClone(snapshot); changed.captureStartedAt = '2026-01-01T00:00:00Z';
    await replace(value, changed); assert.equal(changed.id + ':' + changed.capturedAt, old.source.captureId); await stale(value, old);
  } finally { await value.app.close(); }
});

test('changed capture baseline is detected even after a local edit makes all active records equal again', async () => {
  const snapshot = makeFixture('agency'), value = await setup(snapshot); try {
    const old = await search(value.app), beforeRecords = value.store.records(), spec = value.store.spec, changed = structuredClone(snapshot);
    changed.records.find(r => r.entity === 'contacts' && r.id === 'contact-1')!.values.phone = 'different-baseline-145';
    await replace(value, changed); const original = beforeRecords.find(r => r.entity === 'contacts' && r.id === 'contact-1')!;
    value.store.saveRecord('contacts', { phone: original.values.phone }, 'contact-1');
    assert.deepEqual(value.store.records(), beforeRecords); assert.deepEqual(value.store.spec, spec); await stale(value, old);
  } finally { await value.app.close(); }
});

test('a new active generation invalidates identity while a pending candidate does not', async () => {
  const snapshot = makeFixture('agency'), value = await setup(snapshot); try {
    const old = await search(value.app), changed = structuredClone(snapshot); changed.id += '-candidate';
    value.store.importSnapshot(changed); assert.deepEqual((await search(value.app)).source, old.source);
    value.store.set('candidate', null); value.store.saveGeneration(makeDemoSpec(snapshot), { ...generation, generatedAt: '2026-11-02T09:01:00Z' }); value.store.activate(); await stale(value, old);
  } finally { await value.app.close(); }
});

test('absent or malformed installation identity keeps App state readable and refuses search without creating another ID', async () => {
  const value = await setup(); try {
    for (const identity of [null, 'invalid-instance']) {
      value.store.set('instanceId', identity); const before = tables(value.store);
      const state = await value.app.inject({ url: '/api/v2/state' }); assert.equal(state.statusCode, 200); assert.equal(state.json().workspaceSearchContext, null);
      assert.equal((await value.app.inject({ url: '/api/v2/search?q=contact-1' })).statusCode, 409); assert.deepEqual(tables(value.store), before);
    }
  } finally { await value.app.close(); }
});

const context: WorkspaceSearchContext = { instanceId: '00000000-0000-4000-8000-000000000145', captureId: 'same-capture:2026-11-02', accountId: 'fiction145', capturedAt: '2026-11-02T09:00:00Z', isTestData: true, contextRevision: 'c'.repeat(64) };
const result = (identity: WorkspaceSearchContext) => ({ source: { ...identity, revision: 'a'.repeat(64) }, query: 'fixture', offset: 0, limit: 20, total: 1, hasMore: false, counts: { contacts: 1, companies: 0, deals: 0, tasks: 0 }, items: [{ entity: 'contacts', id: 'contact-1', label: 'Fixture145', matchedId: false, totalMatchedFields: 0, matches: [] }] });
async function hooks(run: (view: View, transport: Transport, opened: unknown[]) => Promise<void>, expected: WorkspaceSearchContext | null = context) {
  const restore = setupGlobals(), previous = globalThis.fetch; (globalThis.document as unknown as { body: unknown }).body = { style: { overflow: '' } };
  const transport = new Transport(); globalThis.fetch = transport.fetch; const opened: unknown[] = [];
  const runtime = new Runtime(path.resolve(process.env.PLANB_SEARCH_CTX_ROOT ?? '.')), { WorkspaceSearch } = runtime.load('src/WorkspaceSearch.tsx');
  const view = new View(runtime, WorkspaceSearch, { captureId: context.captureId, expectedContext: expected, localRevision: 1, close() {}, openRecord: (...args: unknown[]) => opened.push(args) });
  try { await run(view, transport, opened); } finally { view.unmount(); globalThis.fetch = previous; restore(); }
}
async function typeQuery(view: View) { view.type(view.find({ tag: 'input', type: 'search' }), 'fixture'); view.advance(201); await view.settle(); }

test('client refuses search responses from another instance, account or context even with identical capture ID', async () => {
  for (const change of [{ instanceId: '00000000-0000-4000-8000-000000000146' }, { accountId: 'foreign145' }, { contextRevision: 'd'.repeat(64) }]) await hooks(async (view, transport, opened) => {
    transport.on(/^\/v2\/search\?/, () => ({ json: result({ ...context, ...change }) })); await typeQuery(view);
    assert.match(view.text(), /otra copia/); assert.equal(view.all({ className: /workspace-search-hit/ }).length, 0); assert.deepEqual(opened, []);
  });
});

test('client refuses a forged record source even when its capture, workspace revision, entity and ID match', async () => {
  await hooks(async (view, transport, opened) => {
    transport.on(/^\/v2\/search\?/, () => ({ json: result(context) }));
    transport.on(/^\/v2\/search-record\?/, () => ({ json: { source: { ...context, accountId: 'foreign145', revision: 'a'.repeat(64) }, record: { entity: 'contacts', id: 'contact-1', values: { firstname: 'must not open' } }, related: [] } }));
    await typeQuery(view); view.click(view.find({ tag: 'button', className: /workspace-search-hit/ })); await view.settle();
    assert.match(view.text(), /no corresponde/); assert.deepEqual(opened, []);
  });
});

test('a late selection is discarded after context props change even when transport ignores abort and capture/localRevision stay equal', async () => {
  await hooks(async (view, transport, opened) => {
    let identity = context; transport.on(/^\/v2\/search\?/, () => ({ json: result(identity) })); transport.on(/^\/v2\/search-record\?/, () => 'hold');
    await typeQuery(view); view.click(view.find({ tag: 'button', className: /workspace-search-hit/ })); await view.settle();
    const old = transport.pending(/search-record/)[0]; assert.ok(old);
    identity = { ...context, accountId: 'new145', contextRevision: 'd'.repeat(64) }; view.update({ expectedContext: identity }); view.advance(201); await view.settle();
    assert.equal(old.signal?.aborted, true); old.resolve(200, { source: result(context).source, record: { entity: 'contacts', id: 'contact-1', values: { firstname: 'old145' } }, related: [] }); await view.settle();
    assert.deepEqual(opened, []); assert.match(view.text(), /Portal new145/); assert.ok(transport.calls.at(-1)!.path.includes('contextRevision=' + identity.contextRevision));
  });
});

test('missing trusted App context fails closed without any search request, and an explicit fresh context enables it', async () => {
  await hooks(async (view, transport, opened) => {
    transport.on(/^\/v2\/search\?/, () => ({ json: result(context) })); await typeQuery(view); assert.match(view.text(), /no permite identificar/); assert.equal(transport.calls.length, 0); assert.deepEqual(opened, []);
    view.update({ expectedContext: context }); view.advance(201); await view.settle(); assert.match(view.text(), /Fixture145/); assert.equal(transport.calls.length, 1);
  }, null);
});
