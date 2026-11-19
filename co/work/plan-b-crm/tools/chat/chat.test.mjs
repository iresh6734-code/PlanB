import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChannel, MAX_TEXT } from './chat.mjs';
import { buildPrompt, planTurns, run, MAX_ROUNDS } from './runner.mjs';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-chat-'));
  return { file: path.join(dir, 'chat', 'general.jsonl'), cleanup() { fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('canal: envía, filtra por destinatario y continúa desde un id', () => {
  const { file, cleanup } = setup();
  try {
    const channel = createChannel(file);
    const a = channel.send({ from: 'claude', to: 'codex', kind: 'ask', text: '¿Mantienes el contrato?' });
    channel.send({ from: 'codex', to: 'claude', text: 'Sí.' });
    channel.send({ from: 'human', to: 'all', text: 'Adelante.' });
    assert.equal(channel.read({ as: 'codex' }).length, 3);
    assert.equal(channel.read({ as: 'claude', after: a.id }).map(m => m.text).join('|'), 'Sí.|Adelante.');
    assert.equal(channel.read({ as: 'human' }).length, 1);
  } finally { cleanup(); }
});

test('canal: rechaza remitentes, tipos y textos no válidos, e ignora líneas dañadas', () => {
  const { file, cleanup } = setup();
  try {
    const channel = createChannel(file);
    assert.throws(() => channel.send({ from: 'intruso', text: 'hola' }), /Remitente/);
    assert.throws(() => channel.send({ from: 'claude', kind: 'orden', text: 'hola' }), /Tipo/);
    assert.throws(() => channel.send({ from: 'claude', text: '   ' }), /vacío/);
    assert.throws(() => channel.send({ from: 'claude', text: 'x'.repeat(MAX_TEXT + 1) }), /supera/);
    channel.send({ from: 'claude', text: 'válido' });
    fs.appendFileSync(file, '{no es json\n{"id":"x","from":"otro"}\n');
    assert.equal(channel.all().length, 1);
  } finally { cleanup(); }
});

test('ejecutor: turnos alternos con tope duro y ensayo sin efectos', async () => {
  assert.deepEqual(planTurns({ start: 'codex', rounds: 3 }), ['codex', 'claude', 'codex']);
  assert.equal(planTurns({ rounds: 999 }).length, MAX_ROUNDS);
  assert.equal(planTurns({ rounds: 0 }).length, 1);
  const { file, cleanup } = setup();
  try {
    let launched = 0, shown = '';
    const result = await run({ goal: 'Mejorar X', rounds: 2, channel: createChannel(file), spawnAgent: async () => { launched++; return { ok: true }; }, log: text => { shown += text; } });
    assert.equal(result.stopped, 'dry-run');
    assert.equal(launched, 0);
    assert.equal(fs.existsSync(file), false);
    assert.match(shown, /ensayo, no se lanza nada/);
    await assert.rejects(run({ goal: ' ', channel: createChannel(file) }), /objetivo/);
  } finally { cleanup(); }
});

test('ejecutor: se detiene ante decisión humana, "hecho", error y turnos sin mensajes', async () => {
  const cases = [
    ['decision', agent => ({ from: agent, to: 'human', kind: 'decision', text: '¿Cambiamos el contrato?' }), 'decision'],
    ['done', agent => ({ from: agent, to: 'all', kind: 'done', text: 'Listo y revisado.' }), 'done']
  ];
  for (const [, message, expected] of cases) {
    const { file, cleanup } = setup();
    try {
      const channel = createChannel(file);
      const result = await run({ goal: 'G', rounds: 6, execute: true, channel, log() {}, spawnAgent: async agent => { channel.send(message(agent)); return { ok: true }; } });
      assert.equal(result.stopped, expected);
      assert.equal(channel.all().filter(m => m.from !== 'system').length, 1);
    } finally { cleanup(); }
  }
  for (const [spawnAgent, expected] of [[async () => ({ ok: false, code: 1 }), 'error'], [async () => ({ ok: true }), 'stalled']]) {
    const { file, cleanup } = setup();
    try {
      const channel = createChannel(file);
      const result = await run({ goal: 'G', rounds: 6, execute: true, channel, log() {}, spawnAgent });
      assert.equal(result.stopped, expected);
      assert.equal(channel.all().at(-1).to, 'human');
    } finally { cleanup(); }
  }
});

test('el prompt impone reserva en el tablón, revisión cruzada y parada ante decisiones', () => {
  const prompt = buildPrompt({ agent: 'codex', goal: 'Mejorar X', messages: [{ from: 'claude', to: 'codex', kind: 'ask', text: 'Hola' }], round: 2, rounds: 4 });
  for (const expected of [/board\.mjs/, /check-path/, /No aceptes tu propio trabajo/, /decision a human/, /Turno 2 de 4/, /claude → codex \(ask\): Hola/, /Sin llamadas remotas/]) assert.match(prompt, expected);
});
