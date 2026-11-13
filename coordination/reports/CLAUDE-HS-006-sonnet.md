# CLAUDE-HS-006 · Análisis estático profundo del flujo de captura HubSpot

Autor: claude (Sonnet 5.5). Fecha de lectura: 31/10/2026, Europe/Madrid. Encargo reservado por el agente principal; este informe es el único archivo escrito.

**Alcance y límites.** Análisis estático de seis fuentes, más el brief y los documentos de protocolo (`CLAUDE.md`, `AGENTS.md`, `COORDINACION.md`). No se ha ejecutado ningún test, ni red, ni navegador, ni MCP, ni subagentes. No se han leído `data/`, `.env*`, `*.enc`, `.planb-key`, `planb-local-*` ni `planb-hubspot-*`. **Nada de lo que sigue valida la API de HubSpot ni el estado real del CRM o de ningún portal.** Las rutas con versión fechada (`2026-09`), los scopes, los códigos de estado reales y la consistencia de la búsqueda no se han comprobado contra documentación ni servicio. Que un caso de regresión «pase hoy» es una predicción por lectura, no un resultado de ejecución.

## 0. Convención de evidencia

- **[PROBADO]**: confirmado leyendo el código o test actual, citando `ruta:línea`. No significa ejecutado.
- **[INFERIDO]**: deducción razonada a partir del código leído, con supuestos explícitos. Puede ser falsa si el entorno real difiere.
- **[NO EVALUABLE]**: depende de algo que no se ha leído (otros archivos), de la API remota, de la base de datos o de una ejecución.

## 1. Fuentes y SHA-256

Calculados con `sha256sum` el 2026-10-31T15:45:02+01:00, antes de leerlas. Otros agentes editan el repo en paralelo; todas las líneas citadas corresponden a estos hashes (ver verificación final en la sección 15).

| Fuente | Líneas | SHA-256 |
| --- | --- | --- |
| `server/connection.ts` | 43 | `b88111890134adcc587fc8ebbc8eca1810c8bad3df08003622d8825f35875bee` |
| `server/hubspot.ts` | 260 | `d8b0919027506b25d6613844c4042fe6be5ad29bb0ffc0b662edfdb38a2d6a49` |
| `server/team/jobs.ts` | 53 | `234e7c5d4db57fdac8a38391a9870edf60bfe0925edff993a3a7068fa4699dc7` |
| `tests/hubspot.test.ts` | 134 | `8f555069d97f52cefd114b1473b8e19749d56494ae2e221ac20715c22046a3fc` |
| `coordination/reports/CODEX-HS-001.md` | 38 | `1204b8d07702e1ca34d8f31ea2d49807333033dda64003ad96e6cad5aa76ac71` |
| `coordination/reports/CLAUDE-001.md` | 89 | `e6e078030d3ac16069ee2ec7eeddc06ddae9c8fecdcfee3db0f67d8c658dd8f9` |

**Deriva respecto a informes previos [PROBADO]:** `CODEX-HS-001.md:30` registra para `server/hubspot.ts` el hash `7add5192…bce4`; el actual es `d8b09190…6a49`. Por tanto `hubspot.ts` ha cambiado después de esa entrega (no se sabe cómo: no se ha leído el historial). `server/connection.ts` coincide con el hash de `CODEX-HS-001.md:29`. Las referencias de línea de `CLAUDE-001.md` ya no son fiables para `hubspot.ts`: este informe las sustituye.

## 2. Resumen ejecutivo

1. **El test de «cursor repetido» ya no cubre el cursor repetido [PROBADO].** El mock devuelve el mismo registro `1` en la página 2 (`tests/hubspot.test.ts:40-41`), y la comprobación de ID duplicado (`server/hubspot.ts:141`) se ejecuta antes que la de cursor repetido (`:146`). La importación sigue rechazándose, pero por duplicado; `assert.rejects` sin matcher (`tests/hubspot.test.ts:95`) lo enmascara. La rama `:146` queda sin cobertura en este archivo.
2. **El worker de capturas no clasifica errores [PROBADO].** `catch{` sin binding (`server/team/jobs.ts:40`) descarta el `AppError`. Fallos permanentes (403 permisos, 413 límite, 422 portal/tipo/recuento) se reintentan igual que los transitorios, y el usuario solo ve un mensaje genérico (`:42`). Además el 401 remoto ahora es 502 (`hubspot.ts:60`), indistinguible por estado de un fallo transitorio.
3. **Presupuesto temporal ajustado [INFERIDO].** Una sola petición puede consumir hasta ~100 s (`hubspot.ts:40-52`), el mismo valor que el tope del job (`jobs.ts:25`). Un portal cercano a 10.000 registros exige cientos de peticiones secuenciales; si no cabe en 100 s, los tres intentos fallan de forma determinista.
4. **Completitud: el recuento es necesario, no suficiente [PROBADO/INFERIDO].** Se compara tras el listado, sin reintento (`hubspot.ts:149-150`). Un alta y una baja durante la lectura mantienen el total pero cambian el conjunto. El `manifest` es autorreferente (`:258`).
5. **Relaciones: tres debilidades concretas [PROBADO].** El cursor de un GET individual se reenvía luego a `batch/read` (`:217`, `:234-239`, `:202`); el cursor de relaciones no se valida (`:235`); los IDs se normalizan de forma inconsistente (`:206` usa `String`, `:225` no); la relación principal depende del orden de respuesta (`:231-232`).
6. **El preflight no coincide con la captura [PROBADO].** `inspectConnection` acepta selecciones y esquemas que `importHubspot` rechaza después (`connection.ts:39-40` frente a `hubspot.ts:100-103`), y no tiene reintento, fallback 404 ni mapeo de errores de red/JSON.
7. **Cerrado desde CLAUDE-001 [PROBADO]:** 401 remoto a 502 (`connection.ts:29`, `hubspot.ts:60`) e IDs duplicados por entidad (`hubspot.ts:118`, `:141-142`).

## 3. Modelo de captura

Flujo secuencial de `importHubspot` (`server/hubspot.ts:32-259`). Una sola función devuelve el snapshot al final (`:252`); cualquier `throw` anterior descarta todo, por lo que **no existe captura parcial devuelta** [PROBADO].

| Etapa | Qué hace | Línea | Fallo típico |
| --- | --- | --- | --- |
| 0. Transporte | Envuelve el fetch con `readonlyFetch`; marca `captureStartedAt` | `:33-34` | — |
| 1. Precondiciones | ID numérico y confirmación (salvo producción), token ≥10 | `:36-37` | 422 |
| 2. Cuenta | `account-info` con fallback legacy; portal y tipo según modo | `:73-76` | 422 / 403 |
| 3. Pipelines y etapas | Requiere ≥1; mismo ID de etapa con distinto sentido falla | `:77-86` | 422 |
| 4. Por entidad (`entityNames`) | Propiedades, selección, campos, listado paginado, recuento, coerción de valores | `:95-177` | 413 / 422 / 502 |
| 5. Relaciones (5 pares) | Lotes de 100 con `batch/read`; reintento individual de ausentes | `:178-246` | 422 / 502 |
| 6. Reglas y snapshot | Regla de correo; `manifest.complete:true` fijo | `:247-259` | — |

