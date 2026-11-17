import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {entryAssetPaths} from './workspace-manifest.mjs';

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const CANDIDATE_LIMITS=Object.freeze({metadataBytes:2*1024*1024,sourceBytes:2*1024*1024,artifactBytes:16*1024*1024,sourceTotal:50*1024*1024,artifactTotal:64*1024*1024,records:2000,entries:4096});
const ROOTS=['src','shared','server','scripts','tests','tools','public'];
const ROOT_FILES=['package.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html'];
const BACKENDS=['server','runtime','drill','team','copilot-worker','pilot-alias'].map(n=>n+'.mjs');
const CHECKS=['typecheck','vite',...BACKENDS.map(n=>'bundle-'+n),'public-assets','node-integration'];
const REQUIRED_RUNTIME=[...BACKENDS,'block-external.cjs','scripts/block-external.cjs','dist/index.html'];
const SOURCE_ENTRIES=['server/main.ts','server/runtime.ts','server/drill-worker.ts','server/team/main.ts','server/team/copilot-worker.ts','server/team/pilot-alias.ts','scripts/block-external.cjs',...ROOT_FILES];
const EXCLUDED_NAMES=new Set(['data','node_modules','dist','build','outputs','test-results']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const folded=s=>process.platform==='win32'?s.toLowerCase():s;
const within=(parent,child)=>folded(child).startsWith(folded(parent)+path.sep)||folded(child)===folded(parent);
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
class Invalid extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new Invalid(code);};

