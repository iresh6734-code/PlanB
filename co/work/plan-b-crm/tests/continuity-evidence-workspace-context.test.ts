import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerContinuityEvidenceApi } from '../server/continuity-evidence-api.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { loadContinuityEvidence } from '../src/continuity-evidence-client.js';

const now = Date.UTC(2026, 10, 5, 18);
const route = '/api/v7/continuity/evidence';
const origin = 'http://127.0.0.1:4513';
const revisionHeader = 'x-planb-workspace-revision';
const expected = (revision: string) => '?workspaceContextRevision=' + revision;

async function fixture() {
  const root = mkdtempSync(path.resolve('tests/.tmp/context242-case-'));
  const { app, store } = await createBaseApp({ root, dbPath: ':memory:', staticDir: path.join(root, 'no-assets') });
  let onClock: (() => void) | undefined;
  let reads = 0;
  const capturedAt = new Date(now - 45 * 60_000).toISOString();
  function activate(marker: string, date = capturedAt) {
    const snapshot = makeFixture('agency');
    snapshot.capturedAt = date;
    snapshot.records.find(row => row.entity === 'tasks')!.values.subject = marker;
    assert.equal(store.importSnapshot(snapshot).complete, true);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: new Date(now).toISOString(), approved: false });
    store.activate();
  }
  activate('Copia ficticia A');
  registerContinuityEvidenceApi(app, store, () => { reads++; onClock?.(); return now; });
  await app.ready();
  const get = (url: string) => app.inject({ url, headers: { host: '127.0.0.1:4513', origin } });
  const identity = async () => (await get('/api/v2/state')).json().workspaceSearchContext;
  return { app, store, get, activate, identity, reads: () => reads, whenReading: (action: () => void) => { onClock = action; } };
}

test('opt-in evidence attests the protected state revision with the v1 body unchanged', async () => {
  const f = await fixture();
  try {
    const current = await f.identity();
    const plain = await f.get(route);
    const bound = await f.get(route + expected(current.contextRevision));
    assert.equal(plain.statusCode, 200);
    assert.equal(bound.statusCode, 200);
    assert.equal(plain.headers[revisionHeader], undefined);
    assert.equal(bound.headers[revisionHeader], current.contextRevision);
    assert.deepEqual(bound.json(), plain.json());
    assert.equal(bound.headers['cache-control'], 'no-store');
  } finally { await f.app.close(); }
});

test('reusing the same capture ID and date with different content cannot reuse the workspace proof', async () => {
  const f = await fixture();
  try {
    const a = await f.identity();
    f.activate('Copia ficticia B');
    const b = await f.identity();
    assert.equal(a.captureId, b.captureId);
    assert.notEqual(a.contextRevision, b.contextRevision);
    const stale = await f.get(route + expected(a.contextRevision));
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().issue, 'SOURCE_CHANGED');
    assert.equal(stale.json().facts, null);
    assert.equal(stale.headers[revisionHeader], undefined);
    assert.equal(f.reads(), 0);
    const conflictingArchive = await f.get(route + expected(b.contextRevision));
    assert.equal(conflictingArchive.statusCode, 409);
    assert.equal(conflictingArchive.json().issue, 'ARCHIVE_MISMATCH');
    assert.equal(conflictingArchive.headers[revisionHeader], undefined);
    f.activate('Copia ficticia C', new Date(now - 35 * 60_000).toISOString());
    const c = await f.identity();
    assert.equal((await f.get(route + expected(c.contextRevision))).statusCode, 200);
  } finally { await f.app.close(); }
});

test('session rotation during the evidence read suppresses the body and attestation', async () => {
  const f = await fixture();
  try {
    const before = await f.identity();
    f.whenReading(() => f.store.set('sessionId', 'rotated-fictional-session'));
    const result = await f.get(route + expected(before.contextRevision));
    assert.ok(f.reads() > 0);
    assert.equal(result.statusCode, 409);
    assert.equal(result.json().issue, 'SOURCE_CHANGED');
    assert.equal(result.json().facts, null);
    assert.equal(result.headers[revisionHeader], undefined);
  } finally { await f.app.close(); }
});

