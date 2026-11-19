import type { ContinuityEvidenceApiResponse } from './continuity-evidence-api.js';
import type { ReadCheckApiState } from './hubspot-read-check-api.js';
import { sha256Hex } from './sha256.js';

// PASAPORTE DE CONTINUIDAD (unidad 214). Modelo puro: transforma ENTRADAS EXPLÍCITAS en una hoja corta de afirmaciones trazables.
// No lee la red, no captura, no envía y no exporta por sí solo. Cada afirmación lleva su base, su alcance, su origen y su instante:
//   observed        → este sistema lo LEYÓ o lo vio responder en ese instante (una lectura, una respuesta del proveedor, una comprobación local).
//   declared        → consta en un registro guardado que alguien declaró (custodia, informe de éxito): no se ha verificado el hecho.
//   unverified      → no hay evidencia (no se pidió, no se pudo leer o falta): es «desconocido», NUNCA cero ni «bien».
//   not-applicable  → no corresponde (p. ej. no hay credencial de HubSpot guardada).
// Principios: «desconocido» no es «cero»; una lectura comprobada no es una copia actualizada; cifrar no prueba autoría; un ensayo en el mismo equipo no prueba otro equipo;
// una evidencia caducada conserva su fecha y alcance pero ya no acredita nada vigente.
export const PASSPORT_FORMAT = 'planb-continuity-passport-v1';
export type Basis = 'observed' | 'declared' | 'unverified' | 'not-applicable';
export type Currency = 'current' | 'expired' | 'unknown' | 'not-applicable';
export type SectionKey = 'copy' | 'read' | 'work' | 'rehearsal' | 'unproven';
export type PassportAction = 'open-preparation' | 'open-integrations' | 'open-today' | 'open-export' | 'start-rehearsal' | 'open-continuity';

export interface SourceInput<T> {
  /** `read`: se pudo leer; `unavailable`: se intentó y falló; `not-provided`: nadie lo ha pedido todavía (el consumidor no está conectado). */
  status: 'read' | 'unavailable' | 'not-provided';
  /** Instante (ISO) de la lectura que produjo el valor. */
  at: string | null;
  value: T | null;
}
/** Resumen mínimo de trabajo local pendiente por contexto. Un recuento ausente (`null`) es DESCONOCIDO, no cero. Sin IDs de tarea, valores ni borradores. */
export interface PassportWorkSummary {
  status: 'read' | 'unavailable';
  at: string;
  /** Cobertura declarada por el lector. Ausente en productores anteriores: no se deduce a partir de recuentos nulos. */
  coverage?: 'complete' | 'partial' | 'none';
  counts: { drafts: number; unknownOutcome: number; settled: number; otherContext: number; unreadable: number } | null;
}
/** Resultado de un ensayo de relevo (Kit 116): alcance real = mismo equipo, ficción, destino nuevo. Nada de esto prueba otro ordenador, RTO/RPO ni autoría. */
export interface RelayRehearsalRecord {
  rehearsedAt: string;
  /** Captura con la que se ensayó (la del contexto en el que se hizo). Un ensayo con ficción no tiene captura de la copia activa: `null`. */
  captureId: string | null;
  /** Procedencia del ensayo. `fiction`: recorrido practicado con datos ficticios (Kit): acredita que el procedimiento se puede hacer, NO que la copia activa se recupere. Ausente = alcance desconocido (no se deduce de ningún texto). */
  scope?: 'fiction';
  outcome: 'completed' | 'failed' | 'interrupted';
  destinationOpened: boolean; wrongIdRejected: boolean; reconciledOnce: boolean;
  /** Qué viajó en la cápsula y qué se retiró (no se hereda), en palabras de la unidad del Kit. */
  included: string[]; notInherited: string[];
}
export interface PassportInputs {
  now: number;
  installId: string | null;
  copy: SourceInput<ContinuityEvidenceApiResponse>;
  hubspot: SourceInput<ReadCheckApiState>;
  work: SourceInput<PassportWorkSummary>;
  relay: SourceInput<RelayRehearsalRecord>;
}

export interface Claim {
  id: string; text: string; basis: Basis; currency: Currency;
  /** A qué se refiere y a qué no (alcance). */
  scope: string;
  /** Instante de la observación o declaración, si existe. */
  at: string | null;
  source: 'continuity-evidence' | 'hubspot-read-check' | 'work-journal' | 'relay-rehearsal' | 'derived';
  /** Contexto al que pertenece (captura/portal), para no mezclar fuentes de copias distintas. */
  context: string | null;
}
export interface Section { key: SectionKey; question: string; claims: Claim[] }
export interface NextStep { action: PassportAction; label: string; reason: string }
export interface ProvenanceRow { source: Claim['source']; status: SourceInput<unknown>['status']; at: string | null; context: string | null }
export interface Passport {
  format: typeof PASSPORT_FORMAT; generatedAt: string;
  identity: { installId: string | null; copy: { captureId: string | null; capturedAt: string | null; testData: boolean | null }; contexts: string[] };
  /** Hay observaciones de más de una copia/captura: se muestran por separado y no se suman. */
  mixedContexts: boolean;
  sections: Section[]; nextStep: NextStep | null; provenance: ProvenanceRow[];
}

