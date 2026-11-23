// Plan B Verifica · el marco común del informe, el parte de vigilancia y el informe de equivalencia (dirección visual
// «Dictamen», 23/11/2026). Barra superior con el producto, el origen (ejemplo ficticio o archivo abierto), abrir un
// archivo y, solo en el ejemplo ya cargado, el único botón relleno (descargar). A la izquierda, los pasos del encargo;
// los tres primeros se hacen con el lector en el equipo del vendedor y aquí solo se nombran. En el centro, la cabecera
// del documento (antetítulo, conclusión, frase de resumen) y su contenido.
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

/** El sello: la huella completa y si coincide con el contenido. */
export function Fingerprint({ label, value, intact, broken }: { label: string; value: string; intact: boolean; broken: string }) {
  return (
    <div className="vf-fingerprint" data-ok={intact ? 'true' : 'false'}>
      <svg className="vf-stamp" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="none" strokeWidth="2" />
        <circle cx="32" cy="32" r="22.5" fill="none" strokeWidth="1" strokeDasharray="3 3" />
        {intact
          ? <path d="M22 33l7 7 13-15" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M24 24l16 16M40 24L24 40" fill="none" strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
      <div className="vf-fingerprint-text">
        <span className="vf-fingerprint-label">{label}</span>
        <code>{value}</code>
        <span className="vf-check" data-ok={intact ? 'true' : 'false'}>{intact ? 'Coincide con el contenido' : broken}</span>
      </div>
    </div>
  );
}

export type Variant = 'traps' | 'clean';
export type DocKind = 'report' | 'watch' | 'migration';

export type ReportOrigin =
  | { kind: 'reference'; variant: Variant; onVariant?: (variant: Variant) => void; doc?: DocKind; onDoc?: (doc: DocKind) => void }
  | { kind: 'opened'; name: string; onReference?: () => void };

const VARIANT: Record<Variant, string> = { traps: 'Con trampas', clean: 'Sin trampas' };

type Step = { n: string; label: string; note: string; doc?: DocKind };
const STEPS: Step[] = [
  { n: '01', label: 'Operación', note: 'Alcance y autorización' },
  { n: '02', label: 'Fuentes', note: 'CRM y facturas, solo lectura' },
  { n: '03', label: 'Capturas', note: 'Cada lectura queda sellada' },
  { n: '04', label: 'Hallazgos e informe', note: 'Lo que la cartera sostiene', doc: 'report' },
  { n: '05', label: 'Vigilancia', note: 'De la firma al cierre', doc: 'watch' },
  { n: '06', label: 'Después del cierre', note: 'Migración verificada', doc: 'migration' },
];

function StepText({ step }: { step: Step }) {
  return (
    <>
      <span className="vf-step-n">{step.n}</span>
      <span className="vf-step-text"><span className="vf-step-label">{step.label}</span><span className="vf-step-note">{step.note}</span></span>
    </>
  );
}

function Steps({ origin, current }: { origin: ReportOrigin; current: DocKind }) {
  return (
    <nav className="vf-steps" aria-label="Pasos del encargo">
      <p className="vf-steps-title">El encargo</p>
      <ol>
        {STEPS.map(step => {
          const here = step.doc === current;
          if (step.doc && origin.kind === 'reference') {
            return (
              <li key={step.n}>
                <button type="button" className="vf-step" data-doc="true" aria-current={here ? 'page' : undefined} onClick={() => origin.onDoc?.(step.doc!)}><StepText step={step} /></button>
              </li>
            );
          }
          return <li key={step.n}><span className="vf-step" data-doc={step.doc ? 'true' : 'false'} aria-current={here ? 'page' : undefined}><StepText step={step} /></span></li>;
        })}
      </ol>
      <p className="vf-steps-note">Los pasos 1 a 3 se hacen con el lector, en el equipo del vendedor. Aquí se ven sus resultados.</p>
    </nav>
  );
}

function OpenReport({ label, onOpen }: { label: string; onOpen?: (file: File) => void }) {
  return (
    <label className="vf-secondary">
      <input className="vf-file-input" type="file" accept=".json,application/json"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onOpen?.(file); }} />
      {label}
    </label>
  );
}

export function Frame({ origin, current, eyebrow, title, lede, onOpen, openError, download, busy, children }: {
  origin: ReportOrigin; current: DocKind; eyebrow: string; title: string; lede: ReactNode;
  onOpen?: (file: File) => void; openError?: string | null;
  download?: { label: string; run: () => void }; busy?: boolean; children?: ReactNode;
}) {
  return (
    <div className="vf-app">
      <header className="vf-bar">
        <div className="vf-bar-in">
          <p className="vf-brand"><span className="vf-brand-name">Verifica</span><span className="vf-brand-by">de Plan B</span></p>
          {origin.kind === 'reference'
            ? <p className="vf-fiction" role="note">Empresa ficticia · todos los datos son inventados</p>
            : <p className="vf-origin">{origin.name} · abierto en este navegador, no se envía a ningún sitio</p>}
          <div className="vf-bar-actions">
            <OpenReport label={origin.kind === 'reference' ? 'Abrir un informe' : 'Abrir otro informe'} onOpen={onOpen} />
            {origin.kind === 'reference' && download && <button type="button" className="vf-primary" onClick={download.run}>{download.label}</button>}
          </div>
        </div>
      </header>
      <div className="vf-body">
        <Steps origin={origin} current={current} />
        <main className="vf-page" aria-busy={busy || undefined}>
          <header className="vf-head">
            <p className="vf-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="vf-lede">{lede}</p>
            {origin.kind === 'reference'
              ? (
                <div className="vf-head-row">
                  <span className="vf-switch-label" id="vf-variant-label">Empresa de ejemplo</span>
                  <div className="vf-switch" role="group" aria-labelledby="vf-variant-label">
                    {(Object.keys(VARIANT) as Variant[]).map(key => (
                      <button key={key} type="button" className="vf-switch-option" aria-pressed={origin.variant === key} onClick={() => origin.onVariant?.(key)}>{VARIANT[key]}</button>
                    ))}
                  </div>
                </div>
              )
              : <div className="vf-head-row"><button type="button" className="vf-link" onClick={() => origin.onReference?.()}>Volver al ejemplo</button></div>}
            {openError && <p className="vf-error" role="alert">{openError}</p>}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