Pares de relación (`:179-185`): contacts→companies, deals→companies, deals→contacts, tasks→contacts, tasks→deals. Cada uno añade un campo `reference` reservado (`planb_company_id`, `planb_contact_id`, `planb_deal_id`) y falla si ya existe (`:189`) [PROBADO]. El orden de `entityNames` está en `shared/model.ts` [NO EVALUABLE: no leído].

**Selección de propiedades [PROBADO, `:100-103`].** Se incluye una propiedad si no está archivada y (es una de las básicas de `basics[entity].fields` **o** `hubspotDefined !== true`, no está oculta y: hay `selectedFields` que la nombre, o no hay selección y el modo no es producción). Consecuencias: en modo ensayo sin selección se capturan todas las personalizadas visibles (máximo 60 en total, `:102`); en producción sin selección solo las básicas; una propiedad básica oculta se captura igualmente; una propiedad seleccionada que sea estándar y no básica se rechaza (`:101`).

**Flujo de worker (`server/team/jobs.ts`) [PROBADO].** `enqueue` (`:8-12`) inserta con clave de deduplicación única por tenant. `run` (`:13-45`): (1) reclama bajo `FOR UPDATE` sobre `team_spaces` con una sola ejecución activa por tenant (`:16-22`); (2) captura **fuera de la transacción** con `AbortSignal.timeout(100000)` (`:25`); (3) en una segunda transacción verifica la propiedad del lease, guarda el snapshot en `team_captures`, y lo instala solo si el tenant no tiene `team_records` (`:27-39`); (4) cualquier excepción reprograma o falla (`:40-44`). `pending` (`:46-52`) cierra como `failed` los jobs con lease vencido y 3 intentos, y lista hasta 10 recuperables por tenant. Quién invoca `run` y `pending` y con qué frecuencia: [NO EVALUABLE].

## 4. Paginación

### 4.1 Listado de objetos (`hubspot.ts:117-148`)

Parámetros: `limit=100&archived=false&properties=<lista codificada>[&after=<cursor codificado>]` (`:122`). Garantías comprobadas por página [PROBADO]:

| Garantía | Línea | Resultado |
| --- | --- | --- |
| `results` es array | `:124` | 502 |
| Cabe en `MAX_RECORDS` acumulado (registros de entidades previas + lista actual + página) | `:125` | 413, sin captura parcial |
| Cursor válido: cadena no vacía y sin espacios en los extremos, o entero seguro ≥ 0 | `:127-132` | 502 |
| Página vacía con cursor siguiente | `:135` | 502 |
| Registro con `id` cadena, no vacía y recortada; `properties` objeto no array | `:137-140` | 502 |
| ID repetido dentro de la entidad (página o entre páginas) | `:141` | 502 |
| Cursor repetido (conjunto `previous`) | `:146` | 502 |

Observaciones:
- `paging.next: null` o ausente termina el listado (`:127`); `paging.next` sin `after` es error (cursor `undefined`).
- No hay tope de páginas ni de tiempo por entidad; el acotamiento viene de `MAX_RECORDS` (si cada página trae al menos 1 registro y los cursores no se repiten) y de la señal externa [INFERIDO].
- El orden de validación importa: el ID duplicado se evalúa **antes** que el cursor repetido. Un servidor que repite página y cursor se rechaza por duplicado; solo un cursor repetido con registros distintos llega a `:146`.

### 4.2 Recuento de control (`:149-151`)

Tras listar, un POST `…/search` con `{limit:1}` y comparación estricta `total === list.length`. Sin reintento propio; los reintentos del transporte cubren solo 429/5xx. La búsqueda se hace **después** del listado y no se acota por `captureStartedAt` (variable calculada en `:34` y solo copiada al snapshot en `:254`) [PROBADO]. Fiabilidad de `total` frente al listado, indexación diferida: [NO EVALUABLE].

### 4.3 Relaciones (`:186-246`)

Estado por lote de hasta 100 registros origen: `pending` (`{id, after?}`), `chosen`, `cursors` (`id:after`), contador `pageCount` ≤ 100 (`:195-201`). Cada ronda hace un `batch/read` con `partialAssociations=true`, determina qué IDs necesitan lectura individual y ejecuta un GET por cada uno, uniéndolo al resultado (`:215-221`). Después valida y consume (`:224-240`), y reencola los IDs con `paging.next` (`:234-239`).

Qué dispara la lectura individual [PROBADO]: ID ausente en `results` (`:206`); `errors[].context.fromObjectId` con IDs conocidos (`:210`) o sin contexto/ID ajeno (`:209`, todo el lote); `numErrors` sin `errors` (`:212`, todo el lote). Estatus `PENDING`/`PROCESSING` aborta toda la captura aun con 207 (`:70`).

## 5. Identidad

| Concepto | Clave | Garantía | Evidencia |
| --- | --- | --- | --- |
| Cuenta | `accountId` (dígitos) igual a `String(portalId)`, más tipo coherente con el modo | Verificado antes de cualquier dato CRM | `hubspot.ts:73-76`; `connection.ts:33-34` |
| Registro | `(entity, id)`; `id` cadena recortada no vacía | Único por entidad en una captura; el mismo ID en entidades distintas es válido | `hubspot.ts:118`, `:137-142` |
| Etapa | `stage.id` global | Mismo ID con otra etiqueta o pipeline: 422 | `:81-85` |
| Campo | `property.name`; claves `planb_*` reservadas | Colisión: 422 (tarde, tras listar) | `:189` |
| Enlace | `(fromEntity, fromId, toEntity, toId, label=key)` | **Sin unicidad impuesta** ni deduplicación | `:230` |
| Relación principal por origen | Primer destino visto, sustituido por cualquiera con etiqueta Primary/Principal (el último gana) | **Depende del orden de respuesta** | `:231-232` |
| Snapshot | `randomUUID()` | Distinto en cada captura | `:253` |
| Job | `(tenant_id, dedupe_key)` único; `id` UUID; `lease_token` UUID | Un mismo `dedupe_key` con distinto `kind` da 409; con mismo `kind` devuelve el job existente, sea cual sea su estado | `jobs.ts:9-11`, `:14` |

Normalización de IDs en relaciones [PROBADO]: `:206` compara con `String(r.from?.id)`; `:225` usa `item.from?.id` sin convertir contra un `Set<string>`; `:230` guarda `item.from.id` tal cual. Los destinos sí se convierten (`:228`). Si la API devolviera `from.id` numérico, `:206` lo daría por presente y `:225` lo rechazaría como ajeno [INFERIDO; forma real no evaluable].

## 6. Errores y reintentos

