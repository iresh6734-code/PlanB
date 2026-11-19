import type { AppState } from '../../shared/model.js';
import type { ContinuityStatus } from '../../shared/operations.js';

const captureDateFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short',
});

export function describeCapture(capturedAt: string | null | undefined, now = Date.now()) {
  const time = capturedAt ? Date.parse(capturedAt) : NaN;
  if (!Number.isFinite(time)) return { date: null, age: null, stale: false };
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const age = minutes === 0 ? 'ahora mismo' : minutes < 60 ? 'hace ' + minutes + ' min'
    : hours < 24 ? 'hace ' + hours + ' h' : 'hace ' + days + (days === 1 ? ' día' : ' días');
  return { date: captureDateFormat.format(time), age, stale: now - time > 75 * 60_000 };
}

export function workspaceCopy(state: Pick<AppState, 'snapshot' | 'ready'>, status: Pick<ContinuityStatus, 'latestCapture' | 'readiness'> | null) {
  const snapshot = state.snapshot;
  const activeId = state.ready && snapshot ? snapshot.id + ':' + snapshot.capturedAt : null;
  const latest = status?.latestCapture ?? null;
  const latestIsDifferent = !!(activeId && latest && activeId !== latest.id);
  const activeIsLatest = !!activeId && latest?.id === activeId;
  // La API evalúa la última captura archivada. Solo puede acreditarse esa captura exacta.
  const latestReadiness = latest && status?.readiness?.captureId === latest.id ? status.readiness : null;
  return {
    activeId, latest, latestIsDifferent, latestReadiness,
    activeReadiness: activeIsLatest ? latestReadiness : null,
    activeCaptureRecords: activeIsLatest ? latest?.records ?? null : null,
  };
}

export function captureRecordCount(records: number) {
  return records + (records === 1 ? ' registro' : ' registros');
}
