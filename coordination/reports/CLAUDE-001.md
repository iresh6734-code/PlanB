# CLAUDE-001 · Revisión estática de la conexión HubSpot en lectura

**Alcance y límites.** Inspección estática de `server/team/oauth.ts`, `server/connection.ts`, `server/hubspot.ts` y `server/team/hubspot-routes.ts`. Solo para localizar el uso de errores se consultaron también `src/TeamApp.tsx`, `src/api.ts` y `src/HubspotContext.tsx`. No se ha llamado a HubSpot, ni leído bases o credenciales, ni ejecutado pruebas. **Nada de lo que sigue valida la API remota.** Las rutas con versión fechada (`/…/2026-09/…`), los scopes necesarios y las formas de respuesta no se han comprobado contra la documentación ni contra el servicio. El portal personal 149623262 no tiene conexión API acreditada y este informe no la da por hecha.

Las referencias de línea corresponden al estado del checkout al revisar.

## 1. Capacidad implementada frente a pendiente

| Capacidad | Estado según el código |
| --- | --- |
| Clave privada de ensayo (`connectPrivate`) | Implementada. Comprueba portal y tipo `DEVELOPER_TEST/SANDBOX` en `inspectConnection`. |
| Clave privada de producción en lectura (`connectPrivateProduction`) | Implementada. Pide ID confirmado y `reviewed:true`, exige tipo `STANDARD` y llama a `productionSpace`. Sin evidencia remota. |
| OAuth (`begin`/`complete`/`access` con refresh) | Implementado. Falta `productionSpace` (hallazgo H2) y no hay evidencia de uso real. |
| Captura (`importHubspot`) | Implementada: paginación por cursor, recuento por búsqueda, lote de asociaciones con reintento individual. |
| Contexto de ficha (`oauth.context`) | Implementado como muestra acotada (`partial:true`). No es historial completo. |
| Recuperación tras credencial revocada o caducada | Pendiente: no hay estado «reconectar» persistido (H7). |
| Conexión real de 149623262 | Pendiente. Solo se acredita con evidencia de API autorizada. |

## 2. Hallazgos

Prioridad: **A** puede dar resultados erróneos o rompe sesión, **M** degrada la fiabilidad, **B** mejora.

### H1 (A) · Un 401 de HubSpot cierra la sesión local de Plan B
- `server/hubspot.ts` `request()` lanza `AppError(401,'HubSpot no aceptó la credencial.')` y `server/connection.ts` `inspectConnection.get` reenvía 401/403 tal cual.
- `src/TeamApp.tsx:40`: si `response.status===401` y `config.localPilot`, borra `ready`, espacios y registros (equivale a «sesión cerrada»). Un token de HubSpot revocado se manifiesta como expulsión del piloto.
- `context()` ya usa 502 para todo salvo 403, por lo que el comportamiento es incoherente entre rutas.
- **Cambio propuesto:** en `hubspot.ts` (`request`) y `connection.ts` (`get`) mapear el 401 de HubSpot a un código propio, por ejemplo 424 o 502 con `code:'hubspot_credential'`, reservando 401 para la sesión de Plan B. Si `TeamApp.tsx` debe distinguirlo, pertenece a otro encargo.

### H2 (A) · OAuth no aplica la barrera de espacio de producción
- `savePrivate` llama a `productionSpace()` antes y dentro de la transacción final. `complete()` (oauth.ts ~53-72) no la llama aunque `info.accountType==='STANDARD'` fija `mode='production_readonly'` y pasa `confirmedProduction:true` sin revisión del usuario.
- Consecuencia: un espacio con capturas de ensayo o con datos locales puede quedar vinculado a un portal real; más tarde `capture` guardaría datos de producción mezclados.
- **Cambio:** en `complete()`, si `mode==='production_readonly'`, ejecutar `await this.productionSpace(sql,tenant,expected)` dentro de la transacción final. Valorar exigir en `begin()` la misma confirmación explícita (ID confirmado + revisado) que `connectPrivateProduction`.

