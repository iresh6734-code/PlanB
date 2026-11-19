import { z } from 'zod';
import { commitmentRevision } from './commitments.js';

// ── Formulario mínimo y utilidades horarias (sin dependencias del motor: lo importa el navegador) ──
export const dateCheckSkills = [
  { id: 'vrf', label: 'Sistemas VRF (habilitación)' },
  { id: 'clima', label: 'Climatización' },
  { id: 'electrica', label: 'Electricidad' },
  { id: 'solar', label: 'Solar' },
] as const;
export const dateCheckMaterials = [
  { key: 'almacen-sur/sku-vrf-12k', sku: 'sku-vrf-12k', warehouseId: 'almacen-sur', label: 'Unidad interior VRF 12 kBTU · Almacén Sur' },
  { key: 'almacen-sur/sku-vrf-14k', sku: 'sku-vrf-14k', warehouseId: 'almacen-sur', label: 'Unidad interior VRF 14 kBTU · Almacén Sur' },
  { key: 'almacen-norte/sku-vrf-12k-b', sku: 'sku-vrf-12k-b', warehouseId: 'almacen-norte', label: 'Unidad interior VRF 12 kBTU modelo B · Almacén Norte' },
] as const;
export const dateCheckForm = z.object({
  title: z.string().trim().min(1).max(120),
  requestedAt: z.iso.datetime(),
  // null = sin estimar todavía (por ejemplo, pendiente de visita técnica). No vale cero.
  durationMinutes: z.number().int().min(30).max(3000).nullable(),
  skill: z.enum(dateCheckSkills.map(item => item.id) as [string, ...string[]]),
  materialKey: z.enum(['none', ...dateCheckMaterials.map(item => item.key)] as [string, ...string[]]),
  quantity: z.number().int().min(0).max(40),
}).strict();
export type DateCheckForm = z.infer<typeof dateCheckForm>;

