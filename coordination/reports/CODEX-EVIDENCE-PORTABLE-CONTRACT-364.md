# El portátil conserva la consulta protegida de evidencia local

La unidad 239 registró la evidencia en el generador. La entrega aceptada CODEX-PORTABLE-CONTINUITY-EVIDENCE-270 añadió la misma consulta de lectura al runtime. La expectativa 404 de 239 quedó desfasada. La prueba nueva comprueba que el portátil devuelve 200 con sesión y revisión vigentes, 401 sin sesión, 409 sin hechos para otra revisión y 404 por POST. Las lecturas conservan las tablas y no renuevan la cookie.

El arnés asigna un identificador propio a la base de ensayo y espera hasta 60 segundos a que salud devuelva esa identidad. La espera termina si el proceso se cierra. La anterior tenía un número fijo de intentos y había fallado por tiempo de arranque bajo carga.

**Verificación.** En tests/.tmp/evidence364-1tTmMa, el arranque previo desde fuente agotó la espera. Compilé ambos puntos de entrada desde la copia y la expectativa anterior falló con 200 frente a 404, acreditando la divergencia. Con el mismo binario, pasan 2/2 de montaje. Desde fuentes pasan 3/3, incluido el contrato anterior de escritura condicional y exclusión de dueño. tsc --noEmit limpio. Bases nuevas con claves ficticias y red exterior bloqueada.

Cambió la suite de montaje. Los puntos de entrada mantienen el código de la copia revisada. No se ejecutó el piloto ni se repitió npm test global. El manifiesto de fallos pertenece a CLAUDE-CI-LOCAL y todavía conserva sus entradas anteriores.

- SHA-256 tests/continuity-evidence-mount.test.ts 2cd72d25814d247276d187f11bfacdfa0f5629c78a98a64bea616d75a6fe3c34