const QUESTIONS: Record<SectionKey, string> = {
  copy: '¿De qué copia dispongo?', read: '¿Qué lectura del CRM se comprobó y cuándo?', work: '¿Qué trabajo local queda pendiente?',
  rehearsal: '¿Qué se ensayó al exportar y recuperar?', unproven: '¿Qué no se ha demostrado?',
};
const ENTITY_NAMES: Record<string, string> = { contacts: 'clientes', companies: 'empresas', deals: 'oportunidades', tasks: 'tareas' };
const MADRID = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
/** Fecha legible en hora de Madrid; si no es un instante válido se devuelve tal cual (nunca se inventa). */
export const when = (iso: string | null): string => { if (!iso) return 'sin fecha'; const t = Date.parse(iso); return Number.isFinite(t) ? MADRID.format(new Date(t)) + ' (Madrid)' : 'fecha no válida'; };
/** Etiqueta corta y estable de un identificador largo (para mostrar y exportar sin claves completas). */
export const shortId = (id: string | null): string | null => id === null ? null : id.replace(/^(capture|source):/, '').slice(0, 8) || null;
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
/** Etiqueta corta de un contexto (captura/portal) para mostrar y exportar; la clave completa no sale del modelo. */
export const contextLabel = (context: string | null): string | null => context === null ? null : context.startsWith('capture:') ? 'capture:' + shortId(context) : context;
/** Texto que llega de fuera (listas del Kit…): una sola línea, acotado y SIN rutas del equipo ni cadenas que parezcan claves. Nunca se exporta tal cual. */
export const safeText = (text: unknown, max = 160): string => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
    .replace(/[A-Za-z]:[\\/][^\s;,)]*/g, '[ruta omitida]').replace(/(?:^|\s)(?:\/(?:Users|home|var|etc|tmp)\/)[^\s;,)]*/g, ' [ruta omitida]').replace(/[A-Za-z0-9_\-+/=]{32,}/g, '[omitido]');
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
};
const stamp = (at: string | null) => at === null || !Number.isFinite(Date.parse(at)) ? null : at;
/** Vigencia EFECTIVA de la lectura de HubSpot al instante `now`: se deriva de las fechas de la observación y del reloj, NO del booleano `view.fresh` calculado cuando se recibió la respuesta.
 *  Reloj o ventana no válidos = desconocida (nunca «vigente»). Una caducidad ya observada no se revierte. «checking» (hay una comprobación en curso) es un estado aparte: no es caducidad. */
export function readWindow(hs: ReadCheckApiState, now: number): { checking: boolean; currency: 'current' | 'expired' | 'unknown' | null } {
  const checking = hs.running !== null || hs.view.state === 'checking', ev = hs.evidence;
  if (!ev) return { checking, currency: null };
  const until = Date.parse(ev.freshUntil), checked = Date.parse(ev.checkedAt);
  if (!Number.isFinite(now) || !Number.isFinite(until) || !Number.isFinite(checked) || until < checked) return { checking, currency: 'unknown' };
  if (now > until) return { checking, currency: 'expired' };
  if (!hs.view.fresh && !checking) return { checking, currency: 'expired' };
  return { checking, currency: 'current' };
}

