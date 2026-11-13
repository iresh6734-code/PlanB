# CLAUDE-SOURCE-ZENDESK · Adaptador de tickets de Zendesk (informe de entrega · R3)

8/11/2026, Europe/Madrid. Claude B (fuentes, evidencia y portabilidad). Dependencia aceptada: `CODEX-COMMITMENT-RADAR-CORE`. No se toca `shared/commitments.ts` ni ninguna entrega aceptada. **R3** (dos fronteras acotadas, ver más abajo) sobre la **R2** tras el dictamen independiente `coordination/reviews/CLAUDE-SOURCE-ZENDESK-independent-285.md` y el brief `CLAUDE-SOURCE-ZENDESK-R2-285.md` (sección «R2» más abajo).

## Qué es y qué NO es
Un adaptador de **solo lectura** de tickets que convierte lo que devuelve Zendesk en observaciones del contrato aceptado del Radar, con la cobertura real de la lectura. **Código implementado y probado con respuestas sintéticas y un servidor de bucle local.** No hay acceso comprobado a Zendesk (ninguna llamada real, ninguna cuenta, ninguna credencial), no está montado en la App ni en `main`, y ninguna pantalla debe mostrar «Zendesk conectado» por esta entrega.

## Capas (archivos nuevos propios)
| Archivo | Responsabilidad |
| --- | --- |
| `shared/source-reading.ts` | Modelo neutro `SourceReading`/`SourceRecord` (reutilizable por Pipedrive) y proyección pura `readingObservations` → `CommitmentObservation` del contrato. Se autovalida: una lectura «completa» no puede traer omitidos ni parada; «no disponible» no trae registros; un registro de otra cuenta, **de otro tipo de objeto, o (en una consulta por ID) de otro ID o rol que el objetivo, se rechaza**. |
| `server/source-read-transport.ts` | Transporte común de lectura. Solo `get` (la API no admite cuerpo ni otro método). Origen exacto, ruta y consulta por regla del llamador, sin `//`, fragmento ni credenciales en la URL; solo `accept` y la credencial; **sin seguir redirecciones**; presupuesto de peticiones; tope de bytes que rechaza la respuesta ENTERA; errores sin cuerpo; `Retry-After` solo en segundos (máx. 3600). **R2: tiempos y cancelación propios (ver abajo).** |
| `shared/zendesk-source.ts` | Adaptación pura: ticket → registro, página de cursor → registros, política de condición explícita, límites y puntos sin confirmar declarados. |
| `server/zendesk-source.ts` | Lector: `readTickets()` (cursor) y `readTicket(id)`. Construye cada URL; **nunca sigue una URL de la respuesta**. |

## R3 · dos fronteras acotadas (revisión `independent-285` y brief `CLAUDE-SOURCE-ZENDESK-R2-285.md`, sección R3 vigente)
**F3 · excepción SÍNCRONA de `fetch`.** Un `fetch` inyectado que lanza antes de devolver una promesa se clasifica ahora como fallo de transporte (`network`; o `aborted`/`timeout` si la parada ya había ocurrido), igual que un rechazo asíncrono: la lectura devuelve `SourceReading` no disponible, **sin su mensaje privado ni la credencial**, sin oyentes acumulados y conservando temporizadores y descartes tardíos. Los errores de **validación de entradas** (subdominio, origen, cuenta, límites, ID de ticket) siguen lanzando: no se ocultan bajo una lectura falsa.
**F4 · puerta tras `credential`.** Después de llamar a `credential` y **antes de contar la petición o invocar fetch**, el transporte revalida la cancelación del llamador y el plazo total. Un callback local que aborta la señal (cuyo listener, añadido después, no volvería a emitir) o que consume el plazo da `aborted`/`timeout` con **0 peticiones contadas y 0 invocaciones de fetch**, en lecturas por ID y en listados. No se pretende interrumpir JavaScript síncrono que no devuelve.

