import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Pin, PinOff, ShieldCheck, X } from 'lucide-react';
import { validateRecord, type AppState, type CrmRecord, type EntityName, type FieldValue } from '../shared/model.js';
import { api, post } from './api.js';
import { Brand, Modal, RecordDrawer, Spinner, recordName } from './components.js';
import { Protection } from './Protection.js';
import { type PageId, rememberPlace, storedEntity, storedPage } from './app-shell/session.js';
import { useShortcuts } from './app-shell/useShortcuts.js';
import { fallbackPage, labVisible } from './app-shell/navigation.js';
import { pathOf, pendingStillWanted, placeOf } from './app-shell/routes.js';
import { useBoardLoader, useRecordListLoader, useRecordListState } from './app-shell/useRecordList.js';
import { useDealPulse } from './app-shell/useDealPulse.js';
import { runBulk, type BulkItem, type BulkResult } from './app-shell/bulk-edit.js';
import { RecordsPage } from './app-shell/RecordsPage.js';
import { Sidebar } from './app-shell/Sidebar.js';
import { TopBar } from './app-shell/TopBar.js';
import { describeCapture } from './app-shell/workspace-copy.js';
import { RelatedPanel } from './app-shell/RelatedPanel.js';
import { DealSummary } from './app-shell/DealSummary.js';
import { RecordSummary } from './app-shell/RecordSummary.js';
import { linkedPreset, taskPreset } from './app-shell/task-preset.js';
import { canLogActivity } from './app-shell/task-preset.js';
import { CommandPalette, type PaletteAsk } from './app-shell/CommandPalette.js';
import type { ListPage } from './app-shell/pager.js';
import { useRecordShortcuts } from './app-shell/useRecordShortcuts.js';
import { PINNED_MAX } from './app-shell/recents.js';
import type { FocusScope } from './app-shell/FocusRun.js';
import { DueReminder } from './app-shell/DueReminder.js';
import { endContingency, startContingency, type IncidentWindow } from './app-shell/contingency.js';
import { useContingency } from './app-shell/useContingency.js';
import { MobileNav } from './app-shell/MobileNav.js';
import type { Command } from './app-shell/commands.js';
import { currentDensity, toggleDensity, toggleTheme } from './app-shell/theme.js';
import { LocalOperations, type OpenTaskRequest } from './LocalOperations.js';
import { OutcomesLockNotice, TaskOutcomesHost, TaskOutcomesSurface, addLockSummary, type TaskOutcomesControl } from './TaskOutcomesHost.js';
import { WorkspaceSearch } from './WorkspaceSearch.js';
import { RehearsalTodayEntry } from './RehearsalTodayEntry.js';
import { HomeOverview } from './HomeOverview.js';
import { advanceDrill, drillHandoffNote, startDrill, type DrillState, type DrillStepId } from './app-shell/guided-drill.js';
import { continuityAlerts, type AlertTarget, type ContinuityAlert } from './app-shell/continuity-alerts.js';
import { readinessFor } from './app-shell/continuity-insights.js';
import type { ContinuityTab } from './ContinuityHome.js';
import type { ContinuityStatus } from '../shared/operations.js';
// Apartados que se descargan al visitarlos por primera vez (misma interfaz de uso que los originales).
import { Agenda, ChangesView, ContingencyBand, ContinuityHome, CsvImport, DateCheck, DecisionReview, FocusRun, GuidedDrill, LicensePanel, LocalIntegrations, OperationalRehearsal, OutageLab, PortableExport, Preparation, QuickActivity, RadarHost, RecordTimeline, SequencePicker, Settings, ShortcutsHelp, TeamSync, WeeklyReview, WhatsNew } from './app-shell/lazy-pages.js';
import type { WorkspaceSearchContext } from '../shared/workspace-search.js';

type LocalAppState = AppState & { workspaceSearchContext?: WorkspaceSearchContext | null };

class SupersededStateRead extends Error {
  constructor() { super('Otra consulta sustituyó esta lectura. Reintenta la actualización.'); }
}

