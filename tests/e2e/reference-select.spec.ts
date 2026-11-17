import { test, expect, type Page } from '@playwright/test';
import { makeFixture } from '../../shared/fixtures.js';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:4398',password='fixture-local-relation062',chosen='extra062-139';
async function open(page:Page,readOnly=false) {
  if(test.info().project.use.baseURL!==origin)throw Error('Use only the new isolated relation fixture on 127.0.0.1:4398.');
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
  const snapshot=makeFixture(),base=snapshot.records.find(r=>r.entity==='contacts')!;
  for(let i=0;i<140;i++){
    const r=structuredClone(base);r.id='extra062-'+String(i).padStart(3,'0');r.values.firstname=i===139?'Selección062':i<2?'Gemelos062':i===2?'Antigua062':i===3?'Nueva062':'Referencia062 '+String(i).padStart(3,'0');r.values.lastname=i===139?'Última':i<2?'Iguales':'Contacto';r.values.email='fixture062-'+i+'@example.invalid';snapshot.records.push(r);
  }
  const task=snapshot.records.find(r=>r.entity==='tasks'&&r.id==='task-1')!;task.values.subject='Tarea principal062';task.values.contact_id=chosen;
  if(readOnly)snapshot.entities.find(e=>e.id==='tasks')!.fields.find(f=>f.key==='contact_id')!.readOnly=true;
  snapshot.links=snapshot.records.flatMap(r=>snapshot.entities.find(e=>e.id===r.entity)!.fields.filter(f=>f.type==='reference'&&r.values[f.key]).map(f=>({fromEntity:r.entity,fromId:r.id,toEntity:f.referenceEntity!,toId:String(r.values[f.key]),label:f.key})));
  snapshot.manifest.expectedCounts.contacts=164;snapshot.manifest.expectedLinks=snapshot.links.length;snapshot.name='Relaciones062 · ensayo';
  for(const[url,data]of [['/api/import/snapshot',{snapshot,replace:true}],['/api/generate',{mode:'demo'}],['/api/activate',{reviewed:true}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
  const errors:string[]=[],outside:string[]=[],writes:string[]=[],listReads:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(r.method()!=='GET')writes.push(r.method()+' '+u.pathname);if(u.pathname==='/api/v2/records/contacts')listReads.push(u.search);});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){outside.push(url.origin);return route.abort();}return route.fallback();});
  const before=await page.request.get('/api/v4/export-summary').then(r=>r.json());
  await page.goto('/');
  const navigation=page.getByRole('navigation',{name:'Navegación principal',exact:true});
  await navigation.getByRole('button',{name:'Clientes',exact:true,expanded:false}).click();
  await navigation.getByRole('navigation',{name:'Clientes',exact:true}).getByRole('button',{name:'Tareas',exact:true}).click();await page.getByRole('button',{name:'Tarea principal062',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Tarea principal062',exact:true}),picker=editor.locator('.reference-picker').filter({has:page.locator('#record-contact_id')}),select=picker.getByRole('combobox',{name:'Cliente',exact:true}),search=picker.getByRole('searchbox',{name:'Buscar relación cliente',exact:true});
  await expect(select).toHaveValue(chosen);return {editor,picker,select,search,errors,outside,writes,listReads,before};
}
async function unchanged(page:Page,state:Awaited<ReturnType<typeof open>>) {
  expect((await page.request.get('/api/v4/export-summary').then(r=>r.json())).revision).toBe(state.before.revision);expect(state.errors).toEqual([]);expect(state.outside).toEqual([]);expect(state.writes).toEqual([]);
}

test('relation062: selected ID outside the first fifty stays pinned; homonyms are selected and saved by exact ID',async({page})=>{
  const state=await open(page);await expect(state.select.locator('option:checked')).toHaveText('Selección062 Última');await expect(state.picker.getByText('Se muestran 50 de 164 resultados. Escribe para afinar la búsqueda.',{exact:true})).toBeVisible();await expect(state.select.locator('option')).toHaveCount(52);
  await state.search.fill('Gemelos062');await expect(state.select.locator('option')).toHaveCount(4);await expect(state.select.locator('option[value="extra062-000"]')).toHaveText('Gemelos062 Iguales · ID extra062-000');await expect(state.select.locator('option[value="extra062-001"]')).toHaveText('Gemelos062 Iguales · ID extra062-001');await expect(state.select).toHaveValue(chosen);
  await state.select.selectOption('extra062-001');await expect(state.select).toHaveValue('extra062-001');await expect(state.select).toHaveAttribute('aria-busy','false');await state.editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(state.editor).toBeHidden();
  const saved=await page.request.get('/api/v2/records/tasks/task-1').then(r=>r.json());expect(saved.record.values.contact_id).toBe('extra062-001');expect(state.writes.filter(p=>p.startsWith('PATCH'))).toEqual(['PATCH /api/records/tasks/task-1']);expect(state.errors).toEqual([]);expect(state.outside).toEqual([]);
});

test('relation062: list success does not hide selected lookup failure, and retry preserves the native field name and ID',async({page})=>{
  await page.route('**/api/v2/records/contacts/'+chosen,route=>route.fulfill({status:404,json:{error:'Fixture missing lookup'}}));
  const state=await open(page);await expect(state.picker.getByRole('alert')).toContainText('No se pudo verificar la relación elegida');await expect(state.select).toHaveValue(chosen);await expect(state.select.locator('option:checked')).toHaveText('Relación sin verificar · ID '+chosen);await expect(state.select).toHaveAttribute('aria-invalid','true');
  await expect(state.picker.getByText('Se muestran 50 de 164 resultados. Escribe para afinar la búsqueda.',{exact:true})).toBeVisible();await expect(state.picker.getByRole('alert')).toBeVisible();await expect(state.select).toHaveAccessibleName('Cliente');
  await page.unroute('**/api/v2/records/contacts/'+chosen);await state.picker.getByRole('button',{name:'Reintentar relación',exact:true}).click();await expect(state.picker.getByRole('alert')).toHaveCount(0);await expect(state.select.locator('option:checked')).toHaveText('Selección062 Última');await expect(state.select).toHaveAccessibleName('Cliente');await unchanged(page,state);
});

test('relation062: failed option search leaves the verified selection usable and can retry independently',async({page})=>{
  await page.route('**/api/v2/records/contacts?*',route=>new URL(route.request().url()).searchParams.has('offset')?route.fallback():route.fulfill({status:503,json:{error:'Fixture list failure'}}));
  const state=await open(page);await expect(state.picker.getByRole('alert')).toContainText('No se pudieron buscar registros');await expect(state.select.locator('option:checked')).toHaveText('Selección062 Última');await expect(state.select).toHaveValue(chosen);
  await page.unroute('**/api/v2/records/contacts?*');await state.picker.getByRole('button',{name:'Reintentar búsqueda',exact:true}).click();await expect(state.picker.getByRole('alert')).toHaveCount(0);await expect(state.select.locator('option')).toHaveCount(52);await unchanged(page,state);
});

test('relation062: valid obsolete options cannot replace the new query when transport ignores abort',async({page})=>{
  await page.addInitScript(()=>{
    const native=window.fetch.bind(window),held={ready:false,consumed:false,release:()=>{},recordId:''};(window as any).__relation062=held;
    window.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.toString():input.url,location.href);
      if(url.pathname!=='/api/v2/records/contacts'||url.searchParams.get('q')!=='Antigua062')return native(input,init);
      return native(input,{...init,signal:null}).then(async response=>{
        const body=await response.clone().json();held.recordId=body.records[0].id;const json=response.json.bind(response);response.json=async()=>{const data=await json();held.consumed=true;return data;};
        return new Promise<Response>(resolve=>{held.release=()=>resolve(response);held.ready=true;});
      });
    };
  });
  const state=await open(page);await state.search.fill('Antigua062');await expect.poll(()=>page.evaluate(()=>(window as any).__relation062.ready)).toBeTruthy();expect(await page.evaluate(()=>(window as any).__relation062.recordId)).toBe('extra062-002');
  await state.search.fill('Nueva062');await expect(state.select.locator('option[value="extra062-003"]')).toHaveCount(1);await page.evaluate(()=>(window as any).__relation062.release());await expect.poll(()=>page.evaluate(()=>(window as any).__relation062.consumed)).toBeTruthy();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(state.select.locator('option[value="extra062-003"]')).toHaveCount(1);await expect(state.select.locator('option[value="extra062-002"]')).toHaveCount(0);await expect(state.select).toHaveValue(chosen);await unchanged(page,state);
});

