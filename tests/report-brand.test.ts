import assert from 'node:assert/strict';
import test from 'node:test';
import { BRAND_LOGO_MAX_BYTES, brandCsp, brandHtml, cleanBrandName, logoProblem, parseBrand } from '../shared/report-brand.js';
import { buildPassport, passportToHtml } from '../shared/continuity-passport.js';
import { reportHtml } from '../src/app-shell/continuity-report.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('el nombre se limpia de saltos y caracteres invisibles y se corta a 60', () => {
  assert.equal(cleanBrandName('  Acme\n\tIbérica\u202e  S.L. '), 'Acme Ibérica S.L.');
  assert.equal(cleanBrandName('x'.repeat(90)).length, 60);
  assert.equal(cleanBrandName(42), '');
});

test('el logotipo solo vale como PNG, JPEG o WebP reales y de 200 KB como mucho', () => {
  assert.equal(logoProblem(PNG), null);
  assert.match(String(logoProblem('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')), /PNG, JPEG o WebP/);
  assert.match(String(logoProblem('data:image/png;base64,/9j/AAAA')), /no es la imagen/);
  assert.match(String(logoProblem('data:image/png;base64,iVBORw0KGgo" onerror="x')), /PNG, JPEG o WebP/);
  const big = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(Math.ceil(BRAND_LOGO_MAX_BYTES * 4 / 3) + 8);
  assert.match(String(logoProblem(big)), /200 KB/);
});

test('la cabecera escapa el nombre y desaparece sin marca', () => {
  assert.equal(brandHtml(null), '');
  assert.equal(parseBrand({ name: '   ', logo: 'data:text/html;base64,AAAA' }), null);
  const html = brandHtml({ name: '<b>Acme</b> & "Co"', logo: PNG });
  assert.match(html, /&lt;b&gt;Acme&lt;\/b&gt; &amp; &quot;Co&quot;/);
  assert.match(html, /<img src="data:image\/png;base64,iVBOR[^"]*" alt="Logotipo de /);
  assert.doesNotMatch(brandHtml({ name: 'Acme', logo: 'javascript:alert(1)' }), /<img/);
});

test('el pasaporte solo admite imágenes embebidas cuando lleva logotipo', () => {
  assert.equal(brandCsp(null), '');
  assert.equal(brandCsp({ name: 'Acme', logo: '' }), '');
  assert.equal(brandCsp({ name: '', logo: PNG }), '; img-src data:');
  const passport = buildPassport({ now: Date.parse('2026-11-19T10:00:00.000Z'), installId: null, copy: { status: 'not-provided', at: null, value: null }, hubspot: { status: 'not-provided', at: null, value: null }, work: { status: 'not-provided', at: null, value: null }, relay: { status: 'not-provided', at: null, value: null } });
  assert.match(passportToHtml(passport), /content="default-src 'none'; style-src 'unsafe-inline'">/);
  const html = passportToHtml(passport, { name: 'Acme', logo: PNG });
  assert.match(html, /content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">/);
  assert.match(html, /<body><div class="pb-brand"><img src="data:image\/png/);
});

test('el parte lleva la marca arriba y sale igual que antes sin ella', () => {
  const report = { version: '0.6.0', generatedAt: '2026-11-19T10:00:00.000Z', source: '', items: [], counts: null, window: { days: 7, covered: 7, gaps: 0, idle: 0, longest: '' }, alerts: [], limits: [] } as unknown as Parameters<typeof reportHtml>[0];
  const plain = reportHtml(report), branded = reportHtml(report, { name: 'Acme', logo: '' });
  assert.doesNotMatch(plain, /class="pb-brand"/);
  assert.match(branded, /<main><div class="pb-brand"><span>Acme<\/span><\/div><h1>Parte de continuidad/);
});
