import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Auditoría estática del modo oscuro del espacio de equipo: sin navegador, se leen las hojas y se exige que
// fondos, textos y bordes salgan de los tokens (que cambian con html[data-theme="dark"]).
const TEAM_SHEETS = ['team.css', 'team-agent.css', 'team-company.css', 'team-sync.css', 'customer-dossier.css', 'customer-files.css', 'customer-combobox.css', 'reference-select.css'];

const literalColours = (css: string) => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/var\(--[a-z0-9-]+\s*,[^()]*(\([^()]*\))?[^()]*\)/gi, 'var()')
  .match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];

test('espacio de equipo: ninguna hoja usa colores escritos a mano (solo tokens o su valor de reserva)', () => {
  for (const sheet of TEAM_SHEETS) {
    const css = readFileSync(new URL('../src/' + sheet, import.meta.url), 'utf8');
    assert.deepEqual(literalColours(css), [], sheet + ' tiene colores fijos que no cambian en modo oscuro');
  }
});

test('la vista previa del correo es la única superficie clara fija, a propósito: así se verá en el buzón', () => {
  const css = readFileSync(new URL('../src/commercial-email.css', import.meta.url), 'utf8');
  assert.match(css, /\.commercial-mail-content\{[^}]*background:#fff/);
  assert.match(css, /\.commercial-mail-content\{[^}]*color-scheme:light/);
});

test('el detector reconoce colores fijos y respeta los valores de reserva de var()', () => {
  assert.deepEqual(literalColours('a{color:var(--muted,#52627a);background:#fff;box-shadow:0 1px rgba(0,0,0,.2)}'), ['#fff', 'rgba(0,0,0,.2)']);
});
