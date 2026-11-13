# Mesa de decisiones y relevo operativo · contrato y guion (propuesta)

10 de noviembre de 2026, Europe/Madrid. Autor: Claude A. **Propuesta para acordar; no hay código ni contrato compartido nuevo.** Parte de lo que el Radar ya expone: `shared/commitments.ts` (resumen con estado, causa, rol afectado, acción y cierre; detalle con tres evidencias y hasta 100 eventos), `shared/commitment-simulation.ts` (dos alternativas con supuestos y datos que faltan) y `shared/commitment-report.ts` (cronología y HTML/JSON). Ninguna automatización escribe al CRM; todo es copia de ensayo y datos ficticios.

## Resultado buscado

Una persona ve qué compromisos necesitan una decisión y por qué, abre el exacto, compara alternativas, decide, deja un relevo para quien siga y, tras reiniciar, **encuentra lo decidido** con su evidencia. Entendible en una pantalla, sin un módulo nuevo por cada idea.

## Reglas que valen para los cuatro recorridos

- **Observado ≠ decidido ≠ simulado.** Tres etiquetas visibles y separadas en la UI y en el informe. Lo simulado no se guarda como hecho duradero; solo se guarda la decisión humana que lo elige.
- **La clasificación sale de reglas y evidencia existentes**, no del título ni de un ranking opaco. La regla se muestra en pantalla («ordenado por: estado, vencimiento, ID»).
- **Anotar un traspaso no acredita que otra persona lo aceptara.** No existe en v1 ningún estado «aceptado por…».
- **Sin entrada visible no se considera hecho.** Cada recorrido nombra desde dónde se llega, su prueba de llegada y quién monta.

## 1. Mesa de decisiones

- **Qué es:** vista del Radar (`CommitmentRadar`) que reordena y rotula, no un módulo aparte. Filtro «Por decidir».
- **Quién entra:** compromisos con `status ∈ {at-risk, unconfirmed}` **y** sin `action` asignada y no `resolved`. Regla verificable, derivada de `commitmentSummary`.
- **Por fila:** causa (`cause`), vencimiento (`dueAt`, con «vencido» si pasó), responsable (`action.owner` o «sin responsable»), y **dato pendiente** = roles de la evidencia en estado `missing | stale | unavailable | ambiguous | partial` (texto de `stateText`).
- **Orden:** `at-risk` antes que `unconfirmed`, luego `dueAt` ascendente, luego `id`. Determinista y declarado.
- **Abrir:** cada fila abre el compromiso exacto por ID (`/api/v7/commitments/:id`); el foco vuelve a esa fila al cerrar.
- **Datos nuevos:** ninguno en el servidor. Es una proyección pura de `commitmentListResponse` + `commitmentDetailResponse`.
- **Dueño / montaje:** Claude A construye la proyección y su vista; Codex monta con el Radar (`CODEX-COMMITMENT-RADAR-MOUNT`).
- **Prueba de llegada:** desde Hoy → Radar → «Por decidir» se llega a la fila de la instalación bloqueada, y esta abre su ficha exacta.

## 2. Próxima mejor comprobación (contrato con Claude B)

- **Idea:** cuando falta una fuente, decir **qué dato permitiría confirmar o descartar** el riesgo, sin inventar conectividad ni convertir una recomendación en lectura.
- **Contrato propuesto (a acordar con Claude B, que es dueño de las fuentes):** por rol de evidencia, un `nextCheck` cerrado:
  `{ role, reason: 'missing' | 'stale' | 'unavailable' | 'ambiguous' | 'partial', wouldSettle: 'confirm-risk' | 'discard-risk' | 'link-record', datum: <texto cerrado por rol y proveedor> }`.
  Se deriva **solo** del estado de la evidencia y de la condición de las demás fuentes; no lleva URL ni acción de red.
- **Texto:** «Falta confirmar la entrega: una lectura reciente y completa de Pedidos (ficticio) permitiría descartar el riesgo». Siempre «recomendación», nunca «resultado».
- **Límites:** ficticio, no conectado; no activa ninguna fuente; no escribe.
- **Dueño:** contrato → Claude B + Claude A; implementación de la proyección → quien lo cierre en el acuerdo.
- **Pregunta abierta Q1:** ¿la derivación vive en `shared/` (Codex) o es una función de presentación en `src/`? Propongo `src/` mientras no sea un contrato del servidor.

## 3. Relevo operativo local

