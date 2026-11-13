import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { preparationTarget, type ActivationReview } from '../shared/activation-review.js';
import type { AppState } from '../shared/model.js';

const file=process.env.PLANB_PREPARATION_SRC?path.resolve(process.env.PLANB_PREPARATION_SRC):path.resolve('src/Preparation.tsx');
function state():AppState {
  const active=makeFixture('agency'),candidate=makeFixture('distribution'),generation={provider:'demo' as const,model:null,generatedAt:'2026-10-30T12:00:00Z',prompt:'',approved:false};
  const candidateSpec=makeDemoSpec(candidate);candidateSpec.entities[0].fields[0].label='CANDIDATE-SCHEMA-066';
  return {snapshot:active,spec:makeDemoSpec(active),generation:{...generation,approved:true},reconciliation:{complete:true,counts:{},expectedLinks:0,actualLinks:0,errors:[]},runtime:false,ready:true,changes:0,disconnected:false,aiConfigured:false,hubspotConfigured:false,usage:{usedUsd:0,reservedUsd:0,limitUsd:25,requests:0},lastError:null,aiSettings:null,candidate:{snapshot:candidate,spec:candidateSpec,generation,reconciliation:{complete:true,counts:{},expectedLinks:0,actualLinks:0,errors:[]},error:null}};
}
function review(source=state(),revision='1'.repeat(64)):ActivationReview {
  const target=preparationTarget(source);return {revision,kind:source.candidate?'candidate':'initial',target:{snapshot:target.snapshot,spec:target.spec,generation:target.generation,reconciliation:target.reconciliation,error:target.lastError},records:62,localChanges:0,replacesRecords:true,replacementConfirmed:false,canActivate:!!target.spec&&!target.lastError,reasons:target.lastError?[target.lastError]:[]};
}
function mount(initial=state(),refreshOverride?:()=>Promise<AppState>) {
  const slots:any[]=[],effects:(()=>void)[]=[],requests:{path:string;method:string;body:any;signal?:AbortSignal;resolve:(v:any)=>void;reject:(e:Error)=>void}[]=[],errors:string[]=[],steps:number[]=[];let propsState=initial,cursor=0,tree:any,writes=0,opened=0,refreshes=0,step=2;
  const hooks={useState(init:any){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],(v:any)=>{writes++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(init:any){const i=cursor++;return slots[i]??(slots[i]={current:init});},useEffect(run:()=>void|(()=>void),deps?:unknown[]){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old.deps?.[n])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:run()};});}};
  const jsx=(type:any,props:any)=>({type,props});class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
  const transport=(url:string,method:string,body?:any,signal?:AbortSignal)=>new Promise((resolve,reject)=>requests.push({path:url,method,body,signal,resolve,reject}));
  const imports=(name:string):any=>{if(name==='react')return hooks;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};if(name==='lucide-react')return new Proxy({},{get:()=>function Icon(){}});if(name.endsWith('.css'))return {};if(name.endsWith('activation-review.js'))return {preparationTarget};if(name.endsWith('api.js'))return {ApiError,api:(url:string,init?:RequestInit)=>transport(url,init?.method??'GET',init?.body?JSON.parse(String(init.body)):undefined,init?.signal??undefined),post:(url:string,body:any)=>transport(url,'POST',body)};if(name.endsWith('components.js'))return {Modal:function Modal(){},Spinner:function Spinner(){}};throw Error('Unexpected '+name);};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{} as any};new Function('require','exports','module',code)(imports,mod.exports,mod);const Component=mod.exports.Preparation;
  const walk=(node:any):any[]=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[],flat=(node:any):string=>Array.isArray(node)?node.map(flat).join(''):typeof node==='string'||typeof node==='number'?String(node):node?.props?flat(node.props.children):'';
  const render=(next?:AppState,nextStep=step)=>{if(next)propsState=next;step=nextStep;cursor=0;tree=Component({state:propsState,step,setStep:(v:number)=>steps.push(v),refresh:async()=>{refreshes++;return refreshOverride?refreshOverride():propsState;},openWorkspace:()=>opened++,configure(){},onConnect(){},onError:(message:string)=>errors.push(message)});effects.splice(0).forEach(run=>run());};
  const nodes=()=>walk(tree),tags=(tag:string)=>nodes().filter(n=>n.type===tag),text=()=>flat(tree),button=(name:string)=>{const b=tags('button').find(n=>flat(n)===name);assert.ok(b,'Missing button '+name);return b;};
  const check=()=>{tags('input').find(n=>n.props.type==='checkbox')!.props.onChange({target:{checked:true}});render();};
  render();return {render,nodes,tags,text,button,check,requests,errors,steps,opened:()=>opened,refreshes:()=>refreshes,writes:()=>writes,unmount:()=>slots.forEach(s=>s?.cleanup?.()),ApiError};
}
const settle=()=>new Promise<void>(r=>setImmediate(r));
async function loaded(h:ReturnType<typeof mount>,data=review()) {const request=h.requests.filter(r=>r.method==='GET').at(-1);if(request){request.resolve(data);await settle();h.render();}}

