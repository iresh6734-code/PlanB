import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { RecordSchema, type CrmRecord } from '../shared/model.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

// Controlled hook slots and deferred transport, deliberately ignoring abort. Real DOM/native select is covered by E2E.
const source=process.env.PLANB_REFERENCE_SRC?path.resolve(process.env.PLANB_REFERENCE_SRC):path.resolve('src/ReferenceSelect.tsx');
const spec=makeDemoSpec(makeFixture());
const record=(id:string,name:string,entity:'contacts'|'companies'='contacts'):CrmRecord=>({entity,id,values:entity==='contacts'?{firstname:name,lastname:''}:{name}});
function mount(initial:Record<string,any>={}) {
  const slots:any[]=[],timers=new Map<number,()=>void>(),requests:{path:string;signal?:AbortSignal;resolve:(v:any)=>void;reject:(e:Error)=>void}[]=[],calls:(string|null)[]=[];
  let cursor=0,sequence=0,tree:any,writes=0,effects:(()=>void)[]=[],props={id:'fixture-reference',value:'',entity:'contacts',spec,disabled:false,onChange:(v:string|null)=>calls.push(v),...initial};
  const hooks={
    useState(init:any){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],(v:any)=>{writes++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(init:any){const i=cursor++;return slots[i]??(slots[i]={current:init});},
    useEffect(run:()=>void|(()=>void),deps?:unknown[]){const i=cursor++,old=slots[i];if(!old||!deps||deps.length!==old.deps?.length||deps.some((d,n)=>!Object.is(d,old.deps[n])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:run()};});},
  };
  const jsx=(type:any,props:any)=>({type,props});
  const requireFrom=(name:string):any=>{
    if(name==='react')return hooks;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};
    if(name.endsWith('.css'))return {};
    if(name.endsWith('api.js'))return {api:(route:string,init?:RequestInit)=>new Promise((resolve,reject)=>requests.push({path:route,signal:init?.signal??undefined,resolve,reject}))};
    if(name.endsWith('components.js'))return {recordName:(r:CrmRecord)=>String(r.values.name??r.values.firstname??r.id)};
    if(name.endsWith('model.js'))return {RecordSchema};throw Error('Unexpected dependency '+name);
  };
  const code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{} as any};new Function('require','exports','module','setTimeout','clearTimeout',code)(requireFrom,mod.exports,mod,(callback:()=>void)=>{const id=++sequence;timers.set(id,callback);return id;},(id:number)=>timers.delete(id));
  const Component=mod.exports.ReferenceSelect;
  const walk=(node:any):any[]=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
  const flat=(node:any):string=>Array.isArray(node)?node.map(flat).join(''):typeof node==='string'||typeof node==='number'?String(node):node?.props?flat(node.props.children):'';
  const text=(node:any=tree)=>flat(node);
  const nodes=()=>walk(tree),byTag=(tag:string)=>nodes().filter(n=>n.type===tag);
  const render=(next:Record<string,any>={})=>{props={...props,...next};cursor=0;tree=Component(props);const pending=effects;effects=[];pending.forEach(run=>run());};
  const flush=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(run=>run());};
  const button=(name:string)=>{const b=byTag('button').find(n=>text(n)===name);assert.ok(b,'Missing button '+name);return b;};
  const select=()=>byTag('select')[0],input=()=>byTag('input')[0];
  const query=(q:string)=>{input().props.onChange({target:{value:q}});render();flush();};
  const options=()=>byTag('option'),ids=()=>options().filter(n=>n.props.value&&!n.props.disabled).map(n=>n.props.value);
  render();return {render,flush,requests,calls,button,select,input,query,options,ids,text,alerts:()=>nodes().filter(n=>n.props.role==='alert'),unmount:()=>slots.forEach(s=>s?.cleanup?.()),writes:()=>writes};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
const list=(c:ReturnType<typeof mount>,q='')=>c.requests.find(r=>r.path.includes('?')&&new URL('http://fixture.invalid'+r.path).searchParams.get('q')===q)!;
const lookup=(c:ReturnType<typeof mount>,id:string)=>c.requests.find(r=>!r.path.includes('?')&&r.path.endsWith('/'+id))!;

