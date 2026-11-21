// Paquete de vuelta (misión maestra, A4 · 21/11/2026). Lógica pura y compartida, sin red ni servidor.
//
// Problema: en producción Plan B solo LEE HubSpot (la devolución automática está bloqueada a propósito). Tras una caída, el
// trabajo hecho en la copia tiene que volver al CRM de forma revisable. Este módulo convierte los cambios locales pendientes
// en archivos CSV con el formato de importación de HubSpot (uno por objeto y tipo) y un informe de lo que NO entra y por qué.
//
// Garantías (revisión cruzada de Copilot, 21/11/2026):
// - Identidad congelada: portal, captura, revisión local y tramo de cambios van en el paquete; la comprobación posterior
//   (verifyManualRecovery) exige esa misma revisión.
// - Nada se da por devuelto: exportar no importa ni marca nada. La vuelta solo se acredita al releer HubSpot.
// - Conflictos: si se aporta lo leído ahora de HubSpot, un campo que cambió en los dos lados queda FUERA del CSV y en el
//   informe (base, copia y HubSpot), igual que el conflicto a tres bandas de server/recovery.ts.
// - Vaciar un campo no se puede con una celda vacía (la importación la ignora): queda fuera y en el informe.
// - Relaciones, campos de solo lectura y registros con ID remoto no canónico quedan fuera y en el informe.
// - Celdas que una hoja de cálculo ejecutaría como fórmula (=, @, tabulador, retorno, o + / - seguidos de algo que no es un
//   número) se escriben con un apóstrofo delante y se listan. Los teléfonos «+34…» y los importes negativos no se tocan.
import type { AppSpec, Change, CrmRecord, EntityName, Field, FieldValue } from './model.js';

export type ReturnFileKind = 'update' | 'create';
export interface ReturnFile { entity: EntityName; kind: ReturnFileKind; name: string; columns: string[]; rows: number; csv: string }
export type SkipReason = 'conflict' | 'clear' | 'relation' | 'missing-remote' | 'bad-id' | 'already-created' | 'no-fields';
export interface ReturnSkip { entity: EntityName; localId: string; label: string; field: string | null; fieldLabel: string | null; reason: SkipReason; detail: string;
  /** Solo en conflictos: valor al capturar, en la copia y el leído ahora de HubSpot. */ values?: { base: FieldValue; local: FieldValue; remote: FieldValue } }
export interface ReturnPackage {
  identity: { accountId: string; captureId: string; revision: string; fromChange: number; toChange: number; generatedAt: string; remoteChecked: boolean };
  files: ReturnFile[];
  skipped: ReturnSkip[];
  /** Campos ya iguales en HubSpot (no hace falta importarlos). */ alreadyThere: number;
  /** Celdas protegidas con apóstrofo para que una hoja de cálculo no las ejecute. */ guarded: { entity: EntityName; localId: string; field: string }[];
  summary: string[];
}
export interface ReturnPackageInput {
  spec: AppSpec; changes: Change[]; accountId: string; captureId: string; revision: string; generatedAt: string;
  /** Último cambio ya devuelto (returnWatermark): solo entran los posteriores. */ watermark: number;
  /** IDs remotos confirmados de altas locales: «entidad:idLocal» → ID de HubSpot. */ mapping: Record<string, string>;
  /** Opcional: lo leído ahora de HubSpot por «entidad:idRemoto» (null = no existe). Sin esto no se detectan conflictos. */
  remote?: Map<string, CrmRecord | null>;
}

const CANONICAL_ID = /^(?:0|[1-9]\d*)$/;
const ENTITY_FILE: Record<EntityName, string> = { contacts: 'contactos', companies: 'empresas', deals: 'oportunidades', tasks: 'tareas' };
const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (value: FieldValue | undefined) => value === null || value === undefined || value === '';

