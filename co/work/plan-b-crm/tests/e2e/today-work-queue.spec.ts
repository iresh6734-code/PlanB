import { test, expect, type Page } from '@playwright/test';
import { makeFixture } from '../../shared/fixtures.js';
import { resolve } from 'node:path';

const password='fixture-local-today059';
const origin='http://127.0.0.1:4395';
async function setup(page:Page,partial=false) {
  if(test.info().project.use.baseURL!==origin)throw Error('Use an isolated fresh fixture on 127.0.0.1:4395 for today059.');
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());
  expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
  const snapshot=makeFixture(),deal=snapshot.records.find(r=>r.entity==='deals')!,task=snapshot.records.find(r=>r.entity==='tasks')!;
  snapshot.records=snapshot.records.filter(r=>r.entity!=='deals'&&r.entity!=='tasks');
  for(const[base,count,key]of [[deal,47,'dealname'],[task,63,'subject']] as const)for(let i=0;i<count;i++){
    const record=structuredClone(base);record.id='fixture059-'+base.entity+'-'+String(i).padStart(5,'0');
    for(const field of snapshot.entities.find(e=>e.id===base.entity)!.fields)if(field.type==='reference')record.values[field.key]=null;
    record.values[key]=(base.entity==='deals'?'Oportunidad':'Tarea')+' José059 '+String(i).padStart(5,'0');
    if(base.entity==='tasks'){record.values.due_date='2020-01-01';record.values.status='pending';}snapshot.records.push(record);
  }
  snapshot.name='Hoy059 · listas completas';snapshot.links=[];snapshot.manifest.expectedLinks=0;
  for(const e of snapshot.entities)snapshot.manifest.expectedCounts[e.id]=snapshot.records.filter(r=>r.entity===e.id).length;
  for(const[url,data]of [['/api/import/snapshot',{snapshot,replace:true}],['/api/generate',{mode:'demo'}],['/api/activate',{reviewed:true}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
  const errors:string[]=[],outside:string[]=[],writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()!=='GET')writes.push(r.method()+' '+new URL(r.url()).pathname);});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){outside.push(url.origin);return route.abort();}return route.fallback();});
  await page.goto('/');await page.getByRole('button',{name:'Hoy',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu día, con un siguiente paso.',exact:true})).toBeVisible();
  const priorities=page.getByRole('region',{name:'Lista de prioridades',exact:true}),commitments=page.getByRole('region',{name:'Lista de compromisos',exact:true});
  await expect(priorities.locator('.work-queue-count')).toHaveText(partial?'1–5 de 20 prioridades':'1–5 de 47 prioridades');
  return {priorities,commitments,errors,outside,writes};
}

test('today059: every priority and commitment is reachable with bounded pages and local ID/name search',async({page})=>{
  const {priorities,commitments,errors,outside,writes}=await setup(page);let reads=0;page.on('request',r=>{if(r.url().includes('/api/v4/today'))reads++;});
  await expect(priorities.getByRole('listitem')).toHaveCount(5);await expect(commitments.getByRole('listitem')).toHaveCount(5);
  await priorities.getByRole('button',{name:'Ver las 47 prioridades',exact:true}).click();await expect(priorities.getByRole('listitem')).toHaveCount(20);
  await priorities.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(priorities.locator('.work-queue-count')).toHaveText('21–40 de 47 prioridades');
  await priorities.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(priorities.locator('.work-queue-count')).toHaveText('41–47 de 47 prioridades');await expect(priorities.getByRole('button',{name:'Siguiente',exact:true})).toBeDisabled();
  await expect(priorities.getByText('ID fixture059-deals-00046',{exact:false})).toBeVisible();
  const search=priorities.getByRole('searchbox',{name:'Buscar prioridades',exact:true});await search.fill('JOSE059 fixture059-deals-00046');await expect(priorities.getByRole('listitem')).toHaveCount(1);
  await expect(priorities.getByText('Oportunidad José059 00046',{exact:true})).toBeVisible();await search.fill('sin coincidencia059');await expect(priorities.getByRole('listitem')).toHaveCount(0);await expect(priorities.locator('.work-queue-count')).toContainText('No hay prioridades');
  await priorities.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();await expect(search).toBeFocused();await expect(priorities.locator('.work-queue-count')).toHaveText('1–20 de 47 prioridades');
  await commitments.getByRole('button',{name:'Ver las 63 tareas',exact:true}).click();
  for(let i=0;i<3;i++)await commitments.getByRole('button',{name:'Siguiente',exact:true}).click();
  await expect(commitments.locator('.work-queue-count')).toHaveText('61–63 de 63 tareas');await expect(commitments.getByRole('listitem')).toHaveCount(3);
  await commitments.getByRole('searchbox',{name:'Buscar tareas',exact:true}).fill('fixture059-tasks-00062');await expect(commitments.getByRole('listitem')).toHaveCount(1);await expect(commitments.getByText('Tarea José059 00062',{exact:true})).toBeVisible();
  expect(reads).toBe(0);expect(writes).toEqual([]);expect(errors).toEqual([]);expect(outside).toEqual([]);
});

test('today059: missing or inconsistent totals never promote an older partial list to complete',async({page})=>{
  let declare=false;
  await page.route('**/api/v4/today',async route=>{const response=await route.fetch(),data=await response.json();data.opportunities=data.opportunities.slice(0,20);data.tasks=data.tasks.slice(0,20);if(!declare)delete data.listTotals;await route.fulfill({response,json:data});});
  const {priorities,commitments}=await setup(page,true);
  await expect(priorities.locator('.work-queue-coverage')).toContainText('20 recibidas');await expect(commitments.locator('.work-queue-coverage')).toContainText('20 recibidas');
  declare=true;await page.reload();await page.getByRole('button',{name:'Hoy',exact:true}).click();await expect(priorities.locator('.work-queue-coverage')).toContainText('20 recibidas de 47 indicadas');await expect(commitments.locator('.work-queue-coverage')).toContainText('20 recibidas de 63 indicadas');
});

test('today059: simulation advances in reviewed batches of twenty without executing or changing CRM records',async({page})=>{
  const {errors,outside}=await setup(page),before=await page.request.get('/api/records').then(r=>r.json());
  for(const count of [20,40,47]){
    await page.getByRole('button',{name:'Preparar seguimiento simulado',exact:true}).click();await expect(page.getByRole('status')).toContainText('Análisis terminado');
    await page.getByRole('button',{name:'Revisar propuestas',exact:true}).click();await expect(page.locator('.proposal-card')).toHaveCount(count);
    const overview=await page.request.get('/api/v4/agents').then(r=>r.json());expect(overview.proposals).toHaveLength(count);expect(new Set(overview.proposals.map((p:{dealId:string})=>p.dealId)).size).toBe(count);expect(overview.artifacts).toEqual([]);expect(overview.proposals.every((p:{status:string})=>p.status==='review')).toBeTruthy();
    await page.getByRole('button',{name:'Hoy',exact:true}).click();
  }
  expect((await page.request.get('/api/records').then(r=>r.json())).records).toEqual(before.records);expect(errors).toEqual([]);expect(outside).toEqual([]);
});

test('today059: keyboard, clearing focus and responsive lists stay usable at 1440, 390 and 320',async({page})=>{
  const {priorities,commitments,errors,outside,writes}=await setup(page);await priorities.getByRole('button',{name:'Ver las 47 prioridades',exact:true}).click();await commitments.getByRole('button',{name:'Ver las 63 tareas',exact:true}).click();
  const input=priorities.getByRole('searchbox',{name:'Buscar prioridades',exact:true});await input.fill('jose059');await input.focus();await page.keyboard.press('Tab');await expect(priorities.getByRole('button',{name:'Limpiar búsqueda',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(input).toBeFocused();await expect(input).toHaveValue('');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    for(const region of [priorities,commitments])for(const button of await region.getByRole('button').all()){const box=await button.boundingBox();if(box)expect(box.height).toBeGreaterThanOrEqual(44);}
    await page.screenshot({path:resolve(process.env.PLANB_EVIDENCE_DIR!,'today059-'+width+'.png'),fullPage:false});
  }
  expect(writes).toEqual([]);expect(errors).toEqual([]);expect(outside).toEqual([]);
});
