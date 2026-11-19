import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const self = fileURLToPath(import.meta.url);
export const root = path.resolve(path.dirname(self), '../..');
export const scratch = path.join(root, 'tests/.tmp/herdr-planb');
const programs = path.join(os.homedir(), 'AppData/Local/Programs');
export const hc = path.join(programs, 'herdr-core/hc.exe');
export const app = path.join(programs, 'herdr-app/herdr-app.exe');
const claude = path.join(os.homedir(), 'AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe');

export function localEnv(source = process.env) {
  const env = { ...source, HC_SESSION: 'planb',
    XDG_CONFIG_HOME: path.join(scratch, 'config'),
    XDG_STATE_HOME: path.join(scratch, 'state'),
    HERDR_APP_HOME: path.join(scratch, 'app') };
  // Never inherit another terminal's endpoint, parent or remote target.
  for (const key of ['HC_SOCKET', 'HC_TERMINAL_ID', 'HC_MACHINE']) delete env[key];
  return env;
}

export function conceptArgs() {
  return ['-p', '--output-format', 'stream-json', '--verbose', '--tools', '',
    '--permission-mode', 'dontAsk', '--setting-sources', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--settings', '{"disableAllHooks":true,"disableClaudeAiConnectors":true,"autoMemoryEnabled":false}',
    '--disable-slash-commands', '--no-chrome', '--no-session-persistence', '--max-budget-usd', '0.25'];
}

export function modelEnv(source = process.env) {
  const allowed = new Set(['systemroot','windir','comspec','pathext','path','temp','tmp',
    'userprofile','homedrive','homepath','appdata','localappdata','programfiles',
    'programfiles(x86)','programdata','os','processor_architecture','number_of_processors']);
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toLowerCase())));
  return { ...env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

function cli(args) {
  const result = spawnSync(hc, args, { cwd: root, env: localEnv(), windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function boardView() {
  let last = '';
  const render = () => {
    try {
      const board = JSON.parse(fs.readFileSync(path.join(root, 'coordination/board.json'), 'utf8'));
      if (String(board.revision) === last) return;
      last = String(board.revision);
      console.log(`\nPLAN B | Tablon revision ${last} | ${new Date().toISOString()}`);
      console.log('Estado administrativo; working NO demuestra un modelo activo. Vista de solo lectura.');
      for (const task of board.tasks.filter(t => t.status !== 'done')) {
        console.log(`${task.id.padEnd(34)} ${task.agent.padEnd(7)} ${task.status.padEnd(8)} ${task.reserved ? 'reservada' : 'libre'}`);
      }
    } catch (error) { console.error('No se pudo leer el tablon:', error.message); }
  };
  render();
  setInterval(render, 3000);
}

function echo() {
  process.stdout.write('\x1b]7501;state=idle:app=planb-smoke\x1b\\');
  console.log('PLANB_READY');
  readline.createInterface({ input: process.stdin }).on('line', line => {
    console.log(`PLANB_ACK:${line}`);
    process.stdout.write('\x1b]7501;state=done:app=planb-smoke\x1b\\');
  });
}

async function concept() {
  if (!fs.existsSync(claude)) throw Error('Claude Code nativo no encontrado; no se instala ni autentica automaticamente.');
  fs.mkdirSync(scratch, { recursive: true });
  const prompt = 'Consulta conceptual de Codex a Claude autorizada por el usuario. Estamos evaluando Herdr como terminal persistente para coordinar Codex y Claude. Ya existe un tablon de tareas con reservas de archivos exactos y revision por hashes. Sin leer archivos, usar herramientas o iniciar agentes: responde en espanol, en menos de 180 palabras, con tres reglas para combinar ambos mecanismos y una limitacion. No afirmes haber ejecutado pruebas ni estar trabajando en el proyecto. No se adjuntan fuentes ni datos privados.';
  const child = spawn(claude, conceptArgs(), { cwd: scratch, env: modelEnv(), windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  let buffer = '', response = '', result = null, failure = null, bytes = 0;
  const timer = setTimeout(() => { failure = 'Limite de 140 segundos; no se reintenta.'; child.kill(); }, 140000);
  const consume = line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'system' && event.subtype === 'init') {
      if (event.tools?.length || event.mcp_servers?.length) { failure = 'Herramientas/MCP inesperados'; child.kill(); }
      else console.log('Claude CLI iniciada sin herramientas; esperando respuesta real.');
    }
    if (event.type === 'assistant') response += (event.message?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (event.type === 'result') result = event;
  };
  child.stdout.on('data', data => {
    bytes += data.length;
    if (bytes > 500000) { failure = 'Salida excedida'; child.kill(); return; }
    buffer += data;
    let n;
    while ((n = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0,n)); buffer = buffer.slice(n+1); }
  });
  // Errors can contain account details; retain only the exit code and controlled reason.
  child.stderr.on('data', () => {});
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  await new Promise(resolve => {
    child.once('error', error => { failure = `No se pudo iniciar CLI (${error.code ?? 'error'})`; });
    child.once('close', code => {
      clearTimeout(timer);
      if (buffer.trim()) consume(buffer);
      response ||= typeof result?.result === 'string' ? result.result : '';
      const ok = !failure && code === 0 && result?.type === 'result' && !result.is_error && !!response;
      const evidence = { at: new Date().toISOString(), ok, exitCode: code,
        failure, response, costUsdReported: result?.total_cost_usd ?? null,
        sourceFilesSent: [], toolsEnabled: false, mcpEnabled: false };
      fs.writeFileSync(path.join(scratch, 'claude-concept.json'), JSON.stringify(evidence,null,2)+'\n');
      console.log(response || failure || 'Sin respuesta completa; comprobar autenticacion propia desde la CLI.');
      console.log(JSON.stringify({ ok, exitCode: code, costUsdReported: evidence.costUsdReported }));
      process.exitCode = ok ? 0 : 1;
      resolve();
    });
  });
}

export function terminalName(value) {
  if (!/^planb-[a-z0-9_-]{1,25}$/.test(value ?? '')) throw Error('Usa un nombre planb-... de esta sesion.');
  return value;
}

async function main([command, ...args]) {
  if (command === '_board') return boardView();
  if (command === '_echo') return echo();
  if (command === '_concept') return concept();
  if (command === 'status') return cli(['ls', '--all']);
  if (command === 'board') return cli(['run','--bg','--name','planb-board','--cwd',root,process.execPath,self,'_board']);
  if (command === 'test') return cli(['run','--bg','--name','planb-tests','--cwd',root,process.execPath,'--test','tools/coordination/core.test.mjs','tools/herdr/herdr.test.mjs']);
  if (command === 'smoke') return cli(['run','--bg','--name','planb-smoke','--cwd',scratch,process.execPath,self,'_echo']);
  if (command === 'claude-concept') return cli(['run','--bg','--name','planb-claude-concept','--cwd',scratch,process.execPath,self,'_concept']);
  if (command === 'read') return cli(['read',terminalName(args[0]),'--lines','120']);
  if (command === 'wait') return cli(['wait',terminalName(args[0]),'--timeout','45']);
  if (command === 'send') {
    if (args[0] !== 'planb-smoke' || args.length !== 2) throw Error('send solo admite planb-smoke y un texto de prueba.');
    return cli(['send',args[0],args[1]]);
  }
  throw Error('Uso: node tools/herdr/planb.mjs status|board|test|smoke|claude-concept|read NOMBRE|wait NOMBRE|send planb-smoke TEXTO');
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  fs.mkdirSync(scratch, { recursive: true });
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
