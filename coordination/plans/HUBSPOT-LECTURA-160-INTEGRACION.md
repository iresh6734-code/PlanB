# HubSpot · comprobación de lectura (160) · plan de montaje y autorización

4/11/2026. Estado: **módulo y pruebas con servidor ficticio; sin cablear y sin ninguna llamada real a HubSpot.**

## Qué existe hoy (leído del código, sin ejecutar nada real)

- `server/connection.ts` · `inspectConnection`: llamada de lectura única al guardar la credencial (identidad `account-info/2026-09/details` y esquema de propiedades). Su resultado se guarda como `connectionPublic` (`accountType`, `verifiedAt`). `verifiedAt` es **el momento de guardar**, no una comprobación actual; la pantalla de Integraciones (`shared/local-integrations.ts`) ya lo dice así («verificada al guardar la credencial»).
- No hay un estado de «acceso actual». Nada vuelve a preguntar al proveedor después de guardar; una credencial caducada o revocada solo se descubre al capturar.
- `shared/integration-status.ts` (Google) reconoce explícitamente que su estado «no es una comprobación del acceso actual». HubSpot no tiene equivalente.

## Qué añade 160 (archivos nuevos)

- `shared/hubspot-read-check.ts`: estados `not_configured · saved_unchecked · checking · read_verified · partial · rejected · insufficient_permissions · unavailable · identity_mismatch · account_type_mismatch`, entorno `rehearsal | real | unknown` y `viewOfReadCheck()` (lo que se muestra *ahora*: cualquier resultado más viejo de 15 min vuelve a «configuración guardada · acceso sin comprobar»).
- `server/hubspot-read-check.ts`: `checkHubspotRead({token, accountId, mode}, {fetcher, now, timeoutMs, signal})`. Una pasada, sin reintentos, **solo GET** con `readonlyFetch` (sin redirecciones, solo `api.hubapi.com`): identidad de cuenta + una lectura de 1 elemento por objeto (`contacts, companies, deals, tasks`, `GET /crm/objects/2026-09/{objeto}?limit=1&properties=hs_object_id`), **solo para clasificar el código HTTP; el cuerpo se descarta y no se guarda**. Nunca lanza por una respuesta del proveedor y nunca copia la credencial a resultado, error ni log.
- Rutas de 2026-09 contrastadas con la documentación oficial vigente ([cuenta](https://developers.hubspot.com/docs/api-reference/latest/account/account-information/get-account-details), [contactos](https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide)). Los permisos exactos por objeto se infieren de la respuesta 401/403 de cada lectura, **no** de una lista de scopes: no se usa el endpoint heredado `POST /oauth/v2/private-apps/get/access-token-info` (la credencial iría en el cuerpo, no está en la lista de lecturas permitidas y la doc actual apunta a otra vía) y no se amplía `readonlyFetch`.

## Qué NO prueba

Las 14 pruebas usan un servidor HTTP local y un portal inventado. Demuestran la clasificación de respuestas, el transporte y la ausencia de secretos; **no** que una credencial real funcione, ni la forma real de las respuestas más allá de lo documentado, ni que 15 min sea el plazo adecuado.

## Autorización necesaria antes de la primera llamada real (no concedida)

| Qué | Valor a decidir por el usuario |
| --- | --- |
| Cuenta | Una cuenta concreta de ensayo (`DEVELOPER_TEST`/`SANDBOX`) propia de este equipo, o el portal personal autorizado; **no** el equipo/portal corporativo |
| Credencial | Guardada por el usuario en el flujo de Continuidad (nunca pegada en un chat ni en un informe) |
| Permisos de lectura | Los de lectura de contactos, empresas, oportunidades y tareas; sin escritura |
| Acción | 5 peticiones GET por comprobación (1 identidad + 4 lecturas de 1 elemento). Aun así leen un registro real en tránsito (se descarta) y **pueden dejar rastro de uso/avisos en la cuenta compartida** |
| Frecuencia | Solo a petición explícita (botón), nunca en segundo plano |

Hasta tener eso, el flujo queda preparado y probado en local y no se hace ninguna prueba real.

## Montaje propuesto (unidades separadas; requieren reservas de Codex)

1. **Servidor** (`server/v2.ts` + una ruta nueva, p. ej. `POST /api/v2/connection/read-check`): usar la credencial guardada **dentro del servidor** (el cliente nunca la ve), llamar a `checkHubspotRead`, guardar solo el `ReadCheckResult` (sin token) en el almacén local, exigir el mismo bloqueo de sesión/CSRF que el resto de rutas v2, un solo check en curso a la vez (`checking`). Prueba: cliente no recibe el token; segundo check simultáneo no duplica.
2. **Contrato** (`shared/operations.ts`): añadir `readCheck` al estado de `connection`. Hoy el parser de `local-integrations.ts` es estricto: un campo nuevo debe aceptarse a la vez que se muestra.
3. **Pantalla** (`shared/local-integrations.ts` + `src/LocalIntegrations.tsx`): usar `viewOfReadCheck` y un botón «Comprobar lectura ahora»; «conectado/verificado» solo con `read_verified` fresco; diferenciar cuenta de ensayo/real.
4. **Después**: decidir qué hacer con `connectionPublic.verifiedAt` (renombrar su texto a «al guardar») y con los avisos del Kit de Relevo sobre HubSpot (siguen siendo simulación).

Dependencias: 1→2→3. Ninguna debe empezar sin reserva coordinada (los archivos de 1–3 tienen cambios sin entregar de otros agentes en el árbol).
