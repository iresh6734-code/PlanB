import React, { useEffect, useState } from 'react';
import { MIGRATION_BUDGET } from '../../shared/migration-budget.js';
import { MigrationInputError } from '../../shared/migration-verifier.js';
import { CleanRoomError } from '../../shared/verifica/clean-room.js';
import { equivalenceToJson, type EquivalenceReport } from '../../shared/verifica/equivalence.js';
import { VerificaInputError } from '../../shared/verifica/inputs.js';
import { EquivalenceInputError, equivalenceWorkList, prepareEquivalenceFiles, releaseEquivalence } from '../../shared/verifica/migration.js';
import { madridDay } from '../../shared/verifica/read-authorization.js';
import { WatchInputError } from '../../shared/verifica/watch.js';
import { watchMigrationUrl, watchUrl, type WatchMigrationRequest, type WatchMigrationResult, type WatchScheduleStatus, type WatchView } from '../../shared/verifica/watch-contract.js';
import { day, downloadJson, downloadText, short } from './documents.js';
import { EquivalenceReportView } from './EquivalenceReport.js';
import { Frame, type ReportOrigin } from './Masthead.js';

type Result = { report: EquivalenceReport; workList: string; newSalt: string | null };
type Props = { origin: Extract<ReportOrigin, { kind: 'local' }>; engagementId: string | null; onOpen: (file: File) => void; openError: string | null };

class ServerError extends Error { constructor(message: string) { super(message); this.name = 'ServerError'; } }

const FILES = [
  { name: 'closing', label: 'Captura de cierre', required: true },
  { name: 'target', label: 'Exportación o captura del CRM de destino', required: true },
  { name: 'map', label: 'Mapa de campos confirmado', required: true },
  { name: 'watch', label: 'Parte de vigilancia', required: false },
  { name: 'salt', label: 'Archivo de sal privada', required: false },
] as const;

async function readFile(data: FormData, { name, label, required }: typeof FILES[number]): Promise<string | null> {
  const file = data.get(name);
  if (!(file instanceof File) || !file.name) {
    if (required) throw new VerificaInputError(`Falta ${label.toLowerCase()}.`);
    return null;
  }
  const max = name === 'salt' ? 4096 : MIGRATION_BUDGET.maxExportBytes;
  if (file.size > max) throw new VerificaInputError(`${label}: el archivo es demasiado grande.`);
  try { return await file.text(); }
  catch { throw new VerificaInputError(`${label}: no se pudo leer el archivo.`); }
}

function message(error: unknown): string {
  if (error instanceof SyntaxError) return 'Uno de los archivos .json no es un JSON válido.';
  if (error instanceof VerificaInputError || error instanceof MigrationInputError || error instanceof EquivalenceInputError
    || error instanceof WatchInputError || error instanceof CleanRoomError || error instanceof ServerError) return error.message;
  if (error instanceof TypeError) return 'No hubo respuesta del servidor local. Comprueba que Plan B sigue abierto y reintenta.';
  return 'No se pudo completar la comparación. Revisa los archivos y vuelve a intentarlo.';
}

