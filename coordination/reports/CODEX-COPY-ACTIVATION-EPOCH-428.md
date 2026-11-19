# Identidad de la copia al activar una captura · 428

Preparar y activar una captura puede sustituir todos los registros manteniendo ID, fecha y sesión. La época local que se usa para comprobar confirmaciones de la copia quedaba igual. En la rama de activación que sustituye registros, Store genera ahora otra época dentro de la transacción. La revisión de una candidata y la activación de solo esquema conservan la época. Un fallo al guardar la generación revierte época, registros, historial y candidata.

La API de activación revisada acredita las tres ramas. Antes del cambio fallan la renovación y el reintento tras revertir. Después pasan las tres. La batería relacionada de Preparación, restauración, caché y Deshacer pasa 45/45 y el chequeo completo de tipos pasa. Las fuentes copiadas conservan sus huellas.

En un ensayo temporal de composición, la marca antigua de CSV se aplicó con 200 cuando solo cambió Store y cuando solo se leyó la época en CSV con Store anterior. En ambas pruebas aparecieron un registro y un cambio. Al combinar la época nueva con su lectura en CSV, se rechazó la marca con 409 y quedaron 62 registros y 0 cambios. La copia temporal modifica el cálculo de CSV para comprobar la dependencia. Incorporar esa lectura corresponde a la entrega CSV R3.

El primer ensayo de composición se detuvo antes de ejecutar la API porque faltaba package.json en la copia. Con ese archivo, el ensayo terminó y registró las tres ramas. Banco tests/.tmp/copy428-c70bd4b533224120a16c080f047606b2. Evidencia en before.log, related.log, types.log, completion.json y csv-composition.json. La modificación de Store se hace bajo la reserva de 388. Se usaron datos ficticios y API inyectada.
