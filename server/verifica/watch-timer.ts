import type { Store } from '../store.js';
import { sha256Hex } from '../../shared/sha256.js';
import { parseCaptureText } from '../../shared/verifica/inputs.js';
import { checkReadAuthorization, madridDay, parseReadAuthorization, verifyReadRecord, type ReadAuthorization, type ReadRecord } from '../../shared/verifica/read-authorization.js';
import { fingerprintOf } from '../../shared/verifica/report.js';
import { releaseWatchReport, WatchInputError, watchSchedule } from '../../shared/verifica/watch.js';
import { WATCH_REJECTIONS_TO_PAUSE, type WatchCaptureRef, type WatchScheduleStatus } from '../../shared/verifica/watch-contract.js';
import { VerificaReadError } from '../../shared/verifica/hubspot.js';
import { credentialProblem, readWithRecord } from './hubspot-read.js';
import { appendLedger, recordRefs } from './expediente-store.js';
import type { LedgerRef } from '../../shared/verifica/expediente.js';

const observationRefs = (observation: Observation, ref: WatchCaptureRef): LedgerRef[] => [
  { kind: 'capture', method: 'sha256-bytes-v1', fingerprint: sha256Hex(observation.captureText) },
  { kind: 'capture', method: 'verifica-input-v1', fingerprint: ref.fingerprint },
  ...recordRefs(observation.record),
];

type Observation = { captureText: string; record: ReadRecord };
type WatchState = {
  portalId: string;
  engagement: string;
  salt: string;
  signing: WatchCaptureRef;
  weekly: WatchCaptureRef[];
  accepted: string[];
  retryAt: string | null;
};
type Lease = { token: string; authorization: ReadAuthorization; documentSha256: string; abort: AbortController };

const watchKey = (id: string) => `verifica:watch:${id}`;
const observationKey = (id: string, fingerprint: string) => `verifica:watch-capture:${id}:${fingerprint}`;
const last = (state: WatchState) => state.weekly.at(-1) ?? state.signing;

export function inspectWatchObservation(observation: Observation) {
  const capture = parseCaptureText(observation.captureText, 'La captura');
  if (capture.source !== 'hubspot' || capture.id !== observation.record.captureId || !verifyReadRecord(observation.record, observation.captureText)) {
    throw new WatchInputError('La captura necesita su acta de lectura íntegra.');
  }
  const ref: WatchCaptureRef = { at: new Date(capture.capturedAt).toISOString(), fingerprint: fingerprintOf(capture) };
  return { capture, ref };
}

