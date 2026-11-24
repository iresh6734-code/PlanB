import React, { useState } from 'react';
import { MigrationInputError } from '../../shared/migration-verifier.js';
import { CleanRoomError } from '../../shared/verifica/clean-room.js';
import { ENGAGEMENT_LIMITS } from '../../shared/verifica/engagement.js';
import { equivalenceToJson, type EquivalenceReport } from '../../shared/verifica/equivalence.js';
import { VerificaInputError } from '../../shared/verifica/inputs.js';
import { EquivalenceInputError, equivalenceWorkList, prepareEquivalenceFiles, releaseEquivalence } from '../../shared/verifica/migration.js';
import { madridDay } from '../../shared/verifica/read-authorization.js';
import { WatchInputError } from '../../shared/verifica/watch.js';
import { downloadJson, downloadText, short } from './documents.js';
import { EquivalenceReportView } from './EquivalenceReport.js';
import { Frame, type ReportOrigin } from './Masthead.js';

type Result = { report: EquivalenceReport; workList: string; newSalt: string | null };
type Props = { origin: Extract<ReportOrigin, { kind: 'local' }>; onOpen: (file: File) => void; openError: string | null };

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
  const max = name === 'salt' ? 4096 : ENGAGEMENT_LIMITS.sourceBytes;
  if (file.size > max) throw new VerificaInputError(`${label}: el archivo es demasiado grande.`);
  try { return await file.text(); }
  catch { throw new VerificaInputError(`${label}: no se pudo leer el archivo.`); }
}

function message(error: unknown): string {
  if (error instanceof SyntaxError) return 'Uno de los archivos .json no es un JSON válido.';
  if (error instanceof VerificaInputError || error instanceof MigrationInputError || error instanceof EquivalenceInputError
    || error instanceof WatchInputError || error instanceof CleanRoomError) return error.message;
  return 'No se pudo completar la comparación. Revisa los archivos y vuelve a intentarlo.';
}

export default function MigrationEngagement({ origin, onOpen, openError }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState(false);

  async function compare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const [closing, target, map, watch, salt] = await Promise.all(FILES.map(field => readFile(data, field)));
      const { input, saltCreated } = prepareEquivalenceFiles({ closing: closing!, target: target!, map: map!, watch, salt, asOf: String(data.get('asOf') ?? '') });
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
          <div className="vf-section-head"><h2 id="vf-migration-files">Archivos de la comparación</h2></div>
          <form className="vf-read-form" onSubmit={event => void compare(event)} onChange={() => { setError(null); setResult(null); }}>
            <fieldset disabled={busy} className="vf-read-form">
              <legend>Entradas de migración</legend>
              {FILES.map(({ name, label, required }) => (
                <label key={name}>
                  <span>{label}{required ? '' : ' · opcional'}</span>{' '}
                  <input name={name} type="file" accept={name === 'salt' ? '.txt,text/plain' : '.json,application/json'} required={required} />
                </label>
              ))}
              <p className="vf-note">Si adjuntas un parte de vigilancia, añade también la sal con la que se generó.</p>
              <label>Fecha del informe{' '}<input className="vf-input" name="asOf" type="date" defaultValue={madridDay(new Date())} required /></label>
            </fieldset>
            <div><button className="vf-primary" type="submit" disabled={busy}>{busy ? 'Comparando…' : 'Comparar migración'}</button></div>
          </form>
          {error && <p className="vf-error" role="alert">{error}</p>}
        </section>
        {result && <section className="vf-card" aria-label="Resultado de la comparación">
          <h2>Informe preparado</h2>
          <p role="status">Huella <code>{short(result.report.fingerprint)}</code></p>
          <div className="vf-bar-actions">
            <button className="vf-secondary" type="button" onClick={() => setPreview(true)}>Ver informe</button>
            <button className="vf-secondary" type="button" onClick={() => downloadJson(equivalenceToJson(result.report), `${filename}.json`)}>Descargar informe</button>
            <button className="vf-secondary" type="button" onClick={() => downloadText(result.workList, `${filename}-lista-privada.csv`, 'text/csv')}>Descargar lista privada</button>
            {result.newSalt !== null && <button className="vf-secondary" type="button" onClick={() => downloadText(`${result.newSalt}\n`, `${filename}-sal-privada.txt`)}>Descargar sal privada</button>}
          </div>
          <p className="vf-note">La lista de corrección contiene identificadores del CRM. Guárdala con la sal en el equipo de trabajo.</p>
        </section>}
      </Frame>
    </div>
    {preview && result && <EquivalenceReportView report={result.report}
      origin={{ kind: 'opened', name: 'Informe generado en este navegador', backLabel: 'Volver a la comparación', onReference: () => setPreview(false) }}
      onOpen={onOpen} openError={openError} />}
  </>);
}
