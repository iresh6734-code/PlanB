# CODEX-HUBSPOT-CANCEL-135 · Cancelación de captura de HubSpot

2/11/2026, Europe/Madrid. Codex. Presentado para revisión independiente.

## Cambio

El importador existente de HubSpot ahora comprueba la cancelación antes de cada petición y antes de usar una respuesta tardía o intentar la API alternativa. La espera de `Retry-After` de respuestas 429/5xx es cancelable; se descarta el cuerpo de esas respuestas antes de esperar. Si la señal del trabajo fue abortada, conserva ese motivo en lugar de convertirlo en un fallo genérico de red. También vuelve a comprobar la señal tras leer JSON.

Esto mejora la cancelación del trabajo de captura existente. No crea una conexión, no modifica los permisos de la cuenta, no cambia la API pública y no demuestra acceso al proveedor. No hay escrituras a HubSpot en esta unidad.

## Validación

- Antes del cambio, las tres primeras pruebas nuevas fallaban: con transporte ficticio se invocaba fetch aun con señal ya cancelada, una espera de cinco segundos no terminaba dentro de 350 ms después de cancelar y un 404 tardío provocaba una petición alternativa tras la cancelación.
- Después: `node --import tsx --test tests/hubspot-capture-cancellation.test.ts tests/hubspot.test.ts tests/hubspot-response-validation.test.ts tests/hubspot-capture-progress.test.ts`: **37/37**. Cuatro pruebas nuevas y 33 existentes, sin omisiones.
- La cuarta prueba nueva emplea `Continuity`, `Jobs` y SQLite reales en memoria con datos ficticios y transporte HubSpot simulado: cancela durante 429, obtiene estado `cancelled`, libera el trabajo y compara instantánea, registros y listado de capturas con los anteriores.
- `npx tsc -p tests/.tmp/hubspot135-tsconfig.json`: 0 errores en comprobación focal de los archivos afectados y sus dependencias.

## Alcance y riesgos

No se contactó HubSpot ni se usaron cuentas o credenciales reales; los resultados del proveedor son sintéticos. No se comprobó el navegador, el build desplegado ni se ejecutó `npm test` completo. Un transporte que ignore AbortSignal y nunca responda puede seguir reteniendo la promesa hasta que responda; tras una respuesta tardía se comprueba la cancelación y no se envía fallback ni se procesa como éxito. La cancelación de una petición ya enviada no prueba que el proveedor no la haya recibido. La captura sigue siendo de lectura bajo `readonlyFetch`; no modifica permisos o políticas externas.

La mejora se entrega en fuentes, no se ha reiniciado ni actualizado la demo abierta. La revisión independiente debe cotejar los hashes de submit y verificar la compatibilidad de cancelación y reintentos.
