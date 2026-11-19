import { useEffect } from 'react';
import type { EntityName } from '../../shared/model.js';
import type { PageId } from './session.js';

export const SHORTCUTS: [string, string][] = [['Ctrl K', 'Buscar en toda la copia'], ['Ctrl J', 'Órdenes: ir a un apartado o lanzar una acción escribiendo'], ['Alt ← →', 'Mover la oportunidad enfocada a la etapa anterior o siguiente'], ['/', 'Buscar en la lista que estás viendo'], ['N', 'Nuevo registro (en Clientes, Empresas, Oportunidades o Tareas)'], ['↑ ↓', 'Moverse por las filas de una tabla'], ['G  I', 'Ir a Inicio'], ['G  H', 'Ir a Hoy'], ['G  C · E · O · T', 'Clientes · Empresas · Oportunidades · Tareas'], ['G  M', 'Ir a Cambios'], ['G  R', 'Ir al Radar (Laboratorio, con datos de prueba)'], ['G  F', 'Comprobar una fecha (Laboratorio, con datos de prueba)'], ['G  N', 'Ir a Continuidad'], ['G  X', 'Ir a Exportar'], ['?', 'Ver estos atajos'], ['Esc', 'Cerrar la ficha o la ventana abierta']];

type Options = {
  /** Sesión abierta y estado cargado. */ active: boolean; ready: boolean; runtime: boolean;
  /** Laboratorio visible (copia de datos de prueba): sin él, G R y G F no hacen nada. */ lab: boolean;
  /** Hay una ficha abierta: los atajos no actúan. */ blocked: boolean; onRecords: boolean;
  openEntity: (entity: EntityName) => void; go: (page: PageId) => void; openHelp: () => void; openSearch: () => void; newRecord: () => void; openCommands: () => void;
};

/** Atajos de teclado de la App local. No actúan mientras se escribe en un campo, con una ventana abierta o con una ficha abierta. */
export function useShortcuts(options: Options) {
  const { active, ready, runtime, lab, blocked, onRecords } = options;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let prefix = 0;
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'j' && active && !blocked && !document.querySelector('[role="dialog"]')) { event.preventDefault(); options.openCommands(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || !active) return;
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (blocked || document.querySelector('[role="dialog"]')) return;
      if (target?.classList?.contains('record-link') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        const links = [...document.querySelectorAll<HTMLElement>('.table-container .record-link')], next = links[links.indexOf(target) + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) { event.preventDefault(); next.focus(); }
        return;
      }
      const letter = event.key.toLowerCase();
      if (Date.now() - prefix < 1500) {
        prefix = 0;
        const entity = ({ c: 'contacts', e: 'companies', o: 'deals', t: 'tasks' } as Record<string, EntityName>)[letter];
        const go = ({ i: 'home', h: 'today', m: 'changes', r: 'radar', f: 'date-check', n: 'continuity', x: 'export' } as Record<string, PageId>)[letter];
        if (entity && ready) { event.preventDefault(); options.openEntity(entity); }
        else if (go && !(runtime && go === 'today') && !(!lab && (go === 'radar' || go === 'date-check')) && (ready || go === 'home' || go === 'continuity' || go === 'today')) { event.preventDefault(); options.go(go); }
        return;
      }
      if (letter === 'g') { prefix = Date.now(); return; }
      if (event.key === '?') { event.preventDefault(); options.openHelp(); return; }
      if (event.key === '/') { event.preventDefault(); const field = document.querySelector<HTMLInputElement>('.gx-records-head input, .lop-search input'); if (field) field.focus(); else if (ready) options.openSearch(); return; }
      if (letter === 'n' && onRecords && ready) { event.preventDefault(); options.newRecord(); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [active, ready, runtime, lab, blocked, onRecords]);
}
