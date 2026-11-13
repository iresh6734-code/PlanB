# HOY-POR-DECIDIR-A2 · Traspaso

Este traspaso no autoriza editar `LocalTaskFocus.tsx`, `TaskOutcomesHost.tsx`, `LocalOperations.tsx` ni `App.tsx`.

## Qué queda en la App

`TaskSaveOutcomesPanel` (dentro de la superficie `TaskOutcomesSurface` del host) muestra el filtro «Todos / Por decidir». Exporta `decisionGroup(op)` (función pura: `uncertain | rejected | queue-failed | in-flight | null`) y `OutcomesFilter`.

## Para quien monte A3 / A4

- **A4 («Trabajo por recuperar»)** debe alojarse junto a Resultados y reutilizar los mismos grupos si muestra intentos del cuaderno: «Sin saber si se aplicó» ↔ incierto, «No se aplicó» ↔ rechazado. No dupliques acciones: abrir y comprobar ya existen y solo leen.
- El filtro es estado del panel (se conserva al navegar mientras la superficie siga montada); no es persistente tras recargar.
- «En curso» no cuenta como decisión: no lo uses para avisos de atención.
- `needsAttention` de `shared/task-save-outcome.ts` (barra del host) NO cambia: cuenta también `queue.status === 'updating'`; el filtro no lo hace porque «actualizando» no pide ninguna acción.

## Huella

`TaskSaveOutcomes.tsx` y `task-save-outcomes.css` quedan fijados en `tests/task-focus-outcomes.test.ts` (sustituye a `CLAUDE-TASK-PINS-220`). Un cambio posterior exige repetir sus 7 pruebas Node y las especificaciones de navegador del panel antes de renovarla.
