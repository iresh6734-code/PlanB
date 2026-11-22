// Plan B Verifica · el informe (fases 0 y 2) y la página que lo sirve junto al parte de vigilancia (fase 3) y al informe de
// equivalencia (fase 4), cuyo ejemplo se carga aparte. Pinta el de
// la empresa con trampas o uno abierto desde un archivo, tal como lo entrega shared/verifica: página 1 con los hallazgos,
// página 2 con lo que no se pudo comprobar, y la huella al pie. Con un informe abierto, además, se comprueba contra su
// copia custodiada. Nada sale del navegador. Cada cifra sale una sola vez, en la frase de su hallazgo; no se repite en tablas.
import React, { useEffect, useMemo, useState } from 'react';
import { buildTrapCompany } from '../../shared/verifica/empresa-con-trampas.js';
import type { EquivalenceReport } from '../../shared/verifica/equivalence.js';
import { buildVerificaReport, reportToJson, verifyReport, type ReportSource, type VerificaReport } from '../../shared/verifica/report.js';
import type { VerificaBasis } from '../../shared/verifica/model.js';
import { CustodyCheck } from './CustodyCheck.js';
import { day, downloadJson, MAX_DOCUMENT_FILE, readDocumentText, short, type VerificaDocument } from './documents.js';
import { EquivalencePending, EquivalenceReportView } from './EquivalenceReport.js';
import { Fingerprint, Masthead, Refs, type DocKind, type ReportOrigin, type Variant } from './Masthead.js';
import { referenceWatch, WatchReportView } from './WatchReport.js';

const BASIS: Record<VerificaBasis, string> = { observed: 'Observado', declared: 'Declarado por el vendedor', unverified: 'Sin comprobar' };
const ROLE: Record<ReportSource['role'], string> = { previous: 'Captura anterior', latest: 'Captura más reciente', invoices: 'Facturas' };

export function referenceReport(variant: Variant): VerificaReport {
  const company = buildTrapCompany({ traps: variant === 'traps' });
  return buildVerificaReport({ asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations, salt: company.salt });
}

export function VerificaReportView({ report, origin, onOpen, openError }: { report: VerificaReport; origin: ReportOrigin; onOpen?: (file: File) => void; openError?: string | null }) {
  const alarms = report.findings.filter(f => f.alarm).length;
  const intact = verifyReport(report);
  const lede = 'Corte del ' + day(report.asOf) + '. ' + (alarms === 0 ? 'Ninguna de las ' + report.findings.length + ' comprobaciones se sale de lo normal.' : alarms + ' de ' + report.findings.length + ' comprobaciones se salen de lo normal.');
  return (
    <main className="vf-page">
      <Masthead origin={origin} title="Informe de verificación de la cartera" lede={lede} onOpen={onOpen} openError={openError}
        download={{ label: 'Descargar informe', run: () => downloadJson(reportToJson(report), 'verifica-informe-' + short(report.fingerprint) + '.json') }} />

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
                <Refs items={finding.items} />
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
        <Fingerprint label="Huella del informe" value={report.fingerprint} intact={intact} broken="No coincide: el informe se ha tocado" />
        <p className="vf-note">Los nombres no salen del lado del vendedor: cada referencia es un seudónimo con una sal que no viaja en el informe.</p>
      </footer>

      {origin.kind === 'opened' && <CustodyCheck key={report.fingerprint} report={report} />}
    </main>
  );
}

type Opened = { name: string; doc: VerificaDocument };

export default function VerificaReportPage() {
  const [variant, setVariant] = useState<Variant>('traps');
  const [doc, setDoc] = useState<DocKind>('report');
  const [opened, setOpened] = useState<Opened | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [equivalence, setEquivalence] = useState<Partial<Record<Variant, EquivalenceReport>>>({});
  const [equivalenceFailed, setEquivalenceFailed] = useState(false);
  useEffect(() => {
    if (doc !== 'migration' || equivalence[variant]) return;
    let live = true;
    import('./reference-equivalence.js').then(
      module => { if (live) setEquivalence(prev => ({ ...prev, [variant]: module.referenceEquivalence(variant) })); },
      () => { if (live) setEquivalenceFailed(true); });
    return () => { live = false; };
  }, [doc, variant, equivalence]);
  const reference = useMemo<VerificaDocument | null>(() => {
    if (doc === 'watch') return { kind: 'watch', report: referenceWatch(variant) };
    if (doc === 'migration') { const report = equivalence[variant]; return report ? { kind: 'migration', report } : null; }
    return { kind: 'report', report: referenceReport(variant) };
  }, [doc, variant, equivalence]);
  const open = (file: File) => {
    const keep = '. Lo que ves no ha cambiado.';
    if (file.size > MAX_DOCUMENT_FILE) { setOpenError('«' + file.name + '» es demasiado grande para ser un documento de Verifica' + keep); return; }
    file.text().then(text => {
      const result = readDocumentText(text);
      if (typeof result === 'string') setOpenError('«' + file.name + '» ' + result + keep);
      else { setOpened({ name: file.name, doc: result }); setOpenError(null); }
    }, () => setOpenError('No se pudo leer «' + file.name + '».'));
  };
  const toReference = () => { setOpened(null); setOpenError(null); };
  const shown = opened ? opened.doc : reference;
  const origin: ReportOrigin = opened
    ? { kind: 'opened', name: opened.name, onReference: toReference }
    : { kind: 'reference', variant, onVariant: setVariant, doc, onDoc: setDoc };
  return shown === null
    ? <EquivalencePending origin={origin} failed={equivalenceFailed} onOpen={open} openError={openError} />
    : shown.kind === 'watch'
      ? <WatchReportView report={shown.report} origin={origin} onOpen={open} openError={openError} />
      : shown.kind === 'migration'
        ? <EquivalenceReportView report={shown.report} origin={origin} onOpen={open} openError={openError} />
        : <VerificaReportView report={shown.report} origin={origin} onOpen={open} openError={openError} />;
}
