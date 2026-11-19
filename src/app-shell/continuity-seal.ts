import type { ContinuityStatus } from '../../shared/operations.js';
import { drillCalendar } from './continuity-insights.js';
import { formatHours, madridDay, monthOf, monthStats, previousMonth, type MonthStats } from './monthly-report.js';

/** R5 · Sello de continuidad: cuatro niveles calculados en local con la preparación, el calendario de simulacros y el
 *  informe mensual. Cada nivel dice qué criterio cumple y cuál falta. Es un resumen interno, no una certificación. */
export type SealLevel = 'none' | 'preparing' | 'checked' | 'constant';
export const SEAL_LABEL: Record<SealLevel, string> = { none: 'Sin sello', preparing: 'En preparación', checked: 'Comprobado', constant: 'Constante' };
export const SEAL_DISCLAIMER = 'Sello interno de Plan B: resume lo que este ordenador ha comprobado. No es una certificación.';
/** Un mes cuenta como comprobado con al menos un simulacro superado y copia en el 80 % de sus días. */
export const SEAL_COVERAGE = 0.8;
export const SEAL_MONTHS = 3;

export type SealCriterionId = 'copy' | 'fresh' | 'steps' | 'drill' | 'gaps' | 'months';
export interface SealCriterion { id: SealCriterionId; label: string; met: boolean; detail: string }
export interface SealMonth { month: string; label: string; partial: boolean; ok: boolean; detail: string }
export interface ContinuitySeal {
  level: SealLevel; label: string; tone: 'ok' | 'warn' | 'neutral';
  headline: string; criteria: SealCriterion[]; months: SealMonth[]; streak: number;
  /** Primer criterio sin cumplir: lo que separa del nivel siguiente. */ next: SealCriterion | null;
  /** Referencia corta de lo que se evaluó (nivel, criterios, meses y día) para reconocer el mismo sello impreso. No es una firma. */ reference: string;
  day: string;
}
type Source = Pick<ContinuityStatus, 'captures' | 'reports' | 'jobs' | 'stale'>;

const monthOk = (stats: MonthStats) => stats.drillsPassed > 0 && stats.daysInScope > 0 && stats.daysCovered / stats.daysInScope >= SEAL_COVERAGE;
function monthRow(stats: MonthStats): SealMonth {
  const coverage = stats.daysCovered + ' de ' + stats.daysInScope + ' días con copia';
  const drills = stats.drillsPassed ? (stats.drillsPassed === 1 ? '1 simulacro superado' : stats.drillsPassed + ' simulacros superados') : 'sin simulacro superado';
  return { month: stats.month, label: stats.label, partial: stats.partial, ok: monthOk(stats), detail: coverage + ' · ' + drills };
}

/** FNV-1a de 32 bits en dos grupos: basta para distinguir un sello de otro a simple vista. */
function reference(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
  const hex = hash.toString(16).toUpperCase().padStart(8, '0');
  return 'PB-' + hex.slice(0, 4) + '-' + hex.slice(4);
}

export function continuitySeal(status: Source, readiness: { done: number; total: number; missing?: readonly string[] }, now: Date): ContinuitySeal {
  const hasCapture = status.captures.length > 0;
  const calendar = drillCalendar(status, now);
  const currentMonth = monthOf(now);
  const monthKeys = [currentMonth];
  for (let index = 1; index <= SEAL_MONTHS; index++) monthKeys.push(previousMonth(monthKeys[index - 1]));
  const stats = monthKeys.map(month => monthStats(status, month, now));
  const months = stats.map(monthRow);
  // La racha empieza en este mes si ya está comprobado; si no, en el anterior (el mes en curso aún puede cumplirse).
  let streak = 0;
  for (let index = months[0].ok ? 0 : 1; index < months.length && months[index].ok; index++) streak++;
  const current = stats[0];
  const gapsMet = hasCapture && current.longestGapHours !== null && current.longestGapHours < 24;
  const missing = readiness.missing?.length ? ': falta ' + readiness.missing.map(item => item.charAt(0).toLowerCase() + item.slice(1)).join(', ') : '';
  const criteria: SealCriterion[] = [
    { id: 'copy', label: 'Hay una captura completa', met: hasCapture, detail: hasCapture ? (status.captures.length === 1 ? '1 captura conservada' : status.captures.length + ' capturas conservadas') : 'Todavía no hay ninguna captura' },
    { id: 'fresh', label: 'La copia está al día', met: hasCapture && !status.stale, detail: !hasCapture ? 'Sin captura no hay copia que mirar' : status.stale ? 'La última captura se ha quedado vieja' : 'La última captura es reciente' },
    { id: 'steps', label: 'Preparación completa', met: readiness.total > 0 && readiness.done === readiness.total, detail: readiness.done + ' de ' + readiness.total + ' pasos' + missing },
    { id: 'drill', label: 'Simulacro superado en los últimos 30 días', met: calendar.state === 'ok' || calendar.state === 'soon', detail: calendar.title },
    { id: 'gaps', label: 'Sin huecos de más de 24 h este mes', met: gapsMet, detail: current.longestGapHours === null ? 'Sin capturas este mes' : 'Mayor hueco: ' + formatHours(current.longestGapHours) },
    { id: 'months', label: SEAL_MONTHS + ' meses seguidos comprobados', met: streak >= SEAL_MONTHS, detail: streak === 0 ? 'Ningún mes comprobado todavía' : (streak === 1 ? '1 mes seguido' : streak + ' meses seguidos') + ' (simulacro superado y copia el ' + Math.round(SEAL_COVERAGE * 100) + ' % de los días)' },
  ];
  const base = criteria.slice(0, 5), checked = base.every(item => item.met);
  const level: SealLevel = !hasCapture ? 'none' : checked && criteria[5].met ? 'constant' : checked ? 'checked' : 'preparing';
  const next = criteria.find(item => !item.met) ?? null;
  const headline = ({
    none: 'Sin sello: primero hace falta una captura.',
    preparing: 'En preparación: ' + base.filter(item => item.met).length + ' de ' + base.length + ' criterios para «Comprobado».',
    checked: 'Comprobado: copia al día, preparada y probada este mes.' + (streak ? ' Racha de ' + (streak === 1 ? '1 mes' : streak + ' meses') + '.' : ''),
    constant: 'Constante: ' + streak + ' meses seguidos comprobados.',
  } as const)[level];
  const day = madridDay(now);
  const ref = reference(JSON.stringify({ level, criteria: criteria.map(item => item.met ? 1 : 0), months: months.map(item => item.month + (item.ok ? '+' : '-')), day }));
  return { level, label: SEAL_LABEL[level], tone: level === 'none' ? 'neutral' : level === 'preparing' ? 'warn' : 'ok', headline, criteria, months, streak, next, reference: ref, day };
}

