import { test, expect, type Page } from '@playwright/test';
import { makeFixture } from '../../shared/fixtures.js';

const origin='http://127.0.0.1:4397',password='fixture-local-races061';
type Mode='query-success'|'query-error'|'open-success'|'open-error';
async function holdValidReply(page:Page,mode:Mode) {
  await page.addInitScript(({mode})=>{
    const native=window.fetch.bind(window),state={taken:false,ready:false,released:false,consumed:false,valid:null as any,release:()=>{}};(window as any).__race061=state;
    window.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.toString():input.url,location.href);
      const target=mode.startsWith('query')?url.pathname==='/api/v2/search'&&url.searchParams.get('q')==='antigua061':url.pathname==='/api/v2/search-record'&&url.searchParams.get('id')==='contact-1';
      if(!target||state.taken)return native(input,init);
      state.taken=true;
      // Deliberately ignore only this request's AbortSignal. The actual authenticated GET and its full body remain real.
      return native(input,{...init,signal:null}).then(async response=>{
        if(!response.ok)throw Error('The held fixture request did not succeed.');
        const body=await response.clone().json();state.valid={captureId:body.source.captureId,revision:body.source.revision,id:body.record?.id??body.items?.[0]?.id,query:body.query??null};
        const json=response.json.bind(response);response.json=async()=>{const body=await json();state.consumed=true;return body;};
        return new Promise<Response>((resolve,reject)=>{state.release=()=>{state.released=true;if(mode.endsWith('error')){state.consumed=true;reject(Error('LATE-TRANSPORT-ERROR-061'));}else resolve(response);};state.ready=true;});
      });
    };
  },{mode});
}
async function open(page:Page,mode:Mode) {
  if(test.info().project.use.baseURL!==origin)throw Error('Use the isolated fresh fixture on 127.0.0.1:4397.');
  const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
  const snapshot=makeFixture();
  for(const[id,name]of [['contact-1','Antigua061'],['contact-2','Nueva061']]){const r=snapshot.records.find(r=>r.entity==='contacts'&&r.id===id)!;r.values.firstname=name;r.values.lastname='Evidencia061';r.values.phone=id+'-full061';}
  for(const[url,data]of [['/api/import/snapshot',{snapshot,replace:true}],['/api/generate',{mode:'demo'}],['/api/activate',{reviewed:true}]] as const)expect((await page.request.post(url,{data})).ok()).toBeTruthy();
  await holdValidReply(page,mode);const errors:string[]=[],outside:string[]=[],writes:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.method()+' '+new URL(r.url()).pathname);});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){outside.push(url.origin);return route.abort();}return route.fallback();});
  await page.goto('/');await page.getByRole('button',{name:'Buscar en toda la copia',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Buscar en toda la copia',exact:true}),input=dialog.getByRole('searchbox',{name:'Buscar en toda la copia',exact:true});
  const before=await page.request.get('/api/v4/export-summary').then(r=>r.json());return {dialog,input,errors,outside,writes,before};
}
async function ready(page:Page) {
  await expect.poll(()=>page.evaluate(()=>(window as any).__race061.ready)).toBeTruthy();
  const held=await page.evaluate(()=>(window as any).__race061.valid);expect(held.id).toBe('contact-1');expect(held.captureId).toBeTruthy();expect(held.revision).toMatch(/^[a-f0-9]{64}$/);await test.info().attach('held-valid-metadata',{body:JSON.stringify(held),contentType:'application/json'});return held;
}
async function release(page:Page) {
  await page.evaluate(()=>(window as any).__race061.release());await expect.poll(()=>page.evaluate(()=>(window as any).__race061.consumed)).toBeTruthy();
  await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  expect(await page.evaluate(()=>(window as any).__race061.released)).toBeTruthy();
}
async function unchanged(page:Page,state:Awaited<ReturnType<typeof open>>) {
  expect((await page.request.get('/api/v4/export-summary').then(r=>r.json())).revision).toBe(state.before.revision);expect(state.errors).toEqual([]);expect(state.outside).toEqual([]);expect(state.writes).toEqual([]);
}

for(const mode of ['query-success','query-error'] as const)test('races061: '+mode+' cannot replace the usable current result when transport ignores abort',async({page})=>{
  const state=await open(page,mode);await state.input.fill('antigua061');const held=await ready(page);expect(held.query).toBe('antigua061');
  await state.input.fill('nueva061');const current=state.dialog.getByRole('listitem').filter({hasText:'ID contact-2'});await expect(current).toBeVisible();
  const revision=await page.request.get('/api/v2/search?q=nueva061').then(r=>r.json());expect(held.captureId).toBe(revision.source.captureId);expect(held.revision).toBe(revision.source.revision);
  await release(page);await expect(current).toBeVisible();await expect(state.dialog.getByRole('listitem')).toHaveCount(1);await expect(state.dialog.getByRole('alert')).toHaveCount(0);await expect(state.input).toHaveValue('nueva061');
  await current.getByRole('button').click();await expect(page.getByRole('dialog',{name:'Nueva061 Evidencia061',exact:true})).toBeVisible();await unchanged(page,state);
});

for(const mode of ['open-success','open-error'] as const)test('races061: '+mode+' after query change cannot open an old record or replace the new search state',async({page})=>{
  const state=await open(page,mode);await state.input.fill('antigua061');await state.dialog.getByRole('listitem').getByRole('button').click();const held=await ready(page);
  await state.input.fill('nueva061');const current=state.dialog.getByRole('listitem').filter({hasText:'ID contact-2'});await expect(current).toBeVisible();
  const revision=await page.request.get('/api/v2/search?q=nueva061').then(r=>r.json());expect(held.captureId).toBe(revision.source.captureId);expect(held.revision).toBe(revision.source.revision);
  await release(page);await expect(state.dialog).toBeVisible();await expect(current).toBeVisible();await expect(state.dialog.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Antigua061 Evidencia061',exact:true})).toHaveCount(0);await unchanged(page,state);
});

test('races061: valid late opening cannot reopen a drawer after closing search',async({page})=>{
  const state=await open(page,'open-success');await state.input.fill('antigua061');await state.dialog.getByRole('listitem').getByRole('button').click();await ready(page);
  await state.dialog.getByRole('button',{name:'Cerrar búsqueda global',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await release(page);await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Buscar en toda la copia',exact:true})).toBeFocused();await unchanged(page,state);
});

test('races061: valid late opening cannot override a different entity selection',async({page})=>{
  const state=await open(page,'open-success');await state.input.fill('antigua061');await state.dialog.getByRole('listitem').getByRole('button').click();await ready(page);
  await state.dialog.getByLabel('Tipo de registro').selectOption('companies');await expect(state.dialog.getByRole('status')).toHaveText('No hay resultados para esta búsqueda.');await release(page);
  await expect(state.dialog).toBeVisible();await expect(state.dialog.getByRole('status')).toHaveText('No hay resultados para esta búsqueda.');await expect(page.getByRole('dialog',{name:'Antigua061 Evidencia061',exact:true})).toHaveCount(0);await unchanged(page,state);
});
