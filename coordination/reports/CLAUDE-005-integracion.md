# CLAUDE-005 · Plan de integración del diseño por incrementos

01/11/2026, Europe/Madrid. Autor: Claude. **Propuesta para que Codex acuerde el contrato y abra encargos con reservas reales; no implementa nada.** Escrito **sin reserva** (el `claim` devolvió «Esperando la aceptación de una dependencia», CLAUDE-003 en revisión) por autorización expresa del usuario, solo en las dos rutas del encargo; por eso **no puedo presentarlo con `submit`**: queda listo para que Codex lo recoja o reserve. Complemento: `design/claude/componentes.md` (contratos y tokens).

## Método y límites

Solo lectura de código y de los informes CLAUDE-002/003/004, `DESIGN.md`, `CLAUDE-COLABORACION.md` y `design/claude/workspace-v2/components.md`. **Observado (O)** = leído en el árbol de trabajo del 01/11/2026 (con cambios de Codex sin commitear; citas `ruta:línea` más símbolo). **Hipótesis (H)** = depende de render, datos o entorno. No abrí navegador ni servidor, no toqué `data/`, `.env*` ni instalaciones, no ejecuté pruebas ni llamé a servicios. **No hay auditoría visual**: nada de lo que sigue sobre aspecto, desbordamiento, foco real o contraste computado está comprobado; los criterios que lo exigen se asignan a Codex en navegador.

## 1. Punto de partida verificado

Los informes previos están desfasados: la cola FIX/UX posterior ya cerró casi todo CLAUDE-004 (board: CLAUDE-FIX-014, -019, -020, UX-032, UX-034 en `done`). Contrastado con el código actual:

| Hallazgo previo | Estado actual (O) | Dónde |
| --- | --- | --- |
| R-01 ediciones se pierden al salir | Resuelto: `onDirtyChange`, `discardOk`, `beforeunload`, puerta de sesión que no desmonta | `TeamApp.tsx:32-35,83,91`; `CommercialWorkspace.tsx:33-34` |
| R-02 recarga pisa ediciones | Resuelto: `reconcileDrafts` | `commercial-drafts.ts:5-16`; `CommercialWorkspace.tsx:36` |
| R-03/R-04 aprobar→ejecutar, Google desconectado | Resuelto: `decisionBlockers`, `review` se limpia al aprobar/ejecutar | `commercial-drafts.ts:20-29`; `CommercialWorkspace.tsx:66` |
| R-05 idempotencia al preparar | Resuelto en Comercial (`prepareKey`) y en la ficha (`prepareId`) | `CommercialWorkspace.tsx:47-49`; `CustomerDossier.tsx:15,51` |
| R-06/R-13 error de carga y recarga | Resuelto: `LoadError`, aviso de acción hecha + «Actualizar lista» | `LoadError.tsx`; `CommercialWorkspace.tsx:39-40` |
| R-07 botones sin motivo | Resuelto en 7 puntos | `CommercialEditor.tsx:23`; `CommercialWorkspace.tsx:55,62,72`; `CustomerDossier.tsx:63`; `TeamAgentWorkspace.tsx:33` |
| R-09 propuesta equivocada | Resuelto: `onProposal(id)`; `preparedProposal` se limpia | `TeamApp.tsx:70,90,94` |
| R-10 Escape cierra la ficha | Resuelto: `Modal.confirmClose` | `components.tsx:13-20`; `CustomerDossier.tsx:54-56` |
| R-12 selector de clientes | Resuelto: `CustomerCombobox` | `CustomerCombobox.tsx` |
| R-15 pestañas ARIA | Resuelto: `TabList` | `TabList.tsx` |
| CLAUDE-002 #3, #4, #7 | Hechos: cliente compartido, causas de «Preparar seguimiento», estados por herramienta | `CommercialWorkspace.tsx:62`; `CustomerDossier.tsx:21-26`; `IntegrationEvidence.tsx` |
| R-17, R-18 (móvil, zona horaria) | H sin comprobar; siguen abiertos | — |

