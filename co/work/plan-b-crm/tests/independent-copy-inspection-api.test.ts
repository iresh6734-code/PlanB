// QA081 · independent audit of the COPY074 inspector (server side): byte oracle, transport limits, history oracle,
// persistence and registration boundary. See coordination/reviews/CLAUDE-QA-081.md for scope and limits.
// Set PLANB_QA081_SERVER_SRC to run the same assertions against a mutated copy of server/copy-inspection.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {encodePortable} from '../server/crypto.js';
import {Recovery, simulatedRemote} from '../server/recovery.js';
import {makeFixture} from '../shared/fixtures.js';
import {
  CopyReviewSchema, HEADERS, MIB, MAX_COPY_REVIEW_BYTES, REVIEW_URL, activate, applyOp, evidence, exportEncrypted, exportPlain, expectedDifference, getContext,
  inspectorModule, install, makeProductionLike, makeSecret, padTo, persistentDigests, post, replay, review, sha256, type Install, type Op,
} from './helpers/independent-copy-inspection-harness.js';

const pw = () => 'qa081-' + randomUUID();
const parse = (a: {json: any}) => CopyReviewSchema.parse(a.json);
const noCoverage = (a: {json: any}) => assert.equal(a.json.coverage, null);
async function withInstall<T>(fn: (i: Install) => Promise<T>, options?: Parameters<typeof install>[0]) { const i = await install(options); try { return await fn(i); } finally { await i.close(); } }

// ======================= A · byte oracle ===============================================================
test('A1 digest is over the exact uploaded bytes for whitespace, CRLF, pretty, non-ASCII, truncated, empty and BOM variants', async () => {
  await withInstall(async i => {
    i.store.saveRecord('contacts', {lastname: 'Núñez 😀 日本語 ø'}, 'contact-1'); // non-ASCII and astral characters inside the document
    const plain = await exportPlain(i), doc = JSON.parse(plain.toString('utf8'));
    const variants: Record<string, Buffer> = {
      compact: plain,
      trailingWhitespace: Buffer.concat([plain, Buffer.from(' \t\n  ')]),
      prettyLF: Buffer.from(JSON.stringify(doc, null, 2)),
      prettyCRLF: Buffer.from(JSON.stringify(doc, null, 2).replace(/\n/g, '\r\n') + '\r\n'),
      escapedUnicode: Buffer.from(JSON.stringify(doc).replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))),
    };
    const seenHashes = new Set<string>(), revisions = new Set<string>();
    for (const [name, bytes] of Object.entries(variants)) {
      const expected = sha256(bytes), a = await review(i, bytes), r = parse(a);
      assert.equal(a.status, 200, name);
      assert.equal(r.artifact.sha256, expected, name + ': digest must equal node:crypto over the original Buffer');
      assert.equal(r.inspection.artifactHash, expected, name);
      assert.equal(r.artifact.bytes, bytes.length, name + ': byte length (not character count)');
      assert.equal(r.coverage!.status, 'matches-reference', name + ': semantically identical document must still match');
      seenHashes.add(r.artifact.sha256); revisions.add(r.coverage!.backupRevision!);
      evidence('api-bytes.jsonl', {variant: name, bytes: bytes.length, sha256: expected, status: r.inspection.status, coverage: r.coverage!.status});
    }
    assert.equal(seenHashes.size, Object.keys(variants).length, 'five byte-different encodings must yield five different digests');
    assert.equal(revisions.size, 1, 'and one semantic revision: the byte digest is not the semantic identity');
    assert.ok(Buffer.byteLength(JSON.stringify(doc.records[0]), 'utf8') >= 0 && Buffer.from(plain).includes(Buffer.from('😀')), 'fixture really carries multi-byte characters');
    assert.ok(plain.length !== plain.toString('utf8').length, 'byte length differs from UTF-16 length (guards a length-by-characters bug)');
  });
});