export function buildPassport(input: PassportInputs): Passport {
  const claims: Record<SectionKey, Claim[]> = { copy: [], read: [], work: [], rehearsal: [], unproven: [] };
  const add = (section: SectionKey, claim: Omit<Claim, 'id'>) => { claims[section].push({ id: section + '-' + (claims[section].length + 1), ...claim }); };
  const nowIso = Number.isFinite(input.now) ? new Date(input.now).toISOString() : null;
  const copy = input.copy.value, copyOk = input.copy.status === 'read' && !!copy && copy.available;
  const copyCtx = copyOk ? copy!.context!.captureId : null;
  const contexts = new Set<string>(); if (copyCtx) contexts.add(copyCtx);

  // ── 1 · Copia ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (input.copy.status === 'not-provided') add('copy', { text: 'Todavía no se ha pedido la evidencia de la copia local.', basis: 'unverified', currency: 'unknown', scope: 'copia activa', at: null, source: 'continuity-evidence', context: null });
  else if (input.copy.status === 'unavailable' || !copy) add('copy', { text: 'No se pudo leer la evidencia de la copia local.', basis: 'unverified', currency: 'unknown', scope: 'copia activa', at: stamp(input.copy.at), source: 'continuity-evidence', context: null });
  else if (!copy.available) add('copy', { text: 'No hay una copia activa que acreditar: ' + copy.error, basis: 'unverified', currency: 'unknown', scope: 'copia activa', at: stamp(input.copy.at), source: 'continuity-evidence', context: null });
  else {
    const f = copy.facts, ctx = copy.context.captureId, w = f.workload;
    add('copy', { text: 'Copia local capturada el ' + when(f.snapshot.capturedAt) + ' (' + (f.snapshot.isTestData ? 'datos de ensayo' : 'datos de tu copia') + ').', basis: 'observed', currency: 'current', scope: 'copia activa de esta instalación', at: stamp(f.snapshot.capturedAt), source: 'continuity-evidence', context: ctx });
    add('copy', { text: 'Estructura, conciliación e historial comprobados en este equipo el ' + when(f.snapshot.locallyCheckedAt) + '. No consulta el estado actual del CRM.', basis: 'observed', currency: 'current', scope: 'integridad de la copia local', at: stamp(f.snapshot.locallyCheckedAt), source: 'continuity-evidence', context: ctx });
    add('copy', { text: w.total === 0 ? 'La copia no contiene tareas.' : plural(w.total, 'tarea', 'tareas') + ' en la copia: ' + w.completed + ' completadas, ' + w.knownOpen + ' abiertas conocidas' + (w.unknownStatus ? ', ' + w.unknownStatus + ' con estado que no se reconoce' : '') + (w.invalidDates + w.missingDates ? ', ' + (w.invalidDates + w.missingDates) + ' sin fecha utilizable' : '') + '.',
      basis: 'observed', currency: 'current', scope: 'tareas de la copia activa', at: stamp(f.snapshot.locallyCheckedAt), source: 'continuity-evidence', context: ctx });
    if (copy.evaluation.exposure) { const e = copy.evaluation.exposure; add('copy', { text: 'Con la copia actual: ' + e.overdueTasks + ' vencidas, ' + e.tasksDueDuringOutage + ' con vencimiento durante una caída de ' + Math.round(copy.parameters.outageMinutes / 60) + ' h y ' + e.tasksWithoutDate + ' sin fecha.', basis: 'observed', currency: 'current', scope: 'estimación sobre la copia, no sobre el CRM', at: stamp(f.snapshot.locallyCheckedAt), source: 'continuity-evidence', context: ctx }); }
  }

  // ── 2 · Lectura del CRM ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const hs = input.hubspot.value;
  if (input.hubspot.status === 'not-provided') add('read', { text: 'Todavía no se ha consultado el estado de la lectura de HubSpot.', basis: 'unverified', currency: 'unknown', scope: 'lectura de HubSpot', at: null, source: 'hubspot-read-check', context: null });
  else if (input.hubspot.status === 'unavailable' || !hs) add('read', { text: 'No se pudo consultar el estado de la lectura de HubSpot.', basis: 'unverified', currency: 'unknown', scope: 'lectura de HubSpot', at: stamp(input.hubspot.at), source: 'hubspot-read-check', context: null });
  else if (!hs.configured) add('read', { text: 'No hay una credencial de HubSpot guardada: no hay lectura que comprobar.', basis: 'not-applicable', currency: 'not-applicable', scope: 'lectura de HubSpot', at: stamp(input.hubspot.at), source: 'hubspot-read-check', context: null });
  else {
    const ctx = 'portal:' + hs.portal!.id; contexts.add(ctx); const portal = hs.portal!.id, ev = hs.evidence, env = hs.portal!.mode === 'production' ? 'cuenta real' : 'cuenta de ensayo';
    if (!ev) add('read', { text: 'La lectura no se ha comprobado' + (hs.invalidated ? ' con esta configuración: la comprobación del ' + when(hs.invalidated.checkedAt) + ' era de otra y no la acredita' : '') + '.', basis: 'unverified', currency: 'unknown', scope: 'portal ' + portal, at: stamp(hs.invalidated ? hs.invalidated.checkedAt : null), source: 'hubspot-read-check', context: ctx });
    else {
      const readable = ev.objects.filter(o => o.outcome === 'readable').map(o => ENTITY_NAMES[o.entity] ?? o.entity), others = ev.objects.filter(o => o.outcome !== 'readable');
      const verdict = ev.state === 'read_verified' ? 'Lectura comprobada de ' + readable.join(', ') + ' (un elemento de cada objeto).'
        : ev.state === 'partial' ? 'Lectura parcial: se pudo leer ' + (readable.join(', ') || 'ningún objeto') + '; no se pudo leer ' + others.map(o => ENTITY_NAMES[o.entity] ?? o.entity).join(', ') + '.'
        : ev.state === 'rejected' ? 'HubSpot no aceptó la credencial.' : ev.state === 'insufficient_permissions' ? 'La credencial no tiene permiso de lectura.'
        : ev.state === 'identity_mismatch' ? 'La credencial pertenece a otro portal.' : ev.state === 'account_type_mismatch' ? 'El tipo de cuenta no coincide con el modo configurado.' : 'HubSpot no respondió de forma utilizable.';
      const win = readWindow(hs, input.now), currency = win.currency ?? 'unknown';
      add('read', { text: verdict + ' Comprobado el ' + when(ev.checkedAt) + (ev.environment === 'rehearsal' ? ' en una cuenta de ensayo' : ev.environment === 'real' ? ' en una cuenta real' : '') + '.' + (currency === 'current' ? '' : currency === 'expired' ? ' Esta comprobación caducó: ya no acredita el acceso actual.' : ' No se puede determinar si sigue vigente (reloj o ventana de vigencia no válidos): no acredita el acceso actual.'),
        basis: ev.state === 'unavailable' && ev.accountType === null ? 'unverified' : 'observed', currency, scope: 'portal ' + portal + ' · solo lectura · ' + ev.requests + ' peticiones', at: stamp(ev.checkedAt), source: 'hubspot-read-check', context: ctx });
    }
    if (readWindow(hs, input.now).checking) add('read', { text: 'Había una comprobación en curso' + (hs.running ? ' desde el ' + when(hs.running.since) : '') + ' cuando se leyó el estado: su resultado todavía no consta. No es una caducidad.', basis: 'observed', currency: 'unknown', scope: 'comprobación en curso · solo lectura', at: stamp(hs.running ? hs.running.since : input.hubspot.at), source: 'hubspot-read-check', context: ctx });
    add('read', { text: 'Hay una credencial guardada para el portal ' + portal + ' (' + env + '). Que esté guardada no prueba que dé acceso hoy.', basis: 'declared', currency: 'not-applicable', scope: 'configuración guardada', at: stamp(input.hubspot.at), source: 'hubspot-read-check', context: ctx });
    add('read', { text: 'Una lectura comprobada no significa que la copia esté al día.', basis: 'not-applicable', currency: 'not-applicable', scope: 'aclaración', at: null, source: 'derived', context: null });
  }

  // ── 3 · Trabajo local pendiente ───────────────────────────────────────────────────────────────────────────────────────────────────
  const wk = input.work.value;
  if (input.work.status === 'not-provided' || (input.work.status === 'read' && !wk)) add('work', { text: 'El seguimiento del trabajo local pendiente todavía no está disponible: no se puede decir cuánto hay.', basis: 'unverified', currency: 'unknown', scope: 'trabajo local (cuaderno de intenciones)', at: null, source: 'work-journal', context: null });
  else if (input.work.status === 'read' && wk?.status === 'read' && wk.coverage === 'none') add('work', { text: 'El cuaderno no cubre esta copia: se desconoce cuánto trabajo local hay pendiente (no es cero).', basis: 'unverified', currency: 'unknown', scope: 'trabajo local (cuaderno de intenciones)', at: stamp(wk.at), source: 'work-journal', context: copyCtx });
  else if (input.work.status === 'unavailable' || !wk || wk.status === 'unavailable' || !wk.counts) add('work', { text: 'No se pudo leer el cuaderno de trabajo local: se desconoce cuánto hay pendiente (no es cero).', basis: 'unverified', currency: 'unknown', scope: 'trabajo local (cuaderno de intenciones)', at: stamp(input.work.at) ?? stamp(wk?.at ?? null), source: 'work-journal', context: null });
  else {
    const c = wk.counts, at = stamp(wk.at), line = (_id: string, n: number, one: string, many: string, none: string) => add('work', { text: n === 0 ? none : plural(n, one, many), basis: 'observed', currency: 'current', scope: 'contexto actual · solo recuento (sin tareas ni valores)', at, source: 'work-journal', context: copyCtx });
    line('u', c.unknownOutcome, 'guardado por comprobar: salió y no se sabe si se aplicó', 'guardados por comprobar: salieron y no se sabe si se aplicaron', 'Ningún guardado por comprobar en el momento de la lectura.');
    line('d', c.drafts, 'borrador recuperable sin enviar', 'borradores recuperables sin enviar', 'Ningún borrador recuperable en el momento de la lectura.');
    line('s', c.settled, 'intento ya resuelto', 'intentos ya resueltos', 'Ningún intento resuelto registrado.');
    if (c.otherContext) line('o', c.otherContext, 'intento de otra copia (no se mezcla con esta)', 'intentos de otra copia (no se mezclan con esta)', '');
    if (c.unreadable) line('x', c.unreadable, 'entrada ilegible o en cuarentena', 'entradas ilegibles o en cuarentena', '');
  }

  // ── 4 · Exportar y recuperar ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const relay = input.relay.value;
  if (input.relay.status === 'not-provided' || (input.relay.status === 'read' && !relay)) add('rehearsal', { text: 'No se ha ensayado un relevo desde aquí.', basis: 'unverified', currency: 'unknown', scope: 'relevo con cápsula', at: null, source: 'relay-rehearsal', context: null });
  else if (input.relay.status === 'unavailable' || !relay) add('rehearsal', { text: 'No se pudo leer el resultado del último ensayo de relevo.', basis: 'unverified', currency: 'unknown', scope: 'relevo con cápsula', at: stamp(input.relay.at), source: 'relay-rehearsal', context: null });
  else {
    const other = relay.captureId !== null && copyCtx !== null && relay.captureId !== copyCtx; if (relay.captureId) contexts.add(relay.captureId);
    // Tres casos distintos: mismo contexto (acredita), OTRO contexto (caducado para esta copia) y contexto DESCONOCIDO (sin captura identificada: no se puede ligar a esta copia).
    const fiction = relay.scope === 'fiction', unknownCtx = relay.captureId === null && !fiction, rc: Currency = other ? 'expired' : unknownCtx ? 'unknown' : 'current';
    add('rehearsal', { text: 'Ensayo de relevo del ' + when(relay.rehearsedAt) + ' (' + (relay.outcome === 'completed' ? 'completado' : relay.outcome === 'failed' ? 'falló' : 'interrumpido') + '): ' + (relay.destinationOpened ? 'el destino nuevo se abrió' : 'el destino nuevo no llegó a abrirse') + (relay.wrongIdRejected ? ', un ID equivocado se rechazó' : '') + (relay.reconciledOnce ? ' y se concilió una sola operación sin duplicar.' : '.') + (other ? ' Se ensayó con OTRA captura: no acredita la copia actual.' : unknownCtx ? ' No identifica con qué copia se ensayó: no acredita la copia actual.' : fiction ? ' Se practicó con datos ficticios: demuestra que el recorrido funciona, pero no acredita la copia actual ni que tu copia activa se recupere.' : ''),
      basis: 'observed', currency: rc, scope: 'mismo equipo · datos ficticios · destino nuevo', at: stamp(relay.rehearsedAt), source: 'relay-rehearsal', context: relay.captureId });
    if (relay.included.length) add('rehearsal', { text: 'Viajó en la cápsula: ' + relay.included.slice(0, 12).map(item => safeText(item)).join('; ') + '.', basis: 'observed', currency: rc, scope: 'contenido ensayado', at: stamp(relay.rehearsedAt), source: 'relay-rehearsal', context: relay.captureId });
    if (relay.notInherited.length) add('rehearsal', { text: 'No se hereda: ' + relay.notInherited.slice(0, 12).map(item => safeText(item)).join('; ') + '.', basis: 'observed', currency: rc, scope: 'contenido ensayado', at: stamp(relay.rehearsedAt), source: 'relay-rehearsal', context: relay.captureId });
  }

  if (copyOk) {
    const f = copy!.facts, ctx = copy!.context!.captureId;
    if (!f.export.present) add('rehearsal', { text: 'No hay un registro de exportación de esta copia.', basis: 'unverified', currency: 'unknown', scope: 'exportación', at: null, source: 'continuity-evidence', context: ctx });
    else add('rehearsal', { text: 'Hay un registro de exportación' + (f.export.matchesActiveRevision === true ? ' que coincide con la revisión activa' : f.export.matchesActiveRevision === false ? ' que NO coincide con la revisión activa' : '') + (f.export.custodyDeclared ? '; la custodia consta como declarada.' : '.') + ' No se han examinado los bytes del fichero.', basis: 'declared', currency: 'unknown', scope: 'registro de exportación (no el fichero)', at: null, source: 'continuity-evidence', context: ctx });
    const t = f.technicalReports;
    add('rehearsal', { text: t.stored === 0 ? 'No hay informes técnicos de recuperación guardados.' : plural(t.declaredPassed, 'informe técnico declara éxito', 'informes técnicos declaran éxito') + ' de ' + t.stored + ' guardados' + (t.invalid ? ' (' + t.invalid + ' no válidos)' : '') + '. Su duración no mide el tiempo de recuperación.', basis: t.stored === 0 ? 'unverified' : 'declared', currency: 'unknown', scope: 'informes técnicos ligados solo al identificador de captura', at: stamp(t.latestCompletedAt), source: 'continuity-evidence', context: ctx });
  } else add('rehearsal', { text: 'Sin la evidencia de la copia no se puede decir qué se exportó ni qué se ensayó.', basis: 'unverified', currency: 'unknown', scope: 'exportación y recuperación', at: null, source: 'continuity-evidence', context: null });

  // ── 5 · Lo que NO se ha demostrado (derivado; siempre presente) ───────────────────────────────────────────────────────────────────
  const unproven = (text: string, scope: string) => add('unproven', { text, basis: 'unverified', currency: 'not-applicable', scope, at: null, source: 'derived', context: null });
  unproven('Que la copia pueda recuperarse en OTRO ordenador: el ensayo del mismo equipo no lo demuestra.', 'otro equipo');
  unproven('Cuánto tarda recuperar el trabajo hasta poder seguir (tiempo de recuperación): ningún informe lo mide.', 'tiempo de recuperación');
  if (copyOk) unproven('Que ESTA copia activa se recupere completa en un destino nuevo: un ensayo con datos ficticios practica el recorrido, no verifica tu copia.', 'recuperación de la copia activa');
  unproven('Quién creó una copia o una cápsula: un hash o el cifrado no prueban autoría.', 'autoría');
  if (hs && hs.configured && hs.evidence && hs.portal!.mode === 'rehearsal') unproven('El acceso a una cuenta REAL de HubSpot: lo comprobado fue una cuenta de ensayo.', 'cuenta real');
  if (!hs || !hs.configured || !hs.evidence || readWindow(hs, input.now).currency !== 'current') unproven('Que HubSpot siga permitiendo leer: no hay una comprobación vigente.', 'lectura de HubSpot');
  if (input.work.status === 'read' && wk?.counts && wk.counts.unknownOutcome > 0) unproven('Que los guardados por comprobar viajen en una cápsula: el seguimiento en memoria no se incluye en ella.', 'relevo');

  // ── Próximo paso: la primera carencia que tenga una acción disponible ─────────────────────────────────────────────────────────────
  // «Ensayar un relevo con datos ficticios» se resuelve con un ensayo FICTICIO completado (procedencia explícita) o con uno completado de la captura exacta de esta copia. Un ensayo de alcance desconocido o de otra captura no la cierra.
  const relayValue = input.relay.status === 'read' ? input.relay.value : null, relayCompleted = !!relayValue && relayValue.outcome === 'completed';
  const relayDone = relayCompleted && (relayValue!.scope === 'fiction' || (relayValue!.captureId !== null && relayValue!.captureId === copyCtx));
  const gaps: (NextStep | null)[] = [
    !copyOk ? { action: 'open-preparation', label: 'Preparar o activar una copia local', reason: 'Sin copia activa no hay nada que acreditar ni exportar.' } : null,
    hs && hs.configured && readWindow(hs, input.now).checking ? { action: 'open-integrations', label: 'Ver la comprobación en curso', reason: 'Hay una comprobación de la lectura de HubSpot en curso: espera su resultado en Integraciones.' } : null,
    hs && hs.configured && !readWindow(hs, input.now).checking && (!hs.evidence || readWindow(hs, input.now).currency !== 'current') && hs.consent.allowed ? { action: 'open-integrations', label: 'Comprobar la lectura de HubSpot', reason: hs.evidence ? (readWindow(hs, input.now).currency === 'expired' ? 'La última comprobación caducó.' : 'No se puede determinar si la última comprobación sigue vigente.') : 'La lectura guardada no se ha comprobado.' } : null,
    input.work.status === 'read' && wk?.counts && wk.counts.unknownOutcome > 0 ? { action: 'open-today', label: 'Comprobar los guardados inciertos', reason: wk.counts.unknownOutcome + ' guardado(s) salieron y no se sabe si se aplicaron.' } : null,
    copyOk && !copy!.facts.export.present ? { action: 'open-export', label: 'Exportar la copia', reason: 'No consta una exportación de esta copia.' } : null,
    // Solo un ensayo completado con la captura EXACTA de la copia actual cierra la carencia: sin captura identificada o con otra captura no la acredita.
    copyOk && !relayDone ? { action: 'start-rehearsal', label: 'Ensayar un relevo con datos ficticios', reason: relayCompleted ? 'El último ensayo completado no está ligado a esta copia, así que no la acredita.' : input.relay.status === 'read' && input.relay.value ? 'El último ensayo no se completó.' : 'No hay un ensayo completado para esta copia.' } : null,
  ];
  const nextStep = gaps.find((gap): gap is NextStep => gap !== null) ?? null;
  const provenance: ProvenanceRow[] = [
    { source: 'continuity-evidence', status: input.copy.status, at: stamp(input.copy.at), context: copyCtx },
    { source: 'hubspot-read-check', status: input.hubspot.status, at: stamp(input.hubspot.at), context: hs?.portal ? 'portal:' + hs.portal.id : null },
    { source: 'work-journal', status: input.work.status, at: stamp(input.work.at), context: null },
    { source: 'relay-rehearsal', status: input.relay.status, at: stamp(input.relay.at), context: relay?.captureId ?? null },
  ];
  const captures = [...contexts].filter(c => c.startsWith('capture:'));
  return {
    format: PASSPORT_FORMAT, generatedAt: nowIso ?? '', identity: { installId: shortId(input.installId), copy: { captureId: shortId(copyCtx), capturedAt: copyOk ? copy!.facts!.snapshot.capturedAt : null, testData: copyOk ? copy!.facts!.snapshot.isTestData : null }, contexts: [...contexts].map(c => c.startsWith('portal:') ? c : 'capture:' + shortId(c)) },
    mixedContexts: captures.length > 1,
    sections: (['copy', 'read', 'work', 'rehearsal', 'unproven'] as SectionKey[]).map(key => ({ key, question: QUESTIONS[key], claims: claims[key] })), nextStep, provenance,
  };
}

