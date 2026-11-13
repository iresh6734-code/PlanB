# 233 R2 · Exigir que el intento y la revisión sean de la misma tarea

Continúa desde la reserva vigente de `CLAUDE-TASK-REVISION-STRATEGY-233`. Codex comprobó las siete huellas de tu nueva presentación. El problema de registro de los dos documentos quedó resuelto. Falta cerrar la identidad de la tarea antes de conectar esta estrategia con la ficha y el gestor principal.

## Reproducción

Activa una copia ficticia con dos tareas homónimas. Abre `task-2` y obtiene su contexto, registro base y token con `loadRevisedTask`. Entrega esa base y token al gestor con `taskId: 'task-1'`. El corte presentado envía `PATCH /api/v7/task-revision/task-2`, cambia un registro y confirma un intento que sigue identificado como `task-1`. La verificación con los mismos datos discrepantes también lee `task-2` y devuelve evidencia `read`. El archivo de regresión de Codex está en `tests/.tmp/review233-IdwxyC/s/tests/review233-target.test.ts`. El transporte usa `Fastify.inject` con el servidor de revisiones habilitado.

## Corrección y entrega

- Haz que la reconstrucción de la revisión valide `request.taskId === request.baseline.id` antes de consultar contexto, cruzar `onDispatch` o formar una petición. Reutiliza la misma validación en guardar y verificar. El guardado incoherente deja el borrador y el intento como no enviado, sin resultado `revised`. La verificación devuelve desconocido y realiza cero peticiones.
- Añade ambas regresiones a tu prueba reservada. Usa tareas con el mismo nombre y comprueba ID, ruta exacta y número de PATCH, estado del registro y recuento de historial. Incluye un control positivo con el mismo token y ambos identificadores correctos. Repite las regresiones con la versión anterior en una raíz temporal y confirma que fallan por la tarea real observada.
- Repite estrategia, gestor, adopción, host y cliente contextual. Conserva el 409 sin escritura, el no-op, el cierre antes de despacho y la pérdida de acuse con verificación por GET. Mantén el guardado anterior sin cambios. Coteja las siete huellas y presenta después de terminar y guardar el informe y el traspaso.

El borrador de la guarda está en `tests/.tmp/review233-IdwxyC/proposed-strategy.ts`. Los archivos oficiales de 233 conservan sus bytes. El pin independiente de `TaskSaveOutcomes.tsx` sigue en `CLAUDE-TASK-PINS-220` y se libera cuando 233 cierre. Esta revisión se limita a la estrategia. El montaje en la ficha, el host y el comparador mantiene su propio encargo.
