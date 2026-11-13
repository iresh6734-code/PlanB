# ZIP de ensayo con iniciador 272 y diagnóstico de Continuidad

9 de noviembre de 2026, Europe/Madrid. Esta entrega contiene el resultado de una composición aislada y su diagnóstico. Reserva exclusiva de este informe. La candidata conjunta de Fase 0 queda bajo su coordinador.

## Candidata y descarga

El banco `tests/.tmp/portable300-3BB8Te` usó el binario main284 de la actualización288, los 15 activos de Jornada construidos en 299 con fuentes aceptadas, el runtime portátil270 y los recursos del ZIP271. Se sustituyó el iniciador anterior por 272, con SHA-256 `09b04924f764f5c7987e13a544b02782f8932c519440ba4d7fc1b6f8ca304f9c`. Se cotejaron los 5.524 recursos de paquete y las fuentes congeladas de la interfaz. El proceso productor usó datos ficticios nuevos en la raíz del banco.

La App descargó un ZIP real de **48.859.206 bytes**, SHA-256 `21d0c69ec1f6e4cfb01dece1987ffb85c3a07eb034d2fccb641e8a29ccabe3fa`. La extracción verificó destino y tipos de entrada. `archive-proof.json` confirma el iniciador272, el runtime270 y los 15 activos de interfaz dentro de la extracción. El Node incluido, v24.14.0, resolvió Fastify, static, Zod y archiver dentro del paquete. Se ejecutó el Node incluido con el arnés de prueba. El inicio de la ventana de usuario por `launch.cjs` sigue fuera de este recorrido.

## Resultado del recorrido original

Tipos correctos. Se repitió la prueba 271 byte a byte con los mismos dos helpers aceptados. Playwright informó **una prueba fallida en 148,02 s**. La última aserción de consola recibió ocho mensajes genéricos de 404. El test ya había superado la descarga cifrada, los rechazos de contraseña y cifra alterada sin cambios, restauración200, 62 registros, una fila de historial, lectura con pin, reinicio, nuevo desbloqueo y la comparación de registros después de reiniciar. También superó las aserciones de cero errores de página y peticiones exteriores antes de la aserción de consola. La prueba fallida se conserva y no se marca como 1/1.

El productor 28764 y los dos procesos del destino 24624 y 2216 tienen recibos de salida y PID ausente emitidos por el arnés. La telemetría original no guarda los URL de los ocho 404. La aserción final de escrituras y el recibo `observed-portable.json` quedaron después del fallo y no se atribuyen como ejecutados.

## Aislamiento del 404 en el Node del ZIP

`diagnose-ir0E4D` abrió el mismo binario extraído con otra carpeta SQLite y otra clave de ensayo, autenticó y restauró una copia ficticia nueva mediante el servidor local. El GET protegido de Continuidad devolvió 200 con su pin. El GET `/api/v7/local-operations/work-summary` devolvió 404. En Chromium, la navegación a Continuidad pidió esa misma ruta y mostró «Esta versión todavía no ofrece el resumen del trabajo local». También se vieron los dos 404 opcionales ya conocidos de comprobación HubSpot y relevo. El diagnóstico de navegador tuvo cero escrituras, peticiones exteriores y errores de página. Su proceso 28196 tiene recibo de cierre. La prueba demuestra una capacidad ausente en el ejecutable extraído y el mensaje que ve la persona. No asigna sin telemetría los ocho mensajes del primer banco a rutas individuales.

El runtime270 registra evidencia de Continuidad y no registra el lector de resumen que ya usa main284. La siguiente unidad debe decidir y probar el registro de ese lector en el runtime, con cobertura `none` y recuentos nulos hasta A4. Después corresponde repetir el ZIP completo y mantener las aserciones originales. La presencia del iniciador272 está comprobada en este ZIP de ensayo. Fase 0 y el montaje del Radar conservan sus puertas.
