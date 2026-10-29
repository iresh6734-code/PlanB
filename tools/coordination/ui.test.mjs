import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin='http://127.0.0.1:4346';
test('tablón: lectura, actualización, detalles, teclado, escritorio/móvil y rutas HTTP restringidas',async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLANB_PLAYWRIGHT_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],external=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
    await page.goto(origin);await page.getByText('CLAUDE-001',{exact:true}).waitFor();assert.match(await page.title(),/Codex \+ Claude/);assert.equal(await page.getByRole('heading',{name:'Codex + Claude',exact:true}).count(),1);
    assert.match(await page.getByRole('status').textContent(),/Tablón al día/);assert.equal(await page.locator('.task').count(),2);assert.equal(await page.getByRole('list',{name:'Recuento por estado'}).getByRole('listitem').count(),5);assert.equal(await page.locator('.column').count(),1);
    const claude=page.locator('.task').filter({has:page.getByText('CLAUDE-001',{exact:true})});await claude.locator('summary').click();assert.equal(await claude.getByText('coordination/reports/CLAUDE-001.md',{exact:true}).isVisible(),true);
    const refreshed=page.waitForResponse(origin+'/api/board');await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();await refreshed;assert.equal(await claude.locator('details').getAttribute('open'),'');await claude.locator('summary').click();
    const folder=process.env.PLANB_EVIDENCE_DIR;if(folder)fs.mkdirSync(folder,{recursive:true});
    if(folder)await page.screenshot({path:path.join(folder,'tablon-escritorio.png'),fullPage:true});
    for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);if(folder&&width===390)await page.screenshot({path:path.join(folder,'tablon-movil.png'),fullPage:true});}
    await page.getByRole('button',{name:'Actualizar ahora',exact:true}).focus();assert.equal(await page.getByRole('button',{name:'Actualizar ahora',exact:true}).evaluate(e=>e===document.activeElement),true);
    assert.equal((await fetch(origin+'/api/board',{method:'POST'})).status,405);assert.equal((await fetch(origin+'/api/board',{headers:{origin:'https://untrusted.example'}})).status,403);assert.equal((await fetch(origin+'/server/team/oauth.ts')).status,404);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await context.close();await browser.close();}
});
