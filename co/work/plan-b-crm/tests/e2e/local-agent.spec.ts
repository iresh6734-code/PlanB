import { test,expect } from '@playwright/test';
import { resolve } from 'node:path';
const output=resolve(process.env.PLANB_EVIDENCE_DIR||'test-results/local-agent');

test('agente local: configuración explícita, revisión, fallo recuperable y diseño escritorio/móvil',async({page})=>{
  const errors:string[]=[],external:string[]=[];let modelCalls=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('502'))errors.push(m.text());});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.route('**/v6/copilot/runs',async route=>{modelCalls++;expect(route.request().postDataJSON()).toMatchObject({provider:'ollama',reviewed:true});await route.fulfill({status:502,json:{error:'El modelo de prueba no está disponible. No se repite automáticamente.'}});});
  await page.goto('/team?view=agent');await expect(page).toHaveTitle(/Plan B/);
  await expect(page.getByRole('heading',{name:'Oportunidades sin próxima acción',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Conectar Microsoft',exact:true})).toHaveCount(0);
  const settings=page.locator('.local-agent-settings');await settings.locator('summary').click();
  const enable=page.getByRole('button',{name:'Habilitar modelo local',exact:true});await expect(enable).toBeDisabled();
  await page.getByLabel('Nombre del modelo instalado',{exact:true}).fill('ficticio:small');await expect(enable).toBeDisabled();
  await page.getByRole('checkbox',{name:/Confirmo que es un equipo propio/}).check();await enable.click();await expect(page.getByRole('status')).toContainText('Modelo todavía sin comprobar');expect(modelCalls).toBe(0);
  await page.getByRole('button',{name:'Revisar contexto',exact:true}).first().click();
  const improve=page.getByRole('button',{name:'Mejorar con IA local',exact:true});await expect(improve).toBeDisabled();
  await page.getByRole('checkbox',{name:'Autorizo procesar este contexto con el modelo local indicado.',exact:true}).check();await expect(improve).toBeEnabled();
  await settings.locator('summary').click();await improve.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'agente-local-escritorio.png'),fullPage:false});
  for(const width of [390,320]){await page.setViewportSize({width,height:950});await improve.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();if(width===390)await page.screenshot({path:resolve(output,'agente-local-movil.png'),fullPage:false});}
  await improve.click();await expect(page.getByRole('alert')).toContainText('No se repite automáticamente');await expect(improve).toBeDisabled();expect(modelCalls).toBe(1);
  await settings.locator('summary').click();await page.getByRole('button',{name:'Desactivar modelo local',exact:true}).click();await expect(page.getByRole('status')).toContainText('Modelo local desactivado');await expect(improve).toHaveCount(0);
  expect(external).toEqual([]);expect(errors).toEqual([]);
});

test('agente: cambiar de empresa limpia contexto y lector no habilita ni genera',async({page})=>{
  await page.goto('/team?view=agent');await page.getByRole('button',{name:'Revisar contexto',exact:true}).first().click();await expect(page.locator('.agent-context-preview')).toBeVisible();
  const companies=page.getByLabel('Empresa activa',{exact:true}),options=await companies.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));const current=await companies.inputValue();await companies.selectOption(options.find(id=>id!==current)!);await expect(page.locator('.agent-context-preview')).toHaveCount(0);
  await page.getByLabel('Perfil de ensayo',{exact:true}).selectOption('demo-viewer');await page.locator('.local-agent-settings summary').click();await expect(page.getByRole('button',{name:'Habilitar modelo local',exact:true})).toHaveCount(0);await expect(page.getByText('Administración puede configurar el modelo local.',{exact:true})).toBeVisible();
});
