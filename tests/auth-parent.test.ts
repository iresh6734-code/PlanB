import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
// AUTH_PARENT072 · contrato del padre: el `done` que App entrega a Protection debe esperar la carga confirmada del estado antes de abrir la copia,
// devolver esa promesa a Protection (que solo reintenta la apertura, nunca otra autenticación) y conservar el bloqueo ante un 401.
// Se transpila src/App.tsx (PLANB_APP_SRC apunta a otra copia, p. ej. la versión anterior, para demostrar que los controles fallan por su causa),
// con hooks simulados, hijos sustituidos y un transporte controlado por la prueba. No es un DOM real: el recorrido real está en tests/e2e/auth-parent.spec.ts.
const file=path.resolve(process.env.PLANB_APP_SRC??'src/App.tsx');
const STATE={snapshot:null,spec:null,generation:null,reconciliation:null,disconnected:false,runtime:true,ready:false,changes:0,aiConfigured:false,hubspotConfigured:false,usage:{usedUsd:0,reservedUsd:0,limitUsd:0,requests:0},lastError:null};
type Req={path:string;resolve:(v:any)=>void;reject:(e:Error)=>void;settled:boolean};
function mount(){
 const slots:any[]=[],effects:(()=>void)[]=[],requests:Req[]=[],listeners=new Map<string,Set<()=>void>>();let cursor=0,tree:any,dirty=true;
 const Protection=function Protection(){},Stub=function Stub(){return null;};
 const hooks={
  useState(init:any){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],(v:any)=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
  useRef(init:any){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];},
  useCallback(fn:any,deps:unknown[]){const i=cursor++,old=slots[i];if(old&&deps.every((v,n)=>Object.is(v,old.deps[n])))return old.fn;slots[i]={fn,deps};return fn;},
  useEffect(run:()=>void|(()=>void),deps?:unknown[]){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old.deps?.[n])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:run()};});},
 };
 const jsx=(type:any,props:any,key?:any)=>({type,props,key}),transport=(url:string)=>new Promise<any>((resolve,reject)=>{requests.push({path:url,resolve,reject,settled:false});});
 const dispatch=(name:string)=>listeners.get(name)?.forEach(fn=>fn());
 (globalThis as any).window={addEventListener:(n:string,fn:()=>void)=>{(listeners.get(n)??listeners.set(n,new Set()).get(n)!).add(fn);},removeEventListener:(n:string,fn:()=>void)=>{listeners.get(n)?.delete(fn);},dispatchEvent:(e:{type:string})=>dispatch(e.type)};
 (globalThis as any).document={addEventListener(){},removeEventListener(){},querySelector:()=>null};
 (globalThis as any).Event=class{type:string;constructor(t:string){this.type=t;}};
 const imports=(name:string):any=>{
  if(name==='react')return hooks;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};
  if(name==='lucide-react'||name.endsWith('.css'))return new Proxy({},{get:()=>Stub});
  if(name.endsWith('api.js'))return {api:(url:string)=>transport(url),post:(url:string)=>transport(url)};
  if(name.endsWith('Protection.js'))return {Protection};
  if(name.endsWith('version.js'))return {APP_VERSION:'test'};
  if(name.endsWith('components.js'))return new Proxy({},{get:(_t,key)=>key==='displayValue'||key==='recordName'?()=> '':Stub});
  if(name.endsWith('.js'))return new Proxy({},{get:()=>Stub});
  throw Error('Import inesperado: '+name);
 };
 const mod={exports:{} as any},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','module',code)(imports,mod.exports,mod);
 const render=()=>{cursor=0;dirty=false;tree=mod.exports.default();effects.splice(0).forEach(run=>run());};
 const tick=()=>new Promise<void>(r=>setImmediate(r));
 const flush=async()=>{for(let i=0;i<12;i++){if(dirty||effects.length)render();await tick();if(!dirty&&!effects.length)break;}};
 const pending=(p:string)=>requests.filter(r=>r.path===p&&!r.settled);
 const take=(p:string)=>{const r=pending(p)[0];assert.ok(r,'petición pendiente '+p+' (hay: '+requests.map(x=>x.path+(x.settled?'✓':'…')).join(', ')+')');r.settled=true;return r;};
 return {
  flush,requests,render,
  protection:()=>tree?.type===Protection?tree:null,
  openedApp:()=>!!tree&&tree.type!==Protection&&!(tree.props?.className==='loading-page'),
  tree:()=>tree,
  respond:(p:string,value:any)=>take(p).resolve(value),
  fail:(p:string,error:Error)=>take(p).reject(error),
  // Misma regla que src/api.ts: un 401 «Desbloquea…» avisa a App con planb:locked antes de rechazar.
  fail401:(p:string)=>{const r=take(p);dispatch('planb:locked');r.reject(Object.assign(Error('Desbloquea tu copia local para continuar.'),{status:401}));},
  count:(p:string)=>requests.filter(r=>r.path===p).length,
 };
}
async function locked(){const h=mount();await h.flush();h.respond('/v2/auth/status',{configured:true,authenticated:false});await h.flush();assert.ok(h.protection(),'la copia arranca bloqueada y muestra Protection');return h;}
const quiet=()=>new Promise<void>(r=>setTimeout(r,25));
function watchUnhandled(){const seen:unknown[]=[],on=(e:unknown)=>{seen.push(e);};process.on('unhandledRejection',on);return {seen,stop:()=>process.off('unhandledRejection',on)};}

