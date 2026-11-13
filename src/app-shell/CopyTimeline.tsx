import type { ContinuityStatus } from '../../shared/operations.js';
import { buildCopyTimeline, type DayState, type EventKind, type TimelineDay } from './copy-timeline.js';

const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'narrow' });
const dayLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
const dayShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const when = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATE_TEXT: Record<DayState, string> = { before: 'antes de la primera copia conservada', covered: '', gap: 'sin captura', pending: 'todavía sin captura hoy' };
const MARK: Record<EventKind, string> = { 'capture-first': '●', 'capture-last': '●', 'drill-pass': '✓', 'drill-fail': '✗', export: '⤓', confirm: '✓', restore: '↺', 'job-fail': '!' };

function describe(day: TimelineDay) {
  const parts = [dayLong.format(day.date)];
  parts.push(day.captures ? day.captures + (day.captures === 1 ? ' captura' : ' capturas') : STATE_TEXT[day.state]);
  if (day.drill) parts.push(day.drill === 'pass' ? 'prueba superada' : 'prueba con fallos');
  if (day.exported) parts.push('copia cifrada exportada');
  if (day.failures) parts.push(day.failures + (day.failures === 1 ? ' trabajo fallido' : ' trabajos fallidos'));
  return parts.join(' · ');
}

/** Cronología de la copia (Continuidad › Copias y archivo): catorce días de capturas, pruebas y exportaciones con los
 *  huecos a la vista, y los hechos que importan en orden. Solo lectura: no lanza capturas ni pruebas. */
export function CopyTimeline({ status, now = new Date() }: { status: Pick<ContinuityStatus, 'captures' | 'reports' | 'jobs' | 'recoveryCopy'>; now?: Date }) {
  const timeline = buildCopyTimeline(status, now);
  const { summary } = timeline;
  const gap = summary.longestGap;
  const sentence = !summary.firstCaptureAt
    ? 'Todavía no hay ninguna captura conservada; la cronología empieza con la primera.'
    : summary.gaps === 0
      ? 'Todos los días desde la primera copia conservada tienen al menos una captura.'
      : summary.gaps + (summary.gaps === 1 ? ' día' : ' días') + ' sin captura en los últimos ' + summary.window + (gap && gap.length > 1 ? '; el hueco más largo, del ' + dayShort.format(gap.from) + ' al ' + dayShort.format(gap.to) + ' (' + gap.length + ' días).' : '.');
  return <section className="gx-ctl" aria-labelledby="gx-ctl-title">
    <div className="gx-ctl-head">
      <div><h2 id="gx-ctl-title">Cronología de la copia</h2><p className="helper">{sentence}</p></div>
      <dl className="gx-ctl-figures"><div><dt>Días con captura</dt><dd>{summary.covered}<small>/{summary.window}</small></dd></div><div><dt>Huecos</dt><dd data-tone={summary.gaps ? 'warn' : undefined}>{summary.gaps}</dd></div></dl>
    </div>
    <ol className="gx-ctl-days" aria-label={'Últimos ' + summary.window + ' días'}>
      {timeline.days.map(day => <li key={day.key} data-state={day.state} aria-label={describe(day)} title={describe(day)}>
        <span className="gx-ctl-weekday" aria-hidden="true">{weekday.format(day.date)}</span>
        <span className="gx-ctl-bar" aria-hidden="true">{day.captures > 1 ? <b>{day.captures}</b> : null}</span>
        <span className="gx-ctl-date" aria-hidden="true">{day.date.getDate()}</span>
        <span className="gx-ctl-marks" aria-hidden="true">{day.drill ? <i data-mark={day.drill}>{day.drill === 'pass' ? '✓' : '✗'}</i> : null}{day.exported ? <i data-mark="export">⤓</i> : null}{day.failures ? <i data-mark="fail">!</i> : null}</span>
      </li>)}
    </ol>
    <ul className="gx-ctl-legend" aria-label="Leyenda">
      <li data-state="covered">Con captura</li><li data-state="gap">Sin captura</li><li data-state="pending">Hoy, pendiente</li><li data-state="before">Antes de la primera</li><li><i data-mark="pass">✓</i> Prueba</li><li><i data-mark="export">⤓</i> Exportación</li>
    </ul>
    {timeline.events.length ? <ol className="gx-ctl-events" aria-label="Hechos de la copia, del más reciente al más antiguo">
      {timeline.events.slice(0, 8).map(event => <li key={event.kind + event.at} data-kind={event.kind}>
        <span className="gx-ctl-mark" aria-hidden="true">{MARK[event.kind]}</span>
        <span><strong>{event.label}</strong>{event.detail ? <small>{event.detail}</small> : null}</span>
        <time dateTime={event.at}>{when.format(new Date(event.at))}</time>
      </li>)}
    </ol> : null}
    <p className="helper gx-ctl-note">Se conservan hasta 24 capturas horarias y 30 diarias: los días antiguos muestran una captura aunque hubiera más.</p>
  </section>;
}
