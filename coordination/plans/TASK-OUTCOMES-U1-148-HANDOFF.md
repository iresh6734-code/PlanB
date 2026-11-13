# U1-148 · Traspaso para U2 (montaje visible del seguimiento)

4/11/2026, Europe/Madrid. Este traspaso **no autoriza editar** `App.tsx`, `LocalOperations.tsx` ni el gestor 136. U2 necesita su propia reserva con rutas exactas; al escribir esto ninguna tarea activa reservaba `App.tsx` ni `LocalOperations.tsx` (comprobar de nuevo con `board.mjs list` y `check-path`).

## Qué entrega U1 (y qué NO)

`LocalTaskFocus` acepta `outcomes?: TaskSaveOutcomes` (tipo `LocalTaskFocusProps`, exportado desde `src/LocalTaskFocus.tsx`; `TaskFocusProps` de `shared/local-task-focus.ts` NO cambia). Sin la prop, la ficha es la de 123/140. Con ella:

- «Guardar» llama a `outcomes.submit(...)`; el resultado `started` / `busy` / `refused` se trata sin perder el borrador ni enviar un segundo PATCH.
- La ficha refleja el estado de **su** operación (por ID de intento **y** de tarea): en curso (fase «comprobando» o «enviado»), confirmado, aceptado por la persona, rechazado, no enviado, incierto.
- Cerrar la ficha **no** cancela ni descarta: con un intento en vuelo o incierto no hay aviso de «descartar»; el gestor sigue y la superficie lo muestra.
- Un resultado que la propia ficha ya presentó (rechazado, no enviado) se **libera** del gestor (`dismiss`) para no dejar un duplicado ni un «Reenviar» con un borrador viejo. Un resultado ya visto, confirmado/aceptado y con la cola al día se libera al cerrar. Lo demás (en vuelo, incierto, cola sin actualizar, rechazado con la ficha cerrada) se queda.
- La verificación tras un acuse perdido (`verify`) es solo lectura y se lanza sola una vez; «Aceptar el estado leído» es `outcomes.accept` (decisión humana). «Volver al formulario» tras una lectura equivale a dejar de seguir ese intento (`dismiss`) y rebasar el borrador; guardar de nuevo es un guardado nuevo.
- «Reintentar la actualización» es `outcomes.retryQueue`: solo lecturas.

No hace: montar el gestor ni la superficie en Hoy/App (U2), persistir nada tras recargar, adoptar 128, ni abrir la ficha «adoptando» un intento sin resolver de la misma tarea (si se reabre y se guarda, `busy` + remisión a la superficie).

## Lo que U2 DEBE respetar (contrato de la prop `outcomes`)

1. **Mismo objeto mientras la ficha esté montada.** Si cambia, la ficha deja de seguir su intento.
2. **Una `TaskSaveOutcomesPanel` montada sobre ese mismo gestor, fuera del subárbol que se desmonta al navegar.** La ficha dice «el seguimiento continúa en “Resultados de guardado”»; si no hay superficie, esa frase es falsa.
3. **Con `outcomes`, la ficha NO llama a `onSaved`.** La recarga la hace el gestor con `setOnConfirmed`. U2 debe registrar ahí el **equivalente** del `onSaved` actual de `LocalOperations` (`onRecordSaved` → `load(true)`, que rechaza si falla): si no, se pierde la corrección de 151 (estado padre antes de la cola) y la de 155 (avisos por lecturas sustituidas). Sin callback registrado, la ficha dice «La cola de Hoy se actualizará cuando vuelvas a esa vista» (estado `idle`, probado) y la espera se resuelve sola al registrarlo.
4. El callback `onConfirmed` **solo debe leer** (se reintenta desde la ficha y desde la superficie).

## Propuesta sobre quién es dueño del gestor (decisión de U2, no tomada aquí)

Un componente de la **sesión desbloqueada** de la App (no un singleton de módulo): se crea cuando esa sesión monta con acceso a la copia local y se descarta (con su memoria) al bloquear/cerrar sesión o cambiar de instalación. Un singleton de módulo mezclaría instalaciones, sesiones y pruebas, y sobreviviría a un bloqueo con borradores en memoria. El propio gestor ya liga cada operación a `contextKey` (instalación + captura) y rechaza aceptar/reenviar si cambió; eso no sustituye descartar el gestor al bloquear.

## Huecos que U1 ha dejado ver (necesitan unidad y reserva propias)

- **No se puede separar «falló el estado de App» de «falló la cola de Hoy».** El gestor solo conserva `queue.reason` vacío (o «la actualización tardó demasiado»); no reenvía el mensaje del rechazo de `onConfirmed`. La ficha separa «guardado confirmado» de «la actualización no se completó», no de cuál de las dos lecturas falló. Remedio mínimo: que `refreshQueue` en `src/task-save-outcome.ts` guarde una razón corta y segura del `Error` rechazado, y que el callback de U2 rechace con mensajes distintos para cada lectura (+ pruebas). Requiere reservar `src/task-save-outcome.ts` y `tests/task-save-outcome.test.ts` (136, hoy `done`).
- **Conflicto previo sin datos en la operación.** `mapOutcome` no conserva `conflicts` ni `current`; la ficha relee la tarea (solo lectura) para marcar campos y rebasar el borrador. Si esa lectura falla, avisa sin marcar campos (probado en Node solo la clasificación; el DOM cubre el camino feliz).
- **Reabrir la misma tarea con un intento sin resolver** no lo adopta; es la mejora más visible para «cerrar y volver a ver cómo va» sin pasar por la superficie.
- **Proteger el borrador al abrir otra tarea** (U4 del traspaso de 136): con la ficha sucia, `taskId` sigue cambiando sin preguntar (123). Hoy el `Modal` cubre el fondo, pero un cambio programático lo evitaría.
- La superficie sigue visible **detrás** del modal con el mismo resultado que la ficha (se libera al cerrar). Es duplicación visual temporal; U2 puede ocultar la superficie mientras haya una ficha con intento propio.

## Fuera del alcance de U1/U2

- **Prueba de huella de 130:** `tests/task-focus-followup.test.ts` fija el SHA-256 de `src/LocalTaskFocus.tsx` de 123 («hay que repetir la QA contra las fuentes nuevas y actualizar los hashes»). Tras U1 esa única prueba falla por diseño (SHA-256 actual `2d19f352…`, antes `aefb63df…`); con la fuente nueva pasan 123 Node 32/32, 130 Node 7/8 (la que falla es la huella) y 136 Node 23/23. Requiere un encargo que reserve ese archivo para actualizar el hash.
- 128, persistencia tras recarga y multipestaña siguen sin tocarse (ver el encargo de continuidad 149).

## Pruebas que U2 debe repetir

`tests/task-focus-outcomes.test.ts` y `tests/e2e/task-focus-outcomes.spec.ts` (esta ficha + gestor + superficie, arnés), 123 DOM/Node, 130, 136 (`task-save-outcome.test.ts` + DOM), 140 (6 DOM) y las de 151/155/158 sobre la App real, además de las que U2 escriba: cerrar la ficha en vuelo, navegar y volver, volver a un foco útil, y 1440/390/320 con la barra lateral real.
