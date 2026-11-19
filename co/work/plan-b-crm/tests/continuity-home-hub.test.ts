import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Unidad 253. Contrato ESTÁTICO del montaje del hub en la portada de Continuidad (el recorrido en navegador está en tests/e2e/continuity-home-hub.spec.ts):
// props de navegación opcionales (una acción ausente no se simula), cero tráfico propio, sin segundo consentimiento y sin tocar la portada existente.
const home = fs.readFileSync('src/ContinuityHome.tsx', 'utf8'), code = home.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('el hub se monta dentro de Continuidad con navegación OPCIONAL: sin onOpenToday/onOpenIntegrations no se pasan acciones (el hub explica «ábrela desde el menú»)', () => {
  assert.match(code, /import \{ ContinuityHub \} from '\.\/ContinuityHub\.js'/); assert.match(code, /<ContinuityHub [^>]*navigate=\{hubNavigate\}/);
  assert.match(code, /\.\.\.\(onOpenToday\?\{'open-today':onOpenToday\}:\{\}\)/); assert.match(code, /\.\.\.\(onOpenIntegrations\?\{'open-integrations':onOpenIntegrations\}:\{\}\)/);
  assert.match(code, /onOpenToday\?: \(\) => void; onOpenIntegrations\?: \(\) => void/);
  assert.ok(!/'open-integrations':\s*\(\)\s*=>\s*\{\s*\}/.test(code), 'ninguna acción vacía');
});

test('«Abrir Integraciones» solo navega: la portada no registra otro consentimiento de lectura ni llama a la API de lectura', () => {
  assert.ok(!/read-check|Autorizar cinco lecturas|startReadCheck|authorizedReads/.test(code), 'el consentimiento y la caducidad son del panel de Integraciones (218)');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(code), 'sin almacenamiento del navegador');
});

test('vuelta desde Integraciones: aviso visible y foco; el Hub recibe la revisión autorizada sin inventar un ID de captura', () => {
  assert.match(code, /data-testid="return-note"/); assert.match(code, /role="status"/); assert.match(code, /heading\.focus\(\)/); assert.match(code, /onReturnHandled\?\.\(\)/);
  const hubElement = code.slice(code.indexOf('<ContinuityHub '), code.indexOf('/>', code.indexOf('<ContinuityHub ')) + 2);
  assert.ok(!/context=/.test(hubElement.replace(/connectionKey=/g, '')), 'sin vínculo autorizado de identidades no se pasa `context`: ' + hubElement);
  assert.match(hubElement, /workspaceContextRevision=\{workspaceContextRevision\}/);
  assert.match(hubElement, /key=\{workspaceContextRevision\?\?'unavailable'\}/);
});

test('la portada existente conserva sus acciones reales (simulacro, copia cifrada, conexión, captura) y los textos del bloque no las contradicen', () => {
  for (const label of ['Probar mi Plan B', 'Crear copia cifrada', 'Configurar conexión HubSpot', 'Capturar ahora', 'Continuar trabajando']) assert.ok(code.includes(label), label);
  assert.match(code, /«Probar mi Plan B» comprueba tu copia en un entorno aislado; el ensayo de relevo practica exportar e importar con datos ficticios y no la sustituye/);
});

test('App tiene la navegación de vuelta integrada y el arnés admite el parche ya montado', () => {
  const spec = fs.readFileSync('tests/e2e/continuity-home-hub.spec.ts', 'utf8'), app = fs.readFileSync('src/App.tsx', 'utf8');
  const anchors = [...spec.matchAll(/^\s+\["((?:[^"\\]|\\.)*)",\s*$/gm)].map(match => JSON.parse('"' + match[1] + '"') as string);
  assert.equal(anchors.length, 3);
  assert.match(app, /setIntegrationsFrom\('continuity'\)/);
  assert.match(app, /integrationsFrom\?<p className="back-link"/);
  assert.match(app, /workspaceContextRevision=\{state\.workspaceSearchContext\?\.contextRevision\?\?null\}/);
  assert.match(spec, /const alreadyMounted = APP_PATCH\.every/);
  assert.match(spec, /if \(page !== 'integrations'\) setIntegrationsFrom\(null\)/); assert.match(spec, /← Volver a Continuidad/);
});
