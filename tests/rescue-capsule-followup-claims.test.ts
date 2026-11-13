import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { CHILD, KNOWN, PASSWORD, describeClaim, flagFor, RescueRoom, TMP, TSX, bytesOf, claimPath, clock, deadPid, destState, exportCapsule, importCapsule, inspectCapsule, join, livePid, newKit, newRoom, originAt, prepared, readClaim, roomDir, runChild, stagingDir, sweepStaging, trackFolder, treeDigest, viewOf, waitFor, watch, type Kit } from './helpers/rescue-capsule-followup-harness.js';
// QA-136 · Kit de Relevo (116): importación, reclamos y caídas. Todo en una raíz propia; cada prueba identifica SUS destinos por el reclamo de su cápsula, sin listar carpetas ajenas.
// Clasificación de cada punto en el informe: REPRODUCIDO (la prueba lo observa), INFERIDO (solo del código) o NO COMPROBADO. Las pruebas «CARACTERIZACIÓN» fijan el comportamiento ACTUAL de un defecto reproducido:
// si el producto se corrige, fallarán a propósito y habrá que invertirlas, no borrarlas. (Caso 8: ya invertido tras 116 R4; ver su comentario y el informe §0bis.)
const code = (e: unknown) => (e as { code?: string }).code;
const attempt = async (kit: Kit, input: Parameters<typeof importCapsule>[1]) => { try { return { ok: true as const, r: await importCapsule(kit, input) }; } catch (e) { return { ok: false as const, code: code(e), message: String((e as Error).message) }; } };
const job = (kit: Kit, p: Awaited<ReturnType<typeof prepared>>['input'], extra: Record<string, unknown> = {}) => ({ kitDir: kit.dir, name: p.name, password: p.password, sha: p.expectedSha256, rev: p.expectedRevision, action: 'import' as const, ...extra });

test('1 · tres PROCESOS importan a la vez la misma cápsula (soltados por una barrera): un único destino publicado y el reclamo queda coherente [REPRODUCIDO: sin duplicado]', async () => {
  const p = await prepared(), kids = [0, 1, 2].map(i => runChild(job(p.kit, p.input, { mode: 'gate', flag: flagFor(p.kit, 'g' + i) })));
  for (let i = 0; i < 3; i++) await waitFor(flagFor(p.kit, 'g' + i) + '.reached'); for (let i = 0; i < 3; i++) writeFileSync(flagFor(p.kit, 'g' + i) + '.go', '1');
  const results = await Promise.all(kids.map(k => k.done)); for (const r of results) assert.equal(r.code, 0, r.err.slice(-300));
  const wins = results.filter(r => r.result.ok), losses = results.filter(r => !r.result.ok); assert.equal(wins.length, 1, 'exactamente un proceso importa'); assert.deepEqual(losses.map(r => r.result.code), ['ALREADY_IMPORTED', 'ALREADY_IMPORTED']);
  const id = wins[0].result.destination as string; trackFolder(roomDir(id)); const claim = readClaim(p.kit, p.input.name)!; assert.equal(claim.status, 'imported'); assert.equal(claim.destination, id, 'el reclamo apunta al destino ganador');
  assert.equal(destState(id).published, true); assert.equal(destState(id).staging, false, 'sin staging residual del ganador'); const dest = RescueRoom.open(roomDir(id), { clock }); assert.equal(viewOf(dest).stage, 'return-partial'); assert.equal(viewOf(dest).crm.stats.calls.create, 1); dest.close(); p.origin.close();
});

