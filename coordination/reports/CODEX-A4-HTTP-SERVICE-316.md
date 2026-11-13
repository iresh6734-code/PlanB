# A4 · Servicio y API de ejecución duradera 316

9/11/2026, Europe/Madrid. Codex coordinador. Presentación para revisión independiente. **Implementada como API opt-in de un servidor protegido; no registrada en main/runtime ni montada en App.** Primera versión exclusivamente con copia ficticia. No llamadas a proveedores ni despliegue en 4601.

## Comportamiento

`registerTaskIntents(app, store, options?)` registra seis rutas del contrato 311 R2 sobre el almacenamiento 310 aceptado. Requiere el capturador original de autorización de `registerSecurity`; el anfitrión conserva el único escritor de la instalación y una instancia de servicio para ese Store.

- POST `/api/v7/task-intents/attempts`: valida ámbito, revisión, campos y referencias; conserva claim+base+parche antes de entrar en `writeTaskRevision`. Solo un ID nuevo despacha. Mismo ID/cuerpo consulta lo persistido; otro cuerpo se rechaza. Un resultado no-op conserva `changed:false` y cero historial. Un resultado grande confirmado conserva el recibo compacto sin recortar campos.
- GET `/api/v7/task-intents`: resúmenes paginados del ámbito actual. Diario indisponible significa recuentos null, no cero. La revisión del cursor cambia al actualizar los resúmenes. Los otros ámbitos solo aportan un recuento; sus tareas y valores no se enumeran.
- GET `/:attemptId`: base y parche exactos, o metadatos con detalle vencido explícito.
- GET `/:attemptId/check`: compara la lectura actual con base y parche, sin escribir. Una tarea ausente, un detalle vencido o una respuesta demasiado grande no acreditan aplicación.
- POST `/:attemptId/accept`: secuencia y revisión observadas, evidencia aplicada recalculada. Guarda evidencia y `accepted-read` mediante **una sola** `writeIntent` CAS; la guardia síncrona comprueba otra vez revisión de tarea y permiso dentro de su frontera de escritura. Es la concreción atómica de A4, sin dos llamadas separadas a `recordEvidence`/`acceptRead` ni cambios al módulo 208.
- POST `/:attemptId/abandon`: confirmación humana y secuencia exacta. No deshace el efecto. Las decisiones sobre un intento que sigue ejecutándose en este servicio se rechazan.

Los GET reciben `identity=JSON.stringify(scope.identity)` y `contextRevision`; solo la lista admite `limit` y `cursor`. Los POST reciben objetos estrictos 311. La identidad y el pin se calculan independientemente desde Store con `currentTaskIntentScope`; copiarlos del cliente no autoriza otro contexto. Bloqueo/relogin no sustituye el permiso capturado antes de una espera. Respuestas sin caché y `Vary: Cookie`; peticiones acotadas por Fastify a 256 KiB reales y respuestas a 512 KiB UTF-8. HEAD no se habilita.

Una excepción después de entrar en el escritor conserva incertidumbre: no se interpreta como que la tarea esté intacta. Un fallo de liquidación devuelve el estado que se logra releer, con el acuse real si se persistió. La comprobación y el replay no ejecutan tareas. `afterPersist`, `afterWrite` y `writer` son dependencias explícitas de prueba; no hay variables de entorno ni endpoints de fallo. La configuración normal omite esas dependencias.

## Evidencia final

Banco congelado `tests/.tmp/a4-http316-verified-rxrhbA`: **113/113 en una pasada**, cero omitidos, **67.593,9917 ms**, tipos focales **exit 0**. Desglose: 21 API nuevas, 19 de 310, 53 de 208, cuatro independientes de claims, 13 del contrato 311 y tres sondas independientes intactas del revisor. `manifest.json`, `run.mjs`, `node.log`, `types.log` y `result.json` conservan fuentes, comandos y códigos. Ejecutar desde la raíz: `node tests/.tmp/a4-http316-verified-rxrhbA/run.mjs`.

Fastify y SQLite son reales. La mayoría de recorridos usa `app.inject`; un caso usa TCP/fetch sobre loopback con el mismo POST y el rechazo de tamaño. Se prueban los cuatro cortes: persistencia falla antes del escritor; intención conservada antes del envío; excepción después de aplicar; fallo al liquidar. También mismo ID concurrente, revisión vieja, 401 real tras bloqueo y otro login, generación nueva durante espera, 422 previo a persistir, aceptación con revisión cambiada en la frontera, tarea ausente, corrupción, expiración, paginación y no-op.

