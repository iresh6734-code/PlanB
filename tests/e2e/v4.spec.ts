import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { makeFixture } from '../../shared/fixtures.js';
const output=resolve(process.env.PLANB_EVIDENCE_DIR||'test-results');
async function setup(request:APIRequestContext,context:BrowserContext) {
  const auth=await request.get('/api/v2/auth/status').then(r=>r.json());
  const path=auth.configured?'login':'setup';
  expect((await request.post('/api/v2/auth/'+path,{data:{password:'solo-prueba-local-2026'}})).ok()).toBeTruthy();
  await context.addCookies((await request.storageState()).cookies);
  const snapshot=makeFixture();for(const r of snapshot.records)if(r.entity==='tasks')r.values.due_date='2020-01-01';
  expect((await request.post('/api/import/snapshot',{data:{snapshot,replace:true}})).ok()).toBeTruthy();
  expect((await request.post('/api/generate',{data:{mode:'demo'}})).ok()).toBeTruthy();
  expect((await request.post('/api/activate',{data:{reviewed:true}})).ok()).toBeTruthy();
}
test('v4: Hoy, revisión, simulación persistente, integraciones y móvil sin envíos externos',async({page,request,context})=>{
  await setup(request,context);const errors:string[]=[],external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  const before=await request.get('/api/records').then(r=>r.json());
  await page.goto('/');await page.getByRole('button',{name:'Hoy',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu día, con un siguiente paso.'})).toBeVisible();
  await expect(page.locator('.priority-workspace')).toBeVisible();await page.screenshot({path:resolve(output,'v0.4.0-hoy.png'),fullPage:true});
  await page.getByRole('button',{name:'Preparar seguimiento simulado',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Análisis terminado');
  await page.getByRole('button',{name:'Revisar propuestas',exact:true}).click();
  const card=page.locator('.proposal-card').first();
  await expect(card.getByRole('button',{name:'Aprobar simulación',exact:true})).toBeDisabled();
  await card.getByRole('checkbox').check();await card.getByRole('button',{name:'Aprobar simulación',exact:true}).click();
  await expect(card.getByText('Aprobada para simulación',{exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Ejecutar simulación aprobada',exact:true}).click();
  await expect(card.getByText('Simulación verificada',{exact:true})).toBeVisible();
  await expect(card.locator('.simulated-results p')).toHaveCount(3);
  await page.screenshot({path:resolve(output,'v0.4.0-propuesta-verificada.png'),fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Cambios',exact:true}).click();
  await expect(page.getByText('Simulación verificada',{exact:true})).toBeVisible();
  expect(await request.get('/api/records').then(r=>r.json())).toEqual(before);
  expect((await request.get('/api/v2/changes').then(r=>r.json())).changes).toHaveLength(0);
  await page.getByRole('button',{name:'Agentes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Trabajo preparado. Tú decides.'})).toBeVisible();
  await page.screenshot({path:resolve(output,'v0.4.0-agentes.png'),fullPage:true});
  await page.getByRole('button',{name:'Integraciones',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Gmail',exact:true})).toBeVisible();
  await expect(page.locator('.integration-directory article')).toHaveCount(6);await expect(page.getByText('Importación con vista previa e informes verificados.',{exact:true})).toBeVisible();
  await page.screenshot({path:resolve(output,'v0.4.0-integraciones.png'),fullPage:true});
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:900});
    for(const name of ['Hoy','Agentes','Integraciones','Cambios']) {
      await page.getByRole('button',{name,exact:true}).click();
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
      if(width===390&&name==='Hoy')await page.screenshot({path:resolve(output,'v0.4.0-movil-hoy.png'),fullPage:true});
    }
  }
  await request.patch('/api/records/contacts/contact-1',{data:{values:{phone:'600 555 555'}}});
  await page.getByRole('button',{name:'Agentes',exact:true}).click();await page.getByRole('button',{name:'Cambios',exact:true}).click();
  await expect(page.getByText('Datos posteriores · revisar de nuevo',{exact:true}).first()).toBeVisible();
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('v4: exportación muestra revisión e invalida custodia al editar',async({page,request,context})=>{
  await setup(request,context);await page.goto('/');await page.getByRole('button',{name:'Exportar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Qué contiene esta descarga',exact:true})).toBeVisible();
  const summary=await request.get('/api/v4/export-summary').then(r=>r.json());
  await page.getByLabel('Contraseña de recuperación',{exact:true}).fill('recuperacion-sintetica-2026');
  await page.getByLabel('Repite la contraseña',{exact:true}).fill('recuperacion-sintetica-2026');
  await page.getByLabel('He revisado la captura y los cambios incluidos en esta descarga.',{exact:true}).check();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Solo copia cifrada',exact:true}).click();await download;
  expect((await request.post('/api/v3/recovery-copy/confirm',{data:{storedSeparately:true,revision:summary.revision}})).ok()).toBeTruthy();
  await request.patch('/api/records/contacts/contact-1',{data:{values:{phone:'600 777 777'}}});
  await page.getByRole('button',{name:'Continuidad',exact:true}).click();await page.getByText('Preparación de tu Plan B',{exact:true}).click();
  await expect(page.getByText('La copia conservada corresponde a otra revisión. Exporta los cambios actuales.',{exact:true})).toBeVisible();
  expect((await request.post('/api/v3/recovery-copy/confirm',{data:{storedSeparately:true,revision:summary.revision}})).status()).toBe(409);
  await page.getByRole('button',{name:'Exportar',exact:true}).click();await expect(page.getByText(/62 registros · 1 cambios locales incluidos/)).toBeVisible();
  await page.screenshot({path:resolve(output,'v0.4.0-exportacion-revision.png'),fullPage:true});
});
