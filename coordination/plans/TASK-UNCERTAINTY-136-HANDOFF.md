# 136 · Traspaso a Codex: integrar el seguimiento de guardados (D7) y preparar 128

Este traspaso **no autoriza editar** `LocalTaskFocus`, `LocalOperations`, `App`, `server/app.ts` ni 128. Cada unidad de abajo necesita reserva exacta (comprobar el tablero en ese momento: 123 y 130 estaban `done`, pero 053/otras pueden reservar `App.tsx`/`server/app.ts`).

## Contrato (lo que ya existe y está probado en arnés)

```ts
// src/task-save-outcome.ts
createTaskSaveOutcomes({ strategy?, onConfirmed?, queueTimeoutMs?, maxOperations? }): TaskSaveOutcomes
interface TaskSaveOutcomes {
  submit(input: { taskId; taskLabel; baseline; entity; patch; context; revision?; signal? }):
    { kind: 'started'; attemptId; done: Promise<Op> } | { kind: 'busy'; existing: Op } | { kind: 'refused'; reason };
  verify(attemptId): Promise<void>;          // SOLO lee, ligada a la copia original
  accept(attemptId): boolean;                // decisión humana; solo si la lectura coincide
  retry(attemptId): Submission;              // explícito; solo not_sent o «sin cambios»; COMPARTE la exclusión de submit (R2: si hay otra operación sin resolver de la misma tarea y copia → `busy`, sin tocar nada)
  retryQueue(attemptId): Promise<void>;      // SOLO lectura; nunca escribe
  setOnConfirmed(cb | null): void;           // la vista de Hoy se registra/retira; lo pendiente espera
  dismiss(attemptId): boolean; get/list/subscribe/getSnapshot/whenIdle
}
// src/TaskSaveOutcomes.tsx
<TaskSaveOutcomesPanel controller={...} onOpenTask={id => ...} />   // superficie persistente
// Estrategia inyectable (hoy legacyStrategy sobre 123; mañana 128):
interface SaveStrategy { save(request, { onDispatch }): Promise<SaveOutcome>; verify(request): Promise<Verification> }
```

Estados (`shared/task-save-outcome.ts`): `in_flight` · `confirmed` · `accepted` (decisión humana, no acuse) · `rejected` (llegó y el servidor dijo 4xx: nada escrito) · `not_sent` · `uncertain`. Con evidencia aparte: `applied | unchanged | diverged | context-changed | missing | locked | unknown`.

## Plan de integración en unidades separadas (cada una con reserva exacta)

| # | Unidad | Rutas a reservar (comprobar con `check-path`) | Criterios verificables |
| --- | --- | --- | --- |
| U1 | **La ficha delega en el gestor** (cierra D7 de verdad) | `src/LocalTaskFocus.tsx`, `src/local-task-focus-client.ts` (si cambia el contrato), `shared/local-task-focus.ts`, `tests/local-task-focus*.test.ts`, `tests/e2e/local-task-focus.spec.ts`, `design/task-focus123/README.md` | Nueva prop opcional `outcomes?: TaskSaveOutcomes`. Con ella, «Guardar» llama a `outcomes.submit`; al cerrar con la operación en vuelo no hay aviso de «se descarta»: el seguimiento queda en el gestor. Con `busy` la ficha no envía. Las 26 pruebas DOM y 32 Node de 123 siguen pasando sin `outcomes`. Prueba nueva: cerrar la ficha real con PATCH aplicado y acuse perdido → la superficie muestra «No se sabe…». |
| U2 | **Montaje en Hoy por ID y propietario por encima de la navegación** | `src/LocalOperations.tsx`, su CSS/pruebas, y `src/App.tsx` **o** un módulo singleton (`getTaskSaveOutcomes()`) para no tocar App | Botón por fila con nombre `Abrir «{label}» ({id})` (hay homónimas); un solo `<TaskSaveOutcomesPanel>` montado mientras se navega; `setOnConfirmed(recargaQueRechaza)` al montar Hoy y `setOnConfirmed(null)` al desmontar. **`onConfirmed` debe rechazar si la recarga falla**: `load()` actual captura sus errores y no lanza. Verificar: forzar fallo de `GET /api/v7/local-operations` tras un PATCH confirmado → «la cola de Hoy no se actualizó»; reintento → solo GET. Navegar a Agentes y volver con un guardado pendiente: la superficie y el resultado siguen. |
| U3 | Foco cuando la fila desaparece | misma unidad que U2 | Guardar «Completada», cerrar: `document.activeElement !== document.body` (a la cabecera de la cola o a la fila siguiente). |
| U4 | Protección del borrador al cambiar de tarea | U1/U2 | Intentar abrir otra tarea con la ficha sucia pasa por «Hay cambios sin guardar» (hoy `taskId` cambia sin preguntar). |
| U5 | **Verificación en la App real** | solo pruebas nuevas (sin tocar fuentes) | 1440/390/320 con la barra lateral real, teclado (Tab→«Comprobar ahora»→Enter), controles ≥44 px móvil; tarea con fecha-hora si la especificación real la tiene (probado en arnés con fixture ficticia); acuses inciertos y conflictos. |
| U6 | **Servidor: montar 128** | `server/app.ts` (comprobar reserva 053) + pruebas | `registerTaskRevision(app, store)` en `createBaseApp`; verificar que el lanzador usado adquiere `lockInstance` (la revisión 129 lo comprobó en el principal; otros lanzadores no) → escritor único. |
| U7 | **Estrategia de 128 en el cliente** | `src/task-revision-strategy.ts` (nuevo) + pruebas | Tomar `revisionStrategy` de `tests/task-save-outcome.test.ts` como referencia. Criterios en la sección siguiente. Depende de U6. No se vende como CAS multiproceso. |

