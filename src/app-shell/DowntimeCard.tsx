import { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import type { AppSpec } from '../../shared/model.js';
import { cleanDowntime, dealsClosing, DOWNTIME_LIMITS, downtimeCost, formatEuros, formatHours } from '../../shared/downtime-cost.js';
import { api } from '../api.js';
import { dueDay, madridDay } from '../task-display.js';
import { closeFieldFor, shiftDay } from './agenda-grid.js';
import { stageKind } from './deal-insights.js';
import { BOARD_MAX_PAGES, readPages, type ListPage } from './pager.js';
import { recordListPath } from './useRecordList.js';

/**
 * N3 · «¿Cuánto costaría parar?» dentro de «Si HubSpot cae ahora»: comerciales × horas × coste por hora, con las
 * cifras que escribe la persona (solo se guardan en este navegador), y los cierres previstos de la copia en ese tiempo.
 * La copia se lee únicamente al abrir el desplegable.
 */
type Key = 'sellers' | 'hours' | 'hourlyCost';
type Deal = { close: string | null; open: boolean; amount: number | null };
const STORE = 'planb.downtime.v1';
const FIELDS: readonly { id: Key; label: string; step: number }[] = [
  { id: 'sellers', label: 'Comerciales', step: 1 },
  { id: 'hours', label: 'Horas sin CRM', step: 1 },
  { id: 'hourlyCost', label: '€ por hora', step: 5 },
];
function stored(): Record<Key, string> {
  let saved: unknown = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { /* preferencia ilegible: valores iniciales */ }
  const clean = cleanDowntime(saved && typeof saved === 'object' ? saved as Record<string, unknown> : {});
  return { sellers: String(clean.sellers), hours: String(clean.hours), hourlyCost: String(clean.hourlyCost) };
}
const amountOf = (value: unknown) => { const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(number) ? number : null; };

export function DowntimeCard({ spec, revision }: { spec: AppSpec | null; revision: string }) {
  const [raw, setRaw] = useState(stored);
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<{ key: string; list: Deal[]; complete: boolean } | null>(null);
  const figures = useMemo(() => cleanDowntime(raw), [raw]);
  const cost = downtimeCost(figures);
  const close = spec ? closeFieldFor(spec) : null;
  const canRead = !!spec && !!close && spec.entities.some(entity => entity.id === 'deals');

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ sellers: figures.sellers, hours: figures.hours, hourlyCost: figures.hourlyCost })); } catch { /* sin almacenamiento: el cálculo sigue */ } }, [figures.sellers, figures.hours, figures.hourlyCost]);
  useEffect(() => {
    if (!open || !canRead || !spec || !close || deals?.key === revision) return;
    const controller = new AbortController();
    const stages = new Map(spec.stages.map(stage => [stage.id, stage])), stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
    readPages((offset, limit, signal) => api<ListPage>(recordListPath('deals', '', offset, '', limit), { signal }), controller.signal, { maxPages: BOARD_MAX_PAGES, accept: record => record.entity === 'deals' })
      .then(read => {
        if (controller.signal.aborted) return;
        const list = read.records.map(record => ({ close: dueDay(record.values[close.key]), open: stageKind(stages.get(String(record.values[stageKey] ?? ''))) === 'open', amount: amountOf(record.values[amountKey]) }));
        setDeals({ key: revision, list, complete: read.complete });
      })
      .catch(() => { if (!controller.signal.aborted) setDeals({ key: revision, list: [], complete: false }); });
    return () => controller.abort();
  }, [open, canRead, spec, close, revision, deals?.key]);

  const days = Math.max(1, Math.ceil(figures.hours / 24)), today = madridDay(new Date());
  const closes = deals?.key === revision ? dealsClosing(deals.list, today, shiftDay(today, days - 1)) : null;
  return <details className="ct-cost" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Calculator size={15} aria-hidden="true" />¿Cuánto costaría parar sin copia?</summary>
    <div className="ct-cost-body">
      <div className="ct-cost-fields">{FIELDS.map(field => { const limit = DOWNTIME_LIMITS[field.id]; return <label key={field.id}><span>{field.label}</span>
        <input type="number" inputMode="decimal" min={limit.min} max={limit.max} step={field.step} value={raw[field.id]} onChange={event => { const value = event.currentTarget.value; setRaw(previous => ({ ...previous, [field.id]: value })); }} /></label>; })}</div>
      <dl className="ct-cost-result">
        <div><dt>Trabajo parado</dt><dd>{formatHours(cost.teamHours)}</dd></div>
        <div><dt>Coste estimado</dt><dd>{formatEuros(cost.teamCost)}</dd></div>
        {canRead ? <div><dt>{days === 1 ? 'Cierres previstos hoy' : 'Cierres en ' + days + ' días'}</dt><dd>{closes ? <>{closes.count}{closes.amount ? <small>{formatEuros(closes.amount)}</small> : null}</> : '…'}</dd></div> : null}
      </dl>
      <p className="helper">Orientativo y con tus cifras; solo se guardan en este navegador.{closes && deals && !deals.complete ? ' Los cierres cuentan solo las oportunidades leídas.' : ''} Con Plan B ese tiempo se trabaja sobre la copia.</p>
    </div>
  </details>;
}
