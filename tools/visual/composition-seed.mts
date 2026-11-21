import { makeFixture } from '../../shared/fixtures.ts';
// Siembra datos ficticios («Agencia Norte») en una App de ensayo NUEVA y vacía (NODE_ENV=test, carpeta propia). Nunca contra datos reales.
const base = process.env.MISION_API ?? 'http://127.0.0.1:4571';
const snapshot = makeFixture('agency');
for (const [url, data] of [['/api/import/snapshot', { snapshot, replace: true }], ['/api/generate', { mode: 'demo' }], ['/api/activate', { reviewed: true }]] as const) {
  const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  console.log(url, r.status, r.ok ? '' : await r.text());
}
