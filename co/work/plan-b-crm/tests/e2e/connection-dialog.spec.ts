import { test, expect, type Page, type Route } from '@playwright/test';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:4403',password='fixture-local-connection065',credential='fiction-only-credential065';
const inspection=(accountId='65001',mode='test',count=3)=>({accountId,mode,accountType:mode==='test'?'DEVELOPER_TEST':'STANDARD',fields:{contacts:Array.from({length:count},(_,i)=>({key:'custom_'+i,label:'Campo ficticio '+String(i).padStart(2,'0')})),companies:[],deals:[],tasks:[]},verifiedAt:'2026-10-30T10:00:00Z'});
async function open(page:Page,options:{inspect?:(route:Route,body:any)=>Promise<void>;save?:(route:Route,body:any)=>Promise<void>}={}) {
  if(test.info().project.use.baseURL!==origin)throw Error('Use only isolated fixture127.0.0.1:4403. All provider-shaped POSTs must be intercepted.');
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
  const inspected:any[]=[],saved:any[]=[],outside:string[]=[],errors:string[]=[];
  await page.route('**/api/v2/connection/inspect',async route=>{const body=route.request().postDataJSON();inspected.push(body);if(options.inspect)return options.inspect(route,body);await route.fulfill({json:inspection(body.accountId,body.mode)});});
  await page.route('**/api/v2/connection',async route=>{const body=route.request().postDataJSON();saved.push(body);if(options.save)return options.save(route,body);await route.fulfill({json:{saved:true,...inspection(body.accountId,body.mode)}});});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){outside.push(url.origin);return route.abort();}return route.fallback();});
  page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByRole('button',{name:'Conectar HubSpot',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Conectar HubSpot',exact:true});await dialog.getByLabel('ID de cuenta',{exact:true}).fill('65001');await dialog.getByLabel('Service Key o token de lectura',{exact:true}).fill(credential);await dialog.getByRole('checkbox',{name:'Confirmo que la cuenta es de ensayo y contiene datos ficticios.',exact:true}).check();
  return {dialog,inspected,saved,outside,errors};
}
async function noActualConnection(page:Page,state:Awaited<ReturnType<typeof open>>) {
  // These fixture form POSTs were intercepted. The backend must still have no saved connector or token.
  expect((await page.request.get('/api/v2/continuity').then(r=>r.json())).connection).toBeNull();expect(state.outside).toEqual([]);expect(state.errors).toEqual([]);
}

test('connection065: one inspection freezes inputs, review submits the exact portal/mode and chosen fields only',async({page})=>{
  let release!:()=>void;const ready=new Promise<void>(r=>{release=r;});
  const state=await open(page,{inspect:async(route,body)=>{await ready;await route.fulfill({json:inspection(body.accountId,body.mode)});}});
  for(const control of [state.dialog.getByLabel('ID de cuenta',{exact:true}),state.dialog.getByRole('combobox',{name:'Modo de conexión',exact:true}),state.dialog.getByLabel('Service Key o token de lectura',{exact:true})])expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await state.dialog.getByRole('button',{name:'Comprobar cuenta y permisos',exact:true}).click();await expect.poll(()=>state.inspected.length).toBe(1);await expect(state.dialog.getByLabel('ID de cuenta',{exact:true})).toBeDisabled();await expect(state.dialog.getByRole('combobox',{name:'Modo de conexión',exact:true})).toBeDisabled();
  await state.dialog.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(state.inspected).toHaveLength(1);release();
  await expect(state.dialog.getByRole('heading',{name:'Revisa los campos que conservarás',exact:true})).toBeVisible();await state.dialog.getByRole('checkbox',{name:'Campo ficticio 01',exact:true}).check();await state.dialog.getByRole('button',{name:'Guardar conexión',exact:true}).click();await expect(state.dialog).toBeHidden();
  expect(state.saved).toHaveLength(1);expect(state.saved[0]).toMatchObject({accountId:'65001',mode:'test',token:credential,confirmedTestAccount:true,confirmedProduction:false,selectedFields:{contacts:['custom_1']}});await noActualConnection(page,state);
});

test('connection065: valid late inspection after close cannot reopen or replace a fresh dialog, even ignoring abort',async({page})=>{
  await page.addInitScript(()=>{const native=window.fetch.bind(window),held={ready:false,consumed:false,release:()=>{}};(window as any).__connection065=held;window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.toString():input.url,location.href);if(url.pathname!=='/api/v2/connection/inspect'||held.ready)return native(input,init);return native(input,{...init,signal:null}).then(async response=>{const raw=response.json.bind(response);response.json=async()=>{const body=await raw();held.consumed=true;return body;};return new Promise<Response>(resolve=>{held.release=()=>resolve(response);held.ready=true;});});};});
  const state=await open(page);await state.dialog.getByRole('button',{name:'Comprobar cuenta y permisos',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__connection065.ready)).toBeTruthy();await state.dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(state.dialog).toBeHidden();
  await page.getByRole('button',{name:'Conectar HubSpot',exact:true}).click();await expect(state.dialog.getByLabel('ID de cuenta',{exact:true})).toHaveValue('');await page.evaluate(()=>(window as any).__connection065.release());await expect.poll(()=>page.evaluate(()=>(window as any).__connection065.consumed)).toBeTruthy();await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  await expect(state.dialog.getByRole('heading',{name:'Revisa los campos que conservarás',exact:true})).toHaveCount(0);await expect(state.dialog.getByLabel('ID de cuenta',{exact:true})).toHaveValue('');expect(state.saved).toEqual([]);await noActualConnection(page,state);
});

