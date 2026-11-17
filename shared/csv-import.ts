// Importar registros desde CSV (mejora C9 del informe; CLAUDE-CSV-IMPORT, 17/11/2026). Lógica pura y sin dependencias:
// leer el archivo, proponer columnas, convertir valores al formato de la App y validar cada fila con las mismas reglas que
// la ficha. Nada aquí escribe: el servidor decide qué filas aplicar a partir de este plan.
import { validateRecord, type AppSpec, type CrmRecord, type EntityName, type Field } from './model.js';

export const CSV_LIMITS = { bytes: 1_000_000, rows: 1000 } as const;

/** Lee CSV con comillas, comillas dobladas, saltos CRLF/LF y BOM. Detecta el separador (; , o tabulador) en la cabecera. */
export function parseCsv(text: string): { headers: string[]; rows: string[][]; delimiter: string } {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => { let n = 0, quoted = false; for (const c of firstLine) { if (c === '"') quoted = !quoted; else if (c === ch && !quoted) n++; } return n; };
  const delimiter = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field); field = ''; records.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const nonEmpty = records.filter(r => r.some(cell => cell.trim() !== ''));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map(h => h.trim()), rows, delimiter };
}

export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Propone para cada columna el campo cuyo nombre o clave coincide (sin mayúsculas, tildes ni signos). Una columna por campo. */
export function suggestMapping(headers: string[], fields: Field[]): Record<string, string | null> {
  const used = new Set<string>(), mapping: Record<string, string | null> = {};
  for (const header of headers) {
    const h = normalize(header);
    const field = fields.find(f => !f.readOnly && !used.has(f.key) && (normalize(f.label) === h || normalize(f.key) === h));
    mapping[header] = field ? field.key : null;
    if (field) used.add(field.key);
  }
  return mapping;
}

type Converted = { value: CrmRecord['values'][string] } | { error: string };

/** Número con coma decimal española («1.234,56») o con punto («1234.56»). */
function parseNumber(raw: string): number | null {
  let text = raw.replace(/\s|€/g, '');
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text); return Number.isFinite(value) ? value : null;
}

/** Fecha «AAAA-MM-DD» o «DD/MM/AAAA» (también con guiones o puntos) → «AAAA-MM-DD», comprobando que existe. */
function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw), es = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : es ? [es[3], es[2].padStart(2, '0'), es[1].padStart(2, '0')] : [];
  if (!y) return null;
  const text = y + '-' + m + '-' + d, parsed = Date.parse(text + 'T00:00:00Z');
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === text ? text : null;
}

/** Convierte un valor de texto al tipo del campo. `references` resuelve nombres de registros relacionados a su ID. */
export function convertValue(field: Field, raw: string, references: (entity: EntityName, text: string) => string[]): Converted {
  const text = raw.trim();
  if (text === '') return { value: null };
  switch (field.type) {
    case 'text': return { value: text };
    case 'email': return { value: text.toLowerCase() };
    case 'number': { const value = parseNumber(text); return value === null ? { error: 'No es un número' } : { value }; }
    case 'date': { const value = parseDate(text); return value ? { value } : { error: 'Fecha no válida (usa DD/MM/AAAA)' }; }
    case 'datetime': {
      const date = parseDate(text.split(/[ T]/)[0]), time = /(\d{1,2}):(\d{2})/.exec(text);
      if (!date) return { error: 'Fecha y hora no válidas' };
      return { value: new Date(date + 'T' + (time ? time[1].padStart(2, '0') + ':' + time[2] : '00:00') + ':00Z').toISOString() };
    }
    case 'boolean': {
      const n = normalize(text);
      if (['si', 'true', '1', 'x', 'verdadero', 'yes'].includes(n)) return { value: true };
      if (['no', 'false', '0', 'falso'].includes(n)) return { value: false };
      return { error: 'Usa «sí» o «no»' };
    }
    case 'enum': {
      const option = field.options.find(o => o.id === text || normalize(o.label) === normalize(text));
      return option ? { value: option.id } : { error: 'Opción desconocida: ' + text };
    }
    case 'multiselect': {
      const parts = text.split(/[;|]/).map(p => p.trim()).filter(Boolean), ids: string[] = [];
      for (const part of parts) { const option = field.options.find(o => o.id === part || normalize(o.label) === normalize(part)); if (!option) return { error: 'Opción desconocida: ' + part }; ids.push(option.id); }
      return { value: ids.join(';') };
    }
    case 'reference': {
      if (!field.referenceEntity) return { error: 'Relación sin destino' };
      const ids = references(field.referenceEntity, text);
      if (ids.length === 1) return { value: ids[0] };
      return { error: ids.length ? 'Hay varios registros con ese nombre: usa su ID' : 'No existe en la copia: ' + text };
    }
  }
}

