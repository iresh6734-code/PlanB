import { test,expect,type Page,type Route,type Request } from '@playwright/test';
import { resolve } from 'node:path';
// CLAUDE-UX-034 · foco estable, bloqueo efectivo y resultados honestos en la ficha de cliente.
// Navegador real (Chromium) contra el servidor de equipo de ensayo con datos ficticios; red externa bloqueada.
// Las peticiones a /v6/customers se retienen, fallan o dejan pasar de forma controlada; el servidor es el real.
const team=process.env.PLANB_TEAM_URL||'http://127.0.0.1:4341',output=resolve(process.env.PLANB_EVIDENCE_DIR||'test-results');
type Kind='read'|'create'|'status';
type Entry={kind:Kind;method:string;body:any};

async function arrange(page:Page){
  const errors:string[]=[],external:string[]=[],log:Entry[]=[],hooks:Partial<Record<Kind,(route:Route)=>Promise<void>>>={};
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.fallback();});
  const classify=(r:Request):Kind=>{const path=new URL(r.url()).pathname;return r.method()==='GET'?'read':/\/actions$/.test(path)?'create':'status';};
  await page.route('**/v6/customers/**',async route=>{const r=route.request(),kind=classify(r);log.push({kind,method:r.method(),body:r.postData()?JSON.parse(r.postData()!):undefined});const hook=hooks[kind];if(hook)await hook(route);else await route.continue();});
  const count=(kind:Kind)=>log.filter(e=>e.kind===kind&&(kind==='read'||e.method==='POST')).length;
  /** Retiene la petición hasta `release()`; después la deja pasar al servidor real. */
  const hold=(kind:Kind)=>{let release!:()=>void;const opened=new Promise<void>(r=>{release=r;});hooks[kind]=async route=>{await opened;await route.continue();};return release;};
  const failWith=(kind:Kind,status:number,error:string,afterServer=false)=>{hooks[kind]=async route=>{if(afterServer)await route.fetch();await route.fulfill({status,json:{error}});};};
  const pass=(kind:Kind)=>{delete hooks[kind];};
  return {errors,external,log,count,hold,failWith,pass};
}
async function openDossier(page:Page){
  await page.goto(team+'/team');await page.getByRole('navigation',{name:'Secciones del equipo',exact:true}).getByRole('button',{name:'Contactos',exact:true}).click();
  await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true});await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true})).toBeVisible();return drawer;
}
async function reopenAs(page:Page,profile:string){
  await page.getByLabel('Perfil de ensayo',{exact:true}).selectOption({label:profile});
  await page.getByRole('navigation',{name:'Secciones del equipo',exact:true}).getByRole('button',{name:'Contactos',exact:true}).click();
  await page.getByRole('button',{name:'Lucía Martín',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'Ficha de Lucía Martín',exact:true});await expect(drawer).toBeVisible();return drawer;
}
const unique=(label:string)=>label+' · '+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const row=(drawer:ReturnType<Page['getByRole']>,title:string)=>drawer.locator('li').filter({hasText:title});
const nativeDisabled=(locator:ReturnType<Page['locator']>)=>locator.evaluate(el=>(el as HTMLButtonElement).disabled);
async function create(page:Page,drawer:ReturnType<Page['getByRole']>,title:string){
  await drawer.getByLabel('Qué hay que hacer',{exact:true}).fill(title);await drawer.getByLabel('Fecha y hora local',{exact:true}).fill('2099-10-30T11:00');
  await drawer.getByRole('button',{name:'Guardar próxima acción',exact:true}).click();
  await expect(drawer.getByRole('button',{name:'Completar '+title,exact:true})).toBeVisible();
}
const finish=(c:Awaited<ReturnType<typeof arrange>>)=>{expect(c.errors,'sin errores de página ni de consola').toEqual([]);expect(c.external,'sin peticiones externas').toEqual([]);};

