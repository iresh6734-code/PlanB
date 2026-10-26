import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateWithAI } from '../server/ai.js';
import { Store } from '../server/store.js';
import { ProviderSettings, validateAiDestination, type AiConfig } from '../server/provider.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
const config: AiConfig = {
  preset: 'custom', baseUrl: 'https://provider.example/v1', apiKey: 'test-secret-only', model: 'test-model',
  inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxOutputTokens: 8192, outputMode: 'json_schema'
};
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fake = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) => (async (url, init) => handler(String(url), init!)) as typeof fetch;
const emptyPatch={title:null,description:null,views:[],rules:[],unsupported:[]};
test('el adaptador envía solo metadatos al destino elegido y valida una especificación declarativa', async () => {
  const store = new Store(':memory:'), snapshot = makeFixture(), expected = makeDemoSpec(snapshot);
  const result = await generateWithAI(store, snapshot, '', config, fake((url, init) => {
    assert.equal(url, 'https://provider.example/v1/chat/completions');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-secret-only');
    assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body as string);
    assert.equal(body.response_format.type, 'json_schema'); assert.equal(body.model, 'test-model');
    assert.ok(!JSON.stringify(body).includes('lucia.martin@example.com'));
    assert.ok(!JSON.stringify(body).includes('"records"'));
    return respond({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(emptyPatch) } }], usage: { prompt_tokens: 1000, completion_tokens: 2000 } });
  }));
  assert.deepEqual(result, expected); assert.equal(store.usage().usedUsd, .005);
  assert.equal(store.usage().reservedUsd, 0); store.close();
});
test('modo JSON incluye el esquema y se valida igual que el modo estructurado', async () => {
  const store = new Store(':memory:'), snapshot = makeFixture('distribution');
  const result = await generateWithAI(store, snapshot, '', { ...config, outputMode: 'json_object' }, fake((_url, init) => {
    const body = JSON.parse(init.body as string);
    assert.deepEqual(body.response_format, { type: 'json_object' }); assert.ok(body.messages[0].content.includes('JSON'));
    return respond({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(emptyPatch) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  }));
  assert.equal(result.stages[0].id, 'received'); store.close();
});
test('salida parcial, JSON roto, campo inventado y cuota agotada se rechazan', async () => {
  const snapshot = makeFixture(), invalid = makeDemoSpec(snapshot); invalid.entities[0].fields[0].type = 'number';
  for (const response of [
    respond({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    respond({ choices: [{ finish_reason: 'stop', message: { content: '{' } }] }),
    respond({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(invalid) } }] }),
    respond({ error: { code: 'credit_balance_exhausted' } }, 429)
  ]) {
    const store = new Store(':memory:');
    await assert.rejects(() => generateWithAI(store, snapshot, '', config, fake(() => response)));
    assert.equal(store.ready, false); store.close();
  }
});
test('sin configuración, sin tarifas o desconectado no se llama al proveedor', async () => {
  const store = new Store(':memory:'); let calls = 0;
  const fetcher = fake(() => { calls++; return respond({}); });
  await assert.rejects(() => generateWithAI(store, makeFixture(), '', null, fetcher), /Configura/);
  await assert.rejects(() => generateWithAI(store, makeFixture(), '', { ...config, inputUsdPerMillion: null }, fetcher), /tarifas/);
  store.set('disconnected', true);
  await assert.rejects(() => generateWithAI(store, makeFixture(), '', config, fetcher), /desconectados/);
  assert.equal(calls, 0); store.close();
});
test('el bloqueo preventivo evita la petición antes de superar 25 USD', async () => {
  const store = new Store(':memory:'); let calls = 0; store.reserveUsage(24.9999);
  await assert.rejects(() => generateWithAI(store, makeFixture(), '', config, fake(() => { calls++; return respond({}); })), /25 USD/);
  assert.equal(calls, 0); store.close();
});
test('un fallo de red retiene la reserva por consumo incierto', async () => {
  const store = new Store(':memory:');
  await assert.rejects(() => generateWithAI(store, makeFixture(), '', config, fake(() => { throw new Error('connection failed'); })), /reserva/);
  assert.ok(store.usage().reservedUsd > 0); store.close();
});
test('la clave no se reutiliza para otra dirección y nunca vuelve en la API pública', () => {
  const scratch = resolve('tests', '.tmp'); mkdirSync(scratch, { recursive: true });
  const folder = mkdtempSync(join(scratch, 'settings-'));
  try {
    const settings = new ProviderSettings(join(folder, '.ai.local.json'));
    assert.equal(settings.read(), null); assert.ok(!JSON.stringify(settings.save(config)).includes('test-secret-only'));
    settings.save({ ...config, apiKey: '', model: 'otro-modelo' }); assert.equal(settings.read()!.apiKey, config.apiKey);
    assert.throws(() => settings.save({ ...config, baseUrl: 'https://another.example/v1', apiKey: '' }), /clave/);
    assert.throws(() => validateAiDestination({ ...config, baseUrl: 'http://external.example/v1' }), /HTTPS/);
    assert.throws(() => validateAiDestination({ ...config, preset: 'gemini' }), /proveedor/);
    assert.doesNotThrow(() => validateAiDestination({ ...config, preset: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '' }));
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
