import type { ReactNode } from 'react';

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
