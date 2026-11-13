import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Executes the real component's callbacks with controlled hook slots and deferred transport.
// This is not React DOM, a browser render, or a visual/accessibility test.
const compiled=ts.transpileModule(fs.readFileSync(new URL('../src/HubspotContext.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
type VNode={type:unknown;props:Record<string,any>};
type Request={path:string;resolve:(value:unknown)=>void;reject:(error:Error)=>void};
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
function harness(){
  const slots:any[]=[],requests:Request[]=[];let cursor=0,writes=0,tree:VNode;
  let effects:(()=>void)[]=[];
  const hooks={
    useState(initial:any){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],(value:any)=>{writes++;slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial:any){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
    useEffect(run:()=>void|(()=>void),deps:unknown[]){const index=cursor++,prior=slots[index];if(!prior||deps.some((value,i)=>!Object.is(value,prior.deps[i])))effects.push(()=>{prior?.cleanup?.();slots[index]={deps,cleanup:run()};});}
  };
  const jsx=(type:unknown,props:Record<string,any>)=>({type,props});
  const mod:{exports:any}={exports:{}};
  const require=(name:string)=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('fragment')};
    if(name==='lucide-react')return {RefreshCw:()=>null};
    throw Error('Unexpected component dependency: '+name);
  };
  new Function('require','exports','module',compiled)(require,mod.exports,mod);
  const call=<T>(path:string)=>new Promise<T>((resolve,reject)=>requests.push({path,resolve:value=>resolve(value as T),reject}));
  const render=(tenant='tenant-A',contact='42')=>{cursor=0;tree=mod.exports.HubspotContext({tenant,contact,call});const pending=effects;effects=[];pending.forEach(effect=>effect());return tree;};
  const nodes=(node:any):VNode[]=>Array.isArray(node)?node.flatMap(child=>nodes(child)):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
  const text=(node:any):string=>Array.isArray(node)?node.map(child=>text(child)).join(''):typeof node==='string'||typeof node==='number'?String(node):node?.props?text(node.props.children):'';
  const button=(label:string)=>{const result=nodes(tree).find(node=>node.type==='button'&&text(node)===label);assert.ok(result,'Button missing: '+label);return result;};
  render();render();
  return {render,requests,text:()=>text(tree),articles:()=>nodes(tree).filter(node=>node.type==='article').map(node=>text(node)),button,writes:()=>writes,unmount:()=>{for(const slot of slots)if(slot?.cleanup)slot.cleanup();}};
}
const compare='Comparar últimas capturas',read='Leer ficha y actividad HubSpot';
const diff=(added:number)=>({available:true,counts:{added,changed:2,removed:3,linksAdded:4,linksRemoved:5}});
const context={owner:null,ownerPermission:true,description:'CURRENT_CONTEXT_ONLY',timeline:[]};

test('comparación: mismo contexto muestra resultado y permite reintentar un error',async()=>{
  const h=harness();h.button(compare).props.onClick();h.render();assert.equal(h.button(compare).props.disabled,true);h.requests[0].resolve(diff(7));await settle();h.render();assert.match(h.text(),/7 altas/);assert.equal(h.button(compare).props.disabled,false);
  h.button(compare).props.onClick();h.requests[1].reject(new Error('CURRENT_FAILURE'));await settle();h.render();assert.match(h.text(),/CURRENT_FAILURE/);assert.equal(h.button(compare).props.disabled,false);
  h.button(compare).props.onClick();h.requests[2].resolve({available:false,reason:'Una sola captura'});await settle();h.render();assert.ok(!h.text().includes('CURRENT_FAILURE'));assert.match(h.text(),/Una sola captura/);
});
test('comparación: resultado de empresa anterior no aparece ni desbloquea la nueva comparación',async()=>{
  const h=harness();h.button(compare).props.onClick();h.render('tenant-B');h.render('tenant-B');h.button(compare).props.onClick();h.render('tenant-B');assert.equal(h.button(compare).props.disabled,true);
  h.requests[0].resolve(diff(99));await settle();h.render('tenant-B');assert.ok(!h.text().includes('99 altas'));assert.equal(h.button(compare).props.disabled,true,'el finally antiguo no desbloquea la nueva petición');
  h.requests[1].resolve(diff(8));await settle();h.render('tenant-B');assert.match(h.text(),/8 altas/);assert.equal(h.button(compare).props.disabled,false);
  assert.match(h.requests[0].path,/tenant-A/);assert.match(h.requests[1].path,/tenant-B/);
});
test('comparación: error anterior no se atribuye al nuevo contacto ni interrumpe su lectura',async()=>{
  const h=harness();h.button(compare).props.onClick();h.render('tenant-A','43');h.render('tenant-A','43');h.button(read).props.onClick();h.render('tenant-A','43');
  h.requests[0].reject(new Error('STALE_FAILURE'));await settle();h.render('tenant-A','43');assert.ok(!h.text().includes('STALE_FAILURE'));assert.equal(h.button(read).props.disabled,true);
  h.requests[1].resolve(context);await settle();h.render('tenant-A','43');assert.match(h.text(),/CURRENT_CONTEXT_ONLY/);assert.equal(h.button(read).props.disabled,false);
});
test('comparación: una lectura más nueva en el mismo contexto descarta el resultado anterior',async()=>{
  const h=harness(),oldCompare=h.button(compare),newRead=h.button(read);oldCompare.props.onClick();newRead.props.onClick();h.render();
  h.requests[0].resolve(diff(99));await settle();h.render();assert.ok(!h.text().includes('99 altas'));assert.equal(h.button(read).props.disabled,true);
  h.requests[1].resolve(context);await settle();h.render();assert.match(h.text(),/CURRENT_CONTEXT_ONLY/);assert.equal(h.button(read).props.disabled,false);
});
test('comparación: resultado o error tras desmontar no escribe estado',async()=>{
  for(const fail of [false,true]){const h=harness();h.button(compare).props.onClick();h.unmount();const before=h.writes();if(fail)h.requests[0].reject(new Error('UNMOUNTED_FAILURE'));else h.requests[0].resolve(diff(99));await settle();assert.equal(h.writes(),before);}
});

test('actividad: fecha futura de tarea es vencimiento y otras actividades muestran fecha CRM',async()=>{
  const h=harness();h.button(read).props.onClick();h.requests[0].resolve({...context,timeline:['tasks','notes','calls','emails','meetings'].map(kind=>({id:kind,kind,at:'2027-01-01T09:00:00.000Z',title:'TITLE',body:'BODY'}))});await settle();h.render();
  const articles=h.articles();assert.match(articles[0],/Vencimiento:/);assert.match(articles[0],/Tarea/);assert.ok(!articles[0].includes('Fecha CRM:'));
  for(const article of articles.slice(1)){assert.match(article,/Fecha CRM:/);assert.ok(!article.includes('Vencimiento:'));assert.doesNotMatch(article,/Enviado|Realizada|Completada/);}
  assert.equal(h.requests.length,1,'renderizar no inicia lecturas nuevas');
});
test('actividad: fechas ausentes o inválidas se explican sin Invalid Date',async()=>{
  const h=harness();h.button(read).props.onClick();h.requests[0].resolve({...context,timeline:[{id:'due',kind:'tasks',at:null,title:'TASK',body:''},{id:'bad',kind:'notes',at:'bad-date',title:'NOTE',body:''}]});await settle();h.render();
  const articles=h.articles();assert.match(articles[0],/Vencimiento: Sin fecha/);assert.match(articles[1],/Fecha CRM: Sin fecha/);assert.doesNotMatch(h.text(),/Invalid Date/);
});
test('actividad: horas siguen la zona local del navegador sin fijar Madrid',async()=>{
  const previous=process.env.TZ;
  try{for(const [zone,hour] of [['UTC','12:00:00'],['America/New_York','8:00:00']]){process.env.TZ=zone;const h=harness();h.button(read).props.onClick();h.requests[0].resolve({...context,timeline:[{id:'due',kind:'tasks',at:'2026-10-29T12:00:00.000Z',title:'TASK',body:''}]});await settle();h.render();assert.ok(h.articles()[0].includes('Vencimiento: 29/10/2026, '+hour+' · Tarea'),zone+': '+h.text());}}
  finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
