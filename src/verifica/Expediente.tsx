// Plan B Verifica · el expediente del encargo en la pantalla (Mega Plan 3, fase 1). Dentro de Fuentes, sin paso nuevo: la
// línea de tiempo de la cadena privada con su comprobación, el paquete del comprador (solo lo compartible, elegido uno a
// uno) y el cierre del encargo, que borra sus datos y deja un acta. Además, la vista del paquete en el visor sin conexión,
// que es lo que abre el comprador. Como en los demás pasos, una parte solo pinta (probada sin red) y otra llama a la API.
import React, { useEffect, useState } from 'react';
import type { ClosureRecord, ExpedienteView, LedgerEntry } from '../../shared/verifica/expediente.js';
import { ROLE_LABEL } from '../../shared/verifica/engagement.js';
import { verifyPackage, type BuyerPackage } from '../../shared/verifica/paquete.js';
import { buyerPackage, closeEngagement, EngagementApiError, readExpediente } from './engagement-client.js';
import { day, downloadJson, short, type VerificaDocument } from './documents.js';
import { Fingerprint, Frame, type ReportOrigin } from './Masthead.js';

const message = (error: unknown) => error instanceof EngagementApiError ? error.message : 'No se pudo completar la operación.';
const time = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const EVENT_LABEL: Record<LedgerEntry['event'], string> = {
  'source-stored': 'Fuente guardada',
  'source-removed': 'Fuente retirada',
  'report-issued': 'Informe emitido',
  'watch-signing': 'Captura de firma fijada',
  'watch-capture': 'Captura semanal de la vigilancia',
  'watch-accepted': 'Captura retenida aceptada',
  'answer-declared': 'Respuesta del vendedor',
  'package-issued': 'Paquete del comprador',
  'engagement-closed': 'Encargo cerrado',
};
const ORIGIN: Record<string, string> = { file: 'subida a mano', 'hubspot-read': 'leída de HubSpot', rotate: 'pasa a anterior', watch: 'vigilancia' };

function entryDetail(entry: LedgerEntry): string {
  const parts: string[] = [];
  if (entry.data.role) parts.push(ROLE_LABEL[entry.data.role]);
  if (entry.data.origin && entry.event === 'source-stored') parts.push(ORIGIN[entry.data.origin] ?? entry.data.origin);
  if (entry.refs.some(r => r.kind === 'read-record')) parts.push('con acta de lectura');
  if (entry.refs.some(r => r.replaced) && entry.event === 'source-stored') parts.push('sustituye a otra');
  return parts.join(' · ');
}

export interface PackageControls { busy: boolean; error: string | null; onBuild: (include: { watch: boolean; answers: boolean }) => void }
export interface CloseControls { busy: boolean; error: string | null; onClose: (confirmName: string) => void }

