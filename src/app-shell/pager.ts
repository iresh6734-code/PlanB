// Lectura por páginas de una lista de registros hasta un tope (V2 del super plan). Lógica pura, sin React ni red:
// la usan la revisión de Despachar (focus.ts), el tablero de oportunidades y la ficha de Inicio.
import type { CrmRecord } from '../../shared/model.js';
import { MAX_PAGES, PAGE_SIZE } from './related.js';

export type ListPage = { records: CrmRecord[]; related: CrmRecord[]; total: number };
/** Tope del tablero y de la ficha de Inicio: 10 páginas de 100 oportunidades. */
export const BOARD_MAX_PAGES = 10;
export type PagedRead = {
  records: CrmRecord[]; related: CrmRecord[];
  /** Registros distintos leídos y el total que declaró el servidor. */ scanned: number; total: number;
  /** Solo si se leyó todo, sin repetidos ni totales cambiantes entre páginas. */ complete: boolean;
};
type Options = {
  pageSize?: number; maxPages?: number;
  /** Registro esperado en esta lista; uno ajeno se descarta y la lectura deja de ser completa. */ accept?: (record: CrmRecord) => boolean;
  /** Progreso tras cada página, para mostrar «cargando 120 de 340». */ onPage?: (read: PagedRead) => void;
};

/** Lee página a página hasta tener el total, agotar el tope o dejar de recibir registros nuevos. Cancelar descarta todo. */
export async function readPages(readPage: (offset: number, limit: number, signal: AbortSignal) => Promise<ListPage>, signal: AbortSignal, options: Options = {}): Promise<PagedRead> {
  const { pageSize = PAGE_SIZE, maxPages = MAX_PAGES, accept = () => true, onPage } = options;
  const records = new Map<string, CrmRecord>(), related = new Map<string, CrmRecord>();
  let total = 0, consistent = true;
  const snapshot = (): PagedRead => ({ records: [...records.values()], related: [...related.values()], scanned: records.size, total, complete: consistent && records.size === total });
  for (let page = 0; page < maxPages; page++) {
    signal.throwIfAborted();
    const data = await readPage(page * pageSize, pageSize, signal);
    signal.throwIfAborted();
    if (page > 0 && data.total !== total) consistent = false;
    total = Math.max(total, data.total);
    let added = 0;
    for (const record of data.records) {
      if (!accept(record) || records.has(record.id)) { consistent = false; continue; }
      records.set(record.id, record); added++;
    }
    for (const item of data.related) related.set(item.entity + ':' + item.id, item);
    onPage?.(snapshot());
    if (records.size >= total || data.records.length === 0 || added === 0) break;
  }
  return snapshot();
}

/** «Cargando 120 de 340» / «340 oportunidades» / «Calculado con 1000 de 1250». Lógica pura para el indicador. */
export function pagedLabel(read: Pick<PagedRead, 'scanned' | 'total' | 'complete'>, loading: boolean, noun: { one: string; many: string }): string {
  const n = (value: number) => value.toLocaleString('es-ES');
  if (loading) return 'Cargando ' + n(read.scanned) + ' de ' + n(read.total) + ' ' + noun.many + '…';
  if (read.complete || read.scanned >= read.total) return n(read.total) + ' ' + (read.total === 1 ? noun.one : noun.many);
  return 'Calculado con ' + n(read.scanned) + ' de ' + n(read.total) + ' ' + noun.many;
}