test('a successful list must not erase a failed selected-record lookup or replace its ID',async()=>{
  const c=mount({value:'missing-062'});c.flush();lookup(c,'missing-062').reject(Error('Fixture lookup failure'));await settle();c.render();
  list(c).resolve({records:[record('other','Other062')],total:1});await settle();c.render();
  assert.equal(c.alerts().length,1);assert.equal(c.select().props.value,'missing-062');assert.ok(c.options().some(o=>o.props.value==='missing-062'&&o.props.disabled));assert.deepEqual(c.calls,[]);
});

test('selected identity changes never retain a label from another entity, even before its request resolves',async()=>{
  const c=mount({value:'same'});c.flush();lookup(c,'same').resolve({record:record('same','OldContacts062')});list(c).resolve({records:[record('same','OldContacts062')],total:1});await settle();c.render();
  assert.match(c.text(),/OldContacts062/);c.render({entity:'companies'});assert.doesNotMatch(c.text(),/OldContacts062/);assert.equal(c.select().props.value,'same');assert.deepEqual(c.calls,[]);
  c.requests.filter(r=>!r.path.includes('?')).at(-1)!.resolve({record:record('same','NewCompany062','companies')});await settle();c.render();assert.match(c.text(),/NewCompany062/);
});

test('valid old list response cannot overwrite a newer query when transport ignores abort',async()=>{
  const c=mount();c.flush();list(c).resolve({records:[],total:0});await settle();c.render();
  c.query('old');const old=list(c,'old');c.query('new');list(c,'new').resolve({records:[record('new-id','New062')],total:1});await settle();c.render();assert.deepEqual(c.ids(),['new-id']);
  assert.equal(old.signal?.aborted,true);old.resolve({records:[record('old-id','Old062')],total:1});await settle();c.render();assert.deepEqual(c.ids(),['new-id']);assert.deepEqual(c.calls,[]);
});

test('late list error cannot remove newer usable choices or add an obsolete alert',async()=>{
  const c=mount();c.flush();list(c).resolve({records:[],total:0});await settle();c.render();c.query('old');const old=list(c,'old');c.query('new');list(c,'new').resolve({records:[record('new-id','New062')],total:1});await settle();c.render();
  old.reject(Error('Old error'));await settle();c.render();assert.deepEqual(c.ids(),['new-id']);assert.equal(c.alerts().length,0);
});

test('selected record stays pinned outside fifty search rows and total coverage is visible',async()=>{
  const c=mount({value:'chosen-90'});c.flush();lookup(c,'chosen-90').resolve({record:record('chosen-90','Chosen062')});list(c).resolve({records:Array.from({length:50},(_,i)=>record('row-'+i,'Name '+i)),total:90});await settle();c.render();
  assert.equal(c.ids().length,51);assert.ok(c.ids().includes('chosen-90'));assert.match(c.text(),/50 de 90/);assert.match(c.text(),/Chosen062/);assert.doesNotMatch(c.text(),/ID chosen-90/);assert.equal(c.select().props.value,'chosen-90');assert.deepEqual(c.calls,[]);
});

test('identity-mismatched selected reply is rejected rather than presented as the chosen record',async()=>{
  const c=mount({value:'expected'});lookup(c,'expected').resolve({record:record('wrong','Wrong062')});await settle();c.render();assert.doesNotMatch(c.text(),/Wrong062/);assert.equal(c.alerts().length,1);assert.equal(c.select().props['aria-invalid'],true);assert.deepEqual(c.calls,[]);
});

test('wrong-entity or duplicate-ID lists never become selectable',async()=>{
  for(const records of [[record('wrong','Wrong062','companies')],[record('same','One062'),record('same','Two062')]]){
    const c=mount();c.flush();list(c).resolve({records,total:records.length});await settle();c.render();assert.deepEqual(c.ids(),[]);assert.equal(c.alerts().length,1);
  }
});

