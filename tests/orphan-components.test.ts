import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Built screens that nothing mounts yet. The list can only shrink: each entry names the
// super-plan-2 task that mounts it or removes it (docs/super-plan-2.md, Oleada 1).
const KNOWN_ORPHANS: Record<string, string> = {
  'src/RescueCapsule.tsx': 'E4 aplazada: necesita el servidor aparte del Modo Rescate (scripts/demo-rescue-room.ts)',
  'src/RescueRoom.tsx': 'E4 aplazada: necesita el servidor aparte del Modo Rescate (scripts/demo-rescue-room.ts)',
  'src/SourceReadingHistory.tsx': 'E3 aplazada: el diario de lecturas solo se llena leyendo proveedores externos',
  'src/SourceStatusRow.tsx': 'E3 aplazada: falta la ruta de estado y requiere lecturas de proveedores externos',
};

const ROOT = path.resolve('.');
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');
const noExt = (file: string) => file.replace(/\.(tsx?|mts|js|mjs)$/, '');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

function orphanComponents(): string[] {
  const files = walk(path.join(ROOT, 'src'));
  const reached = new Set<string>();
  const imports = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const file of files.filter(f => /\.(tsx?|mts)$/.test(f))) {
    for (const m of readFileSync(file, 'utf8').matchAll(imports)) reached.add(noExt(path.resolve(path.dirname(file), m[1]!)));
  }
  const pages = [...readdirSync(ROOT).filter(n => n.endsWith('.html')).map(n => path.join(ROOT, n)), ...files.filter(f => f.endsWith('.html'))];
  for (const page of pages) {
    for (const m of readFileSync(page, 'utf8').matchAll(/src=["']([^"']+\.tsx?)["']/g)) {
      const target = m[1]!.startsWith('/') ? path.join(ROOT, m[1]!) : path.resolve(path.dirname(page), m[1]!);
      reached.add(noExt(target));
    }
  }
  return files.filter(f => f.endsWith('.tsx') && !reached.has(noExt(f))).map(rel).sort();
}

test('E5: ningún componente nuevo queda construido sin montar', () => {
  const orphans = orphanComponents();
  const unexpected = orphans.filter(f => !(f in KNOWN_ORPHANS));
  assert.deepEqual(unexpected, [], 'Componentes sin importador: móntalos, bórralos o justifícalos en KNOWN_ORPHANS con su tarea');
});

test('E5: la lista de huérfanos conocidos solo encoge', () => {
  const orphans = new Set(orphanComponents());
  const stale = Object.keys(KNOWN_ORPHANS).filter(f => !orphans.has(f));
  assert.deepEqual(stale, [], 'Ya tienen importador o no existen: quítalos de KNOWN_ORPHANS');
});
