import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = process.env.CANDIDATE_TEST_SCRIPT ? path.resolve(process.env.CANDIDATE_TEST_SCRIPT) : path.join(root, 'scripts/prepare-release-candidate.mjs');
const parent = path.join(root, 'tests/.tmp/assets057'); fs.mkdirSync(parent, { recursive: true });
const entries = ['server/main.ts','server/runtime.ts','server/drill-worker.ts','server/team/main.ts','server/team/copilot-worker.ts','server/team/pilot-alias.ts'];
const tests = ['continuity-lab','response-queue','response-queue-api','capture-comparison','capture-comparison-api','recovery-preflight','recovery-preflight-cli','customer-combobox','ui-journeys','design-tokens'];
const secrets = ['QA057_PASSPHRASE','QA057_PRIVATE_KEY','QA057_CREDENTIALS','QA057_COOKIE','QA057_AUTH_HEADER','QA057_ACCESS_KEY','QA057_PASSWD','QA057_BEARER','QA057_API_KEY','QA057_TOKEN','QA057_BENIGN'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function write(folder, name, bytes) { const p = path.join(folder, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes, { flag: 'wx' }); }
function workspace() {
  const folder = path.join(parent, 'workspace-' + randomUUID()); fs.mkdirSync(folder);
  write(folder, 'scripts/prepare-release-candidate.mjs', fs.readFileSync(script));
  write(folder, 'scripts/block-external.cjs', fs.readFileSync(path.join(root, 'scripts/block-external.cjs')));
  write(folder, 'tools/coordination/core.mjs', fs.readFileSync(path.join(root, 'tools/coordination/core.mjs')));
  // Existing local dependencies only, no downloads or changes under node_modules. Keep fixture/evidence, no recursive delete.
  fs.symlinkSync(fs.realpathSync(path.join(root, 'node_modules')), path.join(folder, 'node_modules'), 'junction');
  write(folder, 'package.json', '{"type":"module","private":true}');
  write(folder, 'tsconfig.json', JSON.stringify({compilerOptions:{target:'ES2023',module:'ESNext',moduleResolution:'Bundler',noEmit:true,skipLibCheck:true,types:['node']},include:['src','server','shared','scripts','tests','*.ts']}));
  write(folder, 'vite.config.ts', 'export default {build:{outDir:"dist"}};');
  write(folder, 'playwright.config.ts', 'export default {};');
  write(folder, 'index.html', '<!doctype html><title>Fixture mecánico</title><script type="module" src="/src/main.ts"></script>');
  write(folder, 'src/main.ts', 'document.title="Fixture mecánico";');
  for (const p of entries) write(folder, p, 'export const fixture = true;');
  for (const name of tests) write(folder, 'tests/' + name + '.test.ts', name === tests[0] ? 'console.log("CANARY_FLAGS:"+JSON.stringify(Object.fromEntries('+JSON.stringify(secrets)+'.map(k=>[k,k in process.env]))));' : 'export {};');
  return folder;
}
function prepare(folder, expectedStatus = 0) {
  const allowed = new Set(['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','lc_all','lc_ctype','tz']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
  for (const key of secrets) env[key] = 'invented-value-' + key;
  const child = spawnSync(process.execPath, ['scripts/prepare-release-candidate.mjs','--prepare'], {cwd:folder,env,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
  write(folder, 'execution.log', (child.stdout??'')+(child.stderr??''));
  assert.equal(child.status, expectedStatus, 'Unexpected candidate exit status; inspect its own execution.log: '+folder);
  const candidates = path.join(folder,'tests/.tmp/release-candidates'), ids = fs.readdirSync(candidates);
  assert.equal(ids.length,1); const candidate = path.join(candidates,ids[0]);
  return {manifest:JSON.parse(fs.readFileSync(path.join(candidate,'manifest.json'))),candidate,child};
}
let result, fixture, publicFiles;
test('public assets of any extension or case are captured and verified byte-for-byte, excluded paths are explicitly blocked', {timeout:180000}, () => {
  fixture=workspace(); publicFiles = {
    'public/anim.gif':Buffer.from([71,73,70,56,57,97]),'public/LOGO.PNG':Buffer.from([0,255,1,128]),
    'public/site.webmanifest':Buffer.from('{"name":"fixture"}'),'public/robots.txt':Buffer.from('User-agent: *'),
    'public/doc.pdf':Buffer.from('%PDF-fixture'),'public/lib/app.wasm':Buffer.from([0,97,115,109]),
    'public/extensionless':Buffer.from('opaque bytes'),'public/odd.custom053':Buffer.from([0,123,255])};
  for(const [name,bytes]of Object.entries(publicFiles))write(fixture,name,bytes);
  write(fixture,'public/.excluded.json','{"private-fixture":true}'); result=prepare(fixture);
  const m=result.manifest;
  for(const [name,bytes]of Object.entries(publicFiles)){
    const entry=m.files.find(f=>f.path===name);assert.ok(entry,'missing manifest entry: '+name);assert.equal(entry.sha256,sha(bytes));
    assert.deepEqual(fs.readFileSync(path.join(m.snapshot,name)),bytes);assert.deepEqual(fs.readFileSync(path.join(m.runtime,'dist',name.slice(7))),bytes);
  }
  assert.deepEqual(m.excludedPublicPaths,['public/.excluded.json']);
  assert.ok(m.blockers.includes('PUBLIC_PATH_EXCLUDED:public/.excluded.json'));
  assert.deepEqual(m.publicAssetCoverage,{captured:Object.keys(publicFiles).length,excluded:1,complete:false});
  assert.equal(m.snapshotStable,true);assert.equal(m.liveSourcesStillMatch,true);
  assert.deepEqual([m.approved,m.deployed,m.releaseEligible],[false,false,false]);
});
test('all invented credential-shaped and benign variables are absent from check children under an OS allowlist', () => {
  assert.ok(result,'previous fixture required'); const log=fs.readFileSync(path.join(result.candidate,'logs/node-integration.log'),'utf8');
  const flags=JSON.parse(log.split(/\r?\n/).find(line=>line.startsWith('CANARY_FLAGS:')).slice('CANARY_FLAGS:'.length));
  for(const key of secrets)assert.equal(flags[key],false,'Unexpected inherited variable: '+key);
  for(const key of secrets)assert.ok(!log.includes('invented-value-'+key));
  for(const output of ['server.mjs','runtime.mjs','drill.mjs','team.mjs','copilot-worker.mjs','pilot-alias.mjs']){
    assert.ok(result.manifest.checks.some(check=>check.name==='bundle-'+output&&check.ok));
    assert.ok(fs.existsSync(path.join(result.manifest.runtime,output)));
    assert.ok(fs.existsSync(path.join(result.candidate,'logs/bundle-'+output+'.log')),'each bundle uses the sanitized runner');
  }
});
test('source and opaque public bytes remain intact after preparation; artifact hashes still match disk', () => {
  assert.ok(result);for(const [name,bytes]of Object.entries(publicFiles))assert.deepEqual(fs.readFileSync(path.join(fixture,name)),bytes);
  for(const entry of result.manifest.artifacts)assert.equal(sha(fs.readFileSync(path.join(result.manifest.runtime,entry.path))),entry.sha256);
  assert.equal(sha(fs.readFileSync(path.join(fixture,'scripts/prepare-release-candidate.mjs'))),sha(fs.readFileSync(script)));
});

test('a broken public root junction stops the candidate before it can certify asset coverage', {timeout:180000}, t => {
  const folder = workspace();
  const publicRoot = path.join(folder, 'public');
  try {
    fs.symlinkSync(path.join(folder, 'missing-public-target'), publicRoot, 'junction');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    t.skip('Cannot create a junction in this environment: ' + error.code);
    return;
  }
  assert.equal(fs.lstatSync(publicRoot).isSymbolicLink(), true);
  assert.equal(fs.existsSync(publicRoot), false, 'fixture target is absent');

  const { manifest } = prepare(folder, 1);
  assert.equal(manifest.state, 'incomplete');
  assert.match(manifest.error, /fuentes enlazadas/);
  assert.deepEqual(manifest.checks, []);
  assert.equal(manifest.publicAssetCoverage, undefined);
  assert.equal(manifest.releaseEligible, false);
});
