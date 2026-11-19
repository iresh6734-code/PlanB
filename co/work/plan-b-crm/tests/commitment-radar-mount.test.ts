import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {createBaseApp} from '../server/app.js';
import {Store} from '../server/store.js';
import {mountCommitmentRadar,COMMITMENT_RADAR_CAPABILITY_PATH as CAP} from '../server/commitment-radar-mount.js';
import {COMMITMENT_SCENARIO_SEED_KEY as KEY} from '../server/commitment-scenario-seed.js';
import {workspaceSearchIdentity} from '../server/workspace-search.js';
import {makeDemoSpec,makeFixture} from '../shared/fixtures.js';
import {commitmentDetailResponse,commitmentListResponse,commitmentPath} from '../shared/commitments.js';

process.env.NODE_ENV='test';
const NOW=Date.parse('2026-11-08T10:00:00.000Z'),headers={host:'127.0.0.1'};
type Fixture=Awaited<ReturnType<typeof open>>;
function activate(f:Pick<Fixture,'store'>,testData=true){const snapshot=makeFixture('agency');if(!testData){snapshot.version=3;snapshot.source={kind:'hubspot',accountId:'fixture-only-policy',isTestData:false,environment:'production',accountType:'STANDARD',description:'Ficción usada para comprobar rechazo de producción'};}f.store.importSnapshot(snapshot,!!f.store.snapshot);f.store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date(NOW).toISOString(),prompt:'',approved:false});f.store.activate();}
async function open(filename=':memory:',clock=()=>NOW){const f=await createBaseApp({root:'.',dbPath:filename,staticDir:'none'});mountCommitmentRadar(f.app,f.store,{clock});const pin=()=>workspaceSearchIdentity(f.store)?.contextRevision??null;const status=(withPin=true)=>f.app.inject({url:CAP+(withPin&&pin()?'?contextRevision='+pin():''),headers});const start=()=>f.app.inject({method:'POST',url:CAP+'/activate',headers,payload:{contextRevision:pin()??'0'.repeat(64)}});const get=(id='')=>f.app.inject({url:commitmentPath+(id?'/'+id:'')+'?contextRevision='+(pin()??'0'.repeat(64)),headers});return{...f,pin,status,start,get};}
const raw=(f:Fixture)=>f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(KEY)?.value;
const all=(f:Fixture)=>JSON.stringify(f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,f.store.db.prepare('SELECT * FROM "'+String(name).replaceAll('"','""')+'"').all().map(r=>JSON.stringify(r)).sort()]));
const crm=(f:Fixture)=>JSON.stringify(['records','changes','captures','archives'].map(table=>[table,f.store.db.prepare('SELECT * FROM '+table).all().map(r=>JSON.stringify(r)).sort()]));

