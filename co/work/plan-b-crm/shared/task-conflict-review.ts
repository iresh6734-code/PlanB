import type { AppSpec, CrmRecord, Entity, Field, FieldValue } from './model.js';
import { buildPatch, sameTaskCapture, displayFieldValue, sameValue, taskTitle, validateDraft, type TaskContext } from './local-task-focus.js';

// Modelo puro del comparador de decisiones de conflicto de UNA tarea (unidad 199, preparación del paquete «guardar contra la versión revisada»).
// Compara tres cosas por campo: lo que la persona VIO al abrir (base revisada), su PROPUESTA (borrador) y lo que HAY AHORA (versión actual), y
// convierte decisiones explícitas en una propuesta validable. Sin red, sin React y sin gestor.
//
// Lo que garantiza:
//  · si la identidad de la copia (instalación, captura, generación, cuenta) o de la tarea no coincide, NO se ofrece ninguna mezcla: solo se
//    conserva y se muestra el borrador. Compartir ID o título no hace que dos tareas sean la misma;
//  · un campo cambiado por otra edición nunca se pisa sin decisión; los que chocan exigen elegir expresamente (sin valor preseleccionado);
//  · la propuesta toma la versión ACTUAL como nueva base y solo incluye lo que la persona decidió mantener; se valida con `validateDraft`;
//  · el borrador de entrada no se muta.
// Lo que NO garantiza: que la versión actual siga siendo la actual al guardar (la API antigua no compara versiones; 128/166 aportan un
// token que debe acompañar a esta misma lectura), ni que una elección humana pruebe la autoría de ningún envío anterior.

export type Choice = 'mine' | 'current';
export type FieldState =
  | 'untouched'      // nadie lo cambió
  | 'theirs-only'    // solo cambió fuera de la ficha: se adopta el valor actual
  | 'mine-only'      // solo lo cambió la persona: se puede mantener o descartar
  | 'converged'      // los dos cambiaron al MISMO valor: nada que decidir ni enviar
  | 'conflict'       // los dos cambiaron a valores distintos: hay que elegir
  | 'incompatible';  // el valor propuesto no puede aplicarse a la versión actual
export interface ConflictInput {
  entity: Entity; spec: AppSpec | null;
  /** Registro que la persona vio al abrir y el contexto con el que lo abrió. */
  base: CrmRecord; baseContext: TaskContext;
  /** Borrador completo o solo los campos cambiados: lo que falte se entiende como «sin cambio». */
  draft: Record<string, FieldValue>;
  /** Versión leída ahora (explícitamente) y su contexto. */
  current: CrmRecord; currentContext: TaskContext;
}
export interface FieldReview {
  key: string; label: string; field: Field | null; state: FieldState;
  seen: FieldValue; proposed: FieldValue; now: FieldValue;
  /** Decisiones ofrecidas. Vacío = no hay nada que decidir. */
  options: Choice[]; defaultChoice: Choice | null; reason: string;
}
export type IdentityKind = 'task' | 'entity' | 'installation' | 'capture' | 'account' | 'generation' | 'context';
export interface IdentityProblem { kind: IdentityKind; message: string; }
export interface PreservedLine { key: string; label: string; value: string; }
export interface ConflictReview {
  taskId: string; title: string;
  /** null = misma tarea y misma copia. Con problemas no hay filas con decisiones. */
  identity: IdentityProblem[];
  rows: FieldReview[];
  /** Campos que cambió la persona, con su valor tal como lo escribió: se muestran aunque no se pueda mezclar. */
  preserved: PreservedLine[];
  untouched: number;
  hasForeignChanges: boolean;
  input: ConflictInput;
}
export interface Decision { key: string; choice: Choice; origin: 'person' | 'default' | 'forced'; }
export interface Proposal {
  taskId: string;
  /** La versión actual, que pasa a ser la base del nuevo intento. El token de revisión debe ser el de ESTA lectura. */
  baseline: CrmRecord;
  /** Valores completos tras las decisiones, y solo lo que difiere de `baseline`. */
  values: Record<string, FieldValue>; patch: Record<string, FieldValue>;
  decisions: Decision[];
  /** Campos con cambio ajeno que se adoptan tal cual y campos propios que la persona decidió descartar. */
  adopted: string[]; discarded: string[];
  /** La propuesta es una decisión humana nueva; no acredita que un envío anterior fuera de esta persona. */
  provenance: 'person-decision';
}
export type ResolutionStatus = 'identity-mismatch' | 'undecided' | 'invalid' | 'noop' | 'ready';
export interface Resolution { status: ResolutionStatus; pending: string[]; issues: Record<string, string>; proposal: Proposal | null; message: string; }

