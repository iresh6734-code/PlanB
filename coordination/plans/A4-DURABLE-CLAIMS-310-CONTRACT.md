# A4 · Claims duraderos310 · interfaz de almacenamiento

9 de noviembre de 2026, Europe/Madrid. Interfaz acordada con el coordinador antes de escribir código, incluidas las tres precisiones siguientes. Cuatro rutas propias registradas; sin API HTTP, tipos públicos compartidos, App/main ni modificación del diario208. Dependencias aceptadas: contrato A4 y208.

## Frontera elegida

El módulo de servidor conserva marcas de operación y ofrece un adaptador `IntentStorage`208. Una única transacción síncrona de Store compara valores actuales, valida el índice, ejecuta la guardia de permiso/contexto y escribe intención, claim y metadatos. No llama a `saveRecord`, no anida transacciones y no despacha tareas. El coordinador mantiene el hueco documentado entre commit de tarea y liquidación.

El diario guarda exactamente el raw208 recibido. No se introduce un campo extra ni se modifica su checksum: la relectura de confirmación208 puede comparar los mismos bytes. Las marcas usan otro prefijo de meta y Store sella sus valores como los demás metadatos. El lector208 existente puede seguir leyendo las intenciones sin adoptar este módulo.

## Tipos y funciones propuestas

`ClaimIdentity` contiene los seis campos acordados: instanceId, snapshotId, capturedAt, captureStartedAt, accountId y generatedAt, con null explícitos admitidos por el contexto. Una instalación lista exige instanceId UUID no nulo. `ClaimDescriptor` contiene attemptId UUID, identity, contextRevision, taskId, expectedRevision y fingerprint. Los tokens de revisión y pin son SHA256 hex. El descriptor nunca contiene valores de campos.

`fingerprintTaskIntent({ attemptId, identity, contextRevision, taskId, expectedRevision, values })` calcula SHA256 de la representación canónica versionada; valores son el parche normalizado del servidor. Se reutiliza en el coordinador al recibir la petición y en el adaptador al verificar que el parche208 corresponde al descriptor. El cliente no elige la huella. Baseline solo es del servidor y no se usa para cambiar la identidad de una petición repetida.

`createTaskIntentClaims(store)` expone:

- `inspect()`: lectura síncrona pura del estado del índice y sus marcas. Devuelve ready/uninitialized/unavailable, nunca repara ni inicializa.
- `lookup(descriptor)`: lectura pura con resultado new/replay/expired/reused/wrong-scope/unavailable. Compara primero pertenencia al ámbito y después huella. No invoca callbacks ni escritores.
- `writeIntent(descriptor, raw, expected, options)`: resultado detallado `{ status: StorageWrite, issue }`. La primera alta exige phase attempt y seq1. Claim y raw208 se crean juntos; toda actualización exige el CAS raw y seq siguiente, conserva campos inmutables y actualiza el mínimo de desenlace en la misma transacción. Se puede entregar un acuse compacto `{ changed, resultingRevision }` al liquidar acknowledged. El servidor debe aportarlo si quiere conservar esos campos después de omitir la respuesta grande.
- `removeIntent(descriptor, expected, options)`: solo quita detalle settled válido bajo CAS. Conserva claim/tombstone y el descriptor mínimo de desenlace. Un intento pendiente no se elimina.
- `storage(descriptor, options)`: adaptador `IntentStorage` para208 que delega en las operaciones anteriores y conserva sus cuatro resultados. `readAll` mantiene la forma208; `write` y `remove` solo operan sobre el ID ligado al descriptor. El coordinador usa `writeIntent` si necesita el motivo público preciso (por ejemplo capacidad de claims frente a capacidad208).

`options.assertCurrent: () => void` debe capturar el permiso original y el contexto. Se ejecuta dentro de la transacción, inmediatamente antes de la primera mutación, después de validación/CAS/capacidad. No se acepta un resultado Promise. Un error aborta y produce cero escrituras; el servicio debe revalidar autorización antes de publicar su respuesta, también si208 traduce el fallo a storage-failed. Para liquidación, la guardia nueva pertenece a esa misma petición original; no se adopta un login posterior.

`storage` captura la función assertCurrent original al crearse: sustituirla después en el objeto de opciones no adopta otro permiso. El objeto puede recibir un `receipt` auténtico del escritor antes de liquidar; no convierte el callback de autorización en mutable. Un intento HTTP nuevo no arrastra ese recibo de un envío anterior.

La misma guardia puede comparar de forma síncrona `expectedTaskRevision` y la secuencia exacta al aceptar evidencia humana. El CAS del raw sigue siendo obligatorio. No se reinterpreta una autorización distinta ni se implementa aquí la aceptación208 futura del coordinador.

Tras cada mutación se releen raw, claim e índice dentro de la transacción. Un `set` que retorna sin escribir no da éxito. Se comprueba además el estado al retornar de la transacción. Si falla el acuse de COMMIT o su relectura, se devuelve `commit-uncertain`, nunca `ok`; `lookup` permite conciliar lo efectivamente persistido sin volver a despachar.