test('A2 invalid or unusual byte sequences: hash stays exact or the request is refused, never a green result', async () => {
  await withInstall(async i => {
    const plain = await exportPlain(i); // export may write its own metadata by design: state is captured only AFTER it
    // R2: digests are taken after exportPlain and BEFORE each inspection request, then compared AFTER that request's result (never two reads of the same final state).
    const guarded = async (bytes: Buffer, label: string) => {
      const before = persistentDigests(i.store), answer = await review(i, bytes);
      assert.deepEqual(persistentDigests(i.store), before, label + ': inspecting this file must not change any table of the real Store');
      return answer;
    };
    const truncated = plain.subarray(0, plain.length - 17);
    let a = await guarded(truncated, 'truncated'), r = parse(a);
    assert.equal(r.artifact.sha256, sha256(truncated)); assert.equal(r.inspection.status, 'invalid'); assert.equal(r.inspection.issues[0].code, 'INVALID_JSON'); noCoverage(a);

    const empty = Buffer.alloc(0); a = await guarded(empty, 'empty'); r = parse(a);
    assert.equal(r.artifact.sha256, sha256(empty)); assert.equal(r.artifact.bytes, 0); assert.equal(r.inspection.status, 'invalid'); noCoverage(a);

    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain]); a = await guarded(bom, 'bom'); r = parse(a);
    assert.equal(r.artifact.sha256, sha256(bom), 'BOM bytes are part of the digest');
    if (r.inspection.status === 'valid') assert.equal(r.artifact.bytes, plain.length + 3);
    else { assert.equal(r.inspection.issues[0].code, 'INVALID_JSON'); noCoverage(a); }
    evidence('api-bytes.jsonl', {variant: 'bom', status: r.inspection.status, issue: r.inspection.issues[0]?.code ?? null});

    const bad: Record<string, Buffer> = {
      trailingGarbage: Buffer.concat([plain, Buffer.from([0xff, 0xfe])]),
      overlong: Buffer.concat([plain, Buffer.from([0xc0, 0x80])]),
      surrogateEncoded: Buffer.concat([plain, Buffer.from([0xed, 0xa0, 0x80])]),
      truncatedMultibyte: Buffer.concat([plain, Buffer.from([0xe2, 0x82])]),
      lone: Buffer.from([0x80]),
    };
    for (const [name, bytes] of Object.entries(bad)) {
      const x = await guarded(bytes, name);
      assert.equal(x.status, 422, name + ' must be refused as non-UTF-8, not hashed as if valid');
      assert.equal(x.json?.coverage, undefined, name); assert.ok(!/matches-reference/.test(x.text), name);
    }
  });
});

