// Plan B Verifica · el informe (fases 0 y 2). Pinta el de la empresa con trampas o uno abierto desde un archivo, tal como lo
// entrega shared/verifica: página 1 con los hallazgos, página 2 con lo que no se pudo comprobar, y la huella al pie.
// Con un informe abierto, además, se comprueba contra su copia custodiada. Nada sale del navegador.
// Cada cifra sale una sola vez, en la frase de su hallazgo; no se repite en tablas.
import React, { useMemo, useState } from 'react';
import { buildTrapCompany } from '../../shared/verifica/empresa-con-trampas.js';
import { buildVerificaReport, parseReport, reportToJson, verifyReport, ReportFormatError, type ReportSource, type VerificaReport } from '../../shared/verifica/report.js';
import type { VerificaBasis } from '../../shared/verifica/model.js';
import { CustodyCheck } from './CustodyCheck.js';

export type Variant = 'traps' | 'clean';

const BASIS: Record<VerificaBasis, string> = { observed: 'Observado', declared: 'Declarado por el vendedor', unverified: 'Sin comprobar' };
const ROLE: Record<ReportSource['role'], string> = { previous: 'Captura anterior', latest: 'Captura más reciente', invoices: 'Facturas' };
const VARIANT: Record<Variant, string> = { traps: 'Con trampas', clean: 'Sin trampas' };

export function referenceReport(variant: Variant): VerificaReport {
  const company = buildTrapCompany({ traps: variant === 'traps' });
  return buildVerificaReport({ asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations, salt: company.salt });
}

const day = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
const short = (fingerprint: string) => fingerprint.slice(0, 12);