export default function App() {
  const [state, setState] = useState<LocalAppState | null>(null);
  // Lista de registros (búsqueda, página, embudo, filas y relacionados): ver app-shell/useRecordList.ts.
  const list = useRecordListState();
  const { records, setRecords, query, setQuery, offset, setOffset, pipeline, setPipeline, rows, total, loading: recordsLoading, error: recordsError, setView: setServerView, facets } = list;
  // Dirección inicial (B1): /clientes/<id>, /continuidad/cambios… abre ese lugar; la raíz abre el apartado recordado.
  const [initialPlace] = useState(() => typeof location === 'undefined' ? null : placeOf(location.pathname));
  const [page, setPage] = useState<PageId>(() => initialPlace?.page ?? storedPage());
  const [rehearseFromToday, setRehearseFromToday] = useState<string | null>(null);
  const [integrationsFrom, setIntegrationsFrom] = useState<'continuity' | null>(null), [returnedFrom, setReturnedFrom] = useState<'integrations' | 'drill' | null>(null), [drillNote, setDrillNote] = useState<string | null>(null);
  useEffect(() => { if (page !== 'integrations') setIntegrationsFrom(null); }, [page]);
  const [entityName, setEntity] = useState<EntityName>(() => initialPlace?.entity ?? storedEntity());
  // Ficha pedida por la dirección (al cargar o con Atrás/Adelante): se abre cuando la copia está lista.
  const [pendingRecord, setPendingRecord] = useState<{ entity: EntityName; id: string } | null>(() => initialPlace?.recordId && initialPlace.entity ? { entity: initialPlace.entity, id: initialPlace.recordId } : null);
  const urlSynced = useRef(false), fromHistory = useRef(false);
  useEffect(() => { rememberPlace(page, entityName); }, [page, entityName]);
  const [signals, setSignals] = useState<{ overdue: number | null; atRisk: number | null }>({ overdue: null, atRisk: null });
  // Avisos de la copia para el menú: se calculan con el estado que Inicio o Continuidad ya han leído (sin otra lectura).
  const [copyAlerts, setCopyAlerts] = useState<ContinuityAlert[] | null>(null), [continuityTab, setContinuityTab] = useState<ContinuityTab | null>(null);
  const [continuityStatus, setContinuityStatus] = useState<ContinuityStatus | null>(null);
  const receiveContinuity = useCallback((status: ContinuityStatus) => { setContinuityStatus(status); const next = continuityAlerts(status, new Date()); setCopyAlerts(current => current && JSON.stringify(current) === JSON.stringify(next) ? current : next); }, []);
  const [help, setHelp] = useState(false);
  useEffect(() => { if (page !== 'continuity') setContinuityTab(null); }, [page]);
  const [commandsOpen, setCommandsOpen] = useState(false), [paletteText, setPaletteText] = useState('');
  const [focusOpen, setFocusOpen] = useState<false | FocusScope>(false);
  const [preparationOpen,setPreparationOpen]=useState(false);
  // En la tira de navegación móvil, el apartado activo queda siempre a la vista.
  useEffect(()=>{if(typeof window==='undefined'||!window.matchMedia?.('(max-width: 760px)').matches)return;const frame=requestAnimationFrame(()=>document.querySelector('.sidebar [aria-current="page"]')?.scrollIntoView({inline:'center',block:'nearest'}));return()=>cancelAnimationFrame(frame);},[page,entityName]);
  const [teamOrigin,setTeamOrigin]=useState<string|null>(null);
  useEffect(()=>{if(!state||state.runtime)return;let active=true;void api<{origin:string|null}>('/v6/workspace').then(value=>{if(active)setTeamOrigin(value.origin);}).catch(()=>{});return()=>{active=false;};},[state?.runtime]);
  const [step, setStep] = useState(0);
  const [connectRequest,setConnectRequest]=useState(0);
  const [selected, setSelected] = useState<CrmRecord | 'new' | null>(null);
  // «Nueva tarea» desde la ficha de un cliente u oportunidad: la tarea nueva empieza enlazada a ellos.
  const [preset, setPreset] = useState<Record<string, FieldValue> | null>(null);
  const selectedId = selected && selected !== 'new' ? selected.id : undefined;
  const [globalSearch, setGlobalSearch] = useState(false);
  // Ensayo guiado «Un día sin CRM»: solo observa lo que la persona hace (apartado, búsqueda, ficha); no guarda nada y se pierde al cerrar.
  const [drill, setDrill] = useState<DrillState | null>(null);
  useEffect(() => { setDrill(current => current ? advanceDrill(current, { page, entity: entityName, query, searchOpen: globalSearch, recordOpen: selected && selected !== 'new' ? selected.entity : null }, Date.now()) : current); }, [page, entityName, query, globalSearch, selected]);
  const [auth,setAuth]=useState<'loading'|'open'|'locked'|'setup'>('loading');
  const [dataRevision,setDataRevision]=useState(0);
  const [lockEpoch,setLockEpoch]=useState(0);
  // Solo un RECUENTO de lo que quedó sin resolver al bloquear (el seguimiento detallado vive en memoria y se pierde): sin textos de tareas ni borradores.
  const [lockedOutcomes,setLockedOutcomes]=useState<{notDispatched:number;dispatched:number}|null>(null);
  const [lockFailed,setLockFailed]=useState(false);
  const outcomesControl=useRef<TaskOutcomesControl|null>(null);
  const [taskRequest,setTaskRequest]=useState<OpenTaskRequest|null>(null);
  // F5 · Recientes y anclados de la copia abierta (solo tipo e ID en este navegador; los nombres se leen de la copia).
  const shortcutScope = state?.ready && state.snapshot ? state.snapshot.id : '';
  const recordShortcuts = useRecordShortcuts(shortcutScope, auth === 'open', String(dataRevision) + ':' + String(state?.changes ?? 0));
  const rememberRecord = recordShortcuts.remember;
  useEffect(() => { if (selected && selected !== 'new' && shortcutScope) rememberRecord({ entity: selected.entity, id: selected.id }); }, [selected && selected !== 'new' ? selected.entity + ':' + selected.id : '', shortcutScope]);
  // R1 · Modo contingencia (lo activa la persona) y R2 · aviso de cierre con el expediente del incidente.
  const contingency = useContingency();
  const [closedIncident, setClosedIncident] = useState<IncidentWindow | null>(null);
  const refreshSequence = useRef(0);
  const accessSequence = useRef(0);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && auth === 'open' && state?.ready && !selected && !document.querySelector('[role="dialog"]')) { event.preventDefault(); setGlobalSearch(true); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [auth, state?.ready, selected]);
  useEffect(() => { if (auth !== 'open' || !state?.ready) setGlobalSearch(false); }, [auth, state?.ready]);
  const [modal, setModal] = useState<'settings' | 'coverage' | 'csv' | null>(null);
  // Laboratorio (Radar y «Comprobar una fecha»): solo sin copia o con una copia de datos de prueba (decisión del usuario, 17/11/2026).
  const lab = labVisible({ testData: state?.snapshot?.source.isTestData !== false });
  useShortcuts({ active: auth === 'open' && !!state, ready: !!state?.ready, runtime: !!state?.runtime, lab, blocked: !!selected, onRecords: page === 'workspace',
    openEntity: entity => openEntity(entity), go: next => { setPage(next); setSelected(null); }, openHelp: () => setHelp(true), openSearch: () => setGlobalSearch(true), newRecord: () => setSelected('new'), openCommands: () => setCommandsOpen(true), openFocus: scope => setFocusOpen(scope) });
  // Un apartado recordado que no existe en esta copia (el Laboratorio sin datos de prueba; Hoy, Propuestas, Integraciones o copia de equipo
  // en una copia restaurada) vuelve a Inicio.
  // La dirección sigue al lugar: la primera vez se sustituye (no añade historial); después, cada cambio es una entrada nueva,
  // salvo cuando el cambio viene de Atrás/Adelante. Mientras se abre una ficha pedida por la dirección no se toca.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history || auth !== 'open' || pendingRecord) return;
    const path = pathOf({ page, entity: entityName, recordId: page === 'workspace' ? selectedId : undefined });
    if (path === window.location.pathname) { urlSynced.current = true; fromHistory.current = false; return; }
    if (!urlSynced.current || fromHistory.current) window.history.replaceState(null, '', path); else window.history.pushState(null, '', path);
    urlSynced.current = true; fromHistory.current = false;
  }, [page, entityName, selectedId, auth, pendingRecord]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      const place = placeOf(window.location.pathname); if (!place) return;
      fromHistory.current = true;
      // Atrás/Adelante sustituye siempre la lectura pendiente por la del nuevo destino (o por ninguna).
      setPendingRecord(place.page === 'workspace' && place.entity && place.recordId ? { entity: place.entity, id: place.recordId } : null);
      if (place.page === 'workspace' && place.entity) openEntity(place.entity);
      else { setPage(place.page); setSelected(null); }
    };
    window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Si la persona se va a otro lugar o abre otra ficha antes de que llegue la pedida, la lectura se retira (R2 411, R3 427).
  useEffect(() => { if (pendingRecord && !pendingStillWanted(pendingRecord, { page, entity: entityName, selected: selected === 'new' ? 'new' : selectedId ?? null })) setPendingRecord(null); }, [page, entityName, selected, selectedId, pendingRecord]);
  useEffect(() => {
    if (!pendingRecord || auth !== 'open' || !state?.ready) return;
    let active = true; const wanted = pendingRecord;
    api<{ record: CrmRecord }>('/v2/records/' + wanted.entity + '/' + encodeURIComponent(wanted.id))
      .then(result => { if (!active) return; setPage('workspace'); setEntity(wanted.entity); setRecords([result.record]); setSelected(result.record); })
      .catch(() => { if (active) setError('No se encontró esa ficha en tu copia. Puede que se haya restaurado otra captura.'); })
      .finally(() => { if (active) setPendingRecord(null); });
    return () => { active = false; };
  }, [pendingRecord, auth, state?.ready]);
  useEffect(() => { if (!state) return; const next = fallbackPage(page, { runtime: !!state.runtime, testData: state.snapshot?.source.isTestData !== false, ready: !!state.ready }); if (next) setPage(next); }, [state?.runtime, state?.snapshot?.source.isTestData, state?.ready, page]);

  const [notice, setNotice] = useState('');
  // Último guardado que se puede deshacer desde el aviso (solo ediciones; el servidor comprueba que sigue siendo el último cambio).
  const [undoable, setUndoable] = useState<{ changeId: number; at: string; copy: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<{ checks: { id: string; label: string; passed: boolean }[] } | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const sequence = ++refreshSequence.current;
    let next: LocalAppState;
    try { next = await api<LocalAppState>('/v2/state', { signal }); }
    catch (failure) { if (sequence !== refreshSequence.current) throw new SupersededStateRead(); throw failure; }
    if (sequence !== refreshSequence.current) throw new SupersededStateRead();
    signal?.throwIfAborted();
    setState(next);setDataRevision(r=>r+1);return next;
  }, []);
  useEffect(() => {
    const check=()=>{
      const sequence=++accessSequence.current;
      return api<{configured:boolean;authenticated:boolean}>('/v2/auth/status').then(async gate=>{
        if(sequence!==accessSequence.current)return;
        if(!gate.authenticated){refreshSequence.current++;setAuth('locked');setLoading(false);return;}
        setAuth('open');const next=await refresh();
        if(sequence!==accessSequence.current)return;
        setStep(next.candidate?.spec?2:next.spec?2:next.snapshot?1:0);setLoading(false);
      }).catch(f=>{if(sequence!==accessSequence.current||f instanceof SupersededStateRead)return;setError(f.message);setLoading(false);});
    };
    void check();const lock=()=>{setLockEpoch(epoch=>epoch+1);void check();};window.addEventListener('planb:locked',lock);
    return()=>{accessSequence.current++;refreshSequence.current++;window.removeEventListener('planb:locked',lock);};
  }, [refresh]);
  useRecordListLoader(list, { active: auth === 'open' && page === 'workspace' && !!state?.ready, entity: entityName, revision: dataRevision, onError: setError });
  const board = useBoardLoader({ active: auth === 'open' && page === 'workspace' && !!state?.ready && entityName === 'deals', query, pipeline, revision: dataRevision });
  const pulse = useDealPulse({ active: auth === 'open' && page === 'workspace' && !!state?.ready && entityName === 'deals', spec: state?.spec, revision: dataRevision });
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => { setNotice(''); setUndoable(null); }, undoable ? 8000 : 5000); return () => clearTimeout(timer);
  }, [notice, undoable]);
  useEffect(() => {
    if (!selected) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [selected]);
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true); setError('');
    try { await fn(); await refresh(); if (message) setNotice(message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  const openEntity = (id: EntityName) => { setEntity(id); setSelected(null); setPreset(null); list.reset();setDataRevision(r=>r+1); setPage('workspace'); };
  const openPreparation = (nextStep?: number) => { setPage('prepare'); setSelected(null); setPreparationOpen(true); if(nextStep!==undefined)setStep(nextStep); };
  const viewCoverage = async () => {
    setModal('coverage'); setProbe(null);
    try { setProbe(await post('/probe', {})); } catch (failure) { setError((failure as Error).message); }
  };
  const protect=async()=>{
    // Se SELLA la frontera de despacho al INICIAR el cierre, antes de cualquier espera de red: un guardado que seguía en su comprobación previa no puede salir mientras el bloqueo viaja.
    const outcomes=outcomesControl.current;outcomes?.seal();
    try{
      const gate=await api<{configured:boolean}>('/v2/auth/status');
      if(gate.configured){await post('/v2/auth/lock',{});accessSequence.current++;refreshSequence.current++;setAuth('locked');}
      else{accessSequence.current++;refreshSequence.current++;setAuth('setup');}
    }catch(failure){
      // El cierre no se completó: el propietario sellado NO se reactiva; empieza uno nuevo y vacío y la persona ve qué quedó sellado y cómo reintentar.
      outcomes?.resume();setError(failure instanceof Error?failure.message:'No se pudo bloquear Plan B.');
    }
  };

  if(auth==='locked'||auth==='setup')return <Protection key={lockEpoch} setup={auth==='setup'} cancel={auth==='setup'?()=>setAuth('open'):undefined} done={async()=>{const sequence=++accessSequence.current;await refresh();if(sequence!==accessSequence.current)throw new SupersededStateRead();setAuth('open');}}/>;
  if (loading||auth==='loading') return <main className="loading-page"><Brand /><Spinner text="Abriendo tu copia local…" /></main>;
  if (!state) return <main className="loading-page"><Brand /><p role="alert">{error || 'No se puede conectar con el servidor local.'}</p><button className="button primary" onClick={() => location.reload()}>Volver a intentar</button></main>;
  const openTaskFromOutcomes=(taskId:string,attemptId?:string)=>{setPage('today');setSelected(null);setTaskRequest(previous=>({taskId,attemptId:attemptId??null,nonce:(previous?.nonce??0)+1}));};
  const spec = state.spec;
  const entity = spec?.entities.find(e => e.id === entityName);
  // Un aviso de la copia lleva a donde se arregla: Exportar o la pestaña de Continuidad que toca. La pestaña pedida solo vale para esa visita.
  // El foco sigue a la persona: a la pestaña pedida o, en Exportar, al contenido principal. La página se carga aparte, así que se espera a que exista.
  const focusWhenReady = (id: string, tries = 20) => { const node = document.getElementById(id); if (node) node.focus(); else if (tries > 0) setTimeout(() => focusWhenReady(id, tries - 1), 50); };
  const openAlert = (target: AlertTarget) => { setSelected(null); if (target === 'export') { setPage('export'); focusWhenReady('main-content'); return; } setContinuityTab(target); setPage('continuity'); focusWhenReady('ct-tab-' + target); };
  const copySignal = copyAlerts && copyAlerts.length ? { count: copyAlerts.length, tone: copyAlerts.some(alert => alert.tone === 'danger') ? 'danger' as const : 'warn' as const, titles: copyAlerts.map(alert => alert.title) } : null;
  const readinessDot = readinessFor(state, continuityStatus, new Date());
  const pageLabel = page==='workspace'?(entity?.label??'Trabajar'):({home:'Inicio',today:'Hoy',week:'Revisión semanal',agenda:'Agenda',changes:'Cambios',agents:'Propuestas',radar:'Laboratorio · Radar','date-check':'Laboratorio · Comprobar una fecha','outage-lab':'Laboratorio · ¿Y si cae…?',continuity:'Continuidad','team-sync':'Copia de equipo',export:'Exportar',integrations:'Integraciones',prepare:'Preparación',plan:'Plan y licencia'} as Record<string,string>)[page]??'';
  // Mover una oportunidad de etapa desde el tablero: misma validación y mismo guardado que la ficha. Devuelve el motivo si no se puede.
  // Cambiar un campo desde la tabla o el tablero: misma validación y mismo guardado que la ficha. Devuelve el motivo si no se puede.
  // Escribir un campo con la validación de la ficha, sin refrescar: lo usan el guardado suelto y el cambio en bloque.
  const writeField = async (record: CrmRecord, key: string, value: string | null): Promise<{ reason: string | null; change?: { id: number; at: string; copy: string } | null }> => {
    if (!spec) return { reason: 'La aplicación todavía no está lista.' };
    const next: CrmRecord = { ...record, values: { ...record.values, [key]: value } };
    const issues = validateRecord(spec, next, record);
    if (Object.keys(issues).length) return { reason: Object.values(issues)[0] };
    try { const result = await api<{ change?: { id: number; at: string; copy: string } | null }>('/records/' + record.entity + '/' + encodeURIComponent(record.id), { method: 'PATCH', body: JSON.stringify({ values: next.values }) }); return { reason: null, change: result.change ?? null }; }
    catch (failure) { return { reason: failure instanceof Error ? failure.message : 'No se pudo guardar el cambio.' }; }
  };
  const saveField = async (record: CrmRecord, key: string, value: string | null): Promise<string | null> => {
    const written = await writeField(record, key, value); if (written.reason) return written.reason;
    try { await refresh(); setUndoable(written.change ? { changeId: written.change.id, at: written.change.at, copy: written.change.copy } : null); setNotice('Guardado en tu copia local.'); return null; }
    catch (failure) { return failure instanceof Error ? failure.message : 'No se pudo guardar el cambio.'; }
  };
  // Cambio en bloque (V3): uno a uno y un solo refresco al final. El «Deshacer» suelto deja de valer: ya no es el último cambio.
  const saveMany = async (items: BulkItem[], onProgress?: (handled: number, total: number) => void, signal?: AbortSignal): Promise<BulkResult> => {
    const result = await runBulk(items, async item => (await writeField(item.record, item.key, item.after)).reason, { signal, onProgress });
    if (result.done.length) { setUndoable(null); try { await refresh(); } catch { /* la lista se pondrá al día en el siguiente refresco */ } }
    return result;
  };
  const moveDeal = (record: CrmRecord, stageId: string) => saveField(record, spec?.roles?.stage ?? 'dealstage', stageId);
  // Crear una tarea desde Despachar (seguimiento, H2): misma validación y mismo alta que la ficha nueva.
  const createTask = async (values: Record<string, FieldValue>): Promise<string | null> => {
    if (!spec) return 'La aplicación todavía no está lista.';
    const issues = validateRecord(spec, { entity: 'tasks', id: 'new', values }, null);
    if (Object.keys(issues).length) return Object.values(issues)[0];
    try { await api('/records/tasks', { method: 'POST', body: JSON.stringify({ values }) }); }
    catch (failure) { return failure instanceof Error ? failure.message : 'No se pudo crear la tarea.'; }
    setUndoable(null);
    try { await refresh(); } catch { /* la lista se pondrá al día en el siguiente refresco */ }
    setNotice('Tarea de seguimiento creada en tu copia local.'); return null;
  };
  const undoLast = async () => {
    const target = undoable; if (!target) return;
    setUndoable(null); setNotice('');
    try { await post('/v2/changes/undo-last', target); await refresh(); setNotice('Cambio deshecho. Queda anotado en Cambios.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo deshacer el cambio.'); }
  };
  // Órdenes de la paleta (Ctrl J): las mismas acciones que ya ofrecen el menú y los botones, con las mismas condiciones.
  const goTo = (next: PageId) => () => { setPage(next); setSelected(null); };
  const startGuidedDrill = () => setDrill(advanceDrill(startDrill(Date.now()), { page, entity: entityName, query, searchOpen: globalSearch, recordOpen: null }, Date.now()));
  const goDrillStep = (step: DrillStepId) => { if (step === 'today') { setPage(state?.runtime ? 'home' : 'today'); setSelected(null); } else if (step === 'export') { setPage('export'); setSelected(null); } else { setPage('workspace'); openEntity('contacts'); } };
  const commandList: Command[] = [
    { id: 'home', label: 'Ir a Inicio', group: 'Ir a', hint: 'G I', run: goTo('home') },
    ...(!state.runtime ? [{ id: 'today', label: 'Ir a Hoy', group: 'Ir a', hint: 'G H', run: goTo('today') }] : []),
        ...(!state.runtime && state.ready && spec ? [{ id: 'week', label: 'Ir a Revisión semanal', group: 'Ir a', run: goTo('week') }, { id: 'agenda', label: 'Ir a Agenda', group: 'Ir a', run: goTo('agenda') }] : []),
    ...(state.ready && spec ? spec.entities.map(item => ({ id: 'open-' + item.id, label: 'Ir a ' + item.label, group: 'Ir a', run: () => openEntity(item.id) })) : []),
    ...(state.ready ? [{ id: 'changes', label: 'Ir a Cambios', group: 'Ir a', hint: 'G M', run: goTo('changes') }] : []),
    ...(!state.runtime ? [{ id: 'agents', label: 'Ir a Propuestas', group: 'Ir a', run: goTo('agents') }] : []),
    ...(state.ready && lab ? [{ id: 'radar', label: 'Laboratorio: Radar de compromisos', group: 'Ir a', hint: 'G R', run: () => { setRehearseFromToday(null); goTo('radar')(); } }, { id: 'date-check', label: 'Laboratorio: Comprobar una fecha', group: 'Ir a', hint: 'G F', run: goTo('date-check') }] : []),
    ...(lab ? [{ id: 'outage-lab', label: 'Laboratorio: ¿Y si cae…? (caídas ficticias)', group: 'Ir a', run: goTo('outage-lab') }] : []),
    { id: 'continuity', label: 'Ir a Continuidad', group: 'Ir a', hint: 'G N', run: goTo('continuity') },
    ...(!state.runtime ? [{ id: 'team-sync', label: 'Ir a Copia de equipo', group: 'Ir a', run: goTo('team-sync') }, { id: 'integrations', label: 'Ir a Integraciones', group: 'Ir a', run: goTo('integrations') }, { id: 'plan', label: 'Ir a Plan y licencia', group: 'Ir a', run: goTo('plan') }] : []),
    ...(state.ready ? [{ id: 'export', label: 'Ir a Exportar', group: 'Ir a', hint: 'G X', run: goTo('export') }] : []),
    ...(state.ready && spec ? spec.entities.map(item => ({ id: 'new-' + item.id, label: 'Crear: ' + item.singular, group: 'Crear', run: () => { openEntity(item.id); setSelected('new'); } })) : []),
    ...(state.ready && spec && !state.runtime ? [{ id: 'csv-import', label: 'Importar desde CSV…', group: 'Crear', run: () => setModal('csv') }] : []),
    ...(state.ready && !state.runtime ? [{ id: 'drill', label: 'Práctica guiada: un día sin CRM', group: 'Acción', hint: '5 min', run: startGuidedDrill }] : []),
    ...(state.ready && spec ? [{ id: 'focus', label: 'Despachar vencidas', group: 'Acción', hint: signals.overdue ? signals.overdue + ' vencidas' : undefined, run: () => setFocusOpen('overdue') },
      { id: 'focus-sweep', label: 'Barrido de la mañana: vencidas y de hoy', group: 'Acción', run: () => setFocusOpen('sweep') }] : []),
    ...(state.ready ? [{ id: 'search', label: 'Buscar en toda la copia', group: 'Acción', hint: 'Ctrl K', run: () => setGlobalSearch(true) }, { id: 'coverage', label: 'Ver la cobertura de la copia', group: 'Acción', run: () => void viewCoverage() }] : []),
    ...(!state.runtime ? [{ id: 'prepare', label: 'Ir a Preparación', group: 'Ir a', run: () => openPreparation() }] : []),
    ...(!state.runtime && state.snapshot?.source.isTestData !== false ? [{ id: 'provider', label: 'Proveedor de IA', group: 'Ajustes', run: () => setModal('settings') }] : []),
    ...(!state.runtime && teamOrigin ? [{ id: 'commercial', label: 'Ir al espacio comercial', group: 'Ir a', run: () => { location.href = teamOrigin + '/team?view=company'; } }] : []),
    ...(undoable ? [{ id: 'undo', label: 'Deshacer el último guardado', group: 'Acción', run: () => void undoLast() }] : []),
    { id: 'lock', label: 'Proteger o bloquear Plan B', group: 'Acción', run: () => void protect() },
    { id: 'theme', label: typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', group: 'Acción', run: toggleTheme },
    { id: 'density', label: currentDensity() === 'comfortable' ? 'Densidad compacta (filas de 32 px)' : 'Densidad cómoda (filas de 40 px)', group: 'Acción', run: toggleDensity },
    { id: 'help', label: 'Ver los atajos de teclado', group: 'Acción', hint: '?', run: () => setHelp(true) }
  ];
  // Registros para la paleta: hasta 4 por tipo, de la copia local, en el orden de la búsqueda del servidor.
  const findRecords = async (text: string): Promise<Command[]> => {
    if (!spec || !state.ready) return [];
    const lists = await Promise.all(spec.entities.map(item => api<{ records: CrmRecord[] }>('/v2/records/' + item.id + '?q=' + encodeURIComponent(text) + '&offset=0&limit=4&pipeline=').then(data => data.records.map(record => ({ record, item }))).catch(() => [])));
    return lists.flat().map(({ record, item }) => ({ id: 'rec-' + record.entity + '-' + record.id, label: recordName(record, spec), hint: item.singular[0].toUpperCase() + item.singular.slice(1), group: 'Registros', run: () => { openEntity(record.entity); setRecords([record]); setSelected(record); } }));
  };
  const openRecord = (record: CrmRecord) => { openEntity(record.entity); setRecords([record]); setSelected(record); };
  const singularOf = (entityId: EntityName) => { const singular = spec?.entities.find(item => item.id === entityId)?.singular ?? ''; return singular ? singular[0].toUpperCase() + singular.slice(1) : ''; };
  // R4 · «Pregunta a tu copia»: la paleta interpreta la frase y lee la copia por páginas (solo lectura, sin salir del equipo).
  const paletteAsk: PaletteAsk | undefined = state.ready && spec ? {
    spec, read: (path, pageSignal) => api<ListPage>(path, { signal: pageSignal }),
    toCommand: (record, hint) => ({ id: 'rec-ans-' + record.entity + '-' + record.id, label: recordName(record, spec), hint: hint || singularOf(record.entity), group: 'Respuesta', run: () => openRecord(record) }),
  } : undefined;
  const shortcutCommands: Command[] = spec ? recordShortcuts.entries.map(entry => ({ id: 'rec-short-' + entry.ref.entity + '-' + entry.ref.id, label: recordName(entry.record, spec), hint: singularOf(entry.ref.entity), group: entry.pinned ? 'Anclados' : 'Abiertos hace poco', run: () => openRecord(entry.record) })) : [];
  const pinnedCurrent = selected && selected !== 'new' ? recordShortcuts.shortcuts.pinned.some(ref => ref.entity === selected.entity && ref.id === selected.id) : false;
  const togglePinned = (record: CrmRecord) => {
    const result = recordShortcuts.toggle({ entity: record.entity, id: record.id });
    setUndoable(null);
    setNotice(result.full ? 'Ya tienes ' + PINNED_MAX + ' fichas ancladas: desancla alguna para anclar esta.' : result.pinned ? 'Ficha anclada: la tienes en el menú y en Ctrl J.' : 'Ficha desanclada.');
  };
  if (selected && selected !== 'new' && spec) commandList.push({ id: 'pin-current', label: (pinnedCurrent ? 'Desanclar' : 'Anclar') + ' esta ficha: ' + recordName(selected, spec), group: 'Acción', run: () => togglePinned(selected) });
  const canContingency = !!state.snapshot && !state.runtime;
  const beginContingency = () => { startContingency(new Date()); setClosedIncident(null); };
  const finishContingency = () => setClosedIncident(endContingency(new Date()));
  const entityLabels = Object.fromEntries((spec?.entities ?? []).map(item => [item.id, item.label]));
  if (canContingency) commandList.push(contingency ? { id: 'contingency-end', label: 'Terminar el modo contingencia (HubSpot ya responde)', group: 'Acción', run: finishContingency } : { id: 'contingency', label: 'HubSpot no responde: activar el modo contingencia', group: 'Acción', run: beginContingency });
  const sidebarPins = spec ? recordShortcuts.entries.filter(entry => entry.pinned).map(entry => { const name = recordName(entry.record, spec); return { key: entry.ref.entity + ':' + entry.ref.id, label: name, title: singularOf(entry.ref.entity) + ' · ' + name, open: () => openRecord(entry.record) }; }) : [];
  const date = describeCapture(state.snapshot?.capturedAt).date ?? '';
  return <TaskOutcomesHost refreshState={refresh} onOpenTask={openTaskFromOutcomes} onClosed={(summary,reason)=>{setLockedOutcomes(previous=>addLockSummary(previous,summary));if(summary.dispatched+summary.notDispatched>0)setLockFailed(reason==='lock-not-completed');}} controlRef={outcomesControl}><div className={'app-shell ' + (selected ? 'has-drawer' : '')}>
    <a className="skip-link" href="#main-content">Saltar al contenido</a>
    <Sidebar pins={sidebarPins} state={state} page={page} entityName={entityName} selected={!!selected} signals={{ ...signals, copy: copySignal, readiness: readinessDot }} step={step} preparationOpen={preparationOpen}
      setPage={setPage} setSelected={setSelected} setPreparationOpen={setPreparationOpen} setGlobalSearch={setGlobalSearch} setModal={setModal}
      openEntity={openEntity} openPreparation={openPreparation} />
    <div className="mobile-brand"><Brand /><span className="badge">{state.snapshot?.source.isTestData===false?'Producción · lectura':'Datos de prueba'}</span></div>
    <main id="main-content" className="main-content" tabIndex={-1}><TopBar state={state} pageLabel={pageLabel} teamOrigin={teamOrigin} openContinuity={() => { setPage('continuity'); setSelected(null); }} openChanges={state.ready ? () => { setPage('changes'); setSelected(null); } : undefined} openHelp={() => setHelp(true)}     openCommands={() => setCommandsOpen(true)} onProtect={() => void protect()} onContingency={canContingency && !contingency ? beginContingency : undefined}
      news={<WhatsNew onOpen={next => { setPage(next); setSelected(null); }} />}
      reminder={<DueReminder active={auth === 'open' && !!state.ready} spec={state.spec} revision={dataRevision + ':' + (state.changes ?? 0)} onOpen={record => { openEntity('tasks'); setRecords([record]); setSelected(record); }} />} />
          {canContingency && (contingency || closedIncident) ? <ContingencyBand active={contingency} closed={closedIncident} copyAt={state.snapshot?.capturedAt} onOpenContinuity={() => { setPage('continuity'); setSelected(null); }} onOpenToday={() => { setPage('today'); setSelected(null); }} onEnd={finishContingency} onDismiss={() => setClosedIncident(null)} onDownload={(window, format) => import('./app-shell/incident-download.js').then(module => module.downloadIncident(window, format, entityLabels))} /> : null}
      {error ? <div role="alert" className="global-error"><span>{error}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setError('')}><X size={18} /></button></div> : null}
      <OutcomesLockNotice summary={lockedOutcomes} failed={lockFailed} onRetry={()=>void protect()} onDismiss={()=>{setLockedOutcomes(null);setLockFailed(false);}}/>
      {!state.runtime?<TaskOutcomesSurface/>:null}
      {page==='home'?<HomeOverview state={state} onSignals={setSignals} onOpenDeals={() => openEntity('deals')} onOpenRecord={record => { openEntity(record.entity); setRecords([record]); setSelected(record); }} onDataChanged={()=>void refresh()}contextRevision={state.workspaceSearchContext?.contextRevision??null} onOpenToday={()=>{setPage('today');setSelected(null);}} onOpenTask={id=>openTaskFromOutcomes(id)} onOpenRadar={()=>{setRehearseFromToday(null);setPage('radar');setSelected(null);}} onRehearse={id=>{setRehearseFromToday(id);setPage('radar');setSelected(null);}} onOpenDateCheck={()=>{setPage('date-check');setSelected(null);}} onOpenContinuity={()=>{setPage('continuity');setSelected(null);}} onOpenChanges={()=>{setPage('changes');setSelected(null);}} onContinuityStatus={receiveContinuity} onOpenAlert={openAlert} onOpenPassport={()=>{setSelected(null);setContinuityTab('evidencia');setPage('continuity');focusWhenReady('ct-tab-evidencia');}} onProtect={() => void protect()} onPrepare={() => openPreparation(0)} lab={lab}/>
      :page==='continuity'?<ContinuityHome initialTab={continuityTab??'estado'} onStatus={receiveContinuity} onGuidedDrill={state.ready && !state.runtime ? startGuidedDrill : undefined} state={state} workspaceContextRevision={state.workspaceSearchContext?.contextRevision??null} refresh={refresh} work={()=>openEntity('contacts')} prepare={()=>openPreparation(0)} protect={()=>void protect()} exportCopy={()=>setPage('export')} connectRequest={connectRequest} onOpenToday={()=>{setPage('today');setSelected(null);}} onOpenIntegrations={()=>{setIntegrationsFrom('continuity');setPage('integrations');setSelected(null);}} returnedFrom={returnedFrom} drillNote={drillNote} onReturnHandled={()=>setReturnedFrom(null)}/>
      :page==='today'||page==='agents'?<>{page==='today'&&lab?<RehearsalTodayEntry contextRevision={state.workspaceSearchContext?.contextRevision??null} onOpen={id=>{setRehearseFromToday(id);setPage('radar');setSelected(null);}} onOpenRadar={()=>{setRehearseFromToday(null);setPage('radar');setSelected(null);}}/>:null}<LocalOperations key={page} view={page} onDispatch={state.ready && spec ? () => setFocusOpen('overdue') : undefined} onOpenTasks={()=>openEntity('tasks')} onOpenDeals={()=>openEntity('deals')} onOpenProposals={()=>setPage('changes')} onPrepare={()=>openPreparation(0)} onRecordSaved={refresh} openTaskRequest={taskRequest} onOpenTaskHandled={()=>setTaskRequest(null)}/></>
        :page==='integrations'?<>{integrationsFrom?<p className="back-link"><button type="button" className="text-button" onClick={()=>{setIntegrationsFrom(null);setPage('continuity');setSelected(null);setReturnedFrom('integrations');}}>← Volver a Continuidad</button></p>:null}<LocalIntegrations onConnectHubspot={()=>{setPage('continuity');setSelected(null);setConnectRequest(n=>n+1);}}/></>
      :page==='team-sync'?<TeamSync/>
      :page==='plan'?<LicensePanel/>
      :page==='date-check'?<div className="gx-datecheck"><h1 className="sr-only">Comprobar una fecha</h1><DateCheck contextRevision={state.workspaceSearchContext?.contextRevision??null} onContextStale={()=>void refresh()}/><div className="gx-datecheck-side"><DecisionReview contextRevision={state.workspaceSearchContext?.contextRevision??null} onContextStale={()=>void refresh()}/></div></div>
      :page==='outage-lab'?<OutageLab/>
      :page==='radar'?(rehearseFromToday?<OperationalRehearsal contextRevision={state.workspaceSearchContext?.contextRevision??null} commitmentId={rehearseFromToday} onContextStale={()=>void refresh()} onClose={()=>setRehearseFromToday(null)}/>:<RadarHost contextRevision={state.workspaceSearchContext?.contextRevision??null} refresh={()=>void refresh()}/>)
      :page==='changes'?<ChangesView runtime={state.runtime} production={state.snapshot?.source.isTestData===false} spec={state.spec}/>
      :page==='export'?<PortableExport/>
      :page==='week'&&state.ready&&spec?<WeeklyReview spec={spec} revision={(state.snapshot?.capturedAt??'')+':'+(state.changes??0)} title={state.snapshot?.name??'Plan B'} saveField={saveField} createTask={createTask} onOpenRecord={record=>{openEntity(record.entity);setRecords([record]);setSelected(record);}}/>
      :page==='agenda'&&state.ready&&spec?<Agenda spec={spec} revision={(state.snapshot?.capturedAt??'')+':'+(state.changes??0)} saveField={saveField} onOpenRecord={record=>{openEntity(record.entity);setRecords([record]);setSelected(record);}}/>
      :page === 'prepare' ? <Preparation state={state.candidate?{...state,...state.candidate,lastError:state.candidate.error}:state} step={step} setStep={setStep} refresh={refresh}
        openWorkspace={() => setPage('workspace')} configure={() => setModal('settings')} onConnect={()=>{setPage('continuity');setConnectRequest(n=>n+1);}} onError={setError} />
      : !state.ready || !spec || !entity ? <section className="empty-state"><ShieldCheck size={36} /><h1>Revisa la preparación</h1><p>La captura y las reglas deben estar verificadas antes de editar.</p>
          <button className="button primary" onClick={() => openPreparation(2)}>Revisar aplicación</button></section>
      : <RecordsPage state={state} spec={spec} entity={entity} entityName={entityName} rows={rows} records={records} total={total} offset={offset} setOffset={setOffset}
          query={query} setQuery={setQuery} pipeline={pipeline} setPipeline={setPipeline} selected={selected} setSelected={setSelected} recordsLoading={recordsLoading} recordsError={recordsError} onRetry={() => setDataRevision(r => r + 1)} busy={busy} date={date} moveDeal={moveDeal} newWith={values => { setPreset(values); setSelected('new'); }} saveField={saveField} saveMany={saveMany} canUndo={!!undoable} onUndo={() => void undoLast()} setServerView={setServerView} facets={facets} board={board} pulse={pulse}
          viewCoverage={() => void viewCoverage()} toggleServices={() => act(() => post('/disconnect', { disconnected: !state.disconnected }), state.disconnected ? 'Servicios habilitados para importar o generar.' : 'HubSpot e IA desconectados. Sigue trabajando con tus datos locales.')} />}
    </main>
    {globalSearch && state.ready && state.snapshot ? <WorkspaceSearch captureId={state.snapshot.id+':'+state.snapshot.capturedAt} expectedContext={state.workspaceSearchContext??null} localRevision={dataRevision} refreshWorkspace={refresh} close={() => setGlobalSearch(false)} openRecord={(record, related) => { setGlobalSearch(false); openEntity(record.entity); setRecords([record,...related]); setSelected(record); }} askInstead={paletteAsk ? text => { setGlobalSearch(false); setPaletteText(text); setCommandsOpen(true); } : undefined}/>:null}
    {selected && spec && state.ready ? <><div className="drawer-shade" onClick={() => { setSelected(null); setPreset(null); }} /><RecordDrawer key={selected === 'new' ? entityName + '-new' + (preset ? ':' + JSON.stringify(preset) : '') : selected.id} preset={selected === 'new' ? preset ?? undefined : undefined} entityName={entityName} selected={selected} spec={spec} records={records}
      headerAction={selected === 'new' || !shortcutScope ? undefined : <button type="button" className="icon-button pin-toggle" aria-pressed={pinnedCurrent} aria-label={pinnedCurrent ? 'Desanclar esta ficha' : 'Anclar esta ficha'} title={pinnedCurrent ? 'Desanclar: deja de salir en el menú' : 'Anclar: queda a mano en el menú y en Ctrl J'} onClick={() => togglePinned(selected)}>{pinnedCurrent ? <PinOff size={19} /> : <Pin size={19} />}</button>}
      summary={(values, set, saving) => { const clean = selected !== 'new' && JSON.stringify(values) === JSON.stringify(selected.values);
        const newTask = selected === 'new' ? null : taskPreset(spec, selected), newDeal = selected === 'new' ? null : linkedPreset(spec, 'deals', selected);
        const onNewTask = newTask && clean ? () => { openEntity('tasks'); setPreset(newTask); setSelected('new'); } : undefined;
        const onNewDeal = newDeal && clean ? () => { openEntity('deals'); setPreset(newDeal); setSelected('new'); } : undefined;
        if (selected === 'new' && entityName !== 'deals') return null;
        return entityName === 'deals' ? <DealSummary spec={spec} values={values} set={set} records={records} disabled={saving} onNewTask={onNewTask} newTaskBlocked={!!newTask && !onNewTask} /> : <RecordSummary entityName={entityName} spec={spec} values={values} set={set} records={records} disabled={saving} onNewTask={onNewTask} newTaskBlocked={!!newTask && !onNewTask} onNewDeal={onNewDeal} newDealBlocked={!!newDeal && !onNewDeal} />; }}
      extra={selected === 'new' ? undefined : dirty => <><RelatedPanel spec={spec} record={selected} dirty={dirty} onOpen={record => { openEntity(record.entity); setRecords([record]); setSelected(record); }} />{canLogActivity(spec, selected) ? <><QuickActivity key={selected.entity + ':' + selected.id} spec={spec} record={selected} name={recordName(selected, spec)} createTask={createTask} /><SequencePicker key={'seq:' + selected.entity + ':' + selected.id} spec={spec} record={selected} name={recordName(selected, spec)} createTask={createTask} /></> : null}<RecordTimeline spec={spec} record={selected} records={records} /></>}
      close={() => { setSelected(null); setPreset(null); }} saved={async (_record, change) => { const target = selected !== 'new' && change ? { changeId: change.id, at: change.at, copy: change.copy } : null; await refresh(); setSelected(null); setPreset(null); setUndoable(target); setNotice('Guardado en tu copia local.'); }} /></> : null}
    {notice ? <div className="toast" role="status"><CheckCircle2 size={19} />{notice}{undoable ? <button type="button" className="toast-action" onClick={() => void undoLast()}>Deshacer</button> : null}</div> : null}
    {modal === 'settings' ? <Settings state={state} close={() => setModal(null)} done={async () => { await refresh(); setNotice('Proveedor guardado.'); }} /> : null}
    {modal === 'csv' && spec && state.ready ? <CsvImport spec={spec} initialEntity={page === 'workspace' ? entityName : 'contacts'} close={() => setModal(null)} done={async (target, created) => { openEntity(target); setDataRevision(r => r + 1); await refresh(); setNotice(created + (created === 1 ? ' registro importado' : ' registros importados') + ' en tu copia local. Quedan en Cambios.'); }} /> : null}
    {help ? <ShortcutsHelp close={() => setHelp(false)} /> : null}
    <MobileNav page={page} entityName={entityName} runtime={!!state.runtime} ready={!!state.ready} overdue={signals.overdue} changes={state.changes ?? 0} go={next => { setPage(next); setSelected(null); }} openEntity={openEntity} openMore={() => setCommandsOpen(true)} />
    {focusOpen && spec && state.ready ? <FocusRun spec={spec} saveField={saveField} createTask={createTask} initialScope={focusOpen} onOpen={record => { openEntity(record.entity); setRecords([record]); setSelected(record); }} close={() => setFocusOpen(false)} /> : null}
    {drill ? <GuidedDrill state={drill} onGo={goDrillStep} onClose={() => setDrill(null)} onRestart={startGuidedDrill} onPassport={() => { setDrillNote(drillHandoffNote(drill, Date.now())); setDrill(null); setSelected(null); setContinuityTab('evidencia'); setPage('continuity'); setReturnedFrom('drill'); }} /> : null}
    {commandsOpen ? <CommandPalette commands={commandList} close={() => { setCommandsOpen(false); setPaletteText(''); }} findRecords={state.ready && spec ? findRecords : undefined} ask={paletteAsk} shortcuts={shortcutCommands} initialQuery={paletteText} /> : null}
    {modal === 'coverage' ? <Modal title="Cobertura de tu copia" close={() => setModal(null)} wide><div className="modal-body">
      <p className="muted">Comprobaciones sobre la captura y la aplicación que estás utilizando.</p>
      <div className="check-list">{probe ? probe.checks.map(check => <div key={check.id}>{check.passed ? <CheckCircle2 size={19} className="green" /> : <Circle size={19} className="muted" />}<span>{check.label}</span><small>{check.passed ? 'Verificado' : 'Pendiente'}</small></div>) : <Spinner />}</div>
      <h3>Conciliación del origen</h3><p className="muted">{Object.values(state.reconciliation?.counts??{}).reduce((n,c)=>n+c.actual,0)} registros y {state.reconciliation?.actualLinks} relaciones conservadas en la captura.</p>
      <h3>Pendiente de cobertura</h3><ul className="plain-list">{spec?.coverage.unsupported.map(item => <li key={item}>{item}</li>)}</ul>
      <p className="helper">Una copia completa de estos datos no equivale a reproducir todas las funciones del CRM. El paquete incluye los resultados de las pruebas de reinicio y red.</p>
    </div></Modal> : null}
  </div></TaskOutcomesHost>;
}
