import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out=process.env.PLANB_EVIDENCE_DIR;if(!out)throw new Error('Selecciona una carpeta de evidencias.');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLANB_PLAYWRIGHT_EXECUTABLE,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
const errors=[],external=[],screens=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort();}return r.continue();});
async function stable(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!document.querySelector('.inline-loading'));await page.evaluate(()=>document.fonts.ready);}
async function capture(id){await stable();await page.screenshot({path:resolve(out,id+'.png'),fullPage:true});screens.push({id,url:page.url(),heading:await page.locator('main h1').innerText(),metrics:await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,sections:[...document.querySelectorAll('.priority-workspace,.commitments-panel,.commitments-empty,.continuity-actions>article,.continuity-verification>article,.team-table,.commercial-editor,.integration-directory')].map(e=>({text:e.textContent.slice(0,70),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}))}))});}
await page.goto('http://127.0.0.1:4331/');
for(const [id,name] of [['01-hoy','Hoy'],['02-continuidad','Continuidad'],['03-trabajo','Clientes'],['04-cambios','Cambios'],['05-agentes','Agentes'],['06-integraciones','Integraciones'],['07-equipo-local','Copia de equipo'],['08-preparacion','Preparación'],['09-exportar','Exportar']]){
  if(name==='Clientes'){const work=page.getByRole('button',{name:'Trabajar',exact:true});if(await work.getAttribute('aria-expanded')==='false')await work.click();}
  await page.getByRole('button',{name,exact:true}).click();await capture(id);
}
await page.getByRole('button',{name:'Proveedor de IA',exact:true}).click();await page.getByRole('dialog').waitFor();await page.screenshot({path:resolve(out,'10-configuracion.png'),fullPage:true});await page.getByRole('button',{name:'Cerrar',exact:true}).click();
await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Hoy',exact:true}).click();await capture('11-movil-hoy');
await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:4332/team?view=commercial');await page.getByRole('heading',{name:'Cada seguimiento, preparado.',exact:true}).waitFor();
for(const [id,name] of [['12-equipo-comercial','Comercial'],['13-equipo-clientes','Contactos'],['14-equipo-personas','Equipo'],['15-equipo-trabajos','Trabajos'],['16-equipo-hubspot','HubSpot'],['17-equipo-dispositivos','Dispositivos']]){await page.getByRole('button',{name,exact:true}).click();await capture(id);}
await page.getByRole('button',{name:'Comercial',exact:true}).click();await page.getByLabel('Cliente del seguimiento',{exact:true}).selectOption('contact-1');
if(!await page.locator('.commercial-proposal').count())await page.getByRole('button',{name:'Preparar seguimiento',exact:true}).click();await page.getByLabel('Mensaje del seguimiento',{exact:true}).first().waitFor();await capture('18-editor-comercial');
await page.setViewportSize({width:390,height:900});await capture('19-movil-comercial');
const responsive=[];for(const width of [1024,390,320]){await page.setViewportSize({width,height:900});for(const name of ['Contactos','Trabajos','Dispositivos','Equipo','HubSpot','Comercial']){await page.getByRole('button',{name,exact:true}).click();await stable();responsive.push({width,view:name,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});}}
writeFileSync(resolve(out,'audit-state.json'),JSON.stringify({screens,responsive,errors,external},null,2));await browser.close();console.log(JSON.stringify({screens:screens.length,responsive,errors,external}));
