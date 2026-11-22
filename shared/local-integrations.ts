import type { IntegrationId } from './agents.js';

// Proyección pura del estado de Integraciones de la app principal. Recibe lo que ya declaran
// GET /api/v2/continuity y /api/v4/integrations; no llama a HubSpot ni a Google. «Declarado» nunca se presenta como «comprobado ahora».

export type CapabilityMode = 'simulation' | 'readonly' | 'unavailable';
export interface CatalogEntry { id: IntegrationId; label: string; mode: CapabilityMode; description: string; actions: string[]; }
export interface LocalContinuity {
  runtime: boolean; protected: boolean; servicesEnabled: boolean; realDataEnabled: boolean;
  connection: { accountId: string; mode: 'test' | 'production_readonly' | 'unknown'; verifiedAt: string | null } | null;
  capture: { name: string | null; capturedAt: string | null; records: number | null; source: 'fixture' | 'hubspot' | 'archive' | null } | null;
  lastSuccessAt: string | null; lastError: { at: string | null; message: string } | null;
}
export interface SourceState<T> { data: T | null; failed: boolean; loading: boolean; }
export type SourceName = 'continuity' | 'catalog';

const IDS: readonly IntegrationId[] = ['hubspot', 'gmail', 'calendar', 'drive', 'docs', 'sheets'];
const MODES: readonly CapabilityMode[] = ['simulation', 'readonly', 'unavailable'];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 400): string | null => typeof value === 'string' ? value.slice(0, max) : null;
const date = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

// --- Lectura defensiva de los contratos. null = la respuesta no tiene la forma esperada. ---
export function parseContinuity(raw: unknown): LocalContinuity | null {
  if (!isObject(raw) || typeof raw.runtime !== 'boolean' || typeof raw.protected !== 'boolean' || typeof raw.connected !== 'boolean') return null;
  const saved = isObject(raw.connection) ? raw.connection : null;
  const connection = saved && text(saved.accountId) ? {
    accountId: text(saved.accountId)!,
    mode: (['test', 'production_readonly'] as const).find(mode => mode === saved.mode) ?? 'unknown' as const,
    // accountType NOT_VERIFIED lo escribe el servidor cuando la credencial se guardó sin inspeccionar la cuenta.
    verifiedAt: saved.accountType === 'NOT_VERIFIED' ? null : date(saved.verifiedAt),
  } : null;
  const latest = isObject(raw.latestCapture) ? raw.latestCapture : null;
  const capturedAt = date(latest?.capturedAt) ?? date(raw.latestCaptureAt);
  const capture = latest || capturedAt ? {
    name: text(latest?.name, 120), capturedAt,
    records: typeof latest?.records === 'number' && Number.isFinite(latest.records) ? latest.records : null,
    source: (['fixture', 'hubspot', 'archive'] as const).find(kind => kind === latest?.source) ?? null,
  } : null;
  const operations = isObject(raw.operations) ? raw.operations : null;
  const failure = isObject(operations?.error) && text(operations.error.message) ? { at: date(operations.error.at), message: text(operations.error.message)! } : null;
  return { runtime: raw.runtime, protected: raw.protected, servicesEnabled: raw.connected, realDataEnabled: raw.realDataEnabled === true,
    connection, capture, lastSuccessAt: date(operations?.lastSuccess), lastError: failure };
}
export function parseCatalog(raw: unknown): CatalogEntry[] | null {
  if (!isObject(raw) || !Array.isArray(raw.integrations)) return null;
  const seen = new Set<string>(), entries: CatalogEntry[] = [];
  for (const item of raw.integrations) {
    if (!isObject(item)) continue;
    const id = IDS.find(candidate => candidate === item.id), mode = MODES.find(candidate => candidate === item.mode);
    if (!id || !mode || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, mode, label: text(item.label, 80) ?? id, description: text(item.description, 300) ?? '',
      actions: Array.isArray(item.actions) ? item.actions.flatMap(action => typeof action === 'string' ? [action.slice(0, 120)] : []).slice(0, 10) : [] });
  }
  return entries;
}
// --- Proyección ---
export type RowState = 'loading' | 'error' | 'unavailable' | 'not_connected' | 'declared' | 'paused';
export type Tone = 'neutral' | 'info' | 'warning' | 'danger';
export type RowAction = { kind: 'callback'; label: string } | { kind: 'link'; label: string; href: string } | null;
export interface IntegrationRow {
  id: IntegrationId; label: string; summary: string; state: RowState; stateLabel: string; tone: Tone;
  facts: string[]; next: string; action: RowAction; retry: SourceName | null;
}
export interface SpaceItem { label: string; value: string; tone: Tone; }
export interface SpaceView { status: 'loading' | 'error' | 'ok'; items: SpaceItem[]; notes: string[]; }
export interface StaleNotice { source: SourceName; message: string; }
export interface RehearsalView { status: 'loading' | 'error' | 'empty' | 'ok'; entries: (CatalogEntry & { modeLabel: string })[]; refreshFailed: boolean; }
export interface IntegrationsView { space: SpaceView; hubspot: IntegrationRow; rehearsal: RehearsalView; stale: StaleNotice[]; }

