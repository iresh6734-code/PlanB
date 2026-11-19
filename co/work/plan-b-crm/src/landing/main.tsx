import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Database, FlaskConical, Unplug } from 'lucide-react';
import './story.css';

const phases = ['online', 'cut', 'local'] as const;
type Phase = typeof phases[number];
type Entity = 'contacts' | 'deals' | 'tasks';
type Change = 'stage' | 'task';

const phaseDetails = {
  online: { label: 'Operación normal', title: 'Normal', scene: 'El equipo trabaja en HubSpot.', source: 'HubSpot disponible', description: 'Los registros se consultan en el CRM.', action: 'Interrumpir HubSpot' },
  cut: { label: 'CRM no disponible', title: 'Ruptura', scene: 'HubSpot deja de responder.', source: 'Conexión interrumpida', description: 'La fuente principal deja de responder.', action: 'Abrir la copia local' },
  local: { label: 'Continuidad con Plan B', title: 'Continuidad', scene: 'El equipo abre su copia local.', source: 'Copia local en uso', description: 'Ya puedes actualizar una etapa o completar una tarea.', action: 'Ir a la revisión de cambios' },
} as const;

const entityNames: Record<Entity, string> = { contacts: 'Contactos', deals: 'Oportunidades', tasks: 'Tareas' };

const changeDetails = {
  stage: { record: 'Renovación anual · Bruma Estudio', field: 'Etapa', before: 'Propuesta', after: 'Negociación' },
  task: { record: 'Confirmar próxima reunión', field: 'Estado de la tarea', before: 'Pendiente', after: 'Completada' },
} as const;

