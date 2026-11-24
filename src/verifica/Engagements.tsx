// Plan B Verifica · pasos 1 y 2 del encargo en la pantalla (fase D, corte 1 del mega plan 2, 24/11/2026).
// Operación: los encargos de este equipo y crear uno. Fuentes: las dos capturas, el libro de facturas y las cifras
// declaradas, cada una con su estado, su huella y lo que falta para la sala limpia. Solo existen cuando verifica.html la
// sirve el servidor local; cada vista tiene una parte que solo pinta (probada sin red) y un contenedor que llama a la API.
import React, { useCallback, useEffect, useState } from 'react';
import { ENGAGEMENT_LIMITS, ENGAGEMENT_ROLES, ROLE_LABEL, type EngagementRole, type EngagementView, type SourceState } from '../../shared/verifica/engagement.js';
import { createEngagement, EngagementApiError, listEngagements, readEngagement, removeSource, uploadSource, type EngagementSummary } from './engagement-client.js';
import { day, short } from './documents.js';
import { Frame, type ReportOrigin } from './Masthead.js';

const STATE: Record<SourceState['status'], string> = { missing: 'Falta', ok: 'Sirve', waiting: 'En espera', invalid: 'No sirve' };
const ACCEPT: Record<EngagementRole, string> = { previous: '.json,application/json', latest: '.json,application/json', invoices: '.csv,text/csv', declarations: '.json,application/json' };
const HINT: Record<EngagementRole, string> = {
  previous: 'Captura del CRM hecha antes, para ver qué cambió. La da el lector (scripts/verifica-hubspot.ts).',
  latest: 'Captura más reciente del CRM, con su historial si el lector lo trae.',
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
                <span className="vf-basis" data-basis={item.ready ? 'observed' : 'unverified'}>{item.ready ? 'Listo para la sala limpia' : 'Faltan fuentes'}</span>
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

export function SourcesContent({ view, busyRole, errors, onUpload, onRemove }: {
  view: EngagementView; busyRole: EngagementRole | null; errors: Partial<Record<EngagementRole, string>>;
  onUpload: (role: EngagementRole, file: File) => void; onRemove: (role: EngagementRole) => void;
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
      <section className="vf-card" aria-labelledby="vf-next">
        <h2 id="vf-next">Siguiente paso</h2>
        <p className="vf-summary">{view.missing.length === 0
          ? 'Las fuentes están listas. La sala limpia desde esta pantalla llega en el siguiente corte; mientras tanto, usa scripts/verifica-sala-limpia.ts con estos mismos archivos.'
          : 'Para pasar a la sala limpia faltan: ' + view.missing.map(item => item.replace(/\.$/, '').toLowerCase()).join('; ') + '.'}</p>
      </section>
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
  useEffect(() => {
    let live = true;
    listEngagements().then(list => { if (live) setEngagements(list); }, error => { if (live) setLoadError(message(error)); });
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
    </Frame>
  );
}

export function SourcesPage({ origin, engagementId, onOpen, openError }: {
  origin: ReportOrigin; engagementId: string | null; onOpen?: (file: File) => void; openError?: string | null;
}) {
  const [view, setView] = useState<EngagementView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState<EngagementRole | null>(null);
  const [errors, setErrors] = useState<Partial<Record<EngagementRole, string>>>({});
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
  const title = !engagementId ? 'Elige un encargo' : !view ? 'Fuentes del encargo' : view.missing.length === 0 ? 'Listo para la sala limpia' : 'Faltan fuentes para la sala limpia';
  return (
    <Frame origin={origin} current="sources" eyebrow={'Paso 2 · Fuentes' + (view ? ' · ' + view.engagement.name : '')} title={title} onOpen={onOpen} openError={openError} busy={!!engagementId && !view && !loadError}
      lede={!engagementId ? 'Crea o abre un encargo en el paso 1 para subir sus fuentes.' : 'Sube cada archivo tal como lo dio el lector o el vendedor. Una fuente que no sirve no se guarda, y se explica por qué.'}>
      {loadError && <p className="vf-error" role="alert">{loadError}</p>}
      {engagementId && !view && !loadError && <p className="vf-empty" role="status">Leyendo el encargo…</p>}
      {view && engagementId && <SourcesContent view={view} busyRole={busyRole} errors={errors}
        onUpload={(role, file) => act(role, () => uploadSource(engagementId, role, file))}
        onRemove={role => act(role, () => removeSource(engagementId, role))} />}
    </Frame>
  );
}
