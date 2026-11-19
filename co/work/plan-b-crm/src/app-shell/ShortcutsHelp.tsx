import { Modal } from '../components.js';
import { SHORTCUTS } from './useShortcuts.js';

export function ShortcutsHelp({ close }: { close: () => void }) {
  return <Modal title="Atajos de teclado" close={close}><div className="modal-body"><dl className="gx-keys">{SHORTCUTS.map(([keys, what]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{what}</dd></div>)}</dl><p className="helper">Los atajos de una letra no actúan mientras escribes en un campo ni con una ficha o ventana abierta.</p></div></Modal>;
}
