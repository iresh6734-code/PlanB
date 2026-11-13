# Estado de fuente para Integraciones · contrato, lenguaje de producto y plan de montaje (R3)

9/11/2026, Europe/Madrid. Claude B (`CLAUDE-SOURCE-INTEGRATIONS-CONTRACT`, R3 tras el dictamen 296: interrupción tras cabeceras y autorización dentro del mismo milisegundo). **Estado real:** `shared/source-status.ts` define el contrato y su derivación PURA a partir de una `SourceReading` aceptada (Zendesk, Pipedrive) y la matriz de textos y acciones. Es **código interno probado**. **No existe** API, persistencia, pantalla ni acción de lectura autorizada: ni Integraciones ni el Radar muestran hoy una fuente externa, y no debe afirmarse que Zendesk o Pipedrive estén conectados.

## Límite de confianza (qué es dato confiado y qué debe autenticar el anfitrión)
`SourceReading` y la entrada de registro (`sourceRegistryEntry`: cuenta configurada, cuenta observada, autorización, alcance, objetos) son **datos que el anfitrión confía**: no son firmas ni autenticación de procedencia. La derivación solo comprueba su **coherencia** (proveedor, cuenta, objeto, cronología). **El anfitrión debe autenticar la identidad y la autorización y comprobar cuenta, objeto y alcance al ejecutar cada lectura**; esta derivación no sustituye ese control ni lo realiza. `connected` es siempre `false`.

## Niveles (nunca se confunden)
| Nivel | Cuándo | Qué dice |
| --- | --- | --- |
| `implementation-prepared` | Adaptador existente, ningún recibo | «Configuración preparada · sin lecturas»; «Sin recibos locales» (distinto de un listado vacío) |
| `fixture-reading` | Proveedor `*-fixture` con datos | Datos ficticios; no acredita acceso |
| `attempt-without-data` | Se intentó leer y no llegó ninguna página (de ensayo o real) | «Intento sin lectura útil · recuento desconocido» + causa; **no** es una lectura observada |
| `provider-observed` | Proveedor real que SÍ devolvió datos (completa o parcial), con autorización registrada **anterior o igual al inicio** | «Lectura observada» (reciente o antigua) / «Lectura parcial observada» / «Listado observado vacío» |

**Evidencia del intento** (`evidence`): `data` (llegó al menos una página) · `not-sent` (no salió petición: credencial ausente, cancelación previa, presupuesto, petición bloqueada) · `no-response` (salió y falló la red ANTES de recibir respuesta: causa `network`) · `interrupted` (salió y se interrumpió por plazo o cancelación antes de completar una página; **el recibo no distingue si ya habían llegado las cabeceras**, así que no se afirma ni que llegó ni que no llegó respuesta; conserva causa, acción y recuento desconocido) · `error-response` (el proveedor respondió con un error HTTP: una respuesta, pero sin datos) · `unusable-response` (llegó algo inutilizable: ilegible, truncado, demasiado grande, valor sin interpretar). Haber invocado `fetch` no acredita por sí solo una respuesta del proveedor; un error HTTP y una lectura útil tienen evidencias distintas.
**Acceso** según el último intento (no es una promesa de acceso actual): `not-attempted` · `data-obtained` · `denied` (403/401) · `unknown`.
**Cuenta:** `none` · `configured` (escrita por la persona, p. ej. el subdominio) · `observed` (comprobada con una respuesta del proveedor y coincidente). **Vigencia:** `reading.fresh`. **Listado vacío:** `emptyListing` (se llegó al final y no hubo registros) frente a `reading: null` (sin recibos locales).

