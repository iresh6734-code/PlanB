import { CSV_LIMITS, parseCsv } from './csv-import.js';

export type BillingStatus = 'missing' | 'partial' | 'verified' | 'review' | 'excluded';

export interface BillingCase {
  reference: string;
  concept: string;
  expectedCents: number;
  invoicedCents: number;
  status: BillingStatus;
  detail: string;
  invoices: string[];
}

export interface BillingResult {
  cases: BillingCase[];
  unmatchedInvoiceLines: number;
}

const partHeaders = ['referencia', 'concepto', 'importe_neto', 'aprobado', 'fuera_de_cuota'] as const;
const invoiceHeaders = ['factura', 'linea', 'referencia', 'importe_neto', 'estado'] as const;

function validQuotes(text: string, separator: string) {
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  for (const character of text.replace(/^\ufeff/, '')) {
    if (state === 'quoted') {
      if (character === '"') state = 'closed';
    } else if (character === separator || character === '\r' || character === '\n') {
      state = 'start';
    } else if (character === '"') {
      if (state === 'plain') return false;
      state = 'quoted';
    } else {
      if (state === 'closed') return false;
      state = 'plain';
    }
  }
  return state !== 'quoted';
}

function readRows<Key extends string>(csv: string, required: readonly Key[], source: string) {
  if (new TextEncoder().encode(csv).length > CSV_LIMITS.bytes) {
    throw new Error(`${source}: el archivo supera 1 MB.`);
  }
  if (csv.includes('\0')) throw new Error(`${source}: guarda el archivo como CSV UTF-8.`);
  const { headers, rows, delimiter } = parseCsv(csv);
  const columns = headers.map(header => header.toLowerCase());
  if (!validQuotes(csv, delimiter)) throw new Error(`${source}: hay comillas mal cerradas o mal colocadas.`);
  if (columns.some(header => !header) || new Set(columns).size !== columns.length) {
    throw new Error(`${source}: revisa los encabezados vacíos o repetidos.`);
  }
  const missing = required.filter(header => !columns.includes(header));
  if (missing.length) throw new Error(`${source}: faltan las columnas ${missing.join(', ')}.`);
  if (rows.length > CSV_LIMITS.rows) throw new Error(`${source}: el archivo supera 1.000 filas.`);
  return rows.map((cells, index) => {
    if (cells.length !== columns.length) throw new Error(`${source}: la fila de datos ${index + 1} tiene un número incorrecto de columnas.`);
    return Object.fromEntries(columns.map((column, columnIndex) => [column, cells[columnIndex].trim()])) as Record<Key, string>;
  });
}

function cents(value: string, label: string) {
  const normalized = /^-?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value) ? value.replaceAll('.', '') : value;
  const groups = /^(-?)(\d+)(?:[,.](\d{1,2}))?$/.exec(normalized);
  if (!groups) throw new Error(`${label}: importe inválido. Usa un importe en euros con hasta dos decimales.`);
  const [, sign, euros, fraction = ''] = groups;
  const amount = Number(euros) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > Math.floor(Number.MAX_SAFE_INTEGER / CSV_LIMITS.rows)) {
    throw new Error(`${label}: el importe supera el límite admitido.`);
  }
  return sign === '-' ? -amount : amount;
}

function answer(value: string, label: string) {
  switch (value.toLowerCase()) {
    case 'si':
    case 'sí': return true;
    case 'no': return false;
    default: throw new Error(`${label}: utiliza sí o no.`);
  }
}

function addToGroup<Key, Value>(groups: Map<Key, Value[]>, key: Key, value: Value) {
  const group = groups.get(key);
  if (group) group.push(value);
  else groups.set(key, [value]);
}

const lineKey = (invoice: string, line: string) => JSON.stringify([invoice, line]);

interface InvoiceLine {
  invoice: string;
  line: string;
  reference: string;
  net: number;
  status: string;
}

