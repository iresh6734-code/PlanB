import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleFile=process.env.CANDIDATE095_MODULE??path.join(root,'tools/releases/candidate-integrity.mjs');
const {inspectCandidate,CANDIDATE_LIMITS}=await import(pathToFileURL(moduleFile).href);
const base=path.join(root,'tests/.tmp/candidate-integrity095');fs.mkdirSync(base,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const rootFiles=['package.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html'];
const entries=['server/main.ts','server/runtime.ts','server/drill-worker.ts','server/team/main.ts','server/team/copilot-worker.ts','server/team/pilot-alias.ts'];
const backends=['server.mjs','runtime.mjs','drill.mjs','team.mjs','copilot-worker.mjs','pilot-alias.mjs'];
const sourceRoots=['src','shared','server','scripts','tests','tools','public'];
function fixture(){
  const workspaceRoot=fs.mkdtempSync(path.join(base,'ws-')),candidate='tests/.tmp/release-candidates/candidate-'+randomUUID(),folder=path.join(workspaceRoot,candidate),source=path.join(folder,'source'),runtime=path.join(folder,'runtime');fs.mkdirSync(source,{recursive:true});fs.mkdirSync(runtime);
  const m={format:'planb-candidate-v1',state:'compiled-and-node-verified',approved:false,deployed:false,releaseEligible:false,snapshotStable:true,liveSourcesStillMatch:false,folder:'C:/DO-NOT-FOLLOW-095',snapshot:'https://outside.invalid/NO-REQUEST',runtime:'C:/PRIVATE-DO-NOT-OPEN',files:[],artifacts:[],blockers:['SOURCE_NOT_ACCEPTED:FIXTURE:review','E2E_AND_VISUAL_REVIEW_PENDING'],checks:['typecheck','vite',...backends.map(n=>'bundle-'+n),'public-assets','node-integration'].map(name=>({name,ok:true,...(name==='public-assets'?{}:{exitCode:0})})),sourceSelection:{roots:sourceRoots,rootFiles,repositoryImage:false,excludedPaths:[{path:'tests/.tmp/',reason:'hidden-name'}]},fixturePurpose:'mechanical checker fixtures, never an actual product build'};
  const put=(kind,name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(value),file=path.join(kind==='source'?source:runtime,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});(kind==='source'?m.files:m.artifacts).push({path:name,bytes:bytes.length,sha256:sha(bytes)});return file;};
  for(const file of rootFiles)put('source',file,file.endsWith('.json')?'{}':'export {};');
  put('source','src/main.ts','export const fixtureOnly = true;');
  for(const file of entries)put('source',file,'export {};');
  const guard='// DO NOT EXECUTE: mechanical guard bytes';put('source','scripts/block-external.cjs',guard);
  for(const [name,bytes]of [['public/document.pdf',Buffer.from([0,255,1])],['public/data/catalog.JSON',Buffer.from('{"synthetic":true}')],['public/con espacio ñ.dat',Buffer.from([2,0,4])],['public/NOEXT',Buffer.alloc(0)]]){put('source',name,bytes);put('runtime','dist/'+name.slice(7),bytes);}
  for(const file of backends)put('runtime',file,'throw Error("CANDIDATE_CODE_MUST_NOT_EXECUTE");');
  put('runtime','block-external.cjs',guard);put('runtime','scripts/block-external.cjs',guard);
  put('runtime','dist/index.html','<!doctype html><html><body><script type="module" src="/assets/main.js"></script></body></html>');
  put('runtime','dist/assets/main.js','// mechanical, not compiled');
  const save=()=>fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(m));save();
  return {workspaceRoot,candidate,folder,source,runtime,m,save,put,check:()=>inspectCandidate({workspaceRoot,candidate})};
}
const code=r=>r.issues[0]?.code;
const changed=(f,kind,name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);fs.writeFileSync(path.join(kind==='source'?f.source:f.runtime,name),bytes);return bytes;};