/** Insignia como SVG autónomo (para el informe imprimible): solo formas y el nombre del nivel, sin datos de la copia. */
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value: string) => value.replace(/[&<>"']/g, character => ESC[character]!);
export const SEAL_INK: Record<SealLevel, string> = { none: '#7a7264', preparing: '#9a5b00', checked: '#2c6643', constant: '#1f4f8a' };
export function sealSvg(seal: Pick<ContinuitySeal, 'level' | 'label'>, size = 96): string {
  const ink = SEAL_INK[seal.level];
  const mark = seal.level === 'constant' ? '<path d="M34 50l8 8 16-17M44 50l8 8 16-17" fill="none" stroke="' + ink + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    : seal.level === 'checked' ? '<path d="M37 50l9 9 18-19" fill="none" stroke="' + ink + '" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>'
    : seal.level === 'preparing' ? '<path d="M50 30a20 20 0 0 1 0 40z" fill="' + ink + '" opacity=".85"/>'
    : '<circle cx="50" cy="50" r="5" fill="' + ink + '"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img" aria-label="Sello de continuidad: ' + escape(seal.label) + '">'
    + '<circle cx="50" cy="50" r="46" fill="none" stroke="' + ink + '" stroke-width="2.5" stroke-dasharray="' + (seal.level === 'none' ? '4 5' : 'none') + '"/>'
    + '<circle cx="50" cy="50" r="38" fill="none" stroke="' + ink + '" stroke-width="1.2" opacity=".6"/>'
    + '<circle cx="50" cy="50" r="22" fill="none" stroke="' + ink + '" stroke-width="2"/>'
    + mark
    + '<text x="50" y="86" text-anchor="middle" font-family="Georgia, serif" font-size="9" letter-spacing="1.2" fill="' + ink + '">PLAN B</text>'
    + '<text x="50" y="20" text-anchor="middle" font-family="system-ui, sans-serif" font-size="7.5" font-weight="700" letter-spacing=".8" fill="' + ink + '">' + escape(seal.label.toUpperCase()) + '</text>'
    + '</svg>';
}

/** Bloque HTML del sello para el informe mensual: insignia, criterios, meses y la advertencia fija. */
export function sealHtml(seal: ContinuitySeal): string {
  return '<section class="seal"><div class="seal-badge">' + sealSvg(seal, 104) + '</div><div><p class="seal-head"><strong>' + escape(seal.label) + '</strong> · ' + escape(seal.headline) + '</p>'
    + '<ul class="seal-list">' + seal.criteria.map(item => '<li class="' + (item.met ? 'met' : 'unmet') + '">' + (item.met ? '✓ ' : '○ ') + escape(item.label) + ' <span>— ' + escape(item.detail) + '</span></li>').join('') + '</ul>'
    + '<p class="seal-months">' + seal.months.map(item => escape(item.label) + (item.partial ? ' (en curso)' : '') + ': ' + (item.ok ? 'comprobado' : 'no') ).join(' · ') + '</p>'
    + '<p class="seal-note">' + escape(SEAL_DISCLAIMER) + ' Referencia ' + escape(seal.reference) + ' del ' + escape(seal.day) + '.</p></div></section>';
}