test('A3 request body: only encoded/password/referenceRevision; strict codes; no secret ever echoed', async () => {
  await withInstall(async i => {
    const rev = (await getContext(i)).revision!, secret = makeSecret();
    const ok = Buffer.from('{}').toString('base64'); // 'e30='
    const base = (extra: Record<string, unknown> = {}) => JSON.stringify({encoded: ok, referenceRevision: rev, ...extra});
    const cases: [string, string, number[]][] = [
      ['unpadded base64', base({encoded: 'e30'}), [422]],
      ['excess padding', base({encoded: 'e30=='}), [422]],
      ['whitespace inside base64', base({encoded: 'e3 0='}), [422]],
      ['trailing newline in base64', base({encoded: 'e30=\n'}), [422]],
      ['url-safe alphabet', base({encoded: Buffer.from([0xfb, 0xff]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')}), [422]],
      ['non-ASCII in base64', base({encoded: 'e30é'}), [422]],
      ['encoded number', base({encoded: 12345}), [422]], ['encoded null', base({encoded: null}), [422]], ['encoded array', base({encoded: [ok]}), [422]], ['encoded object', base({encoded: {a: ok}}), [422]],
      ['password number', base({password: 5}), [422]], ['password null', base({password: null}), [422]], ['password array', base({password: ['x']}), [422]], ['password too long', base({password: 'x'.repeat(201)}), [422]],
      ['revision number', base({referenceRevision: 5}), [422]], ['revision uppercase hex', base({referenceRevision: rev.toUpperCase()}), [422]],
      ['revision 63 chars', base({referenceRevision: rev.slice(1)}), [422]], ['revision 65 chars', base({referenceRevision: rev + 'a'}), [422]],
      ['revision non-hex', base({referenceRevision: 'g'.repeat(64)}), [422]], ['revision empty', base({referenceRevision: ''}), [422]],
      ['revision missing', JSON.stringify({encoded: ok}), [422]],
      ['extra filePath', base({filePath: 'C:/private/qa081.json'}), [422]], ['extra path', base({path: '../x'}), [422]], ['extra target', base({target: {accountId: 'x', isTestData: true}}), [422]],
      ['extra url', base({url: 'http://127.0.0.1:1/x'}), [422]], ['extra name', base({name: 'x.json'}), [422]],
      ['array body', '[]', [400, 422]], ['string body', '"x"', [400, 422]], ['null body', 'null', [400, 422]],
      ['__proto__ key', '{"__proto__":{"a":1},"encoded":"e30=","referenceRevision":"' + rev + '"}', [400, 422]],
    ];
    for (const [name, payload, allowed] of cases) {
      const a = await post(i, payload);
      assert.ok(allowed.includes(a.status), name + ' → ' + a.status + ' ' + a.text.slice(0, 120));
      assert.ok(!/matches-reference|"coverage"/.test(a.text), name + ': refusal must carry no verdict');
      evidence('api-body.jsonl', {case: name, status: a.status});
    }
    // empty body and missing content type
    const empty = await i.app.inject({method: 'POST', url: REVIEW_URL, headers: {...HEADERS, 'content-type': 'application/json'}, payload: ''});
    assert.ok([400, 422].includes(empty.statusCode), 'empty body ' + empty.statusCode);
    const noType = await i.app.inject({method: 'POST', url: REVIEW_URL, headers: HEADERS, payload: base()});
    assert.ok(noType.statusCode >= 400 && noType.statusCode < 500, 'no content type ' + noType.statusCode);
    // empty file content is a well-formed request: honest invalid report, no coverage
    const emptyFile = await review(i, Buffer.alloc(0)); assert.equal(emptyFile.status, 200); noCoverage(emptyFile);

    // The secret in every position a client controls as a VALUE: it must never come back.
    const probes: [string, string][] = [
      ['password on plaintext file', base({password: secret})], ['password on garbage extra', base({password: secret, filePath: secret})],
      ['secret as encoded', base({encoded: secret})], ['secret as revision', base({referenceRevision: secret})],
      ['secret in extra field value', base({filePath: secret})], ['secret in nested extra', base({target: {accountId: secret}})],
      ['secret as password type error', base({password: [secret]})],
    ];
    for (const [name, payload] of probes) { const a = await post(i, payload); assert.ok(!a.text.includes(secret), name + ': secret value echoed'); }
    // encrypted file + wrong password (the secret) → bounded invalid report without echo
    const enc = Buffer.from(encodePortable(i.store.bundle(), pw()));
    const wrong = await review(i, enc, {password: secret}); assert.equal(wrong.status, 200); assert.equal(parse(wrong).inspection.issues[0].code, 'DECRYPT_FAILED'); assert.ok(!wrong.text.includes(secret)); noCoverage(wrong);
    // informational: is an extra KEY NAME reflected? (not asserted; the brief marks VALUES as the secret)
    const keyProbe = await post(i, base({[secret]: 1}));
    evidence('api-body.jsonl', {case: 'secret as extra key name', status: keyProbe.status, keyNameReflected: keyProbe.text.includes(secret)});
  });
});

test('A4 stale or absent reference revision is a 409 and never produces a verdict', async () => {
  await withInstall(async i => {
    const bytes = await exportPlain(i), rev = (await getContext(i)).revision!;
    assert.equal((await review(i, bytes, {revision: 'a'.repeat(64)})).status, 409, 'unknown revision');
    assert.equal((await review(i, bytes, {revision: null})).status, 409, 'null revision while a space is active');
    i.store.saveRecord('contacts', {phone: 'qa081-' + randomUUID().slice(0, 8)}, 'contact-1');
    const before = persistentDigests(i.store), a = await review(i, bytes, {revision: rev});
    assert.equal(a.status, 409, 'revision read before a real edit'); assert.ok(!/matches-reference/.test(a.text));
    assert.deepEqual(persistentDigests(i.store), before, 'a refused request must not write');
  });
});

// ======================= A5 · size limits =============================================================
function validPadded(i: Install, total: number) { return exportPlain(i).then(plain => padTo(plain, total)); }
test('A5 limits: 21 MiB accepted, exactly 32 MiB accepted, 32 MiB+1 and +2 refused, >48 MiB HTTP body refused; legacy 20 MiB limit still real elsewhere', async () => {
  await withInstall(async i => {
    for (const [name, total] of [['21MiB', 21 * MIB], ['32MiB-exact', MAX_COPY_REVIEW_BYTES]] as const) {
      const bytes = await validPadded(i, total), t0 = Date.now(), a = await review(i, bytes);
      assert.equal(a.status, 200, name + ' ' + a.text.slice(0, 100));
      const r = parse(a);
      assert.equal(r.artifact.sha256, sha256(bytes)); assert.equal(r.artifact.bytes, total);
      assert.equal(r.inspection.status, 'valid'); assert.equal(r.coverage!.status, 'matches-reference');
      evidence('api-limits.jsonl', {case: name, decodedBytes: total, base64Chars: Math.ceil(total / 3) * 4, status: a.status, sha256: r.artifact.sha256, ms: Date.now() - t0});
    }
    for (const extra of [1, 2]) {
      const total = MAX_COPY_REVIEW_BYTES + extra, bytes = await validPadded(i, total), a = await review(i, bytes);
      assert.ok(a.status === 413 || a.status === 422, 'max+' + extra + ' → ' + a.status);
      assert.ok(!/matches-reference|"artifact"/.test(a.text));
      evidence('api-limits.jsonl', {case: 'max+' + extra, decodedBytes: total, base64Chars: Math.ceil(total / 3) * 4, status: a.status, sha256: sha256(bytes)});
    }
    // HTTP body above the 48 MiB route limit: a JSON string field so the body itself is oversize.
    const huge = JSON.stringify({encoded: 'A'.repeat(49 * MIB), referenceRevision: (await getContext(i)).revision});
    const big = await post(i, huge);
    assert.equal(big.status, 413, 'HTTP body limit'); assert.ok(!/matches-reference/.test(big.text));
    evidence('api-limits.jsonl', {case: 'http-body>48MiB', bodyBytes: huge.length, status: big.status});
    // control: the OLD global 20 MiB limit still applies to unrelated routes, so a route-level override is what lets 21 MiB through
    const legacy = await i.app.inject({method: 'POST', url: '/api/records/contacts', headers: {...HEADERS, 'content-type': 'application/json'}, payload: JSON.stringify({values: {firstname: 'x'.repeat(21 * MIB)}})});
    assert.equal(legacy.statusCode, 413, 'global bodyLimit stays at 20 MiB');
  });
});

test('A6 real Fastify listener: a 21 MiB upload crosses a real socket and is hashed exactly', async () => {
  await withInstall(async i => {
    const bytes = await validPadded(i, 21 * MIB), rev = (await getContext(i)).revision;
    await i.app.listen({host: '127.0.0.1', port: 4472}); // fails loudly if the port is busy; never kills a foreign process
    const body = JSON.stringify({encoded: bytes.toString('base64'), referenceRevision: rev});
    const res = await fetch('http://127.0.0.1:4472' + REVIEW_URL, {method: 'POST', headers: {'content-type': 'application/json'}, body});
    const json = await res.json() as any;
    assert.equal(res.status, 200, JSON.stringify(json).slice(0, 120));
    assert.equal(json.artifact.sha256, sha256(bytes)); assert.equal(json.artifact.bytes, 21 * MIB);
    evidence('api-limits.jsonl', {case: 'real-socket-21MiB', status: res.status, bodyBytes: body.length, sha256: json.artifact.sha256});
  });
});

// ======================= B · coverage with a known history ===============================================
const unique = () => randomUUID().slice(0, 8);
function script(original: string): Op[] {
  return [
    {kind: 'edit', entity: 'contacts', id: 'contact-1', field: 'phone', value: 'B-' + unique()},      // A→B
    {kind: 'edit', entity: 'contacts', id: 'contact-1', field: 'phone', value: original},             // B→A (value restored)
    {kind: 'edit', entity: 'contacts', id: 'contact-1', field: 'lastname', value: 'Ap-' + unique()},  // same ficha, other field
    {kind: 'create', entity: 'contacts', alias: 'n1', values: {firstname: 'Nuevo' + unique(), lastname: 'Qa081', email: 'nuevo.' + unique() + '@example.test', phone: '611 ' + unique()}},
    {kind: 'edit', entity: 'contacts', id: 'contact-2', field: 'email', value: 'c2.' + unique() + '@example.test'},
  ];
}
async function runHistory(n: number) {
  const i = await install(), initial = i.store.records().map(r => ({entity: r.entity, id: r.id, values: r.values as Record<string, unknown>}));
  const original = String(initial.find(r => r.id === 'contact-1')!.values.phone), ops = script(original), ids = new Map<string, string>();
  const copies: Buffer[] = [await exportPlain(i)];
  for (let k = 0; k < n; k++) { applyOp(i.store, ops[k], ids); copies.push(await exportPlain(i)); }
  return {i, initial, ops, copies};
}
for (const n of [2, 5]) {
  test(`B1 known history (n=${n}): every older copy reports exactly the operations it lacks, from the script, not from final values`, async () => {
    const {i, initial, ops, copies} = await runHistory(n);
    try {
      assert.equal((await getContext(i)).changes, n, 'reference operation count equals the script length');
      const before = persistentDigests(i.store), final = replay(initial, ops, n);
      for (let k = 0; k <= n; k++) {
        const a = await review(i, copies[k]), r = parse(a), want = expectedDifference(replay(initial, ops, k), final);
        assert.equal(r.inspection.summary!.changeLogEntries, k, `copy@${k} holds k operations`);
        assert.equal(r.coverage!.status, k === n ? 'matches-reference' : 'missing-local-changes', `copy@${k}`);
        assert.equal(r.coverage!.missingLocalChanges, n - k, `copy@${k} missing operations`);
        assert.deepEqual({m: r.coverage!.differences!.missingRecordsInBackup, e: r.coverage!.differences!.extraRecordsInBackup, c: r.coverage!.differences!.changedRecords},
          {m: want.missingRecordsInBackup, e: want.extraRecordsInBackup, c: want.changedRecords}, `copy@${k} record differences from the replayed script`);
        assert.equal(r.artifact.sha256, sha256(copies[k]));
        evidence('api-history.jsonl', {n, k, status: r.coverage!.status, missing: r.coverage!.missingLocalChanges, diff: r.coverage!.differences});
      }
      if (n === 2) { // A→B→A: final values equal initial values yet two operations are missing
        const r = parse(await review(i, copies[0]));
        assert.equal(r.coverage!.missingLocalChanges, 2); assert.equal(r.coverage!.differences!.changedRecords, 0);
      }
      assert.deepEqual(persistentDigests(i.store), before, 'inspecting nine files must not change any table');
    } finally { await i.close(); }
  });
}

test('B1b a copy that is NEWER than the reference (more operations) is never reported as missing operations or as a match', async () => {
  const {i, copies} = await runHistory(5);
  try {
    i.store.restoreBundle(JSON.parse(copies[2].toString('utf8'))); // reference goes back to 2 operations (new in-memory store)
    assert.equal((await getContext(i)).changes, 2);
    const r = parse(await review(i, copies[5]));
    assert.equal(r.inspection.summary!.changeLogEntries, 5);
    assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.missingLocalChanges, null);
    assert.notEqual(r.coverage!.status, 'matches-reference');
  } finally { await i.close(); }
});

test('B2 10,000 records: a datum kept at the very end is compared, and a copy truncated at the end is never a match', async () => {
  const snap: any = makeFixture(), base = snap.records.length, extra = 10000 - base;
  for (let k = 0; k < extra; k++) snap.records.push({entity: 'contacts', id: 'bulk-' + String(k).padStart(5, '0'), values: {firstname: 'N' + k, email: 'n' + k + '@example.test', phone: '+34 ' + k}});
  const lastId = 'bulk-' + String(extra - 1).padStart(5, '0'), lastOld = '+34 ' + (extra - 1), lastNew = 'END-' + unique();
  snap.manifest.expectedCounts.contacts = 24 + extra;
  await withInstall(async i => {
    assert.equal(i.store.records().length, 10000);
    const c0 = await exportPlain(i);
    i.store.saveRecord('contacts', {phone: lastNew}, lastId);
    const c1 = await exportPlain(i), ctx = await getContext(i);
    assert.equal(ctx.records, 10000); assert.equal(ctx.changes, 1);
    const t0 = Date.now(), old = parse(await review(i, c0)), cur = parse(await review(i, c1));
    assert.equal(old.inspection.summary!.activeRecords, 10000); assert.equal(old.inspection.summary!.counts.contacts, 24 + extra);
    assert.equal(old.coverage!.status, 'missing-local-changes'); assert.equal(old.coverage!.missingLocalChanges, 1); assert.equal(old.coverage!.differences!.changedRecords, 1);
    assert.equal(cur.coverage!.status, 'matches-reference'); assert.equal(cur.coverage!.differences!.changedRecords, 0);
    // truncated copy: drop one unreferenced record from the very end (records, snapshot, manifest count) and keep the change log
    const doc = JSON.parse(c1.toString('utf8')); const dropId = 'bulk-' + String(extra - 2).padStart(5, '0');
    doc.records = doc.records.filter((r: any) => r.id !== dropId); doc.snapshot.records = doc.snapshot.records.filter((r: any) => r.id !== dropId); doc.snapshot.manifest.expectedCounts.contacts -= 1;
    const cut = Buffer.from(JSON.stringify(doc)), a = await review(i, cut), r = parse(a);
    assert.equal(r.inspection.summary!.activeRecords, 9999);
    assert.notEqual(r.coverage?.status, 'matches-reference', 'a copy missing a record must never match');
    assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.differences!.missingRecordsInBackup, 1); assert.equal(r.coverage!.missingLocalChanges, null);
    evidence('api-history.jsonl', {case: '10k', ms: Date.now() - t0, bytes: c1.length, oldMissing: old.coverage!.missingLocalChanges, truncatedStatus: r.coverage!.status});
  }, {snapshot: snap});
});

test('B3 forks, revision-only changes, same capture id with other content, dates, portals and rehearsal vs production are not conflated', async () => {
  await withInstall(async i => {
    const ids = new Map<string, string>();
    const edit = (value: string, field = 'phone', id = 'contact-1'): Op => ({kind: 'edit', entity: 'contacts', id, field, value});
    const base = JSON.parse((await exportPlain(i)).toString('utf8')); // 0 operations
    // fork with equal length: copy = base+X, reference = base+Y
    applyOp(i.store, edit('X-' + unique()), ids); const forkX = await exportPlain(i);
    i.store.restoreBundle(base); applyOp(i.store, edit('Y-' + unique()), ids);
    let r = parse(await review(i, forkX));
    assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.missingLocalChanges, null, 'equal-length fork: no count may be invented');
    // fork where the copy is SHORTER than the reference but is not its prefix
    i.store.restoreBundle(base); applyOp(i.store, edit('Y2-' + unique()), ids); applyOp(i.store, edit('Z-' + unique(), 'lastname'), ids);
    r = parse(await review(i, forkX));
    assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.missingLocalChanges, null, 'shorter non-prefix copy must not report "missing 1"');
    // same operations, different revision: session id changed after the copy
    const taken = await exportPlain(i); i.store.set('sessionId', 'qa081-session-' + unique());
    r = parse(await review(i, taken));
    assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.differences!.sessionChanged, true); assert.equal(r.coverage!.missingLocalChanges, null);
    // same capture id (id + capturedAt), different content: snapshot name / spec title edited, operations equal
    const tweaked = JSON.parse((await exportPlain(i)).toString('utf8')); tweaked.snapshot.name = 'Renamed ' + unique();
    r = parse(await review(i, Buffer.from(JSON.stringify(tweaked))));
    assert.equal(r.coverage!.sameCapture, true); assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.differences!.snapshotChanged, true);
    const spec = JSON.parse((await exportPlain(i)).toString('utf8')); spec.spec.title = 'Spec ' + unique();
    r = parse(await review(i, Buffer.from(JSON.stringify(spec))));
    assert.equal(r.coverage!.status, 'different-revision'); assert.equal(r.coverage!.differences!.specChanged, true);
    // dates do not order revisions
    const cur = JSON.parse((await exportPlain(i)).toString('utf8'));
    cur.exportedAt = '1999-01-01T00:00:00.000Z'; r = parse(await review(i, Buffer.from(JSON.stringify(cur))));
    assert.equal(r.coverage!.status, 'matches-reference', 'an older export date alone does not change the revision');
    const older = JSON.parse(base ? JSON.stringify(base) : '{}'); older.exportedAt = '2099-01-01T00:00:00.000Z';
    r = parse(await review(i, Buffer.from(JSON.stringify(older))));
    assert.notEqual(r.coverage!.status, 'matches-reference', 'a far-future export date must not make an old copy current');
    // other portal → incompatible identity and coverage
    const other = JSON.parse((await exportPlain(i)).toString('utf8')); other.snapshot.source.accountId = 'qa081-other-portal'; other.returnState.accountId = 'qa081-other-portal';
    const before = persistentDigests(i.store);
    const a = await review(i, Buffer.from(JSON.stringify(other))); r = parse(a);
    assert.equal(r.inspection.status, 'incompatible'); assert.equal(r.inspection.targetIdentityMatches, false); assert.equal(r.coverage!.status, 'incompatible'); assert.equal(r.coverage!.sameSource, false);
    assert.equal(i.store.snapshot!.source.accountId, 'demo-agency'); assert.deepEqual(persistentDigests(i.store), before);
  });
});

