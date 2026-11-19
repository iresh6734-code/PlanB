import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createBaseApp } from './app.js';
import { bundleRevision } from './recovery-copy.js';
import { planDrill } from './drill-plan.js';
import { MAX_REHEARSAL_BYTES, type RehearsalStage, type RehearsalState } from './recovery-rehearsal.js';
import { BundleSchema } from '../shared/model.js';
import { decodePortable } from './crypto.js';

const stateSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), records: z.number().int().nonnegative(), changes: z.number().int().nonnegative(), pending: z.number().int().nonnegative() }).strict();
const schema = z.object({
  phase: z.enum(['restore', 'resume']), folder: z.string().max(1500), localPassword: z.string().min(12).max(200),
  raw: z.string().optional(), password: z.string().max(200).optional(), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), expected: stateSchema.optional(),
}).strict();
const chunks: Buffer[] = []; let size = 0;
for await (const chunk of process.stdin) {
  const bytes = Buffer.from(chunk); size += bytes.length;
  if (size > 16 * 1024 * 1024) { process.exitCode = 2; break; }
  chunks.push(bytes);
}
let result: RehearsalStage = { phase: 'restore', pid: process.pid, success: false, checks: [] };
let instance: Awaited<ReturnType<typeof createBaseApp>> | null = null;
function check(code: string, condition: boolean) {
  result.checks.push({ code, passed: condition }); if (!condition) throw Error('CHECK_FAILED');
}
try {
  if (process.exitCode) throw Error();
  const input = schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))); result.phase = input.phase;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const parent = path.join(root, 'tests/.tmp/recovery-rehearsals'), folder = path.resolve(input.folder);
  if (path.dirname(folder) !== parent || !/^run-[a-f0-9-]{36}$/.test(path.basename(folder))) throw Error();
  let current = root;
  for (const part of path.relative(root, folder).split(path.sep)) {
    current = path.join(current, part); const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error();
  }
  for (const name of ['data', 'data/.planb-key', 'data/planb.sqlite']) {
    const target = path.join(folder, name); if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw Error();
  }
  // The restore stage is never allowed to open a prior database; resume needs the database just created.
  const dbPath = path.join(folder, 'data/planb.sqlite');
  check('NEW_FOLDER_OR_RESTART', input.phase === 'restore' ? !fs.existsSync(dbPath) : fs.existsSync(dbPath));
  if (input.phase === 'restore') {
    check('INPUT_SIZE_BOUNDED', typeof input.raw === 'string' && Buffer.byteLength(input.raw) <= MAX_REHEARSAL_BYTES);
    const envelope = JSON.parse(input.raw!);
    const bundle = BundleSchema.parse(envelope?.format === 'planb-encrypted-v2' ? decodePortable(input.raw!, input.password ?? '') : envelope);
    check('FIXTURE_SCOPE_VALIDATED', bundle.snapshot.source.kind === 'fixture' && bundle.snapshot.source.isTestData && bundle.snapshot.source.environment !== 'production');
  }
  instance = await createBaseApp({ dbPath, root: folder, staticDir: path.join(folder, 'no-static-assets'), runtime: true });
  const { app, store } = instance;
  if (input.phase === 'resume') check('FIXTURE_DATABASE_SCOPE', store.snapshot?.source.kind === 'fixture' && store.snapshot.source.isTestData);
  const headers = { host: '127.0.0.1:4399', origin: 'http://127.0.0.1:4399' };
  const auth = await app.inject({ method: 'POST', url: '/api/v2/auth/' + (input.phase === 'restore' ? 'setup' : 'login'), headers, payload: { password: input.localPassword } });
  check(input.phase === 'restore' ? 'LOCAL_PROTECTION_SETUP' : 'LOGIN_AFTER_PROCESS_RESTART', auth.statusCode === 200);
  const cookie = String(auth.headers['set-cookie'] ?? '').split(';')[0], authenticated = { ...headers, cookie };
  check('UNAUTHENTICATED_ACCESS_DENIED', (await app.inject({ url: '/api/records', headers })).statusCode === 401);
  const state = (): RehearsalState => ({ revision: bundleRevision(store.bundle()), records: store.records().length, changes: store.changesCount, pending: store.pendingChangesCount });
  if (input.phase === 'restore') {
    const restored = await app.inject({ method: 'POST', url: '/api/v2/restore', headers: authenticated, payload: { file: input.raw ?? '', password: input.password ?? '', replace: false } });
    check('RESTORE_THROUGH_PROTECTED_API', restored.statusCode === 200 && restored.json().restored === true);
    check('RESTORED_REVISION_MATCHES', state().revision === input.expectedRevision);
    check('RUNTIME_DISCONNECTED', store.disconnected && store.ready);
    check('HOST_AND_ORIGIN_GUARDS', (await app.inject({ url: '/api/records', headers: { ...authenticated, host: 'external.invalid' } })).statusCode === 403
      && (await app.inject({ url: '/api/records', headers: { ...authenticated, origin: 'https://external.invalid' } })).statusCode === 403);
    const plan = planDrill(store.spec!, store.records()), initialChanges = store.changesCount;
    check('WORKFLOW_APPLICABLE', !!plan.contact && !!plan.deal && !!plan.task);
    const contact = plan.contact!, deal = plan.deal!, task = plan.task!;
    const displayField = store.spec!.entities.find(entity => entity.id === 'contacts')!.displayField;
    const query = String(store.record('contacts', contact.id)!.values[displayField] ?? '');
    const searched = await app.inject({ url: '/api/v2/records/contacts?q=' + encodeURIComponent(query) + '&limit=100', headers: authenticated });
    const edited = await app.inject({ method: 'PATCH', url: '/api/records/contacts/' + encodeURIComponent(contact.id), headers: authenticated, payload: { values: { [contact.field]: contact.value } } });
    check('CONTACT_READ_AND_EDIT', searched.statusCode === 200 && searched.json().records.some((record: { id: string }) => record.id === contact.id)
      && edited.statusCode === 200 && store.record('contacts', contact.id)?.values[contact.field] === contact.value);
    const moved = await app.inject({ method: 'PATCH', url: '/api/records/deals/' + encodeURIComponent(deal.id), headers: authenticated, payload: { values: { [deal.field]: deal.value } } });
    check('DEAL_ADVANCED', moved.statusCode === 200 && store.record('deals', deal.id)?.values[deal.field] === deal.value);
    const created = await app.inject({ method: 'POST', url: '/api/records/tasks', headers: authenticated, payload: { values: task.values } });
    check('TASK_CREATED', created.statusCode === 200 && typeof created.json().record?.id === 'string');
    const id = created.json().record.id as string;
    const completed = await app.inject({ method: 'PATCH', url: '/api/records/tasks/' + encodeURIComponent(id), headers: authenticated, payload: { values: { [task.statusField]: task.done } } });
    check('TASK_COMPLETED', completed.statusCode === 200 && store.record('tasks', id)?.values[task.statusField] === task.done);
    check('FOUR_OPERATIONS_RECORDED', store.changesCount === initialChanges + 4);
  } else {
    check('PERSISTENCE_AFTER_PROCESS_RESTART', !!input.expected && JSON.stringify(state()) === JSON.stringify(input.expected));
    const records = await app.inject({ url: '/api/records', headers: authenticated });
    check('API_RECORDS_AFTER_RESTART', records.statusCode === 200 && records.json().records.length === input.expected!.records);
  }
  const probe = await app.inject({ method: 'POST', url: '/api/probe', headers: authenticated });
  check('LOCAL_WORKFLOW_PROBE', probe.statusCode === 200 && probe.json().passed === true);
  result.state = state();
  await app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: authenticated });
  check('EXPLICIT_LOCK_DENIES_SESSION', (await app.inject({ url: '/api/records', headers: authenticated })).statusCode === 401);
  result.success = true;
} catch {
  if (!result.checks.some(item => !item.passed)) result.checks.push({ code: 'WORKER_PREPARATION_FAILED', passed: false });
} finally { if (instance) await instance.app.close(); }
process.stdout.write(JSON.stringify(result));
