// Plan B Verifica · paso 3 del encargo en la pantalla: leer HubSpot (fase D, corte 3 del mega plan 2, 24/11/2026).
// La misma lectura que scripts/verifica-hubspot.ts, lanzada desde aquí: en la cuenta de la empresa, con su autorización
// firmada y un acta de lo que se leyó; en un portal de pruebas, con una confirmación y sin acta. La credencial se escribe
// en un campo de contraseña, viaja solo en la petición que arranca la lectura y se borra del campo en cuanto arranca. La
// captura entra como fuente del encargo (paso 2). Como en los pasos 1 y 2, una parte solo pinta (probada sin red) y un
// contenedor llama a la API.
import React, { useEffect, useRef, useState } from 'react';
import { READ_LIMITS, ROLE_LABEL, type EngagementView, type ReadJob, type ReadRequest, type ReadTarget, type RecordSummary } from '../../shared/verifica/engagement.js';
import { EngagementApiError, listRecords, readEngagement, readStatus, recordFile, startRead } from './engagement-client.js';
import { day, downloadJson, short } from './documents.js';
import { Frame, type ReportOrigin } from './Masthead.js';

type Mode = ReadRequest['mode'];
/** Lo que la persona rellena. Los dos archivos se leen en el contenedor, justo antes de enviar. */
export interface ReadForm { mode: Mode; portalId: string; token: string; target: ReadTarget; confirmFullRead: boolean; authorizationFile: File | null; documentFile: File | null }

const MODE: Record<Mode, { label: string; note: string }> = {
  client: { label: 'Cuenta de la empresa que se vende', note: 'Con su autorización firmada. Queda un acta de lo que se leyó.' },
  test: { label: 'Portal de pruebas de HubSpot', note: 'Solo cuentas de pruebas o sandbox. Sin acta.' },
};
const TARGET: Record<ReadTarget, string> = {
  previous: 'Como captura anterior',
  latest: 'Como captura más reciente',
  rotate: 'Como más reciente, y la actual pasa a anterior',
};
const JOB_TITLE: Record<ReadJob['state'], string> = { running: 'Leyendo HubSpot…', done: 'Lectura terminada', failed: 'Lectura detenida' };
const message = (error: unknown) => error instanceof EngagementApiError ? error.message : 'No se pudo completar la operación.';
const count = (n: number, one: string, many: string) => n.toLocaleString('es-ES') + ' ' + (n === 1 ? one : many);

/** Dónde conviene que entre la siguiente captura: primero la anterior, luego la reciente, y después se va rotando. */
export function defaultTarget(view: EngagementView): ReadTarget {
  if (view.sources.previous.status === 'missing') return 'previous';
  if (view.sources.latest.status === 'missing') return 'latest';
  return 'rotate';
}

function slotText(view: EngagementView, role: 'previous' | 'latest') {
  const state = view.sources[role];
  return ROLE_LABEL[role] + ': ' + (state.status === 'missing' ? 'falta' : state.fileName);
}

function FilePick({ id, label, accept, file, disabled, onPick }: { id: string; label: string; accept: string; file: File | null; disabled: boolean; onPick: (file: File | null) => void }) {
  return (
    <div className="pb-field">
      <span className="pb-field-label" id={id}>{label}</span>
      <div className="pb-file-row">
        <label className="pb-secondary">
          <input className="pb-file-input" type="file" accept={accept} aria-labelledby={id} disabled={disabled}
            onChange={event => { onPick(event.target.files?.[0] ?? null); event.target.value = ''; }} />
          {file ? 'Cambiar' : 'Elegir archivo'}
        </label>
        <span className="pb-file-name">{file ? file.name : 'Ningún archivo elegido'}</span>
      </div>
    </div>
  );
}