/** Celda CSV (RFC 4180) con la protección frente a fórmulas descrita arriba. Devuelve también si se protegió. */
export function csvCell(value: FieldValue | undefined): { text: string; guarded: boolean } {
  if (value === null || value === undefined) return { text: '', guarded: false };
  let text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  const risky = /^[=@\t\r]/.test(text) || /^[+-](?![\d.,\s]*$)/.test(text) && !/^[+-]\s*\d[\d\s().-]*$/.test(text);
  if (risky) text = "'" + text;
  return { text: /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text, guarded: risky };
}

/** Agrupa los cambios posteriores a la marca por registro: el «antes» del primero y el «después» del último. */
export function pendingByRecord(changes: Change[], watermark: number) {
  const byKey = new Map<string, { before: CrmRecord | null; after: CrmRecord; first: number; last: number }>();
  for (const change of changes.filter(item => item.id > watermark).sort((a, b) => a.id - b.id)) {
    const key = change.entity + ':' + change.recordId, previous = byKey.get(key);
    byKey.set(key, previous ? { ...previous, after: change.after, last: change.id } : { before: change.before, after: change.after, first: change.id, last: change.id });
  }
  return byKey;
}

export function buildReturnPackage(input: ReturnPackageInput): ReturnPackage {
  const pending = pendingByRecord(input.changes, input.watermark);
  const skipped: ReturnSkip[] = [], guarded: ReturnPackage['guarded'] = [];
  let alreadyThere = 0;
  type Row = { localId: string; remoteId: string | null; label: string; values: Record<string, FieldValue> };
  const rows = new Map<string, Row[]>(); // «entidad:tipo» → filas
  const used = new Map<string, Set<string>>(); // «entidad:tipo» → columnas usadas
  const ids = [...pending.values()].flatMap(item => [item.first, item.last]);
  for (const [key, { before, after }] of pending) {
    const entity = input.spec.entities.find(item => item.id === after.entity);
    if (!entity) continue;
    const label = String(after.values[entity.displayField] ?? after.id);
    const skip = (reason: SkipReason, detail: string, field?: Field, values?: ReturnSkip['values']) =>
      skipped.push({ entity: after.entity, localId: after.id, label, field: field?.key ?? null, fieldLabel: field?.label ?? null, reason, detail, ...(values ? { values } : {}) });
    const kind: ReturnFileKind = before ? 'update' : 'create';
    const remoteId = before ? (input.mapping[key] ?? after.id) : null;
    if (!before && input.mapping[key]) { skip('already-created', 'Ya creada en HubSpot con el ID ' + input.mapping[key] + ': compruébala desde Cambios en lugar de importarla otra vez.'); continue; }
    if (remoteId !== null && !CANONICAL_ID.test(remoteId)) { skip('bad-id', 'El ID de HubSpot no es numérico; esta ficha se revisa a mano.'); continue; }
    const current = remoteId !== null && input.remote ? input.remote.get(after.entity + ':' + remoteId) : undefined;
    if (current === null) { skip('missing-remote', 'No existe o está archivada en HubSpot: no se recrea desde un archivo de actualización.'); continue; }
    const values: Record<string, FieldValue> = {};
    for (const field of entity.fields) {
      const base = before?.values[field.key] ?? null, local = after.values[field.key] ?? null;
      if (before ? equal(base, local) : empty(local)) continue;
      if (field.type === 'reference') { skip('relation', 'Las relaciones se revisan a mano en HubSpot (la importación por archivo no las cambia con seguridad).', field); continue; }
      if (field.readOnly) continue; // la copia no deja editarlos; si aparece, no se devuelve
      if (current) {
        const actual = current.values[field.key] ?? null;
        if (equal(local, actual)) { alreadyThere++; continue; }
        if (!equal(base, actual)) { skip('conflict', 'Cambió también en HubSpot durante la caída: decide a mano qué valor queda.', field, { base, local, remote: actual }); continue; }
      }
      if (empty(local)) { skip('clear', 'Vaciar un campo no se puede con una importación (las celdas vacías se ignoran): hazlo a mano en HubSpot.', field); continue; }
      values[field.key] = local;
    }
    if (!Object.keys(values).length) { if (!skipped.some(item => item.localId === after.id && item.entity === after.entity)) skip('no-fields', current ? 'Todo lo cambiado ya está igual en HubSpot.' : 'No queda ningún campo que importar.'); continue; }
    const group = after.entity + ':' + kind;
    rows.set(group, [...(rows.get(group) ?? []), { localId: after.id, remoteId, label, values }]);
    const columns = used.get(group) ?? new Set<string>();
    for (const column of Object.keys(values)) columns.add(column);
    used.set(group, columns);
  }
  const files: ReturnFile[] = [];
  for (const entity of input.spec.entities) for (const kind of ['update', 'create'] as const) {
    const list = rows.get(entity.id + ':' + kind);
    if (!list?.length) continue;
    const fieldColumns = entity.fields.map(field => field.key).filter(column => used.get(entity.id + ':' + kind)!.has(column));
    const columns = kind === 'update' ? ['Record ID', ...fieldColumns] : fieldColumns;
    const lines = [columns.map(column => csvCell(column).text).join(',')];
    for (const row of list.sort((a, b) => a.label.localeCompare(b.label, 'es') || a.localId.localeCompare(b.localId))) {
      const cells = (kind === 'update' ? [csvCell(row.remoteId).text] : []).concat(fieldColumns.map(column => {
        const cell = csvCell(row.values[column]);
        if (cell.guarded) guarded.push({ entity: entity.id, localId: row.localId, field: column });
        return cell.text;
      }));
      lines.push(cells.join(','));
    }
    files.push({ entity: entity.id, kind, name: 'plan-b-vuelta-' + ENTITY_FILE[entity.id] + '-' + (kind === 'update' ? 'actualizar' : 'crear') + '.csv', columns, rows: list.length, csv: lines.join('\r\n') + '\r\n' });
  }
  const count = (reason: SkipReason) => skipped.filter(item => item.reason === reason).length;
  const summary = [
    files.length ? files.map(file => file.rows + (file.kind === 'update' ? ' por actualizar' : ' por crear') + ' en ' + ENTITY_FILE[file.entity]).join(' · ') : 'No hay nada que importar.',
    input.remote ? 'Comprobado contra lo leído ahora de HubSpot' + (alreadyThere ? ': ' + alreadyThere + (alreadyThere === 1 ? ' campo ya está igual.' : ' campos ya están iguales.') : '.') : 'Sin leer HubSpot: no se han podido detectar conflictos. Léelo antes de importar.',
    count('conflict') ? count('conflict') + (count('conflict') === 1 ? ' conflicto queda fuera' : ' conflictos quedan fuera') + ': decide a mano.' : '',
    count('relation') ? count('relation') + (count('relation') === 1 ? ' relación se revisa' : ' relaciones se revisan') + ' a mano.' : '',
    count('clear') ? count('clear') + (count('clear') === 1 ? ' campo vaciado' : ' campos vaciados') + ' se hacen a mano.' : '',
    guarded.length ? guarded.length + (guarded.length === 1 ? ' celda lleva' : ' celdas llevan') + ' un apóstrofo delante para que una hoja de cálculo no la ejecute: revísalas.' : '',
    'Importar no acredita nada: al terminar, comprueba la vuelta desde Cambios (relectura de HubSpot).',
  ].filter(Boolean);
  return { identity: { accountId: input.accountId, captureId: input.captureId, revision: input.revision, fromChange: ids.length ? Math.min(...ids) : 0, toChange: ids.length ? Math.max(...ids) : 0, generatedAt: input.generatedAt, remoteChecked: !!input.remote },
    files, skipped, alreadyThere, guarded, summary };
}
