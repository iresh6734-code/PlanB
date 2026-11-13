import { test, expect, type Page } from '@playwright/test';
import { build as buildUi } from 'vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';

const repo=process.cwd();
const root=fs.mkdtempSync(path.join(repo,'tests/.tmp/continuity-app-context-'));
const password='contraseña ficticia de montaje 260';
const copyRoute='**/api/v7/continuity/evidence?*';
let child:ChildProcess|undefined,terminal:Promise<unknown>|undefined,base='';
let replacementFile='';

test.beforeAll(async()=>{
  await buildUi({root:repo,configFile:false,envDir:path.join(root,'no-env'),base:'./',plugins:[react()],logLevel:'error',build:{outDir:path.join(root,'dist'),emptyOutDir:false,minify:false}});
  await build({absWorkingDir:repo,entryPoints:['server/main.ts'],outfile:path.join(root,'server.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
});

async function seed(filename:string,id:string,minutes:number){
  const store=new Store(filename);
  try{
    const snapshot=makeFixture('agency');
    snapshot.id=id;
    snapshot.name='Copia ficticia '+id;
    snapshot.capturedAt=new Date(Date.now()-minutes*60_000).toISOString();
    expect(store.importSnapshot(snapshot).complete).toBe(true);
    store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
    store.activate();
    return store.bundle();
  }finally{store.close();}
}

test.beforeEach(async({page})=>{
  const run=fs.mkdtempSync(path.join(root,'runtime-'));
  const data=path.join(run,'fixture-data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data,'.planb-key'),JSON.stringify({kind:'test',data:randomBytes(32).toString('base64')}),{flag:'wx'});
  await seed(path.join(data,'planb.sqlite'),'app-context-a',45);
  const replacement=await seed(':memory:','app-context-b',15);
  replacementFile=JSON.stringify(replacement);
  fs.cpSync(path.join(root,'dist'),path.join(run,'dist'),{recursive:true});
  const probe=createServer();
  probe.listen(0,'127.0.0.1');
  await once(probe,'listening');
  const address=probe.address();
  expect(address&&typeof address!=='string').toBeTruthy();
  const port=typeof address==='object'&&address?address.port:0;
  await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const allowed=new Set(['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','tz']);
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>allowed.has(key.toLowerCase()))),NODE_ENV:'test',PLANB_PORT:String(port),PLANB_DATA_DIR:data};
  child=spawn(process.execPath,['--require',path.join(repo,'scripts/block-external.cjs'),path.join(root,'server.mjs')],{cwd:run,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const own=child;
  const log=fs.createWriteStream(path.join(run,'server.log'),{flags:'wx'});
  child.stdout!.pipe(log,{end:false});child.stderr!.pipe(log,{end:false});
  terminal=new Promise(resolve=>own.once('close',(code,signal)=>{
    fs.writeFileSync(path.join(run,'closed.json'),JSON.stringify({pid:own.pid,code,signal}));
    log.end();resolve({code,signal});
  }));
  base='http://127.0.0.1:'+port;
  await expect.poll(async()=>{
    try{return(await fetch(base+'/api/health',{signal:AbortSignal.timeout(400)})).status;}catch{return 0;}
  }).toBe(200);
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.fallback():route.abort());
  expect((await page.request.post(base+'/api/v2/auth/setup',{headers:{Origin:base},data:{password}})).status()).toBe(200);
});

test.afterEach(async()=>{
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  if(terminal)await terminal;
  child=undefined;terminal=undefined;
});

const copy=(page:Page)=>page.locator('.cph-sources [data-source="copy"]');

test('the compiled App requests evidence with its protected state revision and retires an unattested 200',async({page})=>{
  const pins:(string|null)[]=[],writes:string[]=[],errors:string[]=[];
  let proof:string|undefined;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method()+' '+new URL(request.url()).pathname);});
  await page.route(copyRoute,async route=>{
    const pin=new URL(route.request().url()).searchParams.get('workspaceContextRevision');
    pins.push(pin);
    const response=await route.fetch();
    proof=response.headers()['x-planb-workspace-revision'];
    await route.fulfill({response});
  });
  await page.goto(base);
  await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await expect(copy(page)).toHaveAttribute('data-state','read');
  const state=await(await page.request.get(base+'/api/v2/state')).json();
  expect(new Set(pins)).toEqual(new Set([state.workspaceSearchContext.contextRevision]));
  expect(proof).toBe(state.workspaceSearchContext.contextRevision);
  await page.unroute(copyRoute);
  await page.route(copyRoute,async route=>{
    const response=await route.fetch(),headers={...response.headers()};
    delete headers['x-planb-workspace-revision'];
    await route.fulfill({response,headers});
  });
  await page.getByRole('button',{name:'Leer el estado guardado',exact:true}).click();
  await expect(copy(page)).toHaveAttribute('data-state','unavailable');
  await expect(page.locator('.cpp [data-section="copy"]')).not.toContainText('Observado');
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('restoring another fictional copy retires a held response even when the transport ignores abort',async({page})=>{
  await page.addInitScript(()=>{
    const original=window.fetch.bind(window);
    const tracker=window as typeof window&{evidenceDelivered:number};
    tracker.evidenceDelivered=0;
    window.fetch=async(input,init)=>{
      if(!String(input).includes('/api/v7/continuity/evidence'))return original(input,init);
      const response=await original(input,{...init,signal:undefined});
      await response.clone().arrayBuffer();
      tracker.evidenceDelivered++;
      return response;
    };
  });
  let release!:()=>void,arrived!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{arrived=resolve;});
  let oldCapture='',newCapture='',calls=0,oldPin:string|null=null;
  const writes:string[]=[],errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method()+' '+new URL(request.url()).pathname);});
  await page.route(copyRoute,async route=>{
    const response=await route.fetch(),body=await response.json();
    expect(response.status()).toBe(200);
    calls++;
    if(!oldCapture){oldCapture=body.context.captureId;oldPin=new URL(route.request().url()).searchParams.get('workspaceContextRevision');}
    if(body.context.captureId===oldCapture){arrived();await held;}
    else newCapture=body.context.captureId;
    await route.fulfill({response});
  });
  try{
    await page.goto(base);
    await ready;
    await expect(copy(page)).toHaveAttribute('data-state','loading');
    await page.getByRole('button',{name:'Restaurar archivo',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Restaurar una copia'});
    await dialog.getByLabel('Archivo JSON de Plan B').setInputFiles({name:'copy-b.json',mimeType:'application/json',buffer:Buffer.from(replacementFile)});
    await dialog.getByRole('button',{name:'Validar y restaurar',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(copy(page)).toHaveAttribute('data-state','read');
    expect(newCapture).not.toBe(oldCapture);
    const state=await(await page.request.get(base+'/api/v2/state')).json();
    expect(state.snapshot.id).toBe('app-context-b');
    expect(state.changes).toBe(0);
    const newTag='copia '+newCapture.replace('capture:','').slice(0,8);
    await expect(page.locator('.cpp')).toContainText(newTag);
    const delivered=page.waitForResponse(response=>response.url().includes('/api/v7/continuity/evidence')&&new URL(response.url()).searchParams.get('workspaceContextRevision')===oldPin);
    release();
    await delivered;
    await expect.poll(()=>page.evaluate(()=>(window as typeof window&{evidenceDelivered:number}).evidenceDelivered)).toBe(calls);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(page.locator('.cpp')).toContainText(newTag);
    await expect(page.locator('.cpp')).not.toContainText('copia '+oldCapture.replace('capture:','').slice(0,8));
    expect(writes).toEqual(['POST /api/v2/restore']);
    expect(errors).toEqual([]);
  }finally{release();}
});
