# Componentes y contratos para integrar el diseño (CLAUDE-005)

01/11/2026, Europe/Madrid. Autor: Claude. Documento de propuesta: **no implementa nada** y no está acordado por Codex. Se redactó **sin reserva** del tablón (`claim` respondió «Esperando la aceptación de una dependencia» porque CLAUDE-003 sigue en revisión), por indicación expresa del usuario, escribiendo solo las dos rutas del encargo. Complemento: `coordination/reports/CLAUDE-005-integracion.md` (incrementos, archivos a reservar, criterios).

## Método y límites

- **Observado en código (O):** leído en el árbol de trabajo del 01/11/2026, que tiene cambios sin commitear de Codex; las citas `ruta:línea` son de ese estado y pueden desplazarse, por eso se añade el nombre del símbolo. **Hipótesis (H):** depende de render, datos reales o entorno que no he comprobado.
- No he abierto navegador, servidor, cuentas ni `data/`. **No hay auditoría visual**: el prototipo (CLAUDE-003) tampoco fue renderizado por mí y está en revisión de Codex. Las pruebas de `tests/ui-journeys.test.ts` ejecutan componentes con ranuras de hooks, no ReactDOM (cabecera del archivo, líneas 8-10).
- Antes de proponer nada se contrastaron CLAUDE-002/003/004 con el código actual: **varios hallazgos ya están resueltos** (tabla en el informe de integración). Los números de línea de CLAUDE-004 están obsoletos.

## 1. Conclusión: el menor conjunto

El prototipo propone una arquitectura (`WorkspaceShell`, `ClientQueue`, `FollowupBench`…) pensada para un prototipo autónomo. La app real ya cubre casi todo con piezas propias. Para mejorar la app **no hace falta un conjunto grande de componentes**:

| Pieza | Decisión | Motivo |
| --- | --- | --- |
| `EffectSummary` + `describeEffects()` (resumen del efecto de la revisión) | **Crear (única pieza nueva)** | Mejora 5 de CLAUDE-002, alto impacto en la seguridad de la revisión, sin datos nuevos ni servidor. |
| Datos de fila en Hoy (etapa, importe, cierre) | **Ampliar contrato existente**, sin componente | Cambio de `TodayStatus` y del `renderRow` de `SalesWorkspace`; el componente de fila ya existe (`WorkQueue`). |
| Texto «por qué falta actividad» en la ficha | **Editar texto** de `CustomerDossier` | Mejora 10; ya hay `data.source.capturedAt`. |
| `BlockedReason` (motivos de bloqueo asociados al botón) | **No crear ahora** | El patrón se repite en 7 puntos (§3) pero funciona y está probado; extraerlo es refactor sin función nueva. Solo si se añade un octavo punto. |
| `ClientQueue`, `FollowupBench`, `CompactPicker` (mesa B) | **No crear ahora** | La selección ya la cubre `CustomerCombobox`; la mesa B es un rediseño de `CommercialWorkspace` que exige antes el render del prototipo. Ver incremento condicional en el informe de integración. |
| `SpaceHeader`, `LiveRegions`, `ResetGuard`, `PrepareGate`, `FilesPanel`, `ClientSheet` | **No crear: ya existe equivalente** | Mapa en §2. |

## 2. Inventario observado de lo reutilizable (no duplicar)

| Necesidad (nombre en el prototipo / workspace-v2) | Ya existe en la app | Ruta:línea (O) |
| --- | --- | --- |
| Cabecera de sección, franja de cifras, vacío, etiqueta de estado | `SectionHeader`, `MetricStrip`, `InlineEmpty`, `StatusTag` (`tone: neutral|warning|success|info`) | `src/WorkspaceUI.tsx:2-5` |
| Lista con búsqueda/paginación y aviso de cobertura | `WorkQueue` (`items`, `total`, `noun`, `renderRow`) + `queueWindow` | `src/WorkQueue.tsx:5-19`, `shared/work-queue.ts:5` |
| Selector de cliente (`ClientQueue` búsqueda) | `CustomerCombobox` (combobox/listbox, tope 50, homónimos, selección ausente) | `src/CustomerCombobox.tsx:18-70` |
| Etiqueta y filtro de contactos | `contactLabel`, `filterContacts` | `src/commercial-drafts.ts` (tras `openDraftFor`) |
| Pestañas con ARIA completo | `TabList` + `tabPanelProps` | `src/TabList.tsx:3-19` |
| Error de carga con reintento | `LoadError` | `src/LoadError.tsx:1-3` |
| `PrepareGate` / motivos de bloqueo | `prepareBlockers`, `decisionBlockers` + `aria-describedby` | `src/commercial-drafts.ts:20-36`; `CommercialEditor.tsx:9,23`; `CommercialWorkspace.tsx:55,62,72`; `CustomerDossier.tsx:21-26,63`; `TeamAgentWorkspace.tsx:25,33` |
| `ResetGuard` (descartar cambios) | `discardOk` + `beforeunload`; `Modal.confirmClose` | `src/TeamApp.tsx:34-35`; `src/components.tsx:13-20` |
| Conservar edición al recargar | `reconcileDrafts` | `src/commercial-drafts.ts:5-16` |
| Ficha lateral (`ClientSheet`) | `CustomerDossier` dentro de `Modal side` (foco, bloqueo de operaciones, `confirmClose`) | `src/CustomerDossier.tsx:54-56`, `src/components.tsx:13-51` |
| Estado por herramienta (configurada / autorizada / verificada con fecha) | `IntegrationEvidence` (7 estados con texto y hora de Madrid) | `src/IntegrationEvidence.tsx:5-14` |
| Evidencia y conciliación de una propuesta | `commercial-evidence`, `reconciliation-*` | `src/CommercialWorkspace.tsx:67` |
| Editor + revisión | `CommercialEditor` (aside `commercial-editor-review`) | `src/CommercialEditor.tsx:11-25` |

