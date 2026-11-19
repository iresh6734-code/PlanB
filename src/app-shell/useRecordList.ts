// Estado y carga de la lista de registros de la App local (mejora B2 del informe; CLAUDE-RECORD-LIST, 17/11/2026).
// Antes vivía repartido por App.tsx (ocho estados, un efecto y el reinicio de openEntity). Dos piezas, porque App
// declara el estado arriba y solo puede cargar cuando ya conoce la sesión y la revisión de datos.
import { useCallback, useEffect, useState } from 'react';
import type { CrmRecord, EntityName } from '../../shared/model.js';
import { api } from '../api.js';

export const RECORD_PAGE_SIZE = 50;

/** Orden y filtro rápido que resuelve el servidor sobre todos los registros, no solo la página (V1). */
export type RecordListView = { sort: string; filters: Record<string, string>; facet: string };
export const EMPTY_LIST_VIEW: RecordListView = { sort: '', filters: {}, facet: '' };

/** Dirección de la consulta de una página de registros. Lógica pura. Sin vista, la misma dirección de siempre. */
export function recordListPath(entity: EntityName, query: string, offset: number, pipeline: string, limit = RECORD_PAGE_SIZE, view: RecordListView = EMPTY_LIST_VIEW) {
  const extra = (view.sort ? '&sort=' + encodeURIComponent(view.sort) : '') + (view.facet ? '&facet=' + encodeURIComponent(view.facet) : '')
    + Object.entries(view.filters).map(([key, value]) => '&f.' + encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('');
  return '/v2/records/' + entity + '?q=' + encodeURIComponent(query) + '&offset=' + offset + '&limit=' + limit + '&pipeline=' + encodeURIComponent(pipeline) + extra;
}

/** Clave estable de una vista para las dependencias del efecto de carga. */
export const viewKey = (view: RecordListView) => view.sort + '|' + view.facet + '|' + Object.entries(view.filters).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + '=' + value).join('&');

/** Espera antes de buscar: inmediata sin texto, breve mientras se escribe. */
export const searchDelay = (query: string) => (query ? 180 : 0);

export type RecordList = ReturnType<typeof useRecordListState>;

/** Estado de la lista: búsqueda, página, embudo, vista del servidor, filas visibles, registros conocidos (filas + relacionados) y carga. */
export function useRecordListState() {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [pipeline, setPipeline] = useState('');
  const [view, setViewState] = useState<RecordListView>(EMPTY_LIST_VIEW), [facets, setFacets] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<CrmRecord[]>([]), [records, setRecords] = useState<CrmRecord[]>([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  /** Cambia la vista solo si cambia de verdad (evita volver a pedir la misma página). */
  const setView = useCallback((next: RecordListView) => setViewState(current => (viewKey(current) === viewKey(next) ? current : next)), []);
  /** Vuelve al principio de una lista vacía (al cambiar de tipo de registro). */
  const reset = () => { setQuery(''); setOffset(0); setPipeline(''); setViewState(EMPTY_LIST_VIEW); setFacets(null); setRows([]); setRecords([]); setLoading(true); setTotal(0); };
  return { query, setQuery, offset, setOffset, pipeline, setPipeline, view, setView, facets, setFacets, rows, setRows, records, setRecords, total, setTotal, loading, setLoading, error, setError, reset };
}

type Page = { records: CrmRecord[]; related: CrmRecord[]; total: number; facets?: Record<string, number> };
type ListSink = Pick<RecordList, 'setRows' | 'setRecords' | 'setTotal' | 'setError' | 'setLoading'> & Partial<Pick<RecordList, 'setFacets'>>;

/**
 * Pide una página y la aplica a la lista solo si su consulta sigue vigente (R2, revisión 407 de Codex). Una respuesta o
 * un error que llegan después de cancelar —un transporte que ignora la señal— no tocan nada: ni filas, ni
 * relacionados, ni total, ni el error visible, ni el aviso del padre. Separada del hook para probarla sin React.
 */
export async function loadRecordPage(fetchPage: (signal: AbortSignal) => Promise<Page>, signal: AbortSignal, list: ListSink, onError: (message: string) => void) {
  try {
    const data = await fetchPage(signal);
    if (signal.aborted) return;
    list.setRows(data.records); list.setRecords([...data.records, ...data.related]); list.setTotal(data.total); list.setFacets?.(data.facets ?? null);
  } catch (failure) {
    if (signal.aborted || (failure instanceof Error && failure.name === 'AbortError')) return;
    const message = failure instanceof Error ? failure.message : String(failure);
    onError(message); list.setError(message);
  } finally {
    if (!signal.aborted) list.setLoading(false);
  }
}

/** Carga la página pedida cuando la lista está activa; cancela la petición anterior y avisa de los errores. */
export function useRecordListLoader(list: RecordList, { active, entity, revision, onError }: { active: boolean; entity: EntityName; revision: number; onError: (message: string) => void }) {
  const { query, offset, pipeline, view } = list, key = viewKey(view);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); list.setLoading(true); list.setError('');
    const timer = setTimeout(() => void loadRecordPage(signal => api<Page>(recordListPath(entity, query, offset, pipeline, RECORD_PAGE_SIZE, view), { signal }), controller.signal, list, onError), searchDelay(query));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, entity, query, offset, pipeline, key, revision]);
}
