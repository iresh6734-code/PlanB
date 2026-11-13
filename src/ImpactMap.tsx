import { useId, useState } from 'react';
import { BASIS_LABEL, CURRENCY_LABEL, when, type PassportAction } from '../shared/continuity-passport.js';
import { STATUS_LABEL, impactToHtml, impactToJson, type ImpactMap as Map, type ImpactRow } from '../shared/impact-map.js';
import './impact-map.css';

// Mapa de impacto y resumen de turno (unidad 215): presentación de un `ImpactMap` ya construido. No llama a la red; la descarga es manual.
// Sin consumidor montado todavía: ver el traspaso de la unidad.
export interface ImpactMapProps {
  map: Map;
  /** Abre la superficie existente que resuelve la fila. Sin él no se ofrece un botón que no hace nada. */
  onAction?: (action: PassportAction) => void;
  onDownload?: (file: { name: string; type: string; text: string }) => void;
}
const ACTION_LABEL: Record<PassportAction, string> = { 'open-preparation': 'Abrir la preparación', 'open-integrations': 'Abrir Integraciones', 'open-today': 'Abrir Hoy', 'open-export': 'Abrir Exportar', 'start-rehearsal': 'Ensayar un relevo', 'open-continuity': 'Abrir Continuidad' };
function saveFile(file: { name: string; type: string; text: string }) {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type })), link = document.createElement('a');
  link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function RowView({ row, onAction }: { row: ImpactRow; onAction?: (action: PassportAction) => void }) {
  return <li className={'imp-row imp-' + row.status} data-status={row.status} data-area={row.area} data-row={row.id}>
    <p><span className="imp-badge">{STATUS_LABEL[row.status]}</span> <strong>{row.title}.</strong> {row.detail}</p>
    <small>{BASIS_LABEL[row.basis]}{CURRENCY_LABEL[row.currency] && row.currency !== 'current' ? ' · ' + CURRENCY_LABEL[row.currency] : ''}{row.at ? ' · ' + when(row.at) : ''}{row.limits.length ? ' · ' + row.limits.join(' ') : ''}</small>
    {row.action ? (onAction ? <button type="button" className="button secondary" onClick={() => onAction(row.action!)}>{ACTION_LABEL[row.action]}</button> : <small className="imp-hint">Desde el menú: {ACTION_LABEL[row.action].toLowerCase()}.</small>) : row.missing ? <p className="imp-missing">Falta: {row.missing}</p> : null}
  </li>;
}
export function ImpactMap({ map, onAction, onDownload = saveFile }: ImpactMapProps) {
  const titleId = useId(), [notice, setNotice] = useState('');
  const urgent = map.rows.filter(r => r.status === 'blocked' || r.status === 'attention'), unknown = map.rows.filter(r => r.status === 'unknown'), ok = map.rows.filter(r => r.status === 'ok');
  const download = (kind: 'html' | 'json') => {
    const day = map.generatedAt.slice(0, 10) || 'sin-fecha';
    onDownload(kind === 'html' ? { name: 'resumen-de-turno-' + day + '.html', type: 'text/html', text: impactToHtml(map) } : { name: 'resumen-de-turno-' + day + '.json', type: 'application/json', text: impactToJson(map) });
    setNotice('Se preparó el fichero ' + kind.toUpperCase() + ' en tu equipo. No se envió a ningún sitio.');
  };
  const d = map.summary.firstDecision;
  return <section className="imp" aria-labelledby={titleId}>
    <header><h2 id={titleId}>Mapa de impacto</h2><p className="imp-lede">Qué podría impedir que sigamos trabajando. Todo sale de lo observado; lo que no se ha comprobado se dice.</p></header>
    <div className="imp-summary" role="status" data-testid="shift-summary"><h3>Resumen de turno</h3><p className="imp-lead">{map.summary.lead}</p>
      {d ? <div className="imp-decision"><p><strong>Primera decisión:</strong> {d.title}.</p>{onAction ? <button type="button" className="button primary" onClick={() => onAction(d.action)}>{ACTION_LABEL[d.action]}</button> : null}</div> : null}
      <ul className="imp-lines">{map.summary.lines.map((line, index) => <li key={index} data-status={line.status}><span className="imp-badge">{STATUS_LABEL[line.status]}</span> {line.text}</li>)}</ul></div>
    <h3>Qué requiere atención ahora</h3>
    {urgent.length ? <ul className="imp-rows">{urgent.map(row => <RowView key={row.id} row={row} onAction={onAction} />)}</ul> : <p className="imp-none">No hay puntos que bloqueen o requieran atención con lo que se ha podido comprobar.</p>}
    {unknown.length ? <details className="imp-more" open={urgent.length === 0}><summary>Sin comprobar ({unknown.length})</summary><ul className="imp-rows">{unknown.map(row => <RowView key={row.id} row={row} onAction={onAction} />)}</ul></details> : null}
    {ok.length ? <details className="imp-more"><summary>Sin incidencia ({ok.length})</summary><ul className="imp-rows">{ok.map(row => <RowView key={row.id} row={row} onAction={onAction} />)}</ul></details> : null}
    <details className="imp-more imp-export"><summary>Exportar el resumen de turno</summary>
      <p className="imp-hint">La exportación es manual, incluye el plan de relevo y no lleva fichas, credenciales ni rutas del equipo.</p>
      <div className="imp-actions"><button type="button" className="button secondary" onClick={() => download('html')}>Descargar HTML</button><button type="button" className="button secondary" onClick={() => download('json')}>Descargar JSON</button></div>
      {notice ? <p className="imp-notice" role="status">{notice}</p> : null}</details>
  </section>;
}
