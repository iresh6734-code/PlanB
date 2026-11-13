# TASK-ATTEMPT-REOPEN-219 · Traspaso (siguientes unidades)

5/11/2026, Europe/Madrid. Este traspaso **no autoriza editar** las rutas de 219 mientras esté en revisión. Cada unidad siguiente necesita encargo, reserva y `check-path`.

## Qué existe ahora

- `shared/task-attempt-adoption.ts`: `resolveAdoption(ops, { taskId, context, requestedAttemptId })` → `none | adopt | restore-draft | refused (other-copy | gone | other-task | ambiguous)`. Compara `contextKey` (instalación + captura + fecha + inicio + cuenta + generación) y `taskId`; nunca título.
- `LocalTaskFocus` acepta `adoptAttemptId?: string | null`: **`undefined` = no adopta** (comportamiento de U1, conservado para su prueba); `null` = adopta solo un intento único compatible; un ID = ese intento. Adoptar = enlazar el seguimiento de la ficha a ese intento (mismo estado, sin PATCH, sin formulario de reenvío); `restore-draft` rebasa lo escrito sobre la tarea actual y **no descarta** el aviso; `refused` muestra el motivo y no inicia nada.
- Cadena de apertura: panel `Abrir la tarea: …` (ahora también para inciertos y en curso) → `onOpenTask(taskId, attemptId)` → host `openTask` → `App.taskRequest {taskId, attemptId, nonce}` → `LocalOperations` → `LocalTaskFocus adoptAttemptId`. Abrir desde la fila de Hoy pasa `null` (adopta solo si hay exactamente uno).

## Límites que las unidades siguientes deben conocer

1. **Varios intentos abiertos de la misma tarea y copia** no pueden coexistir hoy (el gestor devuelve `busy`); la rama `ambiguous` solo se prueba en Node. Si 128/166 o la persistencia (208) permiten coexistir, habrá que probarla en App.
2. **Pins de otras unidades**: modificar `LocalTaskFocus.tsx` y `TaskSaveOutcomes.tsx` rompe por diseño dos huellas que no son de esta unidad: `tests/task-focus-outcomes.test.ts` (pin de `TaskSaveOutcomes.tsx`) y `tests/task-focus-followup.test.ts` (pin de `LocalTaskFocus.tsx`, reservada por Codex 196). Requieren su propia unidad cuando 219 esté aceptada (se registra una para la primera; la segunda es de la reserva 196).
3. **Fallos previos**: `independent-task-focus-123.test.ts` «observation F1/F2» siguen rojos (no tocan 219).
4. **Sin persistencia**: tras recargar el seguimiento no existe; el cuaderno 208 no está montado.
5. **No cubre**: la vista «Por decidir» (siguiente unidad), el comparador 199 (montaje en ficha) ni el guardado condicionado 166/183/185.

## Pruebas para repetir

`tests/task-attempt-adoption.test.ts` (9 Node) y `tests/e2e/task-attempt-reopen.spec.ts` (8 recorridos en la App real, plantilla de 171). Mutaciones: `PLANB_U2_MUTATE=no-adoption|adopt-other-copy|panel-without-attempt|request-drops-attempt`. Raíz absoluta con `PLANB_U219_ROOT`.

## Hallazgo de proceso

Escribir con Python en modo texto convierte `\n` en `\r\n` en Windows: cambió la terminación de línea de cinco fuentes y rompió una prueba de forma de U1 (`/…\n/`). Se normalizó a LF antes de presentar. Usar modo binario o `newline=''`.
