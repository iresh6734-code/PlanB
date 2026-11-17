import { ArrowRight, Clock3, Command, Lock, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme.js';
import type { AppState } from '../../shared/model.js';
import { describeCapture } from './workspace-copy.js';
import './mobile-copy-alert.css';

/** Barra superior: dónde estás, antigüedad de la copia (ámbar a partir de 75 minutos, el mismo umbral que avisa Continuidad) y modo de datos. */
export function TopBar({ state, pageLabel, teamOrigin, openContinuity, openHelp, openCommands, onProtect }: { state: AppState; pageLabel: string; teamOrigin: string | null; openContinuity: () => void; openHelp: () => void; openCommands: () => void;
  /** Proteger o bloquear Plan B: una acción, no un lugar, así que vive aquí y no en el menú (CLAUDE-UI-NAV-LAB). */ onProtect?: () => void }) {
  const [theme, toggleTheme] = useTheme();
  const copy = describeCapture(state.snapshot?.capturedAt);
  const copyStale = state.ready && !state.runtime && copy.stale;
  const copyLabel = state.ready ? 'Copia activa' : 'Captura importada';
  return <>
    <div className="workspace-context gx-topbar">
      <span>Espacio local</span>
      <strong>{state.snapshot?.name ?? 'Preparación de tu copia'}</strong>
      <span className="gx-crumb" aria-hidden="true">{pageLabel}</span>
      {state.snapshot ? <button type="button" className={'gx-copy ' + (state.disconnected ? 'independent' : '')} data-stale={copyStale ? 'true' : undefined} title={copyLabel + ': ' + (copy.date ?? 'fecha no disponible') + '. Abrir Continuidad'} onClick={openContinuity}>
        <i className="dot" />{copyLabel} · {copy.age ?? 'fecha no disponible'}
        {state.changes ? <b>{state.changes} {state.changes === 1 ? 'cambio' : 'cambios'}</b> : null}
      </button> : null}
      <button type="button" className="gx-help gx-cmd gx-theme" aria-pressed={theme === 'dark'} aria-label="Modo oscuro" title={theme === 'dark' ? 'Volver al modo claro' : 'Cambiar a modo oscuro'} onClick={toggleTheme}>
        {theme === 'dark' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
        <span>{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
      </button>
      <button type="button" className="gx-help gx-cmd" aria-label="Órdenes" title="Órdenes (Ctrl J)" onClick={openCommands}><Command size={13} aria-hidden="true" /></button>
      {onProtect ? <button type="button" className="gx-help gx-cmd gx-theme gx-lock" aria-label="Bloquear Plan B" title="Proteger o bloquear Plan B" onClick={onProtect}><Lock size={13} aria-hidden="true" /><span>Bloquear</span></button> : null}
      <button type="button" className="gx-help" aria-label="Atajos de teclado" title="Atajos de teclado (?)" onClick={openHelp}>?</button>
      <span>{teamOrigin ? <a className="text-button" href={teamOrigin + '/team?view=commercial'}>Espacio de equipo <ArrowRight size={13} /></a> : state.snapshot?.source.isTestData === false ? 'Producción · lectura' : 'Datos de prueba'}</span>
    </div>
    {copyStale && pageLabel !== 'Continuidad' ? <button type="button" className="gx-mobile-copy-alert" onClick={openContinuity}>
      <Clock3 size={16} aria-hidden="true" />
      <span>Copia activa de {copy.age}</span>
      <strong>Continuidad</strong>
      <ArrowRight size={14} aria-hidden="true" />
    </button> : null}
  </>;
}
