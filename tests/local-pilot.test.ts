import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtempSync,mkdirSync,readFileSync,rmSync } from 'node:fs';
import { resolve,join,sep } from 'node:path';
import { createTeamApp } from '../server/team/app.js';
import { embeddedDatabase } from '../server/team/database.js';

test('piloto real local: protege las APIs, no suplanta perfiles y persiste identidad sin conservar sesiones',async()=>{
  const root=resolve('tests/.tmp');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'local-pilot-'));
  const db=await embeddedDatabase(),key=randomBytes(32),origin='http://localhost:4334',password='synthetic-test-password-local';let time=Date.now(),externalCalls=0;
  const options={db,origin,localPilot:{folder,key,clock:()=>time},copilot:{tenantId:randomUUID(),clientId:randomUUID(),environmentId:'Default-'+randomUUID(),schemaName:'must_not_connect',monthlyTurnLimit:1,encryptionKey:key,redirectUri:origin+'/team/oauth/microsoft/callback'},google:{clientId:'synthetic.apps.googleusercontent.com',clientSecret:'synthetic-secret-only',redirectUri:origin+'/team/oauth/google/callback',encryptionKey:key},fetcher:async()=>{externalCalls++;throw new Error('No se permite tráfico externo en esta prueba.');}};
  let {app}=await createTeamApp(options);
  const request=async(path:string,body?:Record<string,unknown>,cookie='',headers:Record<string,string>={})=>app.inject({url:'/api/team'+path,method:body?'POST':'GET',headers:{host:'localhost:4334',...(body?{origin}:{}),cookie,...headers},payload:body});
  const cookieOf=(response:{headers:Record<string,unknown>})=>String(response.headers['set-cookie']).split(';')[0];
  try{
    assert.equal((await request('/health')).json().mode,'local-pilot');
    const config=(await request('/config')).json();assert.equal(config.demo,false);assert.equal(config.localPilot,true);assert.equal(config.hubspotProductionPrivate,true);assert.deepEqual(config.users,[]);assert.ok(!JSON.stringify(config).includes('synthetic-secret'));
    assert.equal((await request('/spaces')).statusCode,401);
    assert.equal((await request('/spaces',undefined,'',{authorization:'Bearer demo-admin'})).statusCode,401);
    assert.equal((await request('/local-pilot/setup',{password},'',{origin:''})).statusCode,403);
    assert.equal((await request('/local-pilot/status',undefined,'',{host:'evil.example:4334'})).statusCode,403);
    assert.equal((await request('/local-pilot/status',undefined,'',{origin:'https://evil.example'})).statusCode,403);
    const setup=await request('/local-pilot/setup',{password});assert.equal(setup.statusCode,200);const cookie=cookieOf(setup);
    assert.match(String(setup.headers['set-cookie']),/HttpOnly; SameSite=Strict/);
    assert.ok(!readFileSync(join(folder,'.operator.enc'),'utf8').includes(password));
    assert.equal((await request('/local-pilot/setup',{password})).statusCode,409);
    assert.equal((await request('/demo/session',{uid:'demo-admin'},cookie)).statusCode,404);
    const space=(await request('/spaces',{name:'Piloto ficticio'},cookie)).json();assert.ok(space.id);
    assert.equal((await request('/spaces/'+space.id+'/hubspot/private-production',{accountId:'123',confirmedAccountId:'456',token:'synthetic-test-token',reviewed:true},cookie)).statusCode,422);
    assert.equal((await request('/spaces/'+space.id+'/hubspot/private-production',{accountId:'123',confirmedAccountId:'123',token:'synthetic-test-token',reviewed:false},cookie)).statusCode,422);
    assert.equal(externalCalls,0);
    const agent=(await request('/spaces/'+space.id+'/v6/copilot',undefined,cookie)).json();assert.equal(agent.configured,false);assert.equal(agent.localAI.enabled,false);
    assert.equal((await request('/spaces/'+space.id+'/v6/copilot/begin',{reviewed:true},cookie)).statusCode,503);
    assert.equal((await request('/spaces/'+space.id+'/invites',{email:'test@example.com',role:'sales'},cookie)).statusCode,403);
    assert.equal((await request('/device/exchange',{operations:[],cursor:0},cookie)).statusCode,403);
    assert.equal((await request('/local-pilot/fixture/'+space.id,{reviewed:true})).statusCode,401);
    assert.equal((await request('/local-pilot/fixture/'+space.id,{reviewed:true},cookie)).statusCode,200);
    const overview=(await request('/spaces/'+space.id+'/v6/commercial',undefined,cookie)).json();assert.equal(overview.ownAccountOnly,true);
    const proposal=await request('/spaces/'+space.id+'/v6/proposals',{contactId:'contact-1'},cookie);assert.equal(proposal.statusCode,200);
    const prepared=(await request('/spaces/'+space.id+'/v6/commercial',undefined,cookie)).json().proposals[0];assert.deepEqual([prepared.content.email,prepared.content.meeting,prepared.content.document,prepared.content.spreadsheet],[false,false,false,false]);
    assert.equal((await request('/local-pilot/fixture/'+space.id,{reviewed:true},cookie)).statusCode,409);
    const begin=await request('/spaces/'+space.id+'/v6/google/begin',{account:'test@example.com',reviewed:true},cookie);
    assert.equal(begin.statusCode,200);const authorization=new URL(begin.json().url);assert.equal(authorization.hostname,'accounts.google.com');assert.equal(authorization.searchParams.get('redirect_uri'),origin+'/team/oauth/google/callback');assert.ok(!begin.body.includes('synthetic-secret'));assert.equal(externalCalls,0);
    await request('/local-pilot/lock',{},cookie);assert.equal((await request('/spaces',undefined,cookie)).statusCode,401);
    const login=await request('/local-pilot/login',{password});const nextCookie=cookieOf(login);assert.equal(login.statusCode,200);
    time+=30*60_000;assert.equal((await request('/spaces',undefined,nextCookie)).statusCode,401);
    for(let i=0;i<5;i++)assert.equal((await request('/local-pilot/login',{password:'wrong'})).statusCode,401);
    assert.equal((await request('/local-pilot/login',{password})).statusCode,429);
    time+=60_000;const last=await request('/local-pilot/login',{password});assert.equal(last.statusCode,200);
    const previousCookie=cookieOf(last);await app.close();({app}=await createTeamApp({...options,migrate:false}));
    assert.equal((await request('/local-pilot/status')).json().configured,true);
    assert.equal((await request('/spaces',undefined,previousCookie)).statusCode,401);
    const restarted=await request('/local-pilot/login',{password});assert.equal(restarted.statusCode,200);
    assert.equal((await request('/spaces',undefined,cookieOf(restarted))).json().spaces[0].id,space.id);
    assert.equal(externalCalls,0);
  }finally{await app.close();await db.close();assert.ok(folder.startsWith(root+sep));rmSync(folder,{recursive:true,force:true});}
});

test('piloto local: rechaza combinar autenticación local, demo o un origen accesible por red',async()=>{
  const db=await embeddedDatabase(),localPilot={folder:'unused',key:randomBytes(32)};
  try{
    await assert.rejects(createTeamApp({db,origin:'https://public.example',localPilot}),/origen local/);
    await assert.rejects(createTeamApp({db,origin:'http://127.0.0.1:4334',demo:true,localPilot}),/origen local/);
    await assert.rejects(createTeamApp({db,origin:'http://localhost:4334',localPilot,verify:async()=>({uid:'demo',email:'test@example.com'})}),/origen local/);
  }finally{await db.close();}
});
