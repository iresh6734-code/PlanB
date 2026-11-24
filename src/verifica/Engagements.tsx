// Plan B Verifica · pasos 1 y 2 del encargo en la pantalla (fase D, corte 1 del mega plan 2, 24/11/2026).
// Operación: los encargos de este equipo y crear uno. Fuentes: las dos capturas, el libro de facturas y las cifras
// declaradas, cada una con su estado, su huella y lo que falta para la sala limpia. Corte 2: emitir desde aquí el informe,
// la copia custodiada y su llave, cada uno por su lado; la llave solo se ofrece justo después de emitir. Solo existen cuando verifica.html la
// sirve el servidor local; cada vista tiene una parte que solo pinta (probada sin red) y un contenedor que llama a la API.
import React, { useCallback, useEffect, useState } from 'react';
import { ENGAGEMENT_LIMITS, ENGAGEMENT_ROLES, ROLE_LABEL, type EngagementRole, type EngagementView, type IssueSummary, type SourceState } from '../../shared/verifica/engagement.js';
import { createEngagement, EngagementApiError, issueCleanRoom, issueFile, listClosures, listEngagements, readEngagement, removeSource, uploadSource, type EngagementSummary } from './engagement-client.js';
import type { ClosureRecord } from '../../shared/verifica/expediente.js';
import { day, downloadJson, downloadText, readDocumentText, short, type VerificaDocument } from './documents.js';
import { Frame, type ReportOrigin } from './Masthead.js';
import { ExpedienteSection } from './Expediente.js';
import { QuestionsSection } from './Preguntas.js';

const STATE: Record<SourceState['status'], string> = { missing: 'Falta', ok: 'Sirve', waiting: 'En espera', invalid: 'No sirve' };
const ACCEPT: Record<EngagementRole, string> = { previous: '.json,application/json', latest: '.json,application/json', invoices: '.csv,text/csv', declarations: '.json,application/json' };
const HINT: Record<EngagementRole, string> = {
  previous: 'Captura del CRM hecha antes, para ver qué cambió. La saca el paso 3 (Capturas) o el lector (scripts/verifica-hubspot.ts).',
  latest: 'Captura más reciente del CRM, con su historial si HubSpot lo da. También sale del paso 3.',
  invoices: 'Libro de facturas emitidas en CSV, por ejemplo el de Holded guardado desde Excel. Opcional.',
  declarations: 'Lo que declara el vendedor: cartera abierta, clientes activos y renovación, en JSON. Opcional.',
};
const message = (error: unknown) => error instanceof EngagementApiError ? error.message : 'No se pudo completar la operación.';

