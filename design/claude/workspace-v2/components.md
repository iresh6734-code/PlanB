# Contratos de componentes · mesa de trabajo comercial

Propuesta para portar gradualmente el prototipo (`app.js`) a React. No define endpoints ni accesos a datos: los componentes reciben datos y devuelven eventos. Los nombres de campos son los del prototipo; Codex los adaptará al contrato real.

## Principio de portado

`app.js` ya separa dos capas:

- **Núcleo puro** (`reduce`, selectores, `createDraft/editDraft/saveDraft/setConfirmed/completeReview`, `prepareBlockers`). Se puede llevar a React casi tal cual como `useReducer(reduce, initialState)` o a un módulo de TypeScript con sus pruebas. No toca el DOM, el reloj ni el azar: fechas (`at`) e identificadores (`seq`) entran por la acción o el estado.
- **Interfaz** (`build*`). Cada función corresponde a un componente de abajo.

## Propiedad del estado (ownership)

| Estado | Dueño | Se limpia al… |
|---|---|---|
| `workspaceId`, `scenario` (solo prototipo) | `WorkspaceShell` | — |
| `view` | `WorkspaceShell` (URL: solo la vista) | — |
| `selectedId` (cliente elegido) | `WorkspaceShell`, **único** y compartido por Hoy, Seguimiento, Archivos y ficha | cambiar de espacio, volver al vacío |
| `drafts[espacio:cliente]`, `prepared` | `FollowupBench` (vía el reductor del shell) | cambiar de espacio, volver al vacío |
| `draft.review` (`confirmed`, `reviewed`, `invalidated`) | dentro de cada borrador | cualquier edición de destinatario, texto o acciones |
| `panel` (`clientId`, `openerKey`) | `WorkspaceShell` | cerrar, cambiar a carga/error/vacío |
| `internal` (acciones internas por espacio) y `pending` | `WorkspaceShell` | `pending` al terminar la operación |
| Consultas y filtros (`queueQuery`, `todayQuery`, `todayFilter`, `filesQuery`) | cada lista, elevable | cambiar de espacio |

Regla: ningún componente guarda una segunda copia de la selección. La clave de borrador es `draftKey = espacio + ':' + clienteId`, de modo que un borrador nunca se muestra en otro contexto.

## Componentes

### `WorkspaceShell`
Raíz: cabecera, navegación, franja del prototipo, avisos, vista activa y `ClientSheet`.
- Props: `initialWorkspaceId`, `workspaces: {id,name}[]`, `loadSnapshot(workspaceId)` (inyectado; en el prototipo, datos de muestra).
- Provee por contexto: `state`, `dispatch`, selectores.
- Eventos: `onViewChange(view)`, `onWorkspaceChange(id)` (con guarda de cambios sin guardar), `onScenarioChange(id)` (solo prototipo).
- Hijos: `PrototypeBar` (solo en el prototipo, se elimina al integrar), `SpaceHeader`, `PrimaryNav`, `NoticeStrip`, `TodayView | CommercialView | IntegrationsView`, `ClientSheet`, `LiveRegions`.

### `SpaceHeader`
- Props: `workspace`, `provenance: {origin, capturedAt|null}`, `workspaces`, `onChange`.
- Muestra siempre origen y fecha de captura disponible («No disponible» si no existe).

### `NoticeStrip` / `ResetGuard`
- Props: `pendingReset: {kind, count}|null`, `staleDays|null`, `readOnly: boolean`, `onConfirm`, `onCancel`.
- Foco inicial en «Seguir editando» al aparecer.

### `LiveRegions`
- Dos regiones persistentes (`role=status`, `role=alert`). Props: `notice: {kind,text,seq}`. Anuncia solo cuando cambia `seq` y suprime un mismo texto repetido en 3 s. No debe montarse/desmontarse con las vistas.

### `TodayView`
- Props: `items: WorkItem[]`, `query`, `filter: 'all'|'review'|'none'`, `limit`, `status: 'empty'|'loading'|'error'|'ready'`.
- `WorkItem`: `{key, clientId, kind: 'task'|'internal'|'none', title, reason, origin, due|null, flags[]}`.
- Eventos: `onQuery`, `onFilter`, `onClear`, `onMore`, `onOpenSheet(clientId, openerKey)`, `onPrepare(clientId)`.
- Subcomponentes: `WorkRow` (≥ 52 px; botón de apertura + acción), `FilterSegment` (radios nativos), `EmptyState`, `NoMatchState` (distingue «no hay datos» de «filtro sin resultados»).

### `CommercialView`
Contenedor `ClientQueue` + `FollowupBench`. A < 900 px la cola es una selección compacta (`CompactPicker`) que muestra el cliente elegido.

### `ClientQueue`
- Props: `clients`, `total`, `selectedId`, `query`, `limit`, `status`, `drafts` (solo para la etiqueta «Borrador…»).
- Eventos: `onQuery`, `onSelect(id)`, `onMore`, `onOpenManual()`.
- Patrón: lista de botones con `aria-current`, no combobox. Si se pasa a combobox hay que implementar todo el teclado del patrón.

### `FollowupBench`
- Props: `client|null` (incluye el caso `manual`), `provenance`, `tab: 'seguimiento'|'archivos'`.
- Eventos: `onTab`, `onOpenSheet`.
- Hijos: `BenchHeader`, `Tabs` (`tablist` con flechas/Inicio/Fin), `CaptureContext`, `PrepareGate`, `DraftEditor`, `DraftPreview`, `ReviewPanel`, `ExternalActions`, `FilesPanel`.

### `CaptureContext`
- Props: `client`, `access`, `nextAction`, `capturedAt`. Procedencia y fecha siempre rotuladas «no es una consulta actual». No renderiza IDs como nombre.

