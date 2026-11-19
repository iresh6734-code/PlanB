import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4399' };
const view = (id: string, name: string, extra: object = {}) => ({ id, name, query: 'norte', pick: null, sort: { key: 'due_date', dir: 1 }, smart: 'overdue', ...extra });

async function setup() {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/t5-no-static'), runtime: false });
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  const inject = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return { app, store, inject };
}

test('saved views live in the copy per record type and never touch records', async () => {
  const { app, store, inject } = await setup();
  try {
    const changes = store.changesCount;
    assert.deepEqual((await inject('GET', '/api/v2/views/tasks')).json(), { views: [], stored: false });
    const saved = await inject('POST', '/api/v2/views/tasks', { views: [view('a', '  Vencidas del norte '), view('b', 'Sin fecha', { query: '  ', sort: null, smart: null })] });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json().views.map((item: { name: string; query: string }) => [item.name, item.query]), [['Vencidas del norte', 'norte'], ['Sin fecha', '']]);
    assert.deepEqual((await inject('GET', '/api/v2/views/tasks')).json(), saved.json());
    assert.deepEqual((await inject('GET', '/api/v2/views/deals')).json(), { views: [], stored: false });
    const cleared = await inject('POST', '/api/v2/views/tasks', { views: [] });
    assert.deepEqual(cleared.json(), { views: [], stored: true }, 'borrarlas todas también queda guardado');
    assert.equal(store.changesCount, changes);
  } finally { await app.close(); }
});

test('invalid saved views are refused and leave what was stored', async () => {
  const { app, inject } = await setup();
  try {
    const kept = { views: [view('a', 'Norte')] };
    assert.equal((await inject('POST', '/api/v2/views/contacts', kept)).statusCode, 200);
    const refused = [
      { views: [view('a', 'Norte'), view('b', 'NORTE')] },
      { views: [view('a', 'Uno'), view('a', 'Dos')] },
      { views: Array.from({ length: 9 }, (_, index) => view('v' + index, 'Vista ' + index)) },
      { views: [view('a', 'Norte', { values: { email: 'x@example.com' } })] },
      { views: [view('a', '   ')] },
      { views: [view('a', 'Norte', { sort: { key: 'due_date', dir: 2 } })] },
    ];
    for (const payload of refused) assert.equal((await inject('POST', '/api/v2/views/contacts', payload)).statusCode, 422, JSON.stringify(payload).slice(0, 80));
    assert.equal((await inject('POST', '/api/v2/views/people', kept)).statusCode, 422);
    assert.deepEqual((await inject('GET', '/api/v2/views/contacts')).json().views.map((item: { name: string }) => item.name), ['Norte']);
  } finally { await app.close(); }
});
