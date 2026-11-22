import { useState } from 'react';
import { FileDown } from 'lucide-react';
import type { ReturnPackage as Package } from '../shared/return-package.js';
import { post } from './api.js';
import { downloadText } from './app-shell/csv.js';
import './return-package.css';

/** Misión maestra A4 · Paquete de vuelta en Cambios. Solo LEE: pide a la copia los CSV de importación para HubSpot y los
 *  descarga. No escribe en HubSpot ni en la copia y no marca nada como devuelto: la vuelta se acredita al comprobar por
 *  relectura. Botón secundario: la acción principal de Cambios sigue siendo la suya. */
const REASON: Record<Package['skipped'][number]['reason'], string> = {
  conflict: 'Conflicto', clear: 'Vaciar campo', relation: 'Relación', 'missing-remote': 'No está en HubSpot', 'bad-id': 'Sin ID de HubSpot', 'already-created': 'Ya creada', 'no-fields': 'Nada que importar',
};
const show = (value: unknown) => value === null || value === undefined || value === '' ? '(vacío)' : String(value);

export function ReturnPackage({ connected, disabled }: { connected: boolean; disabled?: boolean }) {
  const [pkg, setPkg] = useState<Package | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const build = async (readHubspot: boolean) => {
    setBusy(true); setError('');
    try { setPkg(await post<Package>('/v3/return-package', { readHubspot })); }
    catch (failure) { setPkg(null); setError(failure instanceof Error ? failure.message : 'No se pudo preparar el paquete.'); }
    finally { setBusy(false); }
  };
  return <section className="return-package" aria-labelledby="return-package-title">
    <div className="return-package-head">
      <div><h2 id="return-package-title">Paquete de vuelta</h2>
        <p className="muted">Archivos CSV para importar en HubSpot lo que cambiaste en la copia. Plan B no envía nada: importas tú y después compruebas aquí.</p></div>
      <div className="button-row">
        {connected ? <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void build(true)}><FileDown size={15} aria-hidden="true" />{busy ? 'Leyendo HubSpot…' : 'Preparar paquete'}</button> : null}
        <button type="button" className={connected ? 'text-button' : 'button secondary'} disabled={busy || disabled} onClick={() => void build(false)}>{connected ? 'Sin leer HubSpot' : <><FileDown size={15} aria-hidden="true" />Preparar paquete sin leer HubSpot</>}</button>
      </div>
    </div>
    {error ? <p className="error-box" role="alert">{error}</p> : null}
    {pkg ? <div className="return-package-body" role="status">
      <ul className="return-package-summary">{pkg.summary.map(line => <li key={line}>{line}</li>)}</ul>
      {pkg.files.length ? <ul className="return-package-files">{pkg.files.map(file => <li key={file.name}>
        <span><strong>{file.name}</strong><small>{file.rows} {file.rows === 1 ? 'fila' : 'filas'} · {file.columns.length} columnas</small></span>
        <button type="button" className="text-button" onClick={() => downloadText(file.name, file.csv, 'text/csv;charset=utf-8')}>Descargar</button>
      </li>)}</ul> : null}
      {pkg.skipped.length ? <details className="return-package-skipped"><summary>Fuera del paquete ({pkg.skipped.length})</summary>
        <ul>{pkg.skipped.map((item, index) => <li key={index}><strong>{REASON[item.reason]}</strong> · {item.label}{item.fieldLabel ? ' · ' + item.fieldLabel : ''}
          <small>{item.detail}{item.values ? ' Al capturar: ' + show(item.values.base) + ' · En la copia: ' + show(item.values.local) + ' · En HubSpot: ' + show(item.values.remote) + '.' : ''}</small></li>)}</ul>
      </details> : null}
      <p className="helper">Portal {pkg.identity.accountId} · cambios {pkg.identity.fromChange}–{pkg.identity.toChange} · revisión {pkg.identity.revision.slice(0, 10)}. Si editas la copia, prepara otro paquete.</p>
    </div> : null}
  </section>;
}