function relative(value,{excluded=false}={}){
  if(typeof value!=='string'||!value||value.length>512||/[\\\x00-\x1f<>:"|?*%]/.test(value)||value.startsWith('/'))fail('UNSAFE_PATH');
  const normalized=excluded&&value.endsWith('/')?value.slice(0,-1):value;
  const parts=normalized.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))fail('UNSAFE_PATH');
  if(!excluded&&parts.some(p=>p.startsWith('.')))fail('PRIVATE_PATH');
  return value;
}
function sourcePath(value){
  relative(value);
  if(ROOT_FILES.includes(value))return value;
  const parts=value.split('/');if(!ROOTS.includes(parts[0])||parts.length<2)fail('UNSUPPORTED_SOURCE');
  for(const part of parts.slice(1))if(EXCLUDED_NAMES.has(part.toLowerCase())&&!(parts[0]==='public'&&part.toLowerCase()==='data'))fail('PRIVATE_PATH');
  if(parts[0]!=='public'&&!value.startsWith('src/assets/')&&!/\.(tsx?|[cm]?js|css|svg|html)$/i.test(value))fail('UNSUPPORTED_SOURCE');
  return value;
}
function artifactPath(value){
  relative(value);
  if(!REQUIRED_RUNTIME.includes(value)&&!value.startsWith('dist/'))fail('UNSUPPORTED_ARTIFACT');
  if(value.startsWith('dist/')&&value.split('/').slice(1).some(p=>EXCLUDED_NAMES.has(p.toLowerCase())&&p.toLowerCase()!=='data'))fail('PRIVATE_PATH');
  return value;
}
function canonical(root){
  const resolved=path.resolve(root),actual=fs.realpathSync(resolved);
  if(folded(resolved)!==folded(actual)||fs.lstatSync(resolved).isSymbolicLink()||!fs.lstatSync(resolved).isDirectory())fail('LINK_REJECTED');
  return actual;
}
function checked(root,name){
  canonical(root);
  let cursor=root;
  for(const part of name.split('/')){
    const parent=cursor;cursor=path.join(cursor,part);
    if(!within(root,cursor))fail('UNSAFE_PATH');
    if(fs.lstatSync(cursor).isSymbolicLink())fail('LINK_REJECTED');
    // A portable manifest keeps the original case even on an insensitive filesystem.
    if(!fs.readdirSync(parent).includes(part))fail('PATH_CASE_MISMATCH');
  }
  return cursor;
}
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
function read(root,name,limit){
  let fd;
  try{
    const full=checked(root,name),beforePath=fs.lstatSync(full,{bigint:true});
    if(!beforePath.isFile()||beforePath.size>BigInt(limit))fail('FILE_LIMIT');
    fd=fs.openSync(full,'r');const before=fs.fstatSync(fd,{bigint:true});
    if(stamp(before)!==stamp(beforePath))fail('UNSTABLE_FILE');
    const buffer=Buffer.alloc(Number(before.size)+1);let count=0;
    while(count<buffer.length){const n=fs.readSync(fd,buffer,count,buffer.length-count,null);if(!n)break;count+=n;}
    const after=fs.fstatSync(fd,{bigint:true}),afterPath=fs.lstatSync(checked(root,name),{bigint:true});
    if(count!==Number(before.size)||stamp(before)!==stamp(after)||stamp(after)!==stamp(afterPath))fail('UNSTABLE_FILE');
    return buffer.subarray(0,count);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function records(list,kind){
  if(!Array.isArray(list)||!list.length||list.length>CANDIDATE_LIMITS.records)fail('RECORD_LIMIT');
  const names=new Set();let total=0;
  for(const item of list){
    if(!object(item))fail('INVALID_RECORD');
    const name=kind==='source'?sourcePath(item.path):artifactPath(item.path),key=name.toLowerCase();
    if(names.has(key))fail('DUPLICATE_PATH');names.add(key);
    const limit=kind==='source'?CANDIDATE_LIMITS.sourceBytes:CANDIDATE_LIMITS.artifactBytes;
    if(!Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>limit||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))fail('INVALID_RECORD');
    total+=item.bytes;
  }
  if(total>(kind==='source'?CANDIDATE_LIMITS.sourceTotal:CANDIDATE_LIMITS.artifactTotal))fail('TOTAL_LIMIT');
  return list.map(({path,bytes,sha256})=>({path,bytes,sha256}));
}
function validate(m){
  if(!object(m)||m.format!=='planb-candidate-v1'||m.state!=='compiled-and-node-verified')fail('INCOMPLETE_MANIFEST');
  if(m.approved!==false||m.deployed!==false||m.releaseEligible!==false)fail('UNSUPPORTED_APPROVAL_CLAIM');
  if(!Array.isArray(m.checks)||m.checks.length>40)fail('INVALID_CHECKS');
  const checks=new Set();for(const c of m.checks){if(!object(c)||typeof c.name!=='string'||checks.has(c.name)||c.ok!==true||c.name!=='public-assets'&&c.exitCode!==0)fail('INVALID_CHECKS');checks.add(c.name);}
  if(CHECKS.some(c=>!checks.has(c)))fail('INCOMPLETE_CHECKS');
  if(!Array.isArray(m.blockers)||m.blockers.length>4096||m.blockers.some(x=>typeof x!=='string'||x.length>1024))fail('INVALID_BLOCKERS');
  const sources=records(m.files,'source'),artifacts=records(m.artifacts,'artifact');
  if(SOURCE_ENTRIES.some(p=>!sources.some(f=>f.path===p))||REQUIRED_RUNTIME.some(p=>!artifacts.some(f=>f.path===p)))fail('MISSING_ENTRY');
  const selection=m.sourceSelection;
  if(!object(selection)||selection.repositoryImage!==false||!Array.isArray(selection.roots)||!Array.isArray(selection.rootFiles)||selection.roots.length!==ROOTS.length||selection.rootFiles.length!==ROOT_FILES.length||ROOTS.some(p=>!selection.roots.includes(p))||ROOT_FILES.some(p=>!selection.rootFiles.includes(p)))fail('INVALID_SELECTION');
  if(!Array.isArray(selection.excludedPaths)||selection.excludedPaths.length>CANDIDATE_LIMITS.records)fail('INVALID_SELECTION');
  const excluded=new Set();for(const x of selection.excludedPaths){if(!object(x)||!['hidden-name','excluded-name','unlisted-extension'].includes(x.reason))fail('INVALID_SELECTION');const name=relative(x.path,{excluded:true}).toLowerCase();if(excluded.has(name))fail('DUPLICATE_PATH');excluded.add(name);if(sources.some(f=>x.path.endsWith('/')?f.path.toLowerCase().startsWith(name):f.path.toLowerCase()===name))fail('CONTRADICTORY_SELECTION');}
  return {sources,artifacts};
}
function inventory(root,expected){
  const paths=[],directories=new Set(['']);let entries=0;
  for(const name of expected){const parts=name.split('/');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));}
  function visit(prefix){
    for(const entry of fs.readdirSync(prefix?checked(root,prefix):root,{withFileTypes:true})){
      if(++entries>CANDIDATE_LIMITS.entries)fail('INVENTORY_LIMIT');
      const name=prefix?prefix+'/'+entry.name:entry.name;
      if(entry.isSymbolicLink())fail('LINK_REJECTED');
      // Do not traverse or read the contents of an unexpected/private directory.
      if(entry.isDirectory()){if(!directories.has(name))fail('UNEXPECTED_RUNTIME_DIRECTORY');visit(name);}
      else if(!entry.isFile())fail('NON_REGULAR_FILE');
      else{if(!expected.has(name))fail('UNEXPECTED_RUNTIME_FILE');paths.push(name);}
    }
  }
  visit('');return paths.sort();
}
function publicPairs(sources,artifacts){
  const map=new Map(artifacts.map(f=>[f.path,f]));
  for(const source of sources.filter(f=>f.path.startsWith('public/'))){const target=map.get('dist/'+source.path.slice(7));if(!target||target.bytes!==source.bytes||target.sha256!==source.sha256)fail('PUBLIC_ASSET_MAPPING');}
  for(const source of sources.filter(f=>f.path.startsWith('src/assets/')&&/\.(txt|md)$/i.test(f.path))){const target=map.get('dist/'+source.path.slice(4));if(!target||target.bytes!==source.bytes||target.sha256!==source.sha256)fail('ASSET_NOTICE_MAPPING');}
  const guard=sources.find(f=>f.path==='scripts/block-external.cjs');
  for(const p of ['block-external.cjs','scripts/block-external.cjs']){const a=map.get(p);if(a.bytes!==guard.bytes||a.sha256!==guard.sha256)fail('GUARD_MAPPING');}
}

