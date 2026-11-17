import { test, expect, type Page } from '@playwright/test';
import { makeFixture } from '../../shared/fixtures.js';
import { resolve } from 'node:path';

const origin='http://127.0.0.1:4401',password='fixture-history064-local';
async function open(page:Page) {
  if(test.info().project.use.baseURL!==origin)throw Error('Use the fresh isolated history fixture on127.0.0.1:4401.');
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
  const snapshot=makeFixture(),definition=snapshot.entities.find(e=>e.id==='contacts')!,first=snapshot.records.find(r=>r.entity==='contacts'&&r.id==='contact-1')!;
  definition.fields.push({key:'flag064',label:'Marca064',type:'boolean',required:false,readOnly:false,options:[],referenceEntity:null},{key:'number064',label:'Número064',type:'number',required:false,readOnly:false,options:[],referenceEntity:null},{key:'text064',label:'Texto064',type:'text',required:false,readOnly:false,options:[],referenceEntity:null});
  definition.fields.push({key:'long064',label:'Texto largo064',type:'text',required:false,readOnly:false,options:[],referenceEntity:null});first.values.long064='A'.repeat(400);
  first.values.phone='HISTORIA-ANTIGUA-064';first.values.flag064=false;first.values.number064=0;first.values.text064='';
  for(const[url,data]of [['/api/import/snapshot',{snapshot,replace:true}],['/api/generate',{mode:'demo'}],['/api/activate',{reviewed:true}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
  for(let i=1;i<=121;i++)expect((await page.request.patch('/api/records/contacts/'+(i===1?'contact-1':'contact-2'),{data:{values:i===1?{phone:'HISTORIA-PRIMERA-064',flag064:true,number064:7,text064:null,long064:'🎯'.repeat(250)+'final064'}:{phone:'historia064-'+String(i).padStart(3,'0')}}})).ok()).toBeTruthy();
  expect((await page.request.post('/api/records/tasks',{data:{values:{subject:'Alta historial064',due_date:'2026-11-20',status:'pending',contact_id:null,deal_id:null,notes:''}}})).ok()).toBeTruthy();
  const source=await page.request.get('/api/v2/changes').then(r=>r.json());expect(source.changes).toHaveLength(122);
  const [firstId,middleId,lastId]=[source.changes[0].id,source.changes[60].id,source.changes[121].id];
  const errors:string[]=[],outside:string[]=[],writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.method()+' '+new URL(r.url()).pathname);});
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){outside.push(u.origin);return route.abort();}return route.fallback();});
  const before=await page.request.get('/api/v4/export-summary').then(r=>r.json());await page.goto('/');await page.getByRole('button',{name:'Cambios',exact:true}).click();
  const history=page.getByRole('region',{name:'Historial de operaciones',exact:true});await expect(history.getByText('1–20 de 122 operaciones',{exact:true})).toBeVisible();return {history,errors,outside,writes,before,firstId,middleId,lastId};
}
async function unchanged(page:Page,state:Awaited<ReturnType<typeof open>>) {
  expect((await page.request.get('/api/v4/export-summary').then(r=>r.json())).revision).toBe(state.before.revision);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);expect(state.outside).toEqual([]);
}

test('history064: all122 operations remain reachable, first older than hundred is searchable and typed values are exact',async({page})=>{
  const state=await open(page),history=state.history;await expect(history.locator('.change-history-list > details')).toHaveCount(20);
  for(let i=0;i<6;i++)await history.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(history.getByText('121–122 de 122 operaciones',{exact:true})).toBeVisible();await expect(history.locator('details[data-change-id="'+state.firstId+'"]')).toBeVisible();await expect(history.getByRole('button',{name:'Siguiente',exact:true})).toBeDisabled();
  const first=history.locator('details[data-change-id="'+state.firstId+'"]');await first.locator('summary').click();const diff=first.locator('.change-history-diff');
  for(const text of ['"HISTORIA-ANTIGUA-064"','"HISTORIA-PRIMERA-064"','false','true','0','7','""','Sin valor · null'])await expect(diff.getByText(text,{exact:true})).toBeVisible();
  await history.getByRole('searchbox',{name:'Buscar en el historial',exact:true}).fill('HISTORIA-ANTIGUA-064 HISTORIA-PRIMERA-064');await expect(history.getByText('1–1 de 1 operaciones',{exact:true})).toBeVisible();await expect(history.locator('.change-history-list > details')).toHaveCount(1);
  await history.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(history.getByRole('searchbox')).toBeFocused();await expect(history.getByText('1–20 de 122 operaciones',{exact:true})).toBeVisible();
  await history.getByRole('combobox',{name:'Operación',exact:true}).selectOption('create');await expect(history.locator('.change-history-list > details')).toHaveCount(1);await history.locator('summary').click();await expect(history.getByText('Campo ausente',{exact:true}).first()).toBeVisible();await expect(history.getByText('"Alta historial064"',{exact:true})).toBeVisible();await unchanged(page,state);
});