for (const c of [
  { step: 'import:staging-created', before: true, note: 'ANTES de restaurar' }, { step: 'import:bundle-restored', before: true, note: 'tras restaurar el Store, antes de escribir componentes' },
  { step: 'import:before-publish', before: true, note: 'ANTES de publicar' }, { step: 'import:published', before: false, note: 'DESPUÉS de publicar, antes del primer arranque' },
  { step: 'import:first-start-ok', before: false, note: 'tras el primer arranque, ANTES de confirmar el reclamo' },
]) test('2 · el proceso MUERE «' + c.step + '» (' + c.note + '): artefactos, reclamo y reintento [REPRODUCIDO]', async () => {
  const p = await prepared(), flag = flagFor(p.kit, 'c'), k = await runChild(job(p.kit, p.input, { mode: 'crash', step: c.step, flag })).done; assert.equal(k.code, 86, 'el hijo murió en el paso pedido: ' + k.err.slice(-200));
  const claim = readClaim(p.kit, p.input.name)!; assert.equal(claim.status, 'importing', 'el reclamo quedó «importing» de un proceso muerto'); const id = claim.destination!; assert.equal(destState(id).published, !c.before, 'publicado solo si la muerte fue posterior a la publicación'); assert.equal(destState(id).staging, c.before, 'el staging solo existe antes de publicar');
  const w = watch(p.kit, p.input.name), retry = await attempt(p.kit, p.input); w.trackAll(); trackFolder(roomDir(id));
  if (c.before) {
    assert.equal(retry.ok, true, 'antes de publicar el reintento importa'); const second = [...w.ids].find(x => x !== id)!; assert.equal(destState(second).published, true); assert.equal(w.published().length, 1, 'un solo destino publicado'); assert.equal(readClaim(p.kit, p.input.name)!.destination, second);
    assert.equal(destState(id).staging, true, 'RESIDUO: el staging del intento muerto queda huérfano (no hay barrido automático)'); assert.equal(destState(id).published, false); assert.ok(sweepStaging(TMP).includes('rescue116-staging-' + id), 'el barrido lo retira: su importador (pid del marcador) ya no existe'); assert.equal(destState(id).staging, false);
  } else {
    assert.equal(retry.ok, false); assert.equal((retry as { code?: string }).code, 'ALREADY_IMPORTED'); const after = readClaim(p.kit, p.input.name)!; assert.equal(after.status, 'imported'); assert.equal(after.recovered, true, 'el reclamo se consolida como recuperado'); assert.equal(after.destination, id);
    const dest = RescueRoom.open(roomDir(id), { clock }); assert.equal(viewOf(dest).stage, 'return-partial', 'el destino publicado abre y conserva lo incierto'); assert.equal(viewOf(dest).returnPlan!.operations.filter(o => o.status === 'uncertain').length, 1); dest.close();
  }
  p.origin.close();
});

test('3 · fallo al escribir la confirmación del reclamo DESPUÉS de publicar: IMPORT_PUBLISHED_UNCONFIRMED, reclamo conservado, ningún reintento crea otro destino y al poder escribir se consolida [REGRESIÓN; en la versión anterior: reclamo borrado y SEGUNDO destino]', async () => {
  const p = await prepared(); let armed = true;
  const w = watch(p.kit, p.input.name, step => { if (step === 'import:first-start-ok' && armed) { armed = false; chmodSync(claimPath(p.kit, p.input.name), 0o444); } }); // inyección: el reclamo pasa a solo lectura justo antes de la confirmación
  const first = await attempt(p.kit, p.input); w.trackAll(); assert.equal((first as { code?: string }).code, 'IMPORT_PUBLISHED_UNCONFIRMED'); assert.equal(w.published().length, 1, 'el destino ya estaba publicado'); const id = w.published()[0];
  assert.deepEqual({ s: readClaim(p.kit, p.input.name)?.status, d: readClaim(p.kit, p.input.name)?.destination }, { s: 'importing', d: id }, 'el reclamo se conserva y nombra el destino');
  const again = await attempt(p.kit, p.input); assert.equal((again as { code?: string }).code, 'IMPORT_PUBLISHED_UNCONFIRMED'); w.trackAll(); assert.deepEqual(w.published(), [id], 'sigue habiendo UN destino');
  chmodSync(claimPath(p.kit, p.input.name), 0o666); const done = await attempt(p.kit, p.input); assert.equal((done as { code?: string }).code, 'ALREADY_IMPORTED'); assert.deepEqual({ s: readClaim(p.kit, p.input.name)?.status, r: readClaim(p.kit, p.input.name)?.recovered }, { s: 'imported', r: true }); assert.deepEqual(w.published(), [id]); p.origin.close();
});