test('B4 rehearsal reference vs production copy and the reverse are incompatible; production vs production matches through an ephemeral cipher that leaves no trace', async () => {
  const password = pw();
  const prod = await install(); makeProductionLike(prod.store);
  const testInst = await install();
  try {
    const prodCopy = Buffer.from(await exportEncrypted(prod, password));
    const testCopy = await exportPlain(testInst);
    // rehearsal reference ← production copy
    let r = parse(await review(testInst, prodCopy, {password}));
    assert.notEqual(r.coverage?.status, 'matches-reference'); assert.equal(r.inspection.status, 'incompatible');
    // production reference ← rehearsal copy
    r = parse(await review(prod, testCopy));
    assert.notEqual(r.coverage?.status, 'matches-reference'); assert.equal(r.inspection.status, 'incompatible');
    // production reference ← the same production copy
    const before = persistentDigests(prod.store), ctx = await getContext(prod);
    const a = await review(prod, prodCopy, {password}); r = parse(a);
    assert.equal(ctx.isTestData, false); assert.equal(r.coverage!.status, 'matches-reference'); assert.equal(r.coverage!.backupRevision, ctx.revision, 'the encrypted copy decodes to the same revision as the live reference');
    assert.ok(!a.text.includes('enc1:') && !a.text.includes('planb-encrypted'), 'no ciphertext or envelope in the report');
    assert.ok(!a.text.includes(password)); assert.deepEqual(persistentDigests(prod.store), before, 'ephemeral reference cipher left no persistent state');
    // a production plaintext copy is refused, not compared
    const plainProd = Buffer.from(JSON.stringify(prod.store.bundle())); r = parse(await review(prod, plainProd)); assert.equal(r.inspection.issues.some(x => x.code === 'PRODUCTION_REQUIRES_ENCRYPTION'), true); assert.equal(r.coverage, null);
  } finally { await prod.close(); await testInst.close(); }
});