### 6.1 Transporte (`hubspot.ts:38-72`) [PROBADO]

- Hasta 3 intentos solo por **429 o 5xx** en los dos primeros (`:50`). Espera `clamp(Number(Retry-After) || 1, 1, 5)` segundos (`:51`); una fecha HTTP en `Retry-After` da `NaN` y 1 s. El tercer intento devuelve la respuesta cualquiera que sea (`:54`).
- La espera no es cancelable; la señal se consulta después (`:52`). Latencia máxima de cancelación en espera: 5 s. El `throwIfAborted` lanza el motivo de la señal (no `AppError`).
- Un error de `fetch` (red, timeout de 30 s, **y cancelación**) se convierte siempre en `AppError(502)` **sin reintento** (`:49`). La cancelación queda disfrazada de fallo de conexión.
- El `throw` de `:56` es inalcanzable (el bucle siempre retorna en el intento 2).
- Los cuerpos de respuestas reintentadas no se consumen ni cancelan (`:50-53`).
- Peor caso por petición: 3 × 30 s + 2 × 5 s = 100 s; con fallback 404 a ruta legacy, hasta dos cadenas (`:58-59`) [INFERIDO: aritmética sobre constantes leídas].
- 404 con `legacyPath` reintenta en la ruta v3 (`:59`); sin `legacyPath` (lectura individual `:217`) un 404 es 502 «incompleta (404)».
- Mapeo: 401→502 (`:60`), 403→403 (`:61`), `!ok` u 207 fuera de relaciones→502 con el código en el texto (`:62`), JSON inválido o no objeto→502 (`:63-68`), `errors` no vacío salvo relaciones, o `status` `PENDING`/`PROCESSING`→502 (`:70`). La comprobación de `status` es una lista negra: cualquier otro valor pasa (p. ej. un estado desconocido) [PROBADO/INFERIDO].
- Los mensajes son literales; solo se interpola el código HTTP (`:62`). El token no aparece en ningún mensaje [PROBADO]. El destino se limita a `https://api.hubapi.com`, solo GET o los POST de búsqueda/lectura por lotes, con `redirect:'error'` (`connection.ts:19-21`).
- Fallos de forma sin `AppError`: `meta.results.filter` sin comprobar array (`:100`) y `pipeline.stages.entries()` sin comprobar (`:81`) lanzan `TypeError`. Se aborta igual, pero fuera del contrato de errores [PROBADO el acceso sin guarda; efecto en el llamador NO EVALUABLE].

### 6.2 `inspectConnection` (`connection.ts:25-43`) [PROBADO]

Un único intento por petición con timeout de 30 s (`:28`); no hay reintento por 429/5xx ni fallback 404 a ruta legacy (a diferencia de la captura). Los fallos de `fetch` y `response.json()` (`:28`, `:30`) no se convierten en `AppError`. No se valida la forma de `account` antes de leer `portalId` (`:33`). 401→502, 403→403, resto→502 (`:29`).

### 6.3 Worker (`jobs.ts`) [PROBADO]

- Intentos: máximo 3 (`:21`). Tras fallo, `queued` con `available_at = ahora + 30 s · 2^(intentos-1)` (30 s, 60 s) o `failed` si ya son 3 (`:42`). Sin jitter.
- Todo `throw` (incluidos `AppError` 403/413/422, conector no configurado `:26`, abortos por el tope de 100 s y el 409 de lease perdido `:29`) sigue el mismo camino y deja `error` con un texto genérico fijo (`:42`). Ni el `AppError` ni su estado se guardan, ni hay auditoría de fallo (solo `job.succeeded`, `:38`).
- Lease de 150 s (`:21`) frente a 100 s de captura: quedan ~50 s para la segunda transacción, que serializa hasta 10.000 registros (`:32`) y puede instalar (`:34`). Sin renovación de lease. Si el lease vence y otro ejecutor lo reclama, el original cae en el 409 de `:29` y su `UPDATE` de `:42` no coincide (token distinto), por lo que no pisa al nuevo [PROBADO el diseño; carrera real NO EVALUABLE].
- Un job `running` con lease vencido y 3 intentos no es reclamable (`:21`); solo `pending()` lo cierra como `failed` (`:48`).
- Reutilizar `dedupe_key` de un job terminal (`succeeded`/`failed`) devuelve ese job sin re-encolar (`:9-11`). `enqueue` audita `job.enqueue` en cada llamada, también cuando no inserta (`:11`).

## 7. Invariantes

Estado: **V** = aplicado en el código leído, **P** = parcial, **N** = no aplicado.

| ID | Invariante | Estado | Evidencia / hueco |
| --- | --- | --- | --- |
| I1 | Solo lectura: GET en `api.hubapi.com`, POST únicamente a búsqueda y lectura por lotes de relaciones, sin redirecciones | V | `connection.ts:19-21`. Todos los GET del dominio se aceptan (no hay lista blanca de rutas GET) |
| I2 | Cuenta y tipo coinciden con el modo antes de pedir datos CRM | V | `hubspot.ts:73-76` |
| I3 | Falla cerrado: sin captura parcial devuelta | V | único `return` en `:252` |
| I4 | Cada listado termina con cursores válidos, sin repetición y con progreso | V | `:127-135`, `:146` |
| I5 | IDs únicos y bien formados por entidad | V | `:118`, `:137-142` |
| I6 | Total de registros ≤ `MAX_RECORDS` | V | `:125` (valor de la constante: no evaluable) |
| I7 | Recuento remoto igual al listado | P | `:150`: necesario pero no suficiente; sin reintento ni instantánea |
| I8 | Una relación vacía solo se acepta tras una lectura individual correcta y paginada | V | `:206-221` |
| I9 | Todo destino de relación pertenece a la captura | V | `:229`; falso positivo posible si algo se crea durante la lectura |
| I10 | Resultado de relaciones no duplicado ni ajeno al lote | P | `:225`; normalización de IDs inconsistente |
| I11 | Cursor de relaciones validado como el de objetos | N | `:235` (`String(undefined)`) |
| I12 | Relación principal determinista | N | `:231-232` |
| I13 | Enlaces únicos y `manifest` verificable de forma independiente | N | `:230`, `:258` (`expectedLinks = links.length`, `complete:true` fijo) |
| I14 | Preflight y captura aplican el mismo predicado de campos | N | `connection.ts:39-40` frente a `hubspot.ts:100-103` |
| I15 | Los fallos del worker se clasifican y se auditan | N | `jobs.ts:40-44` |
| I16 | Un único ejecutor activo por tenant y escritura de resultado solo con el lease propio | V | `jobs.ts:16-21`, `:28`, `:37`, `:42` |
| I17 | El worker no sobrescribe registros existentes | V | `jobs.ts:33-34` (solo instala si `count===0`) |
| I18 | El worker comprueba la integridad del snapshot antes de instalarlo | N | `jobs.ts:32-34` no consulta `manifest.complete` ni `source.accountId` |
| I19 | Los mensajes de error no contienen secretos ni cuerpos remotos | V | literales en `hubspot.ts` y `connection.ts`; `jobs.ts:42` |

