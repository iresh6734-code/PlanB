import {test,expect,type Page} from '@playwright/test';
// CLAUDE-UX-038: invariantes verificables del sistema de diseño sobre el piloto de ensayo (datos ficticios, sin red externa).
const team='http://127.0.0.1:4341';
const views=['company','records','jobs','connections','agent','commercial'] as const;
const sizes=[{width:1440,height:900},{width:1024,height:768},{width:390,height:844},{width:320,height:640}];
async function blockExternal(page:Page){await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());}
const px=async(page:Page,selector:string,property:string)=>page.locator(selector).first().evaluate((node,prop)=>parseFloat(getComputedStyle(node).getPropertyValue(prop)),property);

for(const size of sizes)test(`sin desbordamiento horizontal de página en todas las vistas a ${size.width}px`,async({page})=>{
  await page.setViewportSize(size);await blockExternal(page);
  for(const view of views){
    await page.goto(team+'/team?view='+view);await expect(page.locator('.sidebar')).toBeVisible();await expect(page.locator('h1').first()).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow,`${view} a ${size.width}px desborda ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test('densidad de escritorio: barra lateral estrecha, título de una línea, filas de 44 px y sin tarjetas gigantes',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await blockExternal(page);
  await page.goto(team+'/team?view=records');await expect(page.locator('.customer-name-button').first()).toBeVisible();
  expect(await page.locator('.sidebar').evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(220);
  expect(await px(page,'.page-header h1','font-size')).toBeLessThanOrEqual(22);
  expect(await page.locator('.page-header').evaluate(node=>node.getBoundingClientRect().height),'cabecera de una línea').toBeLessThanOrEqual(40);
  expect(await page.locator('.table-container tbody tr').first().evaluate(node=>node.getBoundingClientRect().height)).toBeLessThanOrEqual(45);
  expect(await page.locator('.table-container').evaluate(node=>node.getBoundingClientRect().top),'la tabla empieza en el primer tercio del viewport').toBeLessThan(320);
  expect(await page.locator('.sidebar .nav-item.active').evaluate(node=>node.getBoundingClientRect().height),'el estado activo no es un bloque grande').toBeLessThanOrEqual(34);
});

test('controles: altura de 32 px en escritorio y de 40 px o más en móvil',async({page})=>{
  await blockExternal(page);
  await page.setViewportSize({width:1440,height:900});await page.goto(team+'/team?view=records');
  const search=page.getByLabel('Buscar por nombre, correo o teléfono',{exact:true});await expect(search).toBeVisible();
  expect(await search.evaluate(node=>node.getBoundingClientRect().height)).toBeCloseTo(32,0);
  await page.setViewportSize({width:390,height:844});
  expect(await search.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
  expect(await page.locator('.sidebar .nav-item').first().evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});

test('foco visible: los controles de teclado muestran un contorno de 2 px',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await blockExternal(page);
  await page.goto(team+'/team?view=records');await page.getByLabel('Buscar por nombre, correo o teléfono',{exact:true}).focus();
  for(const selector of ['input[type=search]'])expect(await page.locator(selector).first().evaluate(node=>{const style=getComputedStyle(node);return style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2;}),selector).toBe(true);
  await page.locator('.sidebar .nav-item').nth(2).focus();
  expect(await page.locator('.sidebar .nav-item').nth(2).evaluate(node=>parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
});

test('el selector de clientes usa la misma altura de control y su lista no desborda a 320 px',async({page})=>{
  await page.setViewportSize({width:320,height:640});await blockExternal(page);
  await page.goto(team+'/team?view=commercial');
  const box=page.getByRole('combobox',{name:'Cliente del seguimiento',exact:true});await box.click();
  const list=page.getByRole('listbox',{name:'Cliente del seguimiento',exact:true});await expect(list).toBeVisible();
  const rect=await list.evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right};});
  expect(rect.left).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(320);
});

test('orden: el contenido de Comercial, Agente, Integraciones y Trabajos vive en paneles, y los desplegables usan chevron propio',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await blockExternal(page);
  const isPanel=(selector:string)=>page.locator(selector).first().evaluate(node=>{const style=getComputedStyle(node);return style.backgroundColor==='rgb(255, 255, 255)'&&parseFloat(style.borderTopWidth)>=1&&parseFloat(style.borderTopLeftRadius)>=8;});
  await page.goto(team+'/team?view=commercial');await expect(page.locator('.commercial-tabs')).toBeVisible();
  expect(await isPanel('.commercial-workspace > .commercial-tabs + div'),'contenido de la pestaña en tarjeta').toBe(true);
  expect(await page.locator('.integration-evidence > summary').first().evaluate(node=>getComputedStyle(node).display),'sin triángulo nativo').toBe('flex');
  await page.goto(team+'/team?view=agent');await expect(page.locator('.agent-priority-list')).toBeVisible();
  expect(await isPanel('.agent-priority-list'),'oportunidades en tarjeta').toBe(true);
  expect(await page.locator('.local-agent-settings').evaluate(node=>{const style=getComputedStyle(node);return style.backgroundColor==='rgb(255, 255, 255)'&&parseFloat(style.borderLeftWidth)>=1;}),'ajustes de IA local dentro de la tarjeta del asistente').toBe(true);
  await page.goto(team+'/team?view=connections');await expect(page.locator('.export-instructions')).toBeVisible();
  const [feature,form]=await Promise.all(['.team-page > .agent-feature','.team-page > .export-instructions'].map(selector=>page.locator(selector).first().evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})));
  expect(Math.abs(feature.right-form.right),'HubSpot y su formulario forman una tarjeta del mismo ancho').toBeLessThanOrEqual(1);
  expect(Math.abs(form.top-feature.bottom)).toBeLessThanOrEqual(1);
  await page.goto(team+'/team?view=jobs');const action=page.getByRole('button',{name:'Comprobar sincronización'});await expect(action).toBeVisible();
  const box=await action.boundingBox(),main=await page.locator('.team-page').boundingBox();
  if(box&&main&&await page.locator('.team-page > .agent-runs:empty').count())expect(Math.abs((box.x+box.width/2)-(main.x+main.width/2)),'acción del estado vacío centrada').toBeLessThanOrEqual(2);
});

test('integración con UX-032: las opciones del selector de clientes miden 44 px o más también en escritorio con puntero fino',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await blockExternal(page);
  await page.goto(team+'/team?view=commercial');
  await page.getByRole('combobox',{name:'Cliente del seguimiento',exact:true}).click();
  const options=page.getByRole('listbox',{name:'Cliente del seguimiento',exact:true}).getByRole('option');
  await expect(options.first()).toBeVisible();
  const heights=await options.evaluateAll(nodes=>nodes.slice(0,8).map(node=>node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for(const height of heights)expect(height).toBeGreaterThanOrEqual(44);
});

test('tarjeta de servicio: encabezado, descripción y desplegable forman una sola tarjeta y el estado no es una píldora',async({page})=>{
  await blockExternal(page);
  for(const width of [1440,700,390]){
    await page.setViewportSize({width,height:900});
    for(const [view,next] of [['agent','.team-agent-workspace > .status-strip + .helper'],['connections','.integration-connect > .integration-evidence']] as const){
      await page.goto(team+'/team?view='+view);const strip=page.locator(':is(.integration-connect, .team-agent-workspace) > .status-strip').first();await expect(strip).toBeVisible();
      const [top,below]=await Promise.all([strip.boundingBox(),page.locator(next).first().boundingBox()]);
      expect(top&&below&&Math.abs(below.y-(top.y+top.height)),`${view} a ${width}px: sin hueco entre encabezado y cuerpo`).toBeLessThanOrEqual(1);
      expect(top&&below&&Math.abs(below.width-top.width),`${view} a ${width}px: mismo ancho`).toBeLessThanOrEqual(1);
      expect(await strip.locator('> span').evaluate(node=>getComputedStyle(node).backgroundColor),'estado como texto, sin fondo de píldora').toBe('rgba(0, 0, 0, 0)');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBeLessThanOrEqual(0);
    }
  }
});

test('identidad (iteración 5): sin versalitas, títulos y cifras en la familia de títulos, banda de cifras unida y paneles planos',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await blockExternal(page);
  await page.goto(team+'/team?view=company');await expect(page.locator('.company-metrics')).toBeVisible();
  const upper=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(node=>node.childNodes.length&&[...node.childNodes].some(child=>child.nodeType===3&&child.textContent?.trim())&&getComputedStyle(node).textTransform==='uppercase').map(node=>node.className||node.tagName));
  expect(upper,'ninguna etiqueta visible en versalitas').toEqual([]);
  expect(await px(page,'.page-header h1','font-size')).toBeLessThanOrEqual(22);
  const fonts=await page.evaluate(()=>({h1:getComputedStyle(document.querySelector('h1')!).fontFamily,metric:getComputedStyle(document.querySelector('.company-metrics dd')!).fontFamily,body:getComputedStyle(document.body).fontFamily}));
  expect(fonts.h1.startsWith('Bahnschrift')||fonts.h1.includes('Segoe UI Variable Display'),'título en la familia de títulos').toBe(true);
  expect(fonts.metric).toBe(fonts.h1);expect(fonts.body).not.toBe(fonts.h1);
  const strip=await page.locator('.company-metrics').evaluate(node=>{const kids=[...node.children].map(child=>child.getBoundingClientRect());const style=getComputedStyle(node);return {sameRow:kids.every(rect=>Math.abs(rect.top-kids[0].top)<1),border:parseFloat(style.borderTopWidth),inner:getComputedStyle(node.children[1]).borderLeftWidth};});
  expect(strip.sameRow&&strip.border>=1,'cuatro cifras en una banda con borde').toBe(true);expect(parseFloat(strip.inner),'separadores internos de 1 px').toBeGreaterThanOrEqual(1);
  expect(await page.locator('.company-section').first().evaluate(node=>getComputedStyle(node).boxShadow),'panel en reposo sin sombra').toMatch(/^none$|rgba\(0, 0, 0, 0\)/);
});
