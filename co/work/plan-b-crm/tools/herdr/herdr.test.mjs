import test from 'node:test';
import assert from 'node:assert/strict';
import { conceptArgs, localEnv, modelEnv, terminalName, scratch } from './planb.mjs';

test('la consulta conceptual no habilita herramientas, MCP, hooks o persistencia', () => {
  const args = conceptArgs();
  const value = flag => args[args.indexOf(flag)+1];
  assert.equal(value('--tools'), '');
  assert.equal(value('--setting-sources'), '');
  assert.deepEqual(JSON.parse(value('--mcp-config')), { mcpServers: {} });
  assert.equal(JSON.parse(value('--settings')).disableAllHooks, true);
  for (const flag of ['--strict-mcp-config','--no-chrome','--no-session-persistence']) assert.ok(args.includes(flag));
  assert.equal(value('--max-budget-usd'), '0.25');
});

test('el modelo no hereda claves, endpoints personalizados ni instrucciones de otra sesion', () => {
  const env = modelEnv({ Path:'local', USERPROFILE:'current', ANTHROPIC_API_KEY:'fiction',
    ANTHROPIC_BASE_URL:'https://invalid.example', HC_SOCKET:'foreign', CLAUDECODE:'foreign' });
  assert.deepEqual(env, { Path:'local', USERPROFILE:'current', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1' });
});

test('Herdr usa estado/config propios y elimina el endpoint y parentesco heredados', () => {
  const source = { HC_SOCKET:'foreign', HC_TERMINAL_ID:'t1', HC_MACHINE:'original', HC_SESSION:'other', Path:'local' };
  const env = localEnv(source);
  assert.equal(env.HC_SESSION, 'planb');
  for (const key of ['HC_SOCKET','HC_TERMINAL_ID','HC_MACHINE']) assert.equal(env[key], undefined);
  assert.ok(env.XDG_STATE_HOME.startsWith(scratch));
  assert.equal(source.HC_SESSION, 'other');
});

test('lectura/espera no admiten terminales ajenas o direcciones remotas', () => {
  assert.equal(terminalName('planb-tests'), 'planb-tests');
  for (const value of ['t1','original/t1','review','planb-a;exit',undefined]) assert.throws(() => terminalName(value));
});
