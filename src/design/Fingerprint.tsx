// Plan B · sello de huella, componente común del sistema de diseño (corte 1 del plan de diseño «una sola app»): la huella
// completa y si coincide con el contenido. Lo usan el informe, el parte, la equivalencia, el expediente y el visor.
import React from 'react';

/** El sello: la huella completa y si coincide con el contenido. */
export function Fingerprint({ label, value, intact, broken }: { label: string; value: string; intact: boolean; broken: string }) {
  return (
    <div className="pb-fingerprint" data-ok={intact ? 'true' : 'false'}>
      <svg className="pb-stamp" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="none" strokeWidth="2" />
        <circle cx="32" cy="32" r="22.5" fill="none" strokeWidth="1" strokeDasharray="3 3" />
        {intact
          ? <path d="M22 33l7 7 13-15" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M24 24l16 16M40 24L24 40" fill="none" strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
      <div className="pb-fingerprint-text">
        <span className="pb-fingerprint-label">{label}</span>
        <code>{value}</code>
        <span className="pb-check" data-ok={intact ? 'true' : 'false'}>{intact ? 'Coincide con el contenido' : broken}</span>
      </div>
    </div>
  );
}