const norm = (value: FieldValue | undefined): FieldValue => value === undefined || value === '' ? null : value;
// Las claves de campo las define el esquema y pueden coincidir con propiedades heredadas de Object (p. ej. `constructor`): TODA lectura por clave usa propiedad PROPIA.
const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const ownValue = (values: Record<string, FieldValue>, key: string): FieldValue => has(values, key) ? norm(values[key]) : null;
/** Choice solo si es una propiedad propia con un valor permitido; cualquier otra cosa es «sin decidir». */
export const choiceOf = (choices: Record<string, Choice | undefined>, key: string): Choice | null => has(choices, key) && (choices[key] === 'mine' || choices[key] === 'current') ? choices[key] as Choice : null;
const issueOf = (issues: Record<string, string>, key: string): string => has(issues, key) ? issues[key] : '';
/** Copia del registro con TODAS las claves del esquema como propiedades propias (null si faltan): así ni `buildPatch` ni `validateDraft` leen el prototipo. */
const complete = (entity: Entity, record: CrmRecord): CrmRecord => ({ ...record, values: Object.fromEntries(entity.fields.map(field => [field.key, ownValue(record.values, field.key)])) });
const same = sameValue;

export function compareIdentity(input: Pick<ConflictInput, 'entity' | 'base' | 'baseContext' | 'current' | 'currentContext'>): IdentityProblem[] {
  const { entity, base, baseContext: a, current, currentContext: b } = input, problems: IdentityProblem[] = [];
  if (base.entity !== 'tasks' || current.entity !== 'tasks') problems.push({ kind: 'entity', message: 'Alguna de las lecturas no es una tarea.' });
  if (entity.id !== 'tasks') problems.push({ kind: 'entity', message: 'El esquema recibido no es el de tareas.' });
  // Identidad mínima: instalación, captura y fecha de captura deben CONSTAR en ambas lecturas. Dos valores ausentes iguales no acreditan nada. Cuenta, inicio de captura y generación pueden faltar de verdad.
  for (const [name, context] of [['abriste', a], ['actual', b]] as const) {
    if (context.instanceId === null) problems.push({ kind: 'installation', message: 'No consta la instalación de la lectura ' + name + ': no se puede acreditar que sea la misma copia.' });
    if (context.snapshotId === null || context.capturedAt === null) problems.push({ kind: 'capture', message: 'No consta la captura de la lectura ' + name + ': no se puede acreditar que sea la misma copia.' });
  }
  if (base.id !== current.id) problems.push({ kind: 'task', message: 'La versión leída es de otra tarea (' + current.id + ', no ' + base.id + '). Un título o un ID parecidos no la hacen la misma.' });
  if (!sameTaskCapture(a, b)) {
    if (a.instanceId !== b.instanceId) problems.push({ kind: 'installation', message: 'La instalación cambió desde que abriste la tarea.' });
    if (a.snapshotId !== b.snapshotId || a.capturedAt !== b.capturedAt || a.captureStartedAt !== b.captureStartedAt) problems.push({ kind: 'capture', message: 'La captura cambió desde que abriste la tarea: es otra copia aunque conserve el mismo ID.' });
    if (a.accountId !== b.accountId) problems.push({ kind: 'account', message: 'La cuenta de origen cambió.' });
    if (a.generatedAt !== b.generatedAt) problems.push({ kind: 'generation', message: 'La aplicación se regeneró: el esquema puede ser distinto.' });
    if (!problems.some(problem => problem.kind !== 'task' && problem.kind !== 'entity')) problems.push({ kind: 'context', message: 'La copia cambió desde que abriste la tarea.' });
  }
  return problems;
}

/** ¿Podría aplicarse el valor propuesto a la versión actual? Devuelve el motivo si no. Reutiliza `validateDraft` (la validación del servidor). */
function whyNotApplicable(input: ConflictInput, field: Field | null, key: string, value: FieldValue): string {
  if (!field) return 'Este campo ya no existe en esta copia.';
  if (field.readOnly) return 'Este campo es de solo lectura: no se puede enviar.';
  if (!input.spec) return 'La copia no está activada: no se puede validar este valor.';
  // Solo la validez PROPIA del valor (tipo, opciones, fecha, longitud, obligatorio): las reglas ENTRE campos se evalúan sobre la combinación elegida al resolver,
  // no campo a campo contra el estado anterior (podrían rechazar un valor que la decisión conjunta vuelve válido).
  return issueOf(validateDraft({ ...input.spec, rules: [] }, complete(input.entity, input.current), { [key]: norm(value) }), key);
}

