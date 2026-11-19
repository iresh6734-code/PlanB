import { useEffect } from 'react';
import type { EntityName } from '../../shared/model.js';
import type { PageId } from './session.js';

export const SHORTCUTS: [string, string][] = [['Ctrl K', 'Buscar en toda la copia'], ['Ctrl J', 'Órdenes: ir a un apartado o lanzar una acción escribiendo'], ['Alt ← →', 'Mover la oportunidad enfocada a la etapa anterior o siguiente'], ['/', 'Buscar en la lista que estás viendo'], ['N', 'Nuevo registro (en Clientes, Empresas, Oportunidades o Tareas)'], ['↑ ↓', 'Moverse por las filas de una tabla, la cola de Hoy o una columna del tablero'], ['← →', 'Pasar a la columna vecina del tablero de oportunidades'], ['G  I', 'Ir a Inicio'], ['G  H', 'Ir a Hoy'], ['G  C · E · O · T', 'Clientes · Empresas · Oportunidades · Tareas'], ['G  M', 'Ir a Cambios'], ['G  D', 'Despachar las tareas vencidas, una a una'], ['G  B', 'Barrido de la mañana: vencidas y de hoy'], ['G  R', 'Ir al Radar (Laboratorio, con datos de prueba)'], ['G  F', 'Comprobar una fecha (Laboratorio, con datos de prueba)'], ['G  N', 'Ir a Continuidad'], ['G  X', 'Ir a Exportar'], ['?', 'Ver estos atajos'], ['Esc', 'Cerrar la ficha o la ventana abierta']];

type Options = {
  /** Sesión abierta y estado cargado. */ active: boolean; ready: boolean; runtime: boolean;
  /** Laboratorio visible (copia de datos de prueba): sin él, G R y G F no hacen nada. */ lab: boolean;
  /** Hay una ficha abierta: los atajos no actúan. */ blocked: boolean; onRecords: boolean;
  openEntity: (entity: EntityName) => void; go: (page: PageId) => void; openHelp: () => void; openSearch: () => void; newRecord: () => void; openCommands: () => void;
  /** Abre el despacho de tareas (G D vencidas, G B barrido con las de hoy). */ openFocus?: (scope: 'overdue' | 'sweep') => void;
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
      const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp', step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      const rowList = target?.classList?.contains('record-link') ? '.table-container .record-link' : target?.classList?.contains('lop-open-task') ? '.lop-tasks .lop-open-task' : null;
      if (rowList && vertical) {
        const links = [...document.querySelectorAll<HTMLElement>(rowList)], next = links[links.indexOf(target!) + step];
        if (next) { event.preventDefault(); next.focus(); }
        return;
      }
      if (target?.classList?.contains('deal-card') && (vertical || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const column = target.closest('.kanban-column'), cards = (el: Element | null) => el ? [...el.querySelectorAll<HTMLElement>('.deal-card')] : [];
        const at = cards(column).indexOf(target);
        let next: HTMLElement | undefined;
        if (vertical) next = cards(column)[at + step];
        else {
          // La columna vecina con fichas, a la misma altura o a la última ficha si es más corta; las vacías se saltan.
          const columns = [...document.querySelectorAll('.kanban-column')];
          for (let index = columns.indexOf(column!) + step; index >= 0 && index < columns.length && !next; index += step) { const list = cards(columns[index]); next = list[Math.min(at, list.length - 1)]; }
        }
        if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
        return;
      }
      const letter = event.key.toLowerCase();
      if (Date.now() - prefix < 1500) {
        prefix = 0;
        const entity = ({ c: 'contacts', e: 'companies', o: 'deals', t: 'tasks' } as Record<string, EntityName>)[letter];
        const go = ({ i: 'home', h: 'today', m: 'changes', r: 'radar', f: 'date-check', n: 'continuity', x: 'export' } as Record<string, PageId>)[letter];
        const focus = ({ d: 'overdue', b: 'sweep' } as const)[letter as 'd' | 'b'];
        if (focus && ready && options.openFocus) { event.preventDefault(); options.openFocus(focus); }
        else if (entity && ready) { event.preventDefault(); options.openEntity(entity); }
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
