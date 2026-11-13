// QA-136 · orquestación de aislamiento. Se ejecuta desde la raíz del repositorio (o de una proyección) y NO usa red ni toca carpetas ajenas: todo cuelga de --out (por defecto tests/.tmp/rescue136-par-<uuid>).
//   node tests/helpers/rescue-capsule-followup-parallel.mjs --mode two   [--out DIR] [--rounds N]   dos ejecuciones SIMULTÁNEAS de la QA en raíces separadas, con señuelos cruzados
//   node tests/helpers/rescue-capsule-followup-parallel.mjs --mode noise [--out DIR]                 reproducción de la interferencia de 116: sus pruebas por listado fallan con ruido; las de QA-136 no
// Salida: una línea «SUMMARY {json}» y el mismo JSON en <out>/summary-<mode>.json.
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] ?? '1']] : a), []));
const repo = resolve('.'), mode = args.mode ?? 'two', out = resolve(args.out ?? join('tests', '.tmp', 'rescue136-par-' + randomUUID()));
mkdirSync(out, { recursive: true });
const MINE = ['tests/rescue-capsule-followup-claims.test.ts', 'tests/rescue-capsule-followup-capture.test.ts', 'tests/rescue-capsule-followup-isolation.test.ts'];
const run = (argv, env, cwd = repo) => { const t0 = Date.now(); const p = spawn(process.execPath, argv, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { o += d; });
  return new Promise(ok => p.once('exit', code => ok({ code, out: o, t0, t1: Date.now() }))); };
const count = o => ({ tests: +(/^ℹ tests (\d+)/m.exec(o)?.[1] ?? 0), pass: +(/^ℹ pass (\d+)/m.exec(o)?.[1] ?? 0), fail: +(/^ℹ fail (\d+)/m.exec(o)?.[1] ?? 0) });
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const finish = summary => { const text = JSON.stringify(summary, null, 1); writeFileSync(join(out, 'summary-' + mode + '.json'), text); console.log('SUMMARY ' + JSON.stringify(summary)); };

if (mode === 'two') {
  const ids = [randomUUID(), randomUUID()], bases = [1, 2].map(i => join(out, 'run' + i)); for (const b of bases) mkdirSync(b, { recursive: true });
  const jobs = [0, 1].map(i => run(['--import', 'tsx', '--test', '--test-concurrency=1', ...MINE], { PLANB_QA136_BASE: bases[i], PLANB_QA136_CANARY: ids[i], PLANB_QA136_OTHER: ids[1 - i], QA136_ROUNDS: args.rounds ?? '10' }));
  const [a, b] = await Promise.all(jobs); [a, b].forEach((r, i) => writeFileSync(join(out, 'run' + (i + 1) + '.log'), r.out)); const runs = [a, b].map((r, i) => ({ run: i + 1, exit: r.code, ...count(r.out), failed: [...r.out.matchAll(/^✖ (.{0,110})/gm)].map(m => m[1]).filter(v => !v.startsWith('failing')).slice(0, 3), canaryIntact: new RegExp('# SEÑUELO-INTACTO ' + ids[i]).test(r.out), root: /# SEÑUELO-INTACTO \S+ ROOT (.+)$/m.exec(r.out)?.[1] ?? null, seesOtherRoot: r.out.includes(bases[1 - i]) || r.out.includes(ids[1 - i]), startedAt: new Date(r.t0).toISOString(), endedAt: new Date(r.t1).toISOString() }));
  const overlapMs = Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0), left = bases.map(b => existsSync(b) ? readdirSync(b) : []);
  for (const b of bases) { try { rmdirSync(b); } catch { /* con restos: se informa */ } }
  finish({ mode, overlapMs, runs, leftovers: left, ok: runs.every(r => r.exit === 0 && r.fail === 0 && r.canaryIntact && !r.seesOtherRoot) && overlapMs > 30_000 });
} else if (mode === 'noise') {
  const proj = join(out, 'proj'); const skip = p => !p.includes(sep + '.tmp'); mkdirSync(join(proj, 'tests'), { recursive: true });
  for (const d of ['server', 'shared', 'src', 'scripts', 'design']) cpSync(join(repo, d), join(proj, d), { recursive: true, filter: skip });
  cpSync(join(repo, 'tests', 'helpers'), join(proj, 'tests', 'helpers'), { recursive: true }); for (const f of readdirSync(join(repo, 'tests'))) if (/^rescue-capsule.*\.test\.ts$/.test(f)) cpSync(join(repo, 'tests', f), join(proj, 'tests', f));
  for (const f of ['package.json', 'tsconfig.json']) cpSync(join(repo, f), join(proj, f)); mkdirSync(join(proj, 'tests', '.tmp'), { recursive: true });
  const NOISE = join(proj, 'noise.cjs'); writeFileSync(NOISE, `const fs=require('fs'),p=require('path'),c=require('crypto');const base=p.join(process.argv[2],'tests','.tmp');
const end=Date.now()+Number(process.argv[3]);while(Date.now()<end){const d=p.join(base,'rescue106-'+c.randomUUID());try{fs.mkdirSync(d);fs.writeFileSync(p.join(d,'rescue-room.marker.json'),'{}');const t=Date.now()+15;while(Date.now()<t){}fs.unlinkSync(p.join(d,'rescue-room.marker.json'));fs.rmdirSync(d);}catch{}}`);
  const with116 = noise => run(['--import', 'tsx', '--test', '--test-concurrency=1', '--test-name-pattern=sin destino ni staging|staging-created', 'tests/rescue-capsule-integrity.test.ts', 'tests/rescue-capsule-rehearsal.test.ts'], {}, proj).then(async r => ({ ...r, noise }));
  const withNoise = async fn => { const n = spawn(process.execPath, [NOISE, proj, '180000'], { windowsHide: true, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 500)); try { return await fn(); } finally { n.kill(); await new Promise(r => setTimeout(r, 300)); } };
  const control116 = await with116(false), noisy116 = await withNoise(() => with116(true));
  const noisyMine = await withNoise(() => run(['--import', 'tsx', '--test', '--test-concurrency=1', '--test-name-pattern=^(1|2|7) ', MINE[0], MINE[2]], { PLANB_QA136_BASE: join(proj, 'tests', '.tmp') }, proj));
  const failedNames = o => [...o.matchAll(/^✖ (.{0,100})/gm)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i && !v.startsWith('failing')).slice(0, 4);
  finish({ mode, hashes: { 'server/rescue-capsule.ts': sha(join(proj, 'server/rescue-capsule.ts')), 'tests/rescue-capsule-integrity.test.ts': sha(join(proj, 'tests/rescue-capsule-integrity.test.ts')), 'tests/rescue-capsule-rehearsal.test.ts': sha(join(proj, 'tests/rescue-capsule-rehearsal.test.ts')) },
    control116: { exit: control116.code, ...count(control116.out) }, noisy116: { exit: noisy116.code, ...count(noisy116.out), failed: failedNames(noisy116.out) }, noisyQA136: { exit: noisyMine.code, ...count(noisyMine.out) },
    reproducesInterference: control116.code === 0 && noisy116.code !== 0, qa136Unaffected: noisyMine.code === 0 });
} else { console.error('modo desconocido'); process.exitCode = 2; }
void unlinkSync;
