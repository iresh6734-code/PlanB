# CLAUDE-TASK-REVISION-STRATEGY-233 · Guardado condicionado en el gestor (contrato + estrategia)

5/11/2026, Europe/Madrid. Primera mitad del apartado 4 del encargo «Termina el recorrido de Hoy». Servidor real con revisiones (`createBaseApp({ taskRevisions: true })`), SQLite en memoria, 127.0.0.1; datos ficticios. Sin commits ni despliegues. **No monta nada en la ficha, el host ni el panel, no activa el servidor opt-in y no toca `LocalTaskFocus.tsx`.**

## Problema

El gestor 136/170 solo conocía `legacyStrategy`: su `mapOutcome` no conservaba `changed/unchanged/current` ni el token de 166/183, un no-op se habría anunciado como un guardado y no había forma de guardar contra la revisión que la persona abrió.

## Cambio

- `shared/task-save-outcome.ts`: `RevisedResult {changed, token, current}` y `TaskSaveOperation.revised?` (**solo** con una escritura condicionada validada); `describeOperation` distingue un **no-op** («Sin cambios en …: no se escribió nada ni se añadió historial») de un guardado confirmado, y añade «Se guardó contra la revisión que abriste» cuando hay `revised`.
- `src/task-save-outcome.ts`: `StrategyOutcome` (= `SaveOutcome` + `unchanged` + `saved` con revisión) y `mapOutcome` para ambos (confirmado con procedencia de servidor; `unchanged` no es un guardado). `legacyStrategy` y las 43+ pruebas del gestor intactas.
- `src/task-revision-strategy.ts` (nuevo): `revisionStrategy()` sobre el cliente contextual 183 (que compone el 166 y la lectura de contexto). La puerta síncrona `onDispatch()` de 170 se cruza **justo antes de la petición de escritura** (envolviendo `fetch`); el token es **siempre** el de la lectura que la persona revisó; 409 `TASK_REVISION_CHANGED` → rechazado sin escritura con `revisionConflict`; 422 → inválido con campos; 401 → bloqueado; no-op → `unchanged`; acuse perdido → incierto; cambio de copia → no enviado. **No existe ninguna llamada a la ruta anterior**: un error condicionado nunca dispara un segundo envío. `verify()` solo hace GET (y falla si algo intenta otro método). `loadRevisedTask()` entrega contexto + esquema + registro + token de UNA lectura validada para la ficha.
- `tests/task-focus-outcomes.test.ts`: solo las dos huellas del gestor (el resto, intacto).

## Pruebas (sobre el corte final)

| Comando | Resultado |
|---|---|
| `tsx --test tests/task-revision-strategy.test.ts` | **11/11** contra el servidor REAL |
| `task-revision-strategy` + `task-save-outcome` + `task-attempt-adoption` + `task-outcomes-host` | **80/80** |
| `tsc --noEmit` | sin errores en los archivos de la unidad |
| Regresión DOM 171 / 136 / U1 (repetida tras el cambio del gestor) | 24/24, 13/13, 27/27 |

Cubren: guardado normal (**un** PATCH condicionado con el token revisado, **un** cambio de historial, token nuevo, `revised` coherente, ningún PATCH legacy); **no-op** (sin historial ni contador, descrito como «sin cambios»); **dos editores** desde la misma revisión (gana uno; el otro recibe 409 sin escritura, conserva patch y token original, sin reenvío; solo una lectura explícita nueva permite otro intento y el cambio ganador sigue ahí); **cambio de generación** (antes de enviar: no sale ningún PATCH; después de la comprobación de contexto: 409 sin escribir); **acuse perdido** (incierto, `revised` ausente; la comprobación solo hace GET y no acredita autoría; aceptar es humano y no fabrica `revised`); 422; cambio de captura; **puerta tras `dispose()`** (cero PATCH, «no enviado»); fallo del endpoint condicionado (500 → incierto, 401 → bloqueado) **sin PATCH legacy**; sin token o sin contexto no se envía nada; `legacyStrategy` sigue igual.