## 8. Matriz de fallos y efectos esperados

Efecto = lo que el código leído hace; «captura previa» = no se sustituye porque no se devuelve snapshot.

| # | Fallo | Punto | Efecto en `importHubspot` | Efecto en el worker |
| --- | --- | --- | --- | --- |
| M1 | ID no numérico, falta confirmación, token corto | `hubspot.ts:36-37` | 422 antes de red | Reintentos hasta 3 (sin clasificar) |
| M2 | Fallo de red, timeout 30 s, cancelación | `:49` | 502 inmediato, sin reintento | Reintento con backoff |
| M3 | 429 o 5xx persistente | `:50-62` | 3 intentos, 502 «incompleta (código)» | Reintento con backoff |
| M4 | 401 | `:60` | 502 «no aceptó la credencial» | Igual que M3 (reintenta, genérico) |
| M5 | 403 | `:61` | 403 «Faltan permisos…» | Reintenta pese a ser permanente |
| M6 | 404 en ruta fechada | `:59` | Repite en v3; sin versión registrada | — |
| M7 | Cuerpo no JSON o no objeto | `:63-68` | 502 | Igual que M3 |
| M8 | `status` PENDING/PROCESSING o `errors` fuera de relaciones | `:70` | 502 «resultados parciales» | Igual que M3 |
| M9 | Portal distinto o tipo de cuenta incorrecto | `:75-76` | 422 / 403 | Reintenta pese a ser permanente |
| M10 | Sin pipelines, etapa ambigua | `:78`, `:83` | 422 | Reintenta |
| M11 | Propiedad seleccionada ausente, >60 propiedades, falta campo principal | `:101-103` | 422 | Reintenta |
| M12 | `meta.results` o `stages` malformados | `:100`, `:81` | `TypeError` no controlado | Reintenta (genérico) |
| M13 | Superar `MAX_RECORDS` | `:125` | 413 | Reintenta pese a ser permanente |
| M14 | Cursor inválido, vacío con siguiente, ID duplicado o inválido, cursor repetido | `:127-146` | 502 | Igual que M3 |
| M15 | Recuento distinto (indexación diferida o cambios durante la lectura) | `:150` | 422 sin reintento interno | Reintento tras 30/60 s |
| M16 | Valor numérico/booleano/fecha-hora inválido | `:157-169` | 422 | Reintenta |
| M17 | Colisión con campo `planb_*` | `:189` | 422 tras haber listado todo | Reintenta |
| M18 | Relaciones: 207 con errores o ausentes | `:206-221` | GET individual por ID | — |
| M19 | GET individual 403/!ok, no array | `:217-218`, `:61-62` | 403 / 502 | Reintenta |
| M20 | Destino fuera de captura | `:229` | 422 aborta toda la captura | Reintenta |
| M21 | Relación duplicada o ajena al lote | `:225` | 502 | Reintenta |
| M22 | Cursor de relaciones repetido o más de 100 páginas | `:237`, `:201` | 502 / 422 | Reintenta |
| M23 | Worker: sin conector | `jobs.ts:25-26` | — | 3 intentos y `failed` |
| M24 | Worker: lease perdido | `jobs.ts:29`, `:42` | — | 409 interno; sin efecto sobre el job del otro ejecutor |
| M25 | Worker: tenant con registros | `jobs.ts:33-35` | — | Snapshot guardado sin instalar (`installed:false`) |
| M26 | Worker: caída del proceso | `jobs.ts:48-49` | — | Reclamable tras el lease; `failed` con 3 intentos |
| M27 | `inspectConnection`: red/JSON inválido | `connection.ts:28`, `:30` | — | Excepción sin `AppError` [efecto en la ruta NO EVALUABLE] |

## 9. Hallazgos y trazabilidad

Severidad: A puede producir cobertura falsa o resultados erróneos; M degrada fiabilidad; B mejora.

| ID | Sev. | Estado | Hallazgo | Evidencia |
| --- | --- | --- | --- | --- |
| F1 | A | PROBADO | El test «cursor» pasa por duplicado, no por cursor repetido; `:146` sin cobertura en este archivo | `hubspot.test.ts:40-41`, `:95`; `hubspot.ts:141`, `:146` |
| F2 | A | PROBADO | Worker sin clasificación de errores; mensaje del `AppError` descartado | `jobs.ts:40-42` |
| F3 | M | INFERIDO | Presupuesto de tiempo: petición hasta ~100 s; job 100 s; lease 150 s | `hubspot.ts:40-52`; `jobs.ts:21`, `:25` |
| F4 | M | PROBADO + INFERIDO | Recuento sin reintento y posterior al listado; alta+baja se compensan | `hubspot.ts:149-150` |
| F5 | M | PROBADO flujo / INFERIDO riesgo | Cursor de GET individual reenviado a `batch/read` (compatibilidad no evaluable) | `:217`, `:234-239`, `:202` |
| F6 | M | PROBADO | Cursor de relaciones sin validar (`'undefined'`) | `:235` |
| F7 | M | PROBADO | Normalización de `from.id` inconsistente | `:206`, `:225`, `:230` |
| F8 | M | PROBADO + INFERIDO | Relación principal depende del orden de respuesta | `:231-232` |
| F9 | M | PROBADO | Preflight acepta lo que la captura rechaza (estándar seleccionada, >60, sin campo principal) | `connection.ts:39-40` frente a `hubspot.ts:100-103` |
| F10 | M | PROBADO | `inspectConnection` sin reintento, sin legacy 404, sin guardas de forma, errores no `AppError` | `connection.ts:27-33` |
| F11 | B | PROBADO | `meta.results` y `stages` sin guarda de tipo | `hubspot.ts:81`, `:100` |
| F12 | B | PROBADO | `manifest` autorreferente; `expectedLinks` tautológico | `:258` |
| F13 | B | PROBADO | Cancelación disfrazada de 502; espera no cancelable; `throw` inalcanzable; cuerpos sin cancelar | `:49`, `:52`, `:56` |
| F14 | B | PROBADO + INFERIDO | Versión de ruta usada no registrada; posible mezcla v2026-09/v3 en mitad de una paginación | `:59`, `:256` |
| F15 | M | PROBADO | Worker instala sin comprobar `manifest.complete` ni `source.accountId` | `jobs.ts:32-35` |
| F16 | B | PROBADO | Lista negra de `status`; estados desconocidos pasan | `hubspot.ts:70` |
| F17 | B | PROBADO | `Number('  ')` da 0; `date` no de 13 dígitos pasa sin validar | `:158`, `:170-171` |
| F18 | B | PROBADO | Sin auditoría de fallos; `job.enqueue` repetido; `dedupe_key` terminal no re-encolable | `jobs.ts:11`, `:42` |
| F19 | M | PROBADO | Destino fuera de captura aborta todo (ya señalado en CLAUDE-001 H6) | `hubspot.ts:229` |
| F20 | B | INFERIDO | `numErrors` mayor que `errors.length` con resultado presente pero truncado no se detecta | `:207-212` |