**Abierto de verdad (O):** mejora 1 (filas de Hoy sin dato de orden: `SalesWorkspace.tsx:44`, motivo constante en `server/agents.ts:76`), mejora 5 (resumen de efecto de cada acción externa: no hay ninguno, el editor solo tiene casillas en `CommercialEditor.tsx:20`), mejora 10 (causa de la actividad vacía: `CustomerDossier.tsx:75`), mejora 11 (hojas CSS: ahora además `planb-ui.css` redefine tokens frente a `DESIGN.md`, ver incremento 0) y la composición B de Comercial (condicional, incremento 4).

## 2. Primera mejora elegida: resumen de efecto en la revisión

Candidatas y criterio (impacto en el uso real / alcance / necesidad de datos o servidor):

| Candidata | Impacto | Alcance | Datos nuevos |
| --- | --- | --- | --- |
| **A. Resumen de efecto junto a la revisión (mejora 5)** | Alto: la acción irreversible (Gmail/Calendar/Docs/Sheets reales) se revisa con el destinatario y la hora a la vista | **Pequeño**: 1 función pura + 1 bloque de JSX + 1 hoja propia, 3 archivos de código | Ninguno |
| B. Filas ricas en Hoy (mejora 1) | Alto | Medio: contrato compartido, servidor y 2 pruebas existentes | Etapa/importe/cierre (existen); «días sin contacto» **no existe** |
| C. Causa de actividad vacía (mejora 10) | Medio | Muy pequeño | `capturedAt` (existe) |
| D. Mesa B de Comercial | Alto (H) | Grande: rediseño de `CommercialWorkspace` | — |

Se elige **A**. Es la única que mejora una decisión con efectos externos sin tocar contratos, servidor ni la lógica de aprobación, y no depende de que el prototipo se haya renderizado. C cabe como complemento del mismo ciclo; B es el siguiente incremento.

## 3. Incrementos

Cada uno se comprueba por separado, cabe en un encargo y lista **todos** los archivos de escritura. «Lectura» es lo que debe leerse; no se reserva. Ningún incremento requiere dependencias nuevas, `package.json` ni lockfile.

### Incremento 0 · Reconciliar `DESIGN.md` con `planb-ui.css` (Codex; sin código)
- **Por qué:** `DESIGN.md` fija barra lateral clara `#edf1f6` y otros valores; `src/planb-ui.css` (CLAUDE-UX-038, `done`) define barra oscura `#0d1a2f`, `--bg-canvas #f3f5f9`, etc., con alias a los nombres antiguos (`planb-ui.css:64-70`). El prototipo y los criterios de aceptación citan `DESIGN.md`. Sin decidir cuál manda, cada incremento puede discutir contra la fuente equivocada.
- **Escritura:** `DESIGN.md` (solo si Codex decide que `planb-ui.css` es la fuente). **Lectura:** `src/planb-ui.css`, `tests/design-tokens.test.ts`.
- **Aceptación:** una tabla única de tokens vigentes en `DESIGN.md` (la de `componentes.md` §4 sirve de borrador) y una frase que dice qué hoja es la autoridad. Los incrementos 1-3 no dependen de ello para empezar, pero sí para revisarse.

### Incremento 1 · `EffectSummary` en el editor (primera mejora)
- **Objetivo:** el resumen descrito en `componentes.md` §3.
- **Archivos exactos de escritura:**
  1. `src/commercial-drafts.ts` (añadir `describeEffects` y tipos `Effect`/`EffectKind`; no tocar el resto)
  2. `src/CommercialEditor.tsx` (importar, calcular `describeEffects(p.content,{demo})`, renderizar `EffectSummary` en el aside, `aria-describedby` en la casilla de revisión)
  3. `src/commercial-effects.css` (nuevo, solo tokens)
  4. `tests/commercial-effects.test.ts` (nuevo; función pura)
  5. `tests/ui-journeys.test.ts` (añadir casos al bloque «Editor real»)
  6. `tests/e2e/commercial-effects.spec.ts` (nuevo, para que Codex lo ejecute con adaptadores ficticios; el e2e no es obligatorio para presentar si la reserva no cubre servidor, ver abajo)
  7. `coordination/reports/<ID>.md`
