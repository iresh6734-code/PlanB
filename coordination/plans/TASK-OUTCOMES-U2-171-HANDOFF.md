# U2-171 · Traspaso para las siguientes unidades (reabrir un intento, comparador, adopción 166/183/185, persistencia)

5/11/2026, Europe/Madrid. Este traspaso **no autoriza editar** ninguna ruta de 171 mientras esté en revisión; cada unidad siguiente necesita su encargo, su reserva y `check-path`.

## Qué existe ahora (para consumirlo, no reescribirlo)

- `useTaskOutcomes()` (de `src/TaskOutcomesHost.tsx`) devuelve `{ controller, registerToday, setFichaOpen, openTask, ficha } | null`. `null` = no hay propietario (Hoy sola, en pruebas): Hoy y la ficha conservan su comportamiento anterior.
- `TaskOutcomesHost` (en `App.tsx`, rama desbloqueada): crea el gestor en un **efecto** (no al renderizar; el modo estricto de React no deja un gestor cerrado en uso), llama a `dispose()` al desmontarse y entrega su resumen a `onClosed` (App lo acumula como **solo cifras**).
- Consumidor de `onConfirmed`: `confirmationConsumer(readState, today)`: estado de App → lista de Hoy (si está montada); causas cerradas `state`/`list`. **Se crea uno nuevo cada vez que cambia la vista de Hoy registrada**: así el gestor (170) descarta la recarga del consumidor anterior. No registrar una función estable que lea otro consumidor desde un `ref`.
- Superficie: `TaskOutcomesSurface` (en `<main>`, fuera de Hoy; se oculta con la ficha abierta). Envuelve `TaskSaveOutcomesPanel` pasándole una **vista del gestor** con operaciones ordenadas (lo que necesita atención primero) y la misma API de acciones.
- «Abrir la tarea»: `openTask(taskId)` → `App.taskRequest {taskId, nonce}` → `LocalOperations` abre la ficha por ID y llama a `onOpenTaskHandled`. **No hace PATCH y no adopta el intento** (ver abajo).

## Lo que cada unidad siguiente debe respetar

1. **Reabrir y adoptar el intento exacto (paquete 4).** Hoy reabrir una tarea con un intento sin resolver NO lo adopta: guardar da `busy` y remite a la superficie. Adoptarlo exige cambiar `LocalTaskFocus.tsx` (reserva propia) para enlazar por instalación + captura + contexto + `taskId` + `attemptId` (el gestor ya los guarda en cada operación). Reabrir no debe hacer PATCH ni volver «incierto» un formulario listo para reenviar. Pruebas: homónimas (en el spec de 171 `task-2` y `task-3` ya son «Llamar a Ana»), mismo ID en otra captura (`swap` en el servidor de prueba), respuesta tardía, fila completada, cierre/reapertura, foco y borrador.
2. **Comparador 199 y adopción 166/183/185 (paquete 5).** El gestor conserva `revision` y `detail.revisionConflict`, pero `mapOutcome` no conserva `changed/unchanged/current` ni el token de 166/183: hace falta una **estrategia** nueva (`SaveStrategy`) y/o una unidad que amplíe el contrato `TaskSaveOperation` (`shared/task-save-outcome.ts`, hoy done). No renovar tokens para reenviar en silencio; un acuse perdido solo comprueba con GET.
3. **Persistencia tras bloquear/recargar.** El aviso actual solo cuenta (`DisposeSummary`). Si se persiste, no guardar textos de tareas ni borradores en un aviso público; necesita almacenamiento (Store/Recovery, reservas de Codex) y una decisión sobre qué se puede conservar de un intento enviado.
4. **Hallazgo abierto:** el banner de error de Hoy muestra el mensaje del servidor sin filtrar (`LocalOperations`, pre-existente).

## Cómo repetir y ampliar las pruebas de App real
- Plantilla: `tests/e2e/task-d7-real-app.spec.ts` (copia congelada de `src/`, servidor real, `holdAck(lose)`, `page.route` para 401/404/409/422, `call('swap')` para cambiar de captura, `start(page, {protectedSession:true})` para bloqueo y desbloqueo reales). `PLANB_U2_PRE=1` reproduce la App anterior; `PLANB_U2_MUTATE=<nombre>` aplica un mutante; `PLANB_U2_DEV=1` compila en desarrollo (modo estricto).
- Los specs 140/148/136/151/155 necesitan raíces **absolutas**; el navegador instalado en este equipo es el headless-shell 1228 (config propia con `executablePath`).
- La línea base 153 invertida (`tests/e2e/task-d7-real-app-baseline.spec.ts`) conserva los mismos escenarios; el original (`10e077c2…`) está en `tests/.tmp/u2-171/evidence/`.

## Coordinación
Dos sesiones Claude figuran como `claude` en el tablón: el tablón no las distingue. Antes de editar, comprobar `mtime`/hash de la ruta y comunicarlo; **no usar `Write` sobre un archivo sin comprobar que no existe** (así se sobrescribió el trabajo ajeno en esta unidad).


## R2 (dictamen 209)

`TaskOutcomesHost` publica ahora un control `TaskOutcomesControl {seal, resume}` por `controlRef`: quien inicie el cierre del acceso debe llamar a `seal()` **antes de cualquier espera de red** y a `resume()` solo si el cierre no se completa (empieza un propietario nuevo; el sellado no se reactiva). `onClosed(summary, reason)` distingue `closed` de `lock-not-completed`. El resumen separa «confirmado por el servidor» de «lectura aceptada por ti» (`accepted`), y el fallo de recarga es otra dimensión. Las unidades siguientes que toquen el cierre o el resumen deben conservar esas dos reglas.
