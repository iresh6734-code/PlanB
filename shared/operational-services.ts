import { operationalModel, operationalTwinFormat, sha256Hex, type OperationalModel, type SourceRef, type Supposition } from './operational-twin.js';
import type { Objectives } from './operational-planner.js';
import type { Hypothesis } from './operational-sensitivity.js';

// SEGUNDO CASO DE NEGOCIO, DE FICCIÓN (unidad CLAUDE-FABLE-OPERATIONAL-SERVICES): un estudio de servicios y proyectos.
// Usa el MISMO contrato y el mismo motor que la distribuidora/instaladora, sin tocarlos. Lo que cambia es solo el vocabulario:
//   recurso      persona del equipo (consultora, desarrolladores)
//   trabajo      tarea de proyecto (análisis, diseño, desarrollo, QA)
//   «material»   insumo que no depende del equipo: una aprobación del cliente, unos accesos, una maqueta ya aprobada
//   compromiso   hito prometido a un cliente
// Que el modelo encaje aquí contrasta su generalidad; NO acredita demanda de mercado ni que un estudio real trabaje así.
//
// Reloj: lunes 9/11/2026 09:00 Europe/Madrid (08:00Z). Jornadas de 09:00 a 17:00, dos semanas.
// Caso: la web del cliente A se lanza el viernes; su desarrollo necesita la aprobación del diseño, que el cliente no dará hasta el jueves; después hay QA, que solo hace Pau.
// La migración del cliente C depende de unos accesos que nadie ha confirmado: no se sabe cuándo estarán.

const day = (date: number, hour: number) => `2026-11-${String(date).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
const DAYS = [9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
const ref = (provider: string, kind: string, remoteId: string): SourceRef => ({ provider, accountId: `fixture-${provider.replace('-fixture', '')}`, kind, remoteId });
const declared = (by: string) => ({ basis: 'declared' as const, by, declaredAt: '2026-11-09T07:45:00Z' });
const observed = (source: SourceRef) => ({ basis: 'observed' as const, source, observedAt: '2026-11-09T07:30:00Z', coverage: 'complete' as const });
const known = <T>(value: T, provenance: ReturnType<typeof declared> | ReturnType<typeof observed>) => ({ state: 'known' as const, value, provenance });
const lead = declared('Dirección de proyectos (ficción)');
const person = (id: string, title: string, skills: string[]) => ({
  id, title, kind: 'person', source: ref('calendar-fixture', 'calendar', id), executesJobs: true, skills,
  windows: known(DAYS.map(date => ({ start: day(date, 8), end: day(date, 16) })), observed(ref('calendar-fixture', 'calendar', id))),
});

export function servicesWeek(): OperationalModel {
  const milestone = (id: string, title: string, date: number) => ({ id, revision: sha256Hex(`services-fixture:${id}`), title, dueAt: day(date, 16) });
  const task = (id: string, title: string, commitmentId: string, skill: string, minutes: number, extra: { materials?: string[]; after?: string[] } = {}) => ({
    id, title, kind: 'task', source: ref('projects-fixture', 'task', id), commitmentId, duration: known(minutes, lead), travel: known(0, lead), skills: [skill],
    materials: extra.materials ?? [], earliestStart: null, dependencies: (extra.after ?? []).map(jobId => ({ jobId, basis: 'explicit' as const })),
  });
  return operationalModel.parse({
    format: operationalTwinFormat,
    clock: { now: day(9, 8), timeZone: 'Europe/Madrid', horizonEnd: day(23, 8) },
    rules: { staleAfterMinutes: 24 * 60 },
    resources: [person('ines', 'Inés · consultora', ['analisis', 'diseno']), person('omar', 'Omar · desarrollo', ['desarrollo']), person('pau', 'Pau · desarrollo y QA', ['desarrollo', 'qa'])],
    materials: [
      { id: 'in-aprobacion-a', title: 'Aprobación del diseño por el cliente A', source: ref('crm-fixture', 'approval', 'ap-41'), warehouseId: null, availableAt: known(day(12, 8), observed(ref('crm-fixture', 'approval', 'ap-41'))) },
      { id: 'in-maqueta-previa', title: 'Maqueta anterior ya aprobada', source: null, warehouseId: null, availableAt: known(day(9, 8), declared('Inés (ficción)')) },
      { id: 'in-accesos-c', title: 'Accesos al entorno del cliente C', source: null, warehouseId: null, availableAt: { state: 'unknown', reason: 'not-provided' } },
    ],
    commitments: [
      milestone('h-web-a', 'Lanzamiento de la web del cliente A', 13), milestone('h-informe-b', 'Informe de auditoría del cliente B', 11),
      milestone('h-migracion-c', 'Migración del cliente C', 17), milestone('h-soporte-d', 'Incidencia del cliente D resuelta', 10),
    ],
    jobs: [
      task('a-diseno', 'Diseño de la web A', 'h-web-a', 'diseno', 360),
      task('a-desarrollo', 'Desarrollo de la web A', 'h-web-a', 'desarrollo', 840, { materials: ['in-aprobacion-a'], after: ['a-diseno'] }),
      task('a-qa', 'QA de la web A', 'h-web-a', 'qa', 240, { after: ['a-desarrollo'] }),
      task('b-analisis', 'Análisis de la auditoría B', 'h-informe-b', 'analisis', 480),
      task('b-redaccion', 'Redacción del informe B', 'h-informe-b', 'analisis', 300, { after: ['b-analisis'] }),
      task('c-migracion', 'Migración de datos C', 'h-migracion-c', 'desarrollo', 600, { materials: ['in-accesos-c'] }),
      task('d-incidencia', 'Corregir incidencia D', 'h-soporte-d', 'desarrollo', 120),
    ],
    currentPlan: {
      provenance: lead,
      plan: { sequences: [
        { resourceId: 'ines', jobIds: ['b-analisis', 'b-redaccion', 'a-diseno'] },
        { resourceId: 'omar', jobIds: ['d-incidencia', 'a-desarrollo'] },
        { resourceId: 'pau', jobIds: ['c-migracion', 'a-qa'] },
      ] },
    },
  });
}

export const servicesOptions: Supposition[] = [
  { id: 'o-horas-omar', type: 'add-capacity', resourceId: 'omar', start: day(12, 16), end: day(12, 18) },
  { id: 'o-maqueta-previa', type: 'use-alternative-material', jobId: 'a-desarrollo', fromMaterialId: 'in-aprobacion-a', toMaterialId: 'in-maqueta-previa' },
  { id: 'o-mover-web', type: 'move-due', commitmentId: 'h-web-a', dueAt: day(17, 16) },
  { id: 'o-repartir-desarrollo', type: 'split-job', jobId: 'a-desarrollo', parts: [420, 420] },
];
export const servicesObjectives: Objectives = { tiers: [['h-web-a']] };
export const servicesHypotheses: Hypothesis[] = [
  { id: 'accesos-c', question: '¿Cuándo tendremos los accesos del cliente C?', target: { type: 'material-availability', materialId: 'in-accesos-c' }, values: [day(9, 8), day(12, 8)] },
  { id: 'aprobacion-a', question: '¿Cuándo aprobará el cliente A el diseño?', target: { type: 'material-availability', materialId: 'in-aprobacion-a' }, values: [day(11, 8), day(12, 8)] },
];