export const stateLabels: Record<RowState, string> = {
  loading: 'Comprobando…', error: 'No se pudo consultar', unavailable: 'No disponible en este paquete', not_connected: 'Sin conectar',
  declared: 'Lectura configurada', paused: 'Servicios deshabilitados',
};
const tones: Record<RowState, Tone> = { loading: 'neutral', error: 'danger', unavailable: 'neutral', not_connected: 'warning', declared: 'info', paused: 'warning' };
const summaries: Record<IntegrationId, string> = {
  hubspot: 'Capturas, ficha comercial y comparación de cambios.', gmail: 'Borradores internos y envío con revisión.', calendar: 'Disponibilidad propia e invitaciones revisadas.',
  drive: 'Archivos autorizados vinculados a clientes.', docs: 'Propuestas desde borradores y contexto documental.', sheets: 'Importación con vista previa e informes verificados.',
};
const labels: Record<IntegrationId, string> = { hubspot: 'HubSpot', gmail: 'Gmail', calendar: 'Google Calendar', drive: 'Google Drive', docs: 'Google Docs', sheets: 'Google Sheets' };
export const issueLabels: Record<SourceName, string> = { continuity: 'el estado de la instalación', catalog: 'el catálogo de capacidades' };
const modeLabels: Record<CapabilityMode, string> = { simulation: 'Ensayo local', readonly: 'Lectura existente', unavailable: 'No disponible en esta instalación' };
const sourceLabels = { fixture: 'datos de ensayo', hubspot: 'HubSpot', archive: 'archivo importado' } as const;

export function formatMadrid(iso: string | null): string {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) + ' (Madrid)' : 'fecha desconocida';
}
function row(id: IntegrationId, state: RowState, partial: Partial<Pick<IntegrationRow, 'facts' | 'next' | 'action' | 'retry' | 'stateLabel' | 'tone'>> = {}): IntegrationRow {
  return { id, label: labels[id], summary: summaries[id], state, stateLabel: partial.stateLabel ?? stateLabels[state], tone: partial.tone ?? tones[state],
    facts: partial.facts ?? [], next: partial.next ?? '', action: partial.action ?? null, retry: partial.retry ?? null };
}

function captureFact(capture: NonNullable<LocalContinuity['capture']>, connected: boolean): string {
  const parts = [capture.name ? '«' + capture.name + '»' : 'Copia importada', capture.capturedAt ? 'del ' + formatMadrid(capture.capturedAt) : null,
    capture.records !== null ? capture.records + ' registros' : null, capture.source ? 'origen: ' + sourceLabels[capture.source] : null].filter(Boolean).join(' · ');
  return parts + '. Es una copia histórica: no indica que HubSpot esté conectado ahora.' + (capture.source === 'hubspot' && !connected ? ' Esta instalación no tiene una credencial guardada.' : '');
}

function spaceView(source: SourceState<LocalContinuity>): SpaceView {
  const c = source.data;
  if (!c) return { status: source.failed ? 'error' : 'loading', items: [], notes: [] };
  const scope = c.realDataEnabled ? 'Producción · solo lectura' : c.connection?.mode === 'test' ? 'Portal de prueba' : 'Sin portal conectado';
  const items: SpaceItem[] = [
    { label: 'Paquete', value: c.runtime ? 'Independiente, sin conectores' : 'Instalación completa', tone: 'neutral' },
    { label: 'Protección local', value: c.protected ? 'Configurada' : 'Sin configurar', tone: c.protected ? 'neutral' : 'warning' },
    { label: 'Importación e IA', value: c.runtime ? 'No incluidas' : c.servicesEnabled ? 'Habilitadas' : 'Deshabilitadas', tone: !c.runtime && !c.servicesEnabled ? 'warning' : 'neutral' },
    { label: 'Alcance de datos', value: scope, tone: 'neutral' },
    { label: 'Copia local', value: c.capture ? (c.capture.name ?? 'Importada') + (c.capture.capturedAt ? ' · ' + formatMadrid(c.capture.capturedAt) : '') : 'Sin copia importada', tone: 'neutral' },
    { label: 'Última captura correcta', value: c.lastSuccessAt ? formatMadrid(c.lastSuccessAt) : 'Ninguna registrada', tone: 'neutral' },
  ];
  const notes = c.lastError ? ['Último fallo de captura (' + formatMadrid(c.lastError.at) + '): ' + c.lastError.message + ' No demuestra por sí solo que la credencial haya caducado.'] : [];
  return { status: 'ok', items, notes };
}

