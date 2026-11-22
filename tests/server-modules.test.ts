// CLAUDE-SERVER-MODULES · Registro de módulos compartidos sin arrastrar al paquete portátil nada exclusivo de la App completa.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { SHARED_MODULES } from '../server/modules.js';

const MAIN_ONLY = ['registerGenerator', 'importHubspot', 'hubspotRemote', 'inspectConnection', 'registerCopyInspection', 'mountRelayRehearsal', 'mountHubspotReadCheck'];

test('el registro tiene identificadores únicos y una razón por módulo', () => {
  const ids = SHARED_MODULES.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SHARED_MODULES.every(m => m.why.trim().length > 0 && typeof m.mount === 'function'));
});

test('los dos puntos de entrada montan el registro y conservan el montaje literal de la unidad 318', () => {
  for (const entry of ['server/main.ts', 'server/runtime.ts']) {
    const code = fs.readFileSync(entry, 'utf8');
    assert.equal(code.split('mountSharedModules(app, store);').length, 2, entry + ': una sola llamada al registro');
    assert.equal(code.split('registerTaskIntents(app, store);').length, 2, entry + ': la prueba 318 instrumenta esta llamada literal');
    for (const module of ['continuity-evidence-api', 'work-summary-api']) {
      assert.ok(!code.includes("'./" + module + ".js'"), entry + ' ya no importa ' + module + ' directamente');
    }
  }
});

test('el paquete portátil compilado sigue sin generador, proveedores, conectores ni rutas exclusivas de la App completa', async t => {
  const dir = path.resolve('tests/.tmp'); fs.mkdirSync(dir, { recursive: true });
  const out = fs.mkdtempSync(path.join(dir, 'server-modules-')); t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const result = await build({ entryPoints: [path.resolve('server/runtime.ts')], outfile: path.join(out, 'runtime.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent', metafile: true });
  const bundle = fs.readFileSync(path.join(out, 'runtime.mjs'), 'utf8');
  for (const name of MAIN_ONLY) assert.ok(!new RegExp('\\b' + name + '\\b').test(bundle), 'el portátil no contiene ' + name);
  const inputs = Object.keys(result.metafile!.inputs).map(p => p.replace(/\\/g, '/'));
  for (const file of ['server/generator.ts', 'server/hubspot.ts', 'server/copy-inspection.ts', 'server/relay-rehearsal-mount.ts']) {
    assert.ok(!inputs.some(p => p.endsWith(file)), 'el portátil no incluye ' + file);
  }
  for (const file of ['server/modules.ts', 'server/continuity-evidence-api.ts', 'server/work-summary-api.ts']) assert.ok(inputs.some(p => p.endsWith(file)), 'sí incluye ' + file);
});
