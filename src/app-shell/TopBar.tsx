import { ArrowRight, Clock3, Command, GitBranch, Lock, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme } from './theme.js';
import type { AppState } from '../../shared/model.js';
import { describeCapture } from './workspace-copy.js';
import './mobile-copy-alert.css';

/** Barra superior: dónde estás, antigüedad de la copia (ámbar a partir de 75 minutos, el mismo umbral que avisa Continuidad) y modo de datos. */
export function TopBar({ state, pageLabel, teamOrigin, openContinuity, openChanges, openHelp, openCommands, onProtect, reminder }: { state: AppState; pageLabel: string; teamOrigin: string | null; openContinuity: () => void; openHelp: () => void; openCommands: () => void;
  /** Recordatorio de tareas con hora (H4): un componente con su propio reloj, para no repintar la barra entera. */ reminder?: ReactNode;
  /** Los cambios locales pendientes llevan a Cambios, donde se revisan; sin esta función se muestran dentro de la copia. */ openChanges?: () => void;
  /** Proteger o bloquear Plan B: una acción, no un lugar, así que vive aquí y no en el menú (CLAUDE-UI-NAV-LAB). */ onProtect?: () => void }) {
  const [theme, toggleTheme] = useTheme();
  const copy = describeCapture(state.snapshot?.capturedAt);
  const copyStale = state.ready && !state.runtime && copy.stale;
  const copyLabel = state.ready ? 'Copia activa' : 'Captura importada';
  const production = state.snapshot?.source.isTestData === false;
  const changes = state.changes ?? 0, changesText = changes + (changes === 1 ? ' cambio' : ' cambios');
  return <>
    <div className="workspace-context gx-topbar">
      {state.snapshot ? <button type="button" className={'gx-copy ' + (state.disconnected ? 'independent' : '')} data-stale={copyStale ? 'true' : undefined} title={copyLabel + ': ' + (copy.date ?? 'fecha no disponible') + '. Abrir Continuidad'} onClick={openContinuity}>
        <i className="dot" />{copyLabel} · {copy.age ?? 'fecha no disponible'}
        {changes > 0 && !openChanges ? <b>{changesText}</b> : null}
      </button> : null}
      {state.snapshot && changes > 0 && openChanges && pageLabel !== 'Cambios' ? <button type="button" className="gx-changes" aria-label={changesText + ' locales: revisar en Cambios'} title="Cambios locales pendientes de devolver. Revisarlos en Cambios" onClick={openChanges}>
        <GitBranch size={13} aria-hidden="true" /><span>{changes}</span><span className="gx-changes-word">{changes === 1 ? 'cambio' : 'cambios'}</span>
      </button> : null}
      {reminder}
      <span className="gx-mode" data-mode={production ? 'production' : 'test'}>{production ? 'Producción · lectura' : 'Datos de prueba'}</span>
      {teamOrigin ? <a className="text-button gx-team-link" href={teamOrigin + '/team?view=commercial'}>Espacio de equipo <ArrowRight size={13} /></a> : null}
      <span className="gx-tools">
        <button type="button" className="gx-help gx-cmd gx-theme" aria-pressed={theme === 'dark'} aria-label="Modo oscuro" title={theme === 'dark' ? 'Volver al modo claro' : 'Cambiar a modo oscuro'} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
        <button type="button" className="gx-help gx-cmd" aria-label="Órdenes" title="Órdenes (Ctrl J)" onClick={openCommands}><Command size={15} aria-hidden="true" /></button>
        {onProtect ? <button type="button" className="gx-help gx-cmd gx-lock" aria-label="Bloquear Plan B" title="Proteger o bloquear Plan B" onClick={onProtect}><Lock size={15} aria-hidden="true" /></button> : null}
        <button type="button" className="gx-help" aria-label="Atajos de teclado" title="Atajos de teclado (?)" onClick={openHelp}>?</button>
      </span>
    </div>
    {copyStale && pageLabel !== 'Continuidad' ? <button type="button" className="gx-mobile-copy-alert" onClick={openContinuity}>
      <Clock3 size={16} aria-hidden="true" />
      <span>Copia activa de {copy.age}</span>
      <strong>Continuidad</strong>
      <ArrowRight size={14} aria-hidden="true" />
    </button> : null}
  </>;
}
