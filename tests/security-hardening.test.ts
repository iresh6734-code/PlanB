import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../server/app.js';

// Hallazgos de la auditoría de seguridad independiente (CLAUDE-SEC-027) que siguen en la app principal.
// Los del espacio de equipo se archivaron con él (rama archivo/aparcado-2026-11-22).

// ---------- C2 · fórmulas en el CSV ----------
test('C2 el CSV neutraliza celdas que una hoja de cálculo ejecutaría como fórmula',()=>{
  for(const value of ['=HYPERLINK("http://x")','+cmd|x','-2+3','@SUM(A1)','\t=1','\r=1'])assert.match(csvCell(value),/^"'/,JSON.stringify(value));
  assert.equal(csvCell('Ana'),'"Ana"');assert.equal(csvCell(null),'""');assert.equal(csvCell('{"a":1}'),'"{""a"":1}"');
  assert.equal(csvCell('-5'),'"-5"','un número negativo no es una fórmula');assert.equal(csvCell('3.14'),'"3.14"');assert.equal(csvCell('di "hola"'),'"di ""hola"""');
});
