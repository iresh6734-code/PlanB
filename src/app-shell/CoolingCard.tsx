import { useEffect, useState } from 'react';
import type { AppState, CrmRecord, EntityName } from '../../shared/model.js';
import { api } from '../api.js';
import { recordName } from '../components.js';
import { madridDay } from '../task-display.js';
import { ErrorState, Skeleton } from '../ui/index.js';
import { coolingAccounts, COOLING_DAYS } from './cooling.js';
import { euros } from './deal-insights.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { recordListPath } from './useRecordList.js';

type Spec = NonNullable<AppState['spec']>;
type Read = { key: string; records: Record<'companies' | 'contacts' | 'deals' | 'tasks', CrmRecord[]>; complete: boolean } | { key: string; error: string };
const ENTITIES = ['companies', 'contacts', 'deals', 'tasks'] as const;
const THRESHOLDS = [14, COOLING_DAYS, 60];
const SHOWN = 5;

/** F6 · Inicio: empresas y clientes con algo abierto que llevan tiempo sin actividad y sin nada previsto.
 *  Lee la copia local por páginas (hasta 1.000 por tipo) y lo dice si no llegó a leerlo todo. */
export function CoolingCard({ spec, revision, onOpenRecord }: { spec: Spec; revision: string; onOpenRecord?: (record: CrmRecord) => void }) {
  const [read, setRead] = useState<Read | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [days, setDays] = useState(COOLING_DAYS);
  const key = revision + ':' + attempt;
  const usable = spec.entities.some(item => item.id === 'deals');
  useEffect(() => {
    if (!usable) return;
    const controller = new AbortController(), { signal } = controller;
    setRead(null);
    const present = ENTITIES.filter(entity => spec.entities.some(item => item.id === entity));
    Promise.all(present.map(entity => readPages((offset, limit, pageSignal) => api<ListPage>(recordListPath(entity as EntityName, '', offset, '', limit), { signal: pageSignal }), signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === entity })
      .then(result => [entity, result] as const)))
      .then(results => {
        if (signal.aborted) return;
        const records = { companies: [], contacts: [], deals: [], tasks: [] } as Record<(typeof ENTITIES)[number], CrmRecord[]>;
        for (const [entity, result] of results) records[entity] = result.records;
        setRead({ key, records, complete: results.every(([, result]) => result.complete) });
      })
      .catch(failure => { if (!signal.aborted) setRead({ key, error: failure instanceof Error ? failure.message : 'La consulta se interrumpió.' }); });
    return () => controller.abort();
  }, [usable, spec, key]);
  if (!usable) return null;
  const current = read?.key === key ? read : null;
  const today = madridDay(new Date());
  const list = current && 'records' in current ? coolingAccounts(spec, { accounts: [...current.records.companies, ...current.records.contacts], deals: current.records.deals, tasks: current.records.tasks }, today, days) : [];
  const total = list.reduce((sum, item) => sum + item.amount, 0);
  return <article className="oc-card gx-cool" aria-labelledby="gx-cool-title">
    <div className="oc-card-head"><h2 id="gx-cool-title">Clientes que se enfrían</h2>
      <div className="gx-cool-days" role="group" aria-label="Días sin actividad">{THRESHOLDS.map(value => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} días</button>)}</div>
    </div>
    {!current ? <Skeleton rows={2} label="Buscando clientes sin actividad en tu copia…" />
      : 'error' in current ? <ErrorState title="No se pudieron leer los clientes" onAction={() => setAttempt(value => value + 1)}>{current.error}</ErrorState>
      : !list.length ? <p className="oc-empty-line ui-empty ui-empty-ok">Nadie con una oportunidad abierta lleva más de {days} días sin actividad.</p>
      : <>
        <p className="gx-cool-sum"><strong>{list.length}</strong> con algo abierto y sin actividad{total ? <> · <strong>{euros(total)}</strong> en juego</> : null}</p>
        <ul className="oc-task-list gx-pipe-list gx-cool-list">{list.slice(0, SHOWN).map(item => <li key={item.record.entity + ':' + item.record.id}>
          <span className="oc-chip" data-tone={item.days === null || item.days > days * 2 ? 'danger' : 'warn'}>{item.days === null ? 'Sin tareas' : item.days + ' días'}</span>
          <div style={{ minWidth: 0 }}><strong title={recordName(item.record, spec)}>{recordName(item.record, spec)}</strong><span className="oc-due">{item.reason}</span></div>
          <span className="oc-due">{euros(item.amount)}</span>
          {onOpenRecord ? <button type="button" className="oc-small-button" onClick={() => onOpenRecord(item.record)} aria-label={'Abrir ' + recordName(item.record, spec)}>Abrir</button> : null}
        </li>)}</ul>
        {list.length > SHOWN ? <p className="gx-pipe-note">Y {list.length - SHOWN} más.</p> : null}
      </>}
    {current && 'records' in current ? <p className="gx-pipe-note">La actividad es la fecha de sus tareas: las de la empresa, las de sus clientes y las de sus oportunidades.{current.complete ? '' : ' No se leyó toda la copia: puede faltar alguno.'}</p> : null}
  </article>;
}
