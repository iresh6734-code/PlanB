import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { BundleSchema } from '../shared/model.js';
import { decodePortable } from './crypto.js';
import { Store } from './store.js';
import { bundleRevision } from './recovery-copy.js';

export const MAX_REHEARSAL_BYTES = 2 * 1024 * 1024;
export interface RehearsalState { revision: string; records: number; changes: number; pending: number }
export interface RehearsalStage {
  phase: 'restore' | 'resume'; pid: number; success: boolean;
  checks: { code: string; passed: boolean }[]; state?: RehearsalState;
}
export interface RecoveryRehearsalReport {
  format: 'planb-recovery-rehearsal-v1'; status: 'passed' | 'failed' | 'refused';
  runId: string | null; artifactHash: string | null; inputRevision: string | null; restoredRevision: string | null;
  startedAt: string; completedAt: string; elapsedMs: number; stages: RehearsalStage[];
  issue: string | null; evidenceFile: string | null; limitations: string[];
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function newRun() {
  const relative = ['tests', '.tmp', 'recovery-rehearsals']; let current = root;
  for (const part of relative) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) fs.mkdirSync(current);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('UNSAFE_SCRATCH');
  }
  const runId = 'run-' + randomUUID(), folder = path.join(current, runId);
  fs.mkdirSync(folder); // Fresh directory only. No restore into existing folders, overwrite or cleanup.
  return { runId, folder };
}

/** Only synthetic fixture artifacts. Creates a new protected test database, never opens a supplied database path. */
export function rehearsePortableRecovery(input: { raw: string; password?: string }): RecoveryRehearsalReport {
  const started = performance.now();
  const report: RecoveryRehearsalReport = {
    format: 'planb-recovery-rehearsal-v1', status: 'refused', runId: null, artifactHash: null, inputRevision: null, restoredRevision: null,
    startedAt: new Date().toISOString(), completedAt: '', elapsedMs: 0, stages: [], issue: null, evidenceFile: null,
    limitations: [
      'Solo datos ficticios con origen fixture; no ensaya archivos de clientes, producción o cuentas de proveedores.',
      'Ejercita API local mediante Fastify.inject, sin listener ni navegador. No demuestra interfaz, instalación empaquetada u otro equipo.',
      'Restaura y modifica únicamente una carpeta nueva de ensayo, que se conserva; no toca una instalación existente.',
      'En Windows, la base nueva usa su propia protección local del usuario actual. No recupera claves o perfiles de otro equipo.',
      'Duración de esta ejecución en este ordenador, no un RTO garantizado ni certificación de continuidad.',
      'Los procesos usan el bloqueo de red del arnés; no se invocan conectores ni operaciones de devolución remota.',
    ],
  };
  const finish = () => { report.completedAt = new Date().toISOString(); report.elapsedMs = Math.round(performance.now() - started); return report; };
  let expectedRevision: string;
  try {
    if (typeof input.raw !== 'string' || Buffer.byteLength(input.raw) > MAX_REHEARSAL_BYTES
      || input.password !== undefined && (typeof input.password !== 'string' || input.password.length > 200)) throw Error();
    report.artifactHash = hash(input.raw);
    const envelope = JSON.parse(input.raw);
    const bundle = BundleSchema.parse(envelope?.format === 'planb-encrypted-v2' ? decodePortable(input.raw, input.password ?? '') : envelope);
    if (bundle.snapshot.source.kind !== 'fixture' || !bundle.snapshot.source.isTestData || bundle.snapshot.source.environment === 'production') {
      report.issue = 'FIXTURE_ONLY'; return finish();
    }
    const probe = new Store(':memory:');
    try { probe.restoreBundle(bundle); expectedRevision = bundleRevision(probe.bundle()); }
    finally { probe.close(); }
    report.inputRevision = bundleRevision(bundle); report.restoredRevision = expectedRevision;
  } catch { report.issue = 'INVALID_ARTIFACT'; return finish(); }
  let run: ReturnType<typeof newRun>;
  try { run = newRun(); } catch { report.issue = 'SCRATCH_UNAVAILABLE'; return finish(); }
  report.runId = run.runId; report.status = 'failed';
  const localPassword = 'rehearsal-' + randomUUID();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^FIREBASE_|^GOOGLE_|^HUBSPOT_|^OPENAI_|^ANTHROPIC_|^AZURE_|^AWS_|NODE_OPTIONS|^PLANB_/i.test(key)));
  function stage(phase: RehearsalStage['phase'], expected?: RehearsalState): RehearsalStage {
    const child = spawnSync(process.execPath, ['--require', path.join(root, 'scripts/block-external.cjs'), '--import', 'tsx', path.join(root, 'server/recovery-rehearsal-worker.ts')], {
      cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 35_000, maxBuffer: 128 * 1024,
      input: JSON.stringify({ phase, folder: run.folder, localPassword, raw: phase === 'restore' ? input.raw : undefined, password: phase === 'restore' ? input.password : undefined, expectedRevision, expected }),
    });
    try {
      if (child.status !== 0 || child.error) throw Error();
      const value = JSON.parse(child.stdout) as RehearsalStage;
      if (value.phase !== phase || value.pid !== child.pid || !Array.isArray(value.checks) || typeof value.success !== 'boolean'
        || value.checks.some(check => typeof check.code !== 'string' || typeof check.passed !== 'boolean')) throw Error();
      return value;
    } catch { return { phase, pid: child.pid ?? 0, success: false, checks: [{ code: 'WORKER_FAILED', passed: false }] }; }
  }
  const first = stage('restore'); report.stages.push(first);
  if (first.success && first.state) {
    const second = stage('resume', first.state); report.stages.push(second);
    if (second.success && second.state && second.pid !== first.pid && second.state.revision === first.state.revision) report.status = 'passed';
  }
  report.issue = report.status === 'passed' ? null : 'REHEARSAL_NOT_PASSED';
  finish();
  const relative = ['tests', '.tmp', 'recovery-rehearsals', run.runId, 'report.json'].join('/');
  report.evidenceFile = relative;
  try { fs.writeFileSync(path.join(run.folder, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
  catch { report.status = 'failed'; report.issue = 'EVIDENCE_WRITE_FAILED'; report.evidenceFile = null; }
  return report;
}
