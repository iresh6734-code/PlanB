import React, { useEffect, useState } from 'react';
import { READ_LIMITS } from '../../shared/verifica/engagement.js';
import { watchUrl, type WatchAction, type WatchReportResult, type WatchView } from '../../shared/verifica/watch-contract.js';
import { watchReportToJson, type WatchReport } from '../../shared/verifica/watch.js';
import { day, downloadJson, downloadText, short } from './documents.js';
import { Frame, type ReportOrigin } from './Masthead.js';
import { WatchReportView } from './WatchReport.js';

type Props = { origin: Extract<ReportOrigin, { kind: 'local' }>; engagementId: string | null; onOpen: (file: File) => void; openError: string | null };

async function response(path: string, init?: RequestInit) {
  const result = await fetch(path, init);
  if (result.ok) return result;
  if (result.status === 401) throw new Error('Plan B está bloqueado. Desbloquea la copia y vuelve a intentarlo.');
  const body = await result.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error ?? 'No se pudo completar el cambio de vigilancia.');
}

function message(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError) ? error.message : 'No hubo respuesta del servidor local. Vuelve a intentarlo.';
}

function fileFrom(form: FormData, name: string, max: number) {
  const file = form.get(name);
  if (!(file instanceof File) || !file.name) throw new Error('Elige los archivos de la autorización.');
  if (file.size > max) throw new Error('Uno de los archivos de la autorización es demasiado grande.');
  return file;
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error('No se pudo leer el documento firmado.'));
    reader.readAsDataURL(file);
  });
}

const stamp = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' });
const time = (value: string) => stamp.format(new Date(value));

