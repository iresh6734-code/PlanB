import { test,expect } from '@playwright/test';
import { resolve } from 'node:path';
// El selector de clientes es un combobox accesible: se abre y se elige la opción por el ID del cliente (no hay select nativo).
const pickCustomer=async(page:import('@playwright/test').Page,label:string,id:string)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.locator('[role="option"][data-contact-id="'+id+'"]').click();};
const team='http://127.0.0.1:4341',output=resolve(process.env.PLANB_EVIDENCE_DIR||'test-results');

test('ficha comercial: acción interna persistente, cierre y borrador sin acciones externas',async({page})=>{
  const errors:string[]=[],external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(team+'/team');await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true});await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Empresa de prueba Arce',{exact:true})).toBeVisible();await expect(drawer.getByText('No conservado en los datos disponibles',{exact:true})).toBeVisible();
  await expect(drawer.getByText('Rediseño web · Estudio Arce',{exact:true})).toBeVisible();
  await drawer.getByLabel('Qué hay que hacer',{exact:true}).fill('Revisar alcance · prueba local');await drawer.getByLabel('Fecha y hora local',{exact:true}).fill('2099-10-30T11:00');await drawer.getByRole('button',{name:'Guardar próxima acción',exact:true}).click();
  await expect(drawer.getByRole('status')).toContainText('Próxima acción guardada solo en Plan B.');
  await page.reload();await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();await expect(drawer.getByText('Revisar alcance · prueba local',{exact:true})).toHaveCount(1);
  await drawer.getByRole('button',{name:'Completar Revisar alcance · prueba local',exact:true}).click();await expect(drawer.getByRole('status')).toContainText('Acción completada');await expect(drawer.getByRole('button',{name:'Reabrir',exact:true})).toBeVisible();
  await page.screenshot({path:resolve(output,'ficha-cliente-escritorio.png'),fullPage:false});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    const box=await drawer.boundingBox();expect(box!.width).toBeLessThanOrEqual(width);expect(await drawer.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBeTruthy();
    if(width===390)await page.screenshot({path:resolve(output,'ficha-cliente-movil.png'),fullPage:false});
  }
  await page.setViewportSize({width:1440,height:1000});await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();await expect(page.getByRole('button',{name:'Lucía Martín',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();await drawer.getByRole('button',{name:'Preparar seguimiento',exact:true}).click();
  const proposal=page.locator('.commercial-proposal[open]');await expect(proposal).toBeVisible();
  for(const name of ['Enviar seguimiento en Gmail','Invitar a una reunión en Calendar','Crear propuesta en Docs','Crear informe en Sheets'])await expect(proposal.getByLabel(name,{exact:true})).not.toBeChecked();
  await page.reload();await expect(page.getByRole('heading',{name:'Cada seguimiento, preparado.',exact:true})).toBeVisible();
  expect(external).toEqual([]);expect(errors).toEqual([]);
});

test('piloto personal: aviso y aprobación bloqueada para destinatario ajeno en interfaz',async({page})=>{
  // Contract fixture for the personal policy; no real accounts or Google calls.
  await page.route('**/v6/commercial',async route=>{const response=await route.fetch();const data=await response.json();data.ownAccountOnly=true;data.connection={account:'propio@ficticio.example',revision:'fixture'};await route.fulfill({response,json:data});});
  await page.goto(team+'/team?view=commercial');await expect(page.getByText('Piloto personal.',{exact:true})).toBeVisible();
  await pickCustomer(page,'Cliente del seguimiento','contact-1');page.once('dialog',dialog=>void dialog.accept());await page.getByRole('button',{name:'Preparar seguimiento',exact:true}).click();
  const proposal=page.locator('.commercial-proposal[open]');await expect(proposal.getByRole('alert')).toContainText('propia cuenta');
  await proposal.getByLabel('He revisado el destinatario, el mensaje, las acciones y el horario.',{exact:true}).check();await expect(proposal.getByRole('button',{name:'Aprobar seguimiento',exact:true})).toBeDisabled();
  await page.screenshot({path:resolve(output,'piloto-destinatario-bloqueado.png'),fullPage:true});
});