function JobPanel({ job, onShowSources, onDownloadRecord }: { job: ReadJob; onShowSources: () => void; onDownloadRecord: (captureId: string) => void }) {
  const result = job.result;
  return (
    <section className="pb-card vf-read-job" data-state={job.state} aria-labelledby="vf-read-job" aria-live="polite">
      <h2 id="vf-read-job">{JOB_TITLE[job.state]}</h2>
      {job.progress.length > 0 && (
        <ol className="vf-read-progress" aria-label="Lo leído hasta ahora">
          {job.progress.map((line, index) => <li key={index}>{line}</li>)}
        </ol>
      )}
      {job.state === 'running' && job.progress.length === 0 && <p className="pb-summary" role="status">Comprobando la cuenta antes de leer nada…</p>}
      {job.state === 'failed' && <p className="pb-error" role="alert">{job.error ?? 'La lectura se detuvo.'} No se ha guardado ninguna captura.</p>}
      {result && (
        <>
          <p className="pb-summary">Guardada como {ROLE_LABEL[result.role].toLowerCase()}: {count(result.counts.companies, 'empresa', 'empresas')}, {count(result.counts.contacts, 'contacto', 'contactos')}, {count(result.counts.deals, 'oportunidad', 'oportunidades')} y {count(result.counts.owners, 'comercial', 'comerciales')}, {result.historyAvailable ? 'con' : 'sin'} historial de etapas. {count(result.requests, 'petición', 'peticiones')} de solo lectura.</p>
          {result.recordFingerprint
            ? <p className="pb-trace">Acta de la lectura, huella <code title={result.recordFingerprint}>{short(result.recordFingerprint)}</code></p>
            : <p className="pb-trace">Portal de pruebas: esta lectura no deja acta.</p>}
          <div className="vf-issue-actions">
            <button type="button" className="pb-secondary" onClick={onShowSources}>Ver las fuentes</button>
            {result.recordFingerprint && <button type="button" className="pb-link" onClick={() => onDownloadRecord(result.captureId)}>Descargar el acta</button>}
          </div>
        </>
      )}
    </section>
  );
}