Procedencia del texto: el editor ya reutiliza `decisionBlockers`; cualquier componente nuevo debe leer de las mismas fuentes y no recalcular reglas.

## 3. `EffectSummary` y `describeEffects` (contrato propuesto)

### Propósito
Mostrar, junto a la casilla de revisión y el botón «Aprobar seguimiento»/«Ejecutar», **qué ocurriría exactamente** con el contenido guardado: a quién se enviaría el correo, qué invitación se crearía y cuándo, qué documento o informe. Hoy el destinatario y el horario están en otra zona del formulario (`CommercialEditor.tsx:13` y `:21`) y las cuatro casillas no dicen su efecto (`:20`). Es la mejora 5 de CLAUDE-002 y refuerza la revisión sin relajar ninguna guarda.

### Lógica pura (testeable sin DOM) — en `src/commercial-drafts.ts`
```ts
export type EffectKind = 'task' | 'email' | 'meeting' | 'document' | 'spreadsheet';
export interface Effect { kind: EffectKind; external: boolean; text: string; }
export function describeEffects(
  content: Pick<CommercialContent,
    'recipient'|'subject'|'emailFormat'|'email'|'meeting'|'start'|'end'|'document'|'documentTitle'|'spreadsheet'|'reportRows'>,
  options: { demo: boolean }
): Effect[];
```
Reglas:
- Siempre empieza con la tarea interna: `{kind:'task', external:false, text:'Guardará una tarea interna en Plan B; no se envía al CRM.'}`. Observado: la ejecución crea la tarea sin condición (`server/team/commercial.ts:87-88`).
- Una entrada por cada casilla marcada, en el orden de la interfaz (correo, reunión, Docs, Sheets), con **verbos en futuro condicionado a la ejecución** («Enviará…», «Creará…»). Nunca pretérito ni «enviado»: la prueba de que algo ocurrió sigue siendo la lista de evidencias (`CommercialWorkspace.tsx:67`).
- Texto de cada entrada (valores como texto, nunca HTML):
  - correo: `Enviará un correo a «{recipient}» con el asunto «{subject}» (formato {Personal|Texto simple}).`
  - reunión: `Creará una invitación en Calendar para «{recipient}» el {fecha} de {hh:mm} a {hh:mm} (hora de Madrid).`
  - documento: `Creará un documento en Docs titulado «{documentTitle}».`
  - informe: `Creará un informe en Sheets de {n} filas.` con `n = commercialReportRows(content).length` (el mismo cálculo de la vista previa, `CommercialEditor.tsx:17`).
- `options.demo` antepone «Ensayo: » y añade `external:false` a todas (en demo no sale nada de Plan B, `CommercialWorkspace.tsx:54`).
- Fechas con `Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid'})` fijo, no la zona del navegador (como `IntegrationEvidence.tsx:11`): `CommercialContent.timeZone` es literalmente `Europe/Madrid` (`shared/commercial.ts:6`). Los campos `datetime-local` del editor usan la hora local del navegador (`CommercialEditor.tsx:21,26`); si difiere de Madrid, el resumen es la verdad que usa el servidor (R-18, H).
- **No valida ni sustituye al servidor**: no repite la regla de 1 minuto a 2 horas, ni el límite de cuenta propia. Esas siguen siendo `CommercialContentSchema` y `commercial.ts:20`, y `decisionBlockers`/`blockedRecipient` en el cliente.
- Pura: sin `Date.now()`, sin acceso al DOM, sin red.