La fixture grande contiene 50 campos adicionales de 4.000 caracteres multibyte cada uno, válidos para el validador existente; su agregado supera 512 KiB. Deja una aplicación, recibo compacto confirmado y comprobación indisponible por tamaño, conservando los valores completos.

La prueba de archivo cierra y vuelve a crear App/Store; conserva el intento incierto y una fila de historial. Lecturas y replay añaden cero llamadas al escritor. **No es un reinicio de proceso con PID distinto.** El arranque existente de `Recovery` vuelve a sellar `returnBusy:false`; la prueba exige que esa sea exactamente la única fila modificada al abrir, con el mismo valor falso, sin cambios en intentos, tareas o historial. Tras abrir, los GET y el replay conservan todas las filas byte a byte.

## Sensibilidad y cortes anteriores

Banco privado `tests/.tmp/a4-http316-causal-nAfU4Z`: dos controles pasan; quitar solo la guardia inmediatamente anterior al escritor hace fallar por una llamada de envío en vez de cero tras bloquear. Quitar la comparación de revisión dentro de la aceptación produce 200 en vez de 409 ante un cambio concurrente. Ambos mutantes se detectan por aserciones, no por compilación. Fuente privada restaurada a `c6ebc3b6…`, tipos 0; producto compartido intacto.

Primer banco OA0oLC: 13/15 y un error de tipo propio. La fixture de un campo de 600.000 caracteres no era válida por el máximo existente de 10.000; se sustituyó por la fixture multibyte descrita. Faltaba además crear la raíz temporal del caso de archivo. El segundo corte pasó 19/19 y mostró un error de tipos del arreglo de fixtures, corregido. Primer conjunto de 113: 112/113 por exigir igualdad de todo el cifrado al arrancar, pese al `returnBusy:false` existente; se precisó y comprobó ese único cambio permitido. No se modificaron aserciones de producto para aceptar el fallo. Un intento de lanzar un banco usó una ruta temporal equivocada y no ejecutó pruebas; la ejecución posterior usa la ruta creada y verificada.

## Huellas de la primera presentación SHA-256

| Archivo | SHA-256 |
| --- | --- |
| server/task-intents-service.ts | c6ebc3b617cbff4db0cceb469c0d1e5bb939141b592810a1f2908ea03f76f7ce |
| server/task-intents-api.ts | cf125b5bcb1a7f3964a65a30cdb614ee8928124aea144d17c89edd4a12e21a93 |
| tests/task-intents-api.test.ts | 404b3491d1e84b026bbf7d09d163fb89ac5b032d12579ebe2dc29e9885cb721c |

El informe queda fijado por submit. No se ejecutó `npm test` completo ni navegador. Los bancos conservan el baseline histórico 087 de Store (`aa9f3456…` y `a2412f47…`) fijado desde 310, con pendiente explícito: **no se acepta 087 por esta entrega**.

## Montaje pendiente y dueños

| Capacidad | Estado | Próximo responsable |
| --- | --- | --- |
| Contratos públicos 311 y claims 310 | Aceptados | Consumidos por esta unidad |
| Servicio HTTP A4 | Implementado y probado aquí; en revisión | Otro Codex, revisión independiente |
| Registro en servidor principal y portátil | Pendiente | Codex coordinador, unidad sucesora con reservas de main/runtime tras aceptar dependencias |
| Cliente/estrategia, recuperación y montaje en ficha/Hoy | Pendientes | Claude A en sus reservas y Codex coordinador para montaje central |
| Cuatro cortes con binario y PID distinto | Pendientes | Nueva QA basada en matriz 317, después del montaje |
| Cobertura general de trabajo | `covers:false` se conserva | Unidad posterior con inventario de productores |

El nuevo servicio no guarda borradores sin enviar, no se adopta desde otra cuenta y no usa credenciales. La restauración externa de una época antigua coherente, el segundo proceso escritor, producción y proveedores quedan fuera. La aceptación de esta API no prueba todavía que exista «Trabajo por recuperar» en la App.

## R2 · Fallo previo al despacho e inventario completo de cuarentena

10/11/2026. La revisión319 devolvió316 por F1/P2 y se acordó el alcance de F2/P2 sin modificar los esquemas311 ni excluir el legado208 para acomodar el código.

### Códigos de consumo

El único503 que acredita que **esta petición nueva no llamó al escritor** es `TASK_INTENT_NOT_DISPATCHED`. Se genera únicamente al fallar la primera persistencia, después de haber comprobado que la operación era nueva. Un COMMIT inicial puede haberse aplicado aunque falte su acuse: ese código no significa «no se conservó ninguna fila». Se consulta el mismo UUID; no habilita reenviar automáticamente ni generar otro ID.

