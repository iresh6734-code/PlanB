import { companyDay, companyNewPriority, companyObjectives, companyOptions, companyPerturbations, companyWeek } from './operational-company.js';
import type { CommitmentEvidence } from './commitments.js';
import type { Objectives } from './operational-planner.js';
import type { Hypothesis } from './operational-sensitivity.js';
import { operationalModel, type OperationalModel, type Supposition } from './operational-twin.js';

// SEMANA DE ENSAYO ENLAZADA AL RADAR (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT). Ficción: la empresa 12/3/2/20/8 de operational-company.ts.
// El compromiso focal de esa empresa pasa a SER el compromiso del Radar «ms-installation-hubspot»: lleva su id, su título y su revisión vigente, para que una
// decisión preparada aquí se confirme con el contrato existente de compromisos. El resto de la empresa es ficción propia del ensayo y no existe en el Radar.
// La semana se desplaza en bloque para que el viernes de la ficción coincida con la fecha comprometida del Radar. El reloj del modelo es por tanto el LUNES de esa
// semana de ensayo y queda fijo mientras no cambie la semilla del Radar: reiniciar no lo mueve.

export const REHEARSAL_RADAR_COMMITMENT = 'ms-installation-hubspot';
const TWIN_FOCUS = 'c-i07', TWIN_RIVAL = 'c-i08';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export type RadarLink = { commitmentId: string; revision: string; title: string; dueAt: string };
export type RehearsalCatalogEntry = { id: string; label: string; detail: string; supposition: Supposition };
// Qué dice cada fuente del Radar sobre el compromiso y qué efecto tiene en el ensayo. Una fuente que no se pudo leer NO se sustituye por un valor: deja el dato desconocido.
export type RehearsalSourceEffect = 'not-used' | 'estimated-date' | 'available-now' | 'unknown-material' | 'ticket-open' | 'ticket-resolved' | 'unknown-ticket';
export type RehearsalSource = {
  role: CommitmentEvidence['role']; state: CommitmentEvidence['state']; origin: string | null; observedAt: string | null;
  condition: 'clear' | 'blocked' | 'completed' | null; effect: RehearsalSourceEffect;
};
export type RehearsalDemo = {
  model: OperationalModel; focusId: string; rivalId: string; sources: RehearsalSource[];
  perturbations: RehearsalCatalogEntry[]; options: RehearsalCatalogEntry[]; hypotheses: Hypothesis[];
  objectives: { focus: Objectives; rival: Objectives };
};

function shift<T>(value: T, deltaMs: number, focusId: string): T {
  if (typeof value === 'string') return (value === TWIN_FOCUS ? focusId : ISO.test(value) ? new Date(Date.parse(value) + deltaMs).toISOString() : value) as T;
  if (Array.isArray(value)) return value.map(item => shift(item, deltaMs, focusId)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shift(inner, deltaMs, focusId)])) as T;
  return value;
}

