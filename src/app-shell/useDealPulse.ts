import { useEffect, useState } from 'react';
import type { AppState } from '../../shared/model.js';
import { api } from '../api.js';
import { dealPulse, type DealPulse } from './deal-insights.js';
import { doneOption } from './focus.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { dealTaskField } from './saved-views.js';
import { recordListPath } from './useRecordList.js';

/**
 * Tareas enlazadas a cada oportunidad (V5), para «Sin próximo paso» y «Paradas 14 días». Lee las tareas por páginas
 * (hasta 1000) solo con Oportunidades abierta. Si no pudo leerlas todas, devuelve null: mejor no ofrecer la vista que
 * decir «sin próximo paso» de una oportunidad cuya tarea quedó sin leer.
 */
export function useDealPulse({ active, spec, revision }: { active: boolean; spec: AppState['spec'] | null | undefined; revision: number }): Map<string, DealPulse> | null {
  const [pulse, setPulse] = useState<Map<string, DealPulse> | null>(null);
  const link = spec ? dealTaskField(spec) : null;
  useEffect(() => {
    if (!active || !spec || !link) { setPulse(null); return; }
    const controller = new AbortController(), { signal } = controller;
    const dueKey = spec.roles?.dueDate ?? 'due_date', done = doneOption(spec);
    readPages((offset, limit, pageSignal) => api<ListPage>(recordListPath('tasks', '', offset, '', limit), { signal: pageSignal }), signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === 'tasks' })
      .then(read => { if (!signal.aborted) setPulse(read.complete ? dealPulse(read.records, { dealKey: link.key, dueKey, isDone: task => !!done && String(task.values[done.key] ?? '') === done.id }) : null); })
      .catch(() => { if (!signal.aborted) setPulse(null); });
    return () => controller.abort();
  }, [active, spec, link?.key, revision]);
  return pulse;
}
