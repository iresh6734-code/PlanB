# El acuse compacto de A4 sobrevive al reinicio

11 de noviembre de 2026, Europe/Madrid. Unidad `CODEX-A4-COMPACT-RESTART-331`.

El primer proceso abrió una base SQLite ficticia, creó una tarea con más de 512 KiB en campos válidos y guardó un cambio con A4. El servidor registró que la respuesta contenía `response-too-large` y ningún registro. El cliente descartó el cuerpo tras recibir el 200. El escritor se invocó una vez y SQLite añadió una fila de historial.

El segundo proceso abrió el mismo archivo. La sesión anterior recibió 401 y el nuevo inicio de sesión permitió listar el mismo intento, de la misma tarea y copia, con `server-ack`, `acknowledged` y revisión resultante. El detalle conserva ese acuse. Comprobar devuelve evidencia indisponible por tamaño y registro nulo. Repetir el POST con el mismo cuerpo e identificador devolvió un replay con el mismo acuse y `not-retained`. Los registros y el historial de SQLite conservaron sus bytes y el contador del escritor siguió en uno.

En `tests/.tmp/check331-i72oOe` pasó **1/1** con typecheck focal limpio y 332 fuentes congeladas. La prueba usa Fastify y la API A4 aceptada, autenticación ficticia, HTTP de loopback y dos procesos identificados y cerrados por el propio banco. El primer banco detectó una referencia circular en el tipo auxiliar del arnés y se corrigió antes de ejecutar el recorrido. El banco usa el servidor compuesto para la prueba. El montaje de A4 desde Hoy y los ejecutables de la entrega final siguen sus pruebas separadas.
