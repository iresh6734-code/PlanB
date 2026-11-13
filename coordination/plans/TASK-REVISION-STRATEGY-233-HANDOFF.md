# TASK-REVISION-STRATEGY-233 · Traspaso para el consumidor en ficha, host y panel

Este traspaso no autoriza editar `LocalTaskFocus.tsx`, `TaskOutcomesHost.tsx` ni el panel mientras 219 esté en revisión.

## Cómo consumirlo

```ts
// Al abrir la ficha (en lugar de loadTask, solo en modo condicionado):
const opened = await loadRevisedTask(taskId, signal);            // contexto + esquema + registro + TOKEN de UNA lectura validada
// Al guardar:
outcomes.submit({ taskId, taskLabel, baseline: opened.record, entity, patch, context: opened.context, revision: opened.revision });
// El host crea el gestor con la estrategia declarada:
createTaskSaveOutcomes({ strategy: revisionStrategy(), onConfirmed });
```

- El token de la ficha pertenece a la versión que la persona REVISÓ: no se renueva, ni se relee para reenviar. Si `loadRevisedTask` falla o cambia el contexto: mostrar el error y conservar el borrador; **no** caer al modo anterior.
- Resultados: `op.status === 'confirmed'` + `op.detail.kind === 'saved'` (con `op.revised`) = guardado; `detail.kind === 'unchanged'` = **no-op** (texto y acciones distintos; sin historial); `rejected` + `detail.revisionConflict` = conflicto sin escritura → abrir el comparador 199 con la base que vio la persona, su borrador y una lectura ACTUAL explícita (`loadRevisedTask`), y solo una decisión nueva produce otro intento con el token de ESA lectura.
- `accepted` conserva «aceptado por ti» (sin `revised`).
- **Identidad (R2)**: la estrategia exige `request.taskId === request.baseline.id` en guardar y verificar, antes de cualquier petición. El adaptador de la ficha DEBE entregar `taskId`, `baseline`, `revision` y `context` de la MISMA lectura (`loadRevisedTask`); si se mezclan, el guardado queda «no enviado» (cero peticiones, intención conservada, sin `revised`) y la verificación devuelve «desconocido». No dependas de esta guarda para elegir la tarea: es la red de seguridad, no el mecanismo.
- La configuración del modo (condicionado vs anterior) debe ser explícita; un error condicionado nunca dispara el PATCH anterior.

## Efectos heredados a contemplar

`readContext` (123), usado por el cliente 183, emite `planb:locked` ante un 401 en el navegador; el host y el orden de autenticación 158 deben contemplarlo. El host conserva `seal()` al iniciar el bloqueo (171).

## Pruebas que el consumidor debe añadir (App real)

Dos editores desde la misma revisión (ganador, conflicto visible, decisión humana, nuevo guardado con su token, no-op sin fila nueva), cambio de generación, bloqueo retenido, 422 con borrador, referencias, respuesta perdida con comprobación solo por GET y que «aceptado por ti» conserve su significado en ficha, resumen y lista.
