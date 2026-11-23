// Plan B Verifica · el informe de equivalencia (fase 4). Pinta el de la empresa migrada o uno abierto desde un archivo:
// objeto a objeto cuántos registros había al cierre, cuántos hay en el destino y cuántos llegaron igual; después las
// diferencias confirmadas y, en la segunda página, lo que no se pudo concluir, lo que el mapa no compara y los límites.
// Cada cifra sale una sola vez. Solo importa equivalence.ts: abrir un informe no carga el verificador.
import React from 'react';
import { equivalenceToJson, OBJECT_LABEL, VERDICT_TEXT, verifyEquivalenceReport, type EquivalenceFinding, type EquivalenceReport } from '../../shared/verifica/equivalence.js';
import { day, downloadJson, short } from './documents.js';
import { Fingerprint, Frame, Refs, type ReportOrigin } from './Masthead.js';

const TITLE = 'Informe de equivalencia de la migración';
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

function Finding({ finding }: { finding: EquivalenceFinding }) {
  return (
    <li className="vf-finding" data-alarm={finding.alarm ? 'true' : 'false'}>
      <span className="vf-seal" aria-hidden="true" />
      <div className="vf-finding-body">
        <h3>{OBJECT_LABEL[finding.object]}: {finding.title.toLowerCase()}</h3>
        <p className="vf-summary">{finding.summary}</p>
        <Refs items={finding.items} />
      </div>
    </li>
  );
}

export function EquivalenceReportView({ report, origin, onOpen, openError }: { report: EquivalenceReport; origin: ReportOrigin; onOpen?: (file: File) => void; openError?: string | null }) {
  const confirmed = report.findings.filter(f => f.alarm);
  const pending = report.findings.filter(f => !f.alarm);
  const intact = verifyEquivalenceReport(report);
  // Las demás razones del veredicto son sumas de los hallazgos; solo la exportación parcial dice algo que no está en ellos.
  const partial = report.verdictReasons.find(reason => reason.startsWith('Exportación parcial'));
  const tail = confirmed.length > 0
    ? ' en ' + plural(confirmed.length, 'punto', 'puntos') + (pending.length > 0 ? '; ' + pending.length + ' más ' + (pending.length === 1 ? 'no se puede concluir' : 'no se pueden concluir') : '')
    : pending.length > 0 ? ': ' + plural(pending.length, 'punto queda abierto', 'puntos quedan abiertos') : '';
  // El veredicto es la conclusión (h1); la frase de debajo dice qué se comparó y, si la hay, la exportación parcial.
  const lede = 'Captura del cierre del ' + day(report.closing.at) + ' frente al destino exportado el ' + day(report.target.exportedAt) + '.' + (partial ? ' ' + partial : '');
  return (
    <Frame origin={origin} current="migration" eyebrow={TITLE + ' · cierre del ' + day(report.closing.at)} title={VERDICT_TEXT[report.verdict] + tail + '.'} lede={lede} onOpen={onOpen} openError={openError}
      download={{ label: 'Descargar informe de equivalencia', run: () => downloadJson(equivalenceToJson(report), 'verifica-equivalencia-' + short(report.fingerprint) + '.json') }}>

      <section className="vf-sheet" aria-labelledby="vf-objects">
        <h2 id="vf-objects">Objeto a objeto</h2>
        <div className="vf-table-wrap">
          <table className="vf-objects">
            <thead>
              <tr><th scope="col">Objeto</th><th scope="col">Al cierre</th><th scope="col">En el destino</th><th scope="col">Llegaron igual</th></tr>
            </thead>
            <tbody>
              {report.objects.map(o => (
                <tr key={o.object}>
                  <th scope="row">{OBJECT_LABEL[o.object]}<span className="vf-target">{o.targetObject}</span></th>
                  <td>{o.closing}</td>
                  <td>{o.target}</td>
                  <td data-short={o.intact < o.closing ? 'true' : 'false'}>{o.intact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="vf-sheet" aria-labelledby="vf-differences">
        <h2 id="vf-differences">Diferencias confirmadas</h2>
        {confirmed.length === 0
          ? <p className="vf-empty">Ninguna en lo que compara el mapa.</p>
          : <ol className="vf-findings">{confirmed.map(f => <Finding key={f.object + f.kind} finding={f} />)}</ol>}
      </section>

      <section className="vf-sheet vf-sheet-next" aria-labelledby="vf-pending">
        <h2 id="vf-pending">Lo que no se pudo concluir ni comparar</h2>
        {pending.length > 0 && <ol className="vf-findings">{pending.map(f => <Finding key={f.object + f.kind} finding={f} />)}</ol>}
        <ul className="vf-unverified">
          {report.notCovered.map(line => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className="vf-sheet" aria-labelledby="vf-limits">
        <h2 id="vf-limits">Lo que este informe no dice</h2>
        <ul className="vf-unverified">
          {report.limits.map(line => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <footer className="vf-foot">
        <h2>Fuentes y huella</h2>
        <dl className="vf-sources">
          <div>
            <dt>Captura del cierre</dt>
            <dd><code>{short(report.closing.fingerprint)}</code> {report.closing.watch ? 'la última del parte de vigilancia ' + short(report.closing.watch) : 'sin parte de vigilancia que la respalde'}</dd>
          </div>
          <div>
            <dt>Exportación del destino</dt>
            <dd><code>{short(report.target.fingerprint)}</code> {report.target.provider}</dd>
          </div>
          <div>
            <dt>Mapa de campos · {day(report.map.confirmedAt)}</dt>
            <dd><code>{short(report.map.fingerprint)}</code> confirmado por {report.map.confirmedBy}</dd>
          </div>
        </dl>
        <Fingerprint label="Huella del informe" value={report.fingerprint} intact={intact} broken="No coincide: el informe se ha tocado" />
        <p className="vf-note">Los nombres no salen del lado del vendedor: cada referencia es un seudónimo con la misma sal que el parte de vigilancia. Lo que solo está en el destino lleva su propio seudónimo.</p>
      </footer>
    </Frame>
  );
}

/** Mientras llega el ejemplo, que se carga aparte. */
export function EquivalencePending({ origin, failed, onOpen, openError }: { origin: ReportOrigin; failed: boolean; onOpen?: (file: File) => void; openError?: string | null }) {
  return (
    <Frame origin={origin} current="migration" eyebrow={TITLE} title={failed ? 'No se pudo cargar el ejemplo' : 'Preparando el ejemplo…'} busy={!failed}
      lede={<span role="status">{failed ? 'Recarga la página para intentarlo de nuevo.' : 'El informe de equivalencia de la empresa de ejemplo se carga aparte.'}</span>} onOpen={onOpen} openError={openError} />
  );
}
