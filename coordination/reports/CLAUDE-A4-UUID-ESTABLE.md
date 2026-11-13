# CLAUDE-A4-UUID-ESTABLE · el UUID del intento viaja del gestor a la estrategia y a la verificación

Autor: Claude A. Cuatro archivos: `src/task-save-outcome.ts`, `tests/task-save-outcome.test.ts`, `tests/task-focus-outcomes.test.ts` y este informe. **Paquete 1 de A4.** No necesita la API A4, no cambia estados, host ni recuperación y no es el cliente A4.

## Problema

El contrato A4 usa el UUID del intento como ID idempotente del servidor: el navegador no puede cambiarlo para resolver una respuesta perdida. El gestor ya generaba ese UUID antes de ejecutar la estrategia (`newId = crypto.randomUUID()`) y registraba la operación antes del envío, pero la estrategia no lo recibía.

## Cambio

- `SaveRequest.attemptId?` y `VerifyRequest.attemptId?`: el gestor pasa **exactamente** el UUID de la operación (el mismo que ve la superficie de resultados) al guardar y al verificar. Opcionales por compatibilidad con quien construya la petición a mano; el gestor siempre los aporta. Las estrategias de legado y de revisión (233) lo ignoran y no cambian.
- Contrato documentado en los comentarios: una estrategia que lo necesite (la A4) **debe exigir un UUID válido antes de despachar y no generar otro**; con un `newId` inyectado puede no ser un UUID; un reintento humano es otra operación con otro ID; repetir una consulta del mismo intento conserva el ID.
- Sin cambios en las guardias de `dispose`, en la frontera síncrona de `onDispatch` ni en el registro previo al envío.

## Pruebas (7 nuevas; el archivo pasa de 48 a 55, sin tocar ninguna aserción anterior)

El UUID observado por la estrategia es el de la operación y ya está registrada con fase «enviada» cuando la recibe; un `newId` inyectado se transmite tal cual; doble envío ⇒ `busy`, un único intento y una única llamada; verificar conserva el UUID, no guarda y no crea otra operación; un reintento humano es otra operación con otro UUID enlazada (`previousAttemptId`, `supersededBy`); la estrategia no puede alterar la identidad mutando su petición; una estrategia que lanza antes de despachar deja «sin enviar» con su UUID. **Contrapruebas: 4/4 detectadas** (no pasar el UUID en save, no pasarlo en verify, generar un segundo UUID en cada uno).

**Resultados:** gestor 55/55; host 12/12; estrategia de revisión 15/15; ficha 8/8; resultados 7/7; DOM de ficha/gestor/comparador 95/95; `tsc` limpio.

## Huella

La huella fijada de `src/task-save-outcome.ts` en `tests/task-focus-outcomes.test.ts` se renovó **solo después** de ejecutar las pruebas de comportamiento sobre este corte: `e4e5167580b5…` → `770d35048050…` (un solo cambio en ese archivo). `tests/task-save-outcome.test.ts` conserva su CRLF original.

| Archivo | SHA-256 |
| --- | --- |
| `src/task-save-outcome.ts` | `770d350480504043f726315041edd5e8a644082ddb4a8036e10872b1a1e90abc` |
| `tests/task-save-outcome.test.ts` | `311781e9ddfbd57e104a9a088b3303e4ff3744ecb05512ab00595bf68894689a` |
| `tests/task-focus-outcomes.test.ts` | `b01ba6644c91e293aa8475df94f9607c1a010287348a9a39948ca4420c3c03fd` |

## Límites y siguiente

No hay estrategia ni cliente A4 todavía (esperan `shared/task-intents.ts` aceptado, paquete 2). No hay cambios de estados ni recuperación (paquete 3). El host no se toca. No se afirma recuperación duradera.
