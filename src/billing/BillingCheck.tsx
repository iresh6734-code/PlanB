import { ArrowRight, CircleHelp, Download, FileCheck2, FileUp, Receipt, ShieldCheck } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { reconcileBilling } from '../../shared/billing-check.js';
import { downloadCsv, toCsv } from '../app-shell/csv.js';
import { demoInvoices, demoParts, demoRecheckedInvoices, invoiceHeaders, partsHeaders } from './demo.js';
import './billing-check.css';

type Slot = 'parts' | 'invoices';
type Upload = { name: string; text?: string; error?: string };
type Mode = 'demo' | 'files';
type Status = ReturnType<typeof reconcileBilling>['cases'][number]['status'];
type Filter = 'all' | 'pending' | 'review' | 'verified';

const emptyFiles: Record<Slot, Upload | null> = { parts: null, invoices: null };
const maximumFileBytes = 1_000_000;
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const amount = (cents: number) => euro.format(cents / 100);
const amountCsv = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const statusLabels: Record<Status, string> = {
  missing: 'Sin factura emitida', partial: 'Factura parcial', review: 'Por revisar', verified: 'Facturado', excluded: 'Fuera de alcance',
};
const statusOrder: Record<Status, number> = { missing: 0, partial: 1, review: 2, verified: 3, excluded: 4 };
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'pending', label: 'Pendientes' }, { id: 'review', label: 'Por revisar' }, { id: 'verified', label: 'Facturados' },
];
const formatFields: Record<Slot, string[]> = { parts: partsHeaders, invoices: invoiceHeaders };
const fileLabels: Record<Slot, string> = { parts: 'Partes de trabajo', invoices: 'Facturas' };

function CompareResult({ parts, invoices }: { parts: string; invoices: string }) {
  return reconcileBilling(parts, invoices);
}

function FileInput({ slot, upload, onFile }: { slot: Slot; upload: Upload | null; onFile: (slot: Slot, file: File) => void }) {
  const inputId = `billing-file-${slot}`;
  const message = upload?.error ?? (upload && upload.text === undefined ? 'Leyendo archivo…' : 'Seleccionar CSV');

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onFile(slot, file);
  }

  return <div className="billing-file">
    <span className="billing-file-icon" aria-hidden="true">{slot === 'parts' ? <FileUp size={17} /> : <Receipt size={17} />}</span>
    <div className="billing-file-label">
      <strong>{fileLabels[slot]}</strong>
      <span title={upload?.name} aria-live="polite">{upload?.name ?? 'Archivo CSV'}</span>
    </div>
    <label htmlFor={inputId} className="billing-file-select" aria-label={upload ? `Cambiar ${fileLabels[slot].toLowerCase()}` : `Seleccionar CSV de ${fileLabels[slot].toLowerCase()}`}>
      <input id={inputId} type="file" accept=".csv,text/csv" onChange={chooseFile} />
      <span>{upload ? 'Cambiar' : 'Elegir'}</span>
    </label>
    {upload?.error ? <p role="alert" className="billing-file-message billing-error">{message}</p> : upload && upload.text === undefined ? <p role="status" className="billing-file-message">{message}</p> : null}
  </div>;
}

