import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/planb-ui.css';
import '../../src/continuity-lab.css';
import { ContinuityLab, buildSyntheticCases } from '../../src/ContinuityLab.js';
import type { ContinuityLabInput } from '../../shared/continuity-lab.js';

// Demostración aislada: el estado vive solo en memoria, con casos ficticios. Sin red, almacenamiento ni datos reales.
function Demo() {
  const cases = useMemo(() => buildSyntheticCases(), []);
  const [caseId, setCaseId] = useState<string | null>(cases[0].id);
  const [input, setInput] = useState<ContinuityLabInput | null>(() => structuredClone(cases[0].input));
  return (
    <ContinuityLab
      input={input}
      cases={cases}
      activeCaseId={caseId}
      onSelectCase={id => { setCaseId(id); setInput(structuredClone(cases.find(c => c.id === id)!.input)); }}
      onInputChange={next => { setCaseId(null); setInput(next); }}
    />
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Demo /></StrictMode>);