test('relation062: a selected reply from the wrong entity is never rendered as the chosen label',async({page})=>{
  await page.route('**/api/v2/records/contacts/'+chosen,route=>route.fulfill({json:{record:{entity:'companies',id:chosen,values:{name:'WRONG-ENTITY-062'}}}}));
  const state=await open(page);await expect(state.picker.getByRole('alert')).toBeVisible();await expect(state.select.locator('option:checked')).toHaveText('Relación sin verificar · ID '+chosen);await expect(state.editor.getByText('WRONG-ENTITY-062')).toHaveCount(0);await unchanged(page,state);
});

test('relation062: a read-only relationship loads its label without searching alternatives',async({page})=>{
  const state=await open(page,true);await expect(state.select.locator('option:checked')).toHaveText('Selección062 Última');await expect(state.select).toBeDisabled();await expect(state.search).toBeDisabled();expect(state.listReads.filter(query=>!new URLSearchParams(query).has('offset'))).toEqual([]);await unchanged(page,state);
});

test('relation062: keyboard, mobile sizing and a real revoked session keep the editor usable and protected',async({page})=>{
  const state=await open(page);await expect(state.select).toHaveAttribute('aria-busy','false');await state.search.fill('Gemelos062');await expect(state.select.locator('option[value="extra062-001"]')).toHaveCount(1);await state.search.focus();await page.keyboard.press('Tab');await expect(state.select).toBeFocused();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    const picker=await state.picker.boundingBox(),search=await state.search.boundingBox(),select=await state.select.boundingBox();
    expect(search!.height).toBeGreaterThanOrEqual(44);expect(select!.height).toBeGreaterThanOrEqual(44);
    expect(search!.width).toBeGreaterThanOrEqual(picker!.width-2);expect(select!.width).toBeGreaterThanOrEqual(picker!.width-2);expect(select!.y).toBeGreaterThanOrEqual(search!.y+search!.height);
    await page.screenshot({path:resolve(process.env.PLANB_EVIDENCE_DIR!,'relation062-'+width+'.png'),fullPage:false});
  }
  await page.request.post('/api/v2/auth/lock',{data:{}});await state.search.fill('Revoked062');await expect(state.editor).toBeHidden();await expect(page.getByRole('heading',{name:'Tu copia está protegida',exact:true})).toBeVisible();expect(state.errors).toEqual([]);expect(state.outside).toEqual([]);
});
