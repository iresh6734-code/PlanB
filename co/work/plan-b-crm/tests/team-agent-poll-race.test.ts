import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Real component and callbacks, controlled hooks/JSX and deferred transport.
// No React DOM, browser, model, or remote service is used.
const compiled=ts.transpileModule(fs.readFileSync(new URL('../src/TeamAgentWorkspace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
type Request={path:string;resolve:(value:any)=>void;reject:(error:Error)=>void};
function overview(label:string,status='running'){return {configured:false,connected:false,monthlyLimit:100,source:null,priorities:[{id:'opp',contactId:'42',label,reason:'Reason',stage:'Stage'}],runs:[{id:'run',status,provider:'ollama',model:'synthetic',created_at:'2026-10-29T12:00:00Z',result:null}]};}
function harness(){
  const slots:any[]=[],requests:Request[]=[];let cursor=0,writes=0,tree:any,props:any={tenant:'T1',canWrite:true,canConnect:true,onProposal(){},pollMs:10};let effects:(()=>void)[]=[];
  const hooks={
    useState(initial:any){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],(value:any)=>{writes++;slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial:any){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
    useId(){const i=cursor++;return slots[i]??(slots[i]='test-id-'+i);},
    useEffect(run:()=>void|(()=>void),deps:unknown[]){const i=cursor++,prior=slots[i];if(!prior||deps.some((v,n)=>!Object.is(v,prior.deps[n])))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:run()};});}
  };
  const jsx=(type:any,props:any)=>({type,props}),mod:{exports:any}={exports:{}};
  const require=(name:string)=>{if(name==='react')return hooks;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};if(name==='./components.js')return {Spinner:()=>null};if(name==='./LoadError.js')return {LoadError:()=>null};if(name.endsWith('.css'))return {};throw Error('Unexpected dependency: '+name);};
  new Function('require','exports','module',compiled)(require,mod.exports,mod);
  const call=(path:string)=>new Promise((resolve,reject)=>requests.push({path,resolve,reject}));
  const render=(next:any={})=>{props={...props,...next};cursor=0;tree=mod.exports.TeamAgentWorkspace({...props,call});const pending=effects;effects=[];pending.forEach(run=>run());};
  const nodes=(node:any):any[]=>Array.isArray(node)?node.flatMap(nodes):node?.props?[node,...nodes(node.props.children)]:[];
  const text=(node:any=tree):string=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'||typeof node==='number'?String(node):node?.props?text(node.props.children):'';
  const button=(label:string)=>{const node=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(node,'Button missing: '+label);return node;};
  const unmount=()=>{for(const slot of slots)slot?.cleanup?.();};
  return {render,requests,button,text,writes:()=>writes,unmount};
}
async function boot(){const h=harness();h.render();h.requests[0].resolve(overview('INITIAL'));await settle();h.render();return h;}

test('sondeo tardío: no sustituye una actualización manual ya completada',async t=>{
  t.mock.timers.enable({apis:['setInterval']});const h=await boot();
  try{t.mock.timers.tick(10);assert.equal(h.requests.length,2);h.button('Actualizar').props.onClick();await settle();assert.equal(h.requests.length,3);
    // Keep the polling cycle alive: stopping it would mask a missing read revision guard.
    h.requests[2].resolve(overview('LATEST_MANUAL'));await settle();h.render();assert.match(h.text(),/LATEST_MANUAL/);
    h.requests[1].resolve(overview('STALE_POLL'));await settle();h.render();assert.match(h.text(),/LATEST_MANUAL/);assert.doesNotMatch(h.text(),/STALE_POLL/);
  }finally{h.unmount();}
});
test('sondeo tardío: iniciar una acción invalida el sondeo incluso antes de su recarga',async t=>{
  t.mock.timers.enable({apis:['setInterval']});const h=await boot();
  try{t.mock.timers.tick(10);h.button('Revisar contexto').props.onClick();h.render();assert.ok(h.requests[2].path.endsWith('/preview/opp'));
    h.requests[1].resolve(overview('STALE_DURING_ACTION'));await settle();h.render();assert.doesNotMatch(h.text(),/STALE_DURING_ACTION/);assert.match(h.text(),/INITIAL/);
    h.requests[2].resolve({opportunityId:'opp',revision:'r1',contactId:'42',context:[],draft:{subject:'Preview',body:'Body'}});await settle();assert.equal(h.requests.length,4);h.requests[3].resolve(overview('LATEST_ACTION','succeeded'));await settle();h.render();assert.match(h.text(),/LATEST_ACTION/);
  }finally{h.unmount();}
});
test('sondeo tardío: ni resultado ni error escriben estado tras desmontar',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  for(const failure of [false,true]){const h=await boot();t.mock.timers.tick(10);h.unmount();const before=h.writes();if(failure)h.requests[1].reject(new Error('OLD_FAILURE'));else h.requests[1].resolve(overview('UNMOUNTED'));await settle();assert.equal(h.writes(),before);t.mock.timers.tick(30);assert.equal(h.requests.length,2);}
});
test('sondeo tardío: pausar descarta la respuesta en vuelo y reanudar no solapa sondeos',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  for(const resumeBeforeReply of [false,true]){const h=await boot();
  try{t.mock.timers.tick(10);h.render({paused:true});t.mock.timers.tick(30);assert.equal(h.requests.length,2);
    if(resumeBeforeReply){h.render({paused:false});t.mock.timers.tick(30);assert.equal(h.requests.length,2,'resume waits for the old poll transport to settle');}
    h.requests[1].resolve(overview('STALE_WHILE_PAUSED'));await settle();h.render();assert.doesNotMatch(h.text(),/STALE_WHILE_PAUSED/);
    h.render({paused:false});t.mock.timers.tick(10);assert.equal(h.requests.length,3);t.mock.timers.tick(50);assert.equal(h.requests.length,3,'one poll in flight');h.requests[2].resolve(overview('RESUMED','succeeded'));await settle();h.render();assert.match(h.text(),/RESUMED/);
  }finally{h.unmount();}}
});
test('recarga tardía: respuesta de Actualizar tras desmontar no escribe estado',async()=>{
  for(const failure of [false,true]){const h=await boot();h.button('Actualizar').props.onClick();await settle();assert.equal(h.requests.length,2);h.unmount();const before=h.writes();if(failure)h.requests[1].reject(new Error('UNMOUNTED_MANUAL_FAILURE'));else h.requests[1].resolve(overview('UNMOUNTED_MANUAL','succeeded'));await settle();assert.equal(h.writes(),before);}
});
test('sondeo: error silencioso permite reintento y una lectura vigente actualiza',async t=>{
  t.mock.timers.enable({apis:['setInterval']});const h=await boot();
  try{t.mock.timers.tick(10);h.requests[1].reject(new Error('TRANSIENT_POLL'));await settle();h.render();assert.doesNotMatch(h.text(),/TRANSIENT_POLL/);t.mock.timers.tick(10);assert.equal(h.requests.length,3);h.requests[2].resolve(overview('CURRENT_SUCCESS','succeeded'));await settle();h.render();assert.match(h.text(),/CURRENT_SUCCESS/);t.mock.timers.tick(30);assert.equal(h.requests.length,3);}
  finally{h.unmount();}
});
