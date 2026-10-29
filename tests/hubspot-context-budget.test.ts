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
const user={uid:'budget-contract',email:'budget@example.test'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>{await db?.close();});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function setup(){
  const space=await repo.createSpace(user,'Context budget contract'),key=randomBytes(32),requests:{path:string;signal:AbortSignal}[]=[];
  let transport:undefined|((path:string,signal:AbortSignal)=>Promise<Response>);
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.method??'GET','GET');assert.equal(init?.redirect,'error');const signal=init?.signal as AbortSignal;assert.ok(signal);requests.push({path:url.pathname,signal});
    if(transport)return transport(url.pathname,signal);
    return Response.json({id:'42',properties:{},associations:{}});
  };
  await repo.system(space.id,sql=>sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[space.id,'123','DEVELOPER_TEST','readonly',seal(JSON.stringify({kind:'private',access_token:'synthetic-budget-token',scopes:['crm.objects.owners.read']}),key),'2026-10-29','2099-01-01']));
  const oauth=new TeamOAuth(repo,null,fetcher,key);
  return {space,requests,override:(fn:NonNullable<typeof transport>)=>{transport=fn;},read:(options={timeoutMs:100,requestTimeoutMs:90} as {timeoutMs?:number;requestTimeoutMs?:number;signal?:AbortSignal})=>oauth.context(space.id,'42',{accountId:'123',mode:'test'},options)};
}
const timeout=(error:unknown)=>error instanceof AppError&&error.status===504;

