// Codex implements the regression cases proposed in the real Claude consultation.
// No live provider or saved credentials. Mutation mode changes only in-memory code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importHubspot as originalCapture } from '../server/hubspot.js';
import { inspectConnection as originalInspect } from '../server/connection.js';
let capture=originalCapture,inspect=originalInspect;
const mutation=process.env.PLANB_COLLAB_MUTATION;
if(mutation){
  assert.ok(['remote401','duplicates'].includes(mutation));
  const ts=await import('typescript');
  async function changed(name:string){
    const url=new URL('../server/'+name+'.ts',import.meta.url);let source=readFileSync(url,'utf8');
    if(mutation==='remote401')source=name==='connection'?source.replace('response.status===403?403:502','response.status===401?401:response.status===403?403:502'):source.replace("if (response.status === 401) throw new AppError(502,", "if (response.status === 401) throw new AppError(401,");
    if(mutation==='duplicates'&&name==='hubspot')source=source.replace('if (recordIds.has(item.id))','if (false && recordIds.has(item.id))');
    source=source.replace(/from '([^']+)'/g,(_all,specifier:string)=>"from '"+(specifier.startsWith('.')?new URL(specifier.replace(/\.js$/,'.ts'),url).href:import.meta.resolve(specifier))+"'");
    return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64'));
  }
  capture=(await changed('hubspot')).importHubspot;inspect=(await changed('connection')).inspectConnection;
}
const token='synthetic-collaboration-token',options={token,accountId:'123',confirmedTestAccount:true};
type Scenario={failure?:{path:string;status:401|403};duplicates?:'same-page'|'across-pages';sharedId?:boolean};
function mock(scenario:Scenario={}){
  const calls:string[]=[];
  const properties:Record<string,string[]>={contacts:['firstname','lastname','email','phone'],companies:['name','domain','phone'],deals:['dealname','amount','dealstage','pipeline','closedate'],tasks:['hs_task_subject','hs_task_status','hs_timestamp']};
  const rows:Record<string,{id:string;properties:Record<string,string>}[]>={contacts:[{id:'1',properties:{firstname:'Contract',email:'contract@example.test'}}],companies:[{id:scenario.sharedId?'1':'10',properties:{name:'Contract'}}],deals:[],tasks:[]};
  const duplicateRows=[{id:'1',properties:{firstname:'First'}},{id:'1',properties:{firstname:'Repeated'}}];
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(String(input)),route=url.pathname;calls.push(route+url.search);assert.equal(url.origin,'https://api.hubapi.com');assert.equal(init?.redirect,'error');
    if(scenario.failure&&route===scenario.failure.path)return new Response('untrusted '+token,{status:scenario.failure.status});
    if(route==='/account-info/2026-09/details')return Response.json({portalId:123,accountType:'DEVELOPER_TEST'});
    if(route==='/crm/pipelines/2026-09/deals')return Response.json({results:[{id:'default',label:'Pipeline',stages:[{id:'open',label:'Open'}]}]});
    if(route.startsWith('/crm/properties/2026-09/')){const entity=route.split('/').at(-1)!;return Response.json({results:properties[entity].map(name=>({name,label:name,type:'string',hubspotDefined:true}))});}
    if(route.endsWith('/search')){const entity=route.split('/').at(-2)!;return Response.json({total:entity==='contacts'&&scenario.duplicates?2:rows[entity].length,results:[]});}
    if(route.startsWith('/crm/objects/2026-09/')){
      const entity=route.split('/').at(-1)!;
      if(entity==='contacts'&&scenario.duplicates==='same-page')return Response.json({results:duplicateRows});
      if(entity==='contacts'&&scenario.duplicates==='across-pages')return Response.json(url.searchParams.has('after')?{results:[duplicateRows[1]]}:{results:[duplicateRows[0]],paging:{next:{after:'distinct-cursor-1'}}});
      return Response.json({results:rows[entity]});
    }
    if(route.startsWith('/crm/associations/2026-09/')){const body=JSON.parse(String(init?.body));return Response.json({status:'COMPLETE',results:body.inputs.map((r:{id:string})=>({from:{id:r.id},to:[]}))});}
    throw Error('Unexpected route '+route);
  };
  return {calls,fetcher};
}
for(const operation of ['inspect','capture'] as const){
  for(const later of [false,true]){
    test(`${operation}:401 remoto en ${later?'esquema posterior':'cuenta'} conserva502 y oculta token`,async()=>{
      const route=later?'/crm/properties/2026-09/contacts':'/account-info/2026-09/details';const m=mock({failure:{path:route,status:401}});
      await assert.rejects(operation==='inspect'?inspect({...options,mode:'test'},m.fetcher):capture(options,m.fetcher),(error:any)=>{assert.equal(error.status,502);assert.match(error.message,/HubSpot no acept/);assert.ok(!error.message.includes(token));return true;});
      assert.ok(m.calls.some(c=>c===route));assert.equal(m.calls.at(-1),route);assert.ok(!m.calls.some(c=>c.endsWith('/search')));
    });
  }
  test(`${operation}:403 de permisos se conserva en esquema posterior`,async()=>{
    const route='/crm/properties/2026-09/contacts',m=mock({failure:{path:route,status:403}});
    await assert.rejects(operation==='inspect'?inspect({...options,mode:'test'},m.fetcher):capture(options,m.fetcher),(error:any)=>{assert.equal(error.status,403);assert.match(error.message,/permisos de lectura/);assert.ok(!error.message.includes(token));return true;});assert.equal(m.calls.at(-1),route);
  });
}
for(const duplicates of ['same-page','across-pages'] as const)test(`captura: rechaza duplicado ${duplicates} pese a recuento coincidente`,async()=>{
  const m=mock({duplicates});let returned=false;
  await assert.rejects(async()=>{await capture(options,m.fetcher);returned=true;},(error:any)=>{assert.equal(error.status,502);assert.match(error.message,/repitió un ID/);return true;});assert.equal(returned,false);assert.equal(m.calls.filter(c=>c.startsWith('/crm/objects/2026-09/contacts?')).length,duplicates==='same-page'?1:2);assert.ok(!m.calls.some(c=>c.endsWith('/search')));
});
test('control positivo: IDs iguales en distintas entidades y captura completa',async()=>{
  const m=mock({sharedId:true});const snapshot=await capture(options,m.fetcher);
  assert.equal(snapshot.manifest.complete,true);assert.equal(snapshot.records.filter(r=>r.id==='1').length,2);assert.deepEqual(snapshot.manifest.expectedCounts,{contacts:1,companies:1,deals:0,tasks:0});assert.ok(m.calls.some(c=>c.startsWith('/crm/associations/2026-09/')));
});
