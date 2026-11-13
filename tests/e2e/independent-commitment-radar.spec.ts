import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HoyHarness, gate } from './hoy-recuperable-harness';

// Independent review probes. The wrapper is synthetic; the submitted Radar and CORE are real.
class RadarHarness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const frozen=path.join(this.root,'frozen'),priv=path.join(this.root,'priv');
    fs.writeFileSync(path.join(frozen,'radar-review.html'),'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisión Radar</title></head><body><div id="root"></div><script type="module" src="/src/radar-review-entry.tsx"></script></body></html>');
    fs.writeFileSync(path.join(frozen,'src/radar-review-entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import './styles.css';import './planb-ui.css';import{CommitmentRadar}from'./CommitmentRadar.js';function Host(){const[p,setP]=React.useState(null);React.useEffect(()=>{fetch('/api/v2/state').then(r=>r.json()).then(r=>setP(r.workspaceSearchContext?.contextRevision??null));},[]);return <CommitmentRadar contextRevision={p}/>;}createRoot(document.getElementById('root')).render(<Host/>);`);
    await build({root:frozen,configFile:false,envDir:path.join(this.root,'empty-env'),base:'./',mode:'production',plugins:[react()],logLevel:'error',build:{outDir:path.join(priv,'dist'),emptyOutDir:false,minify:false,rollupOptions:{input:path.join(frozen,'radar-review.html')}}});
    const file=path.join(this.root,'server.mts'),before=fs.readFileSync(file,'utf8');
    expect(before).toContain('await app.listen(');
    const url=(name:string)=>JSON.stringify(pathToFileURL(path.join(priv,name)).href);
    const extra=`import{registerCommitments}from ${url('server/commitments.ts')};import{createCommitmentDemoDataset}from ${url('shared/commitment-demo.ts')};const now=Date.parse('2026-11-08T12:00:00Z');registerCommitments(app,store,createCommitmentDemoDataset(now),()=>now);`;
    fs.writeFileSync(file,before.replace('await app.listen(',extra+'await app.listen('));
  }
}
const h=new RadarHarness();
test.use({timezoneId:'Europe/Madrid',locale:'es-ES'});
test.setTimeout(150000);
test.beforeAll(async()=>{await h.prepare();});
test.beforeEach(()=>{h.reset();});
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'ignoreErrors'}).catch(()=>undefined);await h.stop();});
test.afterAll(()=>{h.assertAllClosed();});
const dialog=(page:Page)=>page.getByRole('dialog');
async function open(page:Page,id:string){await page.locator('.cr-item[data-id="'+id+'"]').getByRole('button',{name:/^Abrir /}).click();await expect(dialog(page)).toBeVisible();await expect(dialog(page).locator('.cr-source')).toHaveCount(3);}
async function start(page:Page){await h.start(page);await page.goto(h.origin+'/radar-review.html');await expect(page.locator('.cr-item')).toHaveCount(6);}
async function draft(page:Page,owner:string,step:string){await dialog(page).getByLabel('Responsable',{exact:true}).fill(owner);await dialog(page).getByLabel('Siguiente paso',{exact:true}).fill(step);await dialog(page).getByLabel('Fecha para el siguiente paso').fill('2026-11-12T10:00');}

test('control independiente: borrador de B sobrevive cerrar y reabrir B sin otro guardado',async({page})=>{
  await start(page);await open(page,'delivery-healthy');await draft(page,'Borrador B independiente','Paso B independiente');
  await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);await open(page,'delivery-healthy');
  await expect(dialog(page).getByLabel('Responsable',{exact:true})).toHaveValue('Borrador B independiente');
  expect(h.requests().filter(q=>q.method==='POST'&&q.path.endsWith('/decisions'))).toHaveLength(0);
});

test('decisión de A retenida no borra ni acredita el borrador que se muestra al abrir B',async({page})=>{
  await start(page);await open(page,'delivery-healthy');await draft(page,'Borrador B independiente','Paso B independiente');await page.keyboard.press('Escape');
  await open(page,'installation-north');await draft(page,'Responsable A independiente','Paso A independiente');
  const held=gate();let received=0;
  await page.route('**/api/v7/commitments/installation-north/decisions',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);received++;await held.promise;await route.fulfill({response}).catch(()=>undefined);});
  try{
    await dialog(page).getByRole('button',{name:'Guardar asignación',exact:true}).click();await expect.poll(()=>received).toBe(1);
    await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);await open(page,'delivery-healthy');
    await expect(dialog(page).getByLabel('Responsable',{exact:true})).toHaveValue('Borrador B independiente');
    held.release();await expect(dialog(page).getByRole('button',{name:'Guardar asignación',exact:true})).toBeEnabled();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const pin=(await(await fetch(h.origin+'/api/v2/state')).json()).workspaceSearchContext.contextRevision;
    const read=(id:string)=>fetch(h.origin+'/api/v7/commitments/'+id+'?contextRevision='+pin).then(r=>r.json());
    const [a,b]=await Promise.all([read('installation-north'),read('delivery-healthy')]);
    fs.writeFileSync(path.join(h.caseDir,'late-a-while-b.json'),JSON.stringify({aEvents:a.events.length,bEvents:b.events.length,visibleOwner:await dialog(page).getByLabel('Responsable',{exact:true}).inputValue(),visibleDone:await dialog(page).locator('.cr-done').allTextContents(),requests:h.requests().filter(q=>q.method==='POST'&&q.path.endsWith('/decisions'))},null,2));
    await page.screenshot({path:path.join(h.caseDir,'late-a-while-b.png')});
    expect(a.events).toHaveLength(1);expect(b.events).toHaveLength(0);
    await expect(dialog(page).getByLabel('Responsable',{exact:true}),'El acuse de A no borra el formulario de B').toHaveValue('Borrador B independiente');
    await expect(dialog(page).locator('.cr-done'),'B no se anuncia como guardado por el acuse de A').toHaveCount(0);
  }finally{held.release();}
});

test('evento de bloqueo retira el Radar y un acuse tardío no vuelve a consultar ni repoblarlo',async({page})=>{
  await start(page);await open(page,'installation-north');await draft(page,'Responsable A bloqueado','Paso A bloqueado');
  const held=gate();let received=0,lateReads=0,released=false;
  await page.route('**/api/v7/commitments/installation-north/decisions',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);received++;await held.promise;await route.fulfill({response}).catch(()=>undefined);});
  page.on('request',q=>{if(released&&q.method()==='GET'&&new URL(q.url()).pathname.startsWith('/api/v7/commitments'))lateReads++;});
  try{
    await dialog(page).getByRole('button',{name:'Guardar asignación',exact:true}).click();await expect.poll(()=>received).toBe(1);
    await page.evaluate(()=>window.dispatchEvent(new Event('planb:locked')));await expect(page.locator('.cr-item')).toHaveCount(0);await expect(dialog(page)).toHaveCount(0);
    const arrived=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v7/commitments/installation-north/decisions');
    released=true;held.release();await arrived;
    await page.waitForTimeout(500);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    fs.writeFileSync(path.join(h.caseDir,'late-after-lock.json'),JSON.stringify({lateReads,visibleItems:await page.locator('.cr-item').count(),requests:h.requests().filter(q=>q.method==='POST'&&q.path.endsWith('/decisions'))},null,2));
    await page.screenshot({path:path.join(h.caseDir,'late-after-lock.png')});
    expect(lateReads,'El propietario bloqueado no vuelve a leer por recibir un acuse anterior').toBe(0);
    await expect(page.locator('.cr-item')).toHaveCount(0);
  }finally{held.release();}
});
