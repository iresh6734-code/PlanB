import test from 'node:test';
import assert from 'node:assert/strict';
import { importHubspot } from '../server/hubspot.js';

const options = { token: 'synthetic-progress-token', accountId: '123', confirmedTestAccount: true };
function fixture(contacts: unknown) {
  const calls: string[] = [];
  const props: Record<string, string[]> = { contacts: ['firstname'], companies: ['name'], deals: ['dealname'], tasks: ['hs_task_subject'] };
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname.includes('account-info')) return Response.json({ portalId: 123, accountType: 'DEVELOPER_TEST' });
    if (url.pathname.includes('/pipelines/')) return Response.json({ results: [{ id: 'pipeline', label: 'Pipeline', stages: [{ id: 'open', label: 'Open' }] }] });
    if (url.pathname.includes('/properties/')) return Response.json({ results: props[url.pathname.split('/').at(-1)!].map(name => ({ name, label: name, type: 'string', hubspotDefined: true })) });
    if (url.pathname.endsWith('/search')) return Response.json({ results: [], total: 0 });
    if (url.pathname.includes('/objects/') && url.pathname.endsWith('/contacts')) {
      // Stop deterministically if a broken importer tries to follow an invalid page.
      if (url.searchParams.has('after')) throw Error('unexpected next page');
      return Response.json(contacts);
    }
    if (url.pathname.includes('/objects/')) return Response.json({ results: [] });
    if (url.pathname.includes('/associations/')) return Response.json({ status: 'COMPLETE', results: [] });
    throw Error('unexpected fixture path');
  };
  return { calls, fetcher };
}

test('progress: empty nonterminal page stops immediately before another CRM request', async () => {
  const mock = fixture({ results: [], paging: { next: { after: 'next' } } });
  await assert.rejects(importHubspot(options, mock.fetcher), (error: any) => error.status === 502 && /progreso/.test(error.message));
  assert.equal(mock.calls.filter(p => p.includes('/objects/') && p.includes('/contacts?')).length, 1);
  assert.ok(!mock.calls.some(p => p.endsWith('/search')));
});

for (const cursor of ['', ' next', true, {}, -1, 1.5, null]) {
  test(`progress: invalid cursor ${JSON.stringify(cursor)} is rejected before use`, async () => {
    const mock = fixture({ results: [{ id: '1', properties: { firstname: 'Synthetic' } }], paging: { next: { after: cursor } } });
    await assert.rejects(importHubspot(options, mock.fetcher), (error: any) => error.status === 502 && /cursor/.test(error.message));
    assert.equal(mock.calls.filter(p => p.includes('/objects/') && p.includes('/contacts?')).length, 1);
    assert.ok(!mock.calls.some(p => p.endsWith('/search')));
  });
}

for (const record of [null, { properties: {} }, { id: 1, properties: {} }, { id: '', properties: {} }, { id: ' 1', properties: {} }, { id: '1', properties: null }, { id: '1', properties: [] }]) {
  test(`progress: malformed record ${JSON.stringify(record)} fails with a sanitized provider error`, async () => {
    const mock = fixture({ results: [record] });
    await assert.rejects(importHubspot(options, mock.fetcher), (error: any) => error.status === 502 && /registro/.test(error.message) && !error.message.includes(options.token));
    assert.ok(!mock.calls.some(p => p.endsWith('/search')));
  });
}

test('progress: empty terminal entities produce a valid empty capture', async () => {
  const mock = fixture({ results: [] });
  const snapshot = await importHubspot(options, mock.fetcher);
  assert.equal(snapshot.manifest.complete, true);
  assert.equal(snapshot.records.length, 0);
});

// Fixture con varias páginas de contactos, indexadas por el cursor `after` ('' = primera página).
function paged(pages: Record<string, unknown>) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname.includes('account-info')) return Response.json({ portalId: 123, accountType: 'DEVELOPER_TEST' });
    if (url.pathname.includes('/pipelines/')) return Response.json({ results: [{ id: 'pipeline', label: 'Pipeline', stages: [{ id: 'open', label: 'Open' }] }] });
    if (url.pathname.includes('/properties/')) return Response.json({ results: ({ contacts: ['firstname'], companies: ['name'], deals: ['dealname'], tasks: ['hs_task_subject'] } as Record<string, string[]>)[url.pathname.split('/').at(-1)!].map(name => ({ name, label: name, type: 'string', hubspotDefined: true })) });
    if (url.pathname.endsWith('/search')) return Response.json({ results: [], total: 0 });
    if (url.pathname.endsWith('/contacts')) {
      const key = url.searchParams.get('after') ?? '';
      if (!(key in pages)) throw Error('unexpected page ' + key);
      return Response.json(pages[key]);
    }
    if (url.pathname.includes('/objects/')) return Response.json({ results: [] });
    if (url.pathname.includes('/associations/')) return Response.json({ status: 'COMPLETE', results: [] });
    throw Error('unexpected fixture path');
  };
  return { calls, fetcher };
}
const contactsRequests = (calls: string[]) => calls.filter(p => p.includes('/objects/') && p.includes('/contacts?'));

test('progress: paging.next null es el final de la colección, no un cursor inválido', async () => {
  const mock = paged({ '': { results: [], paging: { next: null } } });
  const snapshot = await importHubspot(options, mock.fetcher);
  assert.equal(snapshot.manifest.complete, true);
  assert.equal(contactsRequests(mock.calls).length, 1);
});
test('progress: un cursor repetido se rechaza sin pedir más páginas ni guardar captura parcial', async () => {
  const page = (id: string) => ({ results: [{ id, properties: { firstname: 'Synthetic' } }], paging: { next: { after: 'c1' } } });
  const mock = paged({ '': page('1'), c1: page('2') });
  await assert.rejects(importHubspot(options, mock.fetcher), (error: any) => error.status === 502 && /repiti. un cursor/.test(error.message));
  assert.equal(contactsRequests(mock.calls).length, 2);
  assert.ok(!mock.calls.some(p => p.endsWith('/search')));
});
test('progress: el tope de registros es acumulado entre páginas, no por página', async () => {
  const records = Array.from({ length: 10_000 }, (_, index) => ({ id: String(index), properties: { firstname: 'Synthetic' } }));
  const mock = paged({ '': { results: records, paging: { next: { after: 'c1' } } }, c1: { results: [{ id: 'extra', properties: { firstname: 'Synthetic' } }] } });
  await assert.rejects(importHubspot(options, mock.fetcher), (error: any) => error.status === 413);
  assert.equal(contactsRequests(mock.calls).length, 2);
  assert.ok(!mock.calls.some(p => p.endsWith('/search')), 'no se llega al recuento final');
});
