import { test,expect } from '@playwright/test';
import { resolve } from 'node:path';
const team='http://127.0.0.1:4341',output=resolve(process.env.PLANB_EVIDENCE_DIR||'test-results');
test('Picker: selección adicional disponible sin consultar Drive ni depender de una lectura anterior',async({page})=>{
  let driveReads=0;page.on('request',request=>{if(/\/v6\/files(?:\?|$)/.test(request.url()))driveReads++;});
  await page.route('**/v6/file-links?**',async route=>{const response=await route.fetch(),data=await response.json();data.pickerConfigured=true;await route.fulfill({response,json:data});});
  await page.goto(team+'/team');await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true});
  await expect(drawer.getByRole('button',{name:'Elegir y vincular en Google',exact:true})).toBeEnabled();expect(driveReads).toBe(0);
  const documents=drawer.getByRole('region',{name:'Documentos del cliente'});await documents.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'selector-google-escritorio.png'),fullPage:false});
  for(const width of [390,320]){await page.setViewportSize({width,height:950});await documents.scrollIntoViewIfNeeded();expect(await drawer.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBeTruthy();if(width===390)await page.screenshot({path:resolve(output,'selector-google-movil.png'),fullPage:false});}
});
test('documentos: selección revisada, persistencia, lectura explícita y retirada sin servicios externos',async({page})=>{
  const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(team+'/team');await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true}),files=drawer.getByRole('region',{name:'Documentos del cliente'});
  await files.getByRole('button',{name:'Seleccionar archivos autorizados',exact:true}).click();await expect(files.getByRole('button',{name:'Vincular selección',exact:true})).toBeDisabled();
  await files.getByLabel('Buscar por nombre',{exact:true}).fill('Propuesta');await files.getByRole('checkbox',{name:'Propuesta comercial · Ensayo',exact:true}).check();await files.getByRole('checkbox',{name:'He revisado los archivos y el cliente al que los vinculo.',exact:true}).check();await files.getByRole('button',{name:'Vincular selección',exact:true}).click();
  await expect(files.getByRole('status')).toContainText('Archivos vinculados solo dentro de Plan B.');await expect(files.locator('pre')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();await expect(files.getByText('Propuesta comercial · Ensayo',{exact:true})).toHaveCount(1);
  await files.getByRole('button',{name:'Leer contexto del documento',exact:true}).click();await expect(files.locator('pre')).toContainText('Propuesta ficticia');
  await files.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'documentos-cliente-escritorio.png'),fullPage:false});
  for(const width of [390,320]){await page.setViewportSize({width,height:950});await files.scrollIntoViewIfNeeded();expect(await drawer.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBeTruthy();if(width===390)await page.screenshot({path:resolve(output,'documentos-cliente-movil.png'),fullPage:false});}
  await files.getByRole('button',{name:'Quitar vínculo',exact:true}).click();await expect(files.getByText('Solo se quita de esta ficha. El archivo permanece en Google.',{exact:true})).toBeVisible();await files.getByRole('button',{name:'Confirmar retirada',exact:true}).click();await expect(files.getByRole('status')).toContainText('El archivo sigue en Google.');
  await page.reload();await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();await expect(files.getByRole('button',{name:'Leer contexto del documento',exact:true})).toHaveCount(0);expect(external).toEqual([]);expect(errors).toEqual([]);
});

test('Picker: retorno abre la ficha correcta, limpia el código y no sustituye la conexión general',async({page})=>{
  const external:string[]=[];let completed=0,main=0;
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(team+'/team');await expect(page.getByRole('heading',{name:'Las relaciones de tu equipo.',exact:true})).toBeVisible();
  const tenant=await page.getByLabel('Empresa activa',{exact:true}).inputValue(),state='a'.repeat(64);
  await page.evaluate(({tenant,state})=>sessionStorage.setItem('planb-google-picker',JSON.stringify({tenant,state})),{tenant,state});
  await page.route('**/v6/files/picker/complete',async route=>{completed++;const body=route.request().postDataJSON();expect(body.fileIds).toEqual(['ensayo-propuesta']);await route.fulfill({json:{linked:true,count:1,contactId:'contact-1',local:true}});});
  await page.route('**/v6/google/complete',route=>{main++;return route.fulfill({status:500,json:{error:'No debe sustituir la cuenta principal'}});});
  await page.goto(team+'/team/oauth/google/callback?state='+state+'&code=code-ficticio&picked_file_ids=ensayo-propuesta');
  await expect(page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('Archivos seleccionados vinculados');
  expect(page.url()).not.toContain('code=');expect(page.url()).not.toContain('state=');expect(completed).toBe(1);expect(main).toBe(0);expect(external).toEqual([]);
});

test('Picker: cancelación limpia el estado y no llama al intercambio principal',async({page})=>{
  await page.goto(team+'/team');await expect(page.getByRole('heading',{name:'Las relaciones de tu equipo.',exact:true})).toBeVisible();
  const tenant=await page.getByLabel('Empresa activa',{exact:true}).inputValue(),state='b'.repeat(64);let cancelled=0,completed=0;
  await page.evaluate(({tenant,state})=>sessionStorage.setItem('planb-google-picker',JSON.stringify({tenant,state})),{tenant,state});
  await page.route('**/v6/files/picker/cancel',route=>{cancelled++;return route.fulfill({json:{cancelled:true}});});
  await page.route('**/v6/google/complete',route=>{completed++;return route.fulfill({json:{}});});
  await page.goto(team+'/team/oauth/google/callback?error=access_denied&state='+state);
  await expect(page.getByRole('status')).toContainText('Selección cancelada. No se han añadido vínculos.');expect(cancelled).toBe(1);expect(completed).toBe(0);expect(await page.evaluate(()=>sessionStorage.getItem('planb-google-picker'))).toBeNull();expect(page.url()).not.toContain('state=');
});