function madridOffsetMinutes(utcMs: number) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' }).formatToParts(new Date(utcMs)).find(part => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
}
// Fecha y hora de Madrid ↔ instante UTC. El caso está entero en horario de invierno, pero no se supone.
export function madridLocalToIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess - madridOffsetMinutes(guess) * 60_000).toISOString();
}
export function isoToMadridLocal(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export const madridDayAt = (iso: string, hour: number) => madridLocalToIso(isoToMadridLocal(iso).date, `${String(hour).padStart(2, '0')}:00`);

// CONTRATO HTTP PROPUESTO de «Comprobar una fecha» (unidad CLAUDE-OPUS-DATE-CHECK-FLOW). planb-date-check-api-v1. Solo ficción y solo con copia de ensayo activa.
// Cada petición lleva el pin de la copia (`contextRevision`). Comparar y reabrir NO escriben. Guardar una comprobación escribe un registro local identificado. Confirmar
// escribe UN siguiente paso local, ligado a la revisión exacta que se comparó y a una clave de operación. Ninguna ruta llama a un proveedor.

export const dateCheckApiPath = '/api/v7/date-check';
export const dateCheckErrorCodes = [
  'DATE_CHECK_CONTEXT_CHANGED', 'DATE_CHECK_INVALID', 'DATE_CHECK_NOT_FOUND', 'DATE_CHECK_STALE', 'DATE_CHECK_ID_REUSED', 'DATE_CHECK_ALREADY_DECIDED',
  'DATE_CHECK_OPERATION_REUSED', 'DATE_CHECK_NOT_CONFIRMABLE', 'DATE_CHECK_STORAGE', 'DATE_CHECK_CANCELLED',
] as const;

const pin = commitmentRevision;
const text = z.string().trim().min(1).max(400);
const short = z.string().trim().min(1).max(160);
const at = z.iso.datetime();
const revision = z.string().regex(/^[a-f0-9]{64}$/);

const evidence = z.object({
  label: short, value: z.string().max(200),
  basis: z.enum(['observed', 'declared', 'assumed', 'unknown']),
  source: z.string().max(240).nullable(), observedAt: at.nullable(), coverage: z.enum(['complete', 'partial']).nullable(), stale: z.boolean(),
}).strict();
export type DateCheckEvidence = z.infer<typeof evidence>;

const outcome = z.enum(['meets', 'misses', 'unknown']);
const classification = z.enum(['verified', 'conditioned', 'conflict', 'incomplete']);
const projection = z.enum(['on-time', 'late', 'not-completed', 'indeterminate']);

const blocker = z.discriminatedUnion('code', [
  z.object({ code: z.literal('material'), label: short, quantity: z.number().int(), neededBy: at, availableAt: at.nullable(), enabledBy: short.nullable(), shortAtNeed: z.number().int(), pending: z.array(short).max(8) }).strict(),
  z.object({ code: z.literal('staffing'), resources: z.array(short).max(8), windowStart: at, neededMinutes: z.number().int(), freeMinutes: z.number().int(), occupiedBy: z.array(z.object({ title: short, protected: z.boolean(), minutes: z.number().int() }).strict()).max(16) }).strict(),
  z.object({ code: z.literal('protection'), title: short, protectedAt: at, projectedAt: at.nullable(), projection }).strict(),
  z.object({ code: z.literal('horizon'), horizonEnd: at }).strict(),
]);
const condition = z.object({ code: z.string().max(40), label: text }).strict();

const affected = z.object({
  commitmentId: short, title: short, protected: z.boolean(),
  before: z.object({ projection, completionAt: at.nullable() }).strict(),
  after: z.object({ projection, completionAt: at.nullable() }).strict(),
  effect: z.enum(['improves', 'worsens', 'later', 'earlier', 'same', 'unknown']), deltaMinutes: z.number().int().nullable(),
  reassigned: z.array(z.object({ job: short, from: short.nullable(), to: short.nullable() }).strict()).max(8),
  evidence: z.array(evidence).max(24),
}).strict();

export const dateCheckAlternative = z.object({
  id: short, label: text, offerIds: z.array(short).max(4), offers: z.array(z.object({ id: short, label: short, type: short }).strict()).max(4),
  rank: z.number().int().nullable(), available: z.boolean(),
  requested: z.object({ outcome, classification }).strict(),
  supported: z.object({ at: at.nullable(), basis: z.enum(['evidence', 'conditioned', 'none']), proven: z.boolean() }).strict(),
  material: z.object({ ok: z.boolean(), state: short.nullable(), availableAt: at.nullable(), enabledBy: short.nullable(), evidence: z.array(evidence).max(24) }).strict(),
  staffing: z.object({ ok: z.boolean().nullable(), completionIfMaterial: at.nullable() }).strict(),
  candidate: z.object({ resource: short.nullable(), startAt: at.nullable(), finishAt: at.nullable() }).strict(),
  blockers: z.array(blocker).max(12), conditions: z.array(condition).max(16),
  protections: z.array(z.object({ title: short, protectedAt: at, basis: z.enum(['due', 'projected']), kept: z.boolean().nullable() }).strict()).max(32),
  affected: z.array(affected).max(32),
  reservations: z.array(z.object({ title: short, quantity: z.number().int(), shortUntil: at.nullable(), state: short }).strict()).max(8),
  extraMinutes: z.number().int(),
}).strict();
export type DateCheckAlternativeView = z.infer<typeof dateCheckAlternative>;

const checkFirst = z.object({ kind: short, label: text, neededBy: at.nullable(), maxMinutes: z.number().int().nullable(), dependents: z.number().int() }).strict();

export const dateCheckView = z.object({
  format: z.literal('planb-date-check-view-v1'), mode: z.literal('fiction'), contextRevision: pin,
  inputRevision: revision, demoRevision: z.number().int(), evaluatedAt: at, engineVersion: short,
  request: z.object({
    title: short, requestedAt: at, windowStart: at, durationMinutes: z.number().int().nullable(), travelMinutes: z.number().int(), skill: short,
    material: z.object({ label: short, quantity: z.number().int() }).strict().nullable(),
  }).strict(),
  slice: z.object({ movable: z.number().int(), frozen: z.number().int(), frozenBefore: at, resources: z.array(short).max(16) }).strict(),
  alternatives: z.array(dateCheckAlternative).max(16),
  best: short.nullable(), keepId: short,
  scenarios: z.array(z.object({ id: short, label: short, cells: z.array(z.object({ alternativeId: short, outcome: z.enum(['meets', 'misses', 'unknown', 'not-available']), protectionsKept: z.boolean().nullable() }).strict()).max(16) }).strict()).max(4),
  checkFirst: z.array(checkFirst).max(8),
  search: z.object({ complete: z.boolean(), runs: z.number().int() }).strict(),
}).strict();
export type DateCheckView = z.infer<typeof dateCheckView>;

export const dateCheckCatalog = z.object({
  format: z.literal('planb-date-check-catalog-v1'), mode: z.literal('fiction'), contextRevision: pin,
  demo: z.object({ revision: z.number().int(), slotWithdrawn: z.boolean(), changedAt: at.nullable() }).strict(),
  week: z.object({ start: at, end: at, now: at }).strict(),
  defaults: dateCheckForm,
  skills: z.array(z.object({ id: short, label: short }).strict()).max(8),
  materials: z.array(z.object({ key: short, label: short }).strict()).max(8),
}).strict();
export type DateCheckCatalog = z.infer<typeof dateCheckCatalog>;

const decision = z.object({
  operationId: z.uuid(), alternativeId: short, alternativeLabel: text, inputRevision: revision,
  owner: short, nextStep: text, dueAt: at, confirmedAt: at,
  promised: z.object({ requestedAt: at, outcome, supportedAt: at.nullable(), conditions: z.array(text).max(8) }).strict(),
}).strict();
export type DateCheckDecision = z.infer<typeof decision>;

export const dateCheckRecordView = z.object({
  format: z.literal('planb-date-check-record-v1'), mode: z.literal('fiction'), contextRevision: pin,
  id: z.uuid(), createdAt: at, form: dateCheckForm,
  // current: la revisión guardada coincide con la vigente. historical: la cartera, las reservas o los cambios declarados cambiaron; lo comparado sigue legible.
  state: z.enum(['current', 'historical']), currentInputRevision: revision,
  view: dateCheckView, decision: decision.nullable(),
}).strict();
export type DateCheckRecordView = z.infer<typeof dateCheckRecordView>;

export const dateCheckList = z.object({
  format: z.literal('planb-date-check-list-v1'), contextRevision: pin,
  items: z.array(z.object({ id: z.uuid(), title: short, createdAt: at, requestedAt: at, state: z.enum(['current', 'historical']), decided: z.boolean() }).strict()).max(30),
}).strict();

export const dateCheckAnalyzeRequest = z.object({ contextRevision: pin, form: dateCheckForm }).strict();
export const dateCheckSaveRequest = z.object({ contextRevision: pin, id: z.uuid(), form: dateCheckForm, inputRevision: revision }).strict();
export const dateCheckConfirmRequest = z.object({
  contextRevision: pin, inputRevision: revision, alternativeId: short, operationId: z.uuid(),
  owner: short, nextStep: text, dueAt: at,
}).strict();
export const dateCheckRevisionRequest = z.object({ contextRevision: pin, change: z.enum(['withdraw-slot', 'restore-slot']) }).strict();
