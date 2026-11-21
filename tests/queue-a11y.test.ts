import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// H5 · accesibilidad de la cola (estática: lee el código sin abrir navegador).
const today = fs.readFileSync('src/LocalOperations.tsx', 'utf8');
const focus = fs.readFileSync('src/app-shell/FocusRun.tsx', 'utf8');

test('Hoy: la lista es una tabla para el lector de pantalla, con cabeceras, filas y celdas', () => {
  assert.match(today, /className="oc-table" role="table" aria-label="Tareas de Hoy por estado"/);
  assert.match(today, /className="oc-table-head" role="row">(<span role="columnheader">[^<]+<\/span>){2}<span role="columnheader"><span className="oc-sr">Acción<\/span><\/span>/);
  assert.doesNotMatch(today, /oc-table-head" aria-hidden/);
  assert.match(today, /<ul className="lop-tasks" role="rowgroup" aria-label=\{groupNames\[group\.bucket\]\}>/);
  assert.match(today, /<li key=\{task\.id\} role="row">/);
  // B4.4: estado y fecha en una sola celda («Vence», con el tono del grupo). Tres columnas, también sin botón.
  const row = today.slice(today.indexOf('<li key={task.id} role="row">'), today.indexOf('</li>', today.indexOf('<li key={task.id} role="row">')));
  assert.equal((row.match(/role="cell"/g) ?? []).length, 4, 'tarea, vence y acción (con botón o vacía)');
  assert.doesNotMatch(row, /oc-chip/, 'el estado ya lo dice el título del grupo y el tono de la fecha');
  assert.match(row, /<span className="lop-cell-action" role="cell"><button/);
  assert.match(today, /<div role="row"><div role="cell" aria-colspan=\{3\}><h3 className="oc-group"/, 'el título de grupo sigue siendo un encabezado, dentro de una fila');
});

test('Despachar: progreso como barra real y anuncio con el nombre de la tarea', () => {
  assert.match(focus, /className="gx-focus-progress" role="progressbar" aria-label="Avance al despachar" aria-valuemin=\{0\} aria-valuemax=\{list\.length\} aria-valuenow=\{index\}/);
  assert.doesNotMatch(focus, /gx-focus-progress" aria-hidden/);
  assert.match(focus, /className="gx-focus-count" aria-live="polite" aria-atomic="true">Tarea \{index \+ 1\} de \{list\.length\}<span className="sr-only">: \{recordName\(current, spec\)\}/);
});
