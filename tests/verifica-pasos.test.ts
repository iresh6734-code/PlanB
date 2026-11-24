// Plan B Verifica · pasos 1 y 2 del encargo en la pantalla (fase D, corte 1): lo que pintan con datos dados, sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperationContent, SourcesContent, type IssueControls } from '../src/verifica/Engagements.js';
import { Frame } from '../src/verifica/Masthead.js';
import { engagementView, type Engagement } from '../shared/verifica/engagement.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';

const AT = '2026-11-24T10:00:00.000Z';
const engagement: Engagement = { id: '0b8f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e11', name: 'Distribuidora del norte', createdAt: AT, updatedAt: AT };
const noop = () => {};

test('Verifica · pantalla de migración local: archivos separados, fecha y una acción primaria', async () => {
  const { default: MigrationEngagement } = await import('../src/verifica/MigrationEngagement.js');
  const html = renderToStaticMarkup(createElement(MigrationEngagement, { origin: { kind: 'local', onDoc: noop }, onOpen: noop, openError: null }));
  for (const name of ['closing', 'target', 'map', 'watch', 'salt']) assert.match(html, new RegExp(`name="${name}"`));
  assert.match(html, /<input(?=[^>]*\bname="asOf")(?=[^>]*\btype="date")[^>]*>/);
  assert.match(html, /Comparar migración/);
  assert.equal(html.match(/class="vf-primary"/g)?.length, 1);
  assert.doesNotMatch(html, /Empresa ficticia|Descargar lista privada/);
});
const controls = (over: Partial<IssueControls> = {}): IssueControls => ({ busy: false, error: null, freshKey: null, onIssue: noop, onDownload: noop, onDownloadKey: noop, onShowReport: noop, ...over });

test('Verifica · paso 1: crear un encargo es el único botón relleno, y cada encargo dice si está listo', () => {
  const html = renderToStaticMarkup(createElement(OperationContent, {
    engagements: [{ ...engagement, ready: true, stored: 4, issued: false }, { ...engagement, id: '1c9f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e12', name: 'Taller del sur', ready: false, stored: 1, issued: false }, { ...engagement, id: '2d9f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e13', name: 'Imprenta del este', ready: true, stored: 4, issued: true }],
    loadError: null, busy: false, createError: null, onCreate: noop, onOpenEngagement: noop,
  }));
  assert.equal(html.match(/class="vf-primary"/g)?.length, 1);
  assert.match(html, /Crear encargo/);
  assert.match(html, /Listo para la sala limpia/);
  assert.match(html, /Faltan fuentes/);
  assert.match(html, /4 de 4 fuentes/);
  assert.match(html, /1 de 4 fuentes/);
  assert.match(html, /Informe emitido/);
  const empty = renderToStaticMarkup(createElement(OperationContent, { engagements: [], loadError: null, busy: false, createError: null, onCreate: noop, onOpenEngagement: noop }));
  assert.match(empty, /Todavía no hay ningún encargo en este equipo/);
});

test('Verifica · paso 2: cada fuente con su estado y su huella, y ningún nombre del CRM en la página', () => {
  const files = exampleFiles(true), stamp = (fileName: string) => ({ text: files.get(fileName)!, fileName, storedAt: AT });
  const view = engagementView(engagement, { latest: stamp('ahora.json'), invoices: stamp('facturas.csv'), declarations: { text: '{"renewalRate":2}', fileName: 'mal.json', storedAt: AT } });
  const html = renderToStaticMarkup(createElement(SourcesContent, { view, busyRole: null, errors: { previous: 'El archivo no es una captura de Verifica.' }, onUpload: noop, onRemove: noop, issue: controls() }));
  assert.equal(html.match(/class="vf-source"/g)?.length, 4);
  assert.equal(html.match(/data-status="ok"/g)?.length, 4, 'dos fuentes que sirven: fila y etiqueta');
  assert.match(html, /data-status="missing"/);
  assert.match(html, /data-status="invalid"/);
  assert.match(html, /Huella <code title="[0-9a-f]{64}">[0-9a-f]{12}<\/code>/);
  assert.match(html, /El archivo no es una captura de Verifica\./, 'el error de la última subida se ve en su fila');
  assert.match(html, /faltan: falta la captura anterior; las cifras declaradas no sirven/);
  assert.equal(html.match(/class="vf-primary"/g), null, 'con fuentes que faltan no se puede emitir: no hay botón relleno');
  const names = JSON.parse(files.get('ahora.json')!).companies.slice(0, 20).map((c: { name: string }) => c.name);
  assert.deepEqual(names.filter((name: string) => html.includes(name)), []);
});