**Contrapruebas (6 mutaciones; 5 detectadas):** sin puerta `onDispatch`, no-op como guardado, conflicto como incierto, `revised` en un incierto y texto de no-op como guardado. La sexta (permitir el envío sin token) **sobrevive** porque la validación de la vista de revisión (token de 64 hex) ya lo impide: defensa en profundidad, no un hueco.

## Hashes (SHA-256)

| Archivo | Antes | Ahora |
|---|---|---|
| `shared/task-save-outcome.ts` | `da79ae6d33777b60aacb876de55a91312eafcc026070adb8ccbc3645115c5956` | `4a80332b005034ef66e84955948039a79e5cabdcd9e73940e7b94b4dcfb608fe` |
| `src/task-save-outcome.ts` | `d2aaed72add5ed8c5dcf5d804009c280010ecb861ad25c5f7e9077bcbf1634ca` | `09d324b80a6fac6f7c66a5ff39afa1d34c64c091ddfa28e754332ad14d879fa7` |
| `src/task-revision-strategy.ts` | nuevo | `3162cb831fe72fb93b24f6796cddce47e9eb3f40e548475cc3d733b4ca1d214e` |
| `tests/task-revision-strategy.test.ts` | nuevo | `d9eac7b7150fa106b8291c68a2cda27d6e3bf847c2716d5b84dce6d7923daed9` |
| `tests/task-focus-outcomes.test.ts` | `41292fd47c68377f3af057f62a4a19651907edeb99a303afe5b84b4e6155da72` | `4e2f112cdc178d1f94b4f06a8c67a810210f0b1fe0fbf611da0e55b7e313975d` |
| `coordination/plans/TASK-REVISION-STRATEGY-233-HANDOFF.md` | nuevo | `4f708dc74149ba688f7cd6d78a2f4bb44dac3e55a2933a3d9415af7445675466` |

## Límites

- Es contrato + estrategia: el consumidor (ficha con `loadRevisedTask`, host que elige la estrategia, panel y comparador) es otra unidad posterior a 219. Hasta entonces la App sigue guardando por `legacyStrategy`.
- La elección condicionado/legacy debe ser una **configuración explícita del producto** (el servidor con `taskRevisions` es opt-in); esta unidad no la decide ni activa.
- El servidor compara bajo un único escritor cooperante: no protege rutas anteriores, escritores externos, varios procesos ni da idempotencia por intención.
- `tests/task-focus-outcomes.test.ts` sigue con **una** huella rota que no es de esta unidad: `TaskSaveOutcomes.tsx` (cambiada por 219; la cubre 220).
- Los tres archivos existentes conservan su terminación de línea (CRLF).

## Nota de proceso (honestidad sobre la entrega)

Un fallo de mi script (calculó el hash del traspaso antes de que existiera) dejó este **informe y el traspaso sin escribir en el momento de `submit`**; los escribí inmediatamente después. Los **cinco archivos de código y pruebas no cambiaron** entre la presentación y este informe (sus hashes coinciden con los registrados al presentar). El informe y el traspaso son, por tanto, posteriores a la entrega: si el revisor lo exige, que los devuelva con `revise` y los vuelvo a presentar sin cambios de fuente.


---

# R2 · la tarea declarada y la revisión deben ser la misma (dictamen independiente 233)

**Reproducción.** Con dos tareas homónimas (`task-1`, `task-2`, mismo asunto y estado), se abre `task-2` con `loadRevisedTask` y se entrega esa base y ese token al gestor con `taskId: 'task-1'`. La entrega R1 devolvía `confirmed`, enviaba `PATCH /api/v7/task-revision/task-2`, cambiaba un registro y dejaba el intento identificado como `task-1`; la verificación también leía `task-2`. Reproducido en mi prueba con la guarda retirada (mutación equivalente a la entrega anterior): *actual* `{ status: 'confirmed', taskId: 'task-1', patches: 1, conditioned: 1 }`, *esperado* `{ status: 'not_sent', patches: 0 }`; la verificación daba `read` con 5 peticiones en vez de `unknown` con 0.

