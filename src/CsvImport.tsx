// Importar registros desde un CSV (mejora C9; CLAUDE-CSV-IMPORT, 17/11/2026).
// Tres pasos en una ventana: elegir archivo y tipo → revisar columnas y filas (vista previa del servidor, nada se escribe)
// → importar las filas válidas con la marca de esa vista previa. Si la copia cambió entre medias, el servidor responde 409
// y la ventana vuelve a pedir la vista previa en lugar de importar a ciegas.
import { useState, type ChangeEvent } from 'react';
import { ApiError, post } from './api.js';
import { Modal, Spinner } from './components.js';
import { InlineConfirm } from './ui/index.js';
import type { AppSpec, EntityName } from '../shared/model.js';

type Preview = {
  entity: EntityName; headers: string[]; mapping: Record<string, string | null>; ignoredColumns: string[];
  total: number; valid: number; invalid: number;
  preview: { line: number; values: Record<string, unknown>; errors: Record<string, string>; cells: Record<string, string> }[];
  errors: { line: number; errors: Record<string, string> }[]; duplicates: number; warnings: { line: number; text: string }[]; token: string;
};
type Applied = { created: number; skipped: number; duplicatesSkipped: number; failed: { line: number; error: string }[]; ids: string[] };

const MAX_BYTES = 1_000_000;
const plural = (n: number, one: string, many: string) => n.toLocaleString('es-ES') + ' ' + (n === 1 ? one : many);