test('presupuesto: contacto y detalles comparten plazo absoluto;404 no reinicia el reloj',{timeout:10000},async t=>{
  const s=await setup(),contact=deferred<Response>(),detail=deferred<Response>(),last=deferred<Response>(),firstEntered=deferred<void>(),secondEntered=deferred<void>(),lastEntered=deferred<void>();
  s.override(async path=>{if(path.includes('/contacts/')){firstEntered.resolve();return contact.promise;}if(path.endsWith('/gone')){secondEntered.resolve();return detail.promise;}lastEntered.resolve();return last.promise;});
  t.mock.timers.enable({apis:['setTimeout']});
  const read=s.read(),result=assert.rejects(read,error=>timeout(error)&&/total/.test((error as Error).message));await firstEntered.promise;t.mock.timers.tick(40);
  contact.resolve(Response.json({id:'42',properties:{},associations:{notes:{results:[{id:'gone'}]},emails:{results:[{id:'kept'}]}}}));await secondEntered.promise;t.mock.timers.tick(40);
  detail.resolve(new Response('',{status:404}));await lastEntered.promise;t.mock.timers.tick(20);await result;assert.equal(s.requests.length,3);assert.equal(s.requests[2].signal.aborted,true);
  last.reject(new Error('LATE_REJECTION_CONSUMED'));await settle();assert.equal(s.requests.length,3);
});
test('presupuesto: transporte que ignora señal termina por timeout individual y consume rechazo tardío',{timeout:10000},async t=>{
  const s=await setup(),pending=deferred<Response>(),entered=deferred<void>();s.override(async()=>{entered.resolve();return pending.promise;});t.mock.timers.enable({apis:['setTimeout']});
  const result=assert.rejects(s.read({timeoutMs:100,requestTimeoutMs:40}),error=>timeout(error)&&/una lectura/.test((error as Error).message));await entered.promise;t.mock.timers.tick(40);await result;assert.equal(s.requests[0].signal.aborted,true);
  pending.reject(new Error('IGNORED_TRANSPORT_LATE'));await settle();assert.equal(s.requests.length,1);
});
test('presupuesto: lectura del cuerpo JSON también está acotada',{timeout:10000},async t=>{
  const s=await setup(),body=deferred<any>(),entered=deferred<void>();s.override(async()=>{const response=Response.json({});response.json=()=>{entered.resolve();return body.promise;};return response;});t.mock.timers.enable({apis:['setTimeout']});
  const result=assert.rejects(s.read({timeoutMs:40,requestTimeoutMs:90}),error=>timeout(error)&&/total/.test((error as Error).message));await entered.promise;t.mock.timers.tick(40);await result;assert.equal(s.requests[0].signal.aborted,true);
  body.resolve({id:'42',properties:{},associations:{notes:{results:[{id:'must-not-read'}]}}});await settle();assert.equal(s.requests.length,1);
});
test('presupuesto: último propietario comparte plazo y no devuelve éxito parcial por timeout',{timeout:10000},async t=>{
  const s=await setup(),contact=deferred<Response>(),owner=deferred<Response>(),entered=deferred<void>(),ownerEntered=deferred<void>();s.override(async path=>{if(path.includes('/contacts/')){entered.resolve();return contact.promise;}ownerEntered.resolve();return owner.promise;});t.mock.timers.enable({apis:['setTimeout']});
  const result=assert.rejects(s.read(),timeout);await entered.promise;t.mock.timers.tick(70);contact.resolve(Response.json({id:'42',properties:{hubspot_owner_id:'7'},associations:{}}));await ownerEntered.promise;t.mock.timers.tick(30);await result;assert.equal(s.requests.length,2);assert.equal(s.requests[1].signal.aborted,true);owner.resolve(Response.json({id:'7',firstName:'Late'}));await settle();
});
test('presupuesto: cancelación previa y durante lectura son seguras y limpian listeners',{timeout:10000},async t=>{
  const before=await setup(),already=new AbortController();already.abort(new Error('CALLER_SECRET'));await assert.rejects(before.read({signal:already.signal}),error=>error instanceof AppError&&error.status===409&&!error.message.includes('CALLER_SECRET'));assert.equal(before.requests.length,0);
  const s=await setup(),controller=new AbortController(),pending=deferred<Response>(),entered=deferred<void>();s.override(async()=>{entered.resolve();return pending.promise;});t.mock.timers.enable({apis:['setTimeout']});const count=getEventListeners(controller.signal,'abort').length;
  const result=assert.rejects(s.read({signal:controller.signal}),error=>error instanceof AppError&&error.status===409&&!error.message.includes('CALLER_SECRET'));await entered.promise;assert.equal(getEventListeners(controller.signal,'abort').length,count+1);controller.abort(new Error('CALLER_SECRET'));await result;assert.equal(s.requests[0].signal.aborted,true);assert.equal(getEventListeners(controller.signal,'abort').length,count);pending.reject(new Error('LATE_CANCELLED'));await settle();
});
test('presupuesto: éxito y error limpian timers; no abortan señales de otra lectura posterior',{timeout:10000},async t=>{
  const s=await setup(),controller=new AbortController();t.mock.timers.enable({apis:['setTimeout']});const result=await s.read({signal:controller.signal});assert.equal(result.contactId,'42');assert.equal(getEventListeners(controller.signal,'abort').length,0);t.mock.timers.tick(30001);assert.equal(s.requests[0].signal.aborted,false);
  const failing=await setup();failing.override(async()=>new Response('',{status:403}));await assert.rejects(failing.read({signal:controller.signal}),error=>error instanceof AppError&&error.status===403);assert.equal(getEventListeners(controller.signal,'abort').length,0);t.mock.timers.tick(30001);assert.equal(failing.requests[0].signal.aborted,false);
});
test('presupuesto: resultado de fetch tardío no llega a leer su cuerpo',{timeout:10000},async t=>{
  const s=await setup(),pending=deferred<Response>(),entered=deferred<void>();let parsed=0;s.override(async()=>{entered.resolve();return pending.promise;});t.mock.timers.enable({apis:['setTimeout']});const result=assert.rejects(s.read(),timeout);await entered.promise;t.mock.timers.tick(100);await result;
  const response=Response.json({});response.json=async()=>{parsed++;return {id:'42'};};pending.resolve(response);await settle();assert.equal(parsed,0);assert.equal(s.requests.length,1);
});
test('presupuesto: opciones internas no amplían límites ni llaman al proveedor si son inválidas',async()=>{
  const s=await setup();for(const options of [{timeoutMs:0},{timeoutMs:30001},{requestTimeoutMs:12001},{requestTimeoutMs:-1},{timeoutMs:NaN},{timeoutMs:1.5}])await assert.rejects(s.read(options));assert.equal(s.requests.length,0);
});
