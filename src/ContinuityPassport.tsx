import { useId, useState } from 'react';
import { BASIS_LABEL, CURRENCY_LABEL, SOURCE_LABEL, contextLabel, passportFingerprint, passportToHtml, passportToJson, when, type Claim, type Passport, type PassportAction, type Section } from '../shared/continuity-passport.js';
import './continuity-passport.css';

// Pasaporte de continuidad (unidad 214): presentación de un `Passport` ya construido. No llama a la red, no captura, no envía ni exporta por sí solo:
// la descarga es una acción manual de la persona. Sin consumidor montado todavía: ver el traspaso de la unidad.
export interface ContinuityPassportProps {
  passport: Passport;
  /** Abre la superficie existente que resuelve la carencia (Integraciones, Hoy, Exportar…). Sin él, el próximo paso se explica pero no se ofrece un botón que no hace nada. */
  onAction?: (action: PassportAction) => void;
  /** Sustituible en pruebas; por defecto descarga un fichero local. */
  onDownload?: (file: { name: string; type: string; text: string }) => void;
}
const ACTION_HINT: Record<PassportAction, string> = {
  'open-preparation': 'Abrir la preparación', 'open-integrations': 'Abrir Integraciones', 'open-today': 'Abrir Hoy', 'open-export': 'Abrir Exportar', 'start-rehearsal': 'Ensayar un relevo', 'open-continuity': 'Abrir Continuidad',
};
function saveFile(file: { name: string; type: string; text: string }) {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type })), link = document.createElement('a');
  link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ClaimItem({ claim }: { claim: Claim }) {
  return <li className={'cpp-claim cpp-' + claim.basis} data-basis={claim.basis} data-currency={claim.currency}>
    <p><span className="cpp-badge">{BASIS_LABEL[claim.basis]}</span>{CURRENCY_LABEL[claim.currency] && claim.currency !== 'current' ? <span className={'cpp-chip cpp-chip-' + claim.currency}>{CURRENCY_LABEL[claim.currency]}</span> : null} {claim.text}</p>
    <small>{claim.scope}{claim.at ? ' · ' + when(claim.at) : ''} · {SOURCE_LABEL[claim.source]}{claim.context ? ' · ' + contextLabel(claim.context) : ''}</small>
  </li>;
}
function SectionView({ section }: { section: Section }) {
  const id = useId(), [first, ...rest] = section.claims;
  const counts = { observed: 0, declared: 0, unverified: 0 } as Record<string, number>; for (const claim of rest) if (claim.basis in counts) counts[claim.basis]++;
  return <section className="cpp-section" aria-labelledby={id} data-section={section.key}>
    <h3 id={id}>{section.question}</h3>
    <ul className="cpp-claims">{first ? <ClaimItem claim={first} /> : <li className="cpp-claim cpp-unverified"><p><span className="cpp-badge">Sin comprobar</span> Sin información.</p></li>}</ul>
    {rest.length ? <details className="cpp-more"><summary>Ver {rest.length === 1 ? 'el otro dato' : 'los otros ' + rest.length + ' datos'} <span className="cpp-counts">({[counts.observed ? counts.observed + ' observados' : '', counts.declared ? counts.declared + ' declarados' : '', counts.unverified ? counts.unverified + ' sin comprobar' : ''].filter(Boolean).join(' · ')})</span></summary><ul className="cpp-claims">{rest.map(claim => <ClaimItem key={claim.id} claim={claim} />)}</ul></details> : null}
  </section>;
}
export function ContinuityPassport({ passport, onAction, onDownload = saveFile }: ContinuityPassportProps) {
  const titleId = useId(), [notice, setNotice] = useState('');
  const download = (kind: 'html' | 'json' | 'both') => {
    const day = passport.generatedAt.slice(0, 10) || 'sin-fecha';
    if (kind !== 'json') onDownload({ name: 'pasaporte-continuidad-' + day + '.html', type: 'text/html', text: passportToHtml(passport) });
    if (kind !== 'html') onDownload({ name: 'pasaporte-continuidad-' + day + '.json', type: 'application/json', text: passportToJson(passport) });
    setNotice(kind === 'both' ? 'Se prepararon el HTML y el JSON en tu equipo. No se envió nada a ningún sitio.' : 'Se preparó el fichero ' + kind.toUpperCase() + ' en tu equipo. No se envió a ningún sitio.');
  };
  const fingerprint = passportFingerprint(passport);
  const step = passport.nextStep;
  return <section className="cpp" aria-labelledby={titleId} data-mixed={passport.mixedContexts ? 'true' : 'false'}>
    <header className="cpp-head"><h2 id={titleId}>Pasaporte de continuidad</h2>
      <p className="cpp-lede">Qué sabemos, cuándo lo supimos y qué no está demostrado. Esta hoja no es una copia ni prueba que puedas recuperarte: solo reúne evidencia con su origen.</p>
      <p className="cpp-identity">{passport.identity.installId ? 'Instalación ' + passport.identity.installId + ' · ' : ''}{passport.identity.copy.captureId ? 'copia ' + passport.identity.copy.captureId + ' del ' + when(passport.identity.copy.capturedAt) + (passport.identity.copy.testData ? ' · datos de ensayo' : '') : 'sin copia activa identificada'}</p></header>
    {passport.mixedContexts ? <p className="cpp-banner" role="status">Hay observaciones de más de una copia: se muestran por separado y no se suman.</p> : null}
    {step ? <div className="cpp-next" role="group" aria-label="Próximo paso"><p><strong>Próximo paso:</strong> {step.label}. <span>{step.reason}</span></p>
      {onAction ? <button type="button" className="button primary" onClick={() => onAction(step.action)}>{ACTION_HINT[step.action]}</button> : <p className="cpp-hint">Desde el menú: {ACTION_HINT[step.action].toLowerCase()}.</p>}</div>
      : <p className="cpp-next cpp-next-none">No hay carencias con una acción disponible desde aquí. Revisa igualmente lo que no está demostrado.</p>}
    {passport.sections.map(section => <SectionView key={section.key} section={section} />)}
    <details className="cpp-prov"><summary>Procedencia y exportación</summary>
      <ul className="cpp-claims">{passport.provenance.map(row => <li key={row.source} className="cpp-claim"><p><strong>{SOURCE_LABEL[row.source]}</strong>: {row.status === 'read' ? 'leído' : row.status === 'unavailable' ? 'no se pudo leer' : 'no solicitado'}</p><small>{row.at ? when(row.at) : 'sin fecha'}{row.context ? ' · ' + contextLabel(row.context) : ''}</small></li>)}</ul>
      <p className="cpp-export-note">La exportación es manual, no incluye fichas, credenciales ni rutas del equipo, y separa lo observado, lo declarado y lo no comprobado. El HTML está pensado para imprimirlo y enseñarlo a un auditor: resume la evidencia, deja sitio para la firma y lleva la huella SHA-256 del JSON para comprobar que los dos ficheros son la misma hoja.</p>
      <p className="cpp-fingerprint">Huella del JSON: <code>{fingerprint.slice(0, 16)}…</code></p>
      <div className="cpp-actions"><button type="button" className="button primary" onClick={() => download('both')}>Descargar para auditoría (HTML + JSON)</button><button type="button" className="button secondary" onClick={() => download('html')}>Descargar HTML</button><button type="button" className="button secondary" onClick={() => download('json')}>Descargar JSON</button></div>
      {notice ? <p className="cpp-notice" role="status">{notice}</p> : null}
    </details>
  </section>;
}
