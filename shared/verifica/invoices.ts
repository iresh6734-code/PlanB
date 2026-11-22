// Plan B Verifica · importación de facturas emitidas desde un CSV (fase 1).
// Pensado para el «Libro de facturas emitidas» de Holded guardado como CSV desde Excel, pero acepta cualquier
// exportación con columnas reconocibles. Puro: recibe el texto y las empresas del CRM; no lee disco ni red.
// Sin validar contra una exportación real de Holded: los nombres de columna admitidos están en INVOICE_COLUMNS.
//
// Decisiones:
//   · El importe es la base imponible (sin IVA), porque las oportunidades del CRM suelen ir sin IVA. Si el archivo
//     solo trae el total, se usa y se avisa: el cruce por importe puede fallar.
//   · La factura se asigna a una empresa del CRM por NIF si los dos lo tienen; si no, por nombre normalizado
//     (sin tildes, puntuación ni forma societaria). Dos empresas con el mismo nombre normalizado no se asignan.
//   · La referencia a la oportunidad solo se toma de una columna propia; nunca se adivina por el concepto.
import type { VerificaCompany, VerificaInvoice } from './model.js';

export const MAX_INVOICE_LINES = 200_000;

export const INVOICE_COLUMNS = {
  number: ['numero', 'num', 'n factura', 'no factura', 'numero de factura', 'num factura', 'factura', 'n', 'invoice', 'invoice number', 'doc number'],
  date: ['fecha', 'fecha factura', 'fecha de factura', 'fecha emision', 'fecha de emision', 'fecha expedicion', 'date', 'issue date'],
  customer: ['cliente', 'contacto', 'nombre', 'nombre cliente', 'razon social', 'nombre del contacto', 'customer', 'contact'],
  taxId: ['nif', 'cif', 'nif cif', 'cif nif', 'nif del cliente', 'cif del cliente', 'vat', 'vat number', 'tax id'],
  base: ['base imponible', 'base', 'subtotal', 'importe sin iva', 'base imp', 'neto', 'importe neto', 'net'],
  total: ['total', 'importe total', 'total factura', 'importe', 'amount'],
  dealRef: ['referencia oportunidad', 'ref oportunidad', 'oportunidad', 'id oportunidad', 'deal', 'deal id', 'referencia', 'ref', 'su referencia'],
} as const;
export type InvoiceColumn = keyof typeof INVOICE_COLUMNS;

export interface InvoiceIssue { line: number; reason: string }

export interface InvoiceImport {
  invoices: VerificaInvoice[];
  /** Columna del archivo usada para cada dato. */
  columns: Partial<Record<InvoiceColumn, string>>;
  amountBasis: 'base' | 'total';
  /** Líneas descartadas y por qué (sin copiar su contenido). */
  issues: InvoiceIssue[];
  /** Facturas que no se pudieron asignar a ninguna empresa del CRM. */
  unmatched: number;
  /** Avisos generales del archivo. */
  warnings: string[];
}

export class InvoiceImportError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceImportError'; }
}

/** Texto para comparar: minúsculas, sin tildes, solo letras y números separados por un espacio. */
export const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const LEGAL_FORMS = /\b(s l u|s l l|s l|s a u|s a|s coop|sociedad limitada( unipersonal)?|sociedad anonima( unipersonal)?|slu|sll|sl|sau|sa|scoop|cb|c b|sc|s c)$/;
/** Nombre de empresa para cruzar: sin forma societaria final. */
export function companyKey(name: string): string {
  let key = fold(name);
  for (let i = 0; i < 2; i++) key = key.replace(LEGAL_FORMS, '').trim();
  return key;
}

/** NIF o CIF comparable: sin espacios, guiones ni prefijo de país ES. */
export function taxKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  return key.length >= 8 ? key : null;
}

/** Filas de un CSV con separador `;`, `,` o tabulador, comillas dobles y saltos de línea dentro de comillas. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const delimiter = [';', '\t', ','].map(d => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
      if (rows.length > MAX_INVOICE_LINES) throw new InvoiceImportError('El archivo supera ' + MAX_INVOICE_LINES + ' líneas.');
    } else field += ch;
  }
  if (quoted) throw new InvoiceImportError('El archivo tiene unas comillas sin cerrar.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(cells => cells.some(cell => cell.trim() !== ''));
}

/** Importe en formato español o inglés: «1.234,56», «1234,56», «1,234.56», «-1.234 €», «(1.234,56)». */
export function parseAmount(raw: string): number | null {
  let value = raw.replace(/[\s\u00a0€$]|EUR/gi, '');
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) { negative = true; value = value.slice(1, -1); }
  if (value.startsWith('-')) { negative = !negative; value = value.slice(1); }
  if (!/^[\d.,]+$/.test(value)) return null;
  const lastComma = value.lastIndexOf(','), lastDot = value.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) normalized = lastComma > lastDot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  else if (lastComma >= 0) normalized = /^\d{1,3}(,\d{3})+$/.test(value) && value.split(',').length > 2 ? value.replace(/,/g, '') : value.replace(',', '.');
  else if (lastDot >= 0) normalized = /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replace(/\./g, '') : value;
  else normalized = value;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? (negative ? -amount : amount) : null;
}

