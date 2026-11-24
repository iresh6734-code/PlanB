# D5 · Comprobar la migración desde Verifica

24/11/2026, Europe/Madrid.

«Después del cierre» permite cargar la captura de cierre, el destino y el mapa confirmado. También acepta un parte de vigilancia con su sal. Valida los archivos en el navegador y usa el mismo preparador y las mismas reglas de equivalencia que el script. El informe para compartir, la lista privada con IDs y la sal de nueva generación se descargan por separado. La fecha elegida produce el mismo instante que `--as-of AAAA-MM-DD`.

## Comprobaciones

- 31 pruebas focales correctas y `tsc` limpio. `vite build` generó la página y sus módulos.
- Chromium abrió el cliente compilado con datos sintéticos en 390 y 1.440 px. La pantalla rechazó el mapa mal formado y el parte sin su sal, comparó los archivos válidos, abrió el informe y volvió al resultado. Sin desbordes horizontales ni excepciones JavaScript. El navegador registró el aviso de reserva de `script-src` de CSP durante el arnés.
- El JSON y el CSV descargados coincidieron byte a byte con la ejecución del script para los mismos archivos y fecha. La prueba registró cero peticiones de escritura. El navegador recibió las respuestas de Fastify por inyección local, con el tráfico externo bloqueado.

## Alcance comprobado

Los archivos se seleccionan manualmente y la operación vive en la pantalla actual. Para recuperar el resultado después de cerrarla se usan sus descargas. El enlace con la captura automática de D4 y el expediente persistente es un paso posterior.
