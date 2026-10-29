# CLAUDE-HS-001 · Consulta real registrada por Codex

28/10/2026, Europe/Madrid. Respuesta real de Claude Code con cuenta personalPro, seis fuentes autorizadas y herramientas deshabilitadas. El coordinador guarda el texto; Claude no editó archivos ni ejecutó pruebas.

## Revisión estática H1/H6 — Plan B · CLAUDE-HS-001

---

### 1. H1 y H6: aceptados

**H1 — 401 remoto de HubSpot ya no cierra sesión local**

En `server/connection.ts`, la función `get` usa `response.status===403?403:502`, de modo que cualquier 401 de HubSpot llega al cliente como 502 con el mensaje original conservado. En `server/hubspot.ts`, `request()` hace `throw new AppError(502,'HubSpot no aceptó la credencial.')` ante `response.status===401`. Ambos puntos de entrada quedan alineados y el `403` de permisos conserva su estado propio. El comportamiento de `TeamApp.tsx:40` (cierre de sesión ante 401 local) queda protegido. **H1 aceptado.**

**H6 — Detección de IDs duplicados por entidad**

`const recordIds = new Set<string>()` se declara dentro del bucle `for (const entity of entityNames)`, por lo que el alcance es por entidad. Antes de acumular cada página se comprueba `recordIds.has(item.id)` y se lanza `AppError(502,…)` sin guardar captura parcial. IDs iguales entre entidades distintas siguen permitidos, lo que es correcto. El caso descrito en CODEX-HS-001 —recuento igual pese a duplicado más omitido— queda bloqueado porque la detección ocurre antes del cotejo de recuento. **H6 aceptado.**

---

### 2. Cinco casos de regresión para Codex (fichero sugerido: `tests/hubspot-h1-h6.test.ts`)

**Caso A — H1: 401 en captura produce 502, no 401**
Fetch que devuelve `{status:401}` en `/account-info`. `importHubspot` debe lanzar `AppError` con `status===502` (o equivalente). No debe propagar un 401 que `TeamApp.tsx` interprete como cierre de sesión. Resultado esperado: `AppError.status` distinto de 401.

**Caso B — H1: 401 en `inspectConnection` produce 502**
Fetch que devuelve `{status:401}` en `/account-info`. `inspectConnection` debe lanzar `AppError` con código 502 y mensaje `'HubSpot no aceptó la credencial'`. Resultado esperado: error con status 502.

**Caso C — H1: 403 de HubSpot conserva 403 en ambas rutas**
Fetch que devuelve `{status:403}` en `/crm/properties/…`. Tanto `inspectConnection` como `importHubspot` deben lanzar `AppError(403,…)`. Resultado esperado: status 403 preservado para distinguir permisos de credencial.

**Caso D — H6: ID repetido dentro de la misma página**
Fetch que devuelve en `/objects/contacts` dos registros con `id:'1'` y recuento 2 en `/search`. `importHubspot` debe lanzar `AppError(502,…)` con mensaje que incluya `'repitió un ID'` o similar antes de continuar. Resultado esperado: rechazo de la captura, sin snapshot devuelto.

**Caso E — H6: ID repetido entre páginas, recuento coincidente**
Fetch con paginación: primera página devuelve `[{id:'1'},{id:'2'}]` con cursor `next`; segunda página devuelve `[{id:'1'}]` (repetición de id:1 en lugar de id:3). Recuento de `/search` devuelve 3, que coincide con `list.length` si no se detectara el duplicado. Con el nuevo `Set`, debe lanzar `AppError(502,…)` antes de llegar al cotejo de recuento. Resultado esperado: error de duplicado.

*(Bonus natural si el presupuesto lo permite: IDs iguales en entidades distintas —contacto `id:'1'` y empresa `id:'1'`— no deben generar error; snapshot válido con `reconcile(snapshot).complete===true`.)*

---

### 3. Pendientes H2/H3/H7

**H2** (`complete()` no aplica `productionSpace`): sin implementar. Riesgo de vincular un portal STANDARD a un espacio con datos de ensayo.

**H3** (contexto de ficha no coteja portal de origen): sin implementar. Un ID numérico local puede resolver en otro portal al reconectar.

**H7** (refresh dentro de transacción `FOR UPDATE`, `invalid_grant` no persiste `needs_reconnect`, scopes pueden borrarse): sin implementar. Los tres puntos son independientes; el más urgente es el bloqueo de fila durante llamada de red.

Ninguno de estos tres ha sido tomado por esta entrega; deben coordinarse con CODEX-001 antes de asignar archivos OAuth.

---

### 4. Límites

Esta revisión es exclusivamente estática. No se han ejecutado pruebas, no se ha llamado a HubSpot, no se ha accedido a bases de datos ni a credenciales. Los errores 401 de la cola de trabajos (`team/jobs.ts`) no demuestran comportamiento de sesión en la UI: son fallos de trabajo que el scheduler registra como `failed`/`retry`, independientes del cierre de sesión de `TeamApp.tsx`. Las rutas con versión fechada (`/…/2026-09/…`) y los scopes de tareas y actividades no se han verificado contra documentación ni servicio real.

## Contraste del coordinador

La palabra «aceptado» anterior es la recomendación estática de Claude, no la aceptación del tablón. No se envió TeamApp.tsx en esta consulta: su referencia de línea procede del informe recibido y no acredita inspección independiente de esa interfaz. Las pruebas se implementarán/ejecutarán por Codex y se atribuirán como tal. El mensaje de inspectConnection conserva el sufijo Vuelve a copiarla.; las aserciones comprobarán el prefijo y502. No hay conexión API149623262 o prueba de sesión UI. El encargo original de pruebas completas conserva su alcance pendiente hasta tener evidencia.