export function CsvImport({ spec, initialEntity, close, done }: { spec: AppSpec; initialEntity: EntityName; close: () => void; done: (entity: EntityName, created: number) => void }) {
  const [entity, setEntity] = useState<EntityName>(initialEntity);
  const [csv, setCsv] = useState(''), [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string | null> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [applied, setApplied] = useState<Applied | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(false), [askClose, setAskClose] = useState(false);
  const definition = spec.entities.find(item => item.id === entity)!;
  const fieldLabel = (key: string) => definition.fields.find(f => f.key === key)?.label ?? key;

  const review = async (nextMapping: Record<string, string | null> | null = mapping, text = csv, target = entity) => {
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await post<Preview>('/v2/import/csv/preview', { entity: target, csv: text, ...(nextMapping ? { mapping: nextMapping } : {}) });
      setPreview(result); setMapping(result.mapping);
    } catch (failure) { setPreview(null); setError(failure instanceof Error ? failure.message : 'No se pudo leer el archivo.'); }
    finally { setBusy(false); }
  };
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > MAX_BYTES) { setError('El archivo pesa más de 1 MB. Divídelo en partes de hasta 1.000 filas.'); return; }
    const text = await file.text();
    setFileName(file.name); setCsv(text); setMapping(null); setApplied(null);
    await review(null, text);
  };
  const changeEntity = (next: EntityName) => { setEntity(next); setMapping(null); setPreview(null); if (csv) void review(null, csv, next); };
  const changeColumn = (header: string, key: string) => { const next = { ...(mapping ?? {}), [header]: key || null }; setMapping(next); void review(next); };
  const apply = async () => {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const result = await post<Applied>('/v2/import/csv/apply', { entity, csv, mapping: preview.mapping, token: preview.token, ...(skipDuplicates && preview.duplicates ? { skipDuplicates: true } : {}) });
      setApplied(result); setPreview(null);
      if (result.created) done(entity, result.created);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) { setError('La copia cambió desde la vista previa. La he vuelto a revisar: compruébala antes de importar.'); await review(); }
      else setError(failure instanceof Error ? failure.message : 'No se pudo importar.');
    } finally { setBusy(false); }
  };
  const usedFields = new Set(Object.values(mapping ?? {}).filter(Boolean));
  // Columnas que se importan, con el texto tal como viene en el archivo (nunca el ID interno de una empresa).
  const shownColumns = preview ? preview.headers.filter(h => preview.mapping[h]) : [];
  const warningOf = new Map((preview?.warnings ?? []).map(warning => [warning.line, warning.text]));
  const toImport = preview ? preview.valid - (skipDuplicates ? preview.duplicates : 0) : 0;
  // Cerrar con una vista previa delante pregunta una vez, dentro de la propia ventana; un segundo intento cierra.
  const confirmClose = () => { if (!preview || busy || askClose) return true; setAskClose(true); return false; };

  return <Modal title="Importar desde CSV" close={close} wide confirmClose={confirmClose}>
    <div className="modal-body csv-import">
      <p className="muted">Da de alta registros nuevos en tu copia local a partir de un CSV (por ejemplo, exportado de Excel). Primero verás qué se importará; nada se guarda hasta que lo confirmes. Cada alta queda anotada en Cambios.</p>
      {applied ? <div role="status" className="csv-import-result">
        <h3>{plural(applied.created, 'registro importado', 'registros importados')}</h3>
        <p className="muted">{applied.duplicatesSkipped ? plural(applied.duplicatesSkipped, 'posible duplicado omitido', 'posibles duplicados omitidos') + '. ' : ''}{applied.skipped ? plural(applied.skipped, 'fila omitida por errores', 'filas omitidas por errores') + '. ' : ''}{applied.failed.length ? plural(applied.failed.length, 'fila no se pudo guardar', 'filas no se pudieron guardar') + ' (líneas ' + applied.failed.map(f => f.line).join(', ') + ').' : ''}</p>
      </div> : <>
        <div className="settings-grid">
          <label className="field" htmlFor="csv-entity"><span>Tipo de registro</span>
            <select id="csv-entity" value={entity} disabled={busy} onChange={event => changeEntity(event.target.value as EntityName)}>
              {spec.entities.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
          <label className="field" htmlFor="csv-file"><span>Archivo CSV <small>hasta 1.000 filas</small></span>
            <input id="csv-file" type="file" accept=".csv,text/csv,text/plain" disabled={busy} onChange={event => void readFile(event)} /></label>
        </div>
        <p className="helper">La primera fila debe nombrar las columnas. Se aceptan separadores «;», «,» o tabulador, fechas DD/MM/AAAA, decimales con coma y empresas por su nombre.</p>
        {busy ? <Spinner text="Revisando el archivo…" /> : null}
        {error ? <p role="alert" className="field-error">{error}</p> : null}
        {preview ? <>
          <h3>Columnas{fileName ? ' de ' + fileName : ''}</h3>
          <p className="muted">He propuesto un campo para cada columna por su nombre. Cámbialo si no es el correcto; las columnas «No importar» se ignoran.</p>
          <div className="settings-grid">
            {preview.headers.map(header => <label className="field" key={header} htmlFor={'csv-col-' + header}><span>{header}</span>
              <select id={'csv-col-' + header} value={preview.mapping[header] ?? ''} disabled={busy} onChange={event => changeColumn(header, event.target.value)}>
                <option value="">No importar</option>
                {definition.fields.filter(f => !f.readOnly).map(f => <option key={f.key} value={f.key} disabled={usedFields.has(f.key) && preview.mapping[header] !== f.key}>{f.label}{f.required ? ' *' : ''}</option>)}
              </select></label>)}
          </div>
          <h3>{plural(preview.valid, 'fila lista', 'filas listas')} · {plural(preview.invalid, 'con errores', 'con errores')}{preview.duplicates ? ' · ' + plural(preview.duplicates, 'posible duplicado', 'posibles duplicados') : ''}</h3>
          <p className="muted">Las filas con errores no se importarán. Corrígelas en el archivo y vuelve a elegirlo si las necesitas.</p>
          {preview.duplicates ? <label className="csv-dup-skip" htmlFor="csv-skip-dup">
            <input id="csv-skip-dup" type="checkbox" checked={skipDuplicates} disabled={busy} onChange={event => setSkipDuplicates(event.target.checked)} />
            <span>Omitir {preview.duplicates === 1 ? 'el posible duplicado' : 'los ' + preview.duplicates.toLocaleString('es-ES') + ' posibles duplicados'}: filas cuyo nombre{entity === 'companies' ? ' o sitio web' : ''} ya está en tu copia o más arriba en el archivo. Si son personas o empresas distintas, déjalo sin marcar.</span>
          </label> : null}
          <div className="table-container" tabIndex={0} role="region" aria-label="Vista previa de la importación">
            <table><thead><tr><th scope="col">Línea</th><th scope="col">Resultado</th>{shownColumns.map((header, i) => <th scope="col" key={header} style={i === shownColumns.length - 1 ? { textAlign: 'left', width: 'auto' } : undefined}>{fieldLabel(preview!.mapping[header]!)}</th>)}</tr></thead>
              <tbody>{preview.preview.map(row => { const issues = Object.entries(row.errors); return <tr key={row.line}>
                <td>{row.line}</td>
                <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{issues.length ? <span className="field-error">{issues.map(([key, message]) => fieldLabel(key) + ': ' + message).join(' · ')}</span> : warningOf.has(row.line) ? <span className="csv-dup">{skipDuplicates ? 'Se omitirá. ' : 'Lista. '}{warningOf.get(row.line)}</span> : 'Lista'}</td>
                {shownColumns.map((header, i) => <td key={header} style={i === shownColumns.length - 1 ? { textAlign: 'left', width: 'auto' } : undefined}>{row.cells[header]}</td>)}
              </tr>; })}</tbody></table>
          </div>
          {preview.total > preview.preview.length ? <p className="muted">Se muestran las primeras {preview.preview.length} de {preview.total} filas.{preview.errors.length > preview.preview.filter(r => Object.keys(r.errors).length).length ? ' Otras líneas con errores: ' + preview.errors.filter(e => e.line > preview.preview[preview.preview.length - 1].line).slice(0, 20).map(e => e.line).join(', ') + '.' : ''}</p> : null}
        </> : null}
      </>}
    </div>
    <footer className="modal-footer">
      {askClose && preview && !applied ? <InlineConfirm id="csv-close" question="¿Cerrar sin importar? La vista previa se perderá." confirmLabel="Cerrar sin importar" cancelLabel="Seguir revisando" onConfirm={close} onCancel={() => setAskClose(false)} /> : null}
      {applied ? <button type="button" className="button primary" onClick={close}>Cerrar</button> : <>
        <button type="button" className="button" onClick={close} disabled={busy}>Cancelar</button>
        <button type="button" className="button primary" disabled={busy || !preview || toImport <= 0} onClick={() => void apply()}>{toImport > 0 ? 'Importar ' + plural(toImport, 'registro', 'registros') : 'Importar'}</button>
      </>}
    </footer>
  </Modal>;
}