test('B5 pending candidate is not the active reference; integrity-only mode invents no target; a later active space makes the null revision stale', async () => {
  await withInstall(async i => {
    const copy = await exportPlain(i), ctx = await getContext(i);
    const candidate = makeFixture('distribution'); i.store.importSnapshot(candidate, true);
    assert.ok(i.store.candidate, 'setup really created a pending candidate'); // eslint-disable-line
    const now = await getContext(i); assert.equal(now.revision, ctx.revision); assert.equal(now.accountId, 'demo-agency');
    assert.equal(parse(await review(i, copy)).coverage!.status, 'matches-reference');
  });
  const empty = await install({active: false}), source = await install();
  try {
    const raw = await exportPlain(source), ctx = await getContext(empty);
    assert.equal(ctx.available, false); assert.equal(ctx.revision, null); assert.equal(ctx.reason, 'NO_ACTIVE_COPY');
    const a = await review(empty, raw), r = parse(a);
    assert.equal(r.inspection.status, 'valid'); assert.equal(r.inspection.targetIdentityMatches, null); noCoverage(a);
    assert.ok(r.inspection.issues.some(x => x.code === 'TARGET_NOT_CHECKED')); assert.ok(!r.inspection.issues.some(x => x.code === 'TARGET_MISMATCH'));
    assert.equal(r.reference.available, false);
    const other = JSON.parse(raw.toString('utf8')); other.snapshot.source.accountId = 'anything-at-all'; other.returnState.accountId = 'anything-at-all';
    const b = parse(await review(empty, Buffer.from(JSON.stringify(other)))); assert.equal(b.inspection.targetIdentityMatches, null, 'no destination identity is invented');
    empty.store.restoreBundle(JSON.parse(raw.toString('utf8'))); // a NEW in-memory store activates a space afterwards
    assert.equal((await review(empty, raw, {revision: null})).status, 409, 'the previous null revision is now stale');
  } finally { await empty.close(); await source.close(); }
});