test('a contradictory positive total is an error, while an older response without a total remains explicitly bounded',async()=>{
  const c=mount();c.flush();list(c).resolve({records:[],total:10});await settle();c.render();assert.equal(c.alerts().length,1);assert.doesNotMatch(c.text(),/No hay coincidencias/);
  const older=mount();older.flush();list(older).resolve({records:[record('one','One062')]});await settle();older.render();assert.equal(older.alerts().length,0);assert.match(older.text(),/Se muestra 1 resultado/);assert.match(older.text(),/afinar/);
});

test('only explicit current choices or clear can call onChange; unknown IDs are ignored',async()=>{
  const c=mount();c.flush();list(c).resolve({records:[record('a','Same062'),record('b','Same062')],total:2});await settle();c.render();
  assert.match(c.text(),/ID a/);assert.match(c.text(),/ID b/);c.select().props.onChange({target:{value:'forged'}});c.select().props.onChange({target:{value:'b'}});c.select().props.onChange({target:{value:''}});assert.deepEqual(c.calls,['b',null]);
});

test('disabled rejects even a queued handler from before disabling and stops the old options request',async()=>{
  const c=mount();c.flush();const pending=list(c);pending.resolve({records:[record('a','One062')],total:1});await settle();c.render();const old=c.select().props.onChange;
  c.render({disabled:true});old({target:{value:'a'}});c.select().props.onChange({target:{value:''}});assert.equal(pending.signal?.aborted,true);assert.deepEqual(c.calls,[]);
});

test('retrying selection hides its old error until resolved, without clearing the value or calling onChange',async()=>{
  const c=mount({value:'chosen'});lookup(c,'chosen').reject(Error('Fixture'));await settle();c.render();c.button('Reintentar relación').props.onClick();c.render();
  assert.equal(c.alerts().length,0);assert.equal(c.select().props.value,'chosen');c.requests.filter(r=>!r.path.includes('?')).at(-1)!.resolve({record:record('chosen','Recovered062')});await settle();c.render();assert.match(c.text(),/Recovered062/);assert.deepEqual(c.calls,[]);
});

test('list failure and selected lookup failure remain independent through their retries',async()=>{
  const c=mount({value:'chosen'});c.flush();lookup(c,'chosen').reject(Error('Lookup'));list(c).reject(Error('List'));await settle();c.render();assert.equal(c.alerts().length,2);
  c.button('Reintentar búsqueda').props.onClick();c.render();c.flush();c.requests.filter(r=>r.path.includes('?')).at(-1)!.resolve({records:[record('other','Other062')],total:1});await settle();c.render();assert.equal(c.alerts().length,1);assert.equal(c.select().props.value,'chosen');
});

test('unmount aborts both reads and ignores their late resolutions without state writes',async()=>{
  const c=mount({value:'chosen'});c.flush();const before=c.writes();c.unmount();for(const r of c.requests){assert.equal(r.signal?.aborted,true);r.resolve(r.path.includes('?')?{records:[record('chosen','Late062')],total:1}:{record:record('chosen','Late062')});}await settle();assert.equal(c.writes(),before);
});

test('read-only selection can load its label without running an unnecessary options search',async()=>{
  const c=mount({value:'chosen',disabled:true});c.flush();assert.equal(c.requests.length,1);lookup(c,'chosen').resolve({record:record('chosen','ReadOnly062')});await settle();c.render();assert.match(c.text(),/ReadOnly062/);assert.equal(c.select().props.disabled,true);c.render({disabled:false});c.flush();assert.equal(c.requests.filter(r=>r.path.includes('?')).length,1);
});

test('clearing a value removes its old failure and does not reintroduce a stale lookup result',async()=>{
  const c=mount({value:'old'}),old=lookup(c,'old');c.render({value:''});assert.equal(c.select().props.value,'');assert.equal(old.signal?.aborted,true);old.resolve({record:record('old','ShouldNotReturn062')});await settle();c.render();assert.doesNotMatch(c.text(),/ShouldNotReturn062/);assert.deepEqual(c.calls,[]);
});
