import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4391', origin: 'http://127.0.0.1:4391' };
async function setup(activate = true) {
  const result = await createBaseApp({ root: path.resolve('tests/.tmp/no-search-workers'), staticDir: path.resolve('tests/.tmp/no-search-assets'), dbPath: ':memory:', runtime: true });
  if (activate) { const snapshot = makeFixture(); result.store.importSnapshot(snapshot); result.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); result.store.activate(); }
  return result;
}

test('search uses active local data with source revision, complete counts, no-store and no mutations', async () => {
  const { app, store } = await setup();
  try {
    store.saveRecord('contacts', { firstname: 'Búsqueda canario', lastname: 'Norte', phone: '600 999' }, 'contact-1');
    const rows = () => ['records', 'changes', 'meta', 'captures'].map(table => store.db.prepare('SELECT * FROM ' + table).all());
    const before = rows(), r = await app.inject({ url: '/api/v2/search?q=busqueda%20norte', headers });
    assert.equal(r.statusCode, 200); assert.equal(r.headers['cache-control'], 'no-store');
    const data = r.json(); assert.equal(data.total, 1); assert.equal(data.items[0].id, 'contact-1'); assert.equal(data.items[0].entity, 'contacts');
    assert.equal(data.source.captureId, store.snapshot!.id + ':' + store.snapshot!.capturedAt); assert.match(data.source.revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(rows(), before);
  } finally { await app.close(); }
});

test('opening a hit retrieves full current record and relations, not clipped preview, bound to the exact source revision', async () => {
  const { app, store } = await setup();
  try {
    const phone = 'x'.repeat(300) + 'query053' + 'y'.repeat(300); store.saveRecord('contacts', { phone }, 'contact-1');
    const data = (await app.inject({ url: '/api/v2/search?q=query053', headers })).json();
    assert.ok(data.items[0].matches[0].preview.length < phone.length);
    const url = '/api/v2/search-record?entity=contacts&id=contact-1&captureId=' + encodeURIComponent(data.source.captureId) + '&revision=' + data.source.revision;
    const r = await app.inject({ url, headers }); assert.equal(r.statusCode, 200); assert.equal(r.json().record.values.phone, phone); assert.ok(r.json().related.length);
    store.saveRecord('contacts', { phone: 'changed' }, 'contact-1');
    assert.equal((await app.inject({ url, headers })).statusCode, 409);
    assert.equal((await app.inject({ url: '/api/v2/search?q=query053&revision=' + data.source.revision, headers })).statusCode, 409);
  } finally { await app.close(); }
});

test('both routes inherit local authentication and host/origin guards; revoked session cannot read results', async () => {
  const { app } = await setup();
  try {
    const auth = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-search053-password' } });
    const cookie = String(auth.headers['set-cookie']).split(';')[0], protectedHeaders = { ...headers, cookie };
    assert.equal((await app.inject({ url: '/api/v2/search?q=cliente', headers })).statusCode, 401);
    const r = await app.inject({ url: '/api/v2/search?q=cliente', headers: protectedHeaders }); assert.equal(r.statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v2/search?q=cliente', headers: { ...protectedHeaders, host: 'other.invalid' } })).statusCode, 403);
    assert.equal((await app.inject({ url: '/api/v2/search?q=cliente', headers: { ...protectedHeaders, origin: 'https://other.invalid' } })).statusCode, 403);
    assert.equal((await app.inject({ url: '/api/v2/search-record', headers })).statusCode, 401);
    await app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: protectedHeaders });
    assert.equal((await app.inject({ url: '/api/v2/search?q=cliente', headers: protectedHeaders })).statusCode, 401);
  } finally { await app.close(); }
});

test('strict query validation refuses ambiguous/unbounded filters and client source/time overrides', async () => {
  const { app } = await setup();
  try {
    for (const query of ['q=a', 'q=aa&q=bb', 'q=aa&limit=51', 'q=aa&limit=1&limit=2', 'q=aa&offset=-1', 'q=aa&offset=10001', 'q=aa&entities=', 'q=aa&entities=bad', 'q=aa&entities=contacts,contacts', 'q=aa&accountId=other', 'q=aa&evaluatedAt=0', 'q=aa&revision=bad']) assert.equal((await app.inject({ url: '/api/v2/search?' + query, headers })).statusCode, 422, query);
    assert.equal((await app.inject({ url: '/api/v2/search-record?entity=contacts&id=xx', headers })).statusCode, 422);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v2/search', headers, payload: {} })).statusCode, 404);
  } finally { await app.close(); }
});

test('inactive source refuses search; pending candidate never replaces the active workspace results', async () => {
  const empty = await setup(false);
  try { assert.equal((await empty.app.inject({ url: '/api/v2/search?q=cliente', headers })).statusCode, 409); } finally { await empty.app.close(); }
  const { app, store } = await setup();
  try {
    const active = store.snapshot!.id + ':' + store.snapshot!.capturedAt, candidate = makeFixture(); candidate.id += '-candidate'; candidate.records.find(r => r.id === 'contact-1')!.values.firstname = 'ONLY-CANDIDATE-053';
    store.importSnapshot(candidate);
    assert.equal((await app.inject({ url: '/api/v2/search?q=ONLY-CANDIDATE-053', headers })).json().total, 0);
    const result = (await app.inject({ url: '/api/v2/search?q=contact-1', headers })).json(); assert.equal(result.source.captureId, active); assert.ok(result.total);
  } finally { await app.close(); }
});

test('absent, null and empty reference values never resolve literal undefined/null/empty record IDs (QA060F1)',async()=>{
 const {app,store}=await setup();try{
  for(const id of ['undefined','null',''])store.insertRecord({entity:'companies',id,values:{name:'Literal identity '+id}});
  for(const value of [undefined,null,'']){
   const record=store.record('contacts','contact-1')!,values={...record.values};if(value===undefined)delete values.company_id;else values.company_id=value;
   store.insertRecord({...record,values});
   const hit=(await app.inject({url:'/api/v2/search?q=contact-1',headers})).json();
   const opened=await app.inject({url:'/api/v2/search-record?entity=contacts&id=contact-1&captureId='+encodeURIComponent(hit.source.captureId)+'&revision='+hit.source.revision,headers});
   assert.equal(opened.statusCode,200);assert.ok(opened.json().related.every((r:{id:string})=>!['undefined','null',''].includes(r.id)));
  }
 }finally{await app.close();}
});