Trazabilidad con los informes previos:

| Referencia previa | Estado actual |
| --- | --- |
| CLAUDE-001 H1 (401 expulsa la sesión) | Resuelto en estas dos fuentes [PROBADO]: `connection.ts:29`, `hubspot.ts:60`. El efecto en `TeamApp.tsx` y en rutas: NO EVALUABLE |
| CLAUDE-001 H6 duplicados | Resuelto [PROBADO]: `hubspot.ts:118`, `:141-142` (`CODEX-HS-001.md:14`) |
| CLAUDE-001 H6 recuento sin reintento, `Retry-After` limitado a 5 s, destino fuera de captura, versión no registrada | Siguen abiertos [PROBADO]: `:150`, `:51`, `:229`, `:256` |
| CLAUDE-001 H6 «throw inalcanzable» | Confirmado [PROBADO]: `:56` |
| CLAUDE-001 H2, H3, H4, H5, H7, H8 | Fuera de estas seis fuentes (OAuth, rutas, contexto): NO EVALUABLE ahora |
| CODEX-HS-001 «23/23 y tsc correctos» | Es una afirmación de ese informe sobre su momento (`CODEX-HS-001.md:19-21`); no verificada ni reproducida aquí |
| CODEX-HS-001 pendiente «regresión completa» de Claude | El archivo `tests/hubspot-h1-h6.test.ts` no se ha leído. Antes de implementar R01 y R03, comprobar si ya existen allí |

## 10. Cobertura actual de `tests/hubspot.test.ts` [PROBADO]

Siete tests con un transporte simulado de rutas por subcadena (`:20-47`):

| Test | Líneas | Qué fija | Debilidad |
| --- | --- | --- | --- |
| Flujo feliz | `:48-58` | 5 registros, 6 enlaces, 2 páginas de contactos, reconciliación completa | No comprueba orden ni identidad de los enlaces |
| Propiedad personalizada | `:60-92` | Sin `hubspotDefined`, enumeración, exclusión de estándar/oculta/archivada, lista exacta de `properties` | — |
| Cuatro modos de fallo | `:93-97` | `production`, `missing`, `partial`, `cursor` rechazan | **Sin matcher**: cualquier excepción, incluso un `TypeError`, pasa. `cursor` ahora cae por duplicado (F1) |
| Sin confirmación / ID distinto | `:98-101` | Mensajes `/confirma/`, `/no corresponde/` | — |
| Producción | `:103-111` | Modo explícito, solo campos seleccionados, tipo de cuenta | — |
| 207 con GET individual | `:113-123` | Una llamada individual, destino `null`, 5 enlaces | Solo cubre el caso `fromObjectId` conocido |
| 207 con 403 | `:125-134` | Los permisos no se ocultan | Solo cubre `errors` sin contexto |

No cubiertos en este archivo [PROBADO por ausencia]: reintentos 429/5xx y `Retry-After`; error de red; cancelación; fallback 404; 401 en ninguna posición; cursores inválidos y vacíos; 413; límite de 60 propiedades; campo principal ausente; etapas en conflicto; coerción de valores; todas las salvaguardas de relaciones salvo 207; `inspectConnection` entero; `readonlyFetch` directo; `jobs.ts` entero. Si otros archivos de test los cubren: NO EVALUABLE.

## 11. Casos de regresión (12)

Clase **C** = caracterización: por lectura debería pasar hoy y fija el comportamiento. Clase **G** = brecha: por lectura fallaría hoy o exige decidir el comportamiento deseado; no activar en integración continua hasta implementar la unidad. Todos usan un `fetcher` simulado con tabla de rutas (el `mock()` de `tests/hubspot.test.ts` no está exportado; copiar la idea, no el archivo) y, donde se indica, temporizadores simulados de `node:test` (`mock.timers`) para no esperar de verdad. Ningún caso necesita red, credenciales ni datos reales.

| ID | Prioridad | Clase | Unidad | Tema |
| --- | --- | --- | --- | --- |
| R01 | Media | C | U1 | ID duplicado con recuento coincidente |
| R02 | Alta | C | U1 | Reintentos y `Retry-After` |
| R03 | Alta | C | U1 | 401/403 en cada posición |
| R04 | Alta | G | U1 | Recuento con consistencia eventual |
| R05 | Alta | C | U1 | Cursores y límite acumulado |
| R06 | Alta | C+G | U1 | Fallback de relaciones y cursor cruzado |
| R07 | Media | C+G | U1 | Validación de respuestas de relaciones |
| R08 | Media | G | U1 | Determinismo y normalización de IDs |
| R09 | Baja | C+G | U1 | Coerción de valores |
| R10 | Alta | G | U2 | Paridad y robustez del preflight |
| R11 | Alta | C+G | U3 | Máquina de estados del job |
| R12 | Alta | C+G | U3 | Lease, concurrencia e instalación |

**R01 · ID duplicado con recuento coincidente.**
- Montaje: contactos con dos páginas, `[1,2]` con cursor `a` y `[2,3]`; `search` devuelve `total:4` (igual a lo listado, con el duplicado).
- Aserciones: rechaza con `AppError` 502 y mensaje que contiene «repitió un ID»; no se devuelve snapshot. Variante intra-página `[1,1]` con `total:2`. Variante: el mismo ID `1` en `contacts` y `companies` **sí** se acepta.
- Evidencia: `hubspot.ts:118`, `:141-142`. Si ya está en `tests/hubspot-h1-h6.test.ts`, no duplicar.

**R02 · Reintentos y `Retry-After`** (temporizadores simulados).
- (a) `account-info` responde 429 con `Retry-After: 2` dos veces y luego 200: éxito, 3 llamadas a esa ruta, esperas simuladas de 2000 ms y 2000 ms.
- (b) 503 tres veces: 502 con «(503)», 3 llamadas.
- (c) `fetch` rechaza una vez: 502 «No se pudo conectar», **1** llamada.
- (d) `Retry-After` `999` equivale a 5000 ms; `abc`, `0` y ausente equivalen a 1000 ms.
- (e) 401, 403 y 404 sin `legacyPath` no se reintentan (1 llamada); 404 con `legacyPath` hace exactamente 2.
- (f) Señal abortada durante la espera: rechaza tras la espera con el motivo de la señal (documenta F13; si U1 lo cambia, se invierte).
- Evidencia: `hubspot.ts:40-62`.

