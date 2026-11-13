# CLAUDE-A4-CLIENT-STRATEGY · cliente y estrategia A4 con estados honestos

10 de noviembre de 2026, Europe/Madrid. Autor: Claude A. Paquete A1 de la tanda de 10/11. Cuatro archivos nuevos y este informe; no se tocó el gestor, el contrato compartido (`shared/task-intents.ts`), el servicio 316, `App.tsx`, `main` ni ninguna ruta de Codex o de Claude B.

## Efecto para la persona (cuando se monte)

Guardar una tarea envía **una** petición de ejecución duradera con el ID que el gestor ya mostraba en «Resultados». Si la respuesta se pierde, la persona ve «no se sabe si se aplicó» y puede **comprobar leyendo** el mismo intento: nada se reenvía, no hay un segundo ID y una lectura que coincide no se presenta como guardado confirmado ni como autoría. Si el servidor conservó su acuse, tras reiniciar se recupera ese acuse.

**Recorrido disponible hoy: ninguno visible.** Es código y pruebas de contrato. La entrada visible llegará con A2 (`TaskRecovery`) y el montaje en host/App (Codex). No se declara A4 funcional.

## Qué se entrega

| Archivo | Papel |
| --- | --- |
| `src/local-task-intents-client.ts` | Cliente de las seis rutas de `/api/v7/task-intents`: POST de ejecución (con `onDispatch` inmediatamente antes del transporte), GET de lista, detalle y comprobar, y POST de aceptar / dejar de seguir. Valida cada respuesta con los esquemas estrictos de 311; plazo, cancelación y límite de 512 KiB propios; mensajes cerrados; 401 emite `planb:locked`. |
| `src/task-save-intent-strategy.ts` | Estrategia: valida antes de despachar, interpreta la respuesta en un resultado de siete estados, `check` solo-lectura por ID exacto y adaptador `asSaveStrategy()` para el gestor actual. |
| `tests/local-task-intents-client.test.ts` | 9 pruebas del cliente. |
| `tests/task-save-intent-strategy.test.ts` | 13 pruebas de la estrategia, incluido el gestor real de Hoy. |

## Los siete estados (cada uno con prueba)

1. **No despachado** (`not-sent` / `not-dispatched`): puerta cerrada, entrada inválida, señal ya cancelada, sin ID del gestor, tarea distinta, sin revisión, copia no lista o sin pin → **cero POST**, la puerta no se cruza y no se genera ningún UUID. La puerta se prueba también con el gestor real (`dispose()` antes de la entrada de `save`).
2. **Incierto**: POST despachado sin acuse válido → solo consulta explícita por GET. Cubre sin respuesta, plazo (aunque `fetch` ignore la cancelación), cuerpo detenido, cuerpo que supera 512 KiB (se corta la lectura), cancelación posterior al despacho, 401, 5xx, 409 de cambio de intento, códigos desconocidos, contrato ajeno y recibo de otro intento/tarea/contexto. **Un 503 después del despacho nunca es «no enviado»** (también probado a través del gestor: `uncertain`, no `not_sent`). Ningún camino reenvía.
3. **Acuse duradero del servidor** (`acknowledged`, `source: 'server-ack'`): se conserva sin `writeResult` (replay `not-retained` y `response-too-large`), con cambio y revisión resultante, **sin reconstruir CrmRecord**; tras acuse perdido, `check` lo recupera (`recorded`). La recarga de Hoy es otra dimensión: con el gestor real, `onConfirmed` fallando deja `confirmed` + cola `failed` y reintentar hace cero POST y cero escrituras.
4. **`changed:false`** → `no-op` con tipo propio (sin historial, no es trabajo nuevo; el adaptador lo entrega como `unchanged`).
5. **Lectura `applied`** → `attribution: 'unknown'`, sin acuse inventado (`operation.acknowledgement` y `provenance` nulos cuando el servidor no los tiene).
6. **`accepted-read`** → tipo propio con `seq` y `source: 'person-accepted-read'`, distinto de `server-ack`. La secuencia sí se conserva; la revisión de tarea observada **no** viaja en el resumen del servidor y no se inventa (solo está en la petición de aceptar).
7. **Detalle vencido / respuesta omitida por tamaño**: `detail-expired`, `check` `unavailable` con `response-too-large`, `detail-expired` y `read-failed` conservan los metadatos del intento y **no** hay `record`, base ni parche.

Además: un reintento humano permitido es **otra operación** con otro ID y `previousAttemptId` (probado con el gestor real: dos POST, cada uno con el ID de su operación, el primero queda `supersededBy`); comprobar añade 0 POST, 0 escritor, 0 historial.

## Pruebas ejecutadas (esta combinación, un solo `tsx --test`)