test('guardar: el foco se queda en el botón mientras se guarda, no hay duplicados y al vaciar el formulario vuelve al primer campo',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Guardar foco');
  await drawer.getByLabel('Qué hay que hacer',{exact:true}).fill(title);await drawer.getByLabel('Fecha y hora local',{exact:true}).fill('2099-10-30T11:00');
  const save=drawer.getByRole('button',{name:'Guardar próxima acción',exact:true}),release=c.hold('create');
  await save.click();
  await expect(save).toBeFocused();await expect(save).toHaveAttribute('aria-disabled','true');expect(await nativeDisabled(save),'bloqueo anunciado, no deshabilitado de verdad (perdería el foco)').toBe(false);
  await expect(drawer.getByLabel('Qué hay que hacer',{exact:true})).toHaveAttribute('readonly','');await expect(drawer.getByRole('status')).toContainText('Guardando la próxima acción');
  await page.keyboard.press('Enter');await page.keyboard.press('Space');await save.click({force:true});await drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true}).dispatchEvent('click');   // evento directo: un clic real movería el foco
  await page.waitForTimeout(250);expect(c.count('create'),'una sola creación pese a cuatro activaciones').toBe(1);expect(c.count('read'),'ninguna lectura en paralelo').toBe(1);
  await expect(save).toBeFocused();
  release();
  await expect(drawer.getByRole('status')).toContainText('Próxima acción guardada solo en Plan B.');
  await expect(drawer.getByRole('button',{name:'Completar '+title,exact:true})).toBeVisible();
  await expect(drawer.getByLabel('Qué hay que hacer',{exact:true}),'formulario vacío: el foco no se pierde en <body>').toBeFocused();
  await expect(drawer.getByLabel('Qué hay que hacer',{exact:true})).toHaveValue('');expect(c.count('create')).toBe(1);
  finish(c);
});

test('guardar con Enter: no se roba el foco que la persona dejó en el campo, y el segundo Enter no duplica',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Guardar Enter');
  await drawer.getByLabel('Qué hay que hacer',{exact:true}).fill(title);const due=drawer.getByLabel('Fecha y hora local',{exact:true});await due.fill('2099-10-30T11:00');
  const release=c.hold('create');await due.focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await expect(due).toBeFocused();await expect(due).toHaveAttribute('readonly','');await page.waitForTimeout(250);expect(c.count('create')).toBe(1);
  release();await expect(drawer.getByRole('button',{name:'Completar '+title,exact:true})).toBeVisible();
  await expect(due,'el foco seguía en un campo habilitado: no se mueve').toBeFocused();await expect(due).toHaveValue('');await expect(due).not.toHaveAttribute('readonly','');
  finish(c);
});

test('completar y reabrir: el foco no se pierde durante la operación y termina en «Próxima acción»',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Completar foco');await create(page,drawer,title);
  const complete=drawer.getByRole('button',{name:'Completar '+title,exact:true}),heading=drawer.getByRole('heading',{name:'Próxima acción',exact:true});
  await complete.focus();const release=c.hold('status');await page.keyboard.press('Enter');
  await expect(complete).toBeFocused();await expect(complete).toHaveAttribute('aria-disabled','true');expect(await nativeDisabled(complete)).toBe(false);
  await page.keyboard.press('Enter');await page.keyboard.press('Space');await complete.click({force:true});await page.waitForTimeout(250);expect(c.count('status'),'una sola mutación').toBe(1);
  release();
  await expect(row(drawer,title).getByRole('button',{name:'Reabrir',exact:true})).toBeVisible();
  await expect(heading,'la fila desaparece: el foco pasa a un destino estable').toBeFocused();await expect(drawer.getByRole('status')).toContainText('Acción completada en Plan B.');
  const reopen=row(drawer,title).getByRole('button',{name:'Reabrir',exact:true});await reopen.focus();const release2=c.hold('status');await page.keyboard.press('Enter');
  await expect(reopen).toBeFocused();await expect(reopen).toHaveAttribute('aria-disabled','true');await page.keyboard.press('Enter');await page.waitForTimeout(250);expect(c.count('status')).toBe(2);
  release2();await expect(drawer.getByRole('button',{name:'Completar '+title,exact:true})).toBeVisible();await expect(heading).toBeFocused();await expect(drawer.getByRole('status')).toContainText('Acción reabierta en Plan B.');
  finish(c);
});

test('completar: si la persona mueve el foco mientras la operación está pendiente, no se le quita al terminar',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Foco movido');await create(page,drawer,title);
  const complete=drawer.getByRole('button',{name:'Completar '+title,exact:true}),refresh=drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true});
  const release=c.hold('status');await complete.click();await expect(complete).toHaveAttribute('aria-disabled','true');
  await refresh.focus();await expect(refresh).toBeFocused();release();
  await expect(row(drawer,title).getByRole('button',{name:'Reabrir',exact:true})).toBeVisible();
  await expect(refresh,'el foco quedó donde la persona lo puso').toBeFocused();
  finish(c);
});

