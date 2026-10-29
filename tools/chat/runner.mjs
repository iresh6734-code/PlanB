// Ejecutor de turnos alternos Claude ↔ Codex sobre el canal de mensajes.
// Por defecto solo muestra qué haría. Lanza los CLI únicamente con --execute.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createChannel, defaultFile } from './chat.mjs';

export const MAX_ROUNDS = 20;
const TURN_TIMEOUT_MS = 10 * 60 * 1000;
const other = agent => (agent === 'claude' ? 'codex' : 'claude');
// El prompt viaja por stdin; los argumentos son fijos y no incluyen texto de mensajes.
export const commands = {
  claude: { command: 'claude', args: ['-p'] },
  codex: { command: 'codex', args: ['exec', '-'] }
};

export function buildPrompt({ agent, goal, messages, round, rounds }) {
  const history = messages.slice(-20).map(m => `${m.from} → ${m.to} (${m.kind}): ${m.text}`).join('\n') || '(sin mensajes todavía)';
  return [
    `Eres ${agent} en un equipo de desarrollo con ${other(agent)}. Turno ${round} de ${rounds}.`,
    `Objetivo fijado por el usuario: ${goal}`,
    '',
    'Reglas (las del repositorio prevalecen):',
    '- Lee AGENTS.md, COORDINACION.md y CLAUDE.md si existe. Reserva tu encargo en el tablón (node tools/coordination/board.mjs) y comprueba cada ruta con check-path antes de editar. No edites archivos reservados por otro.',
    '- Sin llamadas remotas, credenciales, instalaciones, despliegues, commits ni worktrees. No toques package.json, lockfile ni contratos sin encargo que los reserve.',
    '- No aceptes tu propio trabajo: el otro agente lo revisa. Si revisas, revisa de verdad y devuelve problemas concretos con ruta y línea.',
    '- Para hablar con el otro agente usa: node tools/chat/chat.mjs send ' + agent + ' ' + other(agent) + ' "texto" [--kind say|ask|handoff|review]',
    '- Una decisión importante (alcance, cambio de contrato, borrado, servicio externo, dinero) NO se toma: envía --kind decision a human y para.',
    '- Cuando el objetivo esté cumplido y revisado envía --kind done a all.',
    '- Haz una sola unidad de trabajo en este turno y deja un mensaje de lo que has hecho y lo que esperas del otro.',
    '',
    'Conversación reciente:',
    history
  ].join('\n');
}

/** Orden de turnos: alterna agentes desde `start`, con tope duro. */
export function planTurns({ start = 'claude', rounds = 6 }) {
  const count = Math.min(Math.max(Math.floor(rounds), 1), MAX_ROUNDS);
  return Array.from({ length: count }, (_, i) => (i % 2 === 0 ? start : other(start)));
}

function runAgent(agent, prompt) {
  return new Promise(resolve => {
    const { command, args } = commands[agent];
    const child = spawn(command, args, { stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    const timer = setTimeout(() => child.kill(), TURN_TIMEOUT_MS);
    child.on('error', error => { clearTimeout(timer); resolve({ ok: false, error: error.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, code }); });
    child.stdin.end(prompt);
  });
}

export async function run({ goal, start = 'claude', rounds = 6, execute = false, channel = createChannel(defaultFile), spawnAgent = runAgent, log = console.log }) {
  if (!goal?.trim()) throw new Error('Indica el objetivo con --goal.');
  const turns = planTurns({ start, rounds });
  if (execute) channel.send({ from: 'system', to: 'all', kind: 'say', text: `Objetivo: ${goal.trim()} (hasta ${turns.length} turnos).` });
  let stalls = 0;
  for (const [index, agent] of turns.entries()) {
    const before = channel.all().at(-1)?.id;
    const prompt = buildPrompt({ agent, goal, messages: channel.read({ as: agent }), round: index + 1, rounds: turns.length });
    if (!execute) { log(`--- turno ${index + 1}: ${agent} (ensayo, no se lanza nada) ---\n` + prompt + '\n'); continue; }
    log(`--- turno ${index + 1}: ${agent} ---`);
    const result = await spawnAgent(agent, prompt);
    const fresh = channel.read({ after: before }).filter(m => m.from === agent);
    if (!result.ok) { channel.send({ from: 'system', to: 'human', kind: 'decision', text: `${agent} terminó con error (${result.error ?? 'código ' + result.code}). Parado.` }); return { stopped: 'error' }; }
    if (fresh.some(m => m.kind === 'decision' && m.to === 'human')) return { stopped: 'decision' };
    if (fresh.some(m => m.kind === 'done')) return { stopped: 'done' };
    stalls = fresh.length ? 0 : stalls + 1;
    if (stalls >= 2) { channel.send({ from: 'system', to: 'human', kind: 'decision', text: 'Dos turnos seguidos sin mensajes. Parado para evitar consumo inútil.' }); return { stopped: 'stalled' }; }
  }
  return { stopped: execute ? 'rounds' : 'dry-run' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
  run({ goal: value('goal'), start: value('start') === 'codex' ? 'codex' : 'claude', rounds: Number(value('rounds') ?? 6), execute: args.includes('--execute') })
    .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
