# CLAUDE-HS-READ-160 · Comprobación de lectura de HubSpot (informe de entrega)

4/11/2026, Europe/Madrid. Unidad disjunta: **5 archivos nuevos**, ninguno existente editado. Dependencias leídas sin editar: `server/connection.ts` (`readonlyFetch`), `server/hubspot.ts`, `shared/local-integrations.ts`.

## 1. Valor para el usuario
La app podrá distinguir *configuración guardada* de *acceso comprobado ahora*. Hoy `verifiedAt` es el instante de guardar la credencial; nada pregunta de nuevo al proveedor, y una credencial caducada se descubre al capturar. El módulo da el estado correcto con una respuesta real y reciente o, si no la hay, dice que no está comprobado.

## 2. Qué es real, qué es simulado, qué queda sin comprobar
- **Real (código):** `checkHubspotRead` y `viewOfReadCheck`, rutas de 2026-09 contrastadas con la documentación oficial vigente.
- **Simulado:** las 14 pruebas usan un servidor HTTP local y un portal inventado (12345).
- **Sin comprobar:** cualquier respuesta real de HubSpot; que la credencial real tenga los permisos esperados; la forma exacta de las respuestas reales más allá de lo documentado; el plazo de 15 min. **No se llamó a HubSpot, no se leyó ninguna credencial ni base. No está cableado a rutas ni a la interfaz** (ver `coordination/plans/HUBSPOT-LECTURA-160-INTEGRACION.md`, que incluye la autorización concreta necesaria antes de la primera llamada real).

## 3. Diseño
Estados `not_configured · saved_unchecked · checking · read_verified · partial · rejected · insufficient_permissions · unavailable · identity_mismatch · account_type_mismatch`; entorno `rehearsal | real | unknown`. Una pasada, sin reintentos, solo GET por `readonlyFetch` (sin redirecciones). Identidad (`/account-info/2026-09/details`) y 1 elemento de cada objeto para clasificar el código; cuerpo descartado. La credencial no sale de la cabecera: ni resultado, ni mensajes, ni errores. El resultado caduca (`freshUntil`, 15 min) y `viewOfReadCheck` lo degrada a «sin comprobar».

Decisión: **no** se usa `POST /oauth/v2/private-apps/get/access-token-info` para listar scopes (heredado, credencial en el cuerpo, fuera de las lecturas permitidas); los permisos se infieren de 401/403 por objeto. Es menos informativo (no nombra el scope que falta) pero no ensancha el transporte.

## 4. Pruebas (`tests/hubspot-read-check.test.ts`, 14)
Real/ensayo/modo-tipo no coinciden/portal distinto (sin devolver el otro id)/401/expiración a mitad/permisos parcial-total-identidad/429 con Retry-After acotado y 5xx/timeout/respuesta cortada, sin campos y sin `results`/redirección no seguida (el destino no recibe nada)/credencial dentro de un error de transporte/configuración inválida sin llamadas/cancelación/vista con caducidad.
Resultado: **14/14**. Control causal con 3 mutantes en `server/hubspot-read-check.ts` (sin comprobar portal: falla 1; aceptar `results` no-array: falla 1; contar parcial como verificado: fallan 3) y restauración verde (hash restaurado idéntico). Un cuarto mutante era sintácticamente inválido y no cuenta.

`tsc --noEmit -p tsconfig.json` de todo el proyecto: exit 0, sin salida (no he verificado qué carpetas incluye ese tsconfig, p. ej. si cubre `tests/`).

## 5. Límites
No cubre refresco OAuth, scopes nombrados, asociaciones, actividades ni paginación; 5 peticiones leen un registro real en tránsito (se descarta) y pueden generar rastro en una cuenta compartida; no hay frecuencia ni limitador a nivel de aplicación (eso es del montaje); el entorno `rehearsal/real` se deduce del `accountType` que devuelve el proveedor y del modo guardado, no se prueba por otra vía.

## 6. Siguiente paso
Montaje en tres unidades (servidor → contrato → pantalla) con reservas de Codex, y decisión del usuario sobre la cuenta/credencial/acción de lectura (tabla en el plan). Hasta entonces, nada real.
