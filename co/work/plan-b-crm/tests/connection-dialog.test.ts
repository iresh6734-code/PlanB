import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { entityNames } from '../shared/model.js';

const source=process.env.PLANB_CONNECTION_SRC?path.resolve(process.env.PLANB_CONNECTION_SRC):path.resolve('src/ConnectionDialog.tsx');
const response=(over:Record<string,unknown>={})=>({accountId:'65001',accountType:'DEVELOPER_TEST',mode:'test',fields:{contacts:[{key:'field_1',label:'Campo uno'}],companies:[],deals:[],tasks:[]},...over});
function mount(done:()=>Promise<void>=async()=>{}) {
  const slots:any[]=[],requests:{path:string;body:any;signal?:AbortSignal;resolve:(v:any)=>void;reject:(e:Error)=>void}[]=[],effects:(()=>void)[]=[];
  let cursor=0,tree:any,writes=0,closed=0;
  const hooks={useState(init:any){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],(v:any)=>{writes++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(init:any){const i=cursor++;return slots[i]??(slots[i]={current:init});},useEffect(run:()=>void|(()=>void),deps?:unknown[]){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((v,n)=>!Object.is(v,old.deps?.[n])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:run()};});}};
  const jsx=(type:any,props:any)=>({type,props}),transport=(url:string,body:any,signal?:AbortSignal)=>new Promise((resolve,reject)=>requests.push({path:url,body,signal,resolve,reject}));
  const imports=(name:string):any=>{if(name==='react')return hooks;if(name==='zod')return {z};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};if(name.endsWith('.css'))return {};if(name.endsWith('model.js'))return {entityNames};if(name.endsWith('api.js'))return {post:(url:string,body:any)=>transport(url,body),api:(url:string,init:RequestInit)=>transport(url,JSON.parse(String(init.body)),init.signal??undefined)};if(name.endsWith('components.js'))return {Modal:function Modal(){},Spinner:function Spinner(){}};throw Error('Unexpected '+name);};
  const mod={exports:{} as any},code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports','module',code)(imports,mod.exports,mod);const Component=mod.exports.ConnectionDialog;
  const walk=(node:any):any[]=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
  const flat=(node:any):string=>Array.isArray(node)?node.map(flat).join(''):typeof node==='string'||typeof node==='number'?String(node):node?.props?flat(node.props.children):'';
  const render=()=>{cursor=0;tree=Component({close:()=>closed++,done});effects.splice(0).forEach(run=>run());};
  const nodes=()=>walk(tree),tags=(tag:string)=>nodes().filter(n=>n.type===tag),text=()=>flat(tree),form=()=>tags('form')[0];
  const submit=()=>form().props.onSubmit({preventDefault(){}});
  const field=(name:string)=>{const label=tags('label').find(n=>flat(n).startsWith(name));assert.ok(label,'Missing field '+name);return walk(label).find(n=>['input','select'].includes(n.type))!;};
  const set=(name:string,value:any)=>{field(name).props.onChange({target:{value,checked:value}});render();};
  const prepare=()=>{set('ID de cuenta','65001');set('Service Key','fixture-token-connection065');set('Confirmo que la cuenta',true);};
  const button=(name:string)=>{const b=tags('button').find(n=>flat(n)===name);assert.ok(b,'Missing button '+name);return b;};
  render();return {render,nodes,tags,text,form,submit,field,set,prepare,button,requests,closed:()=>closed,writes:()=>writes,close:()=>tree.props.close(),unmount:()=>slots.forEach(s=>s?.cleanup?.())};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function inspected(h:ReturnType<typeof mount>,data=response()) {h.prepare();h.submit();h.requests[0].resolve(data);await settle();h.render();}