## R2 · qué se corrigió
**F1 · frontera del esquema neutro.** `sourceReading` rechaza ahora: un registro cuyo `objectType` difiere del de la lectura; en una consulta por ID, un registro con `remoteId` distinto del objetivo; y uno con `kind` distinto del objetivo. Cada incoherencia se prueba por separado con valores válidos y `readingObservations` la rechaza antes de proyectar (no hay observación completa del ticket 8 por pedir el 7). Se conservan: listado vacío con fin explícito, consulta no disponible sin registro y objetos de contexto sin rol (que no se proyectan al Radar). `shared/commitments.ts` intacto.

**F2 · límites propios del transporte.** Una señal enviada a `fetch` no basta. Cada espera (cabeceras y cada `reader.read`) compite con una **puerta de parada propia** (aborto del llamador, plazo por petición o plazo total): si gana, la lectura termina ya con su categoría (`aborted`/`timeout`) aunque el `fetch` inyectado o el cuerpo ignoren la señal; lo que llegue después —respuesta, cuerpo o error— se **descarta** (nunca se publica un `complete` tardío), el cuerpo tardío se cancela **sin esperarlo** (una cancelación que no termina nunca no vuelve a bloquear) y la promesa abandonada tiene su rechazo atendido (cero `unhandledRejection`). Un plazo total agotado entre páginas deja la lectura parcial. Los temporizadores y el oyente de la señal del llamador se retiran siempre (comprobado con `getEventListeners`). Se mantienen GET, origen/ruta/consulta exactos, redirección manual, presupuestos, tope de bytes (respuesta rechazada entera), errores sin cuerpo ni credenciales y **ningún reintento**.