`TASK_INTENT_STORAGE_UNAVAILABLE` se conserva en relecturas, en un ledger indisponible y en fallos posteriores: **no acredita ausencia de efecto**. El cliente mantiene incertidumbre y consulta por lectura cuando pueda. Nunca clasifica todos los503 como no enviados. Las decisiones humanas no usan la bandera de fallo previo; pueden referirse a un efecto ya aplicado.401/409 y las guardias originales se conservan.

### Alcance acordado de la lista

- `entries`: exclusivamente claimsA4 del ámbito solicitado, con pertenencia comprobada.
- `otherContexts`: agregado de claimsA4 de otros ámbitos autorizados de esta instalación.
- `quarantined`: agregado **de instalación** de filas del prefijo208 que se pudieron leer y clasificar como corruptas/incoherentes con `decodeRecord`, antes de atribuir contexto. No afirma que esas filas pertenezcan a la copia abierta. Nunca publica sus IDs, valores, bytes o parches.
- Una fila corrupta legible sin claim se cuenta. Una fila así junto a un claim válido conserva la operación visible y devuelve `read`/quarantined1. Ninguna de esas lecturas repara, inicializa o adopta datos.
- Una fila208 válida sin claim no aporta el descriptor/pin A4 completo para atribuirla a este inventario. La política conservadora devuelve `unavailable`, recuentosnull y sin entradas, sea UUID o identificador legado; no la descarta ni la presenta como ejecuciónA4. La conciliación de esos datos exige una unidad posterior, no un GET que los transforme.
- Enumeración o descifrado fallidos, más de200filas, una fila codificada de más de1.604.096bytes o agregado de más de64MiB producen inventario desconocido. Son límites explícitos de lectura; no recortan datos para devolver cero. SQLite mide bytes mediante `length(CAST(value AS BLOB))`, también en memoria con texto multibyte.

Los cursores incluyen la revisión del inventario208, además de los resúmenes A4 y su alcance. Cambiar cuarentena invalida una página aunque sus operaciones visibles coincidan. Stamps `total_changes()` y `data_version`, junto a las guardias de contexto/sesión, rechazan una observación que cambió mientras se preparaba. No se añadió ninguna espera asíncrona a la lista.

El consumidor debe rotular la cuarentena como entradas del cuaderno de la instalación, sin atribuirlas a la copia actual. Si la lista dice unavailable no mostrará cero ni «sin pendientes». Este alcance concreta el contrato304 y el comportamiento de clasificación208; no extiende cobertura general, importa legado o habilita restauración de borradores.

### Prueba final R2

Banco `tests/.tmp/a4-http316-r2-final-Z98YSC`: **127/127**, una pasada sin omitidos, **84.164,3853ms**, tipos focales **exit0**. Incluye28 API propias,19claims310,53regresiones208, cuatro independientes declaims,13contrato311, tres sondas deCheck y **las siete sondas319 intactas**, SHA `34741a127db37648a0bbfbc941d0341eb1fa78b410e06f23cf63f25ba96334ba`. Manifiesto, script y logs conservan el corte y dependencias; reproducir con `node tests/.tmp/a4-http316-r2-final-Z98YSC/run.mjs`.

Las siete regresiones propias nuevas fallan **0/7** contra c6ebc3b6 de la primera presentación, en `a4-http316-r2-before-hQgqYA/baseline-final.log`, por las aserciones esperadas. No fallan por imports o compilación. El primer bancoR2 también pasó127/tipos, pero una revisión estática posterior corrigió la medición de caracteres a bytes y añadió el caso multibyte; el resultado final anterior corresponde a esa corrección. No se repitieron los dos mutantes anteriores en R2; se conserva su atribución histórica.

Huellas R2 vigentes:

| Archivo | SHA-256 |
| --- | --- |
| server/task-intents-service.ts | 9a11c05f1158164f4a8360319d24d0f0659fd841b0696d7d3ea994c51c2e897b |
| server/task-intents-api.ts, sin cambio | cf125b5bcb1a7f3964a65a30cdb614ee8928124aea144d17c89edd4a12e21a93 |
| tests/task-intents-api.test.ts | be252f591b63bf6d3ef85d587c77e02e69764c7be970f4ee8af06c0f8aba6faf |

R2 se presenta para revisión319; no se autoacepta.318 sigue pendiente y main/runtime/App no cambian. El banco sigue declarando baseline087 pendiente; no hay navegador, proveedor, publicación ni reinicio con PID nuevo en esta unidad.
