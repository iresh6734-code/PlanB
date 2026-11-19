import {test,expect,type Page} from '@playwright/test';
// AUTH_PARENT072 · recorrido real del padre (App) con la protección local: contraseña inventada, servidor y datos nuevos en 4455.
// Un fallo o un 401 al cargar el estado tras un acuse válido no puede abrir la copia ni dejar rechazos sin atender; reintentar solo repite la lectura.
const origin='http://127.0.0.1:4455',password='fixture-parent-072';
test.beforeEach(()=>{if(test.info().project.use.baseURL!==origin)throw Error('Solo el fixture nuevo 4455 con contraseña local inventada.');});
async function observe(page:Page){
 const errors:string[]=[],outside:string[]=[],posts:string[]=[],stateReads:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const path=new URL(r.url()).pathname;if(r.method()==='POST'&&['/api/v2/auth/setup','/api/v2/auth/login'].includes(path))posts.push(path);if(path==='/api/v2/state')stateReads.push(path);});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){outside.push(u.origin);return route.abort();}return route.fallback();});
 return {errors,outside,posts,stateReads};
}
async function lockedCopy(page:Page){
 const gate=await page.request.get('/api/v2/auth/status').then(r=>r.json());
 expect((await page.request.post('/api/v2/auth/'+(gate.configured?'login':'setup'),{data:{password}})).ok()).toBeTruthy();
 expect((await page.request.post('/api/v2/auth/lock',{data:{}})).ok()).toBeTruthy();
 expect(await page.request.get('/api/v2/auth/status').then(r=>r.json())).toMatchObject({authenticated:false});
}
const gateOf=(page:Page)=>page.request.get('/api/v2/auth/status').then(r=>r.json());
const login=async(page:Page)=>{const view=page.locator('.protection-page');await view.getByLabel('Contraseña local',{exact:true}).fill(password);await view.getByRole('button',{name:'Desbloquear',exact:true}).click();return view;};

test('parent072: a failed state load after a valid login keeps Protection, retries only the read and then opens',async({page})=>{
 await lockedCopy(page);const seen=await observe(page);let calls=0;
 await page.route('**/api/v2/state',route=>{calls++;return calls===1?route.fulfill({status:500,json:{error:'Fallo de ensayo al leer el estado.'}}):route.continue();});
 await page.goto('/');const view=await login(page);
 await expect(view.getByRole('alert')).toContainText('El servidor confirmó el acceso, pero no se pudo terminar de abrir la copia');
 await expect(view.getByRole('button',{name:'Reintentar apertura',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Copia de equipo',exact:true})).toHaveCount(0);
 expect((await gateOf(page)).authenticated).toBe(true);
 expect(seen.posts).toEqual(['/api/v2/auth/login']);
 await view.getByRole('button',{name:'Reintentar apertura',exact:true}).click();
 await expect(view).toHaveCount(0);await expect(page.getByRole('button',{name:'Copia de equipo',exact:true})).toBeVisible();
 expect(seen.posts,'reintentar no envía otra autenticación').toEqual(['/api/v2/auth/login']);
 expect(calls).toBeGreaterThanOrEqual(2);expect(seen.errors,'ningún rechazo sin atender').toEqual([]);expect(seen.outside).toEqual([]);
});

test('parent072: the app does not open while the confirmed state is still loading',async({page})=>{
 await lockedCopy(page);const seen=await observe(page);let release!:()=>void;const held=new Promise<void>(r=>{release=r;});
 await page.route('**/api/v2/state',async route=>{await held;await route.continue();});
 await page.goto('/');const view=await login(page);
 await expect.poll(()=>seen.stateReads.length).toBeGreaterThanOrEqual(1);
 await expect(page.getByRole('button',{name:'Copia de equipo',exact:true})).toHaveCount(0);
 await expect(view).toHaveCount(1);
 release();await expect(view).toHaveCount(0);await expect(page.getByRole('button',{name:'Copia de equipo',exact:true})).toBeVisible();
 expect(seen.posts).toEqual(['/api/v2/auth/login']);expect(seen.errors).toEqual([]);expect(seen.outside).toEqual([]);
});

test('parent072: a real 401 while loading the state keeps the copy locked and never opens it',async({page})=>{
 await lockedCopy(page);const seen=await observe(page);let locked=false;
 await page.route('**/api/v2/state',async route=>{if(!locked){locked=true;expect((await page.request.post('/api/v2/auth/lock',{data:{}})).ok()).toBeTruthy();}await route.continue();});
 await page.goto('/');const view=await login(page);
 await expect.poll(()=>locked).toBe(true);
 await expect(page.getByRole('button',{name:'Copia de equipo',exact:true})).toHaveCount(0);
 await expect.poll(async()=>(await gateOf(page)).authenticated).toBe(false);
 await expect(view).toHaveCount(1);
 // Sin esto el usuario quedaría en «acuse confirmado»: sin campos y con un reintento que vuelve a dar 401. Debe poder identificarse de nuevo.
 await expect(view.getByLabel('Contraseña local',{exact:true})).toBeVisible();
 await expect(view.getByRole('button',{name:'Reintentar apertura',exact:true})).toHaveCount(0);
 await page.unroute('**/api/v2/state');
 await view.getByLabel('Contraseña local',{exact:true}).fill(password);await view.getByRole('button',{name:'Desbloquear',exact:true}).click();
 await expect(view).toHaveCount(0);await expect(page.getByRole('button',{name:'Copia de equipo',exact:true})).toBeVisible();
 expect(seen.posts,'una autenticación nueva y legítima tras el bloqueo').toEqual(['/api/v2/auth/login','/api/v2/auth/login']);expect(seen.errors,'ningún rechazo sin atender').toEqual([]);expect(seen.outside).toEqual([]);
});