**Corrección.** `reviewedFrom` exige `request.taskId === request.baseline.id` y lo comparten **guardar y verificar**; `save` lo comprueba además antes de cualquier otra cosa para dar un mensaje propio («La tarea que ibas a guardar no es la que abriste (task-2)… No se envió nada»). La comprobación es anterior a la lectura de contexto, a la puerta `onDispatch` y a formar una petición. Sin ella un token válido de otra tarea se aceptaba. La guarda de Codex (`proposed-strategy.ts`) se integró (la misma condición en `reviewedFrom`); el mensaje específico es mío.

**Pruebas nuevas (4, en `tests/task-revision-strategy.test.ts`, contra el servidor real con homónimas por la importación normal):**

| Prueba | Observa |
|---|---|
| Guardar declarando `task-1` con base y token de `task-2` | `not_sent`, **0 peticiones** (ni de lectura), 0 PATCH condicionado y 0 legacy, historial y contador sin cambios, ninguna de las dos tareas modificada, intención y token conservados, sin `revised` ni registro atribuido |
| Verificar con ID discrepantes | `unknown` y **0 peticiones**; control con IDs correctos: `read`, solo GET, lee `/task-2` y nunca `/task-1` |
| **Control positivo** con el mismo token e IDs correctos | un único `PATCH /api/v7/task-revision/task-2`, un cambio de historial, `record.id === taskId`, la homónima intacta |
| Registro base que no es una tarea | `not_sent`, 0 peticiones (la vista revisada ya exige entidad `tasks`) |

Contrapruebas: quitar la comprobación de `save` (queda el preflight genérico: detectada por el mensaje) y quitar la de `reviewedFrom` (detectada por la verificación) — las dos detectadas; con ambas retiradas fallan exactamente las dos regresiones causales y el control positivo sigue verde.

**Repeticiones.** Estrategia **15/15**; con gestor (`task-save-outcome`), adopción, host y las suites de cliente/contexto/generación/lanzador/revisión del servidor: **170/171** — el fallo es `independent-task-revision.test.ts:126` («La clave local requiere Windows o el entorno de pruebas original»), una prueba de disco que depende del entorno y no toca esta unidad. 409 sin escritura, no-op, cierre antes de despacho, pérdida de acuse con GET y `legacyStrategy` sin cambios (las 11 pruebas anteriores intactas). `tsc --noEmit` limpio en los archivos de la unidad.

**Huellas SHA-256 vigentes** (el informe no puede contener la suya):

| Archivo | Antes de R2 | Ahora |
|---|---|---|
| `shared/task-save-outcome.ts` | `4a80332b0050…` | sin cambios |
| `src/task-save-outcome.ts` | `09d324b80a6f…` | sin cambios |
| `src/task-revision-strategy.ts` | `3162cb831fe7…` | `d65a468a1643086ddb38442fc038de63aaa39838139da4646ee2b55411da0edf` |
| `tests/task-revision-strategy.test.ts` | `d9eac7b7150f…` | `7215dd29c50b14c4fa80b46278fc16f6eb6658f8e8b0a3de7ddfe764e6444c32` |
| `tests/task-focus-outcomes.test.ts` | `4e2f112cdc17…` | sin cambios (la huella de `TaskSaveOutcomes.tsx` sigue en 220) |
| `coordination/plans/TASK-REVISION-STRATEGY-233-HANDOFF.md` | `4f708dc74149…` | `b33be05c0d8f4effb1aad506db19456b03627a36fea0ca6941bd2ab3dffc3546` |

Los archivos conservan CRLF (estado del árbol). El traspaso añade la regla de identidad para el adaptador de la ficha.