- `tests/local-task-intents-client.test.ts` + `tests/task-save-intent-strategy.test.ts`: **22/22**.
- Regresión de lo que toca el gestor sin editarlo: `task-save-outcome` (55), `task-revision-strategy` (15), `task-focus-outcomes` (7) → conjunto de 5 archivos **99/99**, 0 fallos.
- `tsc --noEmit` del proyecto: sin errores en mis cuatro archivos.
- **Contrapruebas (mutantes aplicados uno a uno y restaurados): 12 detectados.** 503 como rechazo; `onDispatch` tras el transporte; sin límite de bytes; recibo de cualquier intento; recibo de cualquier contexto; 409 de cambio de intento como rechazo; detalle vencido sin validar el intento; ID nuevo cuando falta el del gestor; aceptación humana como `server-ack`; no-op como trabajo nuevo; acuse sin `writeResult` degradado a incierto; lectura `applied` con autoría. Un mutante (quitar `phase === 'attempt'`) **no se detecta y es equivalente**: el esquema 311 ya impide fase y desenlace incoherentes. Un mutante de adaptador solo rompía la compilación y no se cuenta.

**Evidencia, declarada por tipo.** SERVICIO DEL AUTOR: el servicio real de 316 (SQLite en memoria, escritor contado, fallos inyectados en sus dependencias `afterPersist`/`writer`, sin interruptores HTTP ni ENV) a través de un `fetch` que entrega a `app.inject`. TRANSPORTES FALSOS: sin respuesta, cuerpo detenido o enorme, 503/401/409 con códigos, contratos y recibos ajenos, detalle vencido y respuesta grande. Datos ficticios, sin red.

## Límites y dependencias

- **316 NO está aceptado** (en revisión 319). No se fija ningún diagnóstico suyo como definitivo; si 319 cambia semántica de 503 o de códigos, la clasificación de este cliente (503 y códigos desconocidos ⇒ incierto) sigue siendo la conservadora. La conformidad definitiva espera 316 aceptado y el montaje 318.
- **Interfaz pendiente del gestor.** `StrategyOutcome` no puede expresar «confirmado por el servidor sin registro». `asSaveStrategy()` lo degrada a `uncertain` con el texto «El servidor confirmó este intento, pero su respuesta no incluyó el registro…»: nunca a «guardado» ni a «no enviado». Para conservar la confirmación en Hoy hay que ampliar `src/task-save-outcome.ts` y `shared/task-save-outcome.ts` (unidad de gestor, plan A4 §2 filas 4-6, **dueño propuesto: Claude A, con registro aparte**; esas rutas llevan huella fijada en `task-focus-outcomes`). Hasta entonces esta estrategia **no debe montarse como estrategia de Hoy**.
- **El pin `contextRevision`.** La estrategia lo pide como función (`contextRevision(context)`): quien monte debe decidir de dónde sale (pregunta abierta nº 1 del plan de adaptación). Sin pin no se envía nada.
- Aceptar y dejar de seguir están en el cliente porque A2 los necesita; sus pruebas son de contrato (cuerpos, recibo del mismo intento y desenlace, conflicto conservado).
- No hay prueba con navegador, App compilada ni dos procesos. La cancelación posterior al despacho no deshace lo que el servidor haya aplicado.

## Observaciones para la revisión de 316/319 (lectura y sonda desechable, NO hechos confirmados)

Dos comportamientos del servicio **actual y no aceptado**, reproducidos con una sonda desechable que usa `afterPersist`/`afterWrite` (el fichero de la sonda se borró; no es entregable):

- **A.** Si la revisión de la tarea cambia después de persistir la intención y antes del escritor, el POST devuelve 409 `TASK_REVISION_CHANGED` con 0 llamadas al escritor, pero la lista muestra el intento en fase `attempt` sin desenlace. El cliente lo trata como rechazo (correcto respecto a la tarea); en «Trabajo por recuperar» ese intento aparecería pendiente. Conviene decidir si el servidor lo asienta como `rejected` o si la superficie debe explicarlo.
- **B.** Si el contexto cambia después de que el escritor aplicó, el POST devuelve 409 `TASK_INTENT_CONTEXT_CHANGED` con la escritura **ya hecha** (1 llamada, 1 fila de historial). Por eso el cliente **no** trata ese 409 de POST como «sin efecto» sino como incierto (`context-changed`). Lo mismo puede ocurrir con un 401 si se bloquea durante la espera.

## Huellas (SHA-256, LF)

| Archivo | SHA-256 | Líneas |
| --- | --- | --- |
| `src/local-task-intents-client.ts` | `d28c2d113ddb257a8b7ef62fc146198fe0b23851f674666dd093b426258bf81d` | 198 |
| `src/task-save-intent-strategy.ts` | `ec6dcaf4213c146ca5c5ac5634ae788d574d41213a187fb498ddbbf6a5eaf9bf` | 155 |
| `tests/local-task-intents-client.test.ts` | `b1d2da12fbfc3250a804fa5d7103f620a5e039ec21be58bd956d964b9a929734` | 155 |
| `tests/task-save-intent-strategy.test.ts` | `93522d3097dfc465b12929a1c0dafbecd9c410a9f620d1d73ad596d60063951f` | 186 |

El informe no se auto-referencia. Siguiente dueño: Codex revisa; A2 (`TaskRecovery`) puede empezar sobre este cliente cuando 316 esté aceptado.
