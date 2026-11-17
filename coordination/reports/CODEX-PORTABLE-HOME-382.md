# 382 · El iniciador portátil verifica la portada

16/11/2026, Europe/Madrid. El iniciador Windows podía anunciar que Plan B estaba disponible al recibir una respuesta de salud de su instancia, aunque faltara el índice o la aplicación devolviera un 404 o JSON en la portada.

Al arrancar en frío se exige que el runtime y `dist/index.html` sean archivos. Después de cotejar el recibo y la identidad de salud, se comprueba que la portada devuelve HTTP de éxito con tipo `text/html`. Las sondas a salud y portada no siguen redirecciones. Si un runtime propio responde y falla la portada, el iniciador informa del problema y no lanza otra instancia. Al reponer el índice se puede reabrir la misma instancia. El alcance es la disponibilidad HTTP de la portada.

| Comprobación | Resultado |
| --- | --- |
| Archivo incompleto, 404 y 200 JSON con iniciador anterior | Tres falsos éxitos reproducidos |
| Suite del iniciador portátil | 6/6, incluidos arranque, reutilización, filtrado de entorno y tres regresiones |
| Node incluido en el ZIP de 377 | Se rechazó el índice ausente antes de arrancar. Con el runtime ya activo se confirmó HTML 200, rechazo con portada 404 y salud 200, y reapertura tras reponer el índice |
| Proceso de ensayo | Recibo, PID e identidad cotejados. Cierre confirmado |
| Suite vecina del iniciador del workspace completo | 6/7 en loopback. El único fallo de la repetición fue EBUSY al eliminar el directorio temporal tras el cierre |

Se empezó con el ZIP de SHA-256 `4d97fdf04967282fc89cd54ca85a4e5820c3232d7518c8ab485151321b11d073`. Una primera extracción con tar devolvió nombres ilegibles y quedó descartada. La segunda usó Expand-Archive en otra carpeta. El único archivo de producto sustituido fue el iniciador, por los bytes del checkout. Se ejecutó el Node incluido con el runtime exacto del ZIP y un observador que impuso loopback, datos ficticios nuevos y ausencia de apertura del navegador. El primer arranque agotó el plazo del iniciador mientras corría la batería global. El runtime publicó el recibo después y se completaron las comprobaciones sobre ese mismo proceso. La repetición con una carpeta de datos ficticios nueva pasó cinco recorridos dentro de sus plazos: rechazo antes de arrancar sin índice, apertura en frío, reutilización, rechazo con salud 200 y portada 404, y reutilización tras reponer el índice. El Node del ZIP abrió un solo runtime y se verificó su cierre. El resultado está en cold-repeat/packaged-results.json.

Banco `tests/.tmp/portable382-e611e514`. Incluye el control anterior, los registros de ambos iniciadores y el resultado del paquete. La primera ejecución de la suite vecina bajo sandbox no pudo completar las conexiones de loopback. La repetición autorizada distingue ese límite de EBUSY. No hubo cambios en el iniciador del workspace, proveedores ni instalaciones.

- SHA-256 de `scripts/launch.cjs`: `47174995e46f9deb58f3a34f2d557f25d713aa4be7c1fc27366eecc2cd80eacc`.
- SHA-256 de `tests/portable-launcher-env.test.mjs`: `14105691d19fe6741bff6ae19c678c43c65b6a477b4819b29ca6aaf5cf8991cb`.