test('review shows the actual candidate schema instead of the older active application',async()=>{
  const h=mount();await loaded(h);assert.match(h.text(),/CANDIDATE-SCHEMA-066/);assert.match(h.text(),/Versión candidata/);assert.match(h.text(),/Distribuidora Atlas/);
});
test('missing or failed candidate spec never falls back to the valid active schema',async()=>{
  const source=state();source.candidate!.spec=null;source.candidate!.error='CANDIDATE-FAILED-066';const h=mount(source);await loaded(h,review(source));assert.match(h.text(),/CANDIDATE-FAILED-066/);assert.doesNotMatch(h.text(),/Revisa tu aplicación\./);assert.ok(!h.tags('button').some(b=>b.props.children==='Activar y abrir aplicación'));
});
test('approval is retired when the source context changes, even before the next GET returns',async()=>{
  const h=mount();await loaded(h);h.check();assert.equal(h.button('Activar y abrir aplicación').props.disabled,false);
  const next=state();next.candidate!.spec!.description='Another target';h.render(next);assert.ok(!h.tags('input').some(n=>n.props.type==='checkbox'&&n.props.checked));await loaded(h,review(next,'2'.repeat(64)));assert.equal(h.button('Activar y abrir aplicación').props.disabled,true);
});
test('explicit refresh clears approval even if the effective revision did not change',async()=>{
  const h=mount();await loaded(h);h.check();h.button('Actualizar revisión').props.onClick();h.render();await loaded(h);assert.equal(h.button('Activar y abrir aplicación').props.disabled,true);
});
test('double activation sends one exact revision and opens only after the verified acknowledgment and refresh',async()=>{
  const h=mount();await loaded(h);h.check();const activate=h.button('Activar y abrir aplicación').props.onClick;activate();activate();assert.equal(h.requests.filter(r=>r.method==='POST').length,1);const request=h.requests.find(r=>r.method==='POST')!;assert.equal(request.path,'/v4/activate-reviewed');assert.deepEqual(request.body,{reviewed:true,revision:'1'.repeat(64)});assert.equal(h.opened(),0);request.resolve({ready:true,reviewedRevision:'1'.repeat(64)});await settle();assert.equal(h.opened(),1);assert.equal(h.refreshes(),1);
});
test('409 never opens workspace or silently retries activation; it loads new content with approval removed',async()=>{
  const h=mount();await loaded(h);h.check();h.button('Activar y abrir aplicación').props.onClick();h.requests.find(r=>r.method==='POST')!.reject(new h.ApiError(409,'Fixture changed'));await settle();h.render();assert.equal(h.opened(),0);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);await loaded(h,review(state(),'2'.repeat(64)));assert.equal(h.button('Activar y abrir aplicación').props.disabled,true);assert.ok(h.errors.includes('Fixture changed'));
});
test('a valid late preview from the previous context never replaces the new authoritative target',async()=>{
  const h=mount(),old=h.requests[0];const next=state();next.candidate!.spec!.entities[0].fields[0].label='NEWER-SCHEMA-066';h.render(next);await loaded(h,review(next,'2'.repeat(64)));assert.match(h.text(),/NEWER-SCHEMA-066/);assert.equal(old.signal?.aborted,true);old.resolve(review());await settle();h.render();assert.match(h.text(),/NEWER-SCHEMA-066/);assert.doesNotMatch(h.text(),/CANDIDATE-SCHEMA-066/);
});
test('old-server404 never falls back to the unbound legacy activation endpoint',async()=>{
  const h=mount();h.requests[0].reject(new h.ApiError(404,'Fixture old server'));await settle();h.render();assert.match(h.text(),/no permite activar una revisión exacta/);assert.ok(!h.tags('button').some(b=>b.props.children==='Activar y abrir aplicación'));assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('unmount during preview ignores late values without state writes or navigation',async()=>{
  const h=mount();h.unmount();const writes=h.writes();h.requests[0].resolve(review());await settle();assert.equal(h.writes(),writes);assert.equal(h.opened(),0);
});
test('failed activation followed by failed refresh stays handled and never advances the wizard',async()=>{
  const h=mount(state(),async()=>{throw Error('Fixture refresh failure');});await loaded(h);h.check();h.button('Activar y abrir aplicación').props.onClick();h.requests.find(r=>r.method==='POST')!.reject(Error('Fixture commit failure'));await settle();h.render();assert.equal(h.opened(),0);assert.deepEqual(h.steps,[]);assert.match(h.errors.at(-1)!,/Vuelve a consultar/);
});
test('the processes step also reads candidate capture/configuration rather than the active snapshot',()=>{
  const h=mount();h.render(undefined,1);assert.match(h.text(),/Distribuidora Atlas/);assert.doesNotMatch(h.text(),/Agencia Norte/);
});

test('context A-B-A retires the old response and approval while the new A request is pending (QA073D1)',async()=>{
 const original=state(),h=mount(original);await loaded(h,review(original));h.check();
 const other=structuredClone(original);other.candidate!.spec!.title='A different candidate';h.render(other);h.render(original);
 assert.ok(!h.tags('input').some(n=>n.props.type==='checkbox'&&n.props.checked));
 assert.ok(!h.tags('button').some(n=>n.props.disabled===false&&Array.isArray(n.props.children)&&String(n.props.children).includes('Activar y abrir')));
 await loaded(h,review(original));assert.equal(h.button('Activar y abrir aplicación').props.disabled,true);
});