test('Arranque vacío: rutas ya existen, GET no crea semilla y POST sin copia no la inventa',async t=>{
 const f=await open();t.after(()=>f.app.close());const before=all(f);const r=await f.status();assert.equal(r.statusCode,200);assert.deepEqual(r.json(),{format:'planb-commitment-radar-capability-v1',mode:'fiction',contextRevision:null,seedAt:null,datasetRevision:null,provenance:null,status:'inactive-copy',canActivate:false});assert.equal((await f.start()).statusCode,409);assert.equal((await f.get()).statusCode,409);assert.equal(all(f),before);assert.equal(raw(f),undefined);
});
test('Vacío→copia activa→activación explícita: ninguna lectura escribe y solo POST crea marcador',async t=>{
 const f=await open();t.after(()=>f.app.close());await f.status();activate(f);const before=all(f),beforeCRM=crm(f);const s=await f.status();assert.equal(s.statusCode,200);assert.equal(s.json().status,'not-initialized');assert.equal(s.json().canActivate,true);assert.equal((await f.get()).statusCode,503);assert.equal(all(f),before);
 const created=await f.start();assert.equal(created.statusCode,201,created.body);assert.equal(created.json().status,'available');assert.equal(created.json().provenance,'memory-only');assert.equal(created.json().seedAt,new Date(NOW).toISOString());assert.equal(crm(f),beforeCRM);assert.ok(raw(f));
 const after=all(f);assert.equal((await f.status()).json().status,'available');const list=commitmentListResponse.parse((await f.get()).json());assert.equal(list.items.length,8);await f.get('ms-installation-hubspot');assert.equal(all(f),after);
});
test('Repetición y dos activaciones concurrentes no renuevan semilla ni invocan un reloj posterior',async t=>{
 let calls=0;const f=await open(':memory:',()=>{calls++;return NOW;});t.after(()=>f.app.close());activate(f);const responses=await Promise.all([f.start(),f.start()]);assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,201]);assert.equal(calls,1);assert.equal(responses[0].json().seedAt,responses[1].json().seedAt);const before=all(f);assert.equal((await f.start()).statusCode,200);assert.equal(calls,1);assert.equal(all(f),before);
});
test('Pin estricto, cuerpo y consultas: rechazos no crean marcador; origen/HEAD respetan el servidor',async t=>{
 const f=await open();t.after(()=>f.app.close());activate(f);const before=all(f);assert.equal((await f.status(false)).statusCode,409);assert.equal((await f.app.inject({url:CAP+'?contextRevision='+'0'.repeat(64),headers})).statusCode,409);assert.equal((await f.app.inject({url:CAP+'?contextRevision='+f.pin()+'&extra=1',headers})).statusCode,422);
 for(const payload of [{contextRevision:f.pin(),seedAt:new Date(NOW).toISOString()},{contextRevision:f.pin(),path:'elsewhere'},{}])assert.equal((await f.app.inject({method:'POST',url:CAP+'/activate',headers,payload})).statusCode,422);
 assert.equal((await f.app.inject({method:'POST',url:CAP+'/activate?extra=1',headers,payload:{contextRevision:f.pin()}})).statusCode,422);assert.equal((await f.app.inject({method:'HEAD',url:CAP,headers})).statusCode,404);assert.equal((await f.app.inject({url:CAP+'?contextRevision='+f.pin(),headers:{...headers,origin:'https://external.invalid'}})).statusCode,403);assert.equal(all(f),before);
});
test('Copia de producción no revela ni activa el escenario; marcador previo se conserva',async t=>{
 const f=await open();t.after(()=>f.app.close());activate(f);await f.start();const marker=raw(f);activate(f,false);const before=all(f);const r=await f.status();assert.equal(r.json().status,'not-fiction');assert.equal(r.json().seedAt,null);assert.equal(r.json().canActivate,false);assert.equal((await f.start()).statusCode,409);assert.equal((await f.get()).statusCode,409);assert.equal(raw(f),marker);assert.equal(all(f),before);
});
test('Marcador null/corrupto/de otra instalación no se repara en GET ni POST',async t=>{
 const f=await open();t.after(()=>f.app.close());activate(f);await f.start();const marker=f.store.get<Record<string,unknown>>(KEY,{});
 for(const broken of [null,{...marker,instanceId:randomUUID()},{...marker,datasetRevision:'0'.repeat(64)}]){f.store.set(KEY,broken);const before=all(f);const r=await f.status();assert.equal(r.json().status,'unavailable');assert.equal(r.json().canActivate,false);assert.equal(r.json().datasetRevision,null);assert.equal((await f.start()).statusCode,503);assert.equal((await f.get()).statusCode,503);assert.equal(all(f),before);}
});
test('401 en estado/activación/CORE no revela metadatos y todos llevan no-store/VaryCookie',async t=>{
 const f=await open();t.after(()=>f.app.close());activate(f);await f.start();const setup=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contrasena-ficticia-291'}});assert.equal(setup.statusCode,200);const before=all(f);
 for(const r of [await f.status(),await f.start(),await f.get()]){assert.equal(r.statusCode,401);assert.ok(!r.body.includes('seedAt'));assert.ok(!r.body.includes('ms-installation'));assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers.pragma,'no-cache');assert.match(String(r.headers.vary),/Cookie/i);}assert.equal(all(f),before);
 const cookie=String(setup.headers['set-cookie']).split(';')[0];const allowed=await f.app.inject({url:CAP+'?contextRevision='+f.pin(),headers:{...headers,cookie}});assert.equal(allowed.statusCode,200);assert.equal(allowed.json().status,'available');
});
test('Cambiar contexto o autorización dentro del reloj impide persistir y prioriza401/409',async t=>{
 for(const change of ['context','auth','throw']as const){let mutate=()=>{};const f=await open(':memory:',()=>{mutate();return NOW;});t.after(()=>f.app.close());activate(f);let cookie='';if(change==='auth'){const s=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contrasena-ficticia-291'}});cookie=String(s.headers['set-cookie']).split(';')[0];}
 mutate=()=>{if(change==='context')f.store.set('sessionId','session-changed-fixture');else if(change==='auth')f.store.set('password',null);else throw new Error('dato privado del reloj');};
 const r=await f.app.inject({method:'POST',url:CAP+'/activate',headers:{...headers,...(cookie?{cookie}:{})},payload:{contextRevision:f.pin()}});assert.equal(r.statusCode,change==='auth'?401:change==='context'?409:503);assert.equal(raw(f),undefined);assert.ok(!r.body.includes('dato privado'));
 }
});
test('Fallo de escritura no acredita activación y pérdida posterior al commit no devuelve recibo',async t=>{
 for(const afterCommit of [false,true]){const f=await open();t.after(()=>f.app.close());activate(f);let cookie='';if(afterCommit){const s=await f.app.inject({method:'POST',url:'/api/v2/auth/setup',headers,payload:{password:'contrasena-ficticia-291'}});cookie=String(s.headers['set-cookie']).split(';')[0];}const set=f.store.set.bind(f.store);f.store.set=(key,value)=>{if(key===KEY&&!afterCommit)throw new Error('privado');set(key,value);if(key===KEY&&afterCommit)set('password',null);};
 const r=await f.app.inject({method:'POST',url:CAP+'/activate',headers:{...headers,...(cookie?{cookie}:{})},payload:{contextRevision:f.pin()}});assert.equal(r.statusCode,afterCommit?401:503);assert.ok(!r.body.includes('seedAt'));assert.equal(raw(f)!==undefined,afterCommit);f.store.set=set;
 }
});
test('No responde201si la relectura final ya no puede acreditar la semilla escrita',async t=>{
 const f=await open();t.after(()=>f.app.close());activate(f);const set=f.store.set.bind(f.store);f.store.set=(key,value)=>{set(key,value);if(key===KEY)set(KEY,null);};
 const r=await f.start();assert.equal(r.statusCode,503);assert.ok(!r.body.includes('seedAt'));assert.equal(f.store.get(KEY,'absent'),null,'se conserva el soporte que falló, sin reparar ni sobrescribir');f.store.set=set;
});
test('Archivo: semilla/decisión sobreviven al reinicio y el reloj envejece evidencia, sin cambiosCRM',async()=>{
 const root=fs.mkdtempSync(path.join(tmpdir(),'radar291-'));fs.writeFileSync(path.join(root,'.planb-key'),JSON.stringify({kind:'test',data:randomBytes(32).toString('base64')}),{flag:'wx'});const file=path.join(root,'data.sqlite');let now=NOW,f=await open(file,()=>now);let marker:unknown,originalCRM:string,pin:string;
 try{activate(f);await f.start();marker=raw(f);originalCRM=crm(f);pin=f.pin()!;const detail=commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json());const r=await f.app.inject({method:'POST',url:commitmentPath+'/ms-installation-hubspot/decisions',headers,payload:{contextRevision:pin,expectedRevision:detail.item.revision,operationId:randomUUID(),decision:{type:'assign',owner:'Responsable ficticio291',nextStep:'Revisar pedido',dueAt:new Date(NOW+3600000).toISOString()}}});assert.equal(r.statusCode,200);assert.equal(crm(f),originalCRM);}finally{await f.app.close();}
 now=NOW+25*3600000;f=await open(file,()=>now);try{const before=all(f);assert.equal(f.pin(),pin);assert.equal((await f.status()).json().seedAt,new Date(NOW).toISOString());assert.equal((await f.start()).statusCode,200);assert.equal(raw(f),marker);const detail=commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json());assert.equal(detail.events.length,1);assert.equal(detail.item.action?.owner,'Responsable ficticio291');assert.deepEqual(detail.evidence.map(e=>e.state),['stale','stale','stale']);assert.equal(crm(f),originalCRM);assert.equal(all(f),before);}finally{await f.app.close();}
});
test('Registro repetido con la misma Store es inocuo; otraStore no sustituye la registrada',async t=>{
 const f=await open();t.after(()=>f.app.close());mountCommitmentRadar(f.app,f.store);const other=new Store(':memory:');try{assert.throws(()=>mountCommitmentRadar(f.app,other),/another Store/);}finally{other.close();}assert.equal((await f.status()).statusCode,200);
});
