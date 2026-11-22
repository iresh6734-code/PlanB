// Plan B Verifica · piezas comunes del informe, el parte de vigilancia y el informe de equivalencia. La cabecera lleva
// producto, origen, título, frase de resumen, variantes o vuelta al ejemplo, abrir un archivo y, solo en el ejemplo ya
// cargado, el único botón relleno (descargar).
import React, { type ReactNode } from 'react';
import type { FindingItem } from '../../shared/verifica/model.js';

export function Refs({ items }: { items: readonly FindingItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="vf-refs">
      <summary>{items.length === 1 ? 'Ver la referencia' : 'Ver las ' + items.length + ' referencias'}</summary>
      <ul>
        {items.map(item => (
          <li key={item.ref}><code>{item.ref}</code>{item.note ? <span> · {item.note}</span> : null}</li>
        ))}
      </ul>
    </details>
  );
}

export function Fingerprint({ label, value, intact, broken }: { label: string; value: string; intact: boolean; broken: string }) {
  return (
    <p className="vf-fingerprint">
      <span>{label}</span>
      <code>{value}</code>
      <span className="vf-check" data-ok={intact ? 'true' : 'false'}>{intact ? 'Coincide con el contenido' : broken}</span>
    </p>
  );
}

export type Variant = 'traps' | 'clean';
export type DocKind = 'report' | 'watch' | 'migration';

export type ReportOrigin =
  | { kind: 'reference'; variant: Variant; onVariant?: (variant: Variant) => void; doc?: DocKind; onDoc?: (doc: DocKind) => void }
  | { kind: 'opened'; name: string; onReference?: () => void };

const VARIANT: Record<Variant, string> = { traps: 'Con trampas', clean: 'Sin trampas' };
const DOC: Record<DocKind, string> = { report: 'Informe', watch: 'Vigilancia', migration: 'Migración' };

function OpenReport({ label, onOpen }: { label: string; onOpen?: (file: File) => void }) {
  return (
    <label className="vf-secondary">
      <input className="vf-file-input" type="file" accept=".json,application/json"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onOpen?.(file); }} />
      {label}
    </label>
  );
}

export function Masthead({ origin, title, lede, onOpen, openError, download }: {
  origin: ReportOrigin; title: string; lede: ReactNode;
  onOpen?: (file: File) => void; openError?: string | null;
  download?: { label: string; run: () => void };
}) {
  return (
    <header className="vf-head">
      <div className="vf-head-row">
        <div className="vf-head-start">
          <p className="vf-product">Plan B Verifica</p>
          {origin.kind === 'reference' && (
            <nav className="vf-docs" aria-label="Documento de ejemplo">
              {(Object.keys(DOC) as DocKind[]).map(key => (
                <button key={key} type="button" className="vf-doc" aria-pressed={(origin.doc ?? 'report') === key} onClick={() => origin.onDoc?.(key)}>{DOC[key]}</button>
              ))}
            </nav>
          )}
        </div>
        {origin.kind === 'reference'
          ? <p className="vf-fiction" role="note">Empresa ficticia · todos los datos son inventados</p>
          : <p className="vf-origin">{origin.name} · abierto en este navegador, no se envía a ningún sitio</p>}
      </div>
      <h1>{title}</h1>
      <p className="vf-lede">{lede}</p>
      <div className="vf-actions">
        {origin.kind === 'reference'
          ? (
            <div className="vf-switch" role="group" aria-label="Variante de la empresa de referencia">
              {(Object.keys(VARIANT) as Variant[]).map(key => (
                <button key={key} type="button" className="vf-switch-option" aria-pressed={origin.variant === key} onClick={() => origin.onVariant?.(key)}>{VARIANT[key]}</button>
              ))}
            </div>
          )
          : <button type="button" className="vf-link" onClick={() => origin.onReference?.()}>Volver al ejemplo</button>}
        <div className="vf-actions-end">
          <OpenReport label={origin.kind === 'reference' ? 'Abrir un informe' : 'Abrir otro informe'} onOpen={onOpen} />
          {origin.kind === 'reference' && download && <button type="button" className="vf-primary" onClick={download.run}>{download.label}</button>}
        </div>
      </div>
      {openError && <p className="vf-error" role="alert">{openError}</p>}
    </header>
  );
}