### Componente — en `src/CommercialEditor.tsx` (o `src/EffectSummary.tsx` si Codex prefiere archivo propio)
```ts
interface EffectSummaryProps {
  effects: Effect[];            // salida de describeEffects(p.content, {demo})
  state: 'draft' | 'draft-unsaved' | 'approved';
  id: string;                   // useId() del editor, para aria-describedby
}
```
- Eventos: ninguno (solo presentación).
- Datos de entrada: únicamente `proposal.content` de la propuesta mostrada. No lee estado del servidor ni del padre.
- Encabezado según `state`:
  - `draft`: «Si apruebas y ejecutas, ocurriría esto»
  - `draft-unsaved`: «Resumen del borrador sin guardar (el botón de aprobar sigue bloqueado hasta guardar)»
  - `approved`: «Al ejecutar, ocurrirá esto ahora»
- Render: `<section aria-labelledby={id+'-h'}>` con `<h4 id>` y `<ul>`; cada `<li>` marca `external` con texto («Sale de Plan B» / «Solo en Plan B»), no solo con color.
- Ubicación: dentro de `aside.commercial-editor-review`, **entre** los campos de reunión/aviso de cuenta propia y `.commercial-review-actions` (`CommercialEditor.tsx:22-23`). La casilla «He revisado…» recibe `aria-describedby={id}` además de lo que ya tenga; el botón primario conserva su `aria-describedby` actual (motivos de `decisionBlockers`).

### Estados
| Estado | Comportamiento |
| --- | --- |
| Carga | No aplica: el contenido ya está en la propuesta cargada por `CommercialWorkspace`. |
| Vacío | Ninguna acción externa marcada: solo la línea de tarea interna y «Ninguna acción externa: no se enviará nada fuera de Plan B.» |
| Error | No tiene error propio. Si falta destinatario con correo/reunión marcados, el esquema del servidor rechaza al guardar; el resumen muestra el valor tal cual y, si está vacío, «sin destinatario» (no inventa uno). |
| Permisos | Visible también en solo lectura (informa; no concede nada). Los botones siguen gobernados por `decisionBlockers`. |
| Aprobada | Titular `approved`; sigue exigiendo la confirmación nueva de ejecución (`CommercialEditor.tsx:23`). |

### Accesibilidad (diseño; sin lector de pantalla probado)
- Sin `aria-live`: se actualiza al teclear/marcar y no debe anunciar cada pulsación. Se lee por navegación y por `aria-describedby` de la casilla de revisión.
- Texto con contraste de `--text-1`/`--text-3` ya cubierto por `tests/design-tokens.test.ts`; la distinción externo/interno va en palabras.
- Valores de usuario (asunto, destinatario, título) como nodos de texto de React; **sin `dangerouslySetInnerHTML`**. Textos largos con `overflow-wrap:anywhere`.

### Móvil
Una columna, mismo texto, sin elementos pegajosos (que tapan el teclado, criterio de `design/claude/workspace-v2/components.md`). El resumen aparece justo encima de la casilla de revisión, lo que resuelve la distancia entre destinatario/horario y revisión que señaló la mejora 6 **sin** mover el aside ni usar `position:sticky` (H: comprobar a 320/390 px). Objetivos táctiles no cambian (no añade controles).

### Estilos y tokens
Archivo propio `src/commercial-effects.css` importado por el editor, igual que `customer-combobox.css` y `commercial-email.css`; solo variables del sistema (§4), **sin colores en hexadecimal** ni fuentes. `planb-ui.css` ya restiliza `.commercial-editor-review` (`planb-ui.css:251`); el resumen hereda ese fondo y solo añade lista, espaciado y una insignia de texto.

### Qué no debe cambiar al introducirlo
`decisionBlockers` y sus condiciones; aprobación ligada a `content_hash`; reseteo de `reviewed` al editar (`CommercialWorkspace.tsx:43`); aprobar no ejecuta y ejecutar no aprueba (`ui-journeys.test.ts` «Editor real»); `blockedRecipient`; nombres operativos de botones y casillas.

## 4. Mapa de tokens (sin sistema paralelo)

`DESIGN.md` describe un conjunto de valores; **la app ya no lo usa tal cual**. `src/planb-ui.css` (última hoja importada, `main.tsx:10`; CLAUDE-UX-038) define los tokens vigentes y conserva los nombres antiguos como alias (`planb-ui.css:64-70`); `tests/design-tokens.test.ts` valida contrastes sobre `planb-ui.css`. El prototipo (CLAUDE-003) sigue con los valores de `DESIGN.md`, así que **no se debe copiar su CSS**: se traduce.

