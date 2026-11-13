import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:4404',password='fixture-local-activation066';
const approval='He revisado los campos, las reglas y las funciones pendientes.';
test.beforeEach(()=>{if(test.info().project.use.baseURL!==origin)throw Error('Use only the isolated preparation fixture127.0.0.1:4404.');});
async function seed(page:Page,candidate=true) {
  if(test.info().project.use.baseURL!==origin)throw Error('Use only a fresh isolated generator on127.0.0.1:4404.');
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
  for(const[url,data]of [['/api/import/fixture',{profile:'agency',replace:true}],['/api/generate',{mode:'demo'}],['/api/activate',{reviewed:true}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
  if(candidate)for(const[url,data]of [['/api/import/fixture',{profile:'distribution',replace:true}],['/api/generate',{mode:'demo'}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
  const errors:string[]=[],outside:string[]=[],activations:{path:string;body:any}[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{const url=new URL(request.url());if(['/api/v4/activate-reviewed','/api/activate'].includes(url.pathname)&&request.method()==='POST')activations.push({path:url.pathname,body:request.postDataJSON()});});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){outside.push(url.origin);return route.abort();}return route.fallback();});
  await page.goto('/');await page.getByRole('button',{name:'Preparación',exact:true}).click();
  const view=page.locator('.preparation');await expect(view.getByRole('heading',{name:'Revisa tu aplicación.',exact:true})).toBeVisible();await expect(view.getByRole('button',{name:'Activar y abrir aplicación',exact:true})).toBeDisabled();return {view,errors,outside,activations};
}
async function generateCandidate(page:Page,profile:'agency'|'distribution') {
  for(const[url,data]of [['/api/import/fixture',{profile,replace:true}],['/api/generate',{mode:'demo'}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
}

test('activation066: actual App parent displays candidate schema and guided activation commits its exact reviewed revision',async({page})=>{
  const {view,errors,outside,activations}=await seed(page);await expect(view.locator('.preparation-review-identity')).toContainText('Versión candidata');await expect(view.locator('.preparation-review-identity')).toContainText('Distribuidora Atlas');await expect(view.getByText(/Código de cliente/)).toBeVisible();
  const before=await page.request.get('/api/v2/state').then(r=>r.json());expect(before.spec.title).toBe('Agencia Norte');expect(before.candidate.spec.title).toBe('Distribuidora Atlas');
  const review=await page.request.get('/api/v4/activation-review').then(r=>r.json());await view.getByLabel(approval,{exact:true}).check();await view.getByRole('button',{name:'Activar y abrir aplicación',exact:true}).click();await expect(view).toBeHidden();
  const after=await page.request.get('/api/v2/state').then(r=>r.json());expect(after.spec.title).toBe('Distribuidora Atlas');expect(after.candidate).toBeNull();expect(activations).toEqual([{path:'/api/v4/activate-reviewed',body:{reviewed:true,revision:review.revision}}]);expect(errors).toEqual([]);expect(outside).toEqual([]);
});

test('activation066: server target changing after checkbox causes409, preserves active copy and requires a fresh explicit review',async({page})=>{
  const {view,activations,errors,outside}=await seed(page);await view.getByLabel(approval,{exact:true}).check();await generateCandidate(page,'agency');await view.getByRole('button',{name:'Activar y abrir aplicación',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'La preparación cambió'})).toBeVisible();await expect(view.getByLabel(approval,{exact:true})).not.toBeChecked();await expect(view.getByRole('button',{name:'Activar y abrir aplicación',exact:true})).toBeDisabled();await expect(view.locator('.preparation-review-identity')).toContainText('Agencia Norte');
  const state=await page.request.get('/api/v2/state').then(r=>r.json());expect(state.spec.title).toBe('Agencia Norte');expect(state.candidate.spec.title).toBe('Agencia Norte');expect(state.candidate.generation.approved).toBe(false);expect(activations).toHaveLength(1);expect(errors).toEqual([]);expect(outside).toEqual([]);
});

test('activation066: edits in the active workspace after review invalidate the revision and replacement consent',async({page})=>{
  const {view,activations}=await seed(page);await view.getByLabel(approval,{exact:true}).check();expect((await page.request.patch('/api/records/contacts/contact-1',{data:{values:{phone:'fiction-active-edit066'}}})).ok()).toBeTruthy();await view.getByRole('button',{name:'Activar y abrir aplicación',exact:true}).click();
  await expect(view.getByLabel(approval,{exact:true})).not.toBeChecked();await expect(view.getByRole('button',{name:'Activar y abrir aplicación',exact:true})).toBeDisabled();await expect(view.getByText(/Hay cambios locales nuevos/)).toBeVisible();const record=await page.request.get('/api/v2/records/contacts/contact-1').then(r=>r.json());expect(record.record.values.phone).toBe('fiction-active-edit066');expect(activations).toHaveLength(1);
});

test('activation066: failed or missing candidate never offers the active app as a substitute approval',async({page})=>{
  const {view}=await seed(page);await view.getByLabel(approval,{exact:true}).check();expect((await page.request.post('/api/import/fixture',{data:{profile:'agency',replace:true}})).ok()).toBeTruthy();await view.getByRole('button',{name:'Actualizar revisión',exact:true}).click();
  await expect(view.getByRole('heading',{name:'Prepara primero una especificación.',exact:true})).toBeVisible();await expect(view.getByRole('button',{name:'Activar y abrir aplicación',exact:true})).toHaveCount(0);await expect(view.getByLabel(approval,{exact:true})).toHaveCount(0);const state=await page.request.get('/api/v2/state').then(r=>r.json());expect(state.ready).toBe(true);expect(state.spec.title).toBe('Agencia Norte');expect(state.candidate.spec).toBeNull();
});

test('activation066: old-server404 blocks the guided flow without falling back to legacy activation',async({page})=>{
  await page.route('**/api/v4/activation-review',route=>route.fulfill({status:404,json:{error:'Fixture old generator'}}));
  // Open directly after seeding, because this case intentionally has no review heading to await.
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}});await generateCandidate(page,'distribution');
  let commits=0;page.on('request',r=>{if(['/api/activate','/api/v4/activate-reviewed'].includes(new URL(r.url()).pathname)&&r.method()==='POST')commits++;});
  await page.goto('/');await page.getByRole('button',{name:'Preparación',exact:true}).click();const view=page.locator('.preparation');await expect(view.getByRole('alert')).toContainText('no permite activar una revisión exacta');await expect(view.getByRole('button',{name:'Activar y abrir aplicación',exact:true})).toHaveCount(0);expect(commits).toBe(0);
});

test('activation066: refresh clears approval and keyboard/mobile show identity and reviewed fields without overflow',async({page})=>{
  const {view,errors,outside,activations}=await seed(page);await view.getByLabel(approval,{exact:true}).focus();await page.keyboard.press('Space');await expect(view.getByLabel(approval,{exact:true})).toBeChecked();await view.getByRole('button',{name:'Actualizar revisión',exact:true}).click();await expect(view.getByLabel(approval,{exact:true})).not.toBeChecked();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect((await view.getByRole('button',{name:'Activar y abrir aplicación',exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44);await view.locator('.preparation-review-tools').scrollIntoViewIfNeeded();await expect(view.locator('.preparation-review-identity')).toBeVisible();await page.screenshot({path:resolve(process.env.PLANB_EVIDENCE_DIR!,'activation066-'+width+'.png'),fullPage:false});}
  expect(activations).toEqual([]);expect(errors).toEqual([]);expect(outside).toEqual([]);
});