test('423 · acepta activos opacos de src/assets y exige avisos idénticos en el runtime',()=>{
  for(const mode of ['missing','different','match']){
    const f=fixture();
    f.put('source','src/assets/fonts/local.woff2',Buffer.from([0,255,1,7]));
    f.put('source','src/assets/fonts/OFL.txt','Aviso sintético de prueba');
    if(mode!=='missing')f.put('runtime','dist/assets/fonts/OFL.txt',mode==='match'?'Aviso sintético de prueba':'otro texto');
    f.save();
    const report=f.check();
    if(mode==='match')assert.equal(report.state,'matches-manifest',JSON.stringify(report));
    else assert.equal(code(report),'ASSET_NOTICE_MAPPING');
  }
});

test('095 full inventory includes opaque assets/public data and both guards, without approving or following metadata paths',()=>{
  const f=fixture(),r=f.check();assert.equal(r.state,'matches-manifest');assert.equal(r.sourcesChecked,17);assert.equal(r.artifactsChecked,14);assert.equal(r.approvalGranted,false);assert.equal(r.deploymentPerformed,false);assert.equal(r.liveCheckout,'not_compared');assert.equal(r.manifestAuthenticity,'not_verified');assert.equal(r.buildEvidence,'declared_not_reexecuted');assert.equal(r.declaredBlockerCount,2);assert.equal(r.declaredExclusionCount,1);assert.ok(!JSON.stringify(r).includes('DO-NOT-FOLLOW'));assert.deepEqual(r.issues,[]);
});
test('095 changing source or backend bytes is detected rather than trusting compiled state',()=>{
  for(const[kind,name]of[['source','server/main.ts'],['runtime','team.mjs']]){const f=fixture();changed(f,kind,name,'CHANGED_BYTES');const r=f.check();assert.equal(r.state,'different');assert.equal(code(r),'HASH_OR_SIZE_MISMATCH');assert.equal(r.issues[0].path,name);assert.equal(r.approvalGranted,false);}
});
test('095 extra runtime files and private directories fail without reading their contents',()=>{
  for(const directory of [false,true]){const f=fixture(),extra=path.join(f.runtime,directory?'data/NEVER_READ.txt':'dist/unlisted.wasm');fs.mkdirSync(path.dirname(extra),{recursive:true});fs.writeFileSync(extra,'SYNTHETIC_PRIVATE_CANARY');const original=fs.openSync;let touched=false;fs.openSync=function(file,...args){if(String(file)===extra){touched=true;throw Error('unexpected file must not be read');}return original.call(this,file,...args);};try{const r=f.check();assert.equal(r.state,'different');assert.equal(code(r),directory?'UNEXPECTED_RUNTIME_DIRECTORY':'UNEXPECTED_RUNTIME_FILE');assert.equal(touched,false);}finally{fs.openSync=original;}}
});
test('095 a missing artifact or declared source is different, not a successful partial selection',()=>{
  for(const[kind,name]of[['runtime','runtime.mjs'],['source','src/main.ts']]){const f=fixture(),from=path.join(kind==='source'?f.source:f.runtime,name),to=path.join(f.folder,'preserved-missing-'+randomUUID());assert.ok(from.startsWith(f.folder+path.sep)&&to.startsWith(f.folder+path.sep));fs.renameSync(from,to);const r=f.check();assert.equal(r.state,'different');assert.equal(code(r),'MISSING_FILE');}
});
test('095 public mapping catches independently rehashed source/runtime disagreement',()=>{
  const f=fixture(),bytes=changed(f,'source','public/data/catalog.JSON','{"synthetic":"different"}'),item=f.m.files.find(x=>x.path==='public/data/catalog.JSON');Object.assign(item,{bytes:bytes.length,sha256:sha(bytes)});f.save();const r=f.check();assert.equal(r.state,'unverifiable');assert.equal(code(r),'PUBLIC_ASSET_MAPPING');
});
test('095 both runtime guards must agree with the captured guard even with self-consistent individual hashes',()=>{
  for(const name of ['block-external.cjs','scripts/block-external.cjs']){const f=fixture(),bytes=changed(f,'runtime',name,'OTHER_GUARD');Object.assign(f.m.artifacts.find(x=>x.path===name),{bytes:bytes.length,sha256:sha(bytes)});f.save();assert.equal(code(f.check()),'GUARD_MAPPING');}
});
test('095 path traversal, drive/UNC/ADS, encodings, reserved names and private source paths are refused before data reads',()=>{
  for(const value of ['../outside.ts','/server/x.ts','C:/private.ts','server\\x.ts','server/file.ts:stream','server/%2e%2e/x.ts','server/NUL.ts','server/x./y.ts','server/x /y.ts','server/.env.ts','server/Data/client.ts','server/Node_Modules/private.ts','public/dist/private.js','server/x\u0000.ts']){const f=fixture();f.m.files.push({path:value,bytes:1,sha256:'a'.repeat(64)});f.save();const r=f.check();assert.equal(r.state,'unverifiable',value);assert.equal(r.sourcesChecked,0,value);assert.ok(!JSON.stringify(r).includes(value),'no raw unsafe input in error');}
});
test('095 duplicates and case aliases are rejected in both lists',()=>{
  for(const list of ['files','artifacts'])for(const alias of [false,true]){const f=fixture(),entry=f.m[list].find(x=>x.path===(list==='files'?'src/main.ts':'dist/document.pdf')),name=alias?(list==='files'?'src/MAIN.ts':'dist/DOCUMENT.pdf'):entry.path;f.m[list].push({...entry,path:name});f.save();const r=f.check();assert.equal(r.state,'unverifiable');assert.equal(code(r),'DUPLICATE_PATH');}
});
test('095 incomplete checks, approval claims, contradictory selection and malformed records cannot manufacture readiness',()=>{
  for(const edit of [m=>m.state='incomplete',m=>m.approved=true,m=>m.releaseEligible=true,m=>m.checks.pop(),m=>m.checks[0].ok=false,m=>m.checks[0].exitCode=1,m=>m.checks.push(m.checks[0]),m=>m.files[0].bytes=-1,m=>m.files[0].sha256='A'.repeat(64),m=>m.files[0].bytes=NaN,m=>m.sourceSelection.repositoryImage=true,m=>m.sourceSelection.excludedPaths.push({path:'public/data/',reason:'excluded-name'}),m=>m.blockers='not-a-list']){const f=fixture();edit(f.m);f.save();const r=f.check();assert.equal(r.state,'unverifiable');assert.equal(r.approvalGranted,false);assert.equal(r.releaseReadiness,'not_assessed');}
});
test('095 malformed/oversized manifest and bad options report bounded errors without echoing content',()=>{
  for(const text of ['SYNTHETIC_SECRET_BAD_JSON','[]','null','"not-an-object"',' '.repeat(CANDIDATE_LIMITS.metadataBytes+1)]){const f=fixture();fs.writeFileSync(path.join(f.folder,'manifest.json'),text);const r=f.check();assert.equal(r.state,'unverifiable');assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SECRET'));}
  for(const args of [null,[],42,{candidate:'C:/private'},{candidate:'../outside'},{workspaceRoot:'C:/not-authorized',candidate:'tests/.tmp/release-candidates/candidate-'+randomUUID()}])assert.equal(inspectCandidate(args).state,'unverifiable');
});
test('095 limits are checked before opening oversized content and exact source boundary stays verifiable',()=>{
  const f=fixture(),large=Buffer.alloc(CANDIDATE_LIMITS.sourceBytes,65);changed(f,'source','src/main.ts',large);Object.assign(f.m.files.find(x=>x.path==='src/main.ts'),{bytes:large.length,sha256:sha(large)});f.save();assert.equal(f.check().state,'matches-manifest');
  fs.appendFileSync(path.join(f.source,'src/main.ts'),'B');assert.equal(code(f.check()),'FILE_LIMIT');
  const many=fixture();many.m.files=Array.from({length:2001},(_,i)=>({path:'src/f'+i+'.ts',bytes:1,sha256:'a'.repeat(64)}));many.save();assert.equal(code(many.check()),'RECORD_LIMIT');
  const total=fixture();for(let i=0;i<100;i++)total.m.files.push({path:'src/large'+i+'.ts',bytes:1024*1024,sha256:'a'.repeat(64)});total.save();assert.equal(code(total.check()),'TOTAL_LIMIT');
});
test('095 artifact size/aggregate limits and the bounded HTML parser also apply to self-consistent declarations',()=>{
  const f=fixture(),bytes=Buffer.alloc(CANDIDATE_LIMITS.artifactBytes,65);changed(f,'runtime','team.mjs',bytes);Object.assign(f.m.artifacts.find(x=>x.path==='team.mjs'),{bytes:bytes.length,sha256:sha(bytes)});f.save();assert.equal(f.check().state,'matches-manifest');
  fs.appendFileSync(path.join(f.runtime,'team.mjs'),'B');assert.equal(code(f.check()),'FILE_LIMIT');
  const total=fixture();for(let i=0;i<5;i++)total.m.artifacts.push({path:'dist/large'+i+'.wasm',bytes:CANDIDATE_LIMITS.artifactBytes,sha256:'a'.repeat(64)});total.save();assert.equal(code(total.check()),'TOTAL_LIMIT');
  const index=fixture(),html=changed(index,'runtime','dist/index.html',' '.repeat(256*1024+1));Object.assign(index.m.artifacts.find(x=>x.path==='dist/index.html'),{bytes:html.length,sha256:sha(html)});index.save();assert.equal(code(index.check()),'UNVERIFIABLE_INDEX');
});
function link(t,target,where){try{fs.symlinkSync(target,where,process.platform==='win32'?'junction':'dir');return true;}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('fixture link unsupported: '+e.code);return false;}throw e;}}
test('095 linked source directories and runtime junctions are never followed',t=>{
  for(const kind of ['source','runtime']){const f=fixture(),outside=path.join(f.workspaceRoot,'owned-other');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'private.ts'),'NEVER_READ');const parent=kind==='source'?path.join(f.source,'shared'):path.join(f.runtime,'dist');fs.mkdirSync(parent,{recursive:true});if(!link(t,outside,path.join(parent,'linked')))return;if(kind==='source'){const b=fs.readFileSync(path.join(outside,'private.ts'));f.m.files.push({path:'shared/linked/private.ts',bytes:b.length,sha256:sha(b)});f.save();}assert.equal(code(f.check()),'LINK_REJECTED');}
});
test('095 linked candidate roots are refused before using their metadata',t=>{
  const f=fixture(),next='tests/.tmp/release-candidates/candidate-'+randomUUID();if(!link(t,f.folder,path.join(f.workspaceRoot,next)))return;assert.equal(code(inspectCandidate({candidate:next,workspaceRoot:f.workspaceRoot})),'LINK_REJECTED');
});
test('095 file-link branch is checked with lstat shim, without claiming Windows file-symlink privilege',()=>{
  const f=fixture(),target=path.join(f.source,'src/main.ts'),original=fs.lstatSync;fs.lstatSync=function(file,...args){const stat=original.call(this,file,...args);return String(file)===target?new Proxy(stat,{get(t,k){return k==='isSymbolicLink'?()=>true:Reflect.get(t,k);}}):stat;};try{assert.equal(code(f.check()),'LINK_REJECTED');}finally{fs.lstatSync=original;}
});
function duringRead(f,action){const open=fs.openSync,read=fs.readSync,files=new Map();let done=false;fs.openSync=function(file,...args){const fd=open.call(this,file,...args);files.set(fd,String(file));return fd;};fs.readSync=function(fd,...args){const n=read.call(this,fd,...args);if(!done&&files.get(fd)===path.join(f.source,'src/main.ts')){done=true;action();}return n;};try{const result=f.check();assert.equal(done,true,'race gate was exercised');return result;}finally{fs.openSync=open;fs.readSync=read;}}
test('095 changes to an earlier source during the set scan are detected on the second pass',()=>{const f=fixture(),r=duringRead(f,()=>changed(f,'source','package.json','{"changed":true}'));assert.equal(r.state,'different');assert.equal(code(r),'HASH_OR_SIZE_MISMATCH');});
test('095 adding a runtime file after initial inventory is detected by final inventory',()=>{const f=fixture(),r=duringRead(f,()=>fs.writeFileSync(path.join(f.runtime,'dist/late.js'),'late'));assert.equal(r.state,'different');assert.equal(code(r),'UNEXPECTED_RUNTIME_FILE');});
test('095 manifest replacement during verification is not treated as the initial declaration',()=>{const f=fixture(),r=duringRead(f,()=>{f.m.changedAfterRead=true;f.save();});assert.equal(r.state,'different');assert.equal(code(r),'MANIFEST_CHANGED');});
test('095 an in-read edit is detected by stable descriptor metadata',()=>{const f=fixture(),r=duringRead(f,()=>fs.appendFileSync(path.join(f.source,'src/main.ts'),'!'));assert.equal(r.state,'unverifiable');assert.equal(code(r),'UNSTABLE_FILE');});
test('095 missing direct index asset and ambiguous HTML are not verified',()=>{
  for(const html of ['<script src="/assets/missing.js"></script>','<script src="/assets/main.js" src="/assets/main.js"></script>']){const f=fixture(),bytes=changed(f,'runtime','dist/index.html',html);Object.assign(f.m.artifacts.find(x=>x.path==='dist/index.html'),{bytes:bytes.length,sha256:sha(bytes)});f.save();const r=f.check();assert.ok(['MISSING_INDEX_ASSET','UNVERIFIABLE_INDEX'].includes(code(r)));assert.notEqual(r.state,'matches-manifest');}
});
test('095 excludes generated scratch under source and never claims to check the live workspace',()=>{const f=fixture();fs.mkdirSync(path.join(f.source,'tests/.tmp/new-data'),{recursive:true});fs.writeFileSync(path.join(f.source,'tests/.tmp/new-data/fixture.sqlite'),'SYNTHETIC_NOT_A_DATABASE');assert.equal(f.check().state,'matches-manifest');assert.equal(f.check().liveCheckout,'not_compared');});
const osEnvironment=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz'].includes(k.toLowerCase())));
test('095 CLI help/import have no actions; explicit candidate works after relocating tool, without executing candidate code',()=>{
  const f=fixture();for(const p of ['scripts/check-release-candidate.mjs','tools/releases/candidate-integrity.mjs','tools/releases/workspace-manifest.mjs']){const to=path.join(f.workspaceRoot,p);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,p),to);}
  const cli=path.join(f.workspaceRoot,'scripts/check-release-candidate.mjs'),run=args=>spawnSync(process.execPath,args,{cwd:f.workspaceRoot,env:osEnvironment(),windowsHide:true,encoding:'utf8',timeout:20000});
  let r=run([cli]);assert.equal(r.status,0);assert.match(r.stdout,/Solo lectura/);assert.equal(fs.readdirSync(path.join(f.workspaceRoot,'tests/.tmp/release-candidates')).length,1);
  r=run(['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(cli).href)+');']);assert.equal(r.status,0);assert.equal(r.stdout,'');
  r=run([cli,'--candidate',f.candidate]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).state,'matches-manifest');assert.equal(JSON.parse(r.stdout).approvalGranted,false);
  changed(f,'runtime','team.mjs','CHANGED_BYTES');r=run([cli,'--candidate',f.candidate]);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).state,'different');
  r=run([cli,'--candidate','../SYNTHETIC_SECRET']);assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).state,'unverifiable');assert.ok(!r.stdout.includes('SYNTHETIC_SECRET'));
  r=run([cli,'--run','SYNTHETIC_SECRET']);assert.equal(r.status,2);assert.ok(!r.stderr.includes('SYNTHETIC_SECRET'));
});