test('B6 a reference above the comparison limit is integrity-only (no green), while the file is still hashed', async () => {
  const snap: any = makeFixture(), text = 'k'.repeat(10_000), extra = 1800; // 10,000 chars is the product's per-field ceiling
  for (let k = 0; k < extra; k++) snap.records.push({entity: 'contacts', id: 'fat-' + k, values: {firstname: 'F' + k, email: 'f' + k + '@example.test', lastname: text}});
  snap.manifest.expectedCounts.contacts = 24 + extra;
  const small = await install();
  try {
    const raw = await exportPlain(small);
    await withInstall(async big => {
      const ctx = await getContext(big);
      assert.equal(ctx.available, false); assert.equal(ctx.reason, 'REFERENCE_TOO_LARGE'); assert.equal(ctx.revision, null);
      const before = persistentDigests(big.store), a = await review(big, raw), r = parse(a);
      assert.equal(r.artifact.sha256, sha256(raw)); assert.equal(r.inspection.status, 'valid'); noCoverage(a); assert.equal(r.inspection.targetIdentityMatches, null);
      assert.equal((await review(big, raw, {revision: 'a'.repeat(64)})).status, 409);
      assert.deepEqual(persistentDigests(big.store), before);
      evidence('api-history.jsonl', {case: 'reference-too-large', reason: ctx.reason});
    }, {snapshot: snap});
  } finally { await small.close(); }
});

