# Deshacer R3 · Revisión independiente 426

Dictamen favorable. La entrega vincula cada guardado con la época local de la copia y la vuelve a comprobar dentro de la transacción del inverso. Restaurar genera una época nueva aunque el respaldo conserve sesión, captura y último cambio. La época se escribe dentro de la misma transacción de restauración.

En la API local inyectada, PATCH devolvió la etiqueta completa. Restaurar el mismo respaldo conservó la sesión e invalidó la etiqueta anterior con 409 OTHER_COPY. El rechazo conservó registro, historial y época. Tras un nuevo PATCH, Deshacer respondió 200 y añadió un solo inverso. Repetir esa petición devolvió 409 sin añadir cambios. En otro almacén ficticio, una escritura rechazada del recibo de restauración devolvió 500 tras iniciar la transacción. El estado anterior y su época se conservaron. La etiqueta emitida antes del intento siguió siendo válida y Deshacer respondió 200.

Cinco suites pasan 140/140. Incluyen Deshacer, restauración transaccional, caché de registros y dos suites de interfaz. El chequeo completo de tipos termina con código 0. Por lectura del cableado actual, la ficha y la edición en lista pasan la época emitida por PATCH al aviso de Deshacer y la envían al endpoint. La verificación independiente cubre la API y las suites de interfaz, sin un recorrido de Deshacer en navegador.

Se cotejaron los cuatro archivos entregados y sus dependencias actuales. Store a4246275ef0f pasa las ocho regresiones de 388. App 210b334a273a y components ab5d71534bba corresponden al corte compartido probado. La batería congelada y la presentación conservaron sus huellas.

Banco tests/.tmp/undo426-wgthDu. inputs.json fija fuentes y entrega. related.log, types.log y completion.json guardan la batería. probe-r3.mjs, probe-r3.log y observations.json guardan los dos controles de API. Dos preparaciones previas del ensayo fallaron por falta del entorno de prueba y por crear dos veces la carpeta temporal. Los resultados citados corresponden al ensayo corregido.