export function buildRehearsalDemo(link: RadarLink, evidence: CommitmentEvidence[] = []): RehearsalDemo {
  if (link.commitmentId !== REHEARSAL_RADAR_COMMITMENT) throw new RangeError('Ese compromiso no tiene semana de ensayo en esta ficción.');
  const base = companyWeek(), twinDue = base.commitments.find(item => item.id === TWIN_FOCUS)!.dueAt;
  const delta = Date.parse(link.dueAt) - Date.parse(twinDue);
  if (!Number.isFinite(delta)) throw new RangeError('La fecha del compromiso del Radar no es válida.');
  const moved = shift(base, delta, link.commitmentId);
  const focus = moved.commitments.find(item => item.id === link.commitmentId)!;
  focus.revision = link.revision; focus.title = link.title; focus.dueAt = link.dueAt;
  // Los trabajos y materiales del compromiso focal se nombran como el compromiso del Radar, para que la explicación hable de lo mismo que la ficha.
  const rename: Record<string, string> = {
    i07: 'Instalar los 12 equipos en Almacén Norte', t03: 'Ticket: incidencia pendiente en Almacén Norte', o07: 'Preparar el pedido de Almacén Norte',
    'mat-bomba': 'Equipos del pedido (retenidos)', 'mat-bomba-alt': 'Equipos equivalentes',
  };
  for (const item of [...moved.jobs, ...moved.materials]) if (rename[item.id]) item.title = rename[item.id];
  // PROYECCIÓN DE FUENTES. La fecha de reposición del material es una estimación declarada de la ficción; lo que aporta el Radar es si la fuente de entrega y la de soporte
  // se pudieron leer y qué dijeron. Entrega ilegible, parcial, sin vínculo o ambigua → la disponibilidad del material pasa a DESCONOCIDA. Soporte ilegible → la duración
  // del ticket pasa a desconocida. Entrega observada como completada o sin bloqueo → el material está disponible ya. Ticket observado como resuelto → deja de ser un trabajo.
  const unreadable = (state: CommitmentEvidence['state']) => state === 'unavailable' || state === 'missing' || state === 'ambiguous' || state === 'partial';
  const reason = (state: CommitmentEvidence['state']) => state === 'partial' ? 'source-partial' as const : state === 'unavailable' ? 'source-unavailable' as const : 'not-provided' as const;
  const sources: RehearsalSource[] = evidence.map(entry => {
    const observation = entry.observation, usable = entry.state === 'observed' || entry.state === 'stale';
    let effect: RehearsalSourceEffect = 'not-used';
    if (entry.role === 'delivery') {
      const material = moved.materials.find(item => item.id === 'mat-bomba')!;
      if (unreadable(entry.state)) { material.availableAt = { state: 'unknown', reason: reason(entry.state) }; effect = 'unknown-material'; }
      else if (usable && observation && observation.condition !== 'blocked') {
        const { provider, accountId, kind, remoteId } = observation.reference;
        material.availableAt = { state: 'known', value: moved.clock.now, provenance: { basis: 'observed', source: { provider, accountId, kind, remoteId }, observedAt: observation.observedAt, coverage: 'complete' } };
        effect = 'available-now';
      } else effect = 'estimated-date';
    }
    if (entry.role === 'support') {
      const ticket = moved.jobs.find(item => item.id === 't03')!;
      if (unreadable(entry.state)) { ticket.duration = { state: 'unknown', reason: reason(entry.state) }; effect = 'unknown-ticket'; }
      else if (usable && observation?.condition === 'completed') {
        moved.jobs = moved.jobs.filter(item => item.id !== 't03');
        if (moved.currentPlan) for (const sequence of moved.currentPlan.plan.sequences) sequence.jobIds = sequence.jobIds.filter(value => value !== 't03');
        effect = 'ticket-resolved';
      } else effect = 'ticket-open';
    }
    const reference = observation?.reference ?? entry.linked?.reference ?? null;
    return {
      role: entry.role, state: entry.state, observedAt: observation?.observedAt ?? null, condition: observation?.condition ?? null, effect,
      origin: reference ? reference.provider + ' · ' + reference.accountId + ' · ' + reference.remoteId : null,
    };
  });
  const model = operationalModel.parse(moved), at = (date: number, hour: number) => new Date(Date.parse(companyDay(date, hour)) + delta).toISOString();
  const entry = (supposition: Supposition, label: string, detail: string): RehearsalCatalogEntry => ({ id: supposition.id, label, detail, supposition: shift(supposition, delta, link.commitmentId) });
  return {
    model, focusId: link.commitmentId, rivalId: TWIN_RIVAL, sources,
    perturbations: [
      entry(companyPerturbations.materialDelay, 'Los equipos retenidos llegan un día más tarde', 'El material retenido estaría disponible el viernes, no el jueves.'),
      entry(companyPerturbations.technicianOut, 'Ana está de baja el jueves', 'Se pierde una jornada de la técnica que comparte las dos instalaciones.'),
      entry(companyPerturbations.sourceDown, 'Se cae la fuente de pedidos (cuenta A)', 'Lo que esa fuente acreditaba deja de saberse; no se da por bueno ni por malo.'),
      entry(companyPerturbations.reopen, 'Se reabre la instalación de Clínica Alba', 'Un trabajo ya previsto necesita dos horas más a partir del jueves.'),
    ],
    options: [
      entry(companyOptions[0], 'Cruz aplaza la formación del jueves', 'Pide una jornada extra (8 h) a Cruz.'),
      entry(companyOptions[1], 'Usar equipos equivalentes del Almacén Sur', 'Depende de un material alternativo declarado disponible el martes.'),
      entry(companyOptions[2], 'Renegociar la fecha al lunes siguiente', 'Pide al cliente mover la fecha comprometida.'),
      entry(companyOptions[3], 'Dividir la instalación en dos partes', 'Dos técnicos hacen media instalación cada uno.'),
    ],
    hypotheses: [
      { id: 'bomba-alt', question: '¿Cuándo estarían de verdad los equipos equivalentes?', target: { type: 'material-availability', materialId: 'mat-bomba-alt' }, values: [at(10, 7), at(13, 7)] },
      { id: 'ticket-solar', question: '¿Cuánto dura el ticket de producción solar, que no tiene duración?', target: { type: 'job-duration', jobId: 't07' }, values: [45, 240] },
    ],
    objectives: {
      focus: shift(companyObjectives, delta, link.commitmentId),
      rival: shift(companyNewPriority, delta, link.commitmentId),
    },
  };
}
