# La cola respeta la cancelación antes de iniciar y conserva el resultado final

15/11/2026, Europe/Madrid. Al ejecutar un trabajo encolado, se comprueba la señal antes de invocar la tarea. Una cancelación antes de empezar queda guardada como cancelada. El progreso solo se persiste mientras el trabajo está ejecutándose y su señal sigue activa. Un callback tardío ya no cambia la descripción, el porcentaje, la hora ni el orden del historial después de terminar. Un fallo de SQLite al guardar la entrada inicial deja libre el turno para reintentar.

La cancelación durante la ejecución sigue entregando la señal al trabajo y mantiene el turno hasta que termina. El control existente del importador comprueba que una captura cancelada conserva la copia anterior.

**Verificación.** En una copia con server/jobs.ts anterior, los cuatro casos nuevos fallaron por invocación del trabajo cancelado, dos reescrituras de progreso y cola bloqueada tras el error de SQLite. Con las fuentes actuales, 35/35 pruebas focales, incluidos cancelación del importador, captura programada y rutas v2. Typecheck limpio. Datos ficticios, SQLite en memoria para los cuatro casos y red exterior bloqueada. Batería completa y piloto instalado fuera de esta comprobación.

Banco tests/.tmp/jobs368-5kpkgm. Solo cambian la cola, su prueba y el informe. Las reservas de Claude permanecen en su estado anterior.

- SHA-256 server/jobs.ts 9ad58641940aa92585f9ad2b312d17ce19b946c8d0c388fa32f35f2555164a92
- SHA-256 tests/job-cancellation-368.test.ts 6f9863152f5dfd911d57a8ce0faea8682cd8afc814b4614d1543ad64a8477165