- **Lectura:** `shared/commercial.ts`, `shared/commercial-report.ts`, `src/CommercialWorkspace.tsx`, `src/planb-ui.css` (solo `.commercial-editor-review`), `tests/ui-journeys.test.ts` (arnés `realEditor`).
- **No debe reservarse** `src/CommercialWorkspace.tsx`: las props del editor (`CommercialEditor.tsx:7`) no cambian, `demo` ya llega. Si el implementador cree necesitar otro archivo, debe detenerse y pedir otro encargo.
- **Guardas que deben permanecer (O):** `decisionBlockers` (`commercial-drafts.ts:20-29`) intacto y su mismo `aria-describedby` en el botón; aprobación ligada a `content_hash` (`CommercialWorkspace.tsx:66`); `reviewed` se limpia al editar o guardar (`:43-44`) y al aprobar/ejecutar (`:66`); aprobar no ejecuta y ejecutar no aprueba (`ui-journeys.test.ts` «Editor real»); `blockedRecipient` (`CommercialEditor.tsx:22`); nombres de botones/casillas; ninguna petición nueva; ningún `dangerouslySetInnerHTML`.
- **Procedencia de datos:** solo `proposal.content` (ya guardado y hasheado por el servidor, `shared/commercial.ts:6`) y `demo` (`CommercialOverview.demo`). La tarea interna se justifica por `server/team/commercial.ts:87-88`. Nada se infiere del navegador ni se consulta a Google.
- **Criterios de aceptación:**
  1. Sin acciones marcadas: exactamente la línea de tarea interna + «Ninguna acción externa…».
  2. Cada casilla marcada añade su línea, con destinatario/asunto/título/n.º de filas reales del contenido y la hora **de Madrid**; con `demo` todas llevan «Ensayo:» y «Solo en Plan B».
  3. Cambiar destinatario, asunto, formato, horas o título actualiza el resumen en el mismo render; el estado del botón de aprobar **no cambia** respecto del anterior en ningún caso (misma batería `Editor real`).
  4. `state='draft-unsaved'` cuando `dirty`; `approved` cuando `status==='approved'`.
  5. Ninguna línea usa pretérito ni «enviado»; ningún texto afirma validez que dependa del servidor (duración de reunión, cuenta propia).
  6. Valores con `<script>`, comillas y 500 caracteres se muestran como texto y no desbordan (e2e, H).
  7. `describeEffects` es pura: la misma entrada da la misma salida, sin leer reloj; prueba con instante en horario de verano y de invierno.
  8. `tsc --noEmit` y `tsx --test tests/commercial-effects.test.ts tests/ui-journeys.test.ts` correctos.
  9. **Codex en navegador (320/390/1440 px, perfil de pruebas, red externa bloqueada):** sin desplazamiento horizontal, resumen visible entre horario y casilla, foco por teclado en orden natural, contraste de las dos tintas del resumen medido, y que no aparece ninguna llamada de red al marcar o escribir.
- **Riesgos:** (a) el resumen se lee como garantía de resultado → verbos en futuro condicionado y evidencia sigue siendo la lista de `commercial-evidence`; (b) deriva entre resumen y servidor si se añade una acción nueva → un test que recorre las claves booleanas de `CommercialContent` (`email, meeting, document, spreadsheet`) y falla si falta su línea; (c) hora de Madrid ≠ hora local de los campos `datetime-local` (R-18, H) → el resumen declara «(hora de Madrid)»; no se corrige el campo en este incremento; (d) más texto en el aside en pantallas estrechas (H).
- **Reversión:** quitar el bloque y la importación; `describeEffects` y su prueba se pueden dejar o borrar sin efecto en producción.