test('B7 sending/uncertain plans and an old approval are normalised only in memory: no table, plan, watermark or custody changes', async () => {
  await withInstall(async i => {
    i.store.saveRecord('contacts', {phone: 'p-' + unique()}, 'contact-1');
    const engine = new Recovery(i.store), remote = {...simulatedRemote(i.store), source: 'hubspot' as const};
    const plan = await engine.preview(remote); engine.approve(plan.id);
    const approvedBytes = await exportPlain(i);
    const stored = () => JSON.stringify(i.store.get('recoveryPlan', null));
    assert.equal(JSON.parse(stored()).status, 'approved', 'precondition: the real store holds an approved plan');
    const sending = JSON.parse(approvedBytes.toString('utf8')); sending.returnState.plan.operations[0].status = 'sending';
    const uncertain = JSON.parse(approvedBytes.toString('utf8')); uncertain.returnState.plan.operations[0].status = 'uncertain';
    const planBefore = stored(), digests = persistentDigests(i.store), watermark = i.store.get('returnWatermark:hubspot', 0), custody = i.store.get('recoveryCopy', null);
    const old = parse(await review(i, approvedBytes));
    assert.equal(old.inspection.summary!.approvalWouldBeReset, true); assert.ok(old.inspection.issues.some(x => x.code === 'APPROVAL_RESET'));
    for (const doc of [sending, uncertain]) {
      const r = parse(await review(i, Buffer.from(JSON.stringify(doc))));
      assert.equal(r.inspection.summary!.uncertainOperationsAfterRestore, 1); assert.ok(r.inspection.issues.some(x => x.code === 'REMOTE_RESULT_UNCERTAIN'));
      assert.notEqual(r.coverage!.status, 'matches-reference', 'a copy whose plan state differs cannot be a match');
    }
    assert.equal(stored(), planBefore, 'real plan untouched (still approved, same operations)'); assert.equal(i.store.get('returnWatermark:hubspot', 0), watermark);
    assert.deepEqual(i.store.get('recoveryCopy', null), custody); assert.deepEqual(persistentDigests(i.store), digests);
  });
});