/** Guarda cada captura y su acta juntas. La instalación mantiene las credenciales de vigilancia solo en memoria. */
export function createWatchTimer(store: Store, options: { now?: () => Date; fetcher?: typeof fetch; intervalMs?: number; maxCaptureBytes?: number } = {}) {
  const now = options.now ?? (() => new Date());
  const leases = new Map<string, Lease>();
  // Mega Plan 3, fase 2: el operador tiene que saber por qué la vigilancia está en pausa o por qué falló la última lectura.
  // Se guarda en memoria, como la credencial: tras un reinicio no hay motivo y la pantalla dice que hay que reactivarla.
  const reasons = new Map<string, string>();
  const rejections = new Map<string, number>();
  let pending: Promise<void> | null = null;

  function stateOf(id: string): WatchState {
    const state = store.get<WatchState | null>(watchKey(id), null);
    if (!state) throw new WatchInputError('Falta fijar la captura de firma.');
    return state;
  }

  function pause(id: string, reason = 'Pausada a mano.') {
    const lease = leases.get(id);
    leases.delete(id);
    lease?.abort.abort();
    if (lease) reasons.set(id, reason);
  }
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

  function checkLease(lease: Lease, state: WatchState) {
    if (lease.authorization.engagement !== state.engagement) throw new WatchInputError('La autorización corresponde a otro encargo.');
    checkReadAuthorization(lease.authorization, { portalId: state.portalId, today: madridDay(now()), documentSha256: lease.documentSha256 });
  }

  async function runDue() {
    for (const [id, lease] of [...leases]) {
      if (leases.get(id) !== lease) continue;
      let state: WatchState;
      try { state = stateOf(id); } catch { pause(id, 'El encargo ya no tiene vigilancia configurada.'); continue; }
      try { checkLease(lease, state); }
      catch { pause(id, 'La autorización caducó o ya no cubre la lectura de hoy. Actívala de nuevo con una autorización vigente.'); continue; }
      const previous = last(state);
      const at = now().toISOString();
      if (at < watchSchedule(previous.at, at).nextDue || (state.retryAt && at < state.retryAt)) continue;

      try {
        const { captureText, record } = await readWithRecord({ token: lease.token, authorization: lease.authorization,
          portalId: state.portalId, mode: 'client', fetch: options.fetcher ?? fetch, now, signal: lease.abort.signal, maxCaptureBytes: options.maxCaptureBytes });
        if (leases.get(id) !== lease) continue;
        if (!record) throw new Error('Falta el acta de la lectura.');
        const { ref: observed } = inspectWatchObservation({ captureText, record });
        if (observed.at <= previous.at) throw new Error('La captura debe ser posterior a la anterior.');
        checkLease(lease, state);
        store.transaction(() => {
          const current = stateOf(id);
          if (last(current).fingerprint !== previous.fingerprint) throw new Error('Cambió la última captura.');
          store.set(observationKey(id, observed.fingerprint), { captureText, record });
          store.set(watchKey(id), { ...current, weekly: [...current.weekly, observed], retryAt: null } satisfies WatchState);
          appendLedger(store, id, now().toISOString(), [{ event: 'watch-capture', data: { origin: 'watch' }, refs: observationRefs({ captureText, record }, observed) }]);
        });
        reasons.delete(id); rejections.delete(id);
      } catch (error) {
        if (leases.get(id) !== lease) continue;
        // Una credencial o unos permisos rechazados no se arreglan reintentando: al tercer rechazo seguido se pausa.
        if (error instanceof VerificaReadError && (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN')) {
          const count = (rejections.get(id) ?? 0) + 1;
          rejections.set(id, count);
          if (count >= WATCH_REJECTIONS_TO_PAUSE) {
            pause(id, error.code === 'UNAUTHORIZED'
              ? 'HubSpot rechazó la credencial ' + count + ' veces seguidas. Comprueba la clave y vuelve a activar la vigilancia.'
              : 'A la credencial le faltan permisos de lectura en HubSpot (' + count + ' rechazos seguidos). Revísalos y vuelve a activarla.');
            continue;
          }
        }
        // Espacia los reintentos automáticos sin incorporar el error del proveedor al expediente.
        try {
          const retryAt = new Date(now().getTime() + 3_600_000).toISOString();
          store.set(watchKey(id), { ...stateOf(id), retryAt } satisfies WatchState);
          reasons.set(id, (error instanceof VerificaReadError && (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN')
            ? 'HubSpot rechazó la última lectura' : 'La última lectura falló') + '; se reintenta a las ' + hhmm(retryAt) + '.');
        } catch { pause(id, 'No se pudo programar el reintento. Vuelve a activar la vigilancia.'); }
      }
    }
  }

  const poll = () => pending ??= runDue().finally(() => { pending = null; });
  const interval = setInterval(() => { void poll().catch(() => {}); }, options.intervalMs ?? 60_000);
  interval.unref();

  function loadObservation(id: string, fingerprint: string) {
    const item = store.get<Observation | null>(observationKey(id, fingerprint), null);
    if (!item) throw new Error('Falta una captura con su acta íntegra.');
    const { capture, ref } = inspectWatchObservation(item);
    if (ref.fingerprint !== fingerprint) throw new Error('Cambió la huella de la captura de vigilancia.');
    return { item, capture };
  }

  function reportOf(id: string, asOf: string) {
    const state = stateOf(id);
    const load = ({ fingerprint }: WatchCaptureRef) => loadObservation(id, fingerprint).capture;
    return releaseWatchReport({ signing: load(state.signing), captures: state.weekly.map(load), accepted: state.accepted, asOf, salt: state.salt });
  }

  return {
    setSigning(id: string, observation: Observation, salt: string) {
      if (store.get<WatchState | null>(watchKey(id), null)) throw new WatchInputError('La captura de firma ya está fijada.');
      if (salt.length < 16) throw new WatchInputError('Hace falta la sal de este encargo.');
      const { ref: signing } = inspectWatchObservation(observation);
      if (Date.parse(signing.at) > now().getTime()) throw new WatchInputError('La captura de firma no puede ser futura.');
      store.transaction(() => {
        store.set(observationKey(id, signing.fingerprint), observation);
        store.set(watchKey(id), { portalId: observation.record.portalId, engagement: observation.record.engagement,
          signing, salt, weekly: [], accepted: [], retryAt: null } satisfies WatchState);
        appendLedger(store, id, now().toISOString(), [{ event: 'watch-signing', data: { origin: 'watch' }, refs: observationRefs(observation, signing) }]);
      });
    },
    resume(id: string, input: { token: string; authorization: unknown; signedDocument: Uint8Array; confirmRecurring: boolean }) {
      if (input.confirmRecurring !== true) throw new WatchInputError('Confirma que el documento firmado cubre las lecturas semanales.');
      const problem = credentialProblem(input.token);
      if (problem) throw new WatchInputError(problem);
      const lease = { token: input.token, authorization: parseReadAuthorization(input.authorization),
        documentSha256: sha256Hex(input.signedDocument), abort: new AbortController() };
      checkLease(lease, stateOf(id));
      pause(id);
      leases.set(id, lease);
      reasons.delete(id); rejections.delete(id);
    },
    pause,
    configured(id: string) { return store.get<WatchState | null>(watchKey(id), null) !== null; },
    status(id: string): WatchScheduleStatus {
      const state = stateOf(id), latest = last(state);
      const active = leases.has(id);
      return { active, signing: state.signing, latest, weeklyCount: state.weekly.length,
        retriesAfter: state.retryAt, ...watchSchedule(latest.at, now().toISOString()),
        reason: reasons.get(id) ?? (active ? null : 'Sin credencial activa: tras abrir Plan B, la vigilancia se activa con la autorización y la clave.'),
        rejections: rejections.get(id) ?? 0 };
    },
    privateSalt(id: string) { return stateOf(id).salt; },
    accept(id: string, fingerprint: string) {
      store.transaction(() => {
        const state = stateOf(id);
        if (!state.weekly.some(item => item.fingerprint === fingerprint)) throw new WatchInputError('No hay una captura semanal con esa huella.');
        if (state.accepted.includes(fingerprint)) return;
        store.set(watchKey(id), { ...state, accepted: [...state.accepted, fingerprint] });
        appendLedger(store, id, now().toISOString(), [{ event: 'watch-accepted', refs: [{ kind: 'capture', method: 'verifica-input-v1', fingerprint }] }]);
      });
    },
    report(id: string, asOf = now().toISOString()) {
      return reportOf(id, asOf);
    },
    /** La captura de cierre es la última del parte. `retained` indica que las partes aún no han aceptado su huella. */
    closing(id: string, asOf: string) {
      const report = reportOf(id, asOf);
      const entry = report.entries.at(-1)!;
      const { item } = loadObservation(id, entry.fingerprint);
      return { captureText: item.captureText, report, retained: entry.status === 'retained' };
    },
    poll,
    async close() {
      clearInterval(interval);
      for (const id of leases.keys()) pause(id);
      await pending;
    },
  };
}
