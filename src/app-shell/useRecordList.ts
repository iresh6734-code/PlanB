// Estado y carga de la lista de registros de la App local (mejora B2 del informe; CLAUDE-RECORD-LIST, 17/11/2026).
// Antes vivía repartido por App.tsx (ocho estados, un efecto y el reinicio de openEntity). Dos piezas, porque App
// declara el estado arriba y solo puede cargar cuando ya conoce la sesión y la revisión de datos.
import { useEffect, useState } from 'react';
import type { CrmRecord, EntityName } from '../../shared/model.js';
import { api } from '../api.js';

export const RECORD_PAGE_SIZE = 50;

/** Dirección de la consulta de una página de registros. Lógica pura. */
export function recordListPath(entity: EntityName, query: string, offset: number, pipeline: string, limit = RECORD_PAGE_SIZE) {
  return '/v2/records/' + entity + '?q=' + encodeURIComponent(query) + '&offset=' + offset + '&limit=' + limit + '&pipeline=' + encodeURIComponent(pipeline);
}

/** Espera antes de buscar: inmediata sin texto, breve mientras se escribe. */
export const searchDelay = (query: string) => (query ? 180 : 0);

export type RecordList = ReturnType<typeof useRecordListState>;

/** Estado de la lista: búsqueda, página, embudo, filas visibles, registros conocidos (filas + relacionados) y carga. */
export function useRecordListState() {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [pipeline, setPipeline] = useState('');
  const [rows, setRows] = useState<CrmRecord[]>([]), [records, setRecords] = useState<CrmRecord[]>([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  /** Vuelve al principio de una lista vacía (al cambiar de tipo de registro). */
  const reset = () => { setQuery(''); setOffset(0); setPipeline(''); setRows([]); setRecords([]); setLoading(true); setTotal(0); };
  return { query, setQuery, offset, setOffset, pipeline, setPipeline, rows, setRows, records, setRecords, total, setTotal, loading, setLoading, error, setError, reset };
}

type Page = { records: CrmRecord[]; related: CrmRecord[]; total: number };
type ListSink = Pick<RecordList, 'setRows' | 'setRecords' | 'setTotal' | 'setError' | 'setLoading'>;

/**
 * Pide una página y la aplica a la lista solo si su consulta sigue vigente (R2, revisión 407 de Codex). Una respuesta o
 * un error que llegan después de cancelar —un transporte que ignora la señal— no tocan nada: ni filas, ni
 * relacionados, ni total, ni el error visible, ni el aviso del padre. Separada del hook para probarla sin React.
 */
export async function loadRecordPage(fetchPage: (signal: AbortSignal) => Promise<Page>, signal: AbortSignal, list: ListSink, onError: (message: string) => void) {
  try {
    const data = await fetchPage(signal);
    if (signal.aborted) return;
    list.setRows(data.records); list.setRecords([...data.records, ...data.related]); list.setTotal(data.total);
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
  const { query, offset, pipeline } = list;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); list.setLoading(true); list.setError('');
    const timer = setTimeout(() => void loadRecordPage(signal => api<Page>(recordListPath(entity, query, offset, pipeline), { signal }), controller.signal, list, onError), searchDelay(query));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, entity, query, offset, pipeline, revision]);
}
