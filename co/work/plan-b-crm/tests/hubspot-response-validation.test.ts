import test from 'node:test';
import assert from 'node:assert/strict';
import { importHubspot } from '../server/hubspot.js';
import { MAX_RECORDS } from '../shared/model.js';

const options = { token: 'synthetic-validation-secret', accountId: '123', confirmedTestAccount: true };
const accountPath = '/account-info/2026-09/details';
const contactsPath = '/crm/objects/2026-09/contacts';
function response(value: unknown): Response {
  const result = Response.json({});
  result.json = async () => value;
  return result;
}
function transport(override: (path: string) => Response | undefined) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); calls.push(url.pathname);
    const changed = override(url.pathname); if (changed) return changed;
    if (url.pathname === accountPath) return response({ portalId: 123, accountType: 'DEVELOPER_TEST' });
    if (url.pathname.includes('/pipelines/')) return response({ results: [{ id: 'p', label: 'Pipeline', stages: [{ id: 'open', label: 'Open' }] }] });
    if (url.pathname.includes('/properties/')) return response({ results: [{ name: 'firstname', label: 'Name', type: 'string', hubspotDefined: true }] });
    throw Error('unexpected fixture request');
  };
  return { calls, fetcher };
}

test('response: malformed JSON is sanitized and never retried as an alternate API version', async () => {
  const fake = transport(path => path === accountPath ? new Response('secret remote fragment ' + options.token, { status: 200 }) : undefined);
  await assert.rejects(importHubspot(options, fake.fetcher), (error: any) => error.status === 502 && !error.message.includes(options.token));
  assert.deepEqual(fake.calls, [accountPath]);
});

for (const value of [null, [], 'provider string ' + options.token, 17, true]) {
  test(`response: unexpected JSON ${typeof value} produces a controlled provider failure`, async () => {
    const fake = transport(path => path === accountPath ? response(value) : undefined);
    await assert.rejects(importHubspot(options, fake.fetcher), (error: any) => error.status === 502 && !error.message.includes(options.token));
    assert.deepEqual(fake.calls, [accountPath]);
  });
}

test('response: oversized records are rejected before inspecting every record or pushing a large list', async () => {
  let idReads = 0;
  const records = Array.from({ length: MAX_RECORDS + 1 }, (_, index) => ({ get id() { idReads++; return String(index); }, properties: { firstname: 'Synthetic' } }));
  const fake = transport(path => path === contactsPath ? response({ results: records }) : undefined);
  await assert.rejects(importHubspot(options, fake.fetcher), (error: any) => error.status === 413);
  assert.equal(idReads, 0, 'the quota must reject before record getters are inspected');
  assert.equal(fake.calls.at(-1), contactsPath);
});