Orden recomendado: U1 → U2/U3/U4 → U5; U6 → U7 en paralelo e independientes de la ficha.

## Contrato de adopción de 128 (U6/U7)

- **Al abrir**: `GET /api/v7/task-revision/:id` → `{ format, revision, instanceId, captureId, capturedAt, record }`. Guardar `revision` junto con lo que la persona vio (`SubmitInput.revision`); el esquema/campos siguen viniendo de `/api/v2/state`.
- **Al guardar**: `PATCH` a la misma ruta con `{ expectedRevision, values }` (solo campos cambiados). Respuesta `{ ok, changed, current }`; `current` trae la **nueva** revisión: hoy `SaveOutcome` no la transporta → o la estrategia la guarda en el registro de la operación, o la cola/reapertura la relee.
- **409 de revisión vs devolución en curso**: ambos son 409. Distinguir por `details.code === 'TASK_REVISION_CHANGED'` (el manejador de errores devuelve `details`); el resto (p. ej. «Espera a que termine la devolución revisada») no es conflicto de revisión y no se resuelve comparando valores. Probado en el adaptador.
- **Comparar lo visto / lo escrito / lo actual**: la operación ya conserva `baseline` (lo visto) y `patch` (lo escrito); ante un 409 de revisión, releer (`GET`) y mostrar las tres versiones antes de volver a confirmar. **No existe esa UI todavía** (es parte de U7). Sin reintento automático.
- **Por qué un reintento tras un guardado aplicado puede dar 409**: la revisión incluye la última entrada de historial de la tarea; tras aplicarse el primer PATCH la revisión cambia, así que reenviar con la antigua se rechaza (probado). Eso protege de duplicar, pero **no es idempotencia por intención**: el mismo guardado con revisión nueva se aceptaría.
- **Lo que 128 NO aporta**: idempotencia por intención; protección de las rutas antiguas (probado: `PATCH /api/records/tasks/:id` sigue escribiendo y cambia la revisión); CAS multiproceso (la comparación y el guardado son síncronos para **un único escritor** dueño del `Store`; la exclusión depende del lanzador); autenticidad (el hash no es una firma).
- **Verificación con valores iguales**: con 128, «revisión distinta + valores coincidentes» = `applied`; sigue sin demostrar autoría (probado con una edición idéntica de otra persona).
- **Huecos hallados al integrar (ninguno bloqueante)**: la nueva revisión no viaja en `SaveOutcome`; `changed:false` debería rotularse «sin cambios» (hoy se mapea a «confirmado»); 128 no expone cuenta/generación en la vista (identidad de contexto más débil que la de 123; compensada por la revisión). Coste de la revisión con capturas grandes: sin medir (lo declara 128).

## Persistencia entre recargas: propuesta, NO implementada ni probada

Hoy es **solo memoria** y la superficie lo dice. Si se quisiera recordar un guardado incierto tras recargar: `sessionStorage` (dura lo que la pestaña), un registro **sin valores escritos** — `{ attemptId, taskId, taskLabel, contextKey, camposModificados (solo claves), status, startedAt }` — porque `patch` contiene texto de la persona y no debe quedar en el navegador. Con eso solo se puede avisar «había un guardado incierto de la tarea X: ábrela y compruébala»; **no** se puede verificar «aplicado/sin cambios» sin los valores. Si cambia la instalación o la captura (clave de contexto distinta), el registro se descarta. Caducidad: al cerrar la pestaña. Requiere su propia unidad, pruebas y decisión de producto.

## Qué sigue dependiendo del servidor (no del gestor)

Escrituras concurrentes de otras pestañas/procesos; atomicidad entre comprobación previa y PATCH (API antigua); idempotencia; y cualquier garantía multiproceso. El gestor garantiza solo: registro previo, estados honestos, ningún reenvío automático, verificación ligada a la copia, cola separada y exclusión de doble envío **dentro de su ventana**.

## Reproducir las pruebas

```powershell
npx tsx --test tests/task-save-outcome.test.ts
$env:PLANB_TS136_ROOT="<carpeta propia bajo tests/.tmp>"; npx playwright test -c "<carpeta propia>/pw.config.ts"   # el config usa chrome-headless-shell; ver informe
```

Los specs construyen su bundle y arrancan un servidor hijo propio (puerto efímero, red externa bloqueada); no usan `npm run build`, `dist` ni demos existentes.

## R2 (revisión 147, F1)

`retry` y `submit` comparten una única guarda en `start`: nunca hay dos operaciones sin resolver para la misma tarea y copia dentro del gestor. Para U1/U2 esto significa que el consumidor **debe tratar `busy` como respuesta normal** de `submit` y de `retry` (la superficie ya lo hace con un aviso). Sin cambios en el resto del plan.
