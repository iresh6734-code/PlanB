# Descarga del ZIP portátil desde Exportar

## Pregunta de verificación

En 388, la descarga desde el botón de Exportar no obtuvo un código HTTP y la página mostró un error de conexión. La misma ruta devolvió un ZIP válido al llamarla directamente con las credenciales de la sesión ficticia. Quedó pendiente verificar el recorrido normal del navegador.

## Control de tamaño e interceptación

Un servidor efímero de loopback respondió a un POST con 48.939.193 bytes generados y un encabezado de adjunto. Chromium descargó esos bytes cuatro veces, en el orden con interceptación, sin ella, sin ella, con ella. Las cuatro respuestas fueron HTTP 200 y los cuatro archivos coincidieron por SHA-256. Los tiempos hasta el evento de descarga oscilaron entre 240 y 357 ms. Este control cubre la transferencia de cuerpo grande, el blob y la descarga. El trabajo de compresión y la ruta de Plan B se prueban aparte.

## Recorrido con Plan B

Se reutilizaron el frontend congelado de 385 y los tres bundles de backend recompilados para 388. Se comprueban las huellas de 839 fuentes y 47 artefactos. El flujo parte de una instancia nueva, crea datos ficticios y edita un registro antes de proteger el acceso local. En Exportar confirma la revisión y pulsa «Descargar aplicación independiente». Las comprobaciones del recorrido verifican archivo cifrado, rechazos sin escrituras, restauración válida y persistencia tras reinicio. El iniciador real del ZIP tiene un control separado.

Para observar la solicitud sin interceptarla, el ejecutor temporal sustituye el enrutamiento de Playwright por eventos pasivos de red y dirige los destinos externos a un proxy local sin servicio. Se registran códigos HTTP, tamaño y errores del endpoint, sin registrar cuerpos de solicitud ni cabeceras de autenticación. Se amplían los plazos de arranque y descarga en las copias temporales. Las aserciones funcionales y el botón de descarga se conservan. Se usa Playwright con el Chromium local porque el complemento Browser no está disponible en esta sesión.

## Resultado

- **Descarga real.** El POST respondió HTTP 200 en 48,218 s. Chromium emitió el evento de descarga 330 ms después y guardó los 48.939.188 bytes anunciados. SHA-256 del ZIP `136c290fce76adea7043485cb670fa503aa6fec26aebd00f56c92ca8c578d144`.
- **Restauración y reinicio.** Playwright pasó 1 de 1, sin reintentos, en 171,7 s. Las restauraciones registraron 422, 422 y 200. Los rechazos conservaron la base y la válida preservó los 62 registros y el cambio local. Tras reiniciar, el paquete mantuvo identidad, evidencia y datos. Pasó también la comprobación de ancho a 390 px. Se registraron cero errores de página y cero solicitudes a orígenes ajenos. Las respuestas 422 esperadas quedan en el registro de consola.
- **Iniciador.** El `ABRIR PLAN B.cmd` del mismo ZIP pasó arranque, reutilización, rechazo de portada 404 con salud 200 y reapertura con las mismas huellas de registros y cambios. Se confirmó el cierre de los procesos de ensayo.
- **Integridad.** Las 839 fuentes y los 47 artefactos conservaron sus huellas. El control de transferencia pasó en ambas condiciones y la prueba de Plan B pasó con el observador pasivo. La causa del fallo anterior sigue sin confirmarse. Las dos comprobaciones son insuficientes para atribuirlo a la interceptación.

Banco local `planb-download389-H8sHJ4` en la carpeta temporal del equipo. `results.json`, `playwright.json`, `download-wire.jsonl`, `observed-portable.json` y `packaged-command/results.json` conservan los resultados. El recorrido acredita esta copia aislada. La compilación y la batería de la candidata completa siguen pendientes.