test('B8 registration boundary: the independent runtime has no route and the UI mounts the inspector only outside runtime', async () => {
  const main = fs.readFileSync('server/main.ts', 'utf8'), runtime = fs.readFileSync('server/runtime.ts', 'utf8'), home = fs.readFileSync('src/ContinuityHome.tsx', 'utf8');
  const users = fs.readdirSync('server').filter(f => f.endsWith('.ts') && fs.readFileSync('server/' + f, 'utf8').includes('registerCopyInspection')).sort();
  assert.deepEqual(users, ['copy-inspection.ts', 'main.ts'], 'only the generator entry point registers the routes');
  assert.ok(!/copy-inspection/.test(runtime)); assert.ok(/registerCopyInspection\(app,\s*store\)/.test(main));
  assert.ok(/\{!state\.runtime\?<CopyInspection\b/.test(home), 'ContinuityHome guards the block with !state.runtime');
  // dynamic: a runtime app that does not register the module answers 404 for both URLs
  const {createBaseApp} = await import('../server/app.js'); const path = await import('node:path');
  const {app} = await createBaseApp({root: path.resolve('tests/.tmp/qa081-no-workers'), staticDir: path.resolve('tests/.tmp/qa081-no-assets'), dbPath: ':memory:', runtime: true});
  try {
    assert.equal((await app.inject({url: '/api/v7/copy-review/context', headers: HEADERS})).statusCode, 404);
    assert.equal((await app.inject({method: 'POST', url: REVIEW_URL, headers: {...HEADERS, 'content-type': 'application/json'}, payload: '{}'})).statusCode, 404);
  } finally { await app.close(); }
  await inspectorModule(); // module under test loads
});
