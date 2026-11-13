import {test,expect,type Page} from '@playwright/test';
const team='http://127.0.0.1:4341';
const label='Cliente del seguimiento';
async function open(page:Page,contacts?:Record<string,unknown>[]){
  const external:string[]=[];await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  if(contacts)await page.route('**/v6/commercial',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),contacts}});});
  await page.goto(team+'/team?view=commercial');await expect(page.getByRole('heading',{name:'Cada seguimiento, preparado.',exact:true})).toBeVisible();
  return {external,box:page.getByRole('combobox',{name:label,exact:true}),prepare:page.getByRole('button',{name:'Preparar seguimiento',exact:true})};
}
const person=(id:string,firstname:string,lastname:string,email:string)=>({entity:'contacts',id,values:{firstname,lastname,email}});

test('selector de clientes: escribir no elige, el teclado sí, y Escape y Tab no cambian la selección',async({page})=>{
  const {external,box,prepare}=await open(page);
  await expect(box).toHaveAttribute('aria-expanded','false');await expect(prepare).toBeDisabled();
  await box.click();await expect(box).toHaveAttribute('aria-expanded','true');
  const list=page.getByRole('listbox',{name:label,exact:true});await expect(list).toBeVisible();expect(await list.getByRole('option').count()).toBeGreaterThan(1);
  await box.fill('lucia');// sin acento
  await expect(list.getByRole('option')).toHaveCount(1);await expect(list.getByRole('option').first()).toContainText('Lucía Martín');
  await expect(prepare,'escribir no elige ni habilita preparar').toBeDisabled();await expect(box).toHaveValue('lucia');
  await expect(box).toHaveAttribute('aria-activedescendant',/.+/);
  await page.keyboard.press('Escape');await expect(list).toBeHidden();await expect(box,'Escape restaura el texto sin elegir').toHaveValue('');await expect(prepare).toBeDisabled();
  await box.fill('lucia');await page.keyboard.press('Tab');await expect(list).toBeHidden();await expect(box,'Tab no elige').toHaveValue('');await expect(prepare).toBeDisabled();
  await box.click();await box.fill('lucia');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await expect(box).toHaveValue(/Lucía Martín/);await expect(list).toBeHidden();await expect(prepare,'Enter elige y habilita preparar').toBeEnabled();
  await page.getByRole('button',{name:/Quitar el cliente/}).click();await expect(box).toHaveValue('');await expect(prepare).toBeDisabled();await expect(box).toBeFocused();
  expect(external).toEqual([]);
});

test('selector de clientes: los homónimos se distinguen y se elige por ID',async({page})=>{
  const twins=[person('gemela-1','Ana','García','ana@ficticio.example'),person('gemela-2','Ana','García','ana@ficticio.example'),person('otra-3','Bea','Sanz','bea@ficticio.example')];
  const {box}=await open(page,twins);const posts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/v6/proposals'))posts.push(request.postData()??'');});
  await box.click();const options=page.getByRole('listbox',{name:label,exact:true}).getByRole('option');
  await expect(options).toHaveCount(3);await expect(options.nth(0)).toContainText('ID gemela-1');await expect(options.nth(1)).toContainText('ID gemela-2');await expect(options.nth(2)).not.toContainText('ID ');
  await page.locator('[role="option"][data-contact-id="gemela-2"]').click();await expect(box).toHaveValue(/ID gemela-2/);
  await page.getByRole('button',{name:'Preparar seguimiento',exact:true}).click();await expect.poll(()=>posts.length).toBe(1);
  expect(JSON.parse(posts[0]).contactId,'se prepara para el cliente elegido por su ID').toBe('gemela-2');
});

test('selector de clientes: con 1.200 contactos muestra un tope visible y afinar lo quita',async({page})=>{
  const many=Array.from({length:1200},(_,index)=>person('masivo-'+index,'Cliente'+index,'Prueba','c'+index+'@ficticio.example'));
  const {box}=await open(page,many);await box.click();const options=page.getByRole('listbox',{name:label,exact:true}).getByRole('option');
  await expect(options).toHaveCount(50);await expect(page.getByText('Se muestran 50 de 1200 coincidencias. Escribe para afinar la búsqueda.')).toBeVisible();
  await box.fill('cliente1199');await expect(options).toHaveCount(1);await expect(page.getByText(/Se muestran 50 de/)).toHaveCount(0);
  await box.fill('zzz-no-existe');await expect(options).toHaveCount(0);await expect(page.getByText('Ningún cliente coincide con «zzz-no-existe». Prueba con otro nombre, correo o teléfono.')).toBeVisible();
});

test('selector de clientes: la selección se comparte con Archivos y no desborda en 1440, 390 y 320 px',async({page},testInfo)=>{
  const {box,prepare}=await open(page);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});await box.click();
    const list=page.getByRole('listbox',{name:label,exact:true});await expect(list).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sin desbordamiento horizontal a '+width).toBeTruthy();
    const geometry=await list.evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,height:(node.querySelector('[role="option"]') as HTMLElement).getBoundingClientRect().height,inside:r.right<=innerWidth+1&&r.left>=-1};});
    expect(geometry.inside,'la lista cabe en la pantalla a '+width).toBeTruthy();expect(geometry.height,'objetivo táctil de 44 px a '+width).toBeGreaterThanOrEqual(44);
    await page.screenshot({path:testInfo.outputPath('selector-'+width+'.png')});await page.keyboard.press('Escape');await expect(list).toBeHidden();
  }
  await page.setViewportSize({width:1440,height:900});
  await box.click();await box.fill('lucia');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(prepare).toBeEnabled();
  await page.getByRole('tab',{name:'Archivos',exact:true}).click();
  const documents=page.getByRole('combobox',{name:'Cliente para los documentos',exact:true});await expect(documents,'misma selección en Archivos').toHaveValue(/Lucía Martín/);
  await page.getByRole('tab',{name:'Seguimientos',exact:true}).click();await expect(box).toHaveValue(/Lucía Martín/);
});