test('Verifica · con el servidor local los pasos 1 y 2 navegan; sin él siguen siendo solo nombres', () => {
  const local = renderToStaticMarkup(createElement(Frame, { origin: { kind: 'local', onDoc: noop }, current: 'operation', eyebrow: 'Paso 1', title: 'Encargos', lede: '' }));
  assert.match(local, /<button type="button" class="vf-step" data-doc="true" aria-current="page"><span class="vf-step-n">01<\/span>/);
  assert.match(local, /<button type="button" class="vf-step" data-doc="true"><span class="vf-step-n">02<\/span>/);
  assert.match(local, /Encargos de este equipo · se guardan cifrados/);
  assert.ok(!local.includes('Empresa ficticia') && !local.includes('vf-switch'), 'sin aviso de ejemplo ni variantes');
  const offline = renderToStaticMarkup(createElement(Frame, { origin: { kind: 'reference', variant: 'traps', onDoc: noop }, current: 'report', eyebrow: 'Informe', title: 'Informe', lede: '' }));
  assert.match(offline, /<span class="vf-step" data-doc="false"><span class="vf-step-n">01<\/span>/);
  assert.match(offline, /<span class="vf-step" data-doc="false"><span class="vf-step-n">02<\/span>/);
});

test('Verifica · paso 2: emitir, descargar por separado y la llave solo justo después de emitir', () => {
  const files = exampleFiles(true), stamp = (fileName: string) => ({ text: files.get(fileName)!, fileName, storedAt: AT });
  const base = engagementView(engagement, { previous: stamp('antes.json'), latest: stamp('ahora.json'), invoices: stamp('facturas.csv'), declarations: stamp('declaraciones.json') });
  const render = (view: typeof base, over: Partial<IssueControls> = {}) => renderToStaticMarkup(createElement(SourcesContent, { view, busyRole: null, errors: {}, onUpload: noop, onRemove: noop, issue: controls(over) }));
  const ready = render({ ...base, issue: null });
  assert.equal(ready.match(/class="vf-primary"/g)?.length, 1);
  assert.match(ready, /class="vf-primary"[^>]*>Emitir el informe</);
  assert.ok(!ready.includes('Descargar el informe') && !ready.includes('Descargar la llave'));
  const issue = { issuedAt: AT, reportFingerprint: 'a'.repeat(64), custodyFingerprint: 'b'.repeat(64), findings: 6, alarms: 6, stale: false };
  const issued = render({ ...base, issue }, { freshKey: 'vfk1-' + 'x'.repeat(43) });
  assert.equal(issued.match(/class="vf-primary"/g), null, 'emitido y al día: nada que volver a emitir');
  assert.match(issued, /6 de 6 comprobaciones se salen de lo normal/);
  for (const label of ['Descargar el informe', 'Descargar la copia custodiada', 'Ver el informe', 'Descargar la llave']) assert.ok(issued.includes(label), label);
  assert.ok(!issued.includes('vfk1-'), 'la llave se descarga, no se pinta');
  const later = render({ ...base, issue });
  assert.ok(!later.includes('Descargar la llave'), 'al volver más tarde la llave ya no está');
  const stale = render({ ...base, issue: { ...issue, stale: true } });
  assert.match(stale, /class="vf-primary"[^>]*>Volver a emitir</);
  assert.match(stale, /Alguna fuente cambió después de emitir/);
});

