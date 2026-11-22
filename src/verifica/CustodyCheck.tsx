// Plan B Verifica · comprobación de la copia custodiada (fase 2). Solo aparece con un informe abierto desde un archivo.
// La copia y la llave se abren en el navegador; la llave se borra del campo después de cada comprobación.
import React, { useState } from 'react';
import type { VerificaReport } from '../../shared/verifica/report.js';
import { checkCustody, type CustodyOutcome } from './custody-check.js';

const MAX_CUSTODY_FILE = 64 * 1024 * 1024;

export function CustodyCheck({ report }: { report: VerificaReport }) {
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CustodyOutcome | null>(null);
  const ready = file !== null && key.trim() !== '' && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !file) return;
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(file.size > MAX_CUSTODY_FILE ? { ok: false, message: 'La copia es demasiado grande para abrirla aquí.' } : await checkCustody(report, await file.text(), key));
    } catch {
      setOutcome({ ok: false, message: 'No se pudo leer el archivo de la copia.' });
    } finally {
      setKey('');
      setBusy(false);
    }
  };

  return (
    <section className="vf-sheet vf-custody" aria-labelledby="vf-custody">
      <h2 id="vf-custody">Comprobar con la copia custodiada</h2>
      <p className="vf-custody-intro">Quien guarda la copia, un abogado o un notario, comprueba aquí que rehace este informe. La copia y la llave se abren en este navegador y no se envían a ningún sitio.</p>
      <form className="vf-custody-form" onSubmit={submit}>
        <div className="vf-field">
          <span className="vf-field-label" id="vf-custody-file">Copia custodiada</span>
          <div className="vf-file-row">
            <label className="vf-secondary">
              <input className="vf-file-input" type="file" accept=".json,application/json" aria-labelledby="vf-custody-file"
                onChange={event => { setFile(event.target.files?.[0] ?? null); setOutcome(null); event.target.value = ''; }} />
              {file ? 'Cambiar' : 'Elegir archivo'}
            </label>
            <span className="vf-file-name">{file ? file.name : 'Ningún archivo elegido'}</span>
          </div>
        </div>
        <label className="vf-field">
          <span className="vf-field-label">Llave</span>
          <input className="vf-input" type="password" autoComplete="off" spellCheck={false} placeholder="vfk1-…" value={key} onChange={event => setKey(event.target.value)} />
        </label>
        <button type="submit" className="vf-primary" disabled={!ready}>{busy ? 'Comprobando…' : 'Comprobar la copia'}</button>
      </form>
      <div className="vf-result-area" role="status" aria-live="polite">
        {outcome && (
          <>
            <p className="vf-result" data-ok={outcome.ok ? 'true' : 'false'}>{outcome.message}</p>
            {outcome.custodyFingerprint && <p className="vf-result-print"><span>Huella de la copia</span><code>{outcome.custodyFingerprint}</code></p>}
          </>
        )}
      </div>
    </section>
  );
}