export function ExpedienteContent({ name, view, loadError, issued, pkg, close }: {
  name: string; view: ExpedienteView | null; loadError: string | null; issued: boolean; pkg: PackageControls; close: CloseControls;
}) {
  const [watch, setWatch] = useState(false);
  const [answers, setAnswers] = useState(false);
  const [confirm, setConfirm] = useState('');
  const head = view?.entries.at(-1) ?? null;
  const anchorsOk = view ? view.anchors.every(a => a.ok) : true;
  const intact = !!view && view.verification.intact && anchorsOk;
  const broken = !view ? '' : !view.verification.intact ? (view.verification.first?.message ?? 'La cadena no cuadra.') + (view.verification.first?.sequence ? ' (entrada ' + view.verification.first.sequence + ')' : '')
    : 'Falta la entrada que fijó una emisión: alguien ha recortado o rehecho la cadena.';
  return (
    <>
      <section className="vf-section" aria-labelledby="vf-expediente">
        <div className="pb-section-head"><h2 id="vf-expediente">Expediente</h2><p>Cada paso del encargo, encadenado al anterior por su huella</p></div>
        {loadError && <p className="pb-error" role="alert">{loadError}</p>}
        {!view && !loadError && <p className="pb-empty" role="status">Leyendo el expediente…</p>}
        {view && view.entries.length === 0 && <p className="pb-empty">Todavía no hay nada en el expediente: empieza al guardar la primera fuente.</p>}
        {view && head && (
          <>
            <Fingerprint label={'Última entrada del expediente · ' + view.entries.length + (view.entries.length === 1 ? ' entrada' : ' entradas')} value={head.fingerprint} intact={intact} broken={broken} />
            <ol className="vf-ledger">
              {[...view.entries].reverse().map(entry => (
                <li key={entry.sequence} className="vf-ledger-entry">
                  <span className="vf-index" aria-hidden="true">{String(entry.sequence).padStart(2, '0')}</span>
                  <div className="vf-ledger-text">
                    <p className="vf-ledger-event">{EVENT_LABEL[entry.event] ?? entry.event}{entryDetail(entry) ? <span className="pb-trace"> · {entryDetail(entry)}</span> : null}</p>
                    <p className="pb-trace">{time(entry.recordedAt)} · huella <code title={entry.fingerprint}>{short(entry.fingerprint)}</code></p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="pb-note">El expediente se queda en este equipo: guarda huellas, no nombres ni datos del CRM. Las emisiones y el paquete del comprador llevan su última entrada, para que un recorte se pueda detectar desde fuera.</p>
          </>
        )}
      </section>

      <section className="pb-card vf-issue" aria-labelledby="vf-package">
        <h2 id="vf-package">Paquete del comprador</h2>
        <p className="pb-summary">Un solo archivo con lo que se puede compartir, que el comprador comprueba sin conexión en este mismo visor. Nunca lleva autorizaciones, actas, fuentes, la sal ni la copia custodiada.</p>
        {!issued
          ? <p className="pb-held">Primero hay que emitir el informe: el paquete siempre lo lleva.</p>
          : (
            <form className="vf-read-form" onSubmit={event => { event.preventDefault(); pkg.onBuild({ watch, answers }); }}>
              <fieldset className="pb-choice" disabled={pkg.busy}>
                <legend className="pb-field-label">Qué lleva, además del informe</legend>
                <label className="pb-option"><input type="checkbox" checked={watch} onChange={event => setWatch(event.target.checked)} />
                  <span className="pb-option-text"><span className="pb-option-label">El parte de vigilancia</span><span className="pb-option-note">Si el encargo tiene vigilancia desde la firma.</span></span></label>
                <label className="pb-option"><input type="checkbox" checked={answers} onChange={event => setAnswers(event.target.checked)} />
                  <span className="pb-option-text"><span className="pb-option-label">Las respuestas del vendedor</span><span className="pb-option-note">Van como «declarado», atadas a la huella del informe.</span></span></label>
              </fieldset>
              <div className="vf-issue-actions"><button type="submit" className="pb-secondary" disabled={pkg.busy}>{pkg.busy ? 'Preparando…' : 'Descargar el paquete'}</button></div>
            </form>
          )}
        {pkg.error && <p className="pb-error" role="alert">{pkg.error}</p>}
      </section>

      <section className="pb-card vf-issue vf-danger" aria-labelledby="vf-close">
        <h2 id="vf-close">Cerrar el encargo</h2>
        <p className="pb-summary">Al terminar, se borran de este equipo las fuentes, las capturas, las actas, las emisiones, la vigilancia y el expediente. Queda un acta mínima con lo que se borró, sin nombres ni datos del CRM. No se puede deshacer.</p>
        <form className="vf-create" onSubmit={event => { event.preventDefault(); if (confirm.trim() === name) close.onClose(confirm.trim()); }}>
          <label className="pb-field">
            <span className="pb-field-label">Escribe «{name}» para confirmar</span>
            <input className="pb-input pb-input-text" value={confirm} autoComplete="off" spellCheck={false} disabled={close.busy} onChange={event => setConfirm(event.target.value)} />
          </label>
          <button type="submit" className="pb-secondary pb-danger-button" disabled={close.busy || confirm.trim() !== name}>{close.busy ? 'Cerrando…' : 'Cerrar y borrar'}</button>
        </form>
        {close.error && <p className="pb-error" role="alert">{close.error}</p>}
      </section>
    </>
  );
}

export function ExpedienteSection({ engagementId, name, issued, refreshKey, onClosed }: {
  engagementId: string; name: string; issued: boolean; refreshKey: string; onClosed: (closure: ClosureRecord) => void;
}) {
  const [view, setView] = useState<ExpedienteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    readExpediente(engagementId).then(next => { if (live) { setView(next); setLoadError(null); } }, error => { if (live) setLoadError(message(error)); });
    return () => { live = false; };
  }, [engagementId, refreshKey, tick]);
  const pkg: PackageControls = {
    busy: pkgBusy, error: pkgError,
    onBuild: include => {
      setPkgBusy(true); setPkgError(null);
      buyerPackage(engagementId, include).then(text => {
        downloadJson(text, 'verifica-paquete-' + short(JSON.parse(text).fingerprint) + '.json');
        setTick(t => t + 1);
      }, error => setPkgError(message(error))).finally(() => setPkgBusy(false));
    },
  };
  const close: CloseControls = {
    busy: closeBusy, error: closeError,
    onClose: confirmName => {
      setCloseBusy(true); setCloseError(null);
      closeEngagement(engagementId, confirmName).then(({ closure }) => {
        downloadJson(JSON.stringify(closure, null, 2) + '\n', 'verifica-acta-cierre-' + short(closure.fingerprint) + '.json');
        onClosed(closure);
      }, error => { setCloseError(message(error)); setCloseBusy(false); });
    },
  };
  return <ExpedienteContent name={name} view={view} loadError={loadError} issued={issued} pkg={pkg} close={close} />;
}

/** El paquete del comprador abierto en el visor: su comprobación y cada documento, que se abre con su propia vista. */
export function PackageView({ pkg, origin, onOpen, openError, onOpenDocument }: {
  pkg: BuyerPackage; origin: ReportOrigin; onOpen?: (file: File) => void; openError?: string | null; onOpenDocument: (doc: VerificaDocument, label: string) => void;
}) {
  const check = verifyPackage(pkg);
  // Las respuestas se nombran por el hallazgo al que contestan, tal como lo titula el informe del paquete.
  const titles = new Map(pkg.documents.flatMap(d => d.kind === 'report' ? d.content.findings.map(f => [f.rule, f.title] as const) : []));
  const open = (index: number) => {
    const doc = pkg.documents[index];
    if (doc.kind === 'report') onOpenDocument({ kind: 'report', report: doc.content }, 'Informe del paquete');
    else if (doc.kind === 'watch') onOpenDocument({ kind: 'watch', report: doc.content }, 'Parte del paquete');
    else if (doc.kind === 'equivalence') onOpenDocument({ kind: 'migration', report: doc.content }, 'Equivalencia del paquete');
  };
  return (
    <Frame origin={origin} current="report" eyebrow={'Paquete del comprador · preparado el ' + day(pkg.createdAt)} onOpen={onOpen} openError={openError}
      title={check.intact ? 'El paquete está íntegro' : 'El paquete no está íntegro'}
      lede={check.intact ? 'Ningún documento ha cambiado desde que se preparó. La huella no acredita quién lo emitió ni que las cifras comerciales sean exactas.' : 'Algo se ha añadido, quitado o retocado después de prepararlo. Mira qué documento falla.'}>
      <section className="pb-card" aria-labelledby="vf-package-checks">
        <h2 id="vf-package-checks">Comprobación</h2>
        <ul className="vf-engagements">
          {check.checks.map((item, index) => (
            <li key={index} className="vf-engagement vf-record">
              <div className="vf-engagement-text"><h3>{item.label}</h3>{item.problem && <p className="pb-error">{item.problem}</p>}</div>
              <span className="pb-check" data-ok={item.ok ? 'true' : 'false'}>{item.ok ? 'Coincide con su huella' : 'No coincide'}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="vf-section" aria-labelledby="vf-package-docs">
        <div className="pb-section-head"><h2 id="vf-package-docs">Documentos</h2><p>Se abren aquí mismo, sin conexión</p></div>
        <ul className="vf-engagements">
          {pkg.documents.map((doc, index) => (
            <li key={index} className="vf-engagement vf-record">
              <div className="vf-engagement-text">
                <h3>{doc.kind === 'report' ? 'Informe de verificación' : doc.kind === 'watch' ? 'Parte de vigilancia' : doc.kind === 'equivalence' ? 'Informe de equivalencia' : 'Respuestas del vendedor (declarado)'}</h3>
                <p className="pb-trace">Huella <code title={doc.fingerprint}>{short(doc.fingerprint)}</code></p>
                {doc.kind === 'answers' && doc.content.answers.map(a => <p key={a.question} className="pb-summary"><strong>{titles.get(a.question) ?? 'Hallazgo'}.</strong> {a.text}</p>)}
              </div>
              {doc.kind !== 'answers' && <button type="button" className="pb-secondary" onClick={() => open(index)}>Abrir</button>}
            </li>
          ))}
        </ul>
        {pkg.ledgerHead && <p className="pb-note">Última entrada del expediente del vendedor al preparar el paquete: la {pkg.ledgerHead.sequence}, huella <code title={pkg.ledgerHead.fingerprint}>{short(pkg.ledgerHead.fingerprint)}</code>. Guárdala: permite comprobar después que su expediente no se ha recortado.</p>}
      </section>
    </Frame>
  );
}