export function OperationContent({ engagements, loadError, busy, createError, onCreate, onOpenEngagement }: {
  engagements: EngagementSummary[] | null; loadError: string | null; busy: boolean; createError: string | null;
  onCreate: (name: string) => void; onOpenEngagement: (id: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <>
      <section className="vf-card" aria-labelledby="vf-new">
        <h2 id="vf-new">Nuevo encargo</h2>
        <form className="vf-create" onSubmit={event => { event.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
          <label className="vf-field">
            <span className="vf-field-label">Nombre del encargo</span>
            <input className="vf-input vf-input-text" value={name} maxLength={ENGAGEMENT_LIMITS.nameChars} placeholder="Empresa que se vende y operación" onChange={event => setName(event.target.value)} />
          </label>
          <button type="submit" className="vf-primary" disabled={busy || !name.trim()}>{busy ? 'Creando…' : 'Crear encargo'}</button>
        </form>
        {createError && <p className="vf-error" role="alert">{createError}</p>}
      </section>

      <section className="vf-section" aria-labelledby="vf-engagements">
        <div className="vf-section-head"><h2 id="vf-engagements">Encargos</h2><p>Se guardan cifrados en este equipo</p></div>
        {loadError && <p className="vf-error" role="alert">{loadError}</p>}
        {engagements === null && !loadError && <p className="vf-empty" role="status">Leyendo los encargos…</p>}
        {engagements?.length === 0 && <p className="vf-empty">Todavía no hay ningún encargo en este equipo.</p>}
        {engagements && engagements.length > 0 && (
          <ul className="vf-engagements">
            {engagements.map(item => (
              <li key={item.id} className="vf-engagement">
                <div className="vf-engagement-text">
                  <h3>{item.name}</h3>
                  <p className="vf-trace">Creado el {day(item.createdAt)} · {item.stored} de {ENGAGEMENT_ROLES.length} fuentes</p>
                </div>
                <span className="vf-basis" data-basis={item.ready ? 'observed' : 'unverified'}>{item.issued ? 'Informe emitido' : item.ready ? 'Listo para la sala limpia' : 'Faltan fuentes'}</span>
                <button type="button" className="vf-secondary" onClick={() => onOpenEngagement(item.id)}>Abrir fuentes</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SourceRow({ state, busy, error, onUpload, onRemove }: { state: SourceState; busy: boolean; error: string | null; onUpload: (file: File) => void; onRemove: () => void }) {
  const inputId = 'vf-source-' + state.role;
  return (
    <li className="vf-source" data-status={state.status}>
      <div className="vf-source-body">
        <h3>{ROLE_LABEL[state.role]}</h3>
        <p className="vf-status"><span className="vf-source-state" data-status={state.status}>{busy ? 'Leyendo…' : STATE[state.status]}</span>
          {state.status !== 'missing' && <span className="vf-trace">{state.fileName} · guardado el {day(state.storedAt)}</span>}</p>
        {state.status === 'missing' && <p className="vf-summary">{HINT[state.role]}</p>}
        {state.status === 'ok' && <p className="vf-summary">{state.detail}{state.at ? ' · ' + day(state.at) : ''}</p>}
        {(state.status === 'invalid' || state.status === 'waiting') && <p className="vf-summary">{state.reason}</p>}
        {state.status === 'ok' && state.notes.map(note => <p key={note} className="vf-held">{note}</p>)}
        {state.status === 'ok' && <p className="vf-trace">Huella <code title={state.fingerprint}>{short(state.fingerprint)}</code></p>}
        {error && <p className="vf-error" role="alert">{error}</p>}
      </div>
      <div className="vf-source-actions">
        <label className="vf-secondary" htmlFor={inputId}>
          <input id={inputId} className="vf-file-input" type="file" accept={ACCEPT[state.role]} disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(file); }} />
          {state.status === 'missing' ? 'Subir archivo' : 'Cambiar archivo'}
        </label>
        {state.status !== 'missing' && <button type="button" className="vf-link" disabled={busy} onClick={onRemove}>Quitar</button>}
      </div>
    </li>
  );
}

export interface IssueControls {
  busy: boolean; error: string | null;
  /** La llave de la emisión que se acaba de hacer en esta pantalla. No se guarda: al salir, se pierde. */
  freshKey: string | null;
  onIssue: () => void; onDownload: (file: 'report' | 'custody') => void; onDownloadKey: () => void; onShowReport: () => void;
}

function IssuePanel({ view, controls }: { view: EngagementView; controls: IssueControls }) {
  const issue: IssueSummary | null | undefined = view.issue;
  const ready = view.missing.length === 0;
  if (!ready && !issue) {
    return <section className="vf-card" aria-labelledby="vf-next"><h2 id="vf-next">Siguiente paso</h2>
      <p className="vf-summary">Para pasar a la sala limpia faltan: {view.missing.map(item => item.replace(/\.$/, '').toLowerCase()).join('; ')}.</p></section>;
  }
  const reissue = !issue || issue.stale;
  return (
    <section className="vf-card vf-issue" aria-labelledby="vf-next">
      <h2 id="vf-next">{issue ? 'Informe emitido' : 'Sala limpia'}</h2>
      {issue
        ? <p className="vf-summary">Emitido el {day(issue.issuedAt)} · {issue.alarms === 0 ? 'ninguna de las ' + issue.findings + ' comprobaciones se sale de lo normal' : issue.alarms + ' de ' + issue.findings + ' comprobaciones se salen de lo normal'}. Huella del informe <code title={issue.reportFingerprint}>{short(issue.reportFingerprint)}</code>.</p>
        : <p className="vf-summary">La sala limpia saca tres cosas por separado: el informe para el comprador, la copia custodiada para quien la guarda y la llave de esa copia. Si se cuela un nombre, un correo, un NIF o un ID del CRM, no sale nada.</p>}
      {issue?.stale && <p className="vf-held">Alguna fuente cambió después de emitir: este informe ya no corresponde a las fuentes de arriba. Vuelve a emitirlo.</p>}
      {!ready && issue && <p className="vf-held">Para volver a emitir faltan: {view.missing.map(item => item.replace(/\.$/, '').toLowerCase()).join('; ')}.</p>}
      {controls.freshKey && (
        <div className="vf-key-box" role="status">
          <p><strong>Guarda ahora la llave de la copia.</strong> No se guarda en ningún sitio: si la pierdes, habrá que volver a emitir. Entrégala a quien custodie la copia, por un camino distinto del informe.</p>
          <button type="button" className="vf-secondary" onClick={controls.onDownloadKey}>Descargar la llave</button>
        </div>
      )}
      <div className="vf-issue-actions">
        {reissue && ready && <button type="button" className="vf-primary" disabled={controls.busy} onClick={controls.onIssue}>{controls.busy ? 'Emitiendo…' : issue ? 'Volver a emitir' : 'Emitir el informe'}</button>}
        {issue && <button type="button" className="vf-secondary" onClick={() => controls.onDownload('report')}>Descargar el informe</button>}
        {issue && <button type="button" className="vf-secondary" onClick={() => controls.onDownload('custody')}>Descargar la copia custodiada</button>}
        {issue && <button type="button" className="vf-link" onClick={controls.onShowReport}>Ver el informe</button>}
      </div>
      {controls.error && <p className="vf-error" role="alert">{controls.error}</p>}
    </section>
  );
}

export function SourcesContent({ view, busyRole, errors, onUpload, onRemove, issue }: {
  view: EngagementView; busyRole: EngagementRole | null; errors: Partial<Record<EngagementRole, string>>;
  onUpload: (role: EngagementRole, file: File) => void; onRemove: (role: EngagementRole) => void; issue: IssueControls;
}) {
  return (
    <>
      <section className="vf-section" aria-labelledby="vf-sources-h">
        <div className="vf-section-head"><h2 id="vf-sources-h">Fuentes</h2><p>Cada huella es la que firmará el informe</p></div>
        <ol className="vf-sources-list">
          {ENGAGEMENT_ROLES.map(role => (
            <SourceRow key={role} state={view.sources[role]} busy={busyRole === role} error={errors[role] ?? null}
              onUpload={file => onUpload(role, file)} onRemove={() => onRemove(role)} />
          ))}
        </ol>
      </section>
      <IssuePanel view={view} controls={issue} />
    </>
  );
}

export function OperationPage({ origin, onOpenEngagement, onOpen, openError }: {
  origin: ReportOrigin; onOpenEngagement: (id: string) => void; onOpen?: (file: File) => void; openError?: string | null;
}) {
  const [engagements, setEngagements] = useState<EngagementSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closures, setClosures] = useState<ClosureRecord[]>([]);
  useEffect(() => {
    let live = true;
    listEngagements().then(list => { if (live) setEngagements(list); }, error => { if (live) setLoadError(message(error)); });
    listClosures().then(list => { if (live) setClosures(list); }, () => { /* sin lista de cierres */ });
    return () => { live = false; };
  }, []);
  const create = (name: string) => {
    setBusy(true); setCreateError(null);
    createEngagement(name).then(view => onOpenEngagement(view.engagement.id), error => setCreateError(message(error))).finally(() => setBusy(false));
  };
  return (
    <Frame origin={origin} current="operation" eyebrow="Paso 1 · Operación" title="Encargos de este equipo" onOpen={onOpen} openError={openError}
      lede="Cada encargo reúne lo que entra en la sala limpia: dos capturas del CRM, las facturas y lo que declara el vendedor. Se guarda cifrado en este equipo y nada sale de aquí.">
      <OperationContent engagements={engagements} loadError={loadError} busy={busy} createError={createError} onCreate={create} onOpenEngagement={onOpenEngagement} />
      {closures.length > 0 && (
        <section className="vf-section" aria-labelledby="vf-closures">
          <div className="vf-section-head"><h2 id="vf-closures">Encargos cerrados</h2><p>Sus datos se borraron; queda el acta</p></div>
          <ul className="vf-engagements">
            {[...closures].reverse().map(c => (
              <li key={c.fingerprint} className="vf-engagement vf-record">
                <div className="vf-engagement-text">
                  <h3>Cerrado el {day(c.closedAt)}</h3>
                  <p className="vf-trace">{c.deleted.rows} {c.deleted.rows === 1 ? 'dato borrado' : 'datos borrados'} · expediente {c.ledgerIntact ? 'íntegro' : 'con problemas'} al cerrar · acta <code title={c.fingerprint}>{short(c.fingerprint)}</code></p>
                </div>
                <button type="button" className="vf-secondary" onClick={() => downloadJson(JSON.stringify(c, null, 2) + '\n', 'verifica-acta-cierre-' + short(c.fingerprint) + '.json')}>Descargar el acta</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {origin.kind === 'local' && <p className="vf-head-row"><a className="vf-secondary" href="/inicio">Copia de trabajo</a></p>}
    </Frame>
  );
}

export function SourcesPage({ origin, engagementId, onOpen, openError, onShowReport, onClosed }: {
  origin: ReportOrigin; engagementId: string | null; onOpen?: (file: File) => void; openError?: string | null;
  /** Abre el informe emitido en el visor (paso 4), con la comprobación de la copia custodiada. */
  onShowReport?: (doc: VerificaDocument, name: string) => void;
  /** Mega Plan 3: el encargo se ha cerrado y borrado; la página vuelve a Operación. */
  onClosed?: () => void;
}) {
  const [ledgerTick, setLedgerTick] = useState(0);
  const [view, setView] = useState<EngagementView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState<EngagementRole | null>(null);
  const [errors, setErrors] = useState<Partial<Record<EngagementRole, string>>>({});
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  useEffect(() => { setFreshKey(null); setIssueError(null); }, [engagementId]);
  useEffect(() => {
    if (!engagementId) return;
    let live = true;
    setView(null); setLoadError(null);
    readEngagement(engagementId).then(next => { if (live) setView(next); }, error => { if (live) setLoadError(message(error)); });
    return () => { live = false; };
  }, [engagementId]);
  const act = useCallback((role: EngagementRole, run: () => Promise<EngagementView>) => {
    setBusyRole(role); setErrors(previous => ({ ...previous, [role]: undefined }));
    run().then(setView, error => setErrors(previous => ({ ...previous, [role]: message(error) }))).finally(() => setBusyRole(null));
  }, []);
  const name = (file: string, fingerprint?: string) => 'verifica-' + file + '-' + short(fingerprint ?? view?.issue?.reportFingerprint ?? 'encargo');
  const issueControls: IssueControls = {
    busy: issueBusy, error: issueError, freshKey,
    onIssue: () => {
      if (!engagementId) return;
      setIssueBusy(true); setIssueError(null); setFreshKey(null);
      issueCleanRoom(engagementId).then(result => {
        setFreshKey(result.key);
        return readEngagement(engagementId).then(setView);
      }, error => setIssueError(message(error))).finally(() => setIssueBusy(false));
    },
    onDownload: file => {
      if (!engagementId) return;
      setIssueError(null);
      issueFile(engagementId, file).then(text => downloadJson(text, name(file === 'report' ? 'informe' : 'copia') + '.json'), error => setIssueError(message(error)));
    },
    onDownloadKey: () => { if (freshKey) downloadText(freshKey + '\n', name('llave') + '.txt'); },
    onShowReport: () => {
      if (!engagementId || !view) return;
      setIssueError(null);
      issueFile(engagementId, 'report').then(text => {
        const doc = readDocumentText(text);
        if (typeof doc === 'string') setIssueError('El informe emitido ' + doc + '.');
        else onShowReport?.(doc, 'Informe de «' + view.engagement.name + '» · emitido en este equipo');
      }, error => setIssueError(message(error)));
    },
  };
  const title = !engagementId ? 'Elige un encargo' : !view ? 'Fuentes del encargo' : view.missing.length === 0 ? 'Listo para la sala limpia' : 'Faltan fuentes para la sala limpia';
  return (
    <Frame origin={origin} current="sources" eyebrow={'Paso 2 · Fuentes' + (view ? ' · ' + view.engagement.name : '')} title={title} onOpen={onOpen} openError={openError} busy={!!engagementId && !view && !loadError}
      lede={!engagementId ? 'Crea o abre un encargo en el paso 1 para subir sus fuentes.' : 'Sube cada archivo tal como lo dio el lector o el vendedor. Una fuente que no sirve no se guarda, y se explica por qué.'}>
      {loadError && <p className="vf-error" role="alert">{loadError}</p>}
      {engagementId && !view && !loadError && <p className="vf-empty" role="status">Leyendo el encargo…</p>}
      {view && engagementId && <SourcesContent view={view} busyRole={busyRole} errors={errors} issue={issueControls}
        onUpload={(role, file) => act(role, () => uploadSource(engagementId, role, file))}
        onRemove={role => act(role, () => removeSource(engagementId, role))} />}
      {view && engagementId && view.issue && <QuestionsSection engagementId={engagementId} refreshKey={view.issue.issuedAt} onAnswered={() => setLedgerTick(t => t + 1)} />}
      {view && engagementId && <ExpedienteSection engagementId={engagementId} name={view.engagement.name} issued={!!view.issue}
        refreshKey={view.engagement.updatedAt + '|' + (view.issue?.issuedAt ?? '') + '|' + ledgerTick} onClosed={() => onClosed?.()} />}
    </Frame>
  );
}
