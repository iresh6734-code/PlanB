import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { when } from '../shared/continuity-passport.js';
import { COVERAGE_LABEL, PROVENANCE_LABEL, SITUATION_LABEL, needsAttention, situationOf, workSummaryFileName, workSummaryToHtml, workSummaryToJson, type WorkSummary } from '../shared/work-summary.js';
import { loadWorkSummary, type WorkSummaryResult } from './work-summary-client.js';
import './work-summary.css';

// Tarjeta del TRABAJO LOCAL PENDIENTE para Continuidad (unidad 255). Lee el resumen PÚBLICO del diario (solo recuentos) y muestra DISTINTAS las situaciones: vacía, con trabajo, ilegible, sin cobertura, no disponible,
// bloqueada y «esta versión todavía no lo ofrece». «Abrir Hoy» y «Trabajo por recuperar» solo se ofrecen si el anfitrión los tiene; si no, se explica. La descarga es manual, por lista blanca y no es una copia restaurable.
// Sin consumidor montado todavía: ver coordination/plans/MONTAJE-RESUMEN-255.md. El endpoint real lo publica la autora del diario (208) tras su aceptación.
export interface WorkSummaryProps {
  fetcher?: typeof fetch;
  /** Captura activa en la notación de la evidencia (`context.captureId`). Si se informa y el resumen es de otra, no se acredita. */
  expectedContext?: string | null;
  /** Cambiar la clave descarta lo leído y vuelve a leer (sesión, copia, conexión). */
  identityKey?: string;
  now?: () => number;
  onOpenToday?: () => void;
  onOpenRecoverable?: () => void;
  /** Cada lectura publicada (para alimentar la fuente `work` del hub con el MISMO resumen). */
  onSummary?: (result: WorkSummaryResult | null) => void;
  onDownload?: (file: { name: string; type: string; text: string }) => void;
}
function saveFile(file: { name: string; type: string; text: string }) {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type })), link = document.createElement('a');
  link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