test('connection065: successful mocked save followed by failed refresh retries only reads and clears credential UI',async({page})=>{
  let fail=true;const state=await open(page);await page.route('**/api/v2/continuity',route=>fail&&state.saved.length>0?route.fulfill({status:503,json:{error:'Fixture refresh unavailable'}}):route.fallback());
  await state.dialog.getByRole('button',{name:'Comprobar cuenta y permisos',exact:true}).click();await state.dialog.getByRole('button',{name:'Guardar conexión',exact:true}).click();await expect(state.dialog.getByRole('heading',{name:'Conexión guardada',exact:true})).toBeVisible();await expect(state.dialog.getByRole('alert')).toContainText('no se enviará otra petición de guardado');await expect(state.dialog.locator('input[type="password"]')).toHaveCount(0);expect(state.saved).toHaveLength(1);
  fail=false;await state.dialog.getByRole('button',{name:'Reintentar actualización',exact:true}).click();await expect(state.dialog).toBeHidden();expect(state.saved).toHaveLength(1);await noActualConnection(page,state);
});

test('connection065: mismatched account response never enables saving, changing mode resets confirmation',async({page})=>{
  const state=await open(page,{inspect:async route=>{await route.fulfill({json:inspection('65002')});}});await state.dialog.getByRole('button',{name:'Comprobar cuenta y permisos',exact:true}).click();await expect(state.dialog.getByRole('alert')).toContainText('no corresponde al portal');await expect(state.dialog.getByRole('button',{name:'Guardar conexión',exact:true})).toHaveCount(0);
  await state.dialog.getByRole('combobox',{name:'Modo de conexión',exact:true}).selectOption('production_readonly');await expect(state.dialog.getByRole('checkbox',{name:'Tengo autorización del cliente para conservar esta copia en su ordenador; he acordado su alcance y custodia.',exact:true})).not.toBeChecked();await expect(state.dialog.getByRole('button',{name:'Comprobar cuenta y permisos',exact:true})).toBeDisabled();expect(state.saved).toEqual([]);await noActualConnection(page,state);
});

test('connection065: selection caps at60 and the reviewed schema is usable with keyboard at1440 and320',async({page})=>{
  const state=await open(page,{inspect:async(route,body)=>{await route.fulfill({json:inspection(body.accountId,body.mode,61)});}});await state.dialog.getByRole('button',{name:'Comprobar cuenta y permisos',exact:true}).click();await expect(state.dialog.getByRole('checkbox',{name:'Campo ficticio 60',exact:true})).toBeVisible();
  await state.dialog.locator('input[type="checkbox"]').evaluateAll(inputs=>{for(const input of inputs.slice(0,60))(input as HTMLInputElement).click();});await expect(state.dialog.getByRole('checkbox',{name:'Campo ficticio 60',exact:true})).toBeDisabled();await expect(state.dialog.getByText('60 de 60 seleccionados · 61 disponibles',{exact:true})).toBeVisible();await state.dialog.getByRole('checkbox',{name:'Campo ficticio 00',exact:true}).focus();await page.keyboard.press('Space');await expect(state.dialog.getByRole('checkbox',{name:'Campo ficticio 00',exact:true})).not.toBeChecked();await expect(state.dialog.getByRole('checkbox',{name:'Campo ficticio 60',exact:true})).toBeEnabled();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await state.dialog.locator('.connection-dialog').evaluate(el=>el.scrollTo(0,0));await expect(state.dialog.getByText('Portal 65001 · DEVELOPER_TEST · Ensayo',{exact:true})).toBeInViewport();await expect(state.dialog.getByRole('heading',{name:'Revisa los campos que conservarás',exact:true})).toBeInViewport();await page.screenshot({path:resolve(process.env.PLANB_EVIDENCE_DIR!,'connection065-'+width+'.png'),fullPage:false});}
  await state.dialog.getByRole('button',{name:'Revisar conexión',exact:true}).click();await expect(state.dialog.getByLabel('Service Key o token de lectura',{exact:true})).toHaveValue(credential);await expect(state.dialog.getByRole('heading',{name:'Revisa los campos que conservarás',exact:true})).toHaveCount(0);expect(state.saved).toEqual([]);await noActualConnection(page,state);
});