### Incremento 2 · Datos de orden en las filas de Hoy
- **Objetivo:** que cada fila de «Seguimientos que conviene preparar» diga algo distinto y útil (mejora 1), solo con datos que existen.
- **Contrato propuesto (compartido; lo decide Codex):** en `shared/agents.ts:22`, ampliar el elemento de `TodayStatus.opportunities` con campos **opcionales**: `stage?: string | null` (etiqueta de etapa), `amount?: number | null`, `closeDate?: string | null` (YYYY-MM-DD). Opcionales para no romper a quien consume el contrato; ausencia o `null` → la interfaz muestra «Sin dato». **No** incluir «días sin contacto»: no hay campo de última actividad en las capturas (`server/hubspot.ts:23`, `shared/fixtures.ts`); inventarlo sería simular un dato.
- **Archivos exactos de escritura:** `shared/agents.ts`, `server/agents.ts` (en `today()`, `server/agents.ts:74-76`, rellenar desde `spec.roles.stage/amount` y `closedate`), `src/SalesWorkspace.tsx` (línea 44: `renderRow`), `tests/agents.test.ts`, `tests/today-completeness.test.ts`, `tests/e2e/today-work-queue.spec.ts`, informe. Sin CSS nuevo: usa `small`/`StatusTag` ya existentes; si Codex quiere una columna, añadir `src/work-queue.css` (incluir en la reserva).
- **Guardas:** el criterio «sin tarea abierta en 7 días» y los totales `listTotals` no cambian (`server/agents.ts:64-79`); `WorkQueue` sigue avisando si no recibe todas las prioridades (`WorkQueue.tsx:13`); la acción de fila sigue siendo «Ver oportunidad»; Hoy sigue siendo simulación local (`SalesWorkspace.tsx:28`).
- **Decisiones que no son mías:** si las filas se ordenan (p. ej. por importe o cierre) es lógica comercial y la fija Codex; formato de importe y moneda (la ficha ya escribe «moneda no conservada», `CustomerDossier.tsx:65`: reutilizar el mismo criterio); si «Preparar seguimiento» por fila existe (requiere contrato servidor para analizar una sola oportunidad, hoy `analyze` es global, `SalesWorkspace.tsx:23`).
- **Aceptación:** con oportunidades que tengan y no tengan etapa/importe/cierre, cada fila muestra el dato o «Sin dato»; el orden y los totales no cambian; pruebas existentes de completitud verdes; Codex comprueba a 1440/390/320 px que la fila no se solapa (la regla `.priority-row .status-tag{display:none}` a ≤1150 px, `design-system.css:103`, oculta la etiqueta; H).
- **Riesgos:** cambio de contrato compartido y de servidor (por eso no se mezcla con el incremento 1); respuestas antiguas sin los campos nuevos.

### Incremento 3 · Causa de la actividad vacía en la ficha
- **Archivos exactos:** `src/CustomerDossier.tsx` (línea 75), `tests/customer-dossier-focus.test.ts` o `tests/ui-journeys.test.ts` (un caso), `tests/e2e/customers.spec.ts` (si Codex quiere el recorrido), informe.
- **Guardas:** `confirmClose`, `lock`/`run`, `stale` y la restauración de foco (`CustomerDossier.tsx:17-56`) no se tocan; sigue sin consultar servicios externos.
- **Aceptación:** con captura sin tareas ni acciones completadas, el texto cita la fecha de la captura (`data.source.capturedAt`) y aclara que notas y correos no se capturan; con actividad, el texto no aparece; en solo lectura no sugiere acciones no disponibles (`:69`).
- **Riesgo mínimo:** afirmar de más; el texto solo debe decir lo que los datos permiten (la captura no incluyó tareas del cliente).

### Incremento 4 · Composición B de Comercial (condicional; no abrir todavía)
- **Condición para abrir:** (1) Codex renderizó el prototipo y aceptó CLAUDE-003; (2) hay evidencia de que leer contexto y redactar a la vez es un problema real (H hoy); (3) incrementos 1 y 3 integrados.
- **Enfoque de menor coste a evaluar primero:** reordenar `CommercialWorkspace` en dos regiones a partir de ~1200 px (contexto HubSpot a la izquierda, propuestas a la derecha) reutilizando `HubspotContext`, `CustomerCombobox` y `CommercialEditor`, sin `ClientQueue` ni estado nuevo. Archivos probables: `src/CommercialWorkspace.tsx`, `src/planb-ui.css` o una hoja nueva, `tests/ui-journeys.test.ts`, `tests/e2e/v6.spec.ts`. **No se fijan aquí**: requiere un encargo propio con la lista cerrada y las mismas guardas del incremento 1 más `reconcileDrafts`, la clave de idempotencia y `TabList`.
- **Riesgos (de CLAUDE-002/003):** cascada CSS, pie de revisión pegajoso que tape el teclado en móvil, cola de 5 clientes que deje vacía la zona derecha. Todos H.

