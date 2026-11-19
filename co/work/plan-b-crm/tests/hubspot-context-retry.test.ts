import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {randomBytes} from 'node:crypto';
import {embeddedDatabase,type TeamDatabase} from '../server/team/database.js';
import {teamSchema} from '../server/team/schema.js';
import {TeamRepository} from '../server/team/repository.js';
import {TeamOAuth} from '../server/team/oauth.js';
import {seal} from '../server/crypto.js';
import {AppError} from '../server/store.js';
let db:TeamDatabase,repo:TeamRepository;
const user={uid:'retry-contract',email:'retry@example.test'},settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});after(async()=>{await db?.close();});
const limited=(header:string|null='1')=>new Response('PRIVATE_REMOTE_ERROR',{status:429,headers:header===null?{}:{'Retry-After':header}});
const contact=(withDetail=false)=>Response.json({id:'42',properties:{},associations:withDetail?{notes:{results:[{id:'7'}]}}:{}});
async function setup(owners=false){
  const space=await repo.createSpace(user,'Retry contract'),key=randomBytes(32),requests:{path:string;authorization:string|null;signal:AbortSignal}[]=[],waiters=new Map<number,()=>void>();
  let respond:(path:string,attempt:number)=>Promise<Response>=async()=>contact();
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.method??'GET',url.pathname.endsWith('/search')?'POST':'GET');assert.equal(init?.redirect,'error');requests.push({path:url.pathname,authorization:new Headers(init?.headers).get('authorization'),signal:init?.signal as AbortSignal});waiters.get(requests.length)?.();return respond(url.pathname,requests.length);};
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',seal(JSON.stringify({kind:'private',access_token:'synthetic-retry-token',scopes:owners?['crm.objects.owners.read']:[]}),key),'2026-10-29','2099-01-01']));
  const oauth=new TeamOAuth(repo,null,fetcher,key);
  return {space,requests,override:(fn:typeof respond)=>{respond=fn;},reached:(n:number)=>requests.length>=n?Promise.resolve():new Promise<void>(resolve=>waiters.set(n,resolve)),read:(options={timeoutMs:10000,requestTimeoutMs:6000} as {timeoutMs?:number;requestTimeoutMs?:number;signal?:AbortSignal})=>oauth.context(space.id,'42',{accountId:'123',mode:'test'},options)};
}
test('429: espera segundos indicados y recupera con un único reintento de la misma lectura',{timeout:10000},async t=>{
  const s=await setup();s.override(async(_,attempt)=>attempt===1?limited('1'):contact());t.mock.timers.enable({apis:['setTimeout']});const result=s.read();await s.reached(1);await settle();t.mock.timers.tick(999);await settle();assert.equal(s.requests.length,1);t.mock.timers.tick(1);assert.equal((await result).contactId,'42');assert.equal(s.requests.length,2);assert.equal(s.requests[0].path,s.requests[1].path);assert.equal(s.requests[0].authorization,s.requests[1].authorization);assert.equal(s.requests[0].signal,s.requests[1].signal);
});
test('429: fecha HTTP futura se respeta; una fecha pasada permite un único reintento inmediato',{timeout:10000},async t=>{
  for(const seconds of [2,-2]){const s=await setup();t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,9,29,14,0,0)});const header=new Date(Date.now()+seconds*1000).toUTCString();s.override(async(_,attempt)=>attempt===1?limited(header):contact());const result=s.read();await s.reached(1);await settle();if(seconds>0){t.mock.timers.tick(1999);await settle();assert.equal(s.requests.length,1);t.mock.timers.tick(1);}else t.mock.timers.tick(0);await result;assert.equal(s.requests.length,2);t.mock.timers.reset();}
});
test('429: cabecera ausente o malformada usa un segundo de espera y no una fecha numérica accidental',{timeout:10000},async t=>{
  for(const header of [null,'-1','1.5','invalid-date']){const s=await setup();s.override(async(_,attempt)=>attempt===1?limited(header):contact());t.mock.timers.enable({apis:['setTimeout']});const result=s.read();await s.reached(1);await settle();t.mock.timers.tick(999);await settle();assert.equal(s.requests.length,1);t.mock.timers.tick(1);await result;assert.equal(s.requests.length,2);t.mock.timers.reset();}
});
test('429: una espera larga no se recorta para reintentar antes de lo indicado',{timeout:10000},async t=>{
  for(const header of ['6','9999999999999999999999999999999999999999999999999999','Thu, 29 Oct 2099 14:00:00 GMT']){const s=await setup();s.override(async()=>limited(header));t.mock.timers.enable({apis:['setTimeout']});await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===502&&!error.message.includes('PRIVATE_REMOTE_ERROR'));assert.equal(s.requests.length,1);t.mock.timers.tick(10000);await settle();assert.equal(s.requests.length,1);t.mock.timers.reset();}
});
test('429: si vuelve a limitar, termina tras dos intentos sin exponer el cuerpo remoto',{timeout:10000},async t=>{
  const s=await setup();s.override(async()=>limited('0'));t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read(),error=>error instanceof AppError&&error.status===502&&!error.message.includes('PRIVATE_REMOTE_ERROR'));await s.reached(1);await settle();t.mock.timers.tick(0);await result;assert.equal(s.requests.length,2);t.mock.timers.tick(30000);await settle();assert.equal(s.requests.length,2);
});
test('429: la espera comparte los plazos originales, sin segundo intento tras agotarlos',{timeout:10000},async t=>{
  for(const total of [true,false]){const s=await setup();s.override(async()=>limited('1'));t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read({timeoutMs:total?500:5000,requestTimeoutMs:total?5000:500}),error=>error instanceof AppError&&error.status===504);await s.reached(1);await settle();t.mock.timers.tick(500);await result;assert.equal(s.requests.length,1);assert.equal(s.requests[0].signal.aborted,true);t.mock.timers.tick(30000);await settle();assert.equal(s.requests.length,1);t.mock.timers.reset();}
});
test('429: JSON del segundo intento no obtiene un plazo nuevo',{timeout:10000},async t=>{
  const s=await setup();let bodyResolve!:(value:unknown)=>void,bodyStarted!:()=>void;const body=new Promise(resolve=>bodyResolve=resolve),entered=new Promise<void>(resolve=>bodyStarted=resolve);
  s.override(async(_,attempt)=>{if(attempt===1)return limited('1');const response=Response.json({});response.json=()=>{bodyStarted();return body;};return response;});
  t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read({timeoutMs:5000,requestTimeoutMs:1500}),error=>error instanceof AppError&&error.status===504&&/una lectura/.test(error.message));await s.reached(1);await settle();t.mock.timers.tick(1000);await entered;t.mock.timers.tick(499);assert.equal(s.requests[1].signal.aborted,false);t.mock.timers.tick(1);await result;assert.equal(s.requests[1].signal.aborted,true);bodyResolve({id:'42',properties:{},associations:{notes:{results:[{id:'must-not-read'}]}}});await settle();assert.equal(s.requests.length,2);
});
test('429: cancelación durante espera limpia listeners y evita otro intento',{timeout:10000},async t=>{
  const s=await setup(),controller=new AbortController();s.override(async()=>limited('1'));t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read({signal:controller.signal}),error=>error instanceof AppError&&error.status===409);await s.reached(1);await settle();controller.abort();await result;assert.equal(getEventListeners(controller.signal,'abort').length,0);assert.equal(getEventListeners(s.requests[0].signal,'abort').length,0);t.mock.timers.tick(30000);await settle();assert.equal(s.requests.length,1);
});
test('429: revalida portal al terminar la espera, antes de repetir la petición',{timeout:10000},async t=>{
  const s=await setup();s.override(async()=>limited('1'));t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read(),error=>error instanceof AppError&&error.status===409);await s.reached(1);await settle();await repo.disconnectHubspot(s.space.id,user);t.mock.timers.tick(1000);await result;assert.equal(s.requests.length,1);
});
test('429: search404 tras reintento es fatal;404 de propietario sigue opcional; errores no429 no se reintentan',{timeout:10000},async t=>{
  const s=await setup();s.override(async(_,attempt)=>attempt===1?contact(true):attempt===2?limited('0'):new Response('',{status:404}));t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read(),error=>error instanceof AppError&&error.status===502);await s.reached(2);await settle();t.mock.timers.tick(0);await result;assert.equal(s.requests.length,3);t.mock.timers.reset();
  const owner=await setup(true);owner.override(async(path,attempt)=>path.includes('/contacts/')?Response.json({id:'42',properties:{hubspot_owner_id:'7'},associations:{}}):attempt===2?limited('0'):new Response('',{status:404}));t.mock.timers.enable({apis:['setTimeout']});const ownerRead=owner.read();await owner.reached(2);await settle();t.mock.timers.tick(0);const missing=await ownerRead;assert.equal(missing.owner,null);assert.match(missing.description,/propietario.*no está disponible/);assert.equal(owner.requests.length,3);t.mock.timers.reset();
  for(const status of [401,403,404,500,503]){const failure=await setup();failure.override(async()=>new Response('',{status,headers:{'Retry-After':'0'}}));await assert.rejects(failure.read(),error=>error instanceof AppError&&error.status===(status===403?403:502));assert.equal(failure.requests.length,1);}
});
test('429: libera el cuerpo descartado y un fallo de cancelación no oculta la política',{timeout:10000},async t=>{
  for(const mode of ['retry','long','cancel-error','cancel-hangs']){
    const s=await setup();let cancelled=0;s.override(async(_,attempt)=>attempt===1?new Response(new ReadableStream({cancel(){cancelled++;if(mode==='cancel-error')return Promise.reject(new Error('PRIVATE_CANCEL_FAILURE'));if(mode==='cancel-hangs')return new Promise<void>(()=>{});}}),{status:429,headers:{'Retry-After':mode==='long'?'6':'0'}}):contact());t.mock.timers.enable({apis:['setTimeout']});
    if(mode==='long')await assert.rejects(s.read(),error=>error instanceof AppError&&error.status===502);else {const result=s.read();await s.reached(1);await settle();t.mock.timers.tick(0);await result;}
    assert.equal(cancelled,1);assert.equal(s.requests.length,mode==='long'?1:2);t.mock.timers.reset();
  }
});
test('429: límite máximo de catorce intentos conserva ocho objetos de cinco búsquedas y propietario',{timeout:10000},async t=>{
  const s=await setup(true),seen=new Map<string,number>(),kinds=['notes','tasks','meetings','calls','emails'];
  s.override(async path=>{const attempt=(seen.get(path)??0)+1;seen.set(path,attempt);if(attempt===1)return limited('0');if(path.includes('/contacts/'))return Response.json({id:'42',properties:{hubspot_owner_id:'7'},associations:Object.fromEntries(kinds.map(kind=>[kind,{results:[{id:kind+'-1'},{id:kind+'-2'}]}]))});if(path.includes('/owners/'))return Response.json({id:'7',firstName:'Contract'});const kind=path.split('/')[4],count=['notes','tasks','meetings'].includes(kind)?2:1;return Response.json({results:Array.from({length:count},(_,i)=>({id:kind+'-'+i,properties:{hs_createdate:'2026-10-29T10:00:00Z'}}))});});
  t.mock.timers.enable({apis:['setTimeout']});const result=s.read();for(let logical=0;logical<7;logical++){await s.reached(logical*2+1);await settle();t.mock.timers.tick(0);}const data=await result;assert.equal(data.timeline.length,8);assert.equal(data.owner?.name,'Contract');assert.equal(s.requests.length,14);assert.ok([...seen.values()].every(attempt=>attempt===2));assert.equal(new Set(data.timeline.map(item=>item.kind)).size,5);
});