**R03 · Credencial y permisos en cada posición.**
- Montaje: tabla de posiciones: `account-info`, `pipelines`, `properties/contacts`, listado p1, listado p2, `search`, `batch/read` y GET individual (provocado con un 207 sin resultados).
- Aserciones: con 401 inyectado, `AppError` con `status === 502` y mensaje «credencial»; **nunca** `status === 401`. Con 403: `status === 403` y «permisos». El mensaje no contiene el texto del token. Ninguna llamada posterior al fallo.
- Evidencia: `hubspot.ts:60-61`, `:73`, `:77`, `:97`, `:123`, `:149`, `:202`, `:217`. `CODEX-HS-001.md:23` indica que esto solo se comprobó por stdin, sin test persistente.

**R04 · Recuento con consistencia eventual** (G).
- Montaje: listado de 2 contactos; `search` devuelve `total` 1, luego 2.
- Hoy (por lectura): 422 inmediato, 1 llamada a `search`. Deseado: éxito tras un reintento acotado (2 reintentos, esperas 1 s y 2 s, cancelables), 2 llamadas a `search`.
- Variantes: `total` constante 3 con lista de 2 falla tras agotar reintentos con 422 y cuenta de llamadas = 1 + reintentos; `total` ausente o no entero falla sin reintentos (protocolo); coincide a la primera: 1 llamada.
- Evidencia: `hubspot.ts:149-151`.

**R05 · Cursores y límite acumulado.**
- (a) Cursor repetido no adyacente con IDs distintos: p1 `[1]→a`, p2 `[2]→b`, p3 `[3]→a`: 502 «repitió un cursor». (b) Repetición inmediata: p1 `[1]→a`, p2 `[2]→a`: igual.
- (c) Cursores inválidos: `''`, `' a '`, `-1`, `1.5`, `{}`, `[]`, `true`, y `paging.next` sin `after`: 502 «cursor … no válido». El entero `0` se acepta (la petición siguiente lleva `after=0`).
- (d) Página vacía con cursor siguiente: 502 «sin progreso». `paging.next: null` termina el listado.
- (e) Límite acumulado: entidad A con `MAX_RECORDS - 5` registros (importar la constante desde `shared/model`) y entidad B con 10: 413, sin snapshot.
- Evidencia: `hubspot.ts:119-148`. Sustituye la cobertura perdida de F1.

**R06 · Fallback de relaciones y cursor cruzado.**
- (C) `batch/read` sin el ID `2` y sin `errors`: 1 GET individual solo para `2`, destino `null` si devuelve `[]`.
- (C) `errors[].context.fromObjectId` con un ID no pedido: GET individual para **todos** los pendientes del lote. (C) `numErrors:1` con `errors:[]`: ídem.
- (G) `numErrors:2` y `errors` con un solo ID mientras el resultado del otro llega truncado: debe tratarse todo el lote como pendiente (F20).
- (G) El GET individual del ID `2` devuelve `paging.next.after='c1'`: la siguiente petición para `2` debe ser **otro GET individual** con `after=c1`; hoy se enviaría `batch/read` con `{id:'2', after:'c1'}`. Verificarlo registrando ruta y cuerpo de cada llamada.
- Evidencia: `hubspot.ts:205-221`, `:234-239`.

**R07 · Validación de respuestas de relaciones.**
- (C) Destino que no está en la captura: 422 «fuera de la captura» sin snapshot. (C) `from.id` repetido o ajeno al lote: 502. (C) Misma pareja `id:after` repetida: 502 «repitió una página». (C) Páginas sin fin: 422 «demasiadas relaciones» en la ronda 101.
- (G) `item.paging.next` sin `after`: hoy se enviaría `after=undefined`; deseado 502 «cursor … no válido» igual que en objetos.
- (G, decisión) Destino creado después de `captureStartedAt`: hoy 422; decidir si se clasifica como transitorio (reintento del job) o se registra como omitido.
- Evidencia: `hubspot.ts:201`, `:225`, `:229`, `:235-237`.

**R08 · Determinismo y normalización de IDs** (G).
- Contacto `1` con destinos `10` y `11`, ambos sin etiqueta Primary: hoy gana el primero que llega; invertir el orden de `to` cambia `planb_company_id`. Deseado: mismo valor con cualquier orden (p. ej. el menor ID numérico) y el mismo conjunto de enlaces.
- Con dos Primary: resultado independiente del orden. Una etiqueta `PRIMARY` o `principal` (cualquier caja) gana a una sin etiqueta en cualquier posición (C, `:231-232`).
- `from.id` numérico (`1`) y `toObjectId` numérico: hoy 502 «ajenas al lote» por `:225`; deseado éxito con `fromId` cadena `'1'`.
- Evidencia: `hubspot.ts:206`, `:225`, `:228-233`.

**R09 · Coerción de valores.**
- (C) Número `'1000.5'`→1000.5; `'abc'`→422; `''` y `null`→`null`. (C) Booleano `'true'`/`'false'` ok, `'TRUE'`→422. (C) Fecha-hora `'1767225600000'` y `'2026-11-01T09:00:00Z'` ok, `'ayer'`→422. (C) Fecha de 13 dígitos→`YYYY-MM-DD` en UTC.
- (G) `'  '` en número: hoy 0; deseado 422 o `null`. (G) Fecha no numérica inválida: hoy pasa sin validar; decidir si se rechaza aquí o la valida `validateRecord` (`shared/model.ts`, NO EVALUABLE).
- Evidencia: `hubspot.ts:153-173`.

**R10 · Paridad y robustez del preflight** (G).
- Montaje: esquema con una propiedad estándar visible (`hubspotDefined:true`, p. ej. una de auditoría), 61 propiedades personalizadas visibles y un esquema sin `firstname` en contactos.
- Hoy: `inspectConnection` acepta la selección de la estándar, acepta 61, acepta el esquema sin `firstname`; `importHubspot` rechaza los tres con 422 (`:101`, `:102`, `:103`). Deseado: mismo veredicto y mensaje en ambos.
- Robustez: `fetch` que rechaza, cuerpo no JSON, `account` igual a `null`: hoy excepción no `AppError` (`connection.ts:28`, `:30`, `:33`); deseado `AppError` 502. 404 en ruta fechada: hoy 502 sin legacy (decidir paridad con captura). 429 puntual: decidir reintento.
- (C) 401→502 «credencial» y 403→403 siguen igual.
- Evidencia: `connection.ts:27-40`; `hubspot.ts:100-103`.

**R11 · Máquina de estados del job.** Requiere repositorio simulado o el arnés de base de datos que ya use el equipo [NO EVALUABLE cuál; U3 debe localizarlo primero].
- (C) Con la captura lanzando error en cada intento: tras el 1.º, `queued`, `attempts=1`, `available_at = t+30 s`; ejecutar en `t+29 s` devuelve `claimed:false`; en `t+30 s` pasa a `attempts=2` y `available_at = +60 s`; el 3.º deja `failed`. `error` es el texto genérico.
- (G) `AppError` 403, 413 o 422: hoy se reintenta 3 veces; deseado `failed` al primer intento con un motivo clasificado y auditoría `job.failed` sin datos del cliente. 429/502/red/aborto siguen el backoff.
- (C/G) Sin conector configurado: hoy 3 intentos; deseado fallo inmediato.
- (C) Mismo `dedupe_key` con distinto `kind`: 409. Mismo `kind` tras `failed`: devuelve el job `failed` sin re-encolar (documentar y decidir si se desea).
- Evidencia: `jobs.ts:8-12`, `:20-26`, `:40-44`.

