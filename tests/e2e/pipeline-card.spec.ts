import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.PLANB_PIPELINE_SOURCE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4542';
let bundle: string;

test.beforeAll(async () => {
  const fixture = await build({
    stdin: {
      resolveDir: root,
      loader: 'tsx',
      contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { PipelineCard } from './src/app-shell/PipelineCard.tsx';
        import { makeDemoSpec, makeFixture } from './shared/fixtures.ts';

        const initial = makeDemoSpec(makeFixture());
        function Fixture() {
          const [spec, setSpec] = useState(initial);
          return <>
            <button onClick={() => setSpec({ ...initial, title: 'Segunda copia' })}>Cambiar de copia</button>
            <PipelineCard spec={spec} revision="hora-y-recuento-reutilizados" />
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    },
    bundle:true,
    write:false,
    format:'iife',
    jsx:'automatic',
    loader:{ '.css':'empty' },
  });
  bundle = fixture.outputFiles[0].text;
});

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture.js') return route.fulfill({ contentType:'application/javascript', body:bundle });
    return route.fulfill({
      contentType:'text/html',
      body:'<!doctype html><html lang="es"><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script></html>',
    });
  });
});

const deal = (id: string, dealstage: string, amount: string | number | null) => ({
  entity:'deals', id, values:{dealname:id, dealstage, amount},
});

test('distingue etapa desconocida, importe ausente, cero y lectura parcial', async ({page}) => {
  const records = [
    deal('Confirmada','contact',1200), deal('Cero expresado','contact',0),
    deal('Sin importe','proposal',null), deal('Sin etapa','desconocida',5000),
    ...Array.from({length:96},(_,i)=>deal('Ganada '+i,'won',100)),
  ];
  await page.route('**/api/v2/records/deals?*', route => route.fulfill({json:{records, related:[], total:145}}));
  await page.goto(origin);
  await expect(page.locator('.gx-pipe-figures p').filter({has:page.getByText('abiertas',{exact:true})}).locator('strong')).toHaveText('3');
  await expect(page.getByText('Importe conocido',{exact:true})).toBeVisible();
  await expect(page.locator('.gx-pipe-figures').getByText(/1\.200\s+€/)).toBeVisible();
  await expect(page.getByText('1 oportunidad abierta sin importe.',{exact:true})).toBeVisible();
  await expect(page.getByText('1 oportunidad con etapa por revisar.',{exact:true})).toBeVisible();
  await expect(page.getByText('Calculado con las primeras 100 de 145 oportunidades.',{exact:true})).toBeVisible();
});

test('sin un importe registrado no muestra un total cero', async ({page}) => {
  const records = [deal('Sin importe','contact',null)];
  await page.route('**/api/v2/records/deals?*', route => route.fulfill({json:{records, related:[], total:1}}));
  await page.goto(origin);
  await expect(page.locator('.gx-pipe-figures p').filter({has:page.getByText('abierta',{exact:true})}).locator('strong')).toHaveText('1');
  await expect(page.getByText('Sin importe conocido',{exact:true})).toBeVisible();
  await expect(page.getByText(/\b0\s*€/)).toHaveCount(0);
});

test('si la lectura parcial no contiene abiertas, conserva el alcance visible', async ({page}) => {
  const records = Array.from({length:100},(_,i)=>deal('Ganada '+i,'won',100));
  await page.route('**/api/v2/records/deals?*', route => route.fulfill({json:{records, related:[], total:145}}));
  await page.goto(origin);
  await expect(page.getByText('No se han identificado oportunidades abiertas entre las leídas.',{exact:true})).toBeVisible();
  await expect(page.getByText('Calculado con las primeras 100 de 145 oportunidades.',{exact:true})).toBeVisible();
});

test('reintenta el fallo y retira los totales al cambiar de copia con la misma revisión', async ({page}) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v2/records/deals?*', async route => {
    expect(route.request().method()).toBe('GET');
    const number = ++requests;
    if (number === 1) return route.fulfill({status:503,json:{error:'Consulta temporalmente interrumpida'}});
    if (number === 3) await pending;
    return route.fulfill({json:{records:[deal('Activa','contact',number === 2 ? 900 : 1800)], related:[], total:1}});
  });
  try {
    await page.goto(origin);
    await expect(page.getByText('Consulta temporalmente interrumpida',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Reintentar'})).toBeVisible();
    await page.getByRole('button',{name:'Reintentar'}).click();
    await expect(page.getByText(/900\s+€/).first()).toBeVisible();
    await page.getByRole('button',{name:'Cambiar de copia'}).click();
    await expect(page.getByText(/900\s+€/)).toHaveCount(0);
    await expect.poll(()=>requests).toBe(3);
    release();
    await expect(page.getByText(/1\.800\s+€/).first()).toBeVisible();
  } finally {
    release();
  }
});

test('descarta la respuesta de otra copia aunque el transporte anterior ignore la cancelación', async ({page}) => {
  await page.addInitScript(() => {
    const fetchNative = window.fetch.bind(window);
    window.fetch = (input,init) => fetchNative(input,{...init,signal:null});
  });
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v2/records/deals?*', async route => {
    const old = ++requests === 1;
    if (old) await pending;
    return route.fulfill({json:{records:[deal('Activa','contact',old ? 900 : 1800)], related:[], total:1}});
  });
  try {
    await page.goto(origin);
    await expect.poll(()=>requests).toBe(1);
    await page.getByRole('button',{name:'Cambiar de copia'}).click();
    await expect(page.getByText(/1\.800\s+€/).first()).toBeVisible();
    const previous = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/deals'));
    release();
    await (await previous).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText(/1\.800\s+€/).first()).toBeVisible();
    await expect(page.getByText(/900\s+€/)).toHaveCount(0);
  } finally {
    release();
  }
});
