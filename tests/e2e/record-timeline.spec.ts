import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.PLANB_TIMELINE_SOURCE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://127.0.0.1:4543';
let bundle: string;

test.beforeAll(async () => {
  const fixture = await build({
    stdin: {
      resolveDir: root,
      loader: 'tsx',
      contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { RecordTimeline } from './src/app-shell/RecordTimeline.tsx';
        import { makeDemoSpec, makeFixture } from './shared/fixtures.ts';

        const spec = makeDemoSpec(makeFixture());
        const task = { id: 'compartido', entity: 'tasks', values: {} };
        const contact = { id: 'compartido', entity: 'contacts', values: {} };
        function Fixture() {
          const [record, setRecord] = useState(task);
          return <>
            <button onClick={() => setRecord(contact)}>Abrir contacto</button>
            <RecordTimeline record={record} records={[]} spec={spec} />
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
  });
  bundle = fixture.outputFiles[0].text;
});

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/fixture.js') return route.fulfill({contentType:'application/javascript',body:bundle});
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="es"><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script></html>',
    });
  });
});

type Values = Record<string, string | number | boolean | null>;
function change(id: number, entity: 'tasks' | 'contacts', before: Values | null, after: Values) {
  const recordId = 'compartido';
  return {
    id, entity, recordId, at: '2026-11-18T12:00:00.000Z',
    operation: before === null ? 'create' : 'update',
    before: before === null ? null : {entity,id:recordId,values:before},
    after: {entity,id:recordId,values:after},
  };
}

test('mantiene fecha ilegible, vacío, null y campo ausente y permite abrir el detalle por teclado', async ({page}) => {
  const edited = change(3, 'tasks',
    {a:'antes', b:null, c:'', due_date:'2026-99-01', notes:'Texto anterior', z:'Último anterior'},
    {a:'después', c:'Texto', due_date:'2026-11-19', notes:'Texto posterior', z:'Último posterior'});
  const created = change(1, 'tasks', null, {subject:'Título inicial', due_date:'2026-02-30'});
  await page.route('**/api/v2/changes', route => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({json:{changes:[created,edited]}});
  });
  await page.goto(origin);
  const timeline = page.getByRole('region',{name:'Historial de esta ficha'});
  const rows = timeline.locator('li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('2026-99-01');
  await expect(rows.first()).toContainText('19 nov 2026');
  await expect(rows.first()).toContainText('Campo ausente');
  await expect(rows.first()).toContainText('Sin valor');
  await expect(rows.first()).toContainText('Texto vacío');
  const overflow = rows.first().locator('summary');
  const lastField = rows.first().locator('p').filter({hasText:'Último posterior'});
  await expect(overflow).toHaveText('Ver 2 campos más');
  await expect(lastField).toBeHidden();
  await overflow.focus();
  await page.keyboard.press('Enter');
  await expect(rows.first().locator('details')).toHaveAttribute('open','');
  await expect(lastField).toBeVisible();

  await rows.last().locator('summary').click();
  await expect(rows.last()).toContainText('Título inicial');
  await expect(rows.last()).toContainText('2026-02-30');
});

test('descarta el historial atrasado aunque dos tipos de registro tengan el mismo ID', async ({page}) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => nativeFetch(input, {...init,signal:null});
  });
  let reads = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v2/changes', async route => {
    const first = ++reads === 1;
    if (first) await pending;
    const changes = first
      ? [change(2,'tasks',{subject:'Antes'},{subject:'Tarea anterior'})]
      : [change(2,'tasks',{subject:'Antes'},{subject:'Tarea ajena'}),change(4,'contacts',{firstname:'Antes'},{firstname:'Contacto vigente'})];
    return route.fulfill({json:{changes}});
  });
  try {
    await page.goto(origin);
    await expect.poll(()=>reads).toBe(1);
    await page.getByRole('button',{name:'Abrir contacto'}).click();
    await expect(page.locator('.gx-timeline-line').filter({hasText:'Contacto vigente'})).toBeVisible();
    const old = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v2/changes');
    release();
    await (await old).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(page.locator('.gx-timeline-line').filter({hasText:'Contacto vigente'})).toBeVisible();
    await expect(page.getByText(/Tarea anterior|Tarea ajena/)).toHaveCount(0);
  } finally {
    release();
  }
});

test('el fallo de lectura deja reintentar sin modificar el historial', async ({page}) => {
  const methods: string[] = [];
  await page.route('**/api/v2/changes', route => {
    methods.push(route.request().method());
    return methods.length === 1
      ? route.fulfill({status:503,json:{error:'Historial temporalmente interrumpido'}})
      : route.fulfill({json:{changes:[]}});
  });
  await page.goto(origin);
  await expect(page.getByRole('alert')).toContainText('Historial temporalmente interrumpido');
  await expect(page.getByRole('button',{name:'Reintentar'})).toBeVisible();
  await page.getByRole('button',{name:'Reintentar'}).click();
  await expect(page.getByText('Sin cambios locales: la ficha está como llegó en la copia.',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(methods).toEqual(['GET','GET']);
});
