import {test,expect,type Page} from '@playwright/test';
// El selector de clientes es un combobox accesible: se abre y se elige la opción por el ID del cliente (no hay select nativo).
const pickCustomer=async(page:import('@playwright/test').Page,label:string,id:string)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.locator('[role="option"][data-contact-id="'+id+'"]').click();};
const team='http://127.0.0.1:4341';
// El servidor de demo no tiene piloto local: se simula solo la parte que ve el navegador (configuración y puerta de desbloqueo).
async function pilotLike(page:Page,onLock?:()=>void,asPilot=false){
  // asPilot: sin modo demo (aparece «Bloquear piloto»); reutiliza la sesión demo ya autenticada como si fuera la del piloto.
  if(asPilot){await page.goto(team+'/team');await expect(page.getByLabel('Empresa activa',{exact:true})).toBeVisible();}
  await page.route('**/api/team/config',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),localPilot:true,...(asPilot?{demo:false}:{})}});});
  await page.route('**/api/team/local-pilot/status',route=>route.fulfill({json:{configured:true,authenticated:true}}));
  await page.route('**/api/team/local-pilot/login',route=>route.fulfill({json:{ok:true}}));
  await page.route('**/api/team/local-pilot/lock',route=>{onLock?.();return route.fulfill({json:{}});});
}
async function openDraft(page:Page){
  await page.goto(team+'/team?view=commercial');await expect(page.getByRole('heading',{name:'Cada seguimiento, preparado.',exact:true})).toBeVisible();
  await pickCustomer(page,'Cliente del seguimiento','contact-1');
  const accept=(dialog:import('@playwright/test').Dialog)=>void dialog.accept();page.on('dialog',accept);
  await page.getByRole('button',{name:'Preparar seguimiento',exact:true}).click();await expect(page.getByRole('status')).toContainText('Seguimiento preparado para revisión.');page.off('dialog',accept);
  const proposal=page.locator('.commercial-proposal').first();const message=proposal.getByLabel('Mensaje del seguimiento',{exact:true});
  await message.fill('Texto que todavía no se ha guardado y no debe perderse.');return {proposal,message};
}

test('sesión caducada (401): la pantalla se oculta bajo la puerta de desbloqueo y el borrador se recupera al desbloquear',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await pilotLike(page);
  const {proposal,message}=await openDraft(page);
  let expired=true;await page.route('**/proposals/*/edit',route=>expired?route.fulfill({status:401,json:{error:'La sesión del piloto caducó.'}}):route.continue());
  await proposal.getByRole('button',{name:'Guardar borrador',exact:true}).click();
  const gate=page.getByRole('heading',{name:'Sesión bloqueada.',exact:true});await expect(gate).toBeVisible();
  await expect(page.getByText('Tus cambios sin guardar se conservan en esta pantalla')).toBeVisible();
  // Nada de la aplicación es visible ni accesible, pero sigue montada.
  const shell=page.locator('.app-shell');await expect(shell).toHaveCount(1);await expect(shell).toBeHidden();await expect(shell).toHaveAttribute('inert','');
  await expect(message).toBeHidden();await expect(page.getByRole('button',{name:'Contactos',exact:true})).toBeHidden();
  expired=false;
  await page.getByLabel('Contraseña del piloto',{exact:true}).fill('cualquier-clave-de-prueba');await page.getByRole('button',{name:'Desbloquear piloto',exact:true}).click();
  await expect(gate).toBeHidden();await expect(shell).toBeVisible();
  await expect(proposal.getByLabel('Mensaje del seguimiento',{exact:true})).toHaveValue('Texto que todavía no se ha guardado y no debe perderse.');
  await proposal.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(page.getByRole('status')).toContainText('Borrador guardado.');
  expect(errors).toEqual([]);
});
test('sesión caducada sin borradores: el mensaje no promete conservar nada',async({page})=>{
  await pilotLike(page);await page.goto(team+'/team?view=commercial');await expect(page.getByRole('heading',{name:'Cada seguimiento, preparado.',exact:true})).toBeVisible();
  await page.route('**/api/team/spaces/*',route=>route.fulfill({status:401,json:{error:'La sesión del piloto caducó.'}}));
  await page.getByRole('button',{name:'Contactos',exact:true}).click();await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sesión bloqueada.',exact:true})).toBeVisible();await expect(page.getByText('Desbloquéala para continuar donde estabas.')).toBeVisible();
  await expect(page.getByText('se conservan en esta pantalla')).toHaveCount(0);
});
test('el bloqueo deliberado sigue vaciando la pantalla tras confirmar el descarte',async({page})=>{
  let locked=0;await pilotLike(page,()=>locked++,true);
  await openDraft(page);
  page.once('dialog',dialog=>void dialog.dismiss());await page.getByRole('button',{name:'Bloquear piloto',exact:true}).click();
  await expect(page.locator('.app-shell')).toBeVisible();expect(locked).toBe(0);
  page.once('dialog',dialog=>void dialog.accept());await page.getByRole('button',{name:'Bloquear piloto',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu equipo, en Plan B.',exact:true})).toBeVisible();await expect(page.locator('.app-shell')).toHaveCount(0);expect(locked).toBe(1);
});

test('con la sesión bloqueada se detiene el sondeo de Trabajos y el foco pasa a la puerta',async({page})=>{
  await pilotLike(page);await page.goto(team+'/team?view=commercial');await expect(page.getByRole('heading',{name:'Cada seguimiento, preparado.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Trabajos',exact:true}).click();await expect(page.getByText('Los trabajos quedan guardados',{exact:false})).toBeVisible();
  let hits=0;await page.route('**/api/team/spaces/*',route=>{hits++;return route.fulfill({status:401,json:{error:'La sesión del piloto caducó.'}});});
  const gate=page.getByRole('heading',{name:'Sesión bloqueada.',exact:true});await expect(gate).toBeVisible({timeout:8000});
  await expect(gate).toBeFocused();
  await page.waitForTimeout(500);const settled=hits;await page.waitForTimeout(3200);
  expect(settled).toBeGreaterThan(0);expect(hits,'ninguna petición más con la sesión caducada').toBe(settled);
});
test('una ficha abierta con texto sin guardar no atrapa Tab ni se cierra con Escape mientras la sesión está bloqueada',async({page})=>{
  await pilotLike(page);const dialogs:string[]=[];page.on('dialog',dialog=>{dialogs.push(dialog.message());void dialog.dismiss();});
  await page.goto(team+'/team');await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true});await expect(drawer).toBeVisible();
  await drawer.getByLabel('Qué hay que hacer',{exact:true}).fill('Texto de la ficha sin guardar');
  await page.route('**/v6/customers/**',route=>route.fulfill({status:401,json:{error:'La sesión del piloto caducó.'}}));
  await drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true}).click();
  const gate=page.getByRole('heading',{name:'Sesión bloqueada.',exact:true});await expect(gate).toBeVisible();
  await expect(page.getByLabel('Contraseña del piloto',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await page.keyboard.press('Tab');
  expect(dialogs,'Escape sobre un modal oculto no debe pedir confirmación').toEqual([]);
  // Un modal oculto que atrapara Tab dejaría el foco en el título; debe avanzar al campo de contraseña de la puerta.
  expect(await page.evaluate(()=>{const el=document.activeElement as HTMLInputElement|null;return !!el?.closest('.unlock-page')&&el.type==='password';}),'Tab avanza hasta la contraseña de la puerta').toBe(true);
  await expect(page.locator('.app-shell')).toHaveCount(1);
});