test('guardar fallido: se conserva el formulario y el foco, no se dice que se hizo, y el reintento no duplica aunque la respuesta se perdiera',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Guardar fallo');
  const titleField=drawer.getByLabel('Qué hay que hacer',{exact:true}),dueField=drawer.getByLabel('Fecha y hora local',{exact:true}),save=drawer.getByRole('button',{name:'Guardar próxima acción',exact:true});
  await titleField.fill(title);await dueField.fill('2099-10-30T11:00');
  c.failWith('create',500,'Servidor ocupado (prueba)');await save.click();
  await expect(drawer.getByRole('alert')).toContainText('No se pudo guardar la próxima acción: Servidor ocupado (prueba)');await expect(drawer.getByRole('alert')).not.toContainText('se realizó');
  await expect(titleField).toHaveValue(title);await expect(dueField).toHaveValue('2099-10-30T11:00');await expect(save).toBeFocused();await expect(save).not.toHaveAttribute('aria-disabled','true');
  c.failWith('create',502,'Respuesta perdida (prueba)',true);await save.click();   // el servidor SÍ crea la acción y la respuesta se pierde
  await expect(drawer.getByRole('alert')).toContainText('Respuesta perdida (prueba)');await expect(titleField).toHaveValue(title);
  c.pass('create');await save.click();
  await expect(drawer.getByRole('button',{name:'Completar '+title,exact:true})).toBeVisible();await expect(drawer.getByRole('alert')).toHaveCount(0);
  const posts=c.log.filter(e=>e.kind==='create'&&e.method==='POST').map(e=>e.body);expect(posts).toHaveLength(3);expect(new Set(posts.map(p=>p.id)).size,'los tres intentos comparten id').toBe(1);
  await expect(drawer.locator('li').filter({hasText:title}),'el servidor no duplicó pese a haber creado ya la acción').toHaveCount(1);
  await drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true}).click();await expect(drawer.locator('li').filter({hasText:title})).toHaveCount(1);
  finish(c);
});

test('completar fallido: nombra la acción, no la da por hecha y deja el control disponible con el foco',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Completar fallo');await create(page,drawer,title);
  const complete=drawer.getByRole('button',{name:'Completar '+title,exact:true});
  c.failWith('status',409,'La acción cambió. Actualiza la ficha antes de editar.');await complete.click();
  await expect(drawer.getByRole('alert')).toContainText('No se pudo completar la acción «'+title+'»: La acción cambió');await expect(drawer.getByRole('status')).toHaveCount(0);
  await expect(complete).toBeFocused();await expect(complete).not.toHaveAttribute('aria-disabled','true');
  c.pass('status');await complete.click();await expect(row(drawer,title).getByRole('button',{name:'Reabrir',exact:true})).toBeVisible();
  finish(c);
});

test('acción correcta con recarga fallida: se avisa, la fila vieja no invita a repetirla y reintentar la recarga no repite la mutación',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Recarga fallo');await create(page,drawer,title);
  const complete=drawer.getByRole('button',{name:'Completar '+title,exact:true}),refresh=drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true});
  c.failWith('read',500,'sin red (prueba)');await complete.click();
  await expect(drawer.getByRole('alert')).toContainText('La acción se realizó, pero no se pudo actualizar la ficha: sin red (prueba)');await expect(drawer.getByRole('status')).toContainText('Acción completada en Plan B.');
  await expect(complete,'la ficha mostrada es anterior a la acción').toBeVisible();await expect(complete).toHaveAttribute('aria-disabled','true');await expect(complete).toHaveAttribute('aria-describedby',/.+/);
  await complete.click({force:true});await page.keyboard.press('Enter');await page.waitForTimeout(250);expect(c.count('status'),'no se repite una acción ya realizada').toBe(1);
  await refresh.click();await expect(drawer.getByRole('alert')).toContainText('Sigue sin poder actualizarse la ficha: sin red (prueba)');expect(c.count('status')).toBe(1);
  c.pass('read');await refresh.click();
  await expect(drawer.getByRole('alert')).toHaveCount(0);await expect(row(drawer,title).getByRole('button',{name:'Reabrir',exact:true})).toBeVisible();await expect(complete).toHaveCount(0);
  expect(c.count('status'),'reintentar la recarga no repitió la mutación').toBe(1);
  finish(c);
});

test('cerrar con una operación pendiente avisa, no pierde el foco de origen y no actúa tras cerrar',async({page})=>{
  const c=await arrange(page),drawer=await openDossier(page),title=unique('Cerrar pendiente');await create(page,drawer,title);
  const messages:string[]=[];let answer=false;page.on('dialog',d=>{messages.push(d.message());void(answer?d.accept():d.dismiss());});
  const release=c.hold('status');await drawer.getByRole('button',{name:'Completar '+title,exact:true}).click();
  await page.keyboard.press('Escape');await expect(drawer).toBeVisible();expect(messages.at(-1)).toMatch(/operación en curso/);
  answer=true;await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Lucía Martín',exact:true}),'el foco vuelve a quien abrió la ficha').toBeFocused();
  const reads=c.count('read');release();await page.waitForTimeout(600);
  expect(c.count('status')).toBe(1);expect(c.count('read'),'no se recarga una ficha cerrada').toBe(reads);
  await expect(page.getByRole('button',{name:'Lucía Martín',exact:true}),'terminar la operación no roba ni mueve el foco').toBeFocused();
  finish(c);
});