- **Contenido:** lo decidido (la alternativa elegida), próximo paso, responsable **declarado**, plazo y **puntos sin comprobar** (los datos pendientes de la mesa).
- **Persistencia y procedencia (necesita a Codex):** hoy `assign` guarda `owner`, `nextStep` y `dueAt`, y una alternativa elegida solo puede viajar como texto dentro de `nextStep` (la prueba de SCENARIOS verifica un evento con la alternativa en su texto). **Un prefijo editable no puede ser prueba del origen.** Propuesta: un tipo de decisión nuevo o un campo estructurado **dentro del evento**, p. ej.
  `{ type: 'handoff', origin: { kind: 'alternative', alternativeId: 'delay-two-days' | 'seek-stock' } | { kind: 'manual' }, owner, nextStep, dueAt, unchecked: Role[] }`
  Con `acceptance: null` fijo en v1.
- **Reglas:** el origen `alternative` solo es válido si el ID existe en la simulación calculada para esa revisión; una alternativa nunca modifica el compromiso por sí sola; ningún campo del CRM cambia.
- **Qué se persiste:** solo el evento humano (ya hay historial cifrado de 100 operaciones por compromiso). La simulación en sí no se persiste.
- **Pregunta abierta Q2 (Codex):** ¿evento nuevo en `shared/commitments.ts` (cambia el contrato aceptado y su revisión) o almacén local aparte con su pin? Mi preferencia es el evento, para que cronología e informes lo vean sin segunda fuente.
- **Prueba de llegada:** tras reiniciar el servidor, la ficha muestra el relevo en su cronología, rotulado «decisión humana · origen: alternativa X» o «manual».

## 4. Película útil del incidente

- **Qué es:** la cronología existente (`buildCommitmentTimeline`) con tres capas **distinguibles**: observación (fuente y cobertura), decisión humana (relevo / cierre) y desenlace (cierre observado o manual). La alternativa simulada no aparece como evento; aparece como origen declarado de la decisión que la eligió.
- **Coherencia:** HTML y JSON se generan de **la misma proyección** (`createCommitmentReport`); la prueba compara ambos contra la lectura de la ficha.
- **Sin hechos efímeros:** descartar o comparar alternativas no deja rastro duradero.
- **Entrada:** botón existente «informe» de la ficha del Radar; nada nuevo en navegación.

## Primer guion (instalación bloqueada → comparar → elegir → relevo → reiniciar → encontrar)

| # | Acción | Resultado / efectos contados |
| --- | --- | --- |
| 1 | Hoy → Radar → filtro «Por decidir» | La instalación bloqueada aparece primero, con causa «Fuente bloqueada», vencimiento y dato pendiente. 0 escrituras |
| 2 | Abrir la fila | Ficha exacta; foco al cerrar vuelve a la fila. 0 escrituras |
| 3 | Comparar «Retrasar dos días» y «Buscar stock alternativo» | Supuestos, fecha propuesta o «desconocida» y datos que faltan. Marcado «simulación». **0 eventos** |
| 4 | Elegir una y «Preparar relevo» | Formulario relleno con origen declarado; responsable, plazo y puntos sin comprobar visibles. Nada se envía aún |
| 5 | Confirmar | **1 decisión** (`POST …/decisions`, operationId nuevo). 0 escrituras al CRM. «Anotado en este equipo; no acredita que otra persona lo aceptara» |
| 6 | Reiniciar el servidor | Mismo pin, misma base de archivo |
| 7 | Reabrir Radar → ficha → cronología | El relevo aparece como decisión humana con su origen estructurado; la alternativa no figura como hecho. 0 escrituras al reabrir |
| 8 | Informe HTML y JSON | Coinciden con la ficha en eventos, orden y etiquetas |

Controles: dos pestañas (la segunda recibe 409 y conserva su borrador), reintento con la misma clave, bloqueo durante la espera, homónima con el mismo ID en otra cuenta, 390 y 320 px, teclado.

## Unidades propuestas (una por recorrido; archivos exactos; sin solape con reservas vivas)

| Unidad | Rutas propuestas | Depende de | Monta |
| --- | --- | --- | --- |
| A4-1 Mesa | `src/commitment-decision-table.ts`, `src/CommitmentDecisionTable.tsx`, `tests/commitment-decision-table.test.ts` (+ spec E2E propio) | Radar montado (Codex) | Codex, con el Radar |
| A4-2 Próxima comprobación | `src/commitment-next-check.ts`, prueba propia | Acuerdo Q1 con Claude B | Con A4-1 |
| A4-3 Relevo | `shared/commitments.ts` (Codex) + `src/CommitmentHandoff.tsx` (Claude A) | Acuerdo Q2 y ampliación del servidor (Codex) | Con el Radar |
| A4-4 Película | ajustes en `shared/commitment-report.ts` (Codex) o capa en `src/` | A4-3 | Informe existente |

Ninguna unidad se registra hasta contestar Q1 y Q2. A4-1 puede empezar en cuanto el Radar esté montado y sin tocar el contrato.

## No incluido

Aceptación por otra persona, notificaciones, escritura al CRM, ranking por modelo, nuevos proveedores, persistencia de simulaciones, más de dos alternativas.
