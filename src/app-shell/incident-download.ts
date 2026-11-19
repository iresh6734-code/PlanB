import type { Change } from '../../shared/model.js';
import type { ContinuityStatus } from '../../shared/operations.js';
import { APP_VERSION } from '../../shared/version.js';
import { api } from '../api.js';
import type { IncidentWindow } from './contingency.js';

export type IncidentFormat = 'html' | 'json';
const fileStamp = (value: string) => { const date = new Date(value); const pad = (n: number) => String(n).padStart(2, '0'); return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes()); };

/** R2 · Genera el expediente con el historial local y lo descarga. El generador se carga solo al pedirlo; nada sale del equipo. */
export async function downloadIncident(window: IncidentWindow, format: IncidentFormat, labels?: Readonly<Record<string, string>>): Promise<string> {
  const [module, history, continuity] = await Promise.all([
    import('./incident-report.js'),
    api<{ changes: Change[]; watermark: number }>('/v2/changes'),
    api<ContinuityStatus>('/v2/continuity').catch(() => null),
  ]);
  if (!Array.isArray(history.changes)) throw new Error('No se pudo leer el historial de cambios de este ordenador.');
  const report = module.incidentReport({ window, changes: history.changes, watermark: Number.isSafeInteger(history.watermark) ? history.watermark : 0, captures: continuity?.captures ?? [], labels, version: APP_VERSION, generatedAt: new Date() });
  const files = module.incidentFiles(report);
  const name = 'plan-b-incidente-' + fileStamp(window.startedAt) + '.' + format;
  const url = URL.createObjectURL(new Blob([format === 'html' ? files.html : files.json], { type: format === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return module.incidentHeadline(report);
}