export function CapturesContent({ view, job, busy, error, records, recordsError, onStart, onShowSources, onDownloadRecord }: {
  view: EngagementView; job: ReadJob | null; busy: boolean; error: string | null;
  records: RecordSummary[] | null; recordsError: string | null;
  onStart: (form: ReadForm) => void; onShowSources: () => void; onDownloadRecord: (captureId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('client');
  const [portalId, setPortalId] = useState('');
  // La credencial no pasa por el estado de React: un campo controlado copia su valor al atributo del HTML. Se lee al
  // enviar y se vacía en cuanto el servidor acepta la lectura.
  const tokenField = useRef<HTMLInputElement>(null);
  const [hasToken, setHasToken] = useState(false);
  const [target, setTarget] = useState<ReadTarget>(() => defaultTarget(view));
  const [confirmFullRead, setConfirm] = useState(false);
  const [authorizationFile, setAuthorization] = useState<File | null>(null);
  const [documentFile, setDocument] = useState<File | null>(null);
  const running = job?.state === 'running';
  // En cuanto el servidor acepta la lectura, la credencial sale del campo: no se queda en la página.
  useEffect(() => { if (job?.startedAt && tokenField.current) { tokenField.current.value = ''; setHasToken(false); } }, [job?.startedAt]);
  // Cuando cambian las capturas guardadas, se propone el sitio de la siguiente.
  useEffect(() => { setTarget(defaultTarget(view)); }, [view.sources.previous.status, view.sources.latest.status]);
  const portalOk = /^\d{1,20}$/.test(portalId.trim());
  const ready = portalOk && hasToken && (mode === 'client' ? !!authorizationFile && !!documentFile : confirmFullRead);
  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = tokenField.current?.value.trim() ?? '';
    if (ready && token && !busy && !running) onStart({ mode, portalId: portalId.trim(), token, target, confirmFullRead, authorizationFile, documentFile });
  };
  const locked = busy || running;
  return (
    <>
      {/* La lectura en marcha o la última va primero: es lo que importa justo después de pulsar. */}
      {job && <JobPanel job={job} onShowSources={onShowSources} onDownloadRecord={onDownloadRecord} />}

      <section className="pb-card" aria-labelledby="vf-read-new">
        <h2 id="vf-read-new">{job ? 'Otra lectura' : 'Nueva lectura'}</h2>
        <form className="vf-read-form" onSubmit={submit}>
          <fieldset className="pb-choice" disabled={locked}>
            <legend className="pb-field-label">Qué cuenta se lee</legend>
            {(Object.keys(MODE) as Mode[]).map(key => (
              <label key={key} className="pb-option">
                <input type="radio" name="vf-read-mode" value={key} checked={mode === key} onChange={() => setMode(key)} />
                <span className="pb-option-text"><span className="pb-option-label">{MODE[key].label}</span><span className="pb-option-note">{MODE[key].note}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="vf-read-grid">
            <label className="pb-field">
              <span className="pb-field-label">Número de portal (Hub ID)</span>
              <input className="pb-input pb-input-text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={20} placeholder="Por ejemplo, 4400123" value={portalId} disabled={locked} onChange={event => setPortalId(event.target.value)} />
            </label>
            <label className="pb-field">
              <span className="pb-field-label">Credencial de la app privada</span>
              <input className="pb-input pb-input-text" type="password" autoComplete="off" spellCheck={false} placeholder="pat-…" ref={tokenField} disabled={locked} onChange={event => setHasToken(event.target.value.trim().length > 0)} />
              <span className="pb-field-note">Solo lectura. Se usa durante esta lectura y no se guarda en ningún sitio.</span>
            </label>
          </div>

          {mode === 'client'
            ? (
              <div className="vf-read-grid">
                <FilePick id="vf-read-authorization" label="Autorización (autorizacion.json)" accept=".json,application/json" file={authorizationFile} disabled={locked} onPick={setAuthorization} />
                <FilePick id="vf-read-document" label="Documento firmado" accept=".pdf,application/pdf" file={documentFile} disabled={locked} onPick={setDocument} />
                <p className="pb-field-note vf-read-wide">Antes de la primera petición se comprueba que la autorización es de este portal, que está vigente hoy, que cubre lo que se lee y que la huella del documento firmado coincide con la que figura en ella.</p>
              </div>
            )
            : (
              <label className="pb-option vf-confirm">
                <input type="checkbox" checked={confirmFullRead} disabled={locked} onChange={event => setConfirm(event.target.checked)} />
                <span className="pb-option-text"><span className="pb-option-label">Autorizo leer el portal de pruebas entero</span><span className="pb-option-note">Oportunidades con su historial, empresas, contactos y comerciales. Si el portal no es de pruebas, la lectura se para.</span></span>
              </label>
            )}

          <fieldset className="pb-choice" disabled={locked}>
            <legend className="pb-field-label">Dónde entra la captura</legend>
            <p className="pb-field-note">{slotText(view, 'previous')} · {slotText(view, 'latest')}</p>
            {(Object.keys(TARGET) as ReadTarget[]).map(key => (
              <label key={key} className="pb-option">
                <input type="radio" name="vf-read-target" value={key} checked={target === key} onChange={() => setTarget(key)} />
                <span className="pb-option-text"><span className="pb-option-label">{TARGET[key]}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="vf-issue-actions">
            <button type="submit" className="pb-primary" disabled={!ready || locked}>{busy ? 'Comprobando…' : running ? 'Leyendo…' : 'Leer HubSpot'}</button>
          </div>
          {error && <p className="pb-error" role="alert">{error}</p>}
        </form>
      </section>

      <section className="vf-section" aria-labelledby="vf-records">
        <div className="pb-section-head"><h2 id="vf-records">Actas de lectura</h2><p>Lo que se leyó, cuándo y con qué autorización</p></div>
        {recordsError && <p className="pb-error" role="alert">{recordsError}</p>}
        {records === null && !recordsError && <p className="pb-empty" role="status">Leyendo las actas…</p>}
        {records?.length === 0 && <p className="pb-empty">Todavía no hay actas. Cada lectura de la cuenta de la empresa deja una.</p>}
        {records && records.length > 0 && (
          <ul className="vf-engagements">
            {[...records].reverse().map(record => (
              <li key={record.captureId} className="vf-engagement vf-record">
                <div className="vf-engagement-text">
                  <h3>Lectura del {day(record.finishedAt)} · portal {record.portalId}</h3>
                  <p className="pb-trace">Encargo {record.engagement} · huella <code title={record.fingerprint}>{short(record.fingerprint)}</code></p>
                </div>
                <button type="button" className="pb-secondary" onClick={() => onDownloadRecord(record.captureId)}>Descargar el acta</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Lee los dos archivos del modo cliente y arma la petición. Lanza con un mensaje para la persona si no sirven. */
export async function buildReadRequest(form: ReadForm): Promise<ReadRequest> {
  const request: ReadRequest = { mode: form.mode, portalId: form.portalId, token: form.token, target: form.target };
  if (form.mode === 'test') return { ...request, confirmFullRead: form.confirmFullRead };
  const { authorizationFile, documentFile } = form;
  if (!authorizationFile || !documentFile) throw new EngagementApiError('Elige la autorización y el documento firmado.', 0);
  if (authorizationFile.size > READ_LIMITS.authorizationChars) throw new EngagementApiError('«' + authorizationFile.name + '» es demasiado grande para ser una autorización.', 413);
  if (documentFile.size > READ_LIMITS.documentBytes) throw new EngagementApiError('«' + documentFile.name + '» pasa de 10 MB: guarda el documento firmado en un PDF más ligero.', 413);
  try {
    return { ...request, authorization: await authorizationFile.text(), documentBase64: await fileBase64(documentFile) };
  } catch {
    throw new EngagementApiError('No se pudieron leer los archivos de la autorización.', 0);
  }
}

const POLL_MS = 700;

export function CapturesPage({ origin, engagementId, onOpen, openError, onShowSources }: {
  origin: ReportOrigin; engagementId: string | null; onOpen?: (file: File) => void; openError?: string | null; onShowSources: () => void;
}) {
  const [view, setView] = useState<EngagementView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [job, setJob] = useState<ReadJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const refresh = (id: string) => {
    readEngagement(id).then(next => { if (live.current) setView(next); }, failure => { if (live.current) setLoadError(message(failure)); });
    listRecords(id).then(next => { if (live.current) { setRecords(next); setRecordsError(null); } }, failure => { if (live.current) setRecordsError(message(failure)); });
  };
  useEffect(() => {
    setView(null); setLoadError(null); setJob(null); setError(null); setRecords(null); setRecordsError(null);
    if (!engagementId) return;
    refresh(engagementId);
    readStatus(engagementId).then(next => { if (live.current) setJob(next); }, () => { /* sin lectura que mostrar */ });
  }, [engagementId]);
  // Mientras la lectura sigue, se pregunta por ella; al terminar, se vuelven a leer las fuentes y las actas.
  useEffect(() => {
    if (!engagementId || job?.state !== 'running') return;
    const timer = setTimeout(() => {
      readStatus(engagementId).then(next => {
        if (!live.current) return;
        setJob(next);
        if (next && next.state !== 'running') refresh(engagementId);
      }, failure => { if (live.current) setError(message(failure)); });
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [engagementId, job]);
  const start = (form: ReadForm) => {
    if (!engagementId) return;
    setBusy(true); setError(null);
    buildReadRequest(form).then(request => startRead(engagementId, request)).then(
      next => { if (live.current) setJob(next); },
      failure => { if (live.current) setError(message(failure)); },
    ).finally(() => { if (live.current) setBusy(false); });
  };
  const downloadRecord = (captureId: string) => {
    if (!engagementId) return;
    setRecordsError(null);
    const fingerprint = records?.find(record => record.captureId === captureId)?.fingerprint ?? job?.result?.recordFingerprint ?? captureId;
    recordFile(engagementId, captureId).then(text => downloadJson(text, 'verifica-acta-' + short(fingerprint) + '.json'), failure => setRecordsError(message(failure)));
  };
  const title = !engagementId ? 'Elige un encargo' : job?.state === 'running' ? 'Leyendo HubSpot' : 'Leer HubSpot';
  return (
    <Frame origin={origin} current="captures" eyebrow={'Paso 3 · Capturas' + (view ? ' · ' + view.engagement.name : '')} title={title} onOpen={onOpen} openError={openError} busy={!!engagementId && !view && !loadError}
      lede={!engagementId ? 'Crea o abre un encargo en el paso 1 para leer su CRM.' : 'Cada lectura saca una foto sellada del CRM, solo de lectura, y la guarda como fuente del encargo. La credencial no se guarda; en la cuenta de la empresa queda un acta de lo que se leyó.'}>
      {loadError && <p className="pb-error" role="alert">{loadError}</p>}
      {engagementId && !view && !loadError && <p className="pb-empty" role="status">Leyendo el encargo…</p>}
      {view && <CapturesContent view={view} job={job} busy={busy} error={error} records={records} recordsError={recordsError}
        onStart={start} onShowSources={onShowSources} onDownloadRecord={downloadRecord} />}
    </Frame>
  );
}
