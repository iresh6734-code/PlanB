# D5 · Comprobar la migración desde Verifica

24/11/2026, Europe/Madrid.

«Después del cierre» permite cargar la captura de cierre, el destino y el mapa confirmado. También acepta un parte de vigilancia con su sal. Valida los archivos en el navegador y usa el mismo preparador y las mismas reglas de equivalencia que el script. El informe para compartir, la lista privada con IDs y la sal de nueva generación se descargan por separado. La fecha elegida produce el mismo instante que `--as-of AAAA-MM-DD`.

## Comprobaciones

- 31 pruebas focales correctas y `tsc` limpio. `vite build` generó la página y sus módulos.
- Chromium abrió el cliente compilado con datos sintéticos en 390 y 1.440 px. La pantalla rechazó el mapa mal formado y el parte sin su sal, comparó los archivos válidos, abrió el informe y volvió al resultado. Sin desbordes horizontales ni excepciones JavaScript. El navegador registró el aviso de reserva de `script-src` de CSP durante el arnés.
- El JSON y el CSV descargados coincidieron byte a byte con la ejecución del script para los mismos archivos y fecha. La prueba registró cero peticiones de escritura. El navegador recibió las respuestas de Fastify por inyección local, con el tráfico externo bloqueado.

## Alcance comprobado

Los archivos se seleccionan manualmente y la operación vive en la pantalla actual. Para recuperar el resultado después de cerrarla se usan sus descargas. El enlace con la captura automática de D4 y el expediente persistente es un paso posterior.

## Enlace con la vigilancia · 24/11/2026

Si el encargo tiene la vigilancia configurada, «Después del cierre» propone por defecto **la última captura de la vigilancia**. Muestra su fecha y su huella, y conserva la opción de subir los archivos a mano. En ese modo, el navegador solo envía el destino, el mapa y la fecha. El servidor toma la captura de cierre, el parte de esa fecha y la sal del encargo, y usa el mismo preparador y las mismas reglas que el script. La captura de cierre no sale del equipo. La respuesta lleva el informe y la lista privada con `no-store`.

**Regla del cierre retenido (decisión de la usuaria).** Si la última captura está retenida, la comparación responde `409` y pide aceptar su huella en «Vigilancia». No se toma la última aceptada en su lugar. Así el parte conserva su formato y su huella, y el informe sigue cumpliendo que su cierre es la última captura del parte.

### Comprobaciones

- `verifica-watch-api` amplía su recorrido con datos ficticios. Con la semana retenida, la ruta responde `409`. Si el encargo no tiene vigilancia, responde `404`, y un mapa mal formado o una fecha imposible dan `422`. Tras aceptar la huella responde `200`. El informe y la lista coinciden byte a byte con la carga manual de la misma captura, el parte de esa fecha y la sal. Si se desactiva la regla, la prueba falla con `200 !== 409`.
- Pruebas focales de vigilancia, temporizador, migración, pasos, página y rutas del cliente correctas. `tsc` limpio y batería segura en verde.
- Sin navegador, Playwright, servidor escuchando, PowerShell ni DPAPI. Todo se probó con `NODE_ENV=test` y `Fastify.inject`.

### Ruta pendiente del inventario

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/api/verifica/engagements/:id/watch/migration` | Comparar la migración con la captura de cierre, el parte y la sal de la vigilancia. |

Se suma a las tres de D4 pendientes de regenerar en `docs/api.md` bajo la reserva `CLAUDE-API-INVENTORY`. El cliente la llama mediante `watchMigrationUrl`, igual que las rutas de vigilancia.
