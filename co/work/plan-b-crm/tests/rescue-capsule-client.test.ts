import test from 'node:test';
import assert from 'node:assert/strict';
import { CapsuleApiError, CapsuleClient, validateKitState } from '../src/rescue-capsule-client.js';
// Kit de Relevo · cliente: JSON acotado por bytes, contratos completos, errores que no parecen éxito, lecturas obsoletas y contraseña solo en el cuerpo.
const hex = (c: string) => c.repeat(64);
const summary = { origin: { roomId: 'sala-origen-0001', stage: 'return-partial', version: 7, label: 'x' }, createdAt: 'z', revision: hex('a'), records: 63, changes: 3, journalEvents: 12, idemRecords: 5, simRecords: 63, simCreates: 1, uncertainOps: [{ id: 'op', label: 'Tarea', error: null }], approvedPlan: false, stageLabel: 'Resultado parcial o incierto', policy: 'p', warnings: [], limits: [] };
const kitState = { banner: 'Ensayo · datos ficticios · mismo equipo, carpeta nueva', origin: { roomId: 'sala-origen-0001', stage: 'Resultado parcial', stageKey: 'return-partial', version: 7, revision: hex('a'), records: 63, changes: 3, journalEvents: 12, simRecords: 63, simCreates: 1, simCreateCalls: 1, uncertain: 1, approvedPlan: false, policy: 'p', uncertainOps: [{ id: 'op', label: 'Tarea' }], planScope: 's' }, capsules: [{ name: 'relevo-0000000001.capsule', imported: false, destination: null, export: null }], opened: [], limits: [], notProven: [] };
const reply = (body: unknown, init: { status?: number; type?: string; headers?: Record<string, string> } = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': init.type ?? 'application/json; charset=utf-8', ...(init.headers ?? {}) } });
const client = (fn: (url: string, init: RequestInit) => Promise<Response>) => new CapsuleClient('/api/capsule', ((u: string, i: RequestInit) => fn(String(u), i)) as typeof fetch);
const rejectsWith = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: CapsuleApiError) => e instanceof CapsuleApiError && e.code === code, code);

test('un estado completo se acepta y uno incompleto o con tipos erróneos no se interpreta como estado', async () => {
  assert.equal((await client(async () => reply(kitState)).state())!.capsules.length, 1);
  for (const bad of [{ ...kitState, banner: undefined }, { ...kitState, origin: { ...kitState.origin, version: -1 } }, { ...kitState, origin: { ...kitState.origin, uncertainOps: 'no' } }, { ...kitState, capsules: [{ name: 1 }] }, { ...kitState, capsules: [{ name: 'a', imported: false, destination: null, export: { bytes: 1, sha256: 'xyz', revision: hex('a') } }] }]) await rejectsWith(client(async () => reply(bad)).state(), 'BAD_FORMAT');
  assert.throws(() => validateKitState({}), CapsuleApiError);
});

test('formato inválido y tamaño: no JSON, JSON roto, Content-Length excesivo y flujo sin fin (cancelado) se rechazan', async () => {
  await rejectsWith(client(async () => reply('<html>', { type: 'text/html' })).state(), 'BAD_FORMAT'); await rejectsWith(client(async () => reply('{roto')).state(), 'BAD_JSON'); await rejectsWith(client(async () => reply(kitState, { headers: { 'content-length': '9000000' } })).state(), 'TOO_LARGE');
  await rejectsWith(client(async () => reply(JSON.stringify({ x: '€'.repeat(700_000) }))).state(), 'TOO_LARGE');
  let cancelled = false; const infinite = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(100_000).fill(97)); }, cancel() { cancelled = true; } });
  await rejectsWith(client(async () => new Response(infinite, { headers: { 'content-type': 'application/json' } })).state(), 'TOO_LARGE'); assert.equal(cancelled, true);
});

test('acuses incompletos no confirman: exportar, inspeccionar e importar exigen todo su contrato; un error HTTP no parece éxito; la red caída conserva el mensaje', async () => {
  const exp = { ok: true, name: 'relevo-0000000001.capsule', bytes: 10, sha256: hex('b'), revision: hex('c'), attempts: 1, ms: 5, summary };
  assert.equal((await client(async () => reply(exp)).exportCapsule(PW)).name, exp.name);
  for (const bad of [{ ...exp, ok: false }, { ...exp, sha256: 'xyz' }, { ...exp, bytes: -1 }, { ...exp, summary: { ...summary, records: 'x' } }, { ok: true }, []]) await rejectsWith(client(async () => reply(bad)).exportCapsule(PW), /BAD_ACK|BAD_FORMAT/.source.includes('|') ? ((await client(async () => reply(bad)).exportCapsule(PW).catch((e: CapsuleApiError) => e.code)) as string) : 'BAD_FORMAT');
  await rejectsWith(client(async () => reply({ ok: true, destination: { roomId: 'x', folder: '../x' }, retired: [], ms: 1, summary })).importCapsule({ name: 'n', password: PW, expectedSha256: hex('a'), expectedRevision: hex('a') }), 'BAD_FORMAT');
  await assert.rejects(client(async () => reply({ error: 'Contraseña incorrecta o archivo dañado.', code: 'DECRYPT_FAILED' }, { status: 422 })).inspect('relevo-0000000001.capsule', PW), (e: CapsuleApiError) => e.status === 422 && e.code === 'DECRYPT_FAILED' && !e.message.includes(PW));
  await assert.rejects(client(async () => { throw new TypeError('fetch failed'); }).seed(), (e: CapsuleApiError) => e.code === 'NETWORK' && /se conserva/.test(e.message));
});
const PW = 'contraseña-de-ensayo-116';

test('la contraseña viaja solo en el CUERPO: nunca en la URL, cabeceras ni en el almacenamiento del cliente', async () => {
  const seen: { url: string; init: RequestInit }[] = []; const exp = { ok: true, name: 'relevo-0000000001.capsule', bytes: 10, sha256: hex('b'), revision: hex('c'), attempts: 1, ms: 5, summary };
  const c = client(async (url, init) => { seen.push({ url, init }); return reply(exp.name && url.endsWith('/inspect') ? { ...exp, inspectedAt: 'z', bundleCheck: 'ok' } : exp); });
  await c.exportCapsule(PW); await c.inspect(exp.name, PW);
  for (const { url, init } of seen) { assert.ok(!url.includes(PW) && !encodeURIComponent(PW).split('%').some(p => p.length > 8 && url.includes(p)), 'sin contraseña en la URL'); assert.ok(!JSON.stringify(init.headers).includes(PW), 'sin contraseña en cabeceras'); assert.equal(init.method, 'POST'); assert.ok(String(init.body).includes(PW), 'solo en el cuerpo'); }
  assert.equal(typeof (globalThis as { localStorage?: unknown }).localStorage, 'undefined', 'este módulo no usa almacenamiento');
});

test('una lectura nueva cancela la anterior y descarta su respuesta válida pero tardía', async () => {
  let n = 0; const resolvers: ((r: Response) => void)[] = []; const c = client(() => new Promise<Response>(r => { resolvers[n++] = r; }));
  const first = c.state(), second = c.state(); resolvers[1](reply({ ...kitState, origin: { ...kitState.origin, version: 9 } })); resolvers[0](reply(kitState)); const [a, b] = await Promise.all([first, second]);
  assert.equal(a, null); assert.equal(b!.origin.version, 9); c.cancelReads();
});