function Register({ phase, changes, onChange }: {
  phase: Phase;
  changes: Change[];
  onChange: (change: Change) => void;
}) {
  const [entity, setEntity] = useState<Entity>('contacts');
  const local = phase === 'local';
  const stageChanged = local && changes.includes('stage');
  const taskChanged = local && changes.includes('task');

  const rows = {
    contacts: [
      ['Lucía Mora', 'Bruma Estudio', 'Cliente'],
      ['Nora Soler', 'Taller Arrayán', 'Seguimiento'],
      ['Hugo Vidal', 'Norte Cerámica', 'Prospecto'],
    ],
    deals: [
      ['Renovación anual', 'Bruma Estudio', stageChanged ? 'Negociación' : 'Propuesta'],
      ['Nuevo suministro', 'Norte Cerámica', 'Contacto inicial'],
      ['Ampliación de servicio', 'Taller Arrayán', 'En evaluación'],
    ],
    tasks: [
      ['Confirmar próxima reunión', 'Bruma Estudio', taskChanged ? 'Completada' : 'Pendiente'],
      ['Revisar condiciones', 'Norte Cerámica', 'Pendiente'],
      ['Preparar material', 'Taller Arrayán', 'Completada'],
    ],
  };

  return (
    <div className="register">
      <div className="register-top">
        <span><Database size={14} aria-hidden="true" /> Espacio de trabajo</span>
        <span className="demo-label">Datos ficticios</span>
      </div>
      {phase === 'cut' ? (
        <div className="signal-off">
          <div className="broken-signal" aria-hidden="true"><span /><Unplug size={34} strokeWidth={1.3} /><span /></div>
          <strong>HubSpot no responde.</strong>
          <p>Abre la copia local para volver a consultar los registros guardados.</p>
        </div>
      ) : (
        <div className="register-content" key={phase}>
          <div className="entity-switch" role="group" aria-label="Tipo de registro">
            {(Object.keys(entityNames) as Entity[]).map((id) => (
              <button key={id} type="button" aria-pressed={entity === id} onClick={() => setEntity(id)}>{entityNames[id]}</button>
            ))}
          </div>
          <table className="register-table">
            <caption className="visually-hidden">{entityNames[entity]} de la demostración</caption>
            <thead><tr><th scope="col">Registro</th><th scope="col">Empresa</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {rows[entity].map(([name, company, status], index) => (
                <tr key={name} className={index === 0 && ((entity === 'deals' && stageChanged) || (entity === 'tasks' && taskChanged)) ? 'edited' : undefined}>
                  <th scope="row">{name}<small className="company-compact">{company}</small></th>
                  <td>{company}</td><td><span className="row-status">{status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="register-foot">
            <span>{local ? 'Captura del 12 nov 2026 · 09:40' : 'Fuente de esta simulación · HubSpot'}</span>
            {local && entity === 'deals' && (
              <button type="button" className="text-action" onClick={() => onChange('stage')}>{stageChanged ? 'Restaurar etapa' : 'Mover a Negociación'} <ArrowRight size={15} aria-hidden="true" /></button>
            )}
            {local && entity === 'tasks' && (
              <button type="button" className="text-action" onClick={() => onChange('task')}>{taskChanged ? 'Reabrir tarea' : 'Completar tarea'} <Check size={15} aria-hidden="true" /></button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const incoming = 'M-8 117 C70 119 103 86 181 93 L221 99';
const branches = [
  { label: 'Contactos', y: 31, path: 'M250 101 C354 98 383 31 521 31' },
  { label: 'Oportunidades', y: 101, path: 'M250 101 C345 98 419 101 521 101' },
  { label: 'Tareas', y: 171, path: 'M250 101 C354 103 382 171 521 171' },
];

function SignalRoute({ phase }: { phase: Phase }) {
  return (
    <div className="signal-route" aria-hidden="true">
      <svg viewBox="0 0 540 201" preserveAspectRatio="none" fill="none">
        <path key={phase} className="route-live" pathLength="1" d={incoming} />
        {branches.map((branch) => (
          <g key={branch.label}>
            <path className="route-branch" d={branch.path} />
            <circle className="route-terminal" cx="521" cy={branch.y} r="6" />
          </g>
        ))}
        {phase === 'cut' ? (
          <g><path className="route-cut-guide" d="M236 0v201" /><path className="route-break" d="m226 91 20 20m0-20-20 20" /></g>
        ) : <circle className="route-junction" cx="236" cy="101" r="7" />}
      </svg>
      <div className="route-targets">{branches.map(({ label }) => <span key={label}>{label}</span>)}</div>
    </div>
  );
}

function phaseFromRelay(): Phase {
  return document.getElementById('hero-relay')?.classList.contains('is-diverted') ? 'cut' : 'online';
}

function Simulation({ changes, onChange }: { changes: Change[]; onChange: (change: Change) => void }) {
  const [phase, setPhase] = useState<Phase>(phaseFromRelay);
  const stage = useRef<HTMLDivElement>(null);
  const manual = useRef(phase === 'cut');
  const reviewLink = useRef<HTMLAnchorElement>(null);
  const advanceToLocal = useRef(false);
  const current = phaseDetails[phase];

  useEffect(() => {
    const updateFromHero = () => {
      manual.current = true;
      setPhase(phaseFromRelay());
    };
    window.addEventListener('planb:relay-change', updateFromHero);
    return () => window.removeEventListener('planb:relay-change', updateFromHero);
  }, []);

  useEffect(() => {
    const panel = stage.current;
    if (!panel) return;
    const scrollMode = window.matchMedia('(min-width: 960px) and (prefers-reduced-motion: no-preference)');
    let frame = 0;
    function followScroll() {
      if (manual.current || frame || !scrollMode.matches) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (manual.current) return;
        const rect = panel!.getBoundingClientRect();
        const progress = (window.innerHeight * .22 - rect.top) / rect.height;
        if (progress >= 0 && progress < 1) setPhase(phases[Math.floor(progress * phases.length)]);
      });
    }
    window.addEventListener('scroll', followScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', followScroll);
    };
  }, []);

  useEffect(() => {
    if (phase === 'local' && advanceToLocal.current) {
      advanceToLocal.current = false;
      reviewLink.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  function choose(next: Phase) {
    manual.current = true;
    setPhase(next);
  }

  function advance() {
    if (phase === 'online') choose('cut');
    if (phase === 'cut') {
      advanceToLocal.current = true;
      choose('local');
    }
  }

  return (
    <section className="simulation" id="simulador" aria-labelledby="sim-title" tabIndex={-1}>
      <div className="wrap section-inner">
        <div className="scenario">
          <div className="section-intro simulation-intro">
            <p className="panel-kicker">El momento de la ruptura</p>
            <h2 id="sim-title"><span>El</span>{' '}<span>minuto</span>{' '}<span>cero.</span></h2>
            <p className="panel-description">HubSpot deja de responder. Con Plan B, el equipo puede abrir una copia preparada y retomar el trabajo. Prueba el recorrido.</p>
          </div>
          <div className="scenario-stage" ref={stage}>
            <div className="console" data-phase={phase}>
              <div className="phase-description" aria-live="polite" aria-atomic="true">
                <strong><span className="signal-dot" aria-hidden="true" />{current.source}</strong>
                <p>{current.description}</p>
              </div>
              <SignalRoute phase={phase} />
              <Register phase={phase} changes={changes} onChange={onChange} />
              <div className="console-footer">
                {phase === 'local' ? (
                  <a ref={reviewLink} href="#recuperacion" className="action console-action">{current.action}<ArrowDown size={16} aria-hidden="true" /></a>
                ) : (
                  <button type="button" className="action console-action" onClick={advance}>{current.action}<ArrowRight size={16} aria-hidden="true" /></button>
                )}
                <span className="console-counter" role="status">{changes.length === 1 ? '1 cambio local en la simulación' : `${changes.length} cambios locales en la simulación`}</span>
              </div>
            </div>
          </div>
          <fieldset className="phase-picker">
            <legend className="visually-hidden">Estado de la operación</legend>
            {phases.map((id, index) => (
              <label className="phase-option" key={id} data-chapter={id}>
                <input type="radio" name="continuity-phase" aria-label={phaseDetails[id].label} value={id} checked={phase === id} onClick={() => { manual.current = true; }} onChange={() => choose(id)} />
                <span className="phase-light" aria-hidden="true">{index + 1}</span>
                <span className="chapter-label"><strong className="chapter-title">{phaseDetails[id].title}</strong><span className="chapter-copy">{phaseDetails[id].scene}</span></span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </section>
  );
}

const checks = ['Abrir la copia aislada', 'Comprobar registros y relaciones', 'Guardar y verificar un cambio'] as const;

function Preparation() {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [step, setStep] = useState<number | null>(null);
  const running = step !== null && step < checks.length;
  const complete = step === checks.length;

  useEffect(() => {
    function openFromLink() {
      if (window.location.hash === '#preparacion' && disclosure.current) disclosure.current.open = true;
    }
    openFromLink();
    window.addEventListener('hashchange', openFromLink);
    return () => window.removeEventListener('hashchange', openFromLink);
  }, []);

  useEffect(() => {
    if (step === null || step >= checks.length) return;
    const timer = window.setTimeout(() => setStep(step + 1), 420);
    return () => window.clearTimeout(timer);
  }, [step]);

  function rehearse() {
    if (running) return;
    setStep(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? checks.length : 0);
  }

  return (
    <details className="preparation-disclosure" id="preparacion" ref={disclosure}>
      <summary>Ensayar una copia <span className="disclosure-mark" aria-hidden="true" /></summary>
      <section className="section-inner preparation" aria-labelledby="prep-title">
        <div className="section-index"><span>Preparación y simulacro</span></div>
        <div className="section-intro">
          <h2 id="prep-title">Antes de que <em>haga falta.</em></h2>
          <p>Guarda una captura de HubSpot y usa «Probar mi Plan B» para comprobar esa copia en un entorno aislado.</p>
        </div>
        <div className="field-sheet">
          <div className="field-record">
            <div className="field-header"><Database size={21} strokeWidth={1.55} aria-hidden="true" /><h3>Captura guardada</h3><span>Ejemplo</span></div>
            <dl className="field-list">
              <div><dt>Origen</dt><dd>HubSpot · Bruma Estudio</dd></div>
              <div><dt>Guardada</dt><dd><time dateTime="2026-11-12T09:40:00+01:00">12 nov 2026 · 09:40</time></dd></div>
              <div><dt>Disponible en</dt><dd>Este equipo</dd></div>
              <div><dt>Alcance</dt><dd>Contactos, empresas, oportunidades, tareas y datos compatibles relacionados</dd></div>
            </dl>
          </div>
          <div className="sheet-connection" aria-hidden="true"><span /><ArrowRight size={23} strokeWidth={1.4} /></div>
          <div className="field-record rehearsal" data-complete={complete}>
            <div className="field-header"><FlaskConical size={21} strokeWidth={1.55} aria-hidden="true" /><h3>Simulacro aislado</h3></div>
            <ol className="rehearsal-checks">
              {checks.map((check, index) => {
                const passed = step !== null && index < step;
                return <li key={check} data-passed={passed}><span className="check-light" aria-hidden="true">{passed && <Check size={12} />}</span>{check}</li>;
              })}
            </ol>
            <div className="rehearsal-controls">
              <button type="button" className="text-action" aria-disabled={running} onClick={rehearse}>
                {complete ? 'Repetir el ejemplo' : 'Ensayar el ejemplo'} <ArrowRight size={16} aria-hidden="true" />
              </button>
              <span role="status">{complete ? 'Simulacro de ejemplo superado' : running ? 'Comprobación en curso' : 'Prueba con datos ficticios'}</span>
            </div>
          </div>
        </div>
        <div className="section-link">
          <a className="text-action" href="/continuidad">Abrir Continuidad en Plan B <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className="text-action" href="#alcance">Ver qué incluye la copia <ArrowDown size={16} aria-hidden="true" /></a>
        </div>
      </section>
    </details>
  );
}

const copyScope = [
  ['Contactos y empresas', 'Fichas y relaciones guardadas.', 'Abre las fichas de la captura y consulta sus datos y relaciones compatibles. Si un dato cambió en HubSpot después de guardarla, la copia conserva el valor que tenía al capturar.'],
  ['Oportunidades', 'Etapa, importe y relaciones.', 'Consulta la etapa, el importe y las relaciones que se hayan guardado. Desde la copia activa puedes actualizar una etapa compatible y conservar ese cambio para revisarlo más tarde.'],
  ['Tareas', 'Vencimientos y estado de las tareas.', 'Consulta los vencimientos disponibles y completa las tareas compatibles. Puedes retomar un seguimiento con la información que tengas guardada.'],
  ['Cambios en la copia', 'Historial de lo que hizo el equipo.', 'El historial recoge los cambios hechos en Plan B durante la interrupción. Al volver a HubSpot, puedes consultar el valor anterior y el nuevo antes de decidir qué trasladar.'],
] as const;

const coverageArt = new URL('../assets/landing/coverage-wall.webp', import.meta.url).href;
const returnArt = new URL('../assets/landing/return-signal.webp', import.meta.url).href;

function Coverage() {
  return (
    <section className="coverage" id="alcance" aria-labelledby="coverage-title" tabIndex={-1}>
      <div className="wrap coverage-inner">
        <div className="coverage-layout">
          <div className="section-intro">
            <p className="panel-kicker">Después del corte</p>
            <h2 id="coverage-title">Qué puedes recuperar.</h2>
            <p className="panel-description">Retoma el trabajo con la información de la última captura que hayas preparado. Comprueba en el simulacro qué datos necesitas tener a mano.</p>
            <img className="coverage-art" src={coverageArt} width={960} height={520} loading="lazy" decoding="async" alt="" />
          </div>
          <div className="coverage-list">
            {copyScope.map(([title, lead, content]) => (
              <details name="copy-scope" key={title}>
                <summary><span><strong>{title}</strong><small>{lead}</small></span><span className="disclosure-mark" aria-hidden="true" /></summary>
                <p>{content}</p>
              </details>
            ))}
          </div>
        </div>
        <Preparation />
      </div>
    </section>
  );
}

function Recovery({ changes }: { changes: Change[] }) {
  return (
    <div className="return-scene">
      <img className="closing-art" src={returnArt} alt="" width={1260} height={840} loading="lazy" decoding="async" />
      <section className="recovery" id="recuperacion" aria-labelledby="recovery-title" tabIndex={-1}>
        <div className="wrap section-inner">
          <h2 className="panel-kicker" id="recovery-title">Del corte a la continuidad</h2>
          <div className="recovery-ledger">
            <div className="ledger-header"><span>En la captura</span><span>En la copia local</span></div>
            <ul aria-label="Comparación de valores">
              {(changes.length ? changes : ['stage', 'task'] as const).map((id) => {
                const change = changeDetails[id];
                return (
                  <li className="ledger-row" key={id}>
                    <div className="ledger-value"><strong>{change.record}</strong><span>{change.before}</span></div>
                    <div className="ledger-value ledger-after"><strong>{change.record}</strong><span>{change.after}</span></div>
                  </li>
                );
              })}
            </ul>
            <p className="ledger-note">{changes.length ? 'Tu simulación.' : 'Ejemplo de comparación.'} Revisa los cambios antes de trasladarlos al CRM.</p>
          </div>
          <div className="section-link"><a className="text-action" href="/continuidad/cambios">Abrir Cambios en Plan B <ArrowUpRight size={17} aria-hidden="true" /></a></div>
        </div>
      </section>
      <section className="closing" aria-labelledby="cierre-titulo">
        <div className="wrap closing-inner">
          <h2 id="cierre-titulo">Que te encuentre <em>preparado.</em></h2>
          <div className="closing-cta">
            <a className="action action-signal" href="/ajustes/preparacion">Abrir Preparación <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContinuityStory() {
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    const target = document.getElementById(fragment);
    if (target?.closest('#continuity-story')) target.scrollIntoView({ behavior: 'instant' });

    const header = document.querySelector<HTMLElement>('.site-header');
    const firstPanel = document.getElementById('simulador');
    const lastPanel = document.getElementById('alcance');
    if (!header || !firstPanel || !lastPanel) return;
    let frame = 0;
    const updateTone = () => {
      frame = 0;
      const y = header.offsetHeight / 2;
      const paper = firstPanel.getBoundingClientRect().top <= y && lastPanel.getBoundingClientRect().bottom > y;
      header.dataset.tone = paper ? 'paper' : 'dark';
    };
    const scheduleTone = () => {
      if (!frame) frame = requestAnimationFrame(updateTone);
    };
    updateTone();
    window.addEventListener('scroll', scheduleTone, { passive: true });
    window.addEventListener('resize', scheduleTone);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleTone);
      window.removeEventListener('resize', scheduleTone);
    };
  }, []);

  function toggleChange(change: Change) {
    setChanges((current) => current.includes(change) ? current.filter((item) => item !== change) : [...current, change]);
  }

  return <><Simulation changes={changes} onChange={toggleChange} /><Coverage /><Recovery changes={changes} /></>;
}

createRoot(document.getElementById('continuity-story')!).render(<StrictMode><ContinuityStory /></StrictMode>);