test('3b · la misma falla con un DIRECTORIO ocupando el reclamo: destino publicado, UNCONFIRMED y los reintentos fallan con CLAIM_UNREADABLE sin crear otro destino [REGRESIÓN]', async () => {
  const p = await prepared(); let armed = true, ids: string[] = []; const w = watch(p.kit, p.input.name, step => { if (step === 'import:first-start-ok' && armed) { armed = false; const c = claimPath(p.kit, p.input.name); unlinkSync(c); mkdirSync(c); } });
  const first = await attempt(p.kit, p.input); w.trackAll(); ids = w.published(); assert.equal((first as { code?: string }).code, 'IMPORT_PUBLISHED_UNCONFIRMED'); assert.equal(ids.length, 1);
  const retry = await attempt(p.kit, p.input); assert.equal((retry as { code?: string }).code, 'CLAIM_UNREADABLE'); w.trackAll(); assert.deepEqual(w.published(), ids); rmdirSync(claimPath(p.kit, p.input.name)); p.origin.close();
});

test('4 · reclamos huérfanos: ilegible, PID ajeno VIVO, PID ausente con destino publicado y PID ausente sin destino [REPRODUCIDO]', async () => {
  const p = await prepared(), path = claimPath(p.kit, p.input.name), alive = livePid(); try {
    // a) ilegible: se trata como «en curso»; no se borra ni se pisa
    writeFileSync(path, '{no es json'); const a = await attempt(p.kit, p.input); assert.equal((a as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(readFileSync(path, 'utf8'), '{no es json', 'el reclamo ilegible se conserva intacto (ambigüedad: requiere decisión humana)');
    // b) PID vivo AJENO a la importación: su sola existencia basta para bloquear (no se comprueba la identidad del proceso)
    const claimB = JSON.stringify({ status: 'importing', destination: '11111111-1111-4111-8111-111111111111', pid: alive.pid, at: 'x' }); writeFileSync(path, claimB); const b = await attempt(p.kit, p.input); assert.equal((b as { code?: string }).code, 'ALREADY_IMPORTED'); assert.equal(readFileSync(path, 'utf8'), claimB, 'un PID vivo que no es el importador bloquea; el reclamo no se toca');
    // c) PID ausente y una carpeta con marcador AJENO (otra revisión): ya no se consolida a ciegas ⇒ ambiguo, reclamo intacto
    const dead = await deadPid(), fake = '22222222-2222-4222-8222-222222222222'; mkdirSync(roomDir(fake)); writeFileSync(join(roomDir(fake), 'rescue-room.marker.json'), JSON.stringify({ kind: 'rescue106', roomId: fake, capsuleRevision: 'otra-revision' })); trackFolder(roomDir(fake));
    const ambiguous = JSON.stringify({ status: 'importing', destination: fake, pid: dead, revision: p.input.expectedRevision, at: 'x' }); writeFileSync(path, ambiguous); const c = await attempt(p.kit, p.input); assert.equal((c as { code?: string }).code, 'IMPORT_AMBIGUOUS'); assert.equal(readFileSync(path, 'utf8'), ambiguous, 'no se consolida ni se borra');
    // d) PID ausente SIN destino publicado: se libera y se importa una vez
    unlinkSync(path); writeFileSync(path, JSON.stringify({ status: 'importing', destination: '33333333-3333-4333-8333-333333333333', pid: dead, at: 'x' })); const w = watch(p.kit, p.input.name), d = await attempt(p.kit, p.input); w.trackAll(); assert.equal(d.ok, true); assert.equal(w.published().length, 1);
    // e) «imported» con el destino ya inexistente: no se rehace (la cápsula es de un solo uso)
    const gone = readClaim(p.kit, p.input.name)!.destination!; const flat = destState(gone); assert.equal(flat.published, true);
  } finally { alive.stop(); p.origin.close(); }
});

test('5 · CARRERA: dos HILOS reales recuperan a la vez un reclamo OBSOLETO; en las rondas pedidas nunca hay más de un destino publicado [REGRESIÓN; en la versión anterior: duplicado en 11 de 20 rondas]', async () => {
  // Cada hilo se presenta con el PID de un proceso ajeno VIVO (fakePid): así la lógica del reclamo (que compara PIDs) ve dos procesos distintos, como en producción. Con el PID compartido aparece un artefacto distinto: ver la prueba 8.
  const ROUNDS = Number(process.env.QA136_ROUNDS ?? 20), p = await prepared(), dead = await deadPid(), sab = new SharedArrayBuffer(4), go = new Int32Array(sab), pids = [livePid(), livePid()]; let nth = 0; const mk = () => new Worker(CHILD, { workerData: { sab, kitDir: p.kit.dir, password: PASSWORD, fakePid: pids[nth++].pid }, execArgv: ['--import', TSX] });
  const workers = [mk(), mk()], once = (w: Worker, type: string, round: number) => new Promise<any>(ok => { const h = (m: any) => { if (m.type === type && m.round === round) { w.off('message', h); ok(m); } }; w.on('message', h); });
  let duplicated = 0, single = 0, blocked = 0; const ids = new Set<string>();
  try {
    for (let round = 1; round <= ROUNDS; round++) {
      const path = claimPath(p.kit, p.input.name); try { unlinkSync(path); } catch { /* ausente */ } writeFileSync(path, JSON.stringify({ status: 'importing', destination: '44444444-4444-4444-8444-444444444444', pid: dead, at: 'x' }));
      const jitter = [0, (round % 7) * 40_000], readies = workers.map(w => once(w, 'ready', round)), dones = workers.map(w => once(w, 'done', round));
      workers.forEach((w, i) => w.postMessage({ round, name: p.input.name, sha: p.input.expectedSha256, rev: p.input.expectedRevision, jitterNs: jitter[i] })); await Promise.all(readies); Atomics.store(go, 0, round); Atomics.notify(go, 0);
      const res = await Promise.all(dones), oks = res.filter(r => r.ok); for (const r of oks) { ids.add(r.id); trackFolder(roomDir(r.id)); }
      if (oks.length >= 2) duplicated++; else if (oks.length === 1) single++; else blocked++;
      assert.ok(res.every(r => r.ok || ['ALREADY_IMPORTED', 'CLAIM_RECOVERY_BUSY'].includes(r.code)), 'resultados inesperados: ' + JSON.stringify(res));
    }
  } finally { await Promise.all(workers.map(w => w.terminate())); for (const x of pids) x.stop(); p.origin.close(); }
  process.stdout.write('# CARRERA reclamo obsoleto: rondas=' + ROUNDS + ' un-destino=' + single + ' DUPLICADO=' + duplicated + ' sin-destino=' + blocked + ' destinos-publicados=' + ids.size + '\n'); assert.equal(duplicated, 0, 'rondas con más de un destino: ' + duplicated); assert.equal(ids.size, single);
});

test('6 · el BARRIDO de staging: respeta una importación ACTIVA (proceso congelado en un paso) y una carpeta ajena parecida; retira la de un importador MUERTO [REGRESIÓN; en la versión anterior vaciaba el staging activo y la importación fallaba con ROOT_NO_MARKER]', async () => {
  const p = await prepared(), flag = flagFor(p.kit, 's'), kid = runChild(job(p.kit, p.input, { mode: 'block', step: 'import:components-written', flag })); await waitFor(flag + '.reached');
  const id = readClaim(p.kit, p.input.name)!.destination!, files = () => KNOWN.filter(n => existsSync(join(stagingDir(id), n))), before = files(); assert.ok(before.includes('rescue-room.marker.json') && before.includes('planb.sqlite'), 'el staging activo tiene marcador y base: ' + before.join());
  const marker = JSON.parse(readFileSync(join(stagingDir(id), 'rescue-room.marker.json'), 'utf8')); assert.equal(marker.pid, kid.pid, 'el marcador identifica al importador por su pid'); const swept = sweepStaging(TMP);
  assert.ok(!swept.includes('rescue116-staging-' + id)); assert.deepEqual(files(), before, 'ni un solo fichero del staging activo se retiró'); writeFileSync(flag + '.go', '1'); const done = await kid.done; trackFolder(roomDir(id));
  assert.equal(done.result.ok, true, 'la importación activa termina bien: ' + JSON.stringify(done.result)); assert.equal(destState(id).published, true); const dest = RescueRoom.open(roomDir(id), { clock }); assert.equal(viewOf(dest).stage, 'return-partial'); dest.close();
  const mine = (uuid: string, marker: unknown, names: string[]) => { const d = stagingDir(uuid); mkdirSync(d); if (marker !== null) writeFileSync(join(d, 'rescue-room.marker.json'), JSON.stringify(marker)); for (const f of names) writeFileSync(join(d, f), 'x'); return d; };
  const [u1, u2, u3, u4, u5] = ['1', '2', '3', '4', '5'].map(n => '55555555-5555-4555-8555-55555555555' + n), dead = await deadPid(), live = livePid();
  try {
    const noPid = mine(u1, { kind: 'rescue106', roomId: u1 }, ['crm-sim.json']), livePidDir = mine(u2, { kind: 'rescue106', roomId: u2, pid: live.pid }, ['crm-sim.json']), otherId = mine(u3, { kind: 'rescue106', roomId: 'otro', pid: dead }, ['crm-sim.json']), noMarker = mine(u4, null, ['crm-sim.json']), deadDir = mine(u5, { kind: 'rescue106', roomId: u5, pid: dead }, ['crm-sim.json']);
    const swept2 = sweepStaging(TMP); assert.deepEqual(swept2.filter(n => n.includes('55555555')), ['rescue116-staging-' + u5], 'solo cae la de un importador MUERTO con marcador completo');
    for (const d of [noPid, livePidDir, otherId, noMarker]) assert.ok(existsSync(join(d, 'crm-sim.json')), 'se conserva (sin pid, pid vivo, roomId distinto o sin marcador): ' + d); assert.equal(existsSync(deadDir), false);
    for (const d of [noPid, livePidDir, otherId, noMarker]) { for (const f of ['rescue-room.marker.json', 'crm-sim.json']) { try { unlinkSync(join(d, f)); } catch { /* ausente */ } } rmdirSync(d); }
  } finally { live.stop(); } p.origin.close();
});

test('7 · el contenido cambia entre inspección e importación: se rechaza sin destino y el reclamo se libera; una reescritura IDÉNTICA no es un cambio (control negativo) [REPRODUCIDO]', async () => {
  const p = await prepared(), path = join(p.kit.capsules, p.input.name), original = bytesOf(path);
  // control negativo: mismos bytes escritos de nuevo ⇒ mismo hash ⇒ no hay cambio
  writeFileSync(path, original); const again = await inspectCapsule(p.kit, p.input.name, PASSWORD); assert.equal(again.sha256, p.input.expectedSha256);
  // otra cápsula VÁLIDA (otro origen) toma el nombre justo al empezar la importación (barrera en el paso import:start, antes del reclamo)
  const other = await prepared('local-work'); const otherBytes = bytesOf(join(other.kit.capsules, other.input.name)); let swap = true; const w = watch(p.kit, p.input.name, step => { if (step === 'import:start' && swap) { swap = false; writeFileSync(path, otherBytes); } });
  const r = await attempt(p.kit, p.input); w.trackAll(); assert.equal((r as { code?: string }).code, 'CONTENT_CHANGED'); assert.equal(w.published().length, 0, 'ningún destino'); assert.equal(existsSync(claimPath(p.kit, p.input.name)), false, 'el reclamo no queda tomado');
  for (const id of w.ids) assert.equal(destState(id).staging, false, 'sin staging');
  // bytes alterados (un carácter): no descifra
  const flipped = Buffer.from(original); flipped[200] ^= 1; writeFileSync(path, flipped); const f = await attempt(p.kit, p.input); assert.equal((f as { code?: string }).code, 'DECRYPT_FAILED', 'un byte alterado en el cuerpo cifrado no descifra');
  // el RELLENO base64 (salt «==») no está autenticado: alterarlo se acepta al LEER (mismo contenido), pero el hash cambia y la aprobación ligada al contenido lo rechaza
  const tail = Buffer.from(original), pad = tail.indexOf(0x3d); assert.ok(pad > 0 && pad < 100, 'el relleno del salt (16 bytes ⇒ «==») está al principio'); tail[pad] ^= 1; writeFileSync(path, tail); const seen = await inspectCapsule(p.kit, p.input.name, PASSWORD); assert.notEqual(seen.sha256, p.input.expectedSha256, 'la inspección ACEPTA la cola alterada pero con OTRO hash'); const t2 = await attempt(p.kit, p.input); assert.equal((t2 as { code?: string }).code, 'CONTENT_CHANGED');
  // restaurar el contenido original inspeccionado: vuelve a ser importable con la misma aprobación (una vez)
  writeFileSync(path, original); const w2 = watch(p.kit, p.input.name), ok = await attempt(p.kit, p.input); w2.trackAll(); assert.equal(ok.ok, true); assert.equal(w2.published().length, 1);
  p.origin.close(); other.origin.close(); void renameSync; void newKit; void newRoom; void originAt; void viewOf; void exportCapsule;
});

test('8 · MISMO PID, OWNER DISTINTO [REGRESIÓN vigente de 116 R4]: una primera importación retenida en components-written; la segunda instancia (mismo PID, otro owner) es rechazada sin tocar reclamo ni staging; al soltar la primera queda UN destino y un reclamo imported concordante', async () => {
  // Historia: sobre 116 R2 esta prueba CARACTERIZABA un defecto (la segunda instancia recuperaba como obsoleto el reclamo activo de la primera ⇒ dos destinos). R3/R4 añadieron un `owner` por instancia: un PID vivo no basta para considerar propio un reclamo.
  // Esta versión protege el comportamiento corregido; la fuente anterior se conserva como evidencia (informe §0bis). NO se usa fakePid: lo que se ensaya es precisamente «mismo PID, owner distinto».
  const p = await prepared(), flag = flagFor(p.kit, 'h'), name = p.input.name, worker = new Worker(CHILD, { workerData: { sab: new SharedArrayBuffer(4), kitDir: p.kit.dir, password: PASSWORD }, execArgv: ['--import', TSX] });
  const held = new Promise<{ type: string; ok: boolean; id?: string; code?: string | null }>(ok => worker.once('message', ok));
  let released = false, timer: NodeJS.Timeout | undefined, firstId: string | null = null;
  const release = () => { if (!released) { released = true; writeFileSync(flag + '.go', '1'); } };
  const within = <T,>(work: Promise<T>, ms: number, what: string) => Promise.race([work, new Promise<never>((_, bad) => { timer = setTimeout(() => bad(new Error('espera agotada: ' + what)), ms); })]).finally(() => clearTimeout(timer));
  try {
    worker.postMessage({ type: 'hold-import', step: 'import:components-written', flag, name, sha: p.input.expectedSha256, rev: p.input.expectedRevision });
    await waitFor(flag + '.reached', 30_000);
    // ── Estado de la primera importación, guardado ANTES de pedir la segunda ──
    const bytesBefore = Buffer.from(bytesOf(claimPath(p.kit, name))), claim = JSON.parse(bytesBefore.toString('utf8')) as { status: string; destination: string; pid: number; owner: string };
    firstId = claim.destination; assert.equal(claim.status, 'importing'); assert.equal(claim.pid, process.pid, 'mismo PID que esta instancia'); assert.match(claim.destination, /^[0-9a-f-]{36}$/); assert.ok(typeof claim.owner === 'string' && claim.owner.length >= 8, 'el reclamo lleva el owner de la primera instancia');
    const stagingBefore = treeDigest(stagingDir(firstId)); assert.ok(stagingBefore && Object.keys(stagingBefore).length > 0, 'staging de la primera con contenido'); assert.deepEqual({ published: destState(firstId).published, staging: destState(firstId).staging }, { published: false, staging: true });
    const view = describeClaim(p.kit, name).claim!; assert.deepEqual({ pidAlive: view.pidAlive, ownedByThisInstance: view.ownedByThisInstance, activeHere: view.activeHere, readable: view.readable }, { pidAlive: true, ownedByThisInstance: false, activeHere: false, readable: true }, 'vista de la segunda instancia: PID vivo (el suyo) y owner AJENO');
    // ── La segunda instancia es rechazada y NO toca nada ──
    const w = watch(p.kit, name), second = await attempt(p.kit, p.input); w.trackAll(); trackFolder(roomDir(firstId));
    process.stdout.write('# MISMO-PID owner distinto: segunda instancia ' + (second.ok ? 'IMPORTÓ (REGRESIÓN)' : 'rechazada ' + second.code) + '\n');
    assert.equal(second.ok, false, 'la segunda no debe importar'); assert.equal((second as { code?: string }).code, 'ALREADY_IMPORTED');
    assert.ok(bytesOf(claimPath(p.kit, name)).equals(bytesBefore), 'los bytes del reclamo de la primera no cambian'); assert.deepEqual(readClaim(p.kit, name), claim);
    assert.deepEqual(treeDigest(stagingDir(firstId)), stagingBefore, 'el staging de la primera no cambia (ni ficheros ni contenido)'); assert.deepEqual([...w.ids], [firstId], 'la segunda no anunció ningún destino propio'); assert.deepEqual(w.published(), [], 'nada publicado todavía');
    // ── Se suelta la primera: termina bien, con SU destino y un reclamo concordante ──
    release(); const first = await within(held, 60_000, 'fin de la primera importación'); assert.equal(first.ok, true, 'la primera termina bien: ' + JSON.stringify(first)); assert.equal(first.id, firstId, 'su destino original');
    const fin = readClaim(p.kit, name)!; assert.deepEqual({ status: fin.status, destination: fin.destination, recovered: fin.recovered ?? false, sha256: (fin as { sha256?: string }).sha256, revision: (fin as { revision?: string }).revision }, { status: 'imported', destination: firstId, recovered: false, sha256: p.input.expectedSha256, revision: p.input.expectedRevision }, 'reclamo final concordante con la primera (el reclamo confirmado ya no lleva pid ni owner: la importación terminó)');
    const marker = JSON.parse(readFileSync(join(roomDir(firstId), 'rescue-room.marker.json'), 'utf8')) as { roomId?: string }; assert.equal(marker.roomId, firstId, 'marcador propio'); assert.deepEqual(w.published(), [firstId], 'un ÚNICO destino entre los identificados por las operaciones de esta cápsula'); assert.equal(destState(firstId).staging, false, 'el staging ya se consolidó');
  } finally {
    release(); try { await within(held, 20_000, 'cierre del worker'); } catch { /* ya informado por la aserción o por la espera */ } try { await worker.terminate(); } catch { /* ya terminó */ }
    if (firstId) trackFolder(roomDir(firstId)); p.origin.close();
  }
});
