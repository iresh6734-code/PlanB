import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
declare global{interface Window{__evidence104Signals?:(AbortSignal|null|undefined)[];__evidence104Completed?:number[]}}

test.describe.configure({mode:'serial'});
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),source=process.env.PLANB_EVIDENCE104_SOURCE??repo;
const port=Number(process.env.PLANB_EVIDENCE104_PORT??4514),origin='http://127.0.0.1:'+port,api='**/api/v7/continuity/evidence?*';
const {createBaseApp}=await import(pathToFileURL(path.join(source,'server/app.ts')).href) as typeof import('../../server/app.js');
const {registerContinuityEvidenceApi}=await import(pathToFileURL(path.join(source,'server/continuity-evidence-api.ts')).href) as typeof import('../../server/continuity-evidence-api.js');
const {makeFixture,makeDemoSpec}=await import(pathToFileURL(path.join(source,'shared/fixtures.ts')).href) as typeof import('../../shared/fixtures.js');
let fixture:Awaited<ReturnType<typeof createBaseApp>>,folder:string;
test.beforeAll(async()=>{
  expect(port).toBeGreaterThanOrEqual(4514);expect(port).toBeLessThanOrEqual(4519);
  folder=path.resolve('tests/.tmp/evidence104-browser-'+randomUUID());fs.mkdirSync(folder,{recursive:true});
  let dist=process.env.PLANB_EVIDENCE104_DIST;
  if(!dist){const {build}=await import('vite'),{default:react}=await import('@vitejs/plugin-react');dist=path.join(folder,'dist');await build({configFile:false,root:path.join(source,'design/continuity-evidence'),base:'./',logLevel:'warn',plugins:[react()],build:{outDir:dist,emptyOutDir:false}});}
  expect(fs.readFileSync(path.join(dist,'index.html'),'utf8')).toContain('PLANB104');
  fixture=await createBaseApp({root:folder,dbPath:':memory:',staticDir:path.resolve(dist)});
  const snapshot=makeFixture();snapshot.capturedAt=new Date(Date.now()-45*60_000).toISOString();fixture.store.importSnapshot(snapshot);fixture.store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});fixture.store.activate();registerContinuityEvidenceApi(fixture.app,fixture.store);
  await fixture.app.listen({host:'127.0.0.1',port});
});
test.afterAll(async()=>{await fixture?.app.close();});
test.beforeEach(async({page})=>{await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());});
const result=(page:Page)=>page.getByTestId('evidence-result');
const query=(page:Page)=>page.getByRole('button',{name:'Consultar evidencia',exact:true});
async function open(page:Page){await page.goto(origin);await expect(page).toHaveTitle('Plan B · Evidencia de continuidad');await expect(page.getByRole('heading',{name:'Evidencia de tu copia',exact:true})).toBeVisible();}
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
async function ignoreAbort(page:Page){await page.addInitScript(()=>{const original=window.fetch;window.__evidence104Signals=[];window.__evidence104Completed=[];window.fetch=async(input,init)=>{const relevant=String(input).includes('/api/v7/continuity/evidence'),index=window.__evidence104Signals!.length;if(relevant)window.__evidence104Signals!.push(init?.signal);const response=await original(input,{...init,signal:undefined});if(relevant){await response.clone().arrayBuffer();window.__evidence104Completed!.push(index);}return response;};});}
async function delivered(page:Page,index:number){await expect.poll(()=>page.evaluate(i=>window.__evidence104Completed!.includes(i),index)).toBe(true);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
test('explicit read uses actual API, keeps the inventory truthful and sends nothing to another origin',async({page})=>{
  const requests:{method:string;url:string}[]=[],errors:string[]=[];page.on('request',r=>requests.push({method:r.method(),url:r.url()}));page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  await open(page);expect(requests.filter(r=>r.url.includes('/api/v7/continuity/evidence'))).toHaveLength(0);await query(page).click();await expect(result(page)).toBeVisible();await expect(result(page)).toContainText('Preparación sin comprobar');await expect(result(page)).toContainText('14 tareas tienen un día de vencimiento, sin hora');await expect(result(page)).toContainText('No medido.');await expect(result(page)).toContainText('No demostrada. Un simulacro local no sustituye esa prueba.');
  for(const r of requests){expect(r.url.startsWith(origin+'/'),r.url).toBeTruthy();expect(r.method).toBe('GET');}expect(requests.filter(r=>r.url.includes('/api/v7/continuity/evidence'))).toHaveLength(1);expect(errors).toEqual([]);
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,cookie:document.cookie}))).toEqual({local:0,session:0,cookie:''});
});
test('keyboard query retains focus while busy and after completion; native provenance disclosure works',async({page})=>{
  const held=gate(),arrived=gate();await page.route(api,async route=>{arrived.release();await held.promise;await route.continue();});await open(page);
  for(let i=0;i<8&&!await query(page).evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');await expect(query(page)).toBeFocused();await page.keyboard.press('Enter');await arrived.promise;const busy=page.getByRole('button',{name:'Consultando…',exact:true});await expect(busy).toBeFocused();await expect(busy).toHaveAttribute('aria-disabled','true');await page.keyboard.press('Enter');held.release();await expect(result(page)).toBeVisible();await expect(page.getByRole('button',{name:'Consultar de nuevo',exact:true})).toBeFocused();
  const disclosure=page.getByText('Procedencia y límites de esta lectura',{exact:true});await disclosure.focus();await page.keyboard.press('Space');await expect(page.locator('.cev-details')).toHaveAttribute('open','');const outline=await disclosure.evaluate(el=>getComputedStyle(el).outlineWidth);expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);
});
test('changing selection clears the old result immediately; a late response ignoring abort cannot replace the new scenario',async({page})=>{
  await ignoreAbort(page);const held=gate(),arrived=gate();let seen=0;await page.route(api,async route=>{if(++seen===1){const response=await route.fetch();arrived.release();await held.promise;await route.fulfill({response});}else await route.continue();});
  await open(page);await query(page).click();await arrived.promise;await page.getByLabel('Escenario',{exact:true}).selectOption('device-loss');await expect(result(page)).toHaveCount(0);expect(seen).toBe(1);expect(await page.evaluate(()=>window.__evidence104Signals!.map(s=>s?.aborted))).toEqual([true]);await query(page).click();await expect(page.getByTestId('evidence-scenario')).toHaveText('Pérdida del equipo · 8 horas examinadas');const oldResponse=page.waitForResponse(r=>r.url().includes('/api/v7/continuity/evidence?')&&new URL(r.url()).searchParams.get('scenario')==='crm-outage');held.release();await oldResponse;await delivered(page,0);await page.getByText('Procedencia y límites de esta lectura',{exact:true}).click();await expect(page.getByTestId('evidence-scenario')).toHaveText('Pérdida del equipo · 8 horas examinadas');await expect(page.getByRole('alert')).toHaveCount(0);expect(seen).toBe(2);
});
test('a real changed Store invalidates the pin; reference update is explicit and never auto-retried',async({page})=>{
  const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/v7/continuity/evidence'))requests.push(r.url());});await open(page);await query(page).click();await expect(result(page)).toBeVisible();fixture.store.saveRecord('contacts',{phone:'fictional-browser-change104'},'contact-1');await page.getByRole('button',{name:'Consultar de nuevo',exact:true}).click();await expect(page.getByRole('alert')).toContainText('La referencia local cambió');await expect(result(page)).toHaveCount(0);expect(requests).toHaveLength(2);await page.getByRole('button',{name:'Actualizar referencia y consultar',exact:true}).click();await expect(result(page)).toBeVisible();expect(requests).toHaveLength(3);expect(new URL(requests[1]).searchParams.has('revision')).toBeTruthy();expect(new URL(requests[2]).searchParams.has('revision')).toBeFalsy();
});
test('HTTP failures retire previous evidence and keep private server error details out of the UI',async({page})=>{
  await open(page);await query(page).click();await expect(result(page)).toBeVisible();let code=401;await page.route(api,route=>route.fulfill({status:code,json:{error:'PRIVATE_SERVER_DETAIL104'}}));
  for(const status of [401,404,409,422,503]){code=status;const button=page.getByRole('button',{name:/^(Consultar de nuevo|Consultar evidencia|Actualizar referencia y consultar)$/});await button.click();await expect(page.getByRole('alert')).toBeVisible();await expect(result(page)).toHaveCount(0);await expect(page.locator('body')).not.toContainText('PRIVATE_SERVER_DETAIL104');}await expect(page.getByRole('alert')).toContainText('Comprueba su disponibilidad');
});
test('a successful HTTP response with malformed, mismatched or private internal wire data never becomes a result',async({page})=>{
  let mode=0;await page.route(api,async route=>{const response=await route.fetch(),body=await response.json();if(mode===0)body.parameters.outageMinutes=60;if(mode===1)body.context.spaceId='other';if(mode===2)body.evaluation.measuredRecoveryMs=1;if(mode===3)body.input={privateRecords:'PRIVATE_WIRE104'};await route.fulfill({json:body});});await open(page);
  for(mode=0;mode<4;mode++){await query(page).click();await expect(page.getByRole('alert')).toContainText('La respuesta no permite comprobar');await expect(result(page)).toHaveCount(0);await expect(page.locator('body')).not.toContainText('PRIVATE_WIRE104');}
});
test('a fabricated ready verdict retires the previous result and the next genuine read recovers',async({page})=>{
  let reads=0;
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(api,async route=>{
    if(++reads!==2){await route.continue();return;}
    const response=await route.fetch();
    expect(response.status()).toBe(200);
    const body=await response.json();
    expect(body.evaluation.measuredRecoveryMs).toBeNull();
    expect(body.facts.export.otherDevice).toBe('not-demonstrated');
    body.evaluation.status='ready';
    for(const check of body.evaluation.checks)check.status='pass';
    await route.fulfill({json:body});
  });
  await open(page);
  await query(page).click();
  await expect(result(page)).toContainText('Preparación sin comprobar');
  await page.getByRole('button',{name:'Consultar de nuevo',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('La respuesta no permite comprobar');
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByText('Preparado según esta evidencia',{exact:true})).toHaveCount(0);
  const screenshots=process.env.PLANB_EVIDENCE104_SHOTS;
  if(screenshots){
    fs.mkdirSync(screenshots,{recursive:true});
    await page.screenshot({path:path.join(screenshots,'invalid-ready.png')});
  }
  await query(page).click();
  await expect(result(page)).toContainText('Preparación sin comprobar');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(3);
  expect(errors).toEqual([]);
});
test('closing and unmounting abort outstanding reads and reopening never queries automatically',async({page})=>{
  await ignoreAbort(page);const held:ReturnType<typeof gate>[]=[],arrived:ReturnType<typeof gate>[]=[];let calls=0;await page.route(api,async route=>{const i=calls++,response=await route.fetch();arrived[i].release();await held[i].promise;await route.fulfill({response});});await open(page);
  for(const unmount of [false,true]){const i=calls;held[i]=gate();arrived[i]=gate();await query(page).click();await arrived[i].promise;if(unmount)await page.getByRole('button',{name:'Cerrar vista',exact:true}).click();else await page.getByRole('button',{name:'Ocultar evidencia',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__evidence104Signals!.at(-1)?.aborted)).toBe(true);const oldResponse=page.waitForResponse(r=>r.url().includes('/api/v7/continuity/evidence?'));held[i].release();await oldResponse;await delivered(page,i);await expect(result(page)).toHaveCount(0);if(unmount)await page.getByRole('button',{name:'Abrir vista',exact:true}).click();else await page.getByRole('button',{name:'Mostrar evidencia',exact:true}).click();await expect(query(page)).toBeVisible();await expect(result(page)).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);expect(calls).toBe(i+1);}
});
test('desktop and narrow viewports preserve labels, controls, dates and complete readable evidence',async({page})=>{
  await open(page);await query(page).click();await expect(result(page)).toBeVisible();const directory=process.env.PLANB_EVIDENCE104_SHOTS??path.join(folder,'shots');fs.mkdirSync(directory,{recursive:true});
  for(const[width,height,name]of [[1440,1000,'desktop'],[390,844,'mobile'],[320,844,'narrow']] as const){await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();for(const c of await page.locator('.cev button,.cev select').all()){const box=await c.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(width<=480?44:32);}await expect(page.getByRole('heading',{name:'Evidencia de tu copia',exact:true})).toBeVisible();await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});await page.screenshot({path:path.join(directory,name+'-viewport.png'),fullPage:false});}
});