export function WorkSummary({ fetcher, expectedContext = null, identityKey = '', onOpenToday, onOpenRecoverable, onSummary, onDownload = saveFile }: WorkSummaryProps) {
  const titleId = useId(), [state, setState] = useState<WorkSummaryResult | null>(null), [loading, setLoading] = useState(true), [notice, setNotice] = useState(''), [hint, setHint] = useState('');
  const alive = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null), onSummaryRef = useRef(onSummary); onSummaryRef.current = onSummary;
  const load = useCallback((reset: boolean) => {
    const mine = ++generation.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    const current = () => alive.current && generation.current === mine; if (reset) { setState(null); onSummaryRef.current?.(null); } setLoading(true);
    return loadWorkSummary({ signal: abort.signal, fetcher }).then(result => { if (!current()) return; setState(result); onSummaryRef.current?.(result); }, () => undefined).finally(() => { if (current()) setLoading(false); });
  }, [fetcher]);
  useEffect(() => { alive.current = true; void load(true); return () => { alive.current = false; generation.current++; controller.current?.abort(); }; }, [load, identityKey]);

  const summary: WorkSummary | null = state?.kind === 'read' ? state.summary : null;
  const otherCopy = !!summary && expectedContext !== null && summary.scope.context !== expectedContext;
  const situation = summary && !otherCopy ? situationOf(summary) : null;
  const download = (kind: 'html' | 'json') => {
    if (!summary || otherCopy) return;
    try { onDownload({ name: workSummaryFileName(summary, kind), type: kind === 'html' ? 'text/html' : 'application/json', text: kind === 'html' ? workSummaryToHtml(summary) : workSummaryToJson(summary) }); setNotice('Se preparó el fichero ' + kind.toUpperCase() + ' en tu equipo: solo recuentos, no es una copia restaurable. No se envió a ningún sitio.'); }
    catch { setNotice('No se pudo preparar el fichero.'); }
  };
  const go = (action: (() => void) | undefined, what: string) => { setHint(''); if (action) action(); else setHint('Abre ' + what + ' desde el menú: esta pantalla todavía no tiene ese enlace.'); };
  let head: string, detail: string | null = null, tone = 'unknown';
  if (!state) { head = 'Leyendo el trabajo local pendiente…'; }
  else if (state.kind === 'locked') { head = 'Plan B está bloqueado: desbloquéalo para leer el trabajo local pendiente.'; tone = 'attention'; }
  else if (state.kind === 'not-registered') { head = 'Esta versión todavía no ofrece el resumen del trabajo local.'; detail = 'No es que no haya trabajo pendiente: simplemente no se puede consultar desde aquí. Mira Hoy.'; }
  else if (state.kind === 'invalid') { head = 'La respuesta del resumen no es válida y no se usa.'; detail = 'Se desconoce cuánto trabajo local hay (no es cero).'; tone = 'attention'; }
  else if (state.kind === 'failed') { head = 'No se pudo leer el trabajo local pendiente.'; detail = 'Se desconoce cuánto hay (no es cero).'; tone = 'attention'; }
  else if (otherCopy) { head = 'El resumen es de otra copia y no se muestra como actual.'; detail = 'Pertenece a otra captura que la copia activa de esta pantalla. Vuelve a leerlo cuando la copia activa esté confirmada.'; tone = 'attention'; }
  else {
    const s = state.summary;
    head = SITUATION_LABEL[situation!]; tone = situation === 'empty' ? 'ok' : situation === 'pending' || situation === 'unreadable' ? 'attention' : 'unknown';
    detail = situation === 'empty' ? 'Leído sin entradas pendientes, con cobertura completa.' : situation === 'uncovered' ? 'El cuaderno no cubre esta copia: no se sabe cuánto trabajo hay (desconocido, no es cero).' : situation === 'unavailable' ? 'No se pudo leer el cuaderno: se desconoce cuánto hay (no es cero).' : s.coverage === 'partial' ? 'Cobertura parcial: hay entradas ilegibles que pudieran ser de esta copia, así que los recuentos son como mínimo.' : null;
  }
  const s = summary && !otherCopy ? summary : null, counts = s?.counts ?? null, attention = !!s && needsAttention(s);
  return <section className={'wks wks-' + tone} aria-labelledby={titleId} aria-busy={loading} data-situation={situation ?? state?.kind ?? 'loading'} data-testid="work-summary">
    <h3 id={titleId}>Trabajo local pendiente</h3>
    <p className="wks-head" role="status">{head}</p>
    {detail ? <p className="wks-detail">{detail}</p> : null}
    {s && counts ? <ul className="wks-counts" aria-label="Recuentos del cuaderno">
      <li data-kind="drafts"><strong>{counts.drafts}</strong> {counts.drafts === 1 ? 'borrador recuperable sin enviar' : 'borradores recuperables sin enviar'}</li>
      <li data-kind="unknown"><strong>{counts.unknownOutcome}</strong> {counts.unknownOutcome === 1 ? 'guardado por comprobar (salió y no se sabe si se aplicó)' : 'guardados por comprobar (salieron y no se sabe si se aplicaron)'}</li>
      <li data-kind="settled"><strong>{counts.settled}</strong> {counts.settled === 1 ? 'intento ya resuelto' : 'intentos ya resueltos'}</li>
      {counts.otherContext ? <li data-kind="other"><strong>{counts.otherContext}</strong> {counts.otherContext === 1 ? 'intento de otra copia (no se suma)' : 'intentos de otra copia (no se suman)'}</li> : null}
    </ul> : null}
    {s && s.quarantine && s.quarantine.unreadable > 0 ? <p className="wks-quarantine" data-testid="work-quarantine">{plural(s.quarantine.unreadable, 'entrada ilegible o en cuarentena', 'entradas ilegibles o en cuarentena')}: se desconoce lo que contienen y no se suman a los recuentos.</p> : null}
    {s ? <small className="wks-meta">Leído el {when(s.at)} · {PROVENANCE_LABEL[s.provenance]} · cobertura {COVERAGE_LABEL[s.coverage]}</small> : null}
    <div className="wks-actions">
      {(attention || state?.kind === 'not-registered') ? <button type="button" className="button primary" onClick={() => go(onOpenToday, 'Hoy')}>Abrir Hoy</button> : null}
      {attention ? <button type="button" className="button secondary" onClick={() => go(onOpenRecoverable, '«Trabajo por recuperar»')}>Abrir Trabajo por recuperar</button> : null}
      <button type="button" className="button secondary" disabled={loading} onClick={() => void load(false)}>Leer de nuevo</button>
    </div>
    {hint ? <p className="wks-hint" role="status" data-testid="work-hint">{hint}</p> : null}
    {s ? <details className="wks-export"><summary>Descargar este resumen</summary>
      <p className="wks-detail">Solo recuentos y sus límites: sin borradores, parches, valores ni datos de personas. No es una copia ni se puede restaurar.</p>
      <div className="wks-actions"><button type="button" className="button secondary" onClick={() => download('html')}>Descargar HTML</button><button type="button" className="button secondary" onClick={() => download('json')}>Descargar JSON</button></div>
      {notice ? <p className="wks-hint" role="status">{notice}</p> : null}</details> : null}
  </section>;
}