El adaptador ligado a un ID rechaza `remove` sobre otro, incluso si `prune()`208 lo solicita. No hay poda global oculta. El mantenimiento se hace explícitamente con `removeIntent` y descriptor validado, más permiso actual. Al llenarse200entradas208, un alta puede recibir `full` aunque haya detalles antiguos de otros IDs: el coordinador debe ejecutar el mantenimiento autorizado antes de reintentar el alta. Las pruebas cubren esa política. Las marcas de ejecución no se podan.

## Persistencia y validación

Marcas individuales inmutables en ID, huella, identidad completa, pin, tarea, revisión original y fecha de creación. Guardan hash de los campos inmutables del raw208 (incluidos parche y baseline), seq/fase/desenlace/procedencia/hora actuales y acuse compacto opcional. Ningún valor de tarea aparece fuera del raw208 sellado.

Índice versionado con número de marcas, suma de bytes UTF8 en claro y digest de las marcas ordenadas; se actualiza en la misma transacción. Una marca supera como máximo4096bytes, el conjunto16MiB y10000marcas. El módulo rechaza antes de cualquier mutación un alta que exceda un límite; actualizaciones/replays existentes permanecen disponibles cuando no aumentan fuera del presupuesto. El límite de entradas208 también se verifica dentro de esa transacción.

La representación canónica ordena claves de objetos y conserva el orden de arreglos. El digest del índice es SHA256 del arreglo de pares `[attemptId, SHA256(claimCanónico)]`, ordenado por comparación lexicográfica de los IDs. El presupuesto agregado cuenta los bytes UTF8 canónicos de las marcas, sin el sobre cifrado ni los dos metadatos acotados de índice y época. Las fixtures físicas de límites preparan esa representación para probar10000marcas sin ejecutar10000capturas incrementales de todo el índice.

Una liquidación ya cerrada no admite otro cambio de desenlace por este adaptador; conserva su marca y solo puede pasar a tombstone retirando el detalle con CAS y guardia. Las cadenas de identidad se conservan como datos opacos de contexto (máximo500caracteres), incluidos cuenta vacía y null distintos. Es el servicio el que valida el contexto listo y sus permisos; el almacén no autentica esas cadenas por su contenido.

Se conserva además una marca de inicialización A4. Si el índice falta y hay marcas o inicialización A4, se declara unavailable. Sin ninguno puede leerse una instalación antigua sin inicializarla; solo un POST autorizado que vaya a crear su primera intención inicia el índice. La creación inicial es atómica con claim+intent. Si un ID208 ya existe sin claim, se rechaza su adopción, sin reenviar. Un índice o marca corruptos, un claim con detalle pendiente ausente, un detalle incompatible o un tombstone con detalle inesperado producen indisponibilidad conservadora y no se sobrescriben.

La restauración o eliminación coherente de todas las marcas y la época queda fuera de la garantía local contra retroceso. No se deduce identidadA4 de un UUID208 legado. No se promete detectar una restauración externa antigua coherente; el contrato A4 exige revisar su época y efectos.

`storage.readAll()` no amplía permiso HTTP; el módulo es interno y devuelve filas al clasificador208. `inspect` y `lookup` contienen metadatos de ámbito, por lo que el coordinador debe filtrar antes de publicar. La ruta HTTP no expondrá un inventario global del almacén a otra cuenta/copia.

## Pruebas de aceptación

SQLite de memoria y archivo con reinicio. Claim y raw sellados, sin texto de parche/base en claro. Fallos en cada escritura de la transacción revierten todo. Relectura fallida no habilita despacho. Doble alta/CAS antiguo/ID reutilizado no cambian datos. Poda208 después del TTL conserva tombstone y replay expired sin efectos; la poda por capacidad se contrasta también. Guardia que revoca contexto, lanza o devuelve Promise produce cero cambios. Índice ausente/corrupto, marca corrupta, detalle perdido/alterado, ID208 legado y límites se prueban sin reparación implícita. Lecturas no cambian ninguna fila. El módulo nunca incluye una función de enviar tareas.

El servidor HTTP y la aceptación humana atómica se implementan por el coordinador en sus unidades. Esta entrega no sustituye esas pruebas ni activa cobertura del resumen.

## Dependencia histórica del banco

Store utiliza shared/recovery-integrity.ts y shared/operations.ts del paquete087, aún en review. El preflight inicial310 lo detectó y se detuvo antes de ejecutar pruebas. Los bancos de diagnóstico posteriores fijan exactamente aa9f3456… y a2412f47… desde la copia congelada de298, versiones que ya forman parte de los bancos de Store existentes. No copian una edición working ni aceptan087. La revisión independiente de ese paquete histórico y la del módulo310 siguen siendo puertas separadas del montaje.