### `PrepareGate`
- Props: `blockers: {code,text}[]`. Deshabilita «Preparar seguimiento» y lista las causas (`busy`, `readonly`, `inactive`, `noemail`) vinculadas con `aria-describedby`. Se usa también en `WorkRow` y `ClientSheet`.

### `DraftEditor`
- Props: `draft`, `errors`, `canInternalAction`.
- Eventos: `onChange(patch)` (campo a campo, sin remontar), `onSave()`.
- Reglas: no reconstruir los inputs al teclear; mostrar errores tras el primer intento de guardar; guardar no es enviar.

### `ExternalActions`
- Props: `capabilities: {id,label,reason,fields|null}[]`, `openFields`. Interruptores `disabled` con motivo accesible; «Ver campos» abre campos de ejemplo no editables. Ningún control se llama «Enviar».

### `DraftPreview`
- Props: `draft.content`. Texto como nodos de texto con `white-space: pre-wrap`.

### `ReviewPanel`
- Props: `draft`, `recipient`, `scope`, `localEffects[]`, `futureEffects[]`.
- Eventos: `onConfirm(bool)`, `onMarkReview()`.
- Reglas: la casilla y el botón requieren `canReview(draft)` (válido y guardado) y la casilla marcada; cualquier edición los apaga y muestra la invalidación. Resultado: «Revisión local completada; no se ha enviado nada».

### `FilesPanel`
- Props: `mode: 'list'|'empty'|'unauthorized'|'loading'|'error'`, `files`, `query`. Añadir y abrir documentos remotos deshabilitados con motivo. `mode` es del prototipo; en la app vendrá del estado real de la integración.

### `ClientSheet` (ficha lateral)
- Props: `client`, `fields`, `opportunities`, `activity: {kind,origin,text,due|null,date|null,done}[]`, `blockers`, `pendingOps`, `openerKey`.
- Eventos: `onClose`, `onPrepare`, `onCreateInternal({title,due})`, `onCompleteInternal(id)`.
- Contrato de accesibilidad: `role=dialog`, `aria-modal`, `aria-labelledby`; foco inicial en cerrar; Escape cierra; Tab atrapado; el contenedor de fondo recibe `inert`; al cerrar el foco vuelve al elemento con `openerKey` (clave estable por entidad, nunca por índice); bloqueo de scroll del cuerpo. En móvil ocupa el ancho completo.
- Acciones internas: operación con `pending` para evitar duplicados por doble clic; solo afectan a memoria/estado de la UI y se rotulan así.

### `IntegrationsView`
- Props: `rows: {capability, description, state: 'unconfigured'|'configured'|'authorized'|'verified', evidenceAt|null, explanation}[]`, `examples|null`.
- La fecha solo se muestra si existe evidencia. Los ejemplos (tabla con contenedor desplazable propio) se rotulan «no son conexiones» y nunca salen de datos reales. Sin botón que abra terceros.

## Adaptación móvil

- < 900 px: la cola es un botón desplegable (`aria-expanded`, `aria-controls`) con el cliente elegido; al elegir se cierra. Editor, vista previa y revisión se apilan en ese orden (la revisión queda pegada al editor, sin posiciones fijas que tapen el teclado).
- Ficha: ancho completo, botón de cerrar de 44 px.
- Filas de Hoy: una columna; fecha y acción bajo el texto. Tablas: contenedor propio con scroll horizontal y `tabindex=0`.
- ≤ 480 px: botones a ancho completo; sin scroll horizontal global.

## Plan de integración en tres entregas pequeñas

### Entrega 1 · Selector compartido
Alcance: `selectedId` único en el shell, `ClientQueue` (con compacto móvil), `SpaceHeader`, `ResetGuard`, `LiveRegions`. Sin editor.
- Aceptación: una sola selección compartida por vistas; cambiar de vista la conserva; cambiar de espacio la limpia con aviso si hay cambios; búsqueda por nombre, empresa y correo; sin IDs visibles; estados vacío/carga/error/sin coincidencias; selector usable a 320 px.
- Riesgos: duplicar la selección en dos estados (probar que solo existe uno); rendimiento con cientos de clientes (paginar o virtualizar); pérdida de foco al filtrar (usar claves estables).

### Entrega 2 · Mesa y editor
Alcance: `FollowupBench`, `DraftEditor`, `DraftPreview`, `ReviewPanel`, `ExternalActions`, `PrepareGate`, borrador sin cliente y `FilesPanel` en estados.
- Aceptación: guardar/editar/invalidar/revisar según las reglas; ningún efecto externo ni botón «Enviar» mientras no exista integración; causas de «Preparar seguimiento» visibles; borrador nunca mostrado en otro contexto; el error de carga conserva la selección.
- Riesgos: reconstruir inputs al teclear (pérdida de foco, IME); anunciar éxitos repetidos; que un futuro «Enviar» herede la lógica de «revisión local» sin verificar la integración real; texto de usuario insertado como HTML (usar siempre nodos de texto).

### Entrega 3 · Ficha y estados
Alcance: `ClientSheet`, acciones internas con `pending`, `TodayView` completa, `IntegrationsView`, `PrototypeBar` solo como utilidad de desarrollo (retirar al integrar).
- Aceptación: foco atrapado/devuelto/`inert`; Escape; actividad con origen y vencimiento; sin duplicados por doble clic; filtro vacío distinto de ausencia de datos; integraciones sin botón que abra terceros y con fechas solo con evidencia.
- Riesgos: `inert` y `dialog` en los navegadores objetivo; contraste de estados deshabilitados y avisos; sugerir escritura en el CRM desde acciones internas; que los estados de integración de ejemplo se confundan con reales.