### H3 (A) · El contexto de ficha no vincula el contacto al portal conectado
- `hubspot-routes.ts` acepta cualquier registro local `team_records` o de `salesSource` con ese `id`, y `oauth.context` solo exige `/^\d+$/`. No compara el portal de origen del registro con `team_connections.account_id`.
- Riesgos: (a) un contacto creado localmente con ID numérico consultaría a otra persona en HubSpot; (b) en modo ensayo, `productionSpace` no se aplica, por lo que tras desconectar y conectar otro portal los IDs de A se resolverían en B.
- **Cambio:** pasar a `context()` el `source.accountId` del registro o captura y rechazar si no coincide con la conexión. Marcar en los registros si el ID es remoto.

### H4 (M) · «Dos actividades por tipo» no son las más recientes, y un tipo queda sin leer
- `oauth.ts` ~100: `contact.associations[kind].results.slice(0,2)`; HubSpot no ordena por fecha, así que se muestran dos arbitrarias y luego se ordenan.
- `remaining=8` con cinco tipos de máximo dos: notas+tareas+reuniones+llamadas ya suman 8, así que **`emails` solo se lee si algún tipo anterior tiene menos de dos**. Se rompe además con `break` solo del bucle interno.
- Mezcla `hs_timestamp` de tareas (fecha límite) con el de otras actividades, y la ordenación por `localeCompare` solo es válida si todos son ISO.
- **Cambio:** repartir el presupuesto por tipo antes de leer; usar `POST …/search` de cada tipo ordenado por `hs_timestamp` desc con filtro de asociación, o `batch/read` para reducir de ~9 peticiones secuenciales a pocas. Etiquetar la fecha de tareas como «vence». El texto `description` debe decir que la selección no es la más reciente mientras no cambie.

### H5 (M) · `context()` falla entero ante un solo error
- Cada `get` lanza 502 si falla, incluidos 429 y el 404 de un propietario desactivado (`/crm/v3/owners/{id}`). No hay reintento ni presupuesto global (cada petición puede tardar 12 s, hasta ~2 min).
- **Cambio:** tolerar fallos por elemento (`partial:true` con lista de omitidos), reintento breve para 429, y para el propietario devolver `owner:null` ante 404.

### H6 (M) · Paginación y recuento (`importHubspot`)
- Bien: cursor repetido detectado; `MAX_RECORDS` comprobado por página; no se sustituye la captura si algo falla.
- No se detectan **IDs duplicados** entre páginas: un registro duplicado más uno omitido (por edición durante la lectura) igualan el recuento. **Cambio:** `Set` de IDs por entidad y error si hay repetidos.
- El recuento de `/search` puede ir por detrás del listado (consistencia eventual) y produce un 422 sin reintento. **Cambio:** uno o dos reintentos con espera acotada antes de fallar.
- `Retry-After` se limita a 5 s; con 429 de ventana larga las 3 tentativas se agotan y el mensaje es genérico «lectura incompleta (429)». El `throw` final del bucle es inalcanzable. **Cambio:** mensaje específico de límite de uso y respeto de cabeceras de cuota.
- Asociaciones: un destino fuera de la captura (`available`) aborta toda la captura con 422, incluso si es un registro creado después de `captureStartedAt`. Se debería diferenciar «archivado/creado después» de «inconsistencia» y reintentar o excluir con aviso.
- La caída a rutas v3 ante cualquier 404 puede ocultar que la ruta fechada no existe en el portal; registrar qué versión se usó en `source`/evidencia.

