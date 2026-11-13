// PRESUPUESTO DE ENTRADA DEL VERIFICADOR DE MIGRACIONES (unidad Claude B · CLAUDE-MIGRATION-VERIFIER-VISUAL). Comprobación PURA y barata que se hace ANTES de cualquier procesamiento costoso (validación con zod, comparación,
// informe): tamaño de cada fichero y del conjunto, número de objetos, filas y campos y longitud de las cadenas. Un conjunto que excede el presupuesto se RECHAZA con un motivo explícito; nunca se trunca ni se
// procesa «hasta donde llegue» (eso produciría un informe parcial presentado como completo). Es interno: lo usará el endpoint/interfaz futuro; no hay ninguno todavía.
//
// Los límites salen de medidas reales (ver el informe de la unidad), no de una promesa de capacidad: son TOPES de seguridad de esta versión en este equipo, no una garantía de que cualquier entrada por debajo
// se procese al instante ni de que una por encima no pudiera procesarse. Los límites por objeto del esquema (`MAX_ROWS_PER_OBJECT`, cadenas ≤ 2000, IDs ≤ 120…) se mantienen y se aplican además.
export const MIGRATION_BUDGET = {
  /** Bytes máximos de cada exportación. */
  maxExportBytes: 24 * 1024 * 1024,
  /** Bytes máximos del mapa de campos y claves. */
  maxMapBytes: 512 * 1024,
  /** Bytes máximos del conjunto (origen + destino + mapa). */
  maxTotalBytes: 48 * 1024 * 1024,
  maxObjectsPerExport: 20,
  /** Filas máximas sumando origen y destino. */
  maxTotalRows: 120_000,
  maxFieldsPerRow: 100,
  maxStringLength: 2000,
} as const;

export type BudgetCode = 'NOT_TEXT' | 'FILE_TOO_LARGE' | 'TOTAL_TOO_LARGE' | 'NOT_JSON' | 'BAD_SHAPE' | 'TOO_MANY_OBJECTS' | 'TOO_MANY_ROWS' | 'TOO_MANY_FIELDS' | 'STRING_TOO_LONG';
export interface BudgetMeasured { sourceBytes: number; targetBytes: number; mapBytes: number; totalBytes: number; sourceRows: number; targetRows: number; totalRows: number; objects: number; maxFields: number; longestString: number }
export type BudgetVerdict =
  | { ok: true; measured: BudgetMeasured }
  | { ok: false; code: BudgetCode; which: 'source' | 'target' | 'map' | 'set'; message: string; measured: Partial<BudgetMeasured> };

const reject = (code: BudgetCode, which: 'source' | 'target' | 'map' | 'set', message: string, measured: Partial<BudgetMeasured> = {}): BudgetVerdict => ({ ok: false, code, which, message, measured });
const byteLength = (value: string | Uint8Array) => (typeof value === 'string' ? new TextEncoder().encode(value).length : value.byteLength);
const label = { source: 'La exportación de origen', target: 'La exportación de destino', map: 'El mapa' } as const;

/**
 * Comprueba los ficheros EN BRUTO (texto o bytes) antes de analizarlos: primero los tamaños (sin parsear nada), después el JSON y la forma. Devuelve los objetos ya analizados cuando cumple, para no analizar dos veces.
 * No valida el contenido con los esquemas del verificador: eso lo hace `compareMigration` después, solo si el presupuesto lo permite.
 */
