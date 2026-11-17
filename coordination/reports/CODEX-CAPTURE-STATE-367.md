# El estado de las capturas refleja los intentos y resultados reales

15/11/2026, Europe/Madrid.

La hora de la operación manual se registra cuando empieza el trabajo encolado, después de las comprobaciones de recuperación, disponibilidad, conexión y exclusión. Una solicitud rechazada conserva la hora anterior. El programador conserva el estado de su intento incluso si no puede poner en cola una captura.

La captura y el estado de éxito se guardan en la misma transacción SQLite. Si falla guardar la hora de éxito o limpiar errores, la nueva captura y cualquier poda de la operación se revierten. El error del trabajo queda disponible para reintentar. La sesión y la copia activa siguen usando su ruta anterior. Antes de persistir se vuelve a comprobar la integridad de devolución, porque el importador puede haber esperado.

**Evidencia.** Dos pruebas HTTP mediante Fastify.inject con una base SQLite nueva, datos e importador ficticios. Contra la fuente anterior, ambas fallan en el estado de la operación o en el listado de capturas. Contra el cambio pasan dentro de 47/47 pruebas focales. La segunda hace fallar la escritura de captureLastSuccess mediante un trigger temporal, comprueba que no aparece la captura y verifica que un reintento la publica una sola vez. La batería incluye pausa, temporizador, reintentos, integridad de devolución y rutas v2. tsc --noEmit limpio.

Banco tests/.tmp/capture367-3th7K1. Red exterior bloqueada. No se probó el programa instalado, un proveedor ni npm test completo en este corte.

- SHA-256 server/continuity.ts 5e3768625bd236faaa6e2a731de5516256957ceadf2b1c5fa2e902464ef9dd13
- SHA-256 tests/capture-state-367.test.ts 983811b616669c59ccc23e5f7ea6f77d131af861fc54d984847e73e198f7f162