test('history064: filters compose without writes and included watermark is described without claiming a remote result',async({page})=>{
  await page.route('**/api/v2/changes',async route=>{const response=await route.fetch(),body=await response.json();await route.fulfill({response,json:{...body,watermark:body.changes[60]?.id??0}});});
  const state=await open(page),history=state.history;await expect(history.getByText(/61 posteriores a la marca/)).toBeVisible();await expect(history.getByText(/no verifica que esos valores sigan disponibles/)).toBeVisible();
  await history.getByRole('combobox',{name:'Marca de devolución',exact:true}).selectOption('marked');await expect(history.getByText('1–20 de 61 operaciones',{exact:true})).toBeVisible();await expect(history.locator('details').first()).toHaveAttribute('data-change-id',String(state.middleId));
  await history.getByRole('combobox',{name:'Tipo de registro',exact:true}).selectOption('tasks');await expect(history.getByText('No hay operaciones que coincidan con estos filtros.',{exact:true})).toBeVisible();await history.getByRole('combobox',{name:'Marca de devolución',exact:true}).selectOption('pending');await expect(history.locator('details').first()).toHaveAttribute('data-change-id',String(state.lastId));
  await history.getByRole('searchbox').fill('sin coincidencia064');await expect(history.locator('.change-history-list > details')).toHaveCount(0);await history.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(history.getByRole('searchbox')).toBeFocused();await expect(history.getByText('1–20 de 122 operaciones',{exact:true})).toBeVisible();await unchanged(page,state);
});

test('history064: long values wrap, keyboard opens details and controls remain usable on desktop and320',async({page})=>{
  const state=await open(page),history=state.history;await history.getByRole('searchbox').fill('historia-antigua-064');const summary=history.locator('summary');await summary.focus();await page.keyboard.press('Enter');await expect(history.locator('details')).toHaveAttribute('open','');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    for(const control of [...await history.getByRole('combobox').all(),...await history.getByRole('searchbox').all(),...await history.getByRole('button').all()])expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await history.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(process.env.PLANB_EVIDENCE_DIR!,'history064-'+width+'.png'),fullPage:false});
  }
  await unchanged(page,state);
});

test('history064: saved invalid dates keep their exact values and valid dates use the field label',async({page})=>{
  await page.route('**/api/v2/changes',async route=>{
    const response=await route.fetch();
    const body=await response.json();
    if(body.changes.length<2){await route.fulfill({response,json:body});return;}
    const dates=['2026-99-01','2026-02-30'];
    const changes=body.changes.map((change: {id:number},index:number)=>{
      if(index>=dates.length)return change;
      const record=(date:string)=>({entity:'tasks',id:'task-1',values:{due_date:date}});
      return {...change,entity:'tasks',recordId:'task-1',operation:'update',before:record(dates[index]),after:record('2026-11-14')};
    });
    await route.fulfill({response,json:{...body,changes}});
  });
  const state=await open(page);
  for(const date of ['2026-99-01','2026-02-30']){
    await state.history.getByRole('searchbox').fill(date);
    const row=state.history.locator('details');
    await expect(row).toHaveCount(1);
    await expect(row.locator('summary')).toContainText('Fecha límite: '+date+' → 14 nov 2026');
    await row.locator('summary').click();
    await expect(row.getByText(JSON.stringify(date),{exact:true})).toBeVisible();
    await expect(row.getByText('"2026-11-14"',{exact:true})).toBeVisible();
  }
  await unchanged(page,state);
});
