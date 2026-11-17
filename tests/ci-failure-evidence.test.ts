import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error herramienta JavaScript sin declaraciones de tipos
import resultsReporter, { parseResults } from '../tools/ci/compare.mjs';
// @ts-expect-error herramienta JavaScript sin declaraciones de tipos
import { childEnvironment } from '../tools/ci/run.mjs';

type FailureEvent = { file: string | null; name: string; nesting: number | null; failureType: string | null };

test('421 · CLI conserva el padre fallido y su hija cancelada, además del fallo de aserción', t => {
  const root = process.cwd(), temp = path.join(root, 'tests/.tmp');
  fs.mkdirSync(temp, { recursive: true });
  const dir = fs.mkdtempSync(path.join(temp, 'ci421-real-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sample.test.mjs'), known = path.join(dir, 'known.json');
  fs.writeFileSync(file, `import test from 'node:test';
import assert from 'node:assert/strict';
test('pasada', () => {});
test('fallo de aserción', () => assert.equal(1, 2));
test('padre', async t => { void t.test('hija cancelada', async () => { await new Promise(() => {}); }); throw new Error('padre termina antes'); });
test('omitida', { skip: true }, () => assert.fail());
test('pendiente', { todo: true }, () => assert.fail());
`);
  fs.writeFileSync(known, JSON.stringify({ failures: [] }));
  const run = spawnSync(process.execPath, [path.join(root, 'tools/ci/run.mjs'), '--skip-types', '--skip-api', '--tests',
    path.relative(root, file).replace(/\\/g, '/'), '--known', known], { encoding: 'utf8', timeout: 90_000, windowsHide: true, env: childEnvironment(process.env) });
  const output = run.stdout + run.stderr;
  assert.equal(run.status, 1, output);
  const reportDir = /informe en (.+)$/m.exec(run.stdout)?.[1]?.trim();
  assert.ok(reportDir, output);
  const unit = JSON.parse(fs.readFileSync(path.join(reportDir, 'report.json'), 'utf8')).steps.unit;
  assert.equal(unit.summary.cancelled, 1);
  assert.match(unit.broken, /1 pruebas canceladas/);
  assert.match(output, /1 canceladas/);
  const events = unit.failedEvents as FailureEvent[];
  assert.ok(Array.isArray(events), 'report.json conserva los eventos estructurados');
  assert.deepEqual(events.map(e => e.name).sort(), ['fallo de aserción', 'hija cancelada', 'padre'].sort());
  assert.deepEqual(events.map(e => e.file), events.map(() => path.relative(root, file).replace(/\\/g, '/')));
  assert.equal(events.find(e => e.name === 'hija cancelada')?.failureType, 'cancelledByParent');
  assert.equal(events.find(e => e.name === 'padre')?.failureType, 'testCodeFailure');
  assert.equal(events.find(e => e.name === 'fallo de aserción')?.failureType, 'testCodeFailure');
  assert.equal(events.find(e => e.name === 'hija cancelada')?.nesting, 1);
  assert.equal(events.find(e => e.name === 'padre')?.nesting, 0);
});

test('421 · lectura compatible separa pasadas de eventos fallidos y conserva homónimos sin heredar archivo', () => {
  const rows = [
    { status: 'pass', file: 'D:/repo/tests/a.ts', name: 'pasada' },
    { status: 'fail', file: 'D:/repo/tests/a.ts', name: 'igual', nesting: 0, failureType: 'testCodeFailure' },
    { status: 'fail', file: 'D:/repo/tests/b.ts', name: 'igual', nesting: 1, failureType: 'cancelledByParent' },
    { status: 'fail', file: null, name: 'sin archivo' },
    { status: 'fail', file: 'D:/repo/tests/c.ts', name: 'antigua' },
    { status: 'fail', file: 'D:/repo/tests/a.ts', name: 'omitida', skip: true },
    { status: 'fail', file: 'D:/repo/tests/a.ts', name: 'pendiente', todo: true },
    { status: 'pass', file: 'D:/repo/tests/a.ts', name: 'tampoco pasada', todo: true },
    { status: 'otro', file: 'D:/repo/tests/a.ts', name: 'no es resultado' },
    { status: 'fail', file: 'D:/repo/tests/a.ts', name: 42 },
  ];
  const result = parseResults(rows.map(row => JSON.stringify(row)).join('\n') + '\n{truncada\n', 'D:/repo') as { passed: Set<string>; failedEvents: FailureEvent[] };
  assert.deepEqual([...result.passed], ['tests/a.ts::pasada']);
  assert.deepEqual(result.failedEvents, [
    { file: 'tests/a.ts', name: 'igual', nesting: 0, failureType: 'testCodeFailure' },
    { file: 'tests/b.ts', name: 'igual', nesting: 1, failureType: 'cancelledByParent' },
    { file: null, name: 'sin archivo', nesting: null, failureType: null },
    { file: 'tests/c.ts', name: 'antigua', nesting: null, failureType: null },
  ]);
});

test('421 · el reportero conserva el tipo de fallo sin copiar el mensaje o la pila del error', async () => {
  async function* events() {
    yield { type: 'test:diagnostic', data: { message: 'ignorado' } };
    yield { type: 'test:fail', data: { name: 'caso', file: '/repo/case.ts', nesting: 2,
      details: { error: { failureType: 'cancelledByParent', message: 'CANARIO-421', stack: 'CANARIO-421' } } } };
  }
  let text = '';
  for await (const row of resultsReporter(events())) text += row;
  assert.doesNotMatch(text, /CANARIO-421/);
  const row = JSON.parse(text);
  assert.equal(row.failureType, 'cancelledByParent');
  assert.equal(row.nesting, 2);
  assert.equal(row.status, 'fail');
});