export default function WatchEngagement({ origin, engagementId, onOpen, openError }: Props) {
  const [view, setView] = useState<WatchView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<WatchReport | null>(null);
  const [preview, setPreview] = useState(false);
  const path = engagementId ? watchUrl(engagementId) : null;
  const active = view?.schedule?.active === true;

  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    let timeout: number | undefined;
    const refresh = async () => {
      try {
        const result = await response(path, { signal: abort.signal });
        const next = await result.json() as WatchView;
        if (!abort.signal.aborted) setView(next);
      } catch (error) {
        if (!abort.signal.aborted) setFailure(message(error));
      } finally {
        if (active && !abort.signal.aborted) timeout = window.setTimeout(refresh, 6000);
      }
    };
    if (active) timeout = window.setTimeout(refresh, 6000);
    else void refresh();
    return () => { abort.abort(); window.clearTimeout(timeout); };
  }, [path, active]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try { await work(); }
    catch (error) { setFailure(message(error)); }
    finally { setBusy(false); }
  }

  async function change(action: WatchAction) {
    if (!path) return;
    const result = await response(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
    setView(await result.json() as WatchView);
    setReport(null);
  }

  async function prepareReport() {
    if (!path) return;
    const result = await response(path + '/artifacts/report');
    setReport((await result.json() as WatchReportResult).report);
  }

  return <>
    <div hidden={preview && !!report}>
      <Frame origin={origin} current="watch" eyebrow="Paso 5 · Vigilancia" title={view?.name ?? 'Vigilancia hasta el cierre'}
        lede={engagementId ? 'Una captura en la firma y una lectura semanal mientras Plan B está abierto.' : 'Abre un encargo en Operación para programar la vigilancia.'}
        onOpen={onOpen} openError={openError} busy={busy || (!!path && !view && !failure)}>
        {failure && <p className="pb-error" role="alert">{failure}</p>}
        {view && !view.schedule && <section className="pb-card" aria-label="Captura de firma">
          <h2>Captura de firma</h2>
          {view.choices.length === 0 ? <p>Hace falta una captura de HubSpot con su acta de lectura. Haz la lectura desde «Capturas».</p> :
            <form className="vf-read-form" onSubmit={event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const choice = view.choices.find(candidate => candidate.role === form.get('signing'));
              if (!choice) return;
              void run(async () => {
                const file = form.get('salt');
                const salt = file instanceof File && file.name ? (await fileFrom(form, 'salt', 4096).text()).trim() : undefined;
                await change({ action: 'set-signing', role: choice.role, fingerprint: choice.fingerprint, salt });
              });
            }}>
              <fieldset className="pb-choice" disabled={busy}>
                <legend>Elige la captura tomada al firmar</legend>
                {view.choices.map(choice => <label className="pb-option" key={choice.role}>
                  <input required type="radio" name="signing" value={choice.role} />
                  {choice.role === 'previous' ? 'Captura anterior' : 'Captura más reciente'} · {time(choice.at)} · {short(choice.fingerprint)}
                </label>)}
                <label className="pb-field">Sal privada existente · opcional<input name="salt" type="file" accept=".txt,text/plain" /></label>
              </fieldset>
              <div><button className="pb-primary" disabled={busy}>Fijar captura de firma</button></div>
            </form>}
        </section>}
        {view?.schedule && <>
          <section className="pb-card vf-issue" aria-label="Calendario de vigilancia">
            <h2>Calendario de vigilancia</h2>
            <p role="status">{active ? 'Vigilancia activa' : 'Vigilancia en pausa'} · {view.schedule.weeklyCount} {view.schedule.weeklyCount === 1 ? 'captura semanal' : 'capturas semanales'}</p>
            {view.schedule.reason && <p className="pb-held">{view.schedule.reason}</p>}
            <dl className="vf-sources">
              <div><dt>Firma</dt><dd>{time(view.schedule.signing.at)}</dd></div>
              <div><dt>Última captura</dt><dd>{time(view.schedule.latest.at)}</dd></div>
              <div><dt>Próxima lectura</dt><dd>{time(view.schedule.nextDue)}</dd></div>
              {view.schedule.retriesAfter && <div><dt>Siguiente reintento</dt><dd>{time(view.schedule.retriesAfter)}</dd></div>}
            </dl>
            {view.schedule.late && <p className="pb-error" role="alert">Hay una semana sin captura.</p>}
            {active && <div><button className="pb-secondary" type="button" disabled={busy} onClick={() => void run(() => change({ action: 'pause' }))}>Pausar vigilancia</button></div>}
          </section>
          {!active && <section className="pb-card" aria-label="Activación de vigilancia">
            <h2>Activar vigilancia</h2>
            <form className="vf-read-form" onSubmit={event => {
              event.preventDefault();
              const element = event.currentTarget, form = new FormData(element);
              void run(async () => {
                const authorizationFile = fileFrom(form, 'authorization', READ_LIMITS.authorizationChars);
                const document = fileFrom(form, 'document', READ_LIMITS.documentBytes);
                const [authorization, documentBase64] = await Promise.all([authorizationFile.text(), fileBase64(document)]);
                await change({ action: 'resume', authorization, documentBase64, token: String(form.get('token') ?? '').trim(), confirmRecurring: form.has('recurring') });
                element.reset();
              });
            }}>
              <fieldset className="pb-choice" disabled={busy}>
                <label className="pb-field">Credencial de solo lectura<input name="token" className="pb-input" type="password" autoComplete="off" required /></label>
                <label className="pb-field">Autorización de lectura<input name="authorization" type="file" accept=".json,application/json" required /></label>
                <label className="pb-field">Documento firmado<input name="document" type="file" accept=".pdf,application/pdf" required /></label>
                <label className="pb-option vf-confirm"><input name="recurring" type="checkbox" required />Confirmo que el documento autoriza lecturas semanales.</label>
                <p className="pb-field-note">La credencial está en memoria durante la vigilancia. Al reiniciar Plan B, vuelve a activarla.</p>
              </fieldset>
              <div><button className="pb-primary" disabled={busy}>Activar vigilancia</button></div>
            </form>
          </section>}
          <section className="pb-card vf-issue" aria-label="Parte semanal">
            <h2>Parte semanal</h2>
            <div className="vf-issue-actions">
              <button className="pb-secondary" type="button" disabled={busy} onClick={() => void run(prepareReport)}>Preparar parte</button>
              {report && <>
                <button className="pb-secondary" type="button" onClick={() => setPreview(true)}>Ver parte</button>
                <button className="pb-secondary" type="button" onClick={() => downloadJson(watchReportToJson(report), `verifica-vigilancia-${short(report.fingerprint)}.json`)}>Descargar parte</button>
              </>}
              <button className="pb-secondary" type="button" disabled={busy} onClick={() => void run(async () => {
                const salt = await response(path + '/artifacts/salt');
                downloadText(await salt.text(), 'verifica-vigilancia-sal-privada.txt');
              })}>Descargar sal privada</button>
            </div>
            {report?.entries.filter(entry => entry.status === 'retained').map(entry => <form className="vf-issue" key={entry.fingerprint} onSubmit={event => {
              event.preventDefault();
              const confirmed = new FormData(event.currentTarget).has('reviewed');
              void run(async () => { await change({ action: 'accept', fingerprint: entry.fingerprint, confirmed }); await prepareReport(); });
            }}>
              <p>Captura retenida del {day(entry.at)} · <code>{short(entry.fingerprint)}</code></p>
              <label className="pb-option"><input name="reviewed" type="checkbox" required />Confirmo que las partes aceptan esta captura como nueva base.</label>
              <div><button className="pb-secondary" disabled={busy}>Aceptar captura retenida</button></div>
            </form>)}
          </section>
        </>}
      </Frame>
    </div>
    {preview && report && <WatchReportView report={report} origin={{ kind: 'opened', name: 'Parte preparado en este equipo', backLabel: 'Volver a vigilancia', onReference: () => setPreview(false) }} onOpen={onOpen} openError={openError} />}
  </>;
}