test('bound client refuses an old server or mismatched proof before returning evidence', async () => {
  const f = await fixture();
  try {
    const current = await f.identity();
    const response = await f.get(route);
    assert.equal(response.statusCode, 200);
    const fetcher = (attested?: string): typeof fetch => async input => {
      assert.equal(new URL(String(input), origin).searchParams.get('workspaceContextRevision'), current.contextRevision);
      return new Response(response.body, { headers: attested ? { [revisionHeader]: attested } : {} });
    };
    for (const invalid of [undefined, '0'.repeat(64)]) {
      await assert.rejects(loadContinuityEvidence(undefined, { workspaceContextRevision: current.contextRevision, fetcher: fetcher(invalid) } as Parameters<typeof loadContinuityEvidence>[1]), { code: 'stale' });
    }
    const evidence = await loadContinuityEvidence(undefined, { workspaceContextRevision: current.contextRevision, fetcher: fetcher(current.contextRevision) } as Parameters<typeof loadContinuityEvidence>[1]);
    assert.equal(evidence.context.revision, response.json().context.revision);
  } finally { await f.app.close(); }
});

test('a proof from another installation is rejected before calculating and malformed pins never fetch',async()=>{
  const first=await fixture(),second=await fixture();
  try{
    const a=await first.identity(),b=await second.identity();
    assert.notEqual(a.instanceId,b.instanceId);
    const reply=await second.get(route+expected(a.contextRevision));
    assert.equal(reply.statusCode,409);
    assert.equal(reply.json().facts,null);
    assert.equal(reply.headers[revisionHeader],undefined);
    assert.equal(second.reads(),0);
    let fetches=0;
    await assert.rejects(loadContinuityEvidence(undefined,{workspaceContextRevision:'invalid',fetcher:async()=>{fetches++;throw Error('must not fetch');}}),{code:'invalid'});
    assert.equal(fetches,0);
  }finally{await first.app.close();await second.app.close();}
});

test('a bound read checks expiry after its final installation read and never attests a 401',async t=>{
  let wall=now;
  t.mock.method(Date,'now',()=>wall);
  const f=await fixture();
  try{
    const headers={host:'127.0.0.1:4513',origin};
    const setup=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contraseña ficticia de vínculo 242'}});
    assert.equal(setup.statusCode,200);
    const cookie=String(setup.headers['set-cookie']).split(';')[0];
    const state=await f.app.inject({url:'/api/v2/state',headers:{...headers,cookie}});
    const context=state.json().workspaceSearchContext;
    const read=f.store.get.bind(f.store);
    let count=0,expire=false;
    t.mock.method(f.store,'get',<T>(key:string,fallback:T):T=>{
      const value=read(key,fallback);
      if(key==='instanceId'&&++count===4&&expire)wall=now+30*60_000+1;
      return value;
    });
    wall=now+30*60_000-1;
    const request={url:route+expected(context.contextRevision),headers:{...headers,cookie}};
    const valid=await f.app.inject(request);
    assert.equal(valid.statusCode,200);
    assert.equal(valid.headers[revisionHeader],context.contextRevision);
    assert.equal(count,4);
    count=0;
    expire=true;
    const expired=await f.app.inject(request);
    assert.equal(count,4);
    assert.equal(expired.statusCode,401);
    assert.equal(expired.headers[revisionHeader],undefined);
    assert.equal(expired.headers['set-cookie'],undefined);
    assert.deepEqual(Object.keys(expired.json()),['error']);
    assert.equal((await f.app.inject(request)).statusCode,401);
  }finally{await f.app.close();}
});

test('the client keeps the requested proof if its caller changes the options while fetch is pending',async()=>{
  const f=await fixture();
  try{
    const current=await f.identity(),reply=await f.get(route);
    assert.equal(reply.statusCode,200);
    let deliver!:(response:Response)=>void;
    const options={workspaceContextRevision:current.contextRevision,fetcher:async()=>new Promise<Response>(resolve=>{deliver=resolve;})};
    const pending=loadContinuityEvidence(undefined,options);
    const other='0'.repeat(64);
    options.workspaceContextRevision=other;
    deliver(new Response(reply.body,{headers:{[revisionHeader]:other}}));
    await assert.rejects(pending,{code:'stale'});
  }finally{await f.app.close();}
});
