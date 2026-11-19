import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.PLANB_QUALITY_SOURCE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4547';
let bundle: string;

test.beforeAll(async () => {
  const fixture = await build({
    stdin:{
      resolveDir:root,
      loader:'tsx',
      contents:`
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { QualityPanel } from './src/app-shell/QualityPanel.tsx';
        import { makeFixture,makeDemoSpec } from './shared/fixtures.ts';
        const initial=makeDemoSpec(makeFixture());
        const spec={...initial,entities:initial.entities.filter(entity=>entity.id==='contacts')};
        function Fixture() {
          const [revision,setRevision]=useState(0);
          return <>
            <button onClick={()=>setRevision(value=>value+1)}>Cambiar copia</button>
            <QualityPanel spec={spec} revision={revision} onOpen={()=>{}} />
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    },
    bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},
  });
  bundle=fixture.outputFiles[0].text;
});

test.beforeEach(async ({page})=>{
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bundle});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script></html>'});
  });
});

const contact=(id: number, name: string, email: string)=>({entity:'contacts',id:'contact-'+id,values:{firstname:name,email}});

test('las páginas inconsistentes se muestran con cobertura sin confirmar', async ({page})=>{
  const records=Array.from({length:100},(_,i)=>contact(i,'Cliente '+i,'cliente-'+i+'@example.invalid'));
  await page.route('**/api/v2/records/contacts?*',route=>route.fulfill({
    json:{records:new URL(route.request().url()).searchParams.get('offset')==='0'?records:[records[0]],total:101},
  }));
  await page.goto(origin);
  await expect(page.getByText('Cobertura sin confirmar',{exact:true})).toBeVisible();
  await expect(page.getByText(/Se revisaron 100 registros únicos/)).toBeVisible();
  await expect(page.getByText('Sin avisos',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/Posible duplicado/)).toHaveCount(0);
});

test('cambiar de copia retira de inmediato los avisos que abrirían fichas anteriores', async ({page})=>{
  let reads=0;
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v2/records/contacts?*',async route=>{
    const first=++reads===1;
    if(!first)await pending;
    const records=first?[contact(1,'Ficticio anterior','malformado')]:[contact(1,'Ficticio actual','valido@example.invalid')];
    return route.fulfill({json:{records,total:1}});
  });
  try{
    await page.goto(origin);
    const old=page.getByRole('button',{name:/Ficticio anterior/});
    await expect(old).toBeVisible();
    await page.getByRole('button',{name:'Cambiar copia'}).click();
    await expect(old).toHaveCount(0);
    await expect.poll(()=>reads).toBe(2);
    release();
    await expect(page.getByText('Sin avisos',{exact:true})).toBeVisible();
  }finally{release();}
});

test('se puede reintentar una página fallida desde la tarjeta',async ({page})=>{
  const methods: string[]=[];
  await page.route('**/api/v2/records/contacts?*',route=>{
    methods.push(route.request().method());
    return methods.length===1
      ? route.fulfill({status:503,json:{error:'No hay lectura disponible'}})
      : route.fulfill({json:{records:[],total:0}});
  });
  await page.goto(origin);
  await expect(page.getByRole('alert')).toContainText('No hay lectura disponible');
  await expect(page.getByRole('button',{name:'Reintentar'})).toBeVisible();
  await page.getByRole('button',{name:'Reintentar'}).click();
  await expect(page.getByText('No hay registros que revisar en esta copia.',{exact:true})).toBeVisible();
  expect(methods).toEqual(['GET','GET']);
});