test('double submit during inspection starts exactly one request and disables credential edits',()=>{
  const h=mount();h.prepare();h.submit();h.submit();assert.equal(h.requests.length,1);h.render();assert.equal(h.field('ID de cuenta').props.disabled,true);assert.equal(h.field('Modo de conexión').props.disabled,true);
  h.set('ID de cuenta','99999');assert.equal(h.field('ID de cuenta').props.value,'65001');
});
test('inspection for another portal or mode never enables saving',async()=>{
  for(const data of [response({accountId:'65002'}),response({mode:'production_readonly',accountType:'STANDARD'}),response({accountType:'STANDARD'}),response({fields:{contacts:[],companies:[],deals:[]}})]){
    const h=mount();h.prepare();h.submit();h.requests[0].resolve(data);await settle();h.render();assert.ok(h.tags('p').some(p=>p.props.role==='alert'));assert.ok(!h.tags('button').some(b=>b.props.children==='Guardar conexión'));
  }
});
test('closing and unmounting ignore a valid late inspection even when transport ignores abort',async()=>{
  const h=mount();h.prepare();h.submit();h.close();h.unmount();const before=h.writes();h.requests[0].resolve(response());await settle();assert.equal(h.writes(),before);assert.equal(h.requests[0].signal?.aborted,true);assert.equal(h.closed(),1);
});
test('late transport error after close does not add an error or call completion',async()=>{
  let completed=0;const h=mount(async()=>{completed++;});h.prepare();h.submit();h.close();h.unmount();const before=h.writes();h.requests[0].reject(Error('late'));await settle();assert.equal(h.writes(),before);assert.equal(completed,0);
});
test('reviewing credentials again retires selected fields and requires a new inspection',async()=>{
  const h=mount();await inspected(h);h.set('Campo uno',true);h.button('Revisar conexión').props.onClick();h.render();h.set('ID de cuenta','65002');h.submit();assert.equal(h.requests.length,2);assert.equal(h.requests[1].path,'/v2/connection/inspect');assert.deepEqual(h.requests[1].body.selectedFields,{});h.requests[1].resolve(response({accountId:'65002'}));await settle();h.render();assert.equal(h.field('Campo uno').props.checked,false);
});
test('save uses reviewed account/mode and explicitly selected fields, retaining server confirmation',async()=>{
  let completed=0;const h=mount(async()=>{completed++;});await inspected(h);h.set('Campo uno',true);h.submit();h.submit();assert.equal(h.requests.length,2);assert.equal(h.requests[1].path,'/v2/connection');assert.equal(h.requests[1].body.accountId,'65001');assert.equal(h.requests[1].body.mode,'test');assert.deepEqual(h.requests[1].body.selectedFields,{contacts:['field_1']});h.requests[1].resolve({saved:true,...response()});await settle();assert.equal(completed,1);assert.equal(h.closed(),1);
});
test('a successful save followed by refresh failure offers refresh without resending or retaining the token',async()=>{
  let attempts=0;const h=mount(async()=>{if(++attempts===1)throw Error('Fixture refresh');});await inspected(h);h.submit();const oldSubmit=h.form().props.onSubmit;h.requests[1].resolve({saved:true});await settle();h.render();assert.match(h.text(),/conexión se guardó/);assert.ok(!h.tags('input').some(n=>n.props.type==='password'));oldSubmit({preventDefault(){}});assert.equal(h.requests.length,2);
  h.button('Reintentar actualización').props.onClick();await settle();h.render();assert.equal(h.requests.length,2);assert.equal(attempts,2);assert.equal(h.closed(),1);
});
test('malformed save acknowledgment does not claim success or close the dialog',async()=>{
  let completed=0;const h=mount(async()=>{completed++;});await inspected(h);h.submit();h.requests[1].resolve({saved:false});await settle();h.render();assert.match(h.text(),/servidor no confirmó/);assert.equal(completed,0);assert.equal(h.closed(),0);
});
test('selected custom fields are capped at sixty, including a queued handler from before the cap',async()=>{
  const h=mount();await inspected(h,response({fields:{contacts:Array.from({length:61},(_,i)=>({key:'field_'+i,label:'Campo'+String(i).padStart(3,'0')})),companies:[],deals:[],tasks:[]}}));
  const old=h.field('Campo060').props.onChange;for(let i=0;i<60;i++)h.set('Campo'+String(i).padStart(3,'0'),true);assert.equal(h.field('Campo060').props.disabled,true);old({target:{checked:true}});h.render();h.submit();assert.equal(h.requests[1].body.selectedFields.contacts.length,60);assert.equal(new Set(h.requests[1].body.selectedFields.contacts).size,60);
});
test('duplicate inspected field keys are rejected and production confirmation resets when mode changes',async()=>{
  const h=mount();h.prepare();h.submit();h.requests[0].resolve(response({fields:{contacts:[{key:'same',label:'One'},{key:'same',label:'Two'}],companies:[],deals:[],tasks:[]}}));await settle();h.render();assert.match(h.text(),/respuesta no corresponde/);h.set('Modo de conexión','production_readonly');assert.equal(h.field('Tengo autorización').props.checked,false);h.set('Tengo autorización',true);h.submit();assert.equal(h.requests[1].body.confirmedTestAccount,false);assert.equal(h.requests[1].body.confirmedProduction,true);
});
test('client validation prevents forged submissions without confirmation or with an invalid account ID',()=>{
  const h=mount();h.submit();assert.equal(h.requests.length,0);h.prepare();h.set('ID de cuenta','not-numeric');h.submit();assert.equal(h.requests.length,0);
});