**R12 · Lease, concurrencia e instalación.**
- (C) Dos `run` simultáneos en el mismo tenant: uno `claimed:true`, el otro `claimed:false`. (C) Con una ejecución de copiloto `running` de menos de 120 s o una propuesta `executing`/`reconciling`: `claimed:false` (`:17-18`).
- (C) Toma de lease vencido: ejecutor A reclama; el reloj avanza 151 s; B reclama (`attempts=2`); cuando A termina recibe 409 y no cambia el estado del job de B.
- (C) `running` con 3 intentos y lease vencido: `run` devuelve `claimed:false`; `pending()` lo marca `failed`.
- (C) Tenant sin registros: instala, `result.installed:true`. Tenant con registros: guarda en `team_captures`, no toca `team_records`, `installed:false`. Fallo dentro de la instalación: no queda fila de `team_captures` (transacción única).
- (G) Snapshot con `manifest.complete !== true`: hoy se instala; deseado se rechaza antes de insertar nada.
- (C) La señal recibida por el conector se aborta a los 100.000 ms (temporizadores simulados).
- Evidencia: `jobs.ts:16-21`, `:25`, `:28-37`, `:48-49`.

**Casos considerados y descartados.** Fallback 404 de ruta fechada por página: su semántica de cursor entre versiones no es evaluable sin documentación remota; basta registrar la versión usada (U1) y mantener en R02(e) la prueba de llamadas. Lista blanca de `readonlyFetch`: probablemente cubierta por `tests/network.test.ts` (no leído); verificar antes de duplicar. Reconciliación y `validateRecord`: dependen de `shared/model.ts`.

## 12. Pseudocódigo implementable

Los nombres de errores asumen que `AppError` puede ampliarse o subclasificarse con un `code` [NO EVALUABLE: `server/store.ts` no leído; verificarlo en U1].

**P1 · Transporte con política explícita** (U1).

```ts
type Policy = { attempts: 3; perTryMs: 30_000; retryAfterCapMs: 5_000 };

async function readOnce(req, ctx): Promise<Response> {
  for (let n = 1; n <= policy.attempts; n++) {
    let res: Response;
    try {
      res = await fetcher(url, { ...init, signal: any([ctx.signal, timeout(policy.perTryMs)]), redirect: 'error' });
    } catch (e) {
      if (ctx.signal?.aborted) throw ctx.signal.reason;          // cancelación visible, no disfrazada
      throw fail('network', 502);                                // conserva: sin reintento
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || n === policy.attempts) return res;
    await res.body?.cancel();
    await sleepAbortable(clamp(parseRetryAfter(res) ?? 1000, 1000, policy.retryAfterCapMs), ctx.signal); // segundos o fecha HTTP
  }
}
```

**P2 · Recuento con reintento acotado** (U1).

```ts
async function verifyCount(entity, listedIds: Set<string>, ctx) {
  for (let i = 0; i <= COUNT_RETRIES; i++) {            // COUNT_RETRIES = 2
    const total = (await search(entity, { limit: 1 }, ctx)).total;
    if (!Number.isInteger(total) || total < 0) throw fail('protocol', 502);
    if (total === listedIds.size) return total;
    if (i < COUNT_RETRIES) await sleepAbortable(1000 * (i + 1), ctx.signal);
  }
  throw fail('consistency', 422);                       // transitorio para el worker
}
```

**P3 · Lector de relaciones con modo individual pegajoso** (U1).

```ts
// estado por origen: { mode: 'batch'|'single', after?: string, done: boolean }
while (any(!s.done)) {
  guardPages(++rounds > 100);
  const batchIds = ids.filter(id => s[id].mode === 'batch' && !s[id].done);
  if (batchIds.length) {
    const res = await batchRead(batchIds.map(id => ({ id, after: s[id].after })));
    const ok = new Map(res.results.map(r => [String(r.from.id), r]));      // normalizar una vez
    const bad = new Set(erroredIds(res, batchIds));                         // ausentes + errors + numErrors>errors.length => todos
    for (const id of batchIds) {
      if (ok.has(id) && !bad.has(id)) consume(id, ok.get(id));
      else s[id].mode = 'single';                                           // pegajoso: no vuelve a batch
    }
  }
  for (const id of ids.filter(id => s[id].mode === 'single' && !s[id].done)) {
    const r = await getAssociations(from, id, to, { limit: 500, after: s[id].after });
    consume(id, { to: r.results, paging: r.paging });
  }
}
function consume(id, entry) {
  require(Array.isArray(entry.to));
  for (const t of entry.to) {
    const toId = String(t.toObjectId);
    require(available.has(toId), 422);
    addLinkOnce(from, id, to, toId);                                         // sin duplicados
    candidate[id] = better(candidate[id], { toId, primary: isPrimary(t) });  // ver orden
  }
  if (entry.paging?.next) {
    const c = validateCursor(entry.paging.next.after);                       // misma regla que objetos
    require(!seen.has(id + ':' + c), 502); seen.add(id + ':' + c); s[id].after = c;
  } else s[id].done = true;
}
// orden total: primaria antes que no primaria; a igualdad, menor id numérico (BigInt)
```

**P4 · Clasificación y cierre de fallos en el job** (U3).

```ts
catch (e) {
  const cls = classify(e);   // permanent: AppError 403|413|422 y 'conector no configurado'
                             // transient: 429|502|red|aborto|desconocido
  const failedNow = cls.permanent || claimed.attempts >= 3;
  UPDATE team_jobs SET status = failedNow ? 'failed' : 'queued',
         error = SAFE_TEXT[cls.code],               // texto fijo por clase, sin datos remotos
         available_at = failedNow ? now : now + 30s * 2^(attempts-1) (+ jitter)
   WHERE tenant_id AND id AND lease_token AND status = 'running';
  audit(tenant, 'worker', 'job.failed', id, { code: cls.code, attempts: claimed.attempts });
}
// antes de instalar:
if (snapshot.manifest?.complete !== true) throw permanent('snapshot_incomplete');
```

**P5 · Predicado único de campos** (U2).

```ts
export function capturableProperties(entity, meta, selection, production, basics) {
  const wants = selection?.[entity];
  const selected = meta.filter(p => !p.archived && (basics[entity].fields.includes(p.name) ||
      (p.hubspotDefined !== true && !p.hidden && (selection ? !!wants?.includes(p.name) : !production))));
  const missing = (wants ?? []).filter(n => !selected.some(p => p.name === n));
  if (missing.length) throw new AppError(422, 'Un campo seleccionado ya no está disponible. Revisa el alcance antes de capturar.');
  if (selected.length > 60) throw new AppError(422, 'La demo admite hasta 60 propiedades por objeto. …');
  if (!selected.some(p => p.name === basics[entity].display)) throw new AppError(422, 'Falta un campo principal del objeto ' + entity + '.');
  return selected;
}
```

