// Plan B Verifica · el parte de vigilancia (fase 3). Pinta el de la empresa vigilada o uno abierto desde un archivo:
// semana a semana lo que cambió frente a la captura anterior, qué captura se retuvo, la captura atrasada si la hay
// y, al cierre, la firma frente a la última captura. Cada cifra sale una sola vez, en la frase de su aviso.
import React from 'react';
import { buildWatchedCompany } from '../../shared/verifica/empresa-vigilada.js';
import { buildWatchReport, verifyWatchReport, watchReportToJson, WATCH_RULES, type WatchAlert, type WatchEntry, type WatchReport } from '../../shared/verifica/watch.js';
import { day, downloadJson, short } from './documents.js';
import { Fingerprint, Masthead, Refs, type ReportOrigin, type Variant } from './Masthead.js';

export function referenceWatch(variant: Variant): WatchReport {
  const company = buildWatchedCompany({ traps: variant === 'traps' });
  return buildWatchReport({ signing: company.signing, captures: company.captures, asOf: company.asOf, salt: company.salt });
}

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

function status(entry: WatchEntry): { label: string; tone: 'base' | 'ok' | 'held'; note: string | null } {
  if (entry.status === 'signing') return { label: 'Firma', tone: 'base', note: null };
  if (entry.status === 'retained') return { label: 'Retenida', tone: 'held', note: 'Encoge frente a la última captura aceptada (' + entry.shrink + '). No pasa a ser la base hasta que alguien la acepte.' };
  return entry.shrink
    ? { label: 'Aceptada a mano', tone: 'ok', note: 'Encogía frente a la base (' + entry.shrink + ') y se aceptó a mano.' }
    : { label: 'Aceptada', tone: 'ok', note: null };
}

function Alert({ alert }: { alert: WatchAlert }) {
  return (
    <li className="vf-alert" data-kind={alert.kind}>
      <h4>{alert.title}</h4>
      <p className="vf-summary">{alert.summary}</p>
      <Refs items={alert.items} />
    </li>
  );
}

function Finding({ alert }: { alert: WatchAlert }) {
  return (
    <li className="vf-finding" data-alarm="true">
      <span className="vf-seal" aria-hidden="true" />
      <div className="vf-finding-body">
        <h3>{alert.title}</h3>
        <p className="vf-summary">{alert.summary}</p>
        <Refs items={alert.items} />
      </div>
    </li>
  );
}

export function WatchReportView({ report, origin, onOpen, openError }: { report: WatchReport; origin: ReportOrigin; onOpen?: (file: File) => void; openError?: string | null }) {
  const weekly = report.entries.slice(1);
  const alerts = weekly.reduce((sum, entry) => sum + entry.alerts.length, 0) + (report.overdue ? 1 : 0);
  const retained = weekly.filter(entry => entry.status === 'retained').length;
  const last = report.entries.at(-1)!;
  const intact = verifyWatchReport(report);
  const lede = 'Firma del ' + day(report.signedAt) + ', parte del ' + day(report.asOf) + '. '
    + (alerts === 0 ? 'Ninguna de las ' + plural(weekly.length, 'captura semanal', 'capturas semanales') + ' se sale de lo normal.' : plural(alerts, 'aviso', 'avisos') + ' en ' + plural(weekly.length, 'captura semanal', 'capturas semanales') + '.')
    + (retained > 0 ? ' ' + (retained === 1 ? 'Una retenida' : retained + ' retenidas') + ' hasta que alguien las revise.' : '');
  return (
    <main className="vf-page">
      <Masthead origin={origin} title="Parte de vigilancia hasta el cierre" lede={lede} onOpen={onOpen} openError={openError}
        download={{ label: 'Descargar parte', run: () => downloadJson(watchReportToJson(report), 'verifica-vigilancia-' + short(report.fingerprint) + '.json') }} />

      {report.overdue && (
        <section className="vf-sheet" aria-labelledby="vf-overdue">
          <h2 id="vf-overdue">Ahora mismo</h2>
          <ol className="vf-findings"><Finding alert={report.overdue} /></ol>
        </section>
      )}

      <section className="vf-sheet" aria-labelledby="vf-weeks">
        <h2 id="vf-weeks">Semana a semana</h2>
        <ol className="vf-findings vf-weeks">
          {report.entries.map(entry => {
            const s = status(entry);
            return (
              <li key={entry.fingerprint} className="vf-finding" data-alarm={entry.alerts.length > 0 || entry.status === 'retained' ? 'true' : 'false'}>
                <span className="vf-seal" aria-hidden="true" />
                <div className="vf-finding-body">
                  <h3>{day(entry.at)}</h3>
                  <p className="vf-status">
                    <span className="vf-capture-status" data-tone={s.tone}>{s.label}</span>
                    <span>{entry.detail}</span>
                  </p>
                  {s.note && <p className="vf-held">{s.note}</p>}
                  {entry.alerts.length > 0 && <ul className="vf-alerts">{entry.alerts.map(alert => <Alert key={alert.kind} alert={alert} />)}</ul>}
                  <p className="vf-trace">Captura {short(entry.fingerprint)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="vf-sheet" aria-labelledby="vf-closing">
        <h2 id="vf-closing">Al cierre: la firma frente a la captura del {day(last.at)}</h2>
        {report.closing.alerts.length === 0
          ? <p className="vf-empty">Entre la firma y la última captura nada se sale de lo normal.</p>
          : <ol className="vf-findings">{report.closing.alerts.map(alert => <Finding key={alert.kind} alert={alert} />)}</ol>}
      </section>

      <footer className="vf-foot">
        <h2>Cómo se vigila y huella</h2>
        <p className="vf-rules">
          Una captura cada {report.cadenceDays} días; si pasan más de {report.cadenceDays + WATCH_RULES.graceDays} sin ninguna, se avisa.
          Cada captura se compara con la anterior para dar avisos y con la última aceptada para decidir si se retiene.
        </p>
        <Fingerprint label="Huella del parte" value={report.fingerprint} intact={intact} broken="No coincide: el parte se ha tocado" />
        <p className="vf-note">Los nombres no salen del lado del vendedor: cada referencia es un seudónimo con la misma sal que el informe, que no viaja en el parte.</p>
      </footer>
    </main>
  );
}