export function reconcileBilling(partsCsv: string, invoicesCsv: string): BillingResult {
  const partRows = readRows(partsCsv, partHeaders, 'Partes');
  if (!partRows.length) throw new Error('Partes: añade al menos un parte al archivo.');
  const parts = new Map<string, BillingCase[]>();
  const eligible = new Set<string>();
  partRows.forEach((row, index) => {
    const label = `Partes, fila de datos ${index + 1}`;
    if (!row.referencia || !row.concepto) throw new Error(`${label}: indica la referencia y el concepto.`);
    const expectedCents = cents(row.importe_neto, label);
    const approved = answer(row.aprobado, `${label}, aprobado`);
    const outsideFee = answer(row.fuera_de_cuota, `${label}, fuera_de_cuota`);
    if (expectedCents < 0 || (expectedCents === 0 && approved && outsideFee)) {
      throw new Error(`${label}: un extra aprobado requiere un importe positivo.`);
    }
    if (approved && outsideFee) eligible.add(row.referencia);
    addToGroup(parts, row.referencia, {
      reference: row.referencia,
      concept: row.concepto,
      expectedCents,
      invoicedCents: 0,
      status: approved && outsideFee ? 'missing' : 'excluded',
      detail: !outsideFee ? 'Trabajo incluido en la cuota.' : 'Extra pendiente de aprobación.',
      invoices: [],
    });
  });

  const duplicates = new Map<string, InvoiceLine[]>();
  const byReference = new Map<string, InvoiceLine[]>();
  let unmatchedInvoiceLines = 0;
  let unassignedCredit = false;
  readRows(invoicesCsv, invoiceHeaders, 'Facturas').forEach((row, index) => {
    const label = `Facturas, fila de datos ${index + 1}`;
    if (!row.factura || !row.linea) throw new Error(`${label}: indica el número de factura y la línea.`);
    const line: InvoiceLine = {
      invoice: row.factura,
      line: row.linea,
      reference: row.referencia,
      net: cents(row.importe_neto, label),
      status: row.estado.toLowerCase(),
    };
    addToGroup(duplicates, lineKey(line.invoice, line.line), line);
    if (parts.has(line.reference)) addToGroup(byReference, line.reference, line);
    else unmatchedInvoiceLines++;
    if (!line.reference && line.net < 0 && !['borrador', 'anulada'].includes(line.status)) unassignedCredit = true;
  });

  const cases: BillingCase[] = [];
  for (const [reference, group] of parts) {
    const part = group[0];
    if (group.length > 1) {
      cases.push({ ...part, status: 'review', detail: 'Referencia repetida en el archivo de partes. Usa una referencia distinta por extra.' });
      continue;
    }
    if (!eligible.has(reference)) {
      cases.push(part);
      continue;
    }
    const matched = byReference.get(reference) ?? [];
    const invoices = [...new Set(matched.map(line => line.invoice))];
    const needsReview = matched.some(line => duplicates.get(lineKey(line.invoice, line.line))!.length > 1);
    const unknownStatus = matched.some(line => !['emitida', 'borrador', 'anulada'].includes(line.status));
    const issued = matched.filter(line => line.status === 'emitida');
    if (needsReview || unknownStatus || issued.some(line => line.net < 0) || (unassignedCredit && issued.length > 0)) {
      const detail = needsReview ? 'Factura y línea repetidas. Comprueba el archivo antes de confirmar el importe.'
        : unknownStatus ? 'Estado de factura desconocido. Comprueba si la línea se ha emitido.'
        : 'Hay un abono o importe negativo que requiere comprobar la factura original.';
      cases.push({ ...part, status: 'review', detail, invoices });
      continue;
    }

    const invoicedCents = issued.reduce((total, line) => total + line.net, 0);
    const evidence = { ...part, invoicedCents, invoices };
    if (invoicedCents === part.expectedCents) {
      cases.push({ ...evidence, status: 'verified', detail: 'El importe coincide con líneas emitidas de esta referencia.' });
    } else if (invoicedCents > part.expectedCents) {
      cases.push({ ...evidence, status: 'review', detail: 'El importe emitido supera al del parte. Revisa las líneas que coinciden.' });
    } else if (invoicedCents > 0) {
      cases.push({ ...evidence, status: 'partial', detail: 'Hay líneas emitidas que cubren una parte del importe.' });
    } else {
      cases.push({ ...evidence, status: 'missing', detail: 'El archivo no contiene importe emitido para esta referencia.' });
    }
  }
  return { cases, unmatchedInvoiceLines };
}
