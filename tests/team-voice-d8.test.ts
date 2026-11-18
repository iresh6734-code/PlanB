// CLAUDE-TEAM-D8 · El espacio de equipo no enseña botones que nunca funcionarán como única acción y habla como la App.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { permissions } from '../shared/team.js';

const team = fs.readFileSync('src/TeamApp.tsx', 'utf8');
const files = ['src/TeamApp.tsx', 'src/TeamCompanyHome.tsx', 'src/TeamContacts.tsx', 'src/TeamIntegrations.tsx', 'src/TeamAgentWorkspace.tsx', 'src/TeamSpaceCreate.tsx', 'src/CommercialWorkspace.tsx'];

test('sin permiso no se muestra el botón primario deshabilitado: se dice quién puede hacerlo', () => {
  for (const permission of ['jobs', 'devices', 'members']) {
    // Un selector que muestra el permiso de cada persona puede quedar de solo lectura; lo que no debe quedar es un botón
    // primario que nunca funcionará.
    assert.ok(!new RegExp('<button className="button primary" disabled=\\{busy\\|\\|!allowed\\(\'' + permission + '\'\\)').test(team), permission + ': el permiso ya no deshabilita un botón primario');
    assert.ok(team.includes("{allowed('" + permission + "')?"), permission + ': la acción solo aparece con permiso');
  }
  for (const note of ['Administración, Responsable o Comercial pueden comprobar la sincronización.', 'Administración, Responsable o Comercial pueden vincular una copia local.', 'Solo Administración puede invitar a personas.']) assert.ok(team.includes('<NotAllowed>' + note + '</NotAllowed>'), note);
  assert.ok(team.includes('Conecta primero el portal de HubSpot para poder capturar.') && team.includes('Administración o Responsable pueden capturar desde HubSpot.'), 'Capturar en lectura dice por qué no se puede');
});

test('las notas nombran a quien de verdad tiene el permiso (shared/team.ts)', () => {
  const who = (permission: string) => (Object.entries(permissions) as [string, readonly string[]][]).filter(([, list]) => list.includes(permission)).map(([role]) => role).sort();
  assert.deepEqual(who('jobs'), ['admin', 'manager', 'sales']);
  assert.deepEqual(who('devices'), ['admin', 'manager', 'sales']);
  assert.deepEqual(who('members'), ['admin']);
  assert.deepEqual(who('connections'), ['admin', 'manager']);
});

test('voz de la App (docs/voz.md): lo inventado se llama «datos de prueba»', () => {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const retired of [/\bfictici[oa]s?\b/i, /Ensayo local/, /\bLa demo\b/]) assert.doesNotMatch(source, retired, file + ' usa ' + retired);
  }
  assert.ok(team.includes("config.demo?'Datos de prueba'"), 'el pie del menú lo dice igual que la App');
});