export function checkMigrationFiles(files: { source: string | Uint8Array; target: string | Uint8Array; map: string | Uint8Array }): BudgetVerdict & { parsed?: { source: unknown; target: unknown; map: unknown } } {
  for (const key of ['source', 'target', 'map'] as const) { const value = files[key]; if (typeof value !== 'string' && !(value instanceof Uint8Array)) return reject('NOT_TEXT', key, label[key] + ' no es texto ni bytes.'); }
  const sourceBytes = byteLength(files.source), targetBytes = byteLength(files.target), mapBytes = byteLength(files.map), totalBytes = sourceBytes + targetBytes + mapBytes;
  const sizes = { sourceBytes, targetBytes, mapBytes, totalBytes };
  if (sourceBytes > MIGRATION_BUDGET.maxExportBytes) return reject('FILE_TOO_LARGE', 'source', label.source + ' pesa ' + sourceBytes + ' bytes; el máximo es ' + MIGRATION_BUDGET.maxExportBytes + '.', sizes);
  if (targetBytes > MIGRATION_BUDGET.maxExportBytes) return reject('FILE_TOO_LARGE', 'target', label.target + ' pesa ' + targetBytes + ' bytes; el máximo es ' + MIGRATION_BUDGET.maxExportBytes + '.', sizes);
  if (mapBytes > MIGRATION_BUDGET.maxMapBytes) return reject('FILE_TOO_LARGE', 'map', label.map + ' pesa ' + mapBytes + ' bytes; el máximo es ' + MIGRATION_BUDGET.maxMapBytes + '.', sizes);
  if (totalBytes > MIGRATION_BUDGET.maxTotalBytes) return reject('TOTAL_TOO_LARGE', 'set', 'El conjunto pesa ' + totalBytes + ' bytes; el máximo es ' + MIGRATION_BUDGET.maxTotalBytes + '.', sizes);
  const parsed: { source?: unknown; target?: unknown; map?: unknown } = {};
  for (const key of ['source', 'target', 'map'] as const) {
    const value = files[key];
    try { parsed[key] = JSON.parse(typeof value === 'string' ? value : new TextDecoder('utf-8', { fatal: true }).decode(value)); } catch { return reject('NOT_JSON', key, label[key] + ' no es un JSON válido.', sizes); }
  }
  const verdict = checkMigrationObjects(parsed.source, parsed.target, parsed.map);
  if (!verdict.ok) return { ...verdict, measured: { ...sizes, ...verdict.measured } };
  return { ok: true, measured: { ...verdict.measured, ...sizes }, parsed: { source: parsed.source, target: parsed.target, map: parsed.map } };
}

/** Comprueba objetos ya analizados: forma mínima, objetos, filas (por exportación y en total), campos por fila y longitud de cadenas. Una pasada, sin esquemas. */
export function checkMigrationObjects(source: unknown, target: unknown, map: unknown): BudgetVerdict {
  const measured: BudgetMeasured = { sourceBytes: 0, targetBytes: 0, mapBytes: 0, totalBytes: 0, sourceRows: 0, targetRows: 0, totalRows: 0, objects: 0, maxFields: 0, longestString: 0 };
  if (!map || typeof map !== 'object' || Array.isArray(map)) return reject('BAD_SHAPE', 'map', label.map + ' no es un objeto.');
  for (const [key, value] of [['source', source], ['target', target]] as const) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as { objects?: unknown }).objects)) return reject('BAD_SHAPE', key, label[key] + ' no tiene la lista de objetos.');
    const objects = (value as { objects: unknown[] }).objects;
    if (objects.length > MIGRATION_BUDGET.maxObjectsPerExport) return reject('TOO_MANY_OBJECTS', key, label[key] + ' tiene ' + objects.length + ' objetos; el máximo es ' + MIGRATION_BUDGET.maxObjectsPerExport + '.', measured);
    measured.objects += objects.length;
    for (const object of objects) {
      const rows = object && typeof object === 'object' ? (object as { rows?: unknown }).rows : undefined;
      if (!Array.isArray(rows)) return reject('BAD_SHAPE', key, label[key] + ' tiene un objeto sin lista de filas.', measured);
      if (key === 'source') measured.sourceRows += rows.length; else measured.targetRows += rows.length;
      measured.totalRows = measured.sourceRows + measured.targetRows;
      if (measured.totalRows > MIGRATION_BUDGET.maxTotalRows) return reject('TOO_MANY_ROWS', 'set', 'El conjunto tiene más de ' + MIGRATION_BUDGET.maxTotalRows + ' filas (origen y destino sumados).', measured);
      for (const row of rows) {
        const values = row && typeof row === 'object' ? (row as { values?: unknown }).values : undefined;
        if (!values || typeof values !== 'object' || Array.isArray(values)) return reject('BAD_SHAPE', key, label[key] + ' tiene una fila sin valores.', measured);
        const names = Object.keys(values as object);
        if (names.length > MIGRATION_BUDGET.maxFieldsPerRow) return reject('TOO_MANY_FIELDS', key, label[key] + ' tiene una fila con ' + names.length + ' campos; el máximo es ' + MIGRATION_BUDGET.maxFieldsPerRow + '.', measured);
        if (names.length > measured.maxFields) measured.maxFields = names.length;
        for (const name of names) {
          const value = (values as Record<string, unknown>)[name];
          if (typeof value === 'string') { if (value.length > measured.longestString) measured.longestString = value.length; if (value.length > MIGRATION_BUDGET.maxStringLength) return reject('STRING_TOO_LONG', key, label[key] + ' tiene una cadena de ' + value.length + ' caracteres; el máximo es ' + MIGRATION_BUDGET.maxStringLength + '.', measured); }
        }
      }
    }
  }
  return { ok: true, measured };
}