/** Fecha de factura a instante ISO a mediodía UTC (así no cambia de día por la zona horaria). */
export function parseInvoiceDate(raw: string): string | null {
  const value = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s.*)?$/.exec(value);
  if (match) { d = Number(match[1]); m = Number(match[2]); y = Number(match[3]); }
  else if ((match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(value))) { y = Number(match[1]); m = Number(match[2]); d = Number(match[3]); }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString() : null;
}

function findColumns(header: string[]): Partial<Record<InvoiceColumn, number>> {
  const folded = header.map(fold);
  const found: Partial<Record<InvoiceColumn, number>> = {};
  const taken = new Set<number>();
  // Primero los nombres más largos, para que «base imponible» no lo coja «total» ni «referencia oportunidad» lo coja «ref».
  const wanted = (Object.entries(INVOICE_COLUMNS) as [InvoiceColumn, readonly string[]][])
    .flatMap(([column, names]) => names.map(name => ({ column, name })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { column, name } of wanted) {
    if (found[column] !== undefined) continue;
    const index = folded.findIndex((cell, i) => !taken.has(i) && cell === name);
    if (index >= 0) { found[column] = index; taken.add(index); }
  }
  return found;
}

export function importInvoices(text: string, companies: readonly VerificaCompany[]): InvoiceImport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new InvoiceImportError('El archivo no tiene facturas.');
  const header = rows[0]!;
  const index = findColumns(header);
  if (index.date === undefined) throw new InvoiceImportError('No se encuentra la columna de fecha de la factura.');
  if (index.base === undefined && index.total === undefined) throw new InvoiceImportError('No se encuentra la columna de importe (base imponible o total).');
  if (index.customer === undefined && index.taxId === undefined && index.dealRef === undefined) throw new InvoiceImportError('No se encuentra ninguna columna para saber a quién se facturó (cliente, NIF o referencia).');
  const amountBasis: InvoiceImport['amountBasis'] = index.base !== undefined ? 'base' : 'total';
  const columns = Object.fromEntries(Object.entries(index).map(([column, i]) => [column, header[i as number]!.trim()])) as InvoiceImport['columns'];

  const byTax = new Map<string, string | null>(), byName = new Map<string, string | null>();
  const remember = (map: Map<string, string | null>, key: string | null, id: string) => { if (key) map.set(key, map.has(key) && map.get(key) !== id ? null : id); };
  for (const company of companies) { remember(byTax, taxKey(company.taxId), company.id); remember(byName, companyKey(company.name), company.id); }

  const invoices: VerificaInvoice[] = [], issues: InvoiceIssue[] = [], warnings: string[] = [];
  const seen = new Set<string>();
  let unmatched = 0, ambiguousNames = 0;
  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const cell = (column: InvoiceColumn) => index[column] === undefined ? '' : (cells[index[column]!] ?? '').trim();
    const issuedAt = parseInvoiceDate(cell('date'));
    if (!issuedAt) { issues.push({ line, reason: 'fecha no válida' }); return; }
    const amount = parseAmount(cell(amountBasis));
    if (amount === null) { issues.push({ line, reason: 'importe no válido' }); return; }
    const id = cell('number') || 'linea-' + line;
    if (seen.has(id)) { issues.push({ line, reason: 'número de factura repetido' }); return; }
    seen.add(id);
    const tax = taxKey(cell('taxId')), name = cell('customer') ? companyKey(cell('customer')) : '';
    let companyId: string | null = null;
    if (tax && byTax.has(tax)) companyId = byTax.get(tax) ?? null;
    else if (name && byName.has(name)) { companyId = byName.get(name) ?? null; if (companyId === null) ambiguousNames++; }
    if (companyId === null) unmatched++;
    invoices.push({ id, companyId, amount, issuedAt, dealRef: cell('dealRef') || null });
  });
  if (amountBasis === 'total') warnings.push('El archivo no trae la base imponible: se usa el total con IVA, y el cruce por importe con las oportunidades puede fallar.');
  if (index.dealRef === undefined) warnings.push('El archivo no trae la referencia de la oportunidad: las ganadas solo se podrán cruzar por cliente e importe, sin comprobar.');
  if (ambiguousNames) warnings.push(ambiguousNames + ' facturas no se asignan porque hay varias empresas del CRM con el mismo nombre.');
  if (!invoices.length) throw new InvoiceImportError('Ninguna línea del archivo es una factura válida.');
  return { invoices, columns, amountBasis, issues, unmatched, warnings };
}