/** Compara en el servidor con la captura de cierre, el parte y la sal de la vigilancia: la captura no sale del equipo. */
async function compareWithWatch(engagementId: string, request: WatchMigrationRequest): Promise<WatchMigrationResult> {
  const response = await fetch(watchMigrationUrl(engagementId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  if (response.status === 401) throw new ServerError('Plan B está bloqueado. Desbloquea la copia y vuelve a intentarlo.');
  const body = await response.json().catch(() => null) as (WatchMigrationResult & { error?: string }) | null;
  if (!response.ok || !body) throw new ServerError(body?.error ?? 'No se pudo completar la comparación. Revisa los archivos y vuelve a intentarlo.');
  return body;
}

export default function MigrationEngagement({ origin, engagementId, onOpen, openError }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState(false);
  const [watch, setWatch] = useState<WatchScheduleStatus | null>(null);
  const [fromWatch, setFromWatch] = useState(false);

  useEffect(() => {
    if (!engagementId) return;
    const abort = new AbortController();
    fetch(watchUrl(engagementId), { signal: abort.signal })
      .then(response => response.ok ? response.json() as Promise<WatchView> : null)
      .then(view => { if (!abort.signal.aborted && view?.schedule) { setWatch(view.schedule); setFromWatch(true); } })
      .catch(() => {});
    return () => abort.abort();
  }, [engagementId]);

  const linked = fromWatch && watch !== null && engagementId !== null;
  const fields = FILES.filter(field => !linked || field.name === 'target' || field.name === 'map');

  async function compare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const asOf = String(data.get('asOf') ?? '');
      if (linked) {
        const [target, map] = await Promise.all(fields.map(field => readFile(data, field)));
        const { report, workList } = await compareWithWatch(engagementId, { target: target!, map: map!, asOf });
        setResult({ report, workList, newSalt: null });
        return;
      }
      const [closing, target, map, watchFile, salt] = await Promise.all(FILES.map(field => readFile(data, field)));
      const { input, saltCreated } = prepareEquivalenceFiles({ closing: closing!, target: target!, map: map!, watch: watchFile, salt, asOf });
      const { report, comparison } = releaseEquivalence(input);
      setResult({ report, workList: equivalenceWorkList(comparison), newSalt: saltCreated ? input.salt : null });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  const filename = result ? `verifica-equivalencia-${short(result.report.fingerprint)}` : '';
  return (<>
    <div hidden={preview && !!result}>
      <Frame origin={origin} current="migration" eyebrow="Después del cierre" title="Comprobar la migración"
        lede="Compara los registros del cierre con lo que llegó al CRM del comprador. Los archivos se procesan en este navegador."
        onOpen={onOpen} openError={openError} busy={busy}>
        <section className="vf-section" aria-labelledby="vf-migration-files">
          <div className="pb-section-head"><h2 id="vf-migration-files">Archivos de la comparación</h2></div>
          <form className="vf-read-form" onSubmit={event => void compare(event)} onChange={() => { setError(null); setResult(null); }}>
            <fieldset disabled={busy} className="vf-read-form">
              <legend>Entradas de migración</legend>
              {watch && <fieldset className="pb-choice">
                <legend className="pb-field-label">Captura de cierre</legend>
                <label className="pb-option">
                  <input type="radio" name="closingSource" value="watch" checked={fromWatch} onChange={() => setFromWatch(true)} />
                  <span className="pb-option-text"><span className="pb-option-label">La última de la vigilancia del encargo</span>
                    <span className="pb-option-note">{day(watch.latest.at)} · huella <code>{short(watch.latest.fingerprint)}</code>. Se usan también su parte y su sal.</span></span>
                </label>
                <label className="pb-option">
                  <input type="radio" name="closingSource" value="files" checked={!fromWatch} onChange={() => setFromWatch(false)} />
                  <span className="pb-option-text"><span className="pb-option-label">Subir los archivos a mano</span></span>
                </label>
              </fieldset>}
              {fields.map(({ name, label, required }) => (
                <label key={name}>
                  <span>{label}{required ? '' : ' · opcional'}</span>{' '}
                  <input name={name} type="file" accept={name === 'salt' ? '.txt,text/plain' : '.json,application/json'} required={required} />
                </label>
              ))}
              <p className="pb-note">{linked
                ? 'Si la última captura está retenida, acepta antes su huella en «Vigilancia». La captura de cierre se queda en este equipo.'
                : 'Si adjuntas un parte de vigilancia, añade también la sal con la que se generó.'}</p>
              <label>Fecha del informe{' '}<input className="pb-input" name="asOf" type="date" defaultValue={madridDay(new Date())} required /></label>
            </fieldset>
            <div><button className="pb-primary" type="submit" disabled={busy}>{busy ? 'Comparando…' : 'Comparar migración'}</button></div>
          </form>
          {error && <p className="pb-error" role="alert">{error}</p>}
        </section>
        {result && <section className="pb-card" aria-label="Resultado de la comparación">
          <h2>Informe preparado</h2>
          <p role="status">Huella <code>{short(result.report.fingerprint)}</code></p>
          <div className="vf-bar-actions">
            <button className="pb-secondary" type="button" onClick={() => setPreview(true)}>Ver informe</button>
            <button className="pb-secondary" type="button" onClick={() => downloadJson(equivalenceToJson(result.report), `${filename}.json`)}>Descargar informe</button>
            <button className="pb-secondary" type="button" onClick={() => downloadText(result.workList, `${filename}-lista-privada.csv`, 'text/csv')}>Descargar lista privada</button>
            {result.newSalt !== null && <button className="pb-secondary" type="button" onClick={() => downloadText(`${result.newSalt}\n`, `${filename}-sal-privada.txt`)}>Descargar sal privada</button>}
          </div>
          <p className="pb-note">La lista de corrección contiene identificadores del CRM. Guárdala con la sal en el equipo de trabajo.</p>
        </section>}
      </Frame>
    </div>
    {preview && result && <EquivalenceReportView report={result.report}
      origin={{ kind: 'opened', name: 'Informe generado en este navegador', backLabel: 'Volver a la comparación', onReference: () => setPreview(false) }}
      onOpen={onOpen} openError={openError} />}
  </>);
}