### No proponer
- `BlockedReason`/`useReasonId`: 7 usos en 4 archivos, ya con prueba. Se extraería sin función nueva y tocaría `CommercialEditor`, `CommercialWorkspace`, `CustomerDossier` y `TeamAgentWorkspace` a la vez. Reconsiderar si un nuevo punto repite el patrón.
- Copiar `prototipo.css`/`prototipo.js` (valores de `DESIGN.md`, DOM imperativo): el prototipo es una guía de composición, no código de entrega.
- Un `WorkspaceShell` o contexto global de selección: `contact` ya es un único estado compartido por las pestañas (`CommercialWorkspace.tsx:28,62,71`).
- Consolidación general de hojas CSS (mejora 11): solo con capturas antes/después y encargo aparte.

## 4. Reglas comunes a todos los incrementos

1. Un incremento por encargo, con reserva de **exactamente** los archivos listados; ampliar alcance exige otro encargo (CLAUDE.md, tablón).
2. Presentar con `submit`; no aceptar la propia entrega ni editar después de presentarla.
3. No tocar `CONTEXTO-PROYECTO.md`, `PLAN-1.0.md`, `package.json`, lockfile, contratos o esquema compartido salvo reserva expresa (el incremento 2 es el único que reserva `shared/agents.ts`).
4. Distinguir pruebas aisladas de operaciones auténticas: nada de lo anterior toca Google, HubSpot ni cuentas; `ui-journeys.test.ts` no es ReactDOM (cabecera, líneas 8-10), así que el e2e en navegador sigue siendo necesario para foco, móvil y contraste.
5. Datos de ejemplo: solo sintéticos de prueba; nada de clientes ficticios dentro de la app ni en los textos de producto.

## 5. Matriz de procedencia de datos

| Dato mostrado | Origen real | Quién lo escribe | Si falta |
| --- | --- | --- | --- |
| Destinatario, asunto, formato, horas, título, n.º de filas del informe | `proposal.content` (guardado y hasheado) | Persona al editar; servidor valida (`CommercialContentSchema`) | Se muestra vacío o «sin destinatario»; no se inventa |
| Tarea interna | Efecto fijo de la ejecución (`server/team/commercial.ts:87-88`) | Servidor | — |
| `demo` | `CommercialOverview.demo` | Servidor | Se trata como no demo (comportamiento actual) |
| Etapa, importe, cierre de una oportunidad (incremento 2) | Registros de `deals` del modelo (`dealstage`, `amount`, `closedate`) | Captura / copia local | «Sin dato» |
| Fecha de captura (incremento 3) | `CustomerDossier.source.capturedAt` | Captura | Texto sin fecha |
| Días sin contacto | **No existe** | — | No se muestra; no se estima |

## 6. Riesgos transversales

- **Árbol de trabajo en movimiento (O):** hay decenas de archivos de `src/` modificados sin commitear. Antes de cada reserva, Codex debe fijar la base (`baseline` del tablón) y el implementador releer cada archivo; las citas de este informe pueden desplazarse.
- **Fuente de diseño ambigua:** `DESIGN.md` vs `planb-ui.css` (incremento 0). El prototipo hereda la fuente antigua.
- **Prototipo no renderizado:** ninguna decisión de composición (A/B) está validada visualmente; este plan evita depender de ella en los incrementos 1-3.
- **Texto que parece garantía:** cualquier resumen de efecto compite con la evidencia real; por eso futuro condicional y separación estricta de «resumen previo» y «evidencia posterior».
- **Zona horaria (H):** hora de Madrid fija en el contrato frente a campos en hora local del navegador (R-18).

## 7. Preguntas para Codex antes de abrir el encargo 1

1. ¿`EffectSummary` en `CommercialEditor.tsx` o en `src/EffectSummary.tsx` propio? (Cambia la lista de archivos en uno.)
2. ¿Se acepta `commercial-effects.css` como hoja propia (patrón de `customer-combobox.css`) o prefieres el bloque en `planb-ui.css`? Se recomienda la hoja propia para no reservar la capa final.
3. ¿El e2e (archivo 6) entra en el encargo o lo añade Codex tras la revisión en navegador?
4. ¿Quién ejecuta el incremento 0 y cuándo?

## 8. Entrega y estado

Creados: `design/claude/componentes.md` y `coordination/reports/CLAUDE-005-integracion.md`. **Sin reserva y sin `submit`** (dependencia CLAUDE-003 pendiente de aceptación); `check-path` tampoco era aplicable. No se editó ningún otro archivo. Sin verificaciones ejecutadas más allá de leer código y confirmar que las rutas de escritura no existían.
