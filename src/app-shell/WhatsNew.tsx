import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../../shared/version.js';
import type { PageId } from './session.js';
import { unseen, WHATS_NEW, WHATS_NEW_KEY } from './whats-new.js';
import './whats-new.css';

const readSeen = () => { try { return localStorage.getItem(WHATS_NEW_KEY); } catch { return null; } };
const longDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** N5 · Botón «Novedades» de la barra: un punto mientras haya una versión sin ver y una lista breve con un enlace a cada función. */
export function WhatsNew({ onOpen }: { onOpen: (page: PageId) => void }) {
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const fresh = unseen(WHATS_NEW, seen, APP_VERSION);
  const entry = fresh[0] ?? unseen(WHATS_NEW, null, APP_VERSION)[0];

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape); };
  }, [open]);

  if (!entry) return null;
  const toggle = () => {
    setOpen(value => !value);
    if (!fresh.length) return;
    try { localStorage.setItem(WHATS_NEW_KEY, APP_VERSION); } catch { /* sin almacenamiento: el punto vuelve en la próxima visita */ }
    setSeen(APP_VERSION);
  };
  return <div className="gx-news" ref={box}>
    <button ref={trigger} type="button" className="gx-help gx-cmd gx-news-button" aria-expanded={open} aria-controls="gx-news-pop" aria-label={fresh.length ? 'Novedades sin ver' : 'Novedades'} title="Novedades de Plan B" onClick={toggle}>
      <Sparkles size={15} aria-hidden="true" />{fresh.length ? <i className="gx-news-dot" aria-hidden="true" /> : null}
    </button>
    {open ? <section id="gx-news-pop" className="gx-news-pop" aria-labelledby="gx-news-title">
      <header><h2 id="gx-news-title">Novedades</h2><span>Versión {entry.version} · {longDate.format(new Date(entry.date + 'T12:00:00Z'))}</span></header>
      <ul>{entry.items.map(item => <li key={item.title}>
        {item.page ? <button type="button" onClick={() => { setOpen(false); onOpen(item.page!); }}><strong>{item.title}</strong><span>{item.text}</span><ArrowRight size={14} aria-hidden="true" /></button>
          : <div><strong>{item.title}</strong><span>{item.text}</span></div>}
      </li>)}</ul>
    </section> : null}
  </div>;
}