## 13. Tres unidades futuras con archivos disjuntos

Los conjuntos de escritura no se solapan. Cada unidad debe reservar sus rutas exactas en el tablón antes de editar (los tests nuevos son archivos nuevos que hay que declarar). Ninguna toca `package.json`, el lockfile, contratos ni esquema común.

**U1 · Captura: transporte, paginación y relaciones**
- Escribe: `server/hubspot.ts`, `tests/hubspot-capture-contract.test.ts` (nuevo).
- Lecturas adicionales necesarias: `server/store.ts` (forma de `AppError`), `shared/model.ts` (`MAX_RECORDS`, `entityNames`, `reconcile`, `validateRecord`) y `tests/hubspot-h1-h6.test.ts` para no duplicar R01/R03.
- Cubre: R01 a R09; P1, P2, P3 (incluye registrar `apiVersion` usada en `source`, F14, si el contrato de `CrmSnapshot` lo permite; si exige cambiar `shared/model.ts`, queda fuera y se registra como bloqueo).
- Aceptación: tests nuevos en verde con transporte simulado; sin red; los siete tests de `tests/hubspot.test.ts` siguen en verde; la clase G de cada caso pasa de rojo a verde; ningún mensaje de error nuevo contiene datos remotos.
- Riesgo: comportamiento observable de los dos primeros tests de `hubspot.test.ts` (pasos y rutas); `options` ampliado de forma compatible (p. ej. inyectar `sleep` opcional).
- Prioridad interna: R05 y R03 primero (cobertura que falta), luego R04 y R06.

**U2 · Preflight: paridad con la captura**
- Escribe: `server/connection.ts`, `tests/connection-preflight.test.ts` (nuevo).
- Lecturas adicionales: `shared/model.ts` (`CaptureSelectionSchema`), y el consumidor de `inspectConnection` para saber qué hace con una excepción no `AppError` [NO EVALUABLE hoy].
- Cubre: R10; P5 exportado desde `connection.ts`. `hubspot.ts` ya importa de `connection.ts` (`hubspot.ts:4`), por lo que una integración posterior (una línea de importación en una unidad de seguimiento) elimina la duplicación sin que U1 y U2 colisionen. Mientras tanto, un test de contrato en el archivo de U2 compara el veredicto de `inspectConnection` con el de `importHubspot` para las mismas fixtures.
- Aceptación: `inspectConnection` rechaza con los mismos estados y mensajes que `importHubspot` (selección estándar, >60, sin campo principal); convierte red, JSON inválido y forma inesperada en `AppError` 502; 401/403 sin cambios; decisión documentada sobre legacy 404 y reintento.
- Riesgo: la interfaz muestra el esquema devuelto en `fields`; no cambiar su forma.

**U3 · Worker: clasificación, auditoría y comprobación de integridad**
- Escribe: `server/team/jobs.ts`, `tests/team-jobs-capture.test.ts` (nuevo).
- Lecturas adicionales: `server/team/repository.ts` (`system`, `scoped`, `install`, `audit`, `clock`) y el arnés de pruebas de equipo existente, que hay que localizar primero [NO EVALUABLE hoy]; el planificador que invoca `run` y `pending`.
- Cubre: R11 y R12; P4. Clasificación por estado de `AppError` (403/413/422 permanente; 502, 429, red y aborto transitorios): el 401 remoto es hoy 502 y seguirá reintentándose hasta que U1 aporte un `code`; no depender de U1 para entregar U3.
- Aceptación: fallos permanentes terminan en `failed` al primer intento con auditoría `job.failed`; backoff y límites de intentos inalterados para transitorios; ninguna escritura en `team_records` desde un snapshot incompleto; la firma pública de `TeamJobs` no cambia (los llamadores no se tocan).
- Riesgo: cualquier cambio en `result`/`error` puede afectar a la interfaz o a otras rutas que lean `team_jobs`; revisar consumidores antes de cambiar textos.

Orden recomendado: U1 y U3 en paralelo (independientes); U2 puede ir antes o después. Ninguna unidad requiere ejecutar pruebas contra HubSpot real.

## 14. Clasificación consolidada

**PROBADO (lectura del código y test actuales).** Estructura y orden de la captura; ausencia de snapshot parcial; reglas de paginación y validación de objetos (sección 4.1); orden duplicado-antes-que-cursor y su efecto sobre el test `cursor` (F1); recuento tras listado y sin reintento; fallback individual de relaciones, cursor cruzado, falta de validación del cursor de relaciones, normalización inconsistente de IDs y selección de principal dependiente del orden; política de reintentos del transporte con sus constantes y la inalcanzabilidad de `:56`; mapeo 401→502 y 403→403 en captura y preflight; diferencias entre preflight y captura; manifiesto autorreferente; todas las propiedades de `jobs.ts` descritas en las secciones 3, 6.3 y 7; contenido y huecos de `tests/hubspot.test.ts`; discrepancia del hash de `hubspot.ts` respecto a `CODEX-HS-001.md`.

**INFERIDO.** Insuficiencia del presupuesto de 100 s para portales grandes y estimación de peticiones (F3); falsos positivos del recuento por altas y bajas concurrentes y compensadas (F4); incompatibilidad potencial del cursor individual con `batch/read` (F5); inestabilidad de `planb_company_id` entre capturas si el orden de la API varía (F8); forma numérica de `from.id` (F7); `numErrors` mayor que `errors` (F20); la mezcla de versiones de ruta a mitad de paginación (F14); la ausencia de efectos de F11 más allá del aborto.

**NO EVALUABLE.** Cualquier comportamiento de la API de HubSpot (rutas `2026-09`, scopes, estados de lote, orden y compatibilidad de cursores, límites y cabeceras de cuota, consistencia de `total` en búsqueda, forma real de `associationTypes`); el estado real del CRM o de cualquier portal; resultados de ejecución de tests (nada se ha ejecutado, incluida la afirmación de 23/23 de otro informe); `server/store.ts`, `shared/model.ts` (incluido el valor de `MAX_RECORDS`, `reconcile`, `validateRecord`), `server/team/repository.ts`, OAuth, rutas, `TeamApp.tsx` y el planificador; hallazgos H2, H3, H4, H5, H7 y H8 de CLAUDE-001; existencia de otros tests que cubran los casos; latencias reales; retención de `team_captures`.

## 15. Verificación final de hashes

Se recalcularon los seis hashes al terminar de escribir este informe (2026-10-31T15:52:55+01:00): **los seis coinciden con la tabla de la sección 1**. Las referencias `ruta:línea` son válidas para esos hashes; si un archivo cambia después, hay que revalidarlas antes de implementar. Esta verificación no equivale a revisar el estado de ningún otro archivo del repo.
