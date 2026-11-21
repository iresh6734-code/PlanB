import { Check, Circle } from 'lucide-react';
import { ProBadge } from './ProBadge.js';
import { SEAL_DISCLAIMER, type ContinuitySeal, type SealLevel } from './continuity-seal.js';
import './continuity-seal.css';

/** R5 · Insignia del sello: misma geometría que `sealSvg` (el informe), con el color del nivel desde los tokens. */
export function SealBadge({ level, label, size = 88 }: { level: SealLevel; label: string; size?: number }) {
  return <svg className="seal-badge" data-level={level} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={'Sello de continuidad: ' + label}>
    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={level === 'none' ? '4 5' : undefined} />
    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".6" />
    <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
    {level === 'constant' ? <path d="M34 50l8 8 16-17M44 50l8 8 16-17" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      : level === 'checked' ? <path d="M37 50l9 9 18-19" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      : level === 'preparing' ? <path d="M50 30a20 20 0 0 1 0 40z" fill="currentColor" opacity=".85" />
      : <circle cx="50" cy="50" r="5" fill="currentColor" />}
    <text x="50" y="86" textAnchor="middle" fontSize="9" letterSpacing="1.2" fill="currentColor" className="seal-badge-brand">PLAN B</text>
    <text x="50" y="20" textAnchor="middle" fontSize="7.5" fontWeight="700" letterSpacing=".8" fill="currentColor">{label.toUpperCase()}</text>
  </svg>;
}

/** Continuidad › Estado: el sello con cada criterio cumplido o pendiente y los últimos meses. */
export function SealCard({ seal }: { seal: ContinuitySeal }) {
  const months = [...seal.months].reverse();
  return <section className="ct-seal" data-level={seal.level} aria-labelledby="ct-seal-title">
    <div className="ct-seal-mark"><SealBadge level={seal.level} label={seal.label} size={72} /></div>
    <div className="ct-seal-body">
      <h2 id="ct-seal-title">Sello de continuidad: {seal.label} <ProBadge feature="continuity-seal" /></h2>
      <p className="ct-seal-headline">{seal.headline}</p>
      <ul className="ct-seal-criteria">{seal.criteria.map(item => <li key={item.id} data-met={item.met ? 'true' : 'false'}>
        <span className="ct-seal-tick" aria-hidden="true">{item.met ? <Check size={13} strokeWidth={3} /> : <Circle size={11} />}</span>
        <span><strong>{item.label}</strong><small>{item.detail}</small></span>
        <span className="oc-sr">{item.met ? 'Cumplido' : 'Pendiente'}</span>
      </li>)}</ul>
    </div>
    <div className="ct-seal-side">
      <ol className="ct-seal-months" aria-label="Meses comprobados">{months.map(item => <li key={item.month} data-ok={item.ok ? 'true' : 'false'} data-partial={item.partial ? 'true' : undefined} title={item.detail}>
        <span>{item.label.replace(/ de \d{4}$/, '').slice(0, 3)}</span><i aria-hidden="true" /><small>{item.ok ? 'Comprobado' : item.partial ? 'En curso' : 'No'}</small>
      </li>)}</ol>
      <p className="ct-seal-note">{SEAL_DISCLAIMER} <span>Referencia {seal.reference}</span></p>
    </div>
  </section>;
}