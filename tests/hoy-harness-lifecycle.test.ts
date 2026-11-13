import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HoyHarness } from './e2e/hoy-recuperable-harness.js';

// Servidores ficticios REALES y recibos del arnés. No navegador ni cambio en las aserciones de producto.
test('ciclo de hijos de Hoy: cierre por identidad original, incluso con PID reutilizado', async t => {
  const h = new HoyHarness(); await h.prepare();
  try {
    await t.test('un servidor activo falla; un segundo start no pierde su seguimiento', async () => {
      h.reset(); await h.start();
      assert.throws(() => h.assertAllClosed(), /recibo de cierre/);
      await assert.rejects(h.start(), /pendiente de cierre/);
      await h.stop(); h.assertAllClosed();
    });
    await t.test('un recibo público inventado no acredita el cierre del hijo real', async () => {
      h.reset(); const start = await h.start();
      h.closes.push({ pid: start.pid, code: 0, signal: null });
      try { assert.throws(() => h.assertAllClosed(), /recibo de cierre/); }
      finally { h.closes.pop(); await h.stop(); }
      h.assertAllClosed();
    });
    await t.test('el hijo cerrado pasa aunque una señal cero observe su PID reutilizado', async () => {
      h.reset(); const start = await h.start(); await h.stop();
      assert.ok(h.closes.some(close => close.pid === start.pid));
      const original = process.kill;
      process.kill = ((pid: number, signal?: number | NodeJS.Signals) => pid === start.pid && signal === 0 ? true : original(pid, signal)) as typeof process.kill;
      try { assert.doesNotThrow(() => h.assertAllClosed()); }
      finally { process.kill = original; }
    });
    await t.test('el recibo original es obligatorio aunque el hijo ya haya terminado', async () => {
      h.reset(); await h.start(); await h.stop();
      const receipt = h.closes.pop()!;
      try { assert.throws(() => h.assertAllClosed(), /recibo de cierre/); }
      finally { h.closes.push(receipt); }
      h.assertAllClosed();
    });
    await t.test('reiniciar cierra el hijo previo, conserva datos y detecta el nuevo activo', async () => {
      h.reset(); await h.start(); const beforeState = await h.state();
      const { before, after } = await h.restart();
      assert.equal(before.case, after.case); assert.equal(before.runId, after.runId);
      assert.ok(h.closes.some(close => close.pid === before.pid));
      assert.deepEqual(await h.state(), beforeState);
      assert.throws(() => h.assertAllClosed(), /recibo de cierre/);
      await h.stop(); h.assertAllClosed();
    });
    await t.test('stop espera close también cuando el proceso ya emitió exit sin LISTEN', async () => {
      h.reset(); const script = path.join(h.dir, 'server.mts'), original = fs.readFileSync(script);
      fs.writeFileSync(script, 'process.exit(23);\n');
      const starts = h.starts.length, closes = h.closes.length;
      try {
        await assert.rejects(h.start(), /código 23/);
        await h.stop();
        assert.equal(h.starts.length, starts, 'no se inventa un LISTEN');
        assert.equal(h.closes.length, closes + 1, 'el hijo fallido también queda acreditado');
        assert.equal(h.closes.at(-1)!.code, 23); h.assertAllClosed();
      } finally { fs.writeFileSync(script, original); }
    });
  } finally { await h.stop(); h.assertAllClosed(); }
});