// ── Exportación manual por LISTA BLANCA ─────────────────────────────────────────────────────────────────────────────────────────────
const BASIS_LABEL: Record<Basis, string> = { observed: 'Observado', declared: 'Declarado', unverified: 'Sin comprobar', 'not-applicable': 'No aplica' };
const CURRENCY_LABEL: Record<Currency, string> = { current: 'vigente', expired: 'caducado', unknown: 'vigencia desconocida', 'not-applicable': '' };
export const SOURCE_LABEL: Record<Claim['source'], string> = { 'continuity-evidence': 'evidencia de la copia', 'hubspot-read-check': 'comprobación de lectura de HubSpot', 'work-journal': 'cuaderno de trabajo local', 'relay-rehearsal': 'ensayo de relevo', derived: 'derivado' };
export { BASIS_LABEL, CURRENCY_LABEL };
/** Reconstruye el objeto exportable campo a campo: nada que no esté aquí sale (ni fichas, ni credenciales, ni rutas, ni estados privados). */
export function passportExport(passport: Passport) {
  return {
    format: passport.format, generatedAt: passport.generatedAt,
    notice: 'Hoja de evidencia, no una copia ni una verificación de recuperación. Separa lo observado de lo declarado y de lo no comprobado.',
    identity: { installId: passport.identity.installId, copy: { ...passport.identity.copy }, contexts: [...passport.identity.contexts] }, mixedContexts: passport.mixedContexts,
    nextStep: passport.nextStep ? { action: passport.nextStep.action, label: passport.nextStep.label, reason: passport.nextStep.reason } : null,
    sections: passport.sections.map(section => ({ key: section.key, question: section.question, claims: section.claims.map(claim => ({ id: claim.id, text: claim.text, basis: claim.basis, currency: claim.currency, scope: claim.scope, at: claim.at, source: claim.source, context: contextLabel(claim.context) })) })),
    provenance: passport.provenance.map(row => ({ source: row.source, status: row.status, at: row.at, context: contextLabel(row.context) })),
  };
}
export const passportToJson = (passport: Passport): string => JSON.stringify(passportExport(passport), null, 2) + '\n';
/** SHA-256 del JSON exactamente como se descarga (UTF-8): permite comprobar que el HTML y el JSON son de la misma hoja. */
export const passportFingerprint = (passport: Passport): string => sha256Hex(passportToJson(passport));
export interface PassportTally { observed: number; declared: number; unverified: number; notApplicable: number; expired: number; total: number }
export function passportTally(passport: Passport): PassportTally {
  const claims = passport.sections.flatMap(section => section.claims);
  return {
    observed: claims.filter(c => c.basis === 'observed').length, declared: claims.filter(c => c.basis === 'declared').length,
    unverified: claims.filter(c => c.basis === 'unverified').length, notApplicable: claims.filter(c => c.basis === 'not-applicable').length,
    expired: claims.filter(c => c.currency === 'expired').length, total: claims.length,
  };
}
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** HTML autocontenido para enseñar a un auditor: escapa todo el contenido, sin scripts, sin recursos externos y con CSP restrictiva. */
export function passportToHtml(passport: Passport): string {
  const e = passportExport(passport), tally = passportTally(passport), print = passportFingerprint(passport);
  const badge = (basis: Basis, currency: Currency) => '<span class="b ' + esc(basis) + '">' + esc(BASIS_LABEL[basis]) + '</span>' + (CURRENCY_LABEL[currency] && currency !== 'current' ? '<span class="k ' + esc(currency) + '">' + esc(CURRENCY_LABEL[currency]) + '</span>' : '');
  const claim = (c: typeof e.sections[number]['claims'][number]) => '<li>' + badge(c.basis, c.currency) + ' ' + esc(c.text) + '<small>' + esc(c.scope) + (c.at ? ' · ' + esc(when(c.at)) : '') + ' · ' + esc(SOURCE_LABEL[c.source]) + (c.context ? ' · ' + esc(c.context) : '') + '</small></li>';
  const summaryRow = (s: typeof e.sections[number]) => { const first = s.claims[0]; return '<tr><th scope="row">' + esc(s.question) + '</th><td>' + (first ? badge(first.basis, first.currency) : '<span class="b unverified">Sin comprobar</span>') + '</td><td class="num">' + s.claims.length + '</td></tr>'; };
  const css = '@page{size:A4;margin:16mm 15mm}body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:48rem;margin:1.5rem auto;padding:0 1rem;color:#14202b;background:#fff}'
    + 'h1{font:600 1.6rem/1.2 Georgia,"Sitka Heading",serif;margin:0 0 .2rem}h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;color:#4a5765;margin:1.6rem 0 .5rem;padding-bottom:.25rem;border-bottom:1px solid #d6dce3}'
    + 'h3{font-size:1rem;margin:1.1rem 0 .3rem}.meta{color:#4a5765;font-size:.82rem;margin:.2rem 0}.lede{margin:.6rem 0 0}'
    + '.tally{display:flex;flex-wrap:wrap;gap:.4rem 1.6rem;margin:.4rem 0 0;font-variant-numeric:tabular-nums}.tally span{font-size:.82rem;color:#4a5765}.tally b{display:block;font-size:1.4rem;color:#14202b}'
    + 'table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{text-align:left;vertical-align:top;padding:.45rem .4rem;border-top:1px solid #e3e8ee}th{font-weight:500}.num{text-align:right;font-variant-numeric:tabular-nums;width:3.5rem}thead th{font-size:.72rem;color:#4a5765;text-transform:uppercase;letter-spacing:.05em}'
    + 'ul{list-style:none;padding:0;margin:0}li{padding:.4rem 0;border-top:1px solid #eef1f4;overflow-wrap:anywhere}small{display:block;color:#4a5765;font-size:.78rem}'
    + '.b,.k{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:0 .35rem;border:1px solid currentColor;border-radius:2px;margin-right:.3rem}'
    + '.b.observed{color:#17684a}.b.declared{color:#2c4fb8}.b.unverified{color:#80510a}.b.not-applicable{color:#5b6670}.k{color:#5b6670}.k.expired{color:#9b2c1f}'
    + '.n{border:1px solid #c9d3e0;background:#f3f6fa;padding:.55rem .7rem;border-radius:3px;margin:.8rem 0}'
    + 'code{font:.82rem ui-monospace,Consolas,monospace;word-spacing:.35rem;overflow-wrap:anywhere}.sign{display:grid;grid-template-columns:1fr 1fr;gap:1.4rem 2rem;margin-top:.8rem}.sign div{border-bottom:1px solid #14202b;height:2.2rem;font-size:.75rem;color:#4a5765}'
    + 'footer{margin-top:1.8rem;font-size:.75rem;color:#4a5765}@media print{body{margin:0;max-width:none}section,li,tr{break-inside:avoid}h2{break-after:avoid}}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pasaporte de continuidad</title><style>' + css + '</style></head><body>'
    + '<h1>Pasaporte de continuidad</h1><p class="meta">Formato ' + esc(e.format) + ' · generado ' + esc(when(e.generatedAt)) + (e.identity.installId ? ' · instalación ' + esc(e.identity.installId) : '')
    + (e.identity.copy.captureId ? ' · copia ' + esc(shortId(e.identity.copy.captureId) ?? '') + ' del ' + esc(when(e.identity.copy.capturedAt)) + (e.identity.copy.testData ? ' · datos de ensayo' : '') : ' · sin copia activa identificada') + '</p>'
    + '<p class="lede">' + esc(e.notice) + '</p>'
    + '<h2>Resumen para auditoría</h2><div class="tally"><span><b>' + tally.observed + '</b>observados</span><span><b>' + tally.declared + '</b>declarados</span><span><b>' + tally.unverified + '</b>sin comprobar</span>' + (tally.expired ? '<span><b>' + tally.expired + '</b>caducados</span>' : '') + '<span><b>' + tally.total + '</b>datos en total</span></div>'
    + '<table><thead><tr><th scope="col">Pregunta</th><th scope="col">Primer dato</th><th scope="col" class="num">Datos</th></tr></thead><tbody>' + e.sections.map(summaryRow).join('') + '</tbody></table>'
    + (e.mixedContexts ? '<p class="n">Hay observaciones de más de una copia: se muestran por separado y no se suman.</p>' : '')
    + (e.nextStep ? '<p class="n"><strong>Próximo paso:</strong> ' + esc(e.nextStep.label) + '. ' + esc(e.nextStep.reason) + '</p>' : '')
    + '<h2>Evidencia</h2>' + e.sections.map(s => '<section><h3>' + esc(s.question) + '</h3><ul>' + s.claims.map(claim).join('') + '</ul></section>').join('')
    + '<h2>Procedencia</h2><ul>' + e.provenance.map(r => '<li><strong>' + esc(SOURCE_LABEL[r.source]) + '</strong>: ' + esc(r.status === 'read' ? 'leído' : r.status === 'unavailable' ? 'no se pudo leer' : 'no solicitado') + '<small>' + (r.at ? esc(when(r.at)) : 'sin fecha') + (r.context ? ' · ' + esc(r.context) : '') + '</small></li>').join('') + '</ul>'
    + '<h2>Integridad</h2><p class="meta">Huella SHA-256 del JSON de esta misma hoja, descargado a la vez desde Plan B:</p><p><code>' + print.replace(/(.{8})/g, '$1 ').trim() + '</code></p>'
    + '<p class="meta">Para comprobarla en Windows: <code>Get-FileHash -Algorithm SHA256</code> sobre el fichero JSON. Si no coincide, alguno de los dos ficheros no corresponde a esta hoja.</p>'
    + '<h2>Revisión</h2><div class="sign"><div>Revisado por</div><div>Cargo</div><div>Fecha</div><div>Firma</div></div>'
    + '<footer>Sin fichas, credenciales ni rutas del equipo: solo afirmaciones con su base, su vigencia y su origen.</footer></body></html>';
}