export function buildConflictReview(raw: ConflictInput): ConflictReview {
  const input: ConflictInput = structuredClone(raw), { entity, base, current } = input;
  const identity = compareIdentity(input), fields = new Map(entity.fields.map(field => [field.key, field]));
  const keys = [...entity.fields.map(field => field.key), ...Object.keys(input.draft).filter(key => !fields.has(key) && !same(ownValue(base.values, key), ownValue(input.draft, key)))];
  const rows: FieldReview[] = [], preserved: PreservedLine[] = []; let untouched = 0, foreign = false;
  for (const key of keys) {
    const field = fields.get(key) ?? null, label = field?.label ?? key;
    const seen = ownValue(base.values, key), now = ownValue(current.values, key), proposed = has(input.draft, key) ? ownValue(input.draft, key) : seen;
    const mine = !same(seen, proposed), theirs = !same(seen, now);
    if (mine) preserved.push({ key, label, value: displayFieldValue(entity, key, proposed) });
    if (theirs) foreign = true;
    const row = (state: FieldState, options: Choice[], defaultChoice: Choice | null, reason = ''): FieldReview => ({ key, label, field, state, seen, proposed, now, options, defaultChoice, reason });
    if (!mine && !theirs) { untouched++; continue; }
    if (!mine) { rows.push(row('theirs-only', [], null, 'Otra edición cambió este campo y tú no: se conserva el valor actual.')); continue; }
    if (theirs && same(proposed, now)) { rows.push(row('converged', [], null, 'Otra edición dejó este campo con el mismo valor que querías: no hay nada que enviar.')); continue; }
    const problem = whyNotApplicable(input, field, key, proposed);
    if (problem) { rows.push(row('incompatible', ['current'], 'current', problem + ' Se conserva el valor actual y tu valor queda a la vista.')); continue; }
    rows.push(theirs ? row('conflict', ['mine', 'current'], null, 'Tú y otra edición cambiasteis este campo a valores distintos: elige cuál mantener.') : row('mine-only', ['mine', 'current'], 'mine', ''));
  }
  const mismatch = identity.length > 0;
  return {
    taskId: base.id, title: taskTitle(entity, base), identity, untouched, hasForeignChanges: foreign, preserved, input,
    rows: mismatch ? [] : rows,
  };
}

export const pendingDecisions = (review: ConflictReview, choices: Record<string, Choice | undefined>) =>
  review.rows.filter(row => row.options.length > 1 && row.defaultChoice === null && !choiceOf(choices, row.key)).map(row => row.key);

/** Convierte las decisiones en una propuesta validable. No guarda nada. */
export function resolveConflictReview(review: ConflictReview, choices: Record<string, Choice | undefined>): Resolution {
  const none = (status: ResolutionStatus, message: string, extra: Partial<Resolution> = {}): Resolution => ({ status, pending: [], issues: {}, proposal: null, message, ...extra });
  if (review.identity.length) return none('identity-mismatch', 'La tarea o la copia no coinciden: no se puede combinar. Tu borrador se conserva sin cambios.');
  const pending = pendingDecisions(review, choices);
  if (pending.length) return none('undecided', 'Elige qué mantener en ' + pending.length + (pending.length === 1 ? ' campo' : ' campos') + ' antes de continuar.', { pending });
  const { entity, spec } = review.input, current = complete(entity, review.input.current), values: Record<string, FieldValue> = { ...current.values };
  const decisions: Decision[] = [], adopted: string[] = [], discarded: string[] = [];
  for (const row of review.rows) {
    if (row.state === 'theirs-only') { adopted.push(row.key); continue; }
    if (row.state === 'converged' || row.options.length === 0) continue;
    const chosen = choiceOf(choices, row.key), choice: Choice = (row.options.length === 1 ? row.options[0] : chosen ?? row.defaultChoice) as Choice;
    decisions.push({ key: row.key, choice, origin: row.options.length === 1 ? 'forced' : chosen ? 'person' : 'default' });
    if (choice === 'mine') values[row.key] = row.proposed; else discarded.push(row.key);
  }
  const patch = buildPatch(entity, current, values);
  const proposal: Proposal = { taskId: review.taskId, baseline: structuredClone(current), values, patch, decisions, adopted, discarded, provenance: 'person-decision' };
  if (!Object.keys(patch).length) return none('noop', 'Con estas decisiones no queda nada que guardar: la tarea ya tiene esos valores. No se enviará nada.', { proposal });
  // Solo cuentan las incidencias NUEVAS que provoca la propuesta (también las cruzadas, como una regla condicional): las que ya tenía la versión actual no son culpa de las decisiones.
  const existing = spec ? validateDraft(spec, current, {}) : {}, found = spec ? validateDraft(spec, current, patch) : { _: 'La copia no está activada: no se puede validar.' };
  const issues = Object.fromEntries(Object.entries(found).filter(([key, message]) => issueOf(existing, key) !== message));
  if (Object.keys(issues).length) return none('invalid', 'Revisa los campos señalados: el servidor los rechazaría.', { issues, proposal });
  return none('ready', 'Todo decidido. Se preparará un guardado nuevo con la versión actual como base.', { proposal });
}
