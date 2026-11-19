import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Piezas base de la interfaz «Faro». Solo presentan: no leen datos ni guardan estado.
 *  Sus estilos están en faro.css, bajo el prefijo `ui-`. */

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

/** Hoja: la superficie única de la app. Con `title` lleva cabecera y queda etiquetada para lectores de pantalla. */
export function Sheet({ title, action, children, id, flush = false, as: Tag = 'section' }: { title?: string; action?: ReactNode; children?: ReactNode; id?: string; flush?: boolean; as?: 'section' | 'article' | 'div' }) {
  const headingId = title && id ? id + '-title' : undefined;
  return <Tag className={'ui-sheet' + (flush ? ' ui-sheet-flush' : '')} id={id} aria-labelledby={headingId}>
    {title ? <header className="ui-sheet-head"><h2 id={headingId}>{title}</h2>{action ? <div className="ui-sheet-action">{action}</div> : null}</header> : null}
    {children}
  </Tag>;
}

/** Cabecera de página: título, una frase de contexto y las acciones, en una línea. */
export function PageHeader({ title, subtitle, actions, id }: { title: string; subtitle?: ReactNode; actions?: ReactNode; id?: string }) {
  return <header className="ui-page-header"><div><h1 id={id}>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>{actions ? <div className="ui-page-actions">{actions}</div> : null}</header>;
}

/** Etiqueta de estado. El color nunca es la única señal: el texto dice el estado. */
export function Tag({ tone = 'neutral', children }: { tone?: Tone; children?: ReactNode }) {
  return <span className="ui-tag" data-tone={tone === 'neutral' ? undefined : tone}>{children}</span>;
}

/** Estado vacío: qué pasa y, si procede, qué hacer. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ui-empty">{icon ? <span className="ui-empty-icon" aria-hidden="true">{icon}</span> : null}<h3>{title}</h3>{children ? <p>{children}</p> : null}{action ? <div className="ui-empty-action">{action}</div> : null}</div>;
}

/** Marcador de carga con forma de filas. Marca la zona como ocupada (aria-busy) y deja el texto legible; no usa role=status
 *  para no competir con el aviso (toast) de la App, que es el único estado que se anuncia. Las barras son decorativas. */
export function Skeleton({ rows = 6, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return <div className="ui-skeleton" aria-busy="true"><span className="ui-sr">{label}</span>{Array.from({ length: rows }, (_, index) => <span key={index} className="ui-skeleton-row" aria-hidden="true" style={{ width: 92 - (index * 13) % 34 + '%' }} />)}</div>;
}

/** Error con qué hacer (mejora D3; CLAUDE-UI-STATES-D3): qué pasó, qué no se ha perdido y una acción para reintentar.
 *  Se anuncia como alerta. Sin acción, solo informa. */
export function ErrorState({ title, children, actionLabel = 'Reintentar', onAction }: { title: string; children?: ReactNode; actionLabel?: string; onAction?: () => void }) {
  return <div className="ui-error" role="alert"><h3>{title}</h3>{children ? <p>{children}</p> : null}{onAction ? <button type="button" className="button secondary" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

/** Confirmación en su sitio (mejora #6), en lugar del `confirm()` del navegador: la pregunta junto a lo que la provocó,
 *  con la salida segura primero y con el foco. Escape la descarta. El grupo se etiqueta con la propia pregunta. */
export function InlineConfirm({ id, question, confirmLabel, cancelLabel = 'Seguir aquí', onConfirm, onCancel }: { id: string; question: ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="ui-confirm" role="group" aria-labelledby={id + '-q'} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); onCancel(); } }}>
    <p id={id + '-q'}>{question}</p>
    <div className="ui-confirm-actions"><button type="button" className="button" autoFocus onClick={onCancel}>{cancelLabel}</button><button type="button" className="button danger" onClick={onConfirm}>{confirmLabel}</button></div>
  </div>;
}

/** Límite de error para un apartado: si falla al cargar o al pintarse, enseña el error en su sitio y el resto de la App
 *  sigue funcionando. La acción por defecto recarga la página (el caso típico: un despliegue nuevo cambió sus archivos). */
export class PageErrorBoundary extends Component<{ label: string; children?: ReactNode; onRetry?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Apartado «' + this.props.label + '» no se pudo abrir:', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    const retry = this.props.onRetry ?? (() => { if (typeof location !== 'undefined') location.reload(); });
    return <ErrorState title={'No se pudo abrir ' + this.props.label} actionLabel={this.props.onRetry ? 'Reintentar' : 'Recargar la página'} onAction={retry}>
      Tus datos están intactos en este ordenador. Suele ocurrir tras actualizar Plan B o si el servidor local se ha cerrado: recarga la página para volver a intentarlo.
    </ErrorState>;
  }
}