function hubspotRow(continuity: SourceState<LocalContinuity>, catalog: SourceState<CatalogEntry[]>): IntegrationRow {
  const c = continuity.data, declared = catalog.data?.find(entry => entry.id === 'hubspot') ?? null;
  const connect = (label: string): RowAction => ({ kind: 'callback', label });
  if (!c) {
    if (continuity.loading && !continuity.failed) return row('hubspot', 'loading');
    // Solo el catálogo: una credencial guardada se declara, no se comprueba.
    if (declared?.mode === 'readonly') return row('hubspot', 'declared', { facts: ['El catálogo declara una conexión de lectura. No se pudo leer el detalle de la cuenta.', 'Sin comprobar el acceso actual.'], next: 'Reintenta o revisa la conexión desde Continuidad.', action: connect('Revisar conexión'), retry: 'continuity' });
    return row('hubspot', 'error', { facts: ['No se pudo leer el estado de esta instalación, por lo que no se sabe si hay una credencial guardada.'], next: 'Reintenta la consulta. Puedes revisar la conexión mientras tanto.', action: connect('Revisar conexión'), retry: 'continuity' });
  }
  const facts: string[] = c.capture ? [captureFact(c.capture, !!c.connection)] : [];
  if (c.runtime) return row('hubspot', 'unavailable', { facts, next: 'El paquete independiente no contiene conectores. La conexión se prepara en la instalación completa.' });
  if (c.connection) {
    const verified = c.connection.verifiedAt ? 'Cuenta verificada al guardar la credencial (' + formatMadrid(c.connection.verifiedAt) + ').' : 'La cuenta no se verificó al guardar la credencial.';
    const own = ['Portal ' + c.connection.accountId + ' · ' + (c.connection.mode === 'production_readonly' ? 'producción, solo lectura' : c.connection.mode === 'test' ? 'portal de prueba' : 'alcance no indicado') + '.', verified + ' El acceso actual no se comprueba al abrir esta lista. Usa la acción «Comprobar lectura».'];
    if (!c.servicesEnabled) return row('hubspot', 'paused', { facts: ['Credencial guardada, pero los servicios de importación e IA están deshabilitados.', ...own, ...facts], next: 'Habilita los servicios o revisa la conexión desde Continuidad.', action: connect('Revisar conexión') });
    return row('hubspot', 'declared', { facts: [...own, ...facts], next: 'Consulta la comprobación de lectura de esta sección o revisa la conexión desde Continuidad.', action: connect('Revisar conexión') });
  }
  if (declared?.mode === 'readonly') return row('hubspot', 'declared', { facts: ['El catálogo declara una conexión de lectura, pero Continuidad no aporta los datos de la cuenta.', 'Sin comprobar el acceso actual.', ...facts], next: 'Revisa la conexión desde Continuidad.', action: connect('Revisar conexión') });
  const next = c.protected ? 'Conecta tu portal de HubSpot. Se pedirá la credencial en el flujo de Continuidad; esta pantalla no la recoge.' : 'Primero protege la instalación; después podrás guardar la credencial de HubSpot desde Continuidad.';
  return row('hubspot', 'not_connected', {
    facts: c.protected ? facts : ['La instalación aún no tiene protección local configurada.', ...facts],
    next,
    action: connect(c.protected ? 'Conectar HubSpot' : 'Configurar protección'),
  });
}

export function projectIntegrations(input: { continuity: SourceState<LocalContinuity>; catalog: SourceState<CatalogEntry[]> }): IntegrationsView {
  const { continuity, catalog } = input;
  const stale: StaleNotice[] = continuity.data && continuity.failed ? [{ source: 'continuity', message: 'No se pudo actualizar ' + issueLabels.continuity + '. Se muestran los últimos datos recibidos.' }] : [];
  const rehearsal: RehearsalView = catalog.data
    ? { status: catalog.data.length ? 'ok' : 'empty', entries: catalog.data.map(entry => ({ ...entry, modeLabel: modeLabels[entry.mode] })), refreshFailed: catalog.failed }
    : { status: catalog.failed ? 'error' : 'loading', entries: [], refreshFailed: false };
  return { space: spaceView(continuity), hubspot: hubspotRow(continuity, catalog), rehearsal, stale };
}
