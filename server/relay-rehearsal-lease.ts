// RANURA DE EJECUCIÓN del ensayo de relevo (unidad 224). Resuelve la frontera que la sonda de Codex reprodujo en 216: tras POST → DELETE → POST había dos ejecutores vivos, porque cancelar o agotar
// el tiempo liberaba la capacidad LÓGICA mientras el trabajo físico seguía. Aquí la capacidad solo se libera cuando el ejecutor TERMINA de verdad (su promesa se asienta; el ejecutor real solo la
// asienta cuando todo su árbol de procesos ha cerrado). Tres hechos distintos, que no se confunden:
//   · cancelación solicitada → la señal se aborta, el resultado de esa ejecución ya no se publicará y la ranura pasa a «drenando»;
//   · publicación descartada → un resultado tardío (de una generación cancelada, caducada o ya revocada) nunca se entrega;
//   · ejecución terminada   → `released` se cumple y solo entonces se admite otra ejecución.
// Un tiempo agotado tampoco libera: sigue drenando hasta que el ejecutor termine. No hay estado compartido ni disco aquí: es una primitiva pura, probada con barreras.
export type DiscardReason = 'cancelled' | 'unauthorized' | 'closing';
export type LeaseOutcome<T> = { kind: 'finished'; value: T } | { kind: 'failed' } | { kind: 'discarded'; reason: DiscardReason } | { kind: 'timeout' };
export interface LeaseSnapshot {
  /** `running`: ejecutándose con normalidad; `draining`: ya se pidió detenerla (cancelación, revocación, cierre o tiempo agotado) pero el trabajo físico no ha terminado. */
  phase: 'idle' | 'running' | 'draining';
  drainingFor: DiscardReason | 'timeout' | null;
  since: number | null;
  generation: number;
}
export interface LeaseRun<T> {
  generation: number;
  /** Se aborta al cancelar, revocar, cerrar o agotar el tiempo: el ejecutor debe detener TODO su trabajo y solo entonces asentar su promesa. */
  signal: AbortSignal;
  /** Se cumple en cuanto se sabe qué hacer con esta ejecución (puede ser antes de que el trabajo termine). */
  outcome: Promise<LeaseOutcome<T>>;
  /** Se cumple cuando el ejecutor terminó de verdad y la capacidad volvió a estar libre. */
  released: Promise<void>;
}
export type LeaseStart<T> = { kind: 'started'; run: LeaseRun<T> } | { kind: 'busy'; snapshot: LeaseSnapshot };
export interface RunLeaseOptions {
  /** Tope de duración (ms). Al agotarse se aborta la señal y el resultado es `timeout`, pero la capacidad no se libera hasta que el ejecutor termine. */
  timeoutMs: number;
  now?: () => number;
  /** Solo pruebas: permite contar los temporizadores pendientes. */
  timers?: { set(callback: () => void, ms: number): ReturnType<typeof setTimeout>; clear(timer: ReturnType<typeof setTimeout>): void };
}
interface Active { generation: number; startedAt: number; abort: AbortController; reason: DiscardReason | 'timeout' | null; reasonAt: number | null; timer: ReturnType<typeof setTimeout> | null; decide(outcome: LeaseOutcome<never>): void; released: Promise<void> }

export class RunLease<T> {
  private active: Active | null = null;
  private generation = 0;
  private published = 0;
  private readonly timeoutMs: number;
  private readonly clock: () => number;
  private readonly timers: NonNullable<RunLeaseOptions['timers']>;
  constructor(options: RunLeaseOptions) {
    this.timeoutMs = Math.min(3_600_000, Math.max(100, options.timeoutMs));
    this.clock = options.now ?? Date.now;
    this.timers = options.timers ?? { set: (callback, ms) => setTimeout(callback, ms), clear: timer => clearTimeout(timer) };
  }

  snapshot(): LeaseSnapshot {
    const a = this.active;
    if (!a) return { phase: 'idle', drainingFor: null, since: null, generation: this.generation };
    return { phase: a.reason ? 'draining' : 'running', drainingFor: a.reason, since: a.reason ? a.reasonAt : a.startedAt, generation: a.generation };
  }

  start(executor: (context: { signal: AbortSignal; generation: number }) => Promise<T>): LeaseStart<T> {
    if (this.active) return { kind: 'busy', snapshot: this.snapshot() };
    const generation = ++this.generation, abort = new AbortController();
    let decided = false, decideOutcome!: (outcome: LeaseOutcome<T>) => void, release!: () => void;
    const outcome = new Promise<LeaseOutcome<T>>(resolve => { decideOutcome = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const active: Active = {
      generation, startedAt: this.clock(), abort, reason: null, reasonAt: null, timer: null, released,
      decide: (value) => { if (!decided) { decided = true; decideOutcome(value as LeaseOutcome<T>); } },
    };
    this.active = active;
    active.timer = this.timers.set(() => { active.timer = null; this.request(active, 'timeout'); }, this.timeoutMs); active.timer.unref?.();
    let work: Promise<T>;
    try { work = Promise.resolve(executor({ signal: abort.signal, generation })); } catch (error) { work = Promise.reject(error); }
    work.then(value => { if (!decided) active.decide({ kind: 'finished', value } as LeaseOutcome<never>); }, () => { if (!decided) active.decide({ kind: 'failed' }); })
      .finally(() => {
        if (active.timer) { this.timers.clear(active.timer); active.timer = null; }
        if (this.active === active) this.active = null;
        release();
      });
    return { kind: 'started', run: { generation, signal: abort.signal, outcome, released } };
  }

  /** Pide detener la ejecución en curso. Devuelve false si no hay ninguna o ya se pidió. No libera la capacidad. */
  cancel(reason: DiscardReason = 'cancelled'): boolean {
    const a = this.active;
    return !!a && this.request(a, reason);
  }

  /** ¿Puede esta ejecución publicar su resultado? Solo la más reciente que aún no se publicó y cuyo resultado no fue descartado (cancelación, revocación, cierre): un resultado antiguo nunca sobrescribe uno posterior. */
  commit(run: { generation: number }, outcome: LeaseOutcome<unknown>): boolean {
    if (outcome.kind === 'discarded' || run.generation <= this.published) return false;   // terminado, fallido o vencido se publican (como registro); lo descartado, nunca
    this.published = run.generation; return true;
  }

  /** Cierre del servidor: pide detener y espera (acotado) a que el trabajo físico termine. `drained` es false si sigue vivo al agotarse la espera. */
  async close(graceMs = 10_000): Promise<{ drained: boolean }> {
    const a = this.active;
    if (!a) return { drained: true };
    this.request(a, 'closing');
    let timer: ReturnType<typeof setTimeout> | null = null;
    const gone = a.released.then(() => true), late = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, graceMs)); timer.unref?.(); });
    try { return { drained: await Promise.race([gone, late]) }; } finally { if (timer) clearTimeout(timer); }
  }

  private request(a: Active, reason: DiscardReason | 'timeout'): boolean {
    if (a.reason) return false;
    a.reason = reason; a.reasonAt = this.clock();
    if (a.timer) { this.timers.clear(a.timer); a.timer = null; }
    a.abort.abort();
    a.decide(reason === 'timeout' ? { kind: 'timeout' } : { kind: 'discarded', reason });
    return true;
  }
}