| Función | `DESIGN.md` / prototipo | Token vigente en `planb-ui.css` (usar este) | Alias heredado que resuelve a él |
| --- | --- | --- | --- |
| Canvas | `#f2f4f7` | `--bg-canvas` `#f3f5f9` | `--canvas` |
| Contenido | `#fffefd` | `--bg-surface` `#ffffff` | `--surface` |
| Capa de apoyo | `#eaf0f6` | `--bg-subtle` `#eef1f6` | `--surface-muted` |
| Navegación | `#edf1f6` (clara) | `--bg-sidebar` `#0d1a2f` (**oscura**) | `--sidebar-surface` |
| Tinta | `#19314f` | `--text-1` `#0f1a2b` | `--ink` |
| Texto secundario | `#52627a` | `--text-3` `#586680` | `--muted` |
| Borde / control | `#d9e1eb` | `--border` `#e0e5ee`, `--border-control` | `--line`, `--control-line` |
| Acción / suave | `#2858dc` / `#e6edff` | `--primary` `#2c58dc` / `--primary-subtle` | `--blue` / `--accent-soft` |
| Éxito / aviso / error | `#216448` / `#835c1c` / `#a2343f` | `--success` / `--warning` / `--danger` (+ `-bg`, `-border`) | `--success`… (mismos nombres) |
| Espacios 4/8/12/16/24/32 | igual | `--sp-1…--sp-8` | `--space-*` en `design-system.css` |
| Radios | 4-8 px | `--r-sm 4`, `--r-md 6`, `--r-lg 10` | `--radius-control`, `--radius-panel` |
| Tipo | Segoe UI Variable | `--font-sans`, `--font-display`, `--fs-xs…--fs-h1` | — |
| Alto de control / fila | 32-36 / 44-54 | `--control-h 32` (40 en ≤600 px), `--row-h 44` | — |

Observado: `DESIGN.md` **no está actualizado** respecto de `planb-ui.css` (barra lateral oscura, valores distintos). Mientras no se reconcilie, un componente nuevo no debe citar `DESIGN.md` como fuente de valores. Decisión que corresponde a Codex (incremento 0 del informe de integración).

Reglas para componentes nuevos:
1. Solo `var(--token)` de la columna «vigente»; ningún hexadecimal nuevo ni `var(--x,#hex)` con valor distinto del token (`customer-combobox.css` lo hace por compatibilidad: no imitarlo).
2. Selectores simples de clase propia (`.commercial-effects…`), sin `body …` ni `!important`; ese énfasis es de la capa final.
3. Sin hoja global nueva ni dependencia nueva (`lucide-react` ya existe si hace falta un icono; el resumen no lo necesita).
4. Objetivos ≥ 32 px (44 en móvil/`pointer:coarse`); `prefers-reduced-motion` ya global (`design-system.css:118`).
5. Textos en español con los nombres operativos actuales; sin «conectado»/«verificado» salvo evidencia.

## 5. Hoy y ficha: contratos pequeños sin componente nuevo

- **Fila de Hoy** (`SalesWorkspace.tsx:44`, `renderRow` de `WorkQueue`): hoy cada fila muestra la misma etiqueta («Sin próxima acción») y el mismo motivo constante (`server/agents.ts:76`), así que no ordena por urgencia. Datos reales disponibles en el modelo de oportunidad: etapa (`dealstage`), importe (`amount`) y cierre (`closedate`), pero `TodayStatus.opportunities` solo exporta `{id,label,reason,contactId}` (`shared/agents.ts:22`). Detalle del contrato en el informe de integración (incremento 2). **«Días sin contacto» del prototipo no tiene respaldo en los datos capturados** (no hay campo de última actividad en el modelo: `shared/fixtures.ts`, `server/hubspot.ts:23`): no debe construirse ni simularse; si hiciera falta, requiere un encargo de captura aparte.
- **Acción por fila:** el prototipo pone «Preparar seguimiento» en cada fila. En el CRM local de Hoy la preparación real no existe (la simulación es un único análisis global, `SalesWorkspace.tsx:23`); la preparación real vive en el espacio de equipo. Mantener «Ver oportunidad» (`:44`) hasta que haya contrato para una acción por fila; no mostrar un botón que simule.
- **Ficha** (`CustomerDossier.tsx:75`): sustituir «Sin actividad conservada para este cliente.» por una causa comprobable construida con `data.source.capturedAt`, p. ej. «La captura del {fecha} no incluye tareas de este cliente. Las notas y los correos no se capturan.»; reutilizar `date()` (`:12`). Sin componente.

## 6. Qué no cubre este documento

No hay render de nada; no se midió contraste, desbordamiento ni foco real. Las alturas y anchos citados provienen de CSS leído. El prototipo y el resto de decisiones de composición (Hoy A / Comercial B) siguen pendientes de la revisión visual de Codex y de la aceptación de CLAUDE-003.
