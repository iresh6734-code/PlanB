#!/usr/bin/env node
// Read-only audit of coordination/board.json: for every open task, whether its files are already
// in the branch. Writes coordination/reports/COPILOT-BOARD-AUDIT.md and never touches the board.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const board = JSON.parse(readFileSync(path.join(ROOT, 'coordination', 'board.json'), 'utf8'));
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
const tracked = new Set(git(['ls-files']).split('\n').map(s => s.trim()).filter(Boolean));
const dirty = new Set(git(['status', '--porcelain']).split('\n').filter(Boolean).map(l => l.slice(3).trim().replace(/^"|"$/g, '')));

const lastEvent = new Map();
for (const e of board.events ?? []) if (e.task) lastEvent.set(e.task, e);

const ORDER = ['working', 'blocked', 'ready', 'review'];
const LABEL = { working: 'En curso', blocked: 'Bloqueadas', ready: 'Listas para empezar', review: 'En revisión' };
const open = board.tasks.filter(t => ORDER.includes(t.status));

function trace(task) {
  const files = (task.files ?? []).filter(f => typeof f === 'string' && !f.includes('*'));
  const inBranch = files.filter(f => tracked.has(f)).length;
  const onDisk = files.filter(f => existsSync(path.join(ROOT, f))).length;
  const pending = files.filter(f => dirty.has(f)).length;
  return { total: files.length, inBranch, onDisk, pending };
}

function verdict(task, t) {
  const all = t.total > 0 && t.inBranch === t.total;
  const none = t.total > 0 && t.onDisk === 0;
  if (t.pending > 0) return 'Hay cambios sin commit en sus archivos: revisar antes de nada';
  if (task.status === 'review') return all ? 'Trabajo en la rama: aceptar tras revisión visual en casa' : none ? 'Sin archivos: cerrar como no entregada' : 'Entrega parcial: revisar qué falta';
  if (task.status === 'working') return all ? 'Archivos en la rama: confirmar si terminó y pasar a revisión' : 'Interrumpida: relanzar o cancelar';
  if (task.status === 'blocked') return 'Bloqueada: decidir si se desbloquea o se cancela';
  return all ? 'Ya existe en la rama: comprobar si sigue haciendo falta' : 'Sin empezar: relanzar solo si sigue en el plan';
}

const clip = (s, n) => { const v = String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const lines = [];
lines.push('# Parte del tablero de coordinación');
lines.push('');
lines.push('Generado por `node tools/board-audit.mjs` el ' + new Date().toISOString().slice(0, 10) + '. Solo lee `coordination/board.json` y git; **no cambia el tablero**, que es de los agentes.');
lines.push('');
lines.push('Columnas: archivos de la tarea que ya están en la rama / archivos declarados, y qué conviene hacer.');
lines.push('');
lines.push('## Resumen');
lines.push('');
lines.push('| Estado | Claude | Codex | Otros | Total |');
lines.push('|---|---|---|---|---|');
for (const s of ORDER) {
  const of = open.filter(t => t.status === s), n = a => of.filter(t => t.agent === a).length;
  lines.push('| ' + LABEL[s] + ' | ' + n('claude') + ' | ' + n('codex') + ' | ' + (of.length - n('claude') - n('codex')) + ' | ' + of.length + ' |');
}
const counts = {};
for (const task of open) { const v = verdict(task, trace(task)); counts[v] = (counts[v] ?? 0) + 1; }
lines.push('');
lines.push('| Qué conviene hacer | Tareas |');
lines.push('|---|---|');
for (const [v, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) lines.push('| ' + v + ' | ' + n + ' |');
for (const s of ORDER) {
  const of = open.filter(t => t.status === s).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!of.length) continue;
  lines.push('');
  lines.push('## ' + LABEL[s] + ' (' + of.length + ')');
  lines.push('');
  lines.push('| Tarea | Agente | Título | En la rama | Último movimiento | Qué hacer |');
  lines.push('|---|---|---|---|---|---|');
  for (const task of of) {
    const t = trace(task), ev = lastEvent.get(task.id);
    const last = ev ? ev.at.slice(0, 10) + ' · ' + ev.action : '—';
    const note = s === 'blocked' && task.note ? ' Nota: ' + clip(task.note, 90) : '';
    lines.push('| ' + task.id + ' | ' + task.agent + ' | ' + clip(task.title, 70) + ' | ' + t.inBranch + '/' + t.total + ' | ' + last + ' | ' + verdict(task, t) + note + ' |');
  }
}
lines.push('');
const out = path.join(ROOT, 'coordination', 'reports', 'COPILOT-BOARD-AUDIT.md');
writeFileSync(out, lines.join('\r\n'), 'utf8');
console.log('Escrito ' + path.relative(ROOT, out) + ' con ' + open.length + ' tareas abiertas.');
