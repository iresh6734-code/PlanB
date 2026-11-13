# 271 · Revisión independiente de la descarga portátil

6/11/2026, Europe/Madrid. Se repitió el recorrido sobre una suite propia en `tests/.tmp/portable271-independent-xsdtON`. Antes de ejecutar se cotejaron las tres fuentes del arnés y los 5.524 recursos de su manifiesto. Chromium, servidor y runtime usan loopback con red externa bloqueada y una base ficticia nueva.

El recorrido alcanzó descarga, extracción, restauración y reinicio. En la segunda lectura de evidencia falló `response.json()` con `Network.getResponseBody: No data found for resource with given identifier`, dentro de `portableEvidence`, línea 38 de la suite. Se conserva el log, captura y contexto. La limpieza del arnés confirmó el cierre de sus tres procesos.

Dictamen de corrección del arnés. La lectura capturada por Playwright puede quedar sin cuerpo si el consumidor cancela esa solicitud. Mantener la comprobación del estado y del pin de la solicitud UI, esperar su resultado visible y validar el cuerpo por un GET independiente con la misma sesión y pin permite exigir el mismo comportamiento sin depender del cuerpo retenido por Chromium. La autora de 271 debe presentar y ejecutar esa corrección en sus dos rutas reservadas. El fallo observado no demuestra pérdida de los datos restaurados.

## R2 · Dictamen favorable

Cierre de revisión el 7/11/2026, Europe/Madrid. La repetición independiente de R2 en `tests/.tmp/portable271-independent-2feySx` pasó 1/1 sin reintentos. Se cotejaron nuevamente los dos hashes de la entrega y los tres archivos ejecutados por la suite. Los 5.524 recursos del paquete se verificaron antes de ejecutar. La prueba conserva la petición UI con respuesta 200 y pin confirmado, comprueba la copia observada y valida el JSON por una lectura independiente de la misma sesión y copia.

Los rechazos 422/422 conservaron la base. La restauración 200 mantuvo los 62 registros y una fila de historial. El proceso de destino cambió de PID 13384 a 27628 y conservó identidad `aeb85055-5c20-425c-af1a-ea064e9c9c43`, pin y revisión de bundle. El productor 14696 y ambos destinos tienen recibos de cierre y PID ausente. La prueba no observó errores de página ni tráfico externo. Los 404 de capacidades opcionales conservan su clasificación por ruta. La ejecución y los recibos se obtuvieron antes del cierre de esta revisión y se conservaron.

Se acepta 271 R2 en su alcance de ZIP ficticio, restauración y reinicio en el mismo equipo. Este paquete conserva el iniciador anterior a 272. El montaje del ensayo de relevo y el resto de la candidata conjunta mantienen sus tareas propias.
