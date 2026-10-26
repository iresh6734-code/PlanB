import { chromium, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import assert from 'node:assert/strict';
import { localKey, open } from '../server/crypto.ts';
import { Store } from '../server/store.ts';

const root=resolve('.'),source=join(root,'tests','.tmp','hubspot-live-read');
const key=localKey(source),database=new DatabaseSync(join(source,'planb.sqlite'),{readOnly:true});
const decode=text=>JSON.parse(open(text,key));
let bundle;
try{
  const meta=name=>decode(database.prepare('SELECT value FROM meta WHERE key=?').get(name).value);
  bundle={format:'planb-continuity-v2',exportedAt:new Date().toISOString(),snapshot:meta('snapshot'),spec:meta('spec'),generation:meta('generation'),
    records:database.prepare('SELECT value FROM records ORDER BY rowid').all().map(row=>decode(row.value)),changes:[]};
}finally{database.close();}
const scratch=join(root,'tests','.tmp');mkdirSync(scratch,{recursive:true});
const folder=mkdtempSync(join(scratch,'imported-ui-')),data=join(folder,'data');
const copy=new Store(join(data,'planb.sqlite'));copy.restoreBundle(bundle);copy.close();
const port=4342,base='http://127.0.0.1:'+port;
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/KEY|TOKEN|SECRET|NODE_OPTIONS|PLANB_/i.test(name)));
env.PLANB_PORT=String(port);env.PLANB_DATA_DIR=data;
const api=async path=>{const response=await fetch(base+'/api'+path);if(!response.ok)throw new Error('API local '+response.status);return response.json();};
let child,browser,serverLog='';const external=[],errors=[];
async function launch(){
  child=spawn(process.execPath,['--require',join(root,'scripts','block-external.cjs'),join(root,'build','runtime.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{serverLog+=data;});child.stderr.on('data',data=>{serverLog+=data;});
  for(let i=0;i<100;i++){try{await api('/health');return;}catch{await new Promise(r=>setTimeout(r,100));}}
  throw new Error('No arrancó la copia aislada.');
}
async function stop(){if(child&&child.exitCode===null){await new Promise(resolve=>{child.once('close',resolve);child.kill();});}}
try{
  await launch();browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1536,height:1024},timezoneId:'Europe/Madrid'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});
  const contact=bundle.records.find(r=>r.entity==='contacts'&&r.values.email==='ana.planb@example.com');assert.ok(contact);
  await page.goto(base);await page.getByRole('button',{name:'Trabajar',exact:true}).click();
  await page.getByRole('button',{name:/Editar Ana Ensayo Ficticio/}).click();
  await page.getByRole('dialog').getByLabel('Teléfono',{exact:true}).fill('600 444 333');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'Oportunidades',exact:true}).click();await page.getByRole('button',{name:'Nueva oportunidad',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Nombre de la oportunidad',{exact:false}).fill('Prueba local · campos HubSpot');
  await page.getByRole('dialog').getByLabel('Importe',{exact:true}).fill('1500');
  await page.getByRole('button',{name:'Crear oportunidad',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:/Prueba local · campos HubSpot/}).click();
  const next=bundle.snapshot.stages[1];await page.getByRole('dialog').getByLabel('Etapa',{exact:false}).selectOption(next.id);
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'Tareas',exact:true}).click();await page.getByRole('button',{name:'Nueva tarea',exact:true}).click();
  const task=page.getByRole('dialog');await task.getByLabel('Asunto',{exact:false}).fill('Tarea local con fecha HubSpot');
  await task.getByLabel('Fecha límite',{exact:false}).fill('2026-11-12T10:30');
  await task.getByRole('combobox',{name:'Cliente principal',exact:true}).selectOption(contact.id);
  const status=bundle.spec.entities.find(e=>e.id==='tasks').fields.find(f=>f.key==='hs_task_status');
  const pending=status.options.find(o=>o.id==='NOT_STARTED')??status.options[0],done=status.options.find(o=>o.id==='COMPLETED');assert.ok(done);
  await task.getByLabel('Estado',{exact:false}).selectOption(pending.id);await task.getByRole('button',{name:'Crear tarea',exact:true}).click();await expect(task).toBeHidden();
  await page.getByRole('button',{name:'Tarea local con fecha HubSpot',exact:true}).click();
  await task.getByLabel('Estado',{exact:false}).selectOption(done.id);
  await page.screenshot({path:resolve('../../outputs/plan-b-v2-hubspot-tarea.png')});
  await task.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(task).toBeHidden();
  const records=(await api('/records')).records,createdTask=records.find(r=>r.values.hs_task_subject==='Tarea local con fecha HubSpot'),createdDeal=records.find(r=>r.values.dealname==='Prueba local · campos HubSpot');
  assert.equal(records.find(r=>r.entity==='contacts'&&r.id===contact.id).values.phone,'600 444 333');
  assert.equal(createdDeal.values.dealstage,next.id);assert.equal(createdTask.values.hs_task_status,done.id);
  assert.equal(createdTask.values.hs_timestamp,'2026-11-12T09:30:00.000Z');assert.equal(createdTask.values.planb_contact_id,contact.id);
  await stop();await launch();assert.deepEqual((await api('/records')).records,records);
  await page.reload();await page.getByRole('button',{name:'Trabajar',exact:true}).click();await expect(page.getByRole('cell',{name:'600 444 333',exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(!serverLog.includes('EXTERNAL_'));
  const report={passed:true,source:'Captura auténtica DEVELOPER_TEST 149623339',isolated:true,hubspotWrites:false,
    externalNetworkBlocked:true,operations:['Editar cliente importado','Crear oportunidad local y avanzar etapa importada','Crear y completar tarea con campos HubSpot','Relacionar tarea con contacto','Conservar fecha UTC y mostrar zona Europe/Madrid','Reiniciar y comparar todos los registros'],
    datetimeUTC:createdTask.values.hs_timestamp,browserErrors:errors,externalRequests:external,
    limitations:['La captura no contenía oportunidades: la oportunidad de esta prueba se creó solo en la copia local.','No acredita devolución a HubSpot ni las dos configuraciones previstas.']};
  writeFileSync(resolve('../../outputs/pruebas-hubspot-interfaz-v2.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await stop();if(!folder.startsWith(scratch+sep))throw new Error('Ruta temporal inesperada.');rmSync(folder,{recursive:true,force:true,maxRetries:3});}
