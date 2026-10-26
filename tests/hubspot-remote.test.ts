import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { hubspotRemote } from '../server/hubspot-remote.js';

test('devolución HubSpot: verifica portal y tipo antes de usar un destino',async()=>{
  const spec=makeDemoSpec(makeFixture());
  const response=(portalId:string,accountType:string)=>async()=>Response.json({portalId,accountType});
  await assert.rejects(hubspotRemote('test-token','12',spec,response('13','DEVELOPER_TEST')).verify(),/otro portal/);
  await assert.rejects(hubspotRemote('test-token','12',spec,response('12','STANDARD')).verify(),/solo para cuentas de prueba/);
  await hubspotRemote('test-token','12',spec,response('12','DEVELOPER_TEST')).verify();
});

test('devolución HubSpot: propiedades, creación y asociación verificada por lectura',async()=>{
  const spec=makeDemoSpec(makeFixture()),calls:{url:string;method:string;body:unknown}[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
    const url=String(input),method=init?.method??'GET';
    calls.push({url,method,body:init?.body?JSON.parse(String(init.body)):null});
    if(method==='POST')return Response.json({id:'900'});
    if(method==='PUT')return new Response(null,{status:204});
    if(url.includes('/associations/companies'))return Response.json({results:[{toObjectId:800}]});
    if(method==='PATCH')return Response.json({id:'123'});
    return Response.json({id:'123',properties:{firstname:'Lucía',phone:'600'}});
  };
  const remote=hubspotRemote('fake-token-not-a-secret','12',spec,fetcher);
  assert.equal((await remote.read('contacts','123'))!.values.firstname,'Lucía');
  assert.equal(await remote.create('contacts',{firstname:'Ana'},'trace-id'),'900');
  await remote.update('contacts','123',{phone:'601'});await remote.relate('contacts','123','companies','800');
  assert.ok(calls.every(c=>c.url.startsWith('https://api.hubapi.com/')));
  assert.deepEqual(calls.find(c=>c.method==='POST')!.body,{properties:{firstname:'Ana'}});
  assert.ok(calls.some(c=>c.method==='GET'&&c.url.includes('/associations/companies')));
  await assert.rejects(remote.update('contacts','123',{company_id:'800'}),/no editable/);
});

test('devolución HubSpot: nunca reintenta una escritura con respuesta fallida',async()=>{
  let writes=0;
  const remote=hubspotRemote('fake-token','12',makeDemoSpec(makeFixture()),async()=>{writes++;return Response.json({errors:[{message:'partial'}]},{status:207});});
  await assert.rejects(remote.create('contacts',{firstname:'Ana'},'op'),/no confirmó/);assert.equal(writes,1);
});