test('Verifica · paso 3: leer HubSpot, con la credencial en un campo de contraseña y el sitio de la captura propuesto', async () => {
  const { CapturesContent, defaultTarget } = await import('../src/verifica/Captures.js');
  const files = exampleFiles(true), stamp = (fileName: string) => ({ text: files.get(fileName)!, fileName, storedAt: AT });
  const empty = engagementView(engagement, {});
  const half = engagementView(engagement, { previous: stamp('antes.json') });
  const both = engagementView(engagement, { previous: stamp('antes.json'), latest: stamp('ahora.json') });
  assert.deepEqual([defaultTarget(empty), defaultTarget(half), defaultTarget(both)], ['previous', 'latest', 'rotate']);
  const base = { busy: false, error: null, records: [], recordsError: null, onStart: noop, onShowSources: noop, onDownloadRecord: noop };
  const html = renderToStaticMarkup(createElement(CapturesContent, { ...base, view: half, job: null }));
  assert.equal(html.match(/class="vf-primary"/g)?.length, 1);
  assert.match(html, /<button type="submit" class="vf-primary" disabled="">Leer HubSpot<\/button>/, 'sin rellenar no se puede leer');
  assert.match(html, /<input class="vf-input vf-input-text" type="password" autoComplete="off"/);
  assert.ok(!/type="password"[^>]*value=/.test(html), 'la credencial no va en el HTML');
  assert.match(html, /checked="" value="client"/, 'por defecto, la cuenta de la empresa');
  assert.match(html, /Autorización \(autorizacion\.json\)/);
  assert.match(html, /Documento firmado/);
  assert.match(html, /checked="" value="latest"/, 'con la anterior ya guardada, la siguiente entra como reciente');
  assert.match(html, /Captura anterior: antes\.json · Captura más reciente: falta/);
  assert.match(html, /Todavía no hay actas/);
});

test('Verifica · paso 3: el progreso, el resultado con su acta, la parada y la lista de actas', async () => {
  const { CapturesContent } = await import('../src/verifica/Captures.js');
  const view = engagementView(engagement, {});
  const base = { view, busy: false, error: null, recordsError: null, onStart: noop, onShowSources: noop, onDownloadRecord: noop };
  const running = renderToStaticMarkup(createElement(CapturesContent, { ...base, records: null, job: { state: 'running', mode: 'client', startedAt: AT, progress: ['comerciales: 6', 'empresas: 120'] } }));
  assert.match(running, /Leyendo HubSpot…/);
  assert.match(running, /<li>comerciales: 6<\/li><li>empresas: 120<\/li>/);
  assert.match(running, /disabled="">Leyendo…<\/button>/);
  assert.match(running, /<fieldset class="vf-choice" disabled="">/, 'el formulario se bloquea mientras lee');
  const fingerprint = 'a'.repeat(64);
  const done = renderToStaticMarkup(createElement(CapturesContent, {
    ...base, job: { state: 'done', mode: 'client', startedAt: AT, finishedAt: AT, progress: [], result: { captureId: 'hubspot-1', role: 'previous', counts: { owners: 1, companies: 120, contacts: 340, deals: 80 }, historyAvailable: true, requests: 14, recordFingerprint: fingerprint } },
    records: [{ captureId: 'hubspot-1', fingerprint, finishedAt: AT, portalId: '4400123', engagement: 'VF-2026-001' }],
  }));
  assert.match(done, /Guardada como captura anterior: 120 empresas, 340 contactos, 80 oportunidades y 1 comercial, con historial de etapas\. 14 peticiones de solo lectura\./);
  assert.match(done, /Acta de la lectura, huella <code title="a{64}">a{12}<\/code>/);
  assert.match(done, /Lectura del 24 de noviembre de 2026 · portal 4400123/);
  assert.equal(done.match(/Descargar el acta/g)?.length, 2, 'en el resultado y en la lista');
  const failed = renderToStaticMarkup(createElement(CapturesContent, { ...base, records: [], job: { state: 'failed', mode: 'test', startedAt: AT, finishedAt: AT, progress: [], error: 'Lectura detenida: En modo de pruebas solo se leen cuentas de pruebas.' } }));
  assert.match(failed, /Lectura detenida: En modo de pruebas solo se leen cuentas de pruebas\. No se ha guardado ninguna captura\./);
  const step = renderToStaticMarkup(createElement(Frame, { origin: { kind: 'local', onDoc: noop }, current: 'captures', eyebrow: 'Paso 3', title: 'Leer HubSpot', lede: '' }));
  assert.match(step, /<button type="button" class="vf-step" data-doc="true" aria-current="page"><span class="vf-step-n">03<\/span>/);
});
