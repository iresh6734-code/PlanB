// Simulacro programado (misión maestra A3, 22/11/2026). Lógica pura y compartida.
// Funciona mientras Plan B está abierto (el temporizador vive en el proceso, no es un servicio de Windows). Toca un simulacro
// cada 30 días desde el último informe; si un intento no deja informe (el proceso aislado no terminó), no se reintenta cada
// minuto: se espera 6 horas. El intento se guarda en la copia, así que sobrevive a un reinicio y no se duplica.
export const DRILL_INTERVAL_DAYS = 30;
export const DRILL_RETRY_HOURS = 6;
const DAY = 86_400_000, HOUR = 3_600_000;

export interface DrillScheduleInput { hasCapture: boolean; lastReportAt: string | null; lastAttemptAt: string | null }
export interface DrillPlan { due: boolean; nextAt: string | null }

const time = (value: string | null) => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : null; };

export function drillPlan(now: number, input: DrillScheduleInput): DrillPlan {
  if (!input.hasCapture) return { due: false, nextAt: null };
  const report = time(input.lastReportAt), attempt = time(input.lastAttemptAt);
  const byReport = report === null ? now : report + DRILL_INTERVAL_DAYS * DAY;
  // Un intento solo frena si es posterior al último informe (si ya dejó informe, manda el informe).
  const byAttempt = attempt === null || (report !== null && attempt <= report) ? now : attempt + DRILL_RETRY_HOURS * HOUR;
  const next = Math.max(byReport, byAttempt);
  return { due: next <= now, nextAt: new Date(next).toISOString() };
}
