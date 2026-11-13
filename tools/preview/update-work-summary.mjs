import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,createDecipheriv} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createBoard} from '../coordination/core.mjs';

// Specific, reversible update of the new fictitious installation278/279. This is
// deliberately not a general launcher, an installer, or a path-based restore API.
// --prepare only builds. --apply uses the prepared receipt and checks live identity.
const repo=process.cwd(),b=createBoard(repo),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,value)=>fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const scratch=fs.realpathSync(path.join(repo,'tests/.tmp'));
const original=read(path.join(scratch,'preview278-latest.json'));
const oldUI=read(path.join(scratch,'preview279-latest.json'));
const cut=read(path.join(scratch,'mount284-mount284-q1kkk5.json'));
const pointer=path.join(scratch,'preview288-latest.json');
const origin='http://127.0.0.1:4601',instance='3cb33118-1596-44cc-b78a-b2961615f4ff';
const inside=(p,parent)=>{assert.ok(path.relative(parent,p)&&!path.relative(parent,p).startsWith('..')&&!path.isAbsolute(path.relative(parent,p)));assert.equal(fs.realpathSync(p),p);return p;};
const installation=inside(original.installation,scratch);
assert.equal(path.basename(path.dirname(installation)),'preview278-SRZe1u');
assert.equal(oldUI.installation,installation);assert.equal(original.url,origin+'/');
const data=inside(path.join(installation,'data'),installation),dbFile=path.join(data,'planb.sqlite');
const envFor=root=>({...Object.fromEntries(Object.entries(process.env).filter(([k])=>new Set(['path','systemroot','windir','comspec','pathext','lang','tz']).has(k.toLowerCase()))),NODE_ENV:'test',PLANB_PORT:'4601',PLANB_DATA_DIR:data,TEMP:path.join(root,'tmp'),TMP:path.join(root,'tmp'),TMPDIR:path.join(root,'tmp')});
const checkAccepted=()=>{
 const task=b.load().tasks.find(t=>t.id==='CODEX-WORK-SUMMARY-MOUNT-284');assert.equal(task.status,'done');
 for(const[p,h]of Object.entries(task.submitted))assert.equal(sha(path.join(repo,p)),h,p);
 for(const[p,h]of Object.entries(cut.tested))assert.equal(task.submitted[p],h,p);
 for(const[p,h]of Object.entries(cut.sources))assert.equal(sha(path.join(cut.source,p)),h,p);
};
const walk=(dir,prefix='')=>{const out={};for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),s=fs.lstatSync(p);assert.equal(s.isSymbolicLink(),false,p);if(s.isDirectory())Object.assign(out,walk(p,prefix+name+'/'));else{assert.ok(s.isFile());out[prefix+name]=sha(p);}}return out;};
// Startup writes returnBusy=false again with a fresh AES-GCM nonce. Compare
// plaintext hashes of encrypted cells, retaining every table/row/other column.
// Only this installation's new test key is allowed; no DPAPI/profile access.
const digest=(file=dbFile)=>{
 const saved=read(path.join(data,'.planb-key'));assert.equal(saved.kind,'test');const key=Buffer.from(saved.data,'base64');assert.equal(key.length,32);
 const cell=value=>{if(typeof value!=='string'||!value.startsWith('enc1:'))return value;const bytes=Buffer.from(value.slice(5),'base64'),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));const plain=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);return{encryptedPlaintextSha256:createHash('sha256').update(plain).digest('hex')};};
 const db=new DatabaseSync(file,{readOnly:true});try{const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();return createHash('sha256').update(JSON.stringify(names.map(({name})=>[name,db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,cell(v)])))).sort()]))).digest('hex');}finally{db.close();}
};
const get=async(p)=>{const r=await fetch(origin+p,{redirect:'error',signal:AbortSignal.timeout(4000)});assert.equal(r.status,200,p);return{body:await r.json(),headers:Object.fromEntries(r.headers)};};
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
function owned(pid){
 assert.ok(Number.isInteger(pid)&&pid>0&&pid!==process.pid);
 const script='$x=Get-CimInstance Win32_Process -Filter "ProcessId = '+pid+'"; if($x){$x | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress}';
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0);const p=JSON.parse(r.stdout.trim());assert.equal(p.ProcessId,pid);assert.equal(p.Name.toLowerCase(),'node.exe');assert.ok(p.CommandLine.toLowerCase().includes(path.join(installation,'build/server.mjs').toLowerCase()));assert.ok(p.CommandLine.toLowerCase().includes(path.join(installation,'build/block-external.cjs').toLowerCase()));return{pid,name:p.Name};
}
async function stop(pid){owned(pid);process.kill(pid,'SIGTERM');for(let i=0;i<100&&alive(pid);i++)await delay(100);assert.equal(alive(pid),false,'owned server must stop before replacing its files');}
async function start(root,label){
 const out=fs.openSync(path.join(root,label+'.log'),'wx'),err=fs.openSync(path.join(root,label+'-error.log'),'wx');let child;
 try{child=spawn(process.execPath,['--require',path.join(installation,'build/block-external.cjs'),path.join(installation,'build/server.mjs')],{cwd:installation,env:envFor(root),detached:true,windowsHide:true,stdio:['ignore',out,err]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}finally{fs.closeSync(out);fs.closeSync(err);}
 write(path.join(root,label+'-process.json'),{pid:child.pid,binary:sha(path.join(installation,'build/server.mjs')),startedAt:new Date().toISOString()});
 try{
  for(let i=0;i<200;i++){assert.equal(alive(child.pid),true,'owned child exited; inspect its local log');try{const h=await get('/api/health');assert.equal(h.body.instanceId,instance);return child.pid;}catch{await delay(150);}}
  throw new Error('New server did not become healthy; PID '+child.pid);
 }catch(error){if(alive(child.pid))await stop(child.pid);throw error;}
}

checkAccepted();
if(process.argv[2]==='--prepare'){
 assert.equal(fs.existsSync(pointer),false,'A receipt already exists; inspect it rather than replacing it');
 const root=fs.mkdtempSync(path.join(scratch,'preview288-')),source=path.join(root,'s');fs.mkdirSync(source);fs.mkdirSync(path.join(root,'tmp'));
 for(const[p,h]of Object.entries(cut.sources)){const from=path.join(cut.source,p),to=path.join(source,p);assert.equal(sha(from),h);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);}
 const {build}=await import('vite'),{default:react}=await import('@vitejs/plugin-react'),{build:bundle}=await import('esbuild');
 const previous={...process.env};try{for(const k of Object.keys(process.env))if(!new Set(['path','systemroot','windir','comspec','pathext','lang','tz','temp','tmp','tmpdir']).has(k.toLowerCase()))delete process.env[k];process.env.NODE_ENV='production';await build({root:source,mode:'production',configFile:false,envDir:path.join(root,'empty-env'),base:'./',plugins:[react()],logLevel:'error',build:{outDir:path.join(root,'dist'),emptyOutDir:false,minify:false}});}finally{for(const k of Object.keys(process.env))delete process.env[k];Object.assign(process.env,previous);}
 const assets=walk(path.join(root,'dist'));for(const p of Object.keys(assets).filter(p=>p.endsWith('.js')))assert.ok(!fs.readFileSync(path.join(root,'dist',p),'utf8').includes('react-dom-client.development.js'));
 await bundle({entryPoints:[path.join(source,'server/main.ts')],outfile:path.join(root,'build/server.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error',banner:{js:"import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"}});
 for(const[p,h]of Object.entries(cut.sources))assert.equal(sha(path.join(source,p)),h,p);checkAccepted();
 const result={phase:'prepared',root,source,installation,origin,instance,sources:cut.sources,tested:cut.tested,assets,binary:sha(path.join(root,'build/server.mjs')),preparedAt:new Date().toISOString()};write(path.join(root,'prepared.json'),result);write(pointer,result);console.log(JSON.stringify({phase:result.phase,root,sources:Object.keys(result.sources).length,assets:Object.keys(assets).length,binary:result.binary}));
}else if(process.argv[2]==='--apply'){
 const r=read(pointer),root=inside(r.root,scratch);assert.equal(r.phase,'prepared');assert.equal(r.installation,installation);assert.equal(r.instance,instance);assert.equal(fs.existsSync(path.join(root,'applied.json')),false,'Already applied');
 const attempt=fs.mkdtempSync(path.join(root,'apply-'));fs.mkdirSync(path.join(attempt,'tmp'));
 assert.deepEqual(walk(path.join(root,'dist')),r.assets);assert.equal(sha(path.join(root,'build/server.mjs')),r.binary);assert.deepEqual(walk(path.join(installation,'dist')),oldUI.assets);assert.equal(sha(path.join(installation,'build/server.mjs')),original.binary);
 for(const[p,h]of Object.entries(original.copied).filter(([p])=>!p.startsWith('dist/')&&p!=='build/server.mjs'))assert.equal(sha(path.join(installation,p)),h,p);
 for(const p of ['.env.local','.ai.local.json','demo.seed.json'])assert.equal(fs.existsSync(path.join(installation,p)),false,p);
 assert.equal(read(path.join(data,'.planb-key')).kind,'test');const keyHash=sha(path.join(data,'.planb-key'));
 const health=await get('/api/health');assert.equal(health.body.instanceId,instance);const auth=await get('/api/v2/auth/status');assert.equal(auth.body.configured,false,'This updater is restricted to the unconfigured fictitious installation');
 const endpoint=read(path.join(data,'.endpoint.json'));assert.equal(endpoint.instanceId,instance);const previousRollback=['last-rollback.json','rollback.json'].map(p=>path.join(root,p)).find(p=>fs.existsSync(p));assert.equal(endpoint.pid,previousRollback?read(previousRollback).pid:original.pid);const processBefore=owned(endpoint.pid),before=digest();
 const db=new DatabaseSync(dbFile,{readOnly:true});try{await backup(db,path.join(attempt,'data-before.sqlite'));}finally{db.close();}assert.equal(digest(),before);assert.equal(digest(path.join(attempt,'data-before.sqlite')),before);
 // Verify the earlier rollback preserved plaintext too, without rewriting data.
 if(fs.existsSync(path.join(root,'data-before.sqlite')))assert.equal(digest(path.join(root,'data-before.sqlite')),before,'Earlier rollback changed logical data');
 write(path.join(attempt,'before.json'),{instance,process:processBefore,digest:before,binary:original.binary,assets:oldUI.assets,at:new Date().toISOString()});
 const oldBinary=path.join(installation,'build/server-before288.mjs'),oldDist=path.join(installation,'dist-before288');assert.equal(fs.existsSync(oldBinary),false);assert.equal(fs.existsSync(oldDist),false);
 // All move targets are explicit children of the verified original installation.
 assert.equal(path.dirname(oldBinary),path.join(installation,'build'));assert.equal(path.dirname(oldDist),installation);
 let stopped=false,binaryMoved=false,distMoved=false,newPid;
 try{
  await stop(endpoint.pid);stopped=true;assert.equal(digest(),before,'Data changed during stop; do not overwrite it');
  fs.renameSync(path.join(installation,'build/server.mjs'),oldBinary);binaryMoved=true;fs.copyFileSync(path.join(root,'build/server.mjs'),path.join(installation,'build/server.mjs'),fs.constants.COPYFILE_EXCL);
  fs.renameSync(path.join(installation,'dist'),oldDist);distMoved=true;fs.mkdirSync(path.join(installation,'dist'));for(const p of Object.keys(r.assets)){const to=path.join(installation,'dist',p);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,'dist',p),to,fs.constants.COPYFILE_EXCL);}
  assert.equal(digest(),before);assert.equal(sha(path.join(data,'.planb-key')),keyHash);newPid=await start(attempt,'server288');
  const summary=await get('/api/v7/local-operations/work-summary');assert.equal(summary.body.coverage,'none');assert.equal(summary.body.counts,null);assert.equal(summary.body.quarantine,null);assert.equal(summary.body.status,'read');assert.equal(summary.body.provenance,'durable');assert.equal(summary.headers['cache-control'],'no-store');
  for(const[p,h]of Object.entries(r.assets)){const response=await fetch(origin+'/'+p,{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(response.status,200,p);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),h,p);}
  assert.equal(digest(),before);assert.equal(sha(path.join(data,'.planb-key')),keyHash);const result={...r,phase:'applied',attempt,pid:newPid,oldPid:endpoint.pid,digest:before,oldBinary,oldDist,appliedAt:new Date().toISOString()};write(path.join(root,'applied.json'),result);console.log(JSON.stringify({phase:'applied',root,attempt,pid:newPid,oldPid:endpoint.pid,instance,digest:before,assets:Object.keys(r.assets).length}));
 }catch(error){
  if(newPid&&alive(newPid))await stop(newPid);
  if(distMoved){if(fs.existsSync(path.join(installation,'dist')))fs.renameSync(path.join(installation,'dist'),path.join(attempt,'dist-failed'));fs.renameSync(oldDist,path.join(installation,'dist'));}
  if(binaryMoved){if(fs.existsSync(path.join(installation,'build/server.mjs')))fs.renameSync(path.join(installation,'build/server.mjs'),path.join(attempt,'server-failed.mjs'));fs.renameSync(oldBinary,path.join(installation,'build/server.mjs'));}
  const rollbackPid=stopped?await start(attempt,'rollback279'):endpoint.pid;const rollback={pid:rollbackPid,dataUnchanged:digest()===before,error:String(error.message).slice(0,300),at:new Date().toISOString()};write(path.join(attempt,'rollback.json'),rollback);fs.writeFileSync(path.join(root,'last-rollback.json'),JSON.stringify(rollback,null,2)+'\n');throw error;
 }
}else{throw new Error('Use --prepare or --apply. Only the verified fictitious278/279 installation is supported.');}