/** `cells` conserva el texto original de cada columna, para enseñar a la persona lo que escribió y no IDs internos. */
export type ImportRow = { line: number; values: CrmRecord['values']; errors: Record<string, string>; cells: Record<string, string> };
export type ImportPlan = { entity: EntityName; headers: string[]; mapping: Record<string, string | null>; rows: ImportRow[]; valid: number; invalid: number; ignoredColumns: string[] };

/**
 * Plan completo: cada fila convertida y validada como lo haría la ficha, más dos comprobaciones de importación:
 * correos repetidos (contra la copia y dentro del archivo) y relaciones que no existen. `existing` es la copia actual.
 */
export function planImport(spec: AppSpec, entity: EntityName, csv: string, existing: CrmRecord[], mapping?: Record<string, string | null>): ImportPlan {
  const definition = spec.entities.find(e => e.id === entity);
  if (!definition) throw new Error('Tipo de registro desconocido: ' + entity);
  const { headers, rows } = parseCsv(csv);
  const map = mapping ?? suggestMapping(headers, definition.fields);
  const fieldOf = (key: string | null | undefined) => definition.fields.find(f => f.key === key && !f.readOnly);
  const index = new Map<string, string[]>();
  for (const record of existing) {
    const target = spec.entities.find(e => e.id === record.entity), name = target ? String(record.values[target.displayField] ?? '') : '';
    for (const label of [record.id, name]) if (label) { const key = record.entity + ':' + normalize(label); index.set(key, [...(index.get(key) ?? []), record.id]); }
  }
  const references = (target: EntityName, text: string) => [...new Set(index.get(target + ':' + normalize(text)) ?? [])];
  const emailField = definition.fields.find(f => f.type === 'email');
  const seenEmails = new Set(existing.filter(r => r.entity === entity && emailField).map(r => String(r.values[emailField!.key] ?? '').toLowerCase()).filter(Boolean));
  const planned: ImportRow[] = rows.map((cells, i) => {
    const values: CrmRecord['values'] = {}, errors: Record<string, string> = {};
    headers.forEach((header, column) => {
      const field = fieldOf(map[header]); if (!field) return;
      const converted = convertValue(field, cells[column] ?? '', references);
      if ('error' in converted) errors[field.key] = converted.error; else if (converted.value !== null) values[field.key] = converted.value;
    });
    Object.assign(errors, Object.fromEntries(Object.entries(validateRecord(spec, { entity, id: 'importacion', values }, null)).filter(([key]) => !(key in errors))));
    const email = emailField ? String(values[emailField.key] ?? '') : '';
    if (email && !errors[emailField!.key]) { if (seenEmails.has(email)) errors[emailField!.key] = 'Ya existe en la copia o en otra fila'; else seenEmails.add(email); }
    return { line: i + 2, values, errors, cells: Object.fromEntries(headers.map((header, column) => [header, (cells[column] ?? '').trim()])) };
  });
  const valid = planned.filter(r => !Object.keys(r.errors).length).length;
  return { entity, headers, mapping: map, rows: planned, valid, invalid: planned.length - valid, ignoredColumns: headers.filter(h => !fieldOf(map[h])) };
}