### H7 (M) · Recuperación de credenciales
- `access()` renueva el token con una llamada HTTP (hasta 15 s) **dentro de `repo.system` con `SELECT … FOR UPDATE`**: bloquea la fila y mantiene transacción abierta durante la red. Un `invalid_grant` repite el intento en cada petición y no marca `status`. **Cambio:** refrescar fuera de la transacción con bloqueo breve o advisory lock, y persistir `needs_reconnect` para que la interfaz ofrezca reconectar.
- Tras renovar no hay comprobación de portal si la respuesta no trae `hub_id` (es opcional en `tokenSchema`), y se guarda `tokens` sin `scopes` si el refresh no los devuelve, lo que borra `crm.objects.owners.read` de `connection.scopes`. **Cambio:** conservar los scopes anteriores o repetir `account-info`, y exigir `hub_id` o verificar con `account-info`.
- `Date.parse(expires_at)` con valor inválido da NaN y nunca renueva.
- `complete()` comprueba que no haya scopes sobrantes pero no que estén **los necesarios**; la falta se descubriría como 403 durante la captura. Los scopes declarados (`scopes[]`) no incluyen ninguno de tareas ni de actividades; si HubSpot los exige no se ha verificado aquí, y debe confirmarse con documentación y una lectura autorizada antes de afirmar que la captura de `tasks` o `context()` funciona por OAuth.

### H8 (B) · Menores
- `savePrivate`: `owners.json()` fuera de `try`; una respuesta no JSON da 500 en lugar de 502.
- `complete()` consume el `state` antes de llamar a HubSpot; cualquier fallo obliga a reiniciar (aceptable, pero conviene un mensaje claro).
- Los `state` caducados solo se limpian en `begin()`.
- `context()` quita etiquetas con regex; el cliente (`HubspotContext.tsx`) imprime el texto como nodo React, por lo que no hay inyección, pero entidades HTML se verán literales.
- Las notas y correos devueltos pueden contener datos personales de clientes; confirmar que no se registran en auditoría ni en logs.

## 3. Riesgos de regresión de los cambios
- H1: cualquier cliente que dependa del 401 de HubSpot para reintentar. Revisar `tests/hubspot*.test.ts` y `TeamApp.tsx`.
- H2: espacios de ensayo ya vinculados por OAuth a un portal STANDARD dejarían de poder renovarse si se aplica la barrera también en el refresh; aplicarla solo en `complete()`.
- H4: el cambio a `search` añade rutas POST; `readonlyFetch` solo permite POST a `search` y `batch/read` de contactos, empresas, negocios y tareas, **no** de notas, reuniones, llamadas o correos. Habría que ampliar la lista blanca de forma estrecha (solo lectura) y revisar `tests/network.test.ts`.
- H6: reintentos de recuento alargan la captura; respetar `signal`.
- H7: mover el refresh fuera de la transacción exige evitar renovaciones concurrentes (dos solicitudes pueden rotar el token a la vez).

## 4. Pruebas propuestas (con `fetch` simulado, sin red real)
1. 401 de HubSpot en captura y en `inspectConnection` no produce 401 hacia el cliente (H1).
2. `complete()` con `accountType STANDARD` en un espacio con captura de ensayo o con registros locales → 409; con espacio vacío → conecta (H2).
3. `context()` con un contacto de otra cuenta o sin origen remoto → rechazado (H3).
4. Contacto con 3 notas, 3 tareas, 3 reuniones, 3 llamadas y 3 correos: todos los tipos presentes, las más recientes primero, máximo del presupuesto (H4).
5. Un fallo 404/429 en una actividad devuelve `partial` con omitidos; propietario 404 → `owner:null` (H5).
6. Listado con ID repetido y recuento igual → error; recuento retrasado que converge en el segundo intento → éxito (H6).
7. Refresh con `invalid_grant` marca reconexión sin dejar la fila bloqueada; refresh sin `scopes` conserva los previos; refresh con `hub_id` distinto → 403 (H7).
8. Cursor repetido, 207 con errores parciales, `numErrors` sin `errors`, y asociaciones paginadas: ya parecen cubiertos por `tests/hubspot.test.ts`; confirmar antes de duplicar.
9. Lista blanca de `readonlyFetch`: rechaza POST/PUT/DELETE a cualquier otra ruta y redirecciones.

## 5. No comprobado
Rutas y versiones de API, scopes necesarios para tareas y actividades, forma real de las respuestas (`associations`, `paging`, `hub_id`, `scopes` en el token), comportamiento ante límites de uso, existencia de pruebas que ya cubran H1-H7 (solo se listaron nombres de archivos) y cualquier dato del portal 149623262.
