# CODEX-HS-004 · Renovación OAuth sin transacción de red

29/10/2026, Europe/Madrid. Codex reservó OAuth después de la aceptación independiente de H3. Implementación y pruebas del autor Codex; revisión de otro subagente Codex. Claude recibió una consulta conceptual sin fuentes nuevas: respuesta real de 1508 caracteres, métrica CLI 0,021669 USD, sin factura acreditada. Claude no ejecutó estas pruebas ni editó código.

## Resultado

La renovación usa tres fases: lectura corta de credencial e identidad, llamada OAuth fuera de transacción y escritura condicional. Para guardar debe seguir vigente la misma empresa, credencial cifrada, portal, tipo y fecha de autorización. Una respuesta antigua no reinstala una conexión eliminada ni sobrescribe otra más reciente.

Un mapa de promesas evita renovar dos veces la misma credencial dentro de una instancia. No proporciona exclusión distribuida. Los detalles CRM y permisos introducidos en H3 siguen comprobándose.

`invalid_grant` o `BAD_REFRESH_TOKEN`, recibidos como error de cliente, guardan `needs_reconnect` solo si sigue vigente la credencial utilizada. La respuesta local es 409, sin texto remoto sensible. Un error transitorio, respuesta malformada o `invalid_client` conservan la conexión. Portal o permisos inesperados se rechazan con 403 y requieren reconexión.

Cada respuesta válida debe incluir `access_token` y `expires_in` nuevos. Si omite `refresh_token`, `hub_id` o `scopes`, se conservan los anteriores. Los permisos explícitos, incluido un array vacío, sustituyen los previos y deben pertenecer al alcance de lectura. La credencial se cifra al guardar; OAuth recibe secretos en el cuerpo, nunca en la URL. Una duración válida menor de 60 segundos no provoca un bucle de renovación.

## Hallazgo de revisión corregido

La primera versión superaba 54 pruebas. El revisor independiente reprodujo otra carrera: dos instancias renuevan la misma credencial, el error `invalid_grant` llega primero y un éxito válido llega después. El estado `needs_reconnect` impedía guardar también ese éxito.

La escritura de un éxito validado permite ahora recuperar exactamente la misma credencial anterior en estado `readonly` o `needs_reconnect`, y restablece `readonly`. Los filtros de identidad y credencial impiden sobrescribir una reconexión nueva. La lectura que recibió el error puede fallar, pero el éxito posterior queda guardado. Un futuro estado administrativo `disabled` no debe añadirse a esta condición implícitamente.

La décima regresión prueba esa carrera y una reconexión intermedia. El revisor repitió su reproducción por stdin: una lectura correcta, otra 409, estado final `readonly` y token válido guardado.

## Validación final

Diez regresiones focalizadas correctas: red fuera de transacción, metadatos y cifrado, deduplicación y empresas, rotación, permisos explícitos, duración corta, revocación, fallos transitorios o malformados, identidad inesperada, desconexión y carreras entre instancias. AsyncLocalStorage comprueba que la llamada al proveedor no hereda una transacción; otra comprobación consulta PGlite desde el transporte simulado.

**55/55 pruebas afectadas y typecheck correctos sobre el código final.**

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-oauth-refresh.test.ts tests/hubspot-context-isolation.test.ts tests/hubspot-oauth-isolation.test.ts tests/hubspot-local-production.test.ts tests/commercial.test.ts tests/team.test.ts
    node node_modules/typescript/bin/tsc --noEmit

El primer arnés exigía una URL sin query también en las lecturas de contactos y falló cinco casos; se corrigió para aplicar esa comprobación solo a OAuth. TypeScript detectó un retorno recursivo sin anotación; se añadió AccessConnection. Esos fallos no se cuentan como verificaciones correctas.

## Referencias y límites

Contrato contrastado con [gestión de tokens de HubSpot](https://developers.hubspot.com/blog/oauth-token-management-hubspot-integrations) y el [anuncio oficial de OAuth v3 y errores](https://community.hubspot.com/t/new-oauth-v3-api-endpoints-and-standardized-error-responses/145422). Documentación pública; sin entrar en el portal CRM.

Pruebas con PGlite y transporte sintético, red externa bloqueada. No acreditan OAuth real, UI o concurrencia con PostgreSQL gestionado. Varias instancias pueden llamar simultáneamente al proveedor; la escritura condicional descarta resultados obsoletos. verified_at conserva el límite temporal documentado en H3, sin una generación única.

needs_reconnect queda persistido y explicado por el backend; su representación específica en la interfaz es el siguiente trabajo. Sin reiniciar el piloto, credenciales reales, datos de prueba en la app, operaciones CRM/Google/Gmail/IFR, commits o publicación.

## Hashes finales

- server/team/oauth.ts: 2d323d3d0b7017caf12202771f4b92f97a285c6e333b6ee18dbaaeeb9ccc4830

- tests/hubspot-oauth-refresh.test.ts: 295c7f7042798eb9045f7be1a1a8d2715e1bd10778dfe2b7b1e0018584cee459
