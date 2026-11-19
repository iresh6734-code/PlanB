# Buscador · rechazar una copia obsoleta antes de recorrer fichas (207)

5/11/2026, 17:28:45, Europe/Madrid. Presentada para revisión independiente.

Tras cambiar de copia, una petición antigua del buscador calculaba la revisión completa sobre todas las fichas activas antes de comparar la identidad de la copia. Una apertura antigua también podía terminar en 500 si la lectura de fichas fallaba, aunque el servidor ya disponía de la identidad necesaria para devolver 409.

La búsqueda y la apertura comprueban primero la identidad activa y comparan el contexto o el ID de captura cuando la petición los aporta. Si no coinciden, devuelven el 409 existente sin recorrer la tabla de fichas activas. Dentro de la misma copia, la ruta sigue leyendo las fichas para calcular la revisión exacta y rechazar una lista que cambió tras una edición. La identidad conserva la captura completa, la generación y la sesión. Se conserva el criterio de `Store.ready` y se evita consultarlo dos veces en la misma petición.

## Verificación

Corte privado `tests/.tmp/search207-d893c6b1`. Las dos regresiones nuevas fallan con el hash aceptado de 053 y pasan con la corrección. En la primera, sustituir la captura mediante Store deja la pestaña anterior con un token obsoleto. El baseline devuelve 409 después de enumerar una vez las fichas. El cambio devuelve 409 con cero enumeraciones. En la segunda, un fallo sintético de lectura produce 500 en el baseline. La corrección devuelve el conflicto de captura sin llamar a ese lector. El control positivo mantiene el rechazo de la revisión antigua después de una edición dentro de la misma copia.

Pasaron 30 pruebas en cinco suites, sin omisiones y con typecheck focal limpio. Incluyen rutas normales de Fastify con inyección, autenticación local, identidad de App, búsqueda y paginación, apertura por revisión y el arnés de respuestas tardías. Las dos revisiones de una misma ficción coinciden exactamente con el baseline. Resultado y huellas en `result.json`. Logs `baseline.log`, `final.log` y `typecheck.log`.

El ahorro acreditado es una enumeración completa de fichas activas en cada solicitud que ya se puede rechazar por identidad. La lectura de metadatos y el hash de la captura siguen siendo necesarios. La prueba sintética de error no modifica la base. El arnés de cliente comprueba comportamiento sin navegador. La demo 202 continúa mostrando el corte 193 hasta que se acepte y monte otro corte.
# Integración con el índice de búsqueda de Claude

Se conservó el índice de la entrega SEARCH-PERF-R. La protección verifica la versión de SQLite antes de identificar la copia y después de leer sus registros. Los tres casos incorporados a esta reserva fallan con el servidor anterior y devuelven 409 con la protección, tanto en búsqueda como en apertura. Las 70 pruebas de búsqueda y consumidores, incluida la medición de Claude, pasan. [Dictamen 457](../reviews/CODEX-SEARCH-PERF-REVIEW-457.md)

La integración 459 comparte la lectura de versión con las rutas de estado. Las dos rutas de búsqueda conservan su control. Las regresiones de búsqueda y estado pasan en la misma batería. [Evidencia 459](CODEX-WORKSPACE-STATE-CONSISTENCY-459.md)