export function BillingCheck() {
  const [mode, setMode] = useState<Mode>('demo');
  const [rechecked, setRechecked] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [files, setFiles] = useState(emptyFiles);
  const fileVersions = useRef<Record<Slot, number>>({ parts: 0, invoices: 0 });

  const parts = mode === 'demo' ? demoParts : files.parts?.text;
  const invoices = mode === 'demo' ? (rechecked ? demoRecheckedInvoices : demoInvoices) : files.invoices?.text;
  const comparison = useMemo(() => {
    if (parts === undefined || invoices === undefined) return null;
    try {
      return { report: CompareResult({ parts, invoices }), error: null };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : 'No se pudieron cruzar los archivos.' };
    }
  }, [parts, invoices]);
  const report = comparison?.report;
  const sorted = useMemo(() => report?.cases.toSorted((a, b) => statusOrder[a.status] - statusOrder[b.status]) ?? [], [report]);
  const pending = sorted.filter(item => item.status === 'missing' || item.status === 'partial');
  const reviews = sorted.filter(item => item.status === 'review');
  const verified = sorted.filter(item => item.status === 'verified');
  const count = { all: sorted.length, pending: pending.length, review: reviews.length, verified: verified.length };
  const visible = { all: sorted, pending, review: reviews, verified }[filter];
  const balance = pending.reduce((sum, item) => sum + Math.max(0, item.expectedCents - item.invoicedCents), 0);
  const unmatched = report?.unmatchedInvoiceLines as number | readonly unknown[] | undefined;
  const unmatchedCount = typeof unmatched === 'number' ? unmatched : unmatched?.length ?? 0;
  const hasFiles = Boolean(files.parts || files.invoices);

  function switchMode(next: Mode) {
    setMode(next);
    setFilter('all');
  }

  async function readFile(slot: Slot, file: File) {
    const version = ++fileVersions.current[slot];
    switchMode('files');
    setFiles(current => ({ ...current, [slot]: { name: file.name } }));
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Guarda este archivo en formato CSV e inténtalo de nuevo.');
      if (file.size > maximumFileBytes) throw new Error('Este CSV supera 1 MB. Divide la exportación por periodos.');
      const text = await file.text();
      if (!text.trim()) throw new Error('Este archivo está vacío.');
      if (fileVersions.current[slot] === version) setFiles(current => ({ ...current, [slot]: { name: file.name, text } }));
    } catch (error) {
      if (fileVersions.current[slot] !== version) return;
      const message = error instanceof Error ? error.message : 'No se pudo leer este archivo.';
      setFiles(current => ({ ...current, [slot]: { name: file.name, error: message } }));
    }
  }

  function clearFiles() {
    fileVersions.current.parts++;
    fileVersions.current.invoices++;
    setFiles(emptyFiles);
  }

  function exportReport() {
    if (!report) return;
    const rows = sorted.map(item => [item.reference, item.concept, amountCsv(item.expectedCents), amountCsv(item.invoicedCents), statusLabels[item.status], item.invoices.join(', '), item.detail]);
    const fileName = mode === 'demo' ? 'plan-b-ejemplo-cierre.csv' : 'plan-b-cierre-facturacion.csv';
    downloadCsv(fileName, toCsv(['referencia', 'trabajo', 'importe_neto_previsto', 'importe_neto_facturado', 'estado', 'facturas', 'detalle'], rows));
  }

  return <div className="billing-app">
    <header className="billing-top">
      <div className="billing-top-inner">
        <div className="billing-brand"><span className="billing-brand-mark" aria-hidden="true">B</span><span>Plan B</span></div>
        <span className="billing-private"><ShieldCheck size={15} aria-hidden="true" /> Análisis en tu navegador</span>
      </div>
    </header>
    <main className="billing-main">
      <div className="billing-title">
        <div><h1>Cierre de facturación</h1><p>Comprueba qué trabajos siguen pendientes de factura.</p></div>
        <div className="billing-mode" role="group" aria-label="Origen de los datos">
          <button type="button" aria-pressed={mode === 'demo'} onClick={() => switchMode('demo')}>Ejemplo</button>
          <button type="button" aria-pressed={mode === 'files'} onClick={() => switchMode('files')}>Mis archivos</button>
        </div>
      </div>

      <div className="billing-layout">
        <section className="billing-results" aria-label="Resultado del cruce">
          {report ? <>
            <div className="billing-summary" aria-live="polite">
              <div className="billing-balance"><p>Pendiente en estos archivos</p><strong>{amount(balance)}</strong><span>{pending.length === 1 ? '1 trabajo pendiente' : `${pending.length} trabajos pendientes`}</span></div>
              <dl className="billing-summary-stats">
                <div><dt>Facturados</dt><dd>{verified.length}</dd></div>
                <div><dt>Por revisar</dt><dd>{reviews.length}</dd></div>
              </dl>
            </div>
            <div className="billing-ledger">
              <div className="billing-ledger-head"><h2>Trabajos revisados</h2><button type="button" className="billing-button" onClick={exportReport}><Download size={16} aria-hidden="true" /> Exportar CSV</button></div>
              <div className="billing-filters" role="group" aria-label="Filtrar trabajos">
                {filters.map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{count[id]}</span></button>)}
              </div>
              {visible.length ? <table className="billing-table">
                <thead><tr><th scope="col">Trabajo</th><th scope="col">Facturado / previsto</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {visible.map(item => <tr key={item.reference}>
                    <th scope="row"><span className="billing-work">{item.concept}</span><span className="billing-reference">{item.reference}{item.invoices.length ? ` · ${item.invoices.join(', ')}` : ''}</span></th>
                    <td className="billing-amount"><span>{amount(item.invoicedCents)}</span><span className="billing-reference">de {amount(item.expectedCents)}</span></td>
                    <td><span className="billing-status" data-status={item.status}>{statusLabels[item.status]}</span><span className="billing-case-detail">{item.detail}</span></td>
                  </tr>)}
                </tbody>
              </table> : <p className="billing-empty-list">{filter === 'all' ? 'Los archivos no contienen trabajos para mostrar.' : 'No hay trabajos con este estado.'}</p>}
              {unmatchedCount > 0 ? <p className="billing-ledger-note" role="status">{unmatchedCount === 1 ? 'Hay una línea de factura sin parte asociado en estos archivos.' : `Hay ${unmatchedCount} líneas de factura sin parte asociado en estos archivos.`} Comprueba sus referencias y el periodo exportado.</p> : null}
            </div>
          </> : <div className="billing-empty">
            <span className="billing-empty-icon" aria-hidden="true"><FileCheck2 size={24} /></span>
            <h2>{comparison?.error ? 'Revisa los archivos' : 'Carga los partes y las facturas'}</h2>
            {comparison?.error ? <p className="billing-error" role="alert">{comparison.error}</p> : <p>Cuando estén los dos CSV, verás los trabajos pendientes, los que requieren revisión y los ya facturados.</p>}
          </div>}
        </section>

        <aside className="billing-sources" aria-label="Archivos del cierre">
          <section className="billing-panel">
            <div className="billing-panel-title"><h2>Tus archivos</h2>{hasFiles ? <button className="billing-link" type="button" onClick={clearFiles}>Quitar archivos</button> : null}</div>
            <p className="billing-panel-copy">Carga los dos CSV de la misma empresa. Incluye las facturas que puedan corresponder a esos partes.</p>
            <FileInput slot="parts" upload={files.parts} onFile={readFile} />
            <FileInput slot="invoices" upload={files.invoices} onFile={readFile} />
            <details className="billing-formats">
              <summary><CircleHelp size={15} aria-hidden="true" /> Formato y plantillas CSV</summary>
              <div className="billing-format-body">
                {(['parts', 'invoices'] as const).map(slot => <div key={slot}>
                  <strong>{fileLabels[slot]}</strong>
                  <p><code>{formatFields[slot].join('; ')}</code></p>
                  <button type="button" className="billing-link" onClick={() => downloadCsv(slot === 'parts' ? 'plantilla-partes.csv' : 'plantilla-facturas.csv', toCsv(formatFields[slot], []))}><Download size={14} aria-hidden="true" /> Descargar plantilla de {fileLabels[slot].toLowerCase()}</button>
                </div>)}
                <p>Usa importes netos en euros. En partes, indica «sí» o «no». En facturas, indica «emitida», «borrador» o «anulada».</p>
              </div>
            </details>
          </section>

          {mode === 'demo' ? <section className="billing-panel billing-demo">
            <h2>Ejemplo ficticio</h2>
            <p className="billing-panel-copy" aria-live="polite">{rechecked ? 'La factura F-0266 figura ahora como emitida. El compresor pasa a facturado y sale del importe pendiente.' : 'El cambio de compresor aparece en un borrador. Comprueba qué cambia cuando la factura ya está emitida.'}</p>
            <button type="button" className="billing-button billing-primary" onClick={() => { setRechecked(current => !current); setFilter('all'); }}>
              {rechecked ? 'Volver al ejemplo inicial' : 'Ver con la factura emitida'}<ArrowRight size={16} aria-hidden="true" />
            </button>
          </section> : null}
        </aside>
      </div>
      <footer className="billing-footer">Los importes son netos y el resultado se limita a los archivos cargados.</footer>
    </main>
  </div>;
}