test('solo lectura: «Completar» está deshabilitado de verdad, no hay formulario y forzar el clic no envía nada',async({page})=>{
  const c=await arrange(page);let drawer=await openDossier(page);const title=unique('Solo lectura');await create(page,drawer,title);
  await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();
  drawer=await reopenAs(page,'Solo lectura');
  const complete=drawer.getByRole('button',{name:'Completar '+title,exact:true});await expect(complete).toBeDisabled();await expect(drawer.getByLabel('Qué hay que hacer',{exact:true})).toHaveCount(0);
  const before=c.count('status');await complete.dispatchEvent('click');await complete.click({force:true});await page.waitForTimeout(250);expect(c.count('status'),'sin permiso no sale ninguna mutación').toBe(before);
  await expect(drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true})).toBeEnabled();
  finish(c);
});

// El servidor de demo no tiene piloto local: se simula solo la parte que ve el navegador, como en session-lock.spec.ts.
async function pilotLike(page:Page){
  await page.route('**/api/team/config',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),localPilot:true}});});
  await page.route('**/api/team/local-pilot/status',route=>route.fulfill({json:{configured:true,authenticated:true}}));
}
for(const scenario of ['Actualizar','recarga tras una acción correcta']){
  test('sesión caducada (401) en '+scenario+': la puerta conserva el foco y la ficha no lo recupera',async({page})=>{
    const c=await arrange(page),dialogs:string[]=[];page.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});await pilotLike(page);
    const drawer=await openDossier(page),title=unique('Sesión 401');await create(page,drawer,title);
    await drawer.getByLabel('Qué hay que hacer',{exact:true}).fill('Texto de la ficha sin guardar');
    c.failWith('read',401,'Desbloquea el piloto para continuar.');
    if(scenario==='Actualizar')await drawer.getByRole('button',{name:'Actualizar datos guardados',exact:true}).click();
    else await drawer.getByRole('button',{name:'Completar '+title,exact:true}).click();
    const gate=page.getByRole('heading',{name:'Sesión bloqueada.',exact:true});await expect(gate).toBeVisible();await expect(gate).toBeFocused();
    await page.waitForTimeout(500);await expect(gate,'tras terminar la operación la ficha no roba el foco a la puerta').toBeFocused();
    expect(dialogs).toEqual([]);if(scenario!=='Actualizar')expect(c.count('status'),'la acción se envió una sola vez').toBe(1);
    expect(c.errors,'sin errores de página ni de consola').toEqual([]);expect(c.external).toEqual([]);
  });
}

for(const width of [390,320]){
  test('móvil '+width+': el estado pendiente y el aviso de fallo caben sin desbordar y el foco se conserva',async({page})=>{
    await page.setViewportSize({width,height:800});
    const c=await arrange(page),drawer=await openDossier(page),title=unique('Móvil '+width+' acción con un título bastante largo para comprobar el ajuste');await create(page,drawer,title);
    const fits=async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin scroll horizontal de página').toBeTruthy();expect(await drawer.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'sin desbordar la ficha').toBeTruthy();};
    const complete=drawer.getByRole('button',{name:'Completar '+title,exact:true}),release=c.hold('status');
    await complete.focus();await page.keyboard.press('Enter');await expect(drawer.getByRole('status')).toContainText('Completando la acción');await expect(complete).toBeFocused();await fits();
    await page.screenshot({path:resolve(output,'ficha-pendiente-'+width+'.png')});
    release();await expect(drawer.getByRole('heading',{name:'Próxima acción',exact:true})).toBeFocused();
    c.failWith('status',409,'La acción cambió. Actualiza la ficha antes de editar.');const reopen=row(drawer,title).getByRole('button',{name:'Reabrir',exact:true});await reopen.click();
    await expect(drawer.getByRole('alert')).toContainText('No se pudo reabrir la acción');await fits();await expect(reopen).toBeFocused();
    // El aviso se acerca a la vista, pero no debe quedar tapado por la cabecera fija del panel.
    await expect.poll(async()=>{const alert=await drawer.getByRole('alert').boundingBox(),header=await drawer.locator('.modal-header').boundingBox();return alert&&header?Math.round(alert.y-(header.y+header.height)):-999;},{message:'aviso visible bajo la cabecera'}).toBeGreaterThanOrEqual(0);
    await page.screenshot({path:resolve(output,'ficha-fallo-'+width+'.png')});
    finish(c);
  });
}
