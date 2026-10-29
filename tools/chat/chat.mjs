// Canal de conversación entre agentes de desarrollo (Codex, Claude) y el usuario.
// Solo transporta mensajes: las reservas y entregas siguen en el tablón de coordination/.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PARTICIPANTS = ['claude', 'codex', 'human', 'system'];
export const RECIPIENTS = ['claude', 'codex', 'human', 'all'];
export const KINDS = ['say', 'ask', 'handoff', 'review', 'decision', 'done'];
export const MAX_TEXT = 4000;

export function createChannel(file) {
  function send({ from, to = 'all', kind = 'say', text }) {
    if (!PARTICIPANTS.includes(from)) throw new Error('Remitente no válido: ' + from);
    if (!RECIPIENTS.includes(to)) throw new Error('Destinatario no válido: ' + to);
    if (!KINDS.includes(kind)) throw new Error('Tipo no válido: ' + kind);
    if (typeof text !== 'string' || !text.trim()) throw new Error('El mensaje está vacío.');
    if (text.length > MAX_TEXT) throw new Error('El mensaje supera ' + MAX_TEXT + ' caracteres.');
    const message = { id: randomUUID(), at: new Date().toISOString(), from, to, kind, text: text.trim() };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Una sola línea por escritura con O_APPEND: dos procesos no mezclan mensajes.
    fs.appendFileSync(file, JSON.stringify(message) + '\n', { flag: 'a' });
    return message;
  }
  function all() {
    if (!fs.existsSync(file)) return [];
    const messages = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const value = JSON.parse(line); if (value && typeof value.id === 'string' && PARTICIPANTS.includes(value.from)) messages.push(value); } catch { /* línea dañada: se ignora */ }
    }
    return messages;
  }
  /** Mensajes posteriores a `after` (id), dirigidos a `as` o a todos. Sin `as`, devuelve todos. */
  function read({ as, after } = {}) {
    let messages = all();
    if (after) { const index = messages.findIndex(m => m.id === after); if (index >= 0) messages = messages.slice(index + 1); }
    return as ? messages.filter(m => m.to === 'all' || m.to === as || m.from === as) : messages;
  }
  return { send, read, all };
}

export const defaultFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../coordination/chat/general.jsonl');

const format = m => `[${m.at.slice(11, 16)}] ${m.from} → ${m.to} (${m.kind}): ${m.text}`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2), channel = createChannel(defaultFile);
  const flag = name => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    if (command === 'send') {
      const [from, to, ...words] = rest.filter((_, i) => !(rest[i - 1]?.startsWith('--') || rest[i]?.startsWith('--')));
      const message = channel.send({ from, to, kind: flag('kind') ?? 'say', text: words.join(' ') });
      console.log(JSON.stringify({ sent: message.id }));
    } else if (command === 'read') {
      for (const m of channel.read({ as: flag('as'), after: flag('after') })) console.log(flag('json') === undefined ? format(m) : JSON.stringify(m));
    } else if (command === 'tail') {
      let last = channel.all().at(-1)?.id;
      console.error('Escuchando ' + defaultFile + ' (Ctrl-C para salir)');
      setInterval(() => { for (const m of channel.read({ after: last })) { console.log(format(m)); last = m.id; } }, 1500);
    } else {
      console.error('Uso: send DE PARA texto [--kind say|ask|handoff|review|decision|done] | read [--as AGENTE] [--after ID] | tail');
      process.exitCode = 2;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
