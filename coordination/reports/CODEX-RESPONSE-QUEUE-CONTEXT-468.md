# Radar anclado a la identidad del espacio

19/11/2026, Europe/Madrid. Hecho por Copilot con autorización de la usuaria, en lugar de Codex.

## Problema

Al restaurar una copia con el mismo ID de captura y la misma fecha, pero con otro portal o con otras tareas, el radar no tenía forma de saber que el contexto que veía la pantalla ya no era el activo. Mezclaba la procedencia antigua con las tareas nuevas.

## Cambios

- `GET /api/v2/continuity/response-queue` acepta `contextRevision` de forma opcional. Si la revisión no coincide con la identidad actual del espacio (`workspaceSearchContext.contextRevision` de `/api/v2/state`), responde 409 con `details.code = RESPONSE_QUEUE_CONTEXT_CHANGED`, sin tareas ni procedencia. Un valor mal formado o repetido da 422.
- Toda respuesta incluye `source.contextRevision`, y el GET sin parámetro sigue funcionando como antes.
- `RadarPanel` puede anclarse con `workspaceContextRevision`; el detalle está en el informe de 466. El montaje sigue en Grafito.

## Evidencia

- `tests/response-queue-context-468.test.ts`: antes daba 422 porque el parámetro no existía y ahora pasa. El caso cubre la sustitución de la copia con el mismo ID y fecha: 409 sin tareas, el contexto nuevo devuelve el portal y la tarea actualizados, el GET heredado es compatible y no hay escrituras en la lectura. También se rechazan el contexto mal formado y el repetido.
- Resultado conjunto con 464 y 466: 26/26. Cola de respuesta y revisión independiente: 54/54.
- Todo con inyección HTTP local y SQLite en memoria, con datos ficticios. No se lanzaron servidores ni navegador, y el piloto no se tocó.