function download(report: VerificaReport) {
  const url = URL.createObjectURL(new Blob([reportToJson(report)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'verifica-informe-' + short(report.fingerprint) + '.json';
  link.click();
  URL.revokeObjectURL(url);
}

const MAX_REPORT_FILE = 5 * 1024 * 1024;

/** Lee un informe de un archivo. Devuelve el informe o por qué no se puede abrir («no es…»). */
export function readReportText(text: string): VerificaReport | string {
  try { return parseReport(JSON.parse(text)); }
  catch (error) { return error instanceof ReportFormatError ? 'no es un informe de Verifica' : 'no es un archivo JSON válido'; }
}

export type ReportOrigin =
  | { kind: 'reference'; variant: Variant; onVariant?: (variant: Variant) => void }
  | { kind: 'opened'; name: string; onReference?: () => void };

function OpenReport({ label, onOpen }: { label: string; onOpen?: (file: File) => void }) {
  return (
    <label className="vf-secondary">
      <input className="vf-file-input" type="file" accept=".json,application/json"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onOpen?.(file); }} />
      {label}
    </label>
  );
}

export function VerificaReportView({ report, origin, onOpen, openError }: { report: VerificaReport; origin: ReportOrigin; onOpen?: (file: File) => void; openError?: string | null }) {
  const alarms = report.findings.filter(f => f.alarm).length;
  const intact = verifyReport(report);
  return (
    <main className="vf-page">
      <header className="vf-head">
        <div className="vf-head-row">
          <p className="vf-product">Plan B Verifica</p>
          {origin.kind === 'reference'
            ? <p className="vf-fiction" role="note">Empresa ficticia · todos los datos son inventados</p>
            : <p className="vf-origin">{origin.name} · abierto en este navegador, no se envía a ningún sitio</p>}
        </div>
        <h1>Informe de verificación de la cartera</h1>
        <p className="vf-lede">
          Corte del {day(report.asOf)}. {alarms === 0 ? 'Ninguna de las ' + report.findings.length + ' comprobaciones se sale de lo normal.' : alarms + ' de ' + report.findings.length + ' comprobaciones se salen de lo normal.'}
        </p>
        <div className="vf-actions">
          {origin.kind === 'reference'
            ? (
              <div className="vf-switch" role="group" aria-label="Variante de la empresa de referencia">
                {(Object.keys(VARIANT) as Variant[]).map(key => (
                  <button key={key} type="button" className="vf-switch-option" aria-pressed={origin.variant === key} onClick={() => origin.onVariant?.(key)}>{VARIANT[key]}</button>
                ))}
              </div>
            )
            : <button type="button" className="vf-link" onClick={() => origin.onReference?.()}>Volver al ejemplo</button>}
          <div className="vf-actions-end">
            <OpenReport label={origin.kind === 'reference' ? 'Abrir un informe' : 'Abrir otro informe'} onOpen={onOpen} />
            {origin.kind === 'reference' && <button type="button" className="vf-primary" onClick={() => download(report)}>Descargar informe</button>}
          </div>
        </div>
        {openError && <p className="vf-error" role="alert">{openError}</p>}
      </header>

      <section className="vf-sheet" aria-labelledby="vf-findings">
        <h2 id="vf-findings">Hallazgos</h2>
        <ol className="vf-findings">
          {report.findings.map(finding => (
            <li key={finding.rule} className="vf-finding" data-alarm={finding.alarm ? 'true' : 'false'}>
              <span className="vf-seal" aria-hidden="true" />
              <div className="vf-finding-body">
                <h3>{finding.title}</h3>
                <p className="vf-status">
                  <strong>{finding.alarm ? 'Se sale de lo normal' : 'Dentro de lo normal'}</strong>
                  <span className="vf-basis" data-basis={finding.basis}>{BASIS[finding.basis]}</span>
                </p>
                <p className="vf-summary">{finding.summary}</p>
                {finding.items.length > 0 && (
                  <details className="vf-refs">
                    <summary>{finding.items.length === 1 ? 'Ver la referencia' : 'Ver las ' + finding.items.length + ' referencias'}</summary>
                    <ul>
                      {finding.items.map(item => (
                        <li key={item.ref}><code>{item.ref}</code>{item.note ? <span> · {item.note}</span> : null}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="vf-trace">Sale de {finding.captures.map(short).join(' + ')}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="vf-sheet vf-sheet-next" aria-labelledby="vf-unverified">
        <h2 id="vf-unverified">Lo que no se pudo comprobar</h2>
        {report.notVerified.length === 0
          ? <p className="vf-empty">Con estas capturas y facturas se pudo comprobar todo.</p>
          : (
            <ul className="vf-unverified">
              {report.notVerified.map((item, index) => (
                <li key={item.rule + index}><strong>{item.topic}</strong> {item.reason}</li>
              ))}
            </ul>
          )}
      </section>

      <footer className="vf-foot">
        <h2>Fuentes y huella</h2>
        <dl className="vf-sources">
          {report.sources.map(source => (
            <div key={source.role}>
              <dt>{ROLE[source.role]}{source.at ? ' · ' + day(source.at) : ''}</dt>
              <dd><code>{short(source.fingerprint)}</code> {source.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="vf-fingerprint">
          <span>Huella del informe</span>
          <code>{report.fingerprint}</code>
          <span className="vf-check" data-ok={intact ? 'true' : 'false'}>{intact ? 'Coincide con el contenido' : 'No coincide: el informe se ha tocado'}</span>
        </p>
        <p className="vf-note">Los nombres no salen del lado del vendedor: cada referencia es un seudónimo con una sal que no viaja en el informe.</p>
      </footer>

      {origin.kind === 'opened' && <CustodyCheck key={report.fingerprint} report={report} />}
    </main>
  );
}

export default function VerificaReportPage() {
  const [variant, setVariant] = useState<Variant>('traps');
  const [opened, setOpened] = useState<{ name: string; report: VerificaReport } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const reference = useMemo(() => referenceReport(variant), [variant]);
  const open = (file: File) => {
    if (file.size > MAX_REPORT_FILE) { setOpenError('«' + file.name + '» es demasiado grande para ser un informe de Verifica. El informe que ves no ha cambiado.'); return; }
    file.text().then(text => {
      const result = readReportText(text);
      if (typeof result === 'string') setOpenError('«' + file.name + '» ' + result + '. El informe que ves no ha cambiado.');
      else { setOpened({ name: file.name, report: result }); setOpenError(null); }
    }, () => setOpenError('No se pudo leer «' + file.name + '».'));
  };
  const toReference = () => { setOpened(null); setOpenError(null); };
  return opened
    ? <VerificaReportView report={opened.report} origin={{ kind: 'opened', name: opened.name, onReference: toReference }} onOpen={open} openError={openError} />
    : <VerificaReportView report={reference} origin={{ kind: 'reference', variant, onVariant: setVariant }} onOpen={open} openError={openError} />;
}