## Cronología y alcance de la autorización
Una autorización **posterior** al inicio de la lectura (`startedAt`) no la respalda: se rechaza (`AUTHORIZATION_AFTER_READING`), también para un intento sin datos. R3: la comparación usa **toda la precisión que admite el esquema** (hasta nueve decimales): `.000001Z` es posterior a `.000Z`; igual y anterior se aceptan y distintos números de decimales se ordenan por su valor. La autorización puede restringir los objetos (`objectTypes`): un objeto leído fuera de ellos se rechaza (`READING_OUTSIDE_AUTHORIZED_SCOPE`). Un proveedor real sin autorización, una lectura de otra cuenta o de otro proveedor, también. El ensayo (`*-fixture`) no necesita autorización. **Límite:** el esquema solo representa una autorización declarada por el anfitrión (fecha, alcance en texto, objetos); la autenticación y la comprobación al ejecutar son del anfitrión.

## Matriz de textos y acciones (fuente única: `describeSourceHeadline`)
| Situación | Titular | Acción ofrecida |
| --- | --- | --- |
| Sin cuenta | Configuración preparada · sin lecturas | Configurar la cuenta |
| Real sin autorización | Configuración preparada · sin lecturas | Autorizar la lectura de esta cuenta |
| Con cuenta y autorización, sin recibos | Configuración preparada · sin lecturas (sin recibos locales) | Leer ahora (acción explícita) |
| Ensayo con datos | Lectura de ensayo · datos ficticios (o parcial / listado vacío) | Según vigencia |
| Intento sin petición (credencial ausente, cancelación previa) | Intento sin petición · recuento desconocido | Revisar el acceso / Leer ahora |
| Intento sin respuesta (falló la red antes de recibir nada) | Intento sin respuesta · recuento desconocido | Reintentar más tarde |
| Intento interrumpido (plazo o cancelación con la petición ya enviada; no se sabe si llegaron cabeceras) | Intento interrumpido · recuento desconocido («no se sabe si la fuente llegó a responder») | Reintentar más tarde (plazo) / Leer ahora (cancelación) |
| Error del proveedor (403, 401, 429, 5xx) | El proveedor respondió con un error · recuento desconocido | Revisar permisos / acceso / Reintentar más tarde |
| Respuesta inutilizable | Respuesta que no se pudo usar · recuento desconocido | Leer ahora |
| Parcial con datos reales | Lectura parcial observada · reciente/antigua (cota inferior y causa) | Leer ahora |
| Completa y reciente | Lectura observada · reciente (de lo visible; no es el inventario íntegro) | Sin acción pendiente |
| Completa y antigua | Lectura observada · antigua | Leer ahora (acción explícita) |
| Completa y vacía | Listado observado vacío (se leyó hasta el final) | Según vigencia |
Reglas de lenguaje: **nunca** «Conectar» ni «conectado»; un intento sin datos dice siempre «recuento desconocido (no es cero)» y su causa; «Lectura observada» solo con datos de un proveedor real; el ensayo dice «ficticios»; cada vista termina con «No conectado: este estado no prueba una conexión ni se actualiza solo». **Abrir la pantalla solo consulta estado local**; cualquier lectura externa es una acción explícita con cuenta y alcance autorizados.

## Lo que falta y quién lo hace
| Pieza | Dueño | Rutas candidatas | Depende de |
| --- | --- | --- | --- |
| Registro local de la fuente (cuenta, identidad observada, autorización autenticada, objetos, alcance) | Codex coordinador | almacén de fuentes y `server/main.ts` | Este contrato aceptado |
| `GET` local de estado (sin red) y acción explícita de lectura con comprobación de autorización al ejecutar y cancelación | Codex coordinador | API nueva; reutiliza los adaptadores aceptados | El registro |
| Historial de recibos | Codex (298 y diario 297 aceptados) | `GET` de historial ya aceptado | — |
| Credencial: introducida por la persona, guardada cifrada por el servidor, nunca en chat ni registros | Codex + persona | almacén existente | Decisión de seguridad |
| Consumidor en Integraciones (estado + historial) | Claude B, rutas acordadas | `src/SourceReadingHistory.tsx`, cliente, estilos, pruebas | API acordada |
| Recorrido en la App compilada | Claude B (QA) | pruebas propias | Montaje aceptado |
| Ensayo con cuenta real | Persona | — | Cuenta propia y autorización expresa |