test('done devuelve la promesa de apertura y no abre la app hasta que el estado confirma la carga',async()=>{
 const h=await locked(),done=h.protection().props.done,result=done();
 assert.ok(result&&typeof result.then==='function','done debe devolver la promesa de la carga para que Protection pueda esperar y reintentar');
 await h.flush();
 assert.equal(h.count('/v2/state'),1,'una sola lectura de estado');
 assert.ok(h.protection(),'Protection sigue en pantalla mientras el estado no se ha confirmado');
 assert.equal(h.openedApp(),false,'la app no se abre con una carga pendiente');
 h.respond('/v2/state',STATE);await result;await h.flush();
 assert.equal(h.protection(),null);assert.equal(h.openedApp(),true,'con el estado confirmado la copia se abre');
});

test('una carga fallida rechaza done, mantiene Protection y no deja un rechazo sin atender',async()=>{
 const watch=watchUnhandled();
 try{
  const h=await locked(),result=h.protection().props.done();await h.flush();
  h.fail('/v2/state',Error('Fixture 500'));
  await assert.rejects(Promise.resolve(result),/Fixture 500/,'el fallo llega a Protection, que mostrará «Reintentar apertura»');
  await h.flush();await quiet();
  assert.ok(h.protection(),'Protection permanece');assert.equal(h.openedApp(),false,'la app no se abrió sobre un estado ausente');
  assert.deepEqual(watch.seen,[],'ningún rechazo sin atender');
 }finally{watch.stop();}
});

test('reintentar tras el fallo solo vuelve a pedir el estado, nunca otra autenticación, y entonces abre',async()=>{
 const h=await locked(),first=h.protection().props.done();await h.flush();h.fail('/v2/state',Error('Fixture 500'));await assert.rejects(Promise.resolve(first));await h.flush();
 const before=h.requests.length,again=h.protection().props.done();await h.flush();
 assert.deepEqual(h.requests.slice(before).map(r=>r.path),['/v2/state'],'el reintento es una lectura de estado y nada más');
 assert.ok(h.protection(),'sigue bloqueado hasta la respuesta');h.respond('/v2/state',STATE);await again;await h.flush();
 assert.equal(h.openedApp(),true);assert.equal(h.requests.filter(r=>/auth\/(login|setup)/.test(r.path)).length,0,'App nunca autentica por su cuenta');
});

test('un 401 al cargar conserva el bloqueo: App vuelve a consultar la puerta y no se abre',async()=>{
 const watch=watchUnhandled();
 try{
  const h=await locked(),before=h.protection().key,result=h.protection().props.done();await h.flush();
  h.fail401('/v2/state');await assert.rejects(Promise.resolve(result),/Desbloquea/);
  await h.flush();
  assert.equal(h.count('/v2/auth/status'),2,'el aviso planb:locked hace que App consulte de nuevo la puerta');
  h.respond('/v2/auth/status',{configured:true,authenticated:false});await h.flush();await quiet();
  assert.ok(h.protection(),'sigue la pantalla de protección');assert.equal(h.openedApp(),false);
  assert.notEqual(h.protection().key,before,'el bloqueo remonta Protection: formulario nuevo, no el modo «acuse confirmado» sin campos');
  assert.deepEqual(watch.seen,[]);
 }finally{watch.stop();}
});