**Afirmaciones afinadas** (`ZENDESK_UNCONFIRMED` y `ZENDESK_READ_LIMITS` en `shared/zendesk-source.ts`):
- La [guía de migración OAuth](https://developer.zendesk.com/documentation/authentication/oauth-migration/) documenta el alcance `tickets:read`; qué concede una cuenta concreta y si basta para listar y consultar tickets **no se ha ensayado**.
- Las [claves de API figuran como obsoletas](https://developer.zendesk.com/api-reference/introduction/security-and-auth/); **no** se afirma que todas hayan dejado de funcionar. Este adaptador sigue siendo solo OAuth Bearer (sin nueva autenticación ni permisos).
- El `accountId` de una lectura live es el **subdominio configurado**, no una identidad de cuenta observada en una respuesta del proveedor.
- «Completa» = se recorrieron todas las páginas visibles con la credencial; **no** es una captura atómica ([los tickets pueden cambiar durante la paginación](https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/)) ni el inventario íntegro de la cuenta.
Fuentes de contraste: [Tickets](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/), [cursor](https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/), [seguridad y autenticación](https://developer.zendesk.com/api-reference/introduction/security-and-auth/), [migración OAuth](https://developer.zendesk.com/documentation/authentication/oauth-migration/).

## Política de datos
- **Condición** (explícita y configurable): `solved/closed` → completado; `hold` → bloqueado; `new/open/pending` → sin bloqueo observado. Cualquier otro estado se **omite con contador** y la lectura queda parcial: un estado futuro no se toma por sano.
- **Etiqueta**: estado, prioridad conocida e ID. No copia el asunto (puede llevar datos personales) salvo `includeSubject`, limpio y recortado.
- **Instante**: `observedAt` es el fin de la lectura, no la fecha del ticket (se conserva como `updatedAt`): el Radar envejece la evidencia con su reloj.
- **Identidad**: proveedor, cuenta (subdominio), rol `support`, ID remoto. `external_id` se conserva como dato y **nunca** vincula. El adaptador no emite enlaces.

## Regla de cobertura
`complete` solo si se llegó a `has_more: false` explícito, sin omitidos ni parada. Sin `meta.has_more` booleano la respuesta se rechaza. Presupuesto de páginas o registros, cursor repetido o ausente, fallo tardío, timeout, aborto, truncado → `partial` (con lo ya leído) o `unavailable`. Duplicados entre páginas: se conserva el más reciente y la lectura queda parcial.

## Modos
- `live`: construye `https://{subdominio}.zendesk.com` (subdominio validado) y produce el proveedor `zendesk`. **No se ejecuta en esta entrega**: solo se prueba con un `fetch` simulado.
- `local-test`: bucle local, cuenta `fixture-*`, proveedor **`zendesk-fixture`**: una lectura de ensayo nunca se presenta como Zendesk real.

## Pruebas (`tests/zendesk-source.test.ts`, **29**: 19 originales intactas + 8 de R2 + 2 de R3)
Las 19 anteriores (HTTP local y respuestas sintéticas: cursor completo/incompleto, página vacía, permisos, 429, plazos, truncado, tope de bytes, redirección, transporte, modos, desconocidos, política, aislamiento, Radar, cancelación, credencial, esquema, `Content-Length` mentiroso) **pasan sin cambios**. Las 8 de R2 usan `fetch` y `ReadableStream` sintéticos gobernados por barreras (con una salvaguarda de 800 ms que las libera si la lectura no termina por sí sola, y siempre en `finally`; plazo de observación 150 ms frente a 30–40 ms del transporte): tres incoherencias de esquema (más los casos que deben seguir valiendo); éxito tardío tras abort y tras timeout; cuerpo que aborta antes de entregar bytes; **fetch retenido** y **cuerpo retenido (con cancelación que nunca termina)** que no se liberan hasta después del plazo; plazo total (lento y con página retenida); error tardío y señal ya abortada (cero peticiones); y ausencia de oyentes acumulados tras 40+5+1 lecturas.
Las 2 de R3: excepción síncrona de fetch (con su control asíncrono, sobre lectura por ID y listado, sin mensaje ni credencial, sin oyentes, y con la validación de entradas intacta) y puerta tras `credential` (aborto y plazo agotado por el callback, lectura por ID y listado, con el control sin cancelación). Resultado: **29/29** con el código R3; tipos limpios (`tsc -p .`).

**Sensibilidad (R1 → R2).** Con las fuentes R1 originales en una copia privada (`tests/.tmp/zendesk-r2-r1copy`, hashes de R1 verificados) y el MISMO archivo de pruebas R2: pasan las 19 anteriores y **fallan 7 de las 8 nuevas** (esquema, éxito tardío, cuerpo tras abort, fetch retenido, cuerpo retenido, plazo total, oyentes); la octava (error tardío) fija un comportamiento que R1 ya cumplía. Con R2: 27/27. Además, las **9 sondas independientes de Codex** (`tests/.tmp/zendesk285-probes.ts`, sin modificarlas) pasan **9/9** contra las fuentes R2 en una copia privada (`tests/.tmp/zendesk-r2-probecopy`). No se copió la corrección experimental de Codex.
**Sensibilidad (R2 → R3).** Con las fuentes R2 (las presentadas, hashes `5e48…`/`efff…`) en una copia privada (`tests/.tmp/zendesk-r3-r2copy`) y el MISMO archivo de pruebas R3: pasan 27 y **fallan las 2 de R3**; con R3, 29/29. Las **9 sondas originales y las 3 sondas extra de Codex** (`zendesk285-probes.ts`, `zendesk285-r2-extra.ts`, sin modificarlas) pasan **12/12** contra las fuentes R3 en una copia privada (`tests/.tmp/zendesk-r3-probecopy`). Se repiten las 27 anteriores (19 + 8) dentro de las 29.
**Control causal:** **33 mutantes** (los 30 anteriores más 3 de R3: la excepción síncrona de fetch escapa, no se revalida el aborto tras `credential`, no se revalida el plazo total tras `credential`) → **33/33 detectados**; fuentes restauradas por hash. (Los 30 anteriores, del código (los 21 de R1 más 9 de R2: espera de cabeceras sin puerta, lectura del cuerpo sin puerta, plazo total ignorado, oyente no retirado, respuesta tardía sin cancelar, publicación tras la parada, y las tres invariantes del esquema) → **30/30 detectados**; fuentes restauradas por hash.

## Matriz de capacidades
| Capacidad | Implementada | Probada con sintético/local | Pendiente de ensayo real |
| --- | --- | --- | --- |
| Listar tickets por cursor (`page[size]`, `page[after]`) | Sí | Sí (completa e incompleta) | Cuenta propia, alcance OAuth realmente concedido, visibilidad de la credencial |
| Consultar un ticket por ID | Sí | Sí (200, 403, 404, estado raro, otro ID) | Ticket borrado/archivado |
| Cobertura honesta (completa/parcial/no disponible) | Sí | Sí | — |
| Permisos insuficientes y pérdida de acceso (403/401) | Sí | Sí | Cuerpos y condiciones reales |
| `Retry-After` en 429, sin reintento | Sí | Sí | Cabeceras por plan |
| Timeout, aborto y límites **propios** aunque fetch/cuerpo no cooperen | Sí (R2) | Sí | — |
| Truncado, tope de bytes, redirección | Sí | Sí | — |
| Proyección al Radar (rol `support`) | Sí | Sí (contra `projectCommitmentEvidence`) | Montaje en la App |
| Modo `live` (`https://{subdominio}.zendesk.com`) | Sí | Solo URL con fetch simulado | **Todo** (cuenta, token OAuth, host, alcance) |
| Exportación incremental / tickets de agente de IA | No | — | Decisión posterior |
| Escritura de cualquier tipo | **No existe** | La API no la ofrece | — |

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Adaptador, transporte común y pruebas | Implementado, interno | Esta unidad · Claude B |
| Llegada a la App (Integraciones o Radar) | **No existe.** Contrato mínimo para Integraciones propuesto en una unidad aparte | `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` (propuesta, Claude B) y montaje central de Codex |
| Ensayo con una cuenta Zendesk propia | **No hecho** | Requiere cuenta de pruebas y autorización expresa del usuario; credencial introducida por él, nunca en chat |
| Pipedrive reutiliza `source-reading` y el transporte | Pendiente | `CLAUDE-SOURCE-PIPEDRIVE` (depende de la aceptación de esta R2) |

## Límites declarados
Solo Windows y Node de este equipo. El servidor local no es Zendesk: no acredita su formato real ni sus límites. La lista solo trae los tickets que ve la credencial y no incluye los archivados. Las pruebas de plazos usan tiempos de 30–150 ms: dependen de que el equipo no esté saturado (las barreras de seguridad evitan colgarse, no flaqueos de reloj extremos).

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| shared/source-reading.ts | 5e487a65916d2f3e7af5afb328235960acb4d51ab58da01f19ce8b241f34192a |
| server/source-read-transport.ts | 563ca82cd69edea1fdad006fbd79d830e8d6f468588e1dcd80f220b6909f5efc |
| shared/zendesk-source.ts | 2c4f88108d72b2a28a4be80b9cc1792032100a6cbc5e197c11c0074644dfc6db |
| server/zendesk-source.ts | 0a61a42d0f339bd2557b466ed6584902cb7b17ae81b3a67afac29a662d37c2fd |
| tests/zendesk-source.test.ts | 3801cdb81914847368006c86d0f897ab71468652cc2dd56fb699e764fbfbd9d2 |
| coordination/reports/CLAUDE-SOURCE-ZENDESK.md | (este informe) |

R1 presentado: source-reading 71b0…, transporte e96e…, zendesk-source ade5…, server/zendesk-source 0a61…, tests 0675…. R2 presentado (revisado por Codex): source-reading 5e48…, transporte efff…, shared/zendesk-source 2c4f…, server/zendesk-source 0a61…, tests 8c9a…. R3 cambia solo el transporte y las pruebas (las demás fuentes conservan su huella de R2).