/** Only compares declared bytes/inventory. No build execution, code import, network, approval or filesystem lock. */
export function inspectCandidate(options={}){
  const report={format:'planb-candidate-integrity-v1',state:'unverifiable',sourcesChecked:0,artifactsChecked:0,declaredBlockerCount:null,declaredExclusionCount:null,issues:[],approvalGranted:false,deploymentPerformed:false,buildEvidence:'declared_not_reexecuted',releaseReadiness:'not_assessed',liveCheckout:'not_compared',manifestAuthenticity:'not_verified',limitations:['Coincidencia de bytes e inventario, no prueba de compilación, tests, revisión o autorización.','El manifiesto no está firmado: sus hashes no acreditan quién los generó.','Lecturas repetidas detectan cambios observados; no bloquean a escritores privilegiados.','Se comprueban solo fuentes declaradas; no una imagen íntegra del repositorio.']};
  let phase='metadata';
  try{
    if(!object(options))fail('INVALID_OPTIONS');
    const {candidate,workspaceRoot=REPO}=options;
    if(typeof workspaceRoot!=='string'||!workspaceRoot||!within(REPO,path.resolve(workspaceRoot)))fail('OUTSIDE_WORKSPACE');
    if(typeof candidate!=='string'||!/^tests\/\.tmp\/release-candidates\/candidate-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(candidate))fail('INVALID_CANDIDATE_PATH');
    const workspace=canonical(workspaceRoot),root=canonical(checked(workspace,candidate));
    const bytes=read(root,'manifest.json',CANDIDATE_LIMITS.metadataBytes);
    if(!Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes))fail('INVALID_MANIFEST');
    let m;try{m=JSON.parse(bytes.toString('utf8'));}catch{fail('INVALID_MANIFEST');}
    const {sources,artifacts}=validate(m);publicPairs(sources,artifacts);
    report.declaredBlockerCount=m.blockers.length;report.declaredExclusionCount=m.sourceSelection.excludedPaths.length;
    phase='files';
    const sourceRoot=canonical(checked(root,'source')),runtime=canonical(checked(root,'runtime')),expected=new Set(artifacts.map(f=>f.path));
    const initial=inventory(runtime,expected);if(initial.length!==artifacts.length)fail('MISSING_FILE');
    let indexBytes;
    for(let pass=0;pass<2;pass++)for(const[kind,folder,list,limit]of [['source',sourceRoot,sources,CANDIDATE_LIMITS.sourceBytes],['runtime',runtime,artifacts,CANDIDATE_LIMITS.artifactBytes]])for(const f of list){
      const actual=read(folder,f.path,limit);
      if(actual.length!==f.bytes||hash(actual)!==f.sha256){report.state='different';report.issues.push({code:'HASH_OR_SIZE_MISMATCH',kind,path:f.path});return report;}
      if(pass===0){if(kind==='source')report.sourcesChecked++;else report.artifactsChecked++;}
      if(kind==='runtime'&&f.path==='dist/index.html')indexBytes=actual;
    }
    phase='index';if(!Buffer.from(indexBytes.toString('utf8'),'utf8').equals(indexBytes))fail('UNVERIFIABLE_INDEX');
    for(const asset of entryAssetPaths(indexBytes.toString('utf8'),'dist/'))if(!expected.has(asset))fail('MISSING_INDEX_ASSET');
    phase='stability';if(JSON.stringify(initial)!==JSON.stringify(inventory(runtime,expected)))fail('RUNTIME_CHANGED');
    if(!read(root,'manifest.json',CANDIDATE_LIMITS.metadataBytes).equals(bytes))fail('MANIFEST_CHANGED');
    report.state='matches-manifest';return report;
  }catch(error){
    const code=error instanceof Invalid?error.code:error?.code==='ENOENT'?'MISSING_FILE':phase==='index'?'UNVERIFIABLE_INDEX':'READ_FAILED';
    if(phase!=='metadata'&&['MISSING_FILE','UNEXPECTED_RUNTIME_FILE','UNEXPECTED_RUNTIME_DIRECTORY','MISSING_INDEX_ASSET','RUNTIME_CHANGED','MANIFEST_CHANGED'].includes(code))report.state='different';
    report.issues.push({code});return report;
  }
}
