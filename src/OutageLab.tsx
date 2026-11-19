import { useMemo, useState } from 'react';
import { ContinuityLab, buildSyntheticCases } from './ContinuityLab.js';
import type { ContinuityLabInput } from '../shared/continuity-lab.js';
import './continuity-lab.css';

/** Laboratorio · «¿Y si cae…?»: monta el Laboratorio de caídas con sus casos ficticios. Todo vive en memoria de esta pantalla. */
export function OutageLab() {
  const cases = useMemo(buildSyntheticCases, []);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(cases[0]?.id ?? null);
  const [input, setInput] = useState<ContinuityLabInput | null>(cases[0]?.input ?? null);
  const selectCase = (id: string) => {
    const chosen = cases.find(c => c.id === id);
    if (!chosen) return;
    setActiveCaseId(id);
    setInput(structuredClone(chosen.input));
  };
  return <div className="gx-outage-lab">
    <h1 className="sr-only">¿Y si cae…? Laboratorio de caídas</h1>
    <ContinuityLab input={input} onInputChange={next => { setInput(next); if (!next) setActiveCaseId(null); }} cases={cases} activeCaseId={activeCaseId} onSelectCase={selectCase} />
  </div>;
}
