# A4 · Ejecución duradera y recuperación de tareas

9 de noviembre de 2026, Europe/Madrid. Decisión de arquitectura del chat Codex coordinador. Contrato presentado para revisión cruzada. La implementación de las rutas se entrega en una unidad posterior. Este documento responde a la propuesta de Claude A y fija la interfaz objetivo para acordar su consumidor.

## Arquitectura elegida

El servidor recibe la operación, conserva su intención antes de modificar la tarea, aplica mediante `writeTaskRevision` y registra el resultado. El cliente hace una petición de ejecución. Una repetición con el mismo ID consulta el intento que ya existe. La ejecución previa nunca se repite por recibir de nuevo esa petición.

Se reutilizan el diario208, su clasificación de arranque, las revisiones de tarea y el almacenamiento cifrado de Store. El protocolo admite el fallo entre la aplicación de tarea y la liquidación de la intención. Ese corte deja un resultado incierto y se resuelve por lectura y decisión humana. El arranque clasifica lo persistido. El envío de la tarea corresponde exclusivamente a una petición nueva, explícita y autorizada del usuario.

El cliente deja de ejecutar un PATCH separado para el camino A4. La ruta condicionada existente conserva a sus consumidores anteriores. Las pruebas del montaje A4 contarán peticiones de ejecución, llamadas al escritor y filas de historial por separado.

## Ámbito y autorización

La identidad incluye `instanceId`, `snapshotId`, `capturedAt`, `captureStartedAt`, `accountId` y `generatedAt`, con sus tipos y null explícitos del contexto vigente. Se acompaña de `contextRevision`, calculada por el servidor a partir del contexto completo. El servidor comprueba los seis campos, el pin, la copia activa y la autorización original de sesión.

Cada petición captura el permiso antes de leer. Lo revalida después de esperas y antes de despachar, escribir decisiones de diario o publicar datos. Bloquear y volver a entrar no autoriza una petición anterior. Otro contexto recibe409 sin valores del intento ajeno. Los identificadores ajenos o ausentes reciben404 en las rutas de detalle.

La primera integración usa instalación propia y datos ficticios. El flujo de guardado permanece local. El piloto de proveedores tiene su propia instalación, alcance y operaciones.

## Peticiones y respuestas

Todos los contratos son estrictos y versionados en `shared/task-intents.ts`. Se fijan límites de512KiB reales por respuesta y256KiB por petición, además del máximo de60 campos y los límites del diario208. Los mensajes públicos y códigos son cerrados. Se utiliza `Cache-Control: no-store` y `Vary: Cookie`.

| Ruta | Entrada | Resultado y efecto |
| --- | --- | --- |
| POST `/api/v7/task-intents/attempts` | `identity`, `contextRevision`, UUID `attemptId`, `taskId`, `expectedRevision`, `values` | Conserva el intento y, solo para una operación nueva, ejecuta el escritor condicionado. Devuelve el estado persistido y un resultado de escritura si se obtuvo durante esta ejecución |
| GET `/api/v7/task-intents` | `identity` y `contextRevision` serializados según esquema | Resúmenes del ámbito actual, estado de lectura y recuento de cuarentena. Excluye parches y valores |
| GET `/api/v7/task-intents/:attemptId` | Ámbito completo | Intento exacto con base, parche, revisión de origen, secuencia y desenlace persistidos |
| GET `/api/v7/task-intents/:attemptId/check` | Ámbito completo | Lectura actual de tarea y comparación con base/parche. Devuelve evidencia, secuencia del intento y revisión de tarea observadas |
| POST `/api/v7/task-intents/:attemptId/accept` | Ámbito, `expectedSeq`, `expectedTaskRevision` | Recalcula evidencia y acepta el estado aplicado sobre esas versiones. Registra procedencia humana |
| POST `/api/v7/task-intents/:attemptId/abandon` | Ámbito, `expectedSeq`, confirmación de dejar de seguir el intento | Conserva el registro y anota la decisión humana de cerrar el seguimiento |

El estado público de ejecución contiene `attemptId`, `taskId`, identidad, `seq`, fase, desenlace, procedencia, horas y un diagnóstico cerrado. La respuesta distingue `created` y `replayed`. `writeResult` es `TaskRevisionResult` o null y describe exclusivamente el resultado disponible de esa ejecución. Consultar posteriormente un intento liquidado puede acreditar el acuse persistido sin reconstruir una respuesta original que no se conservó. La vista actual se obtiene mediante lectura explícita y conserva su propia revisión.

Si el escritor devuelve un resultado válido que supera el presupuesto de respuesta, se conserva el desenlace confirmado y un recibo compacto con `changed`, la revisión resultante, el ID de operación y el ámbito. Tras liquidación confirmada, la respuesta lleva `writeResult:null` y `writeResultOmitted:'response-too-large'`. La tarea completa se omite de forma explícita. El acuse de la operación conserva su significado. El servidor mide el JSON en bytes UTF-8 antes de publicarlo. Un fallo al persistir ese desenlace mantiene la incertidumbre de liquidación.

Detalle y check también respetan el presupuesto. El detalle puede devolver metadatos del intento con `payload:null` y `payloadIssue:'response-too-large'`. Check devuelve evidencia `unavailable`, `reason:'response-too-large'` y metadatos acotados si su representación excede el límite. El registro original se conserva íntegro. Ese resultado no habilita aceptación humana. La lista publica resúmenes paginados y valida el tamaño de cada página, de modo que un intento grande siga localizable por sus metadatos. Un413 de petición indica rechazo previo al despacho. El cliente distingue ese rechazo del acuse compacto de una operación ya aplicada.

La lista declara si pudo leerse. Una lectura indisponible lleva recuentos desconocidos. La cuarentena conserva sus registros y se resume sin publicar bytes corruptos. Los datos de otros contextos se limitan a un recuento autorizado. La lista no enumera sus parches, títulos o tareas.

## Identidad de operación y replay

La huella inmutable incluye versión de protocolo, identidad completa, pin, ID de tarea, revisión esperada y valores normalizados de forma canónica. La base se toma del registro del servidor que coincide con la revisión esperada. El cliente no elige una base de evidencia distinta.

Antes del preflight de una operación nueva se busca el ID ya existente. Si existe, se comprueba su pertenencia y huella. Mismo ID y contenido devuelven su estado sin llamar al escritor. Otro contenido recibe409 `TASK_INTENT_REUSED`. Un registro ilegible conserva su estado y produce indisponibilidad. El cliente nunca cambia el ID para resolver automáticamente una respuesta perdida.

La creación duradera debe reclamar de forma atómica el ID con su huella y la intención208. El diseño de almacenamiento de la unidad de servidor fijará ese reclamo junto a la escritura CAS del registro, evitando una intención sin vinculación verificable. Dos peticiones concurrentes con el mismo ID pueden devolver operación en curso o su estado final. Solo una puede invocar el escritor. Un ID nuevo después de una intención incierta es otra decisión humana contra la revisión que se acaba de leer.

El reclamo duradero sobrevive a la retención del detalle208. Conserva versión de protocolo, ID, huella de entrada, identidad de ámbito, fecha de creación y descriptor mínimo de desenlace. La poda de un registro liquidado conserva esa marca. Mismo ID con detalle vencido devuelve409 `TASK_INTENT_DETAIL_EXPIRED`, `replayed:true` y metadatos acotados. Se observan cero llamadas al escritor. Un ID conocido con otro contenido mantiene el rechazo `TASK_INTENT_REUSED`.

La primera versión admite hasta10.000 marcas de ejecución por instalación, máximo4KiB por marca y16MiB agregados en claro. Al llegar a un límite rechaza nuevas operaciones antes de despachar, con409 `TASK_INTENT_CLAIM_CAPACITY`. Los replays de marcas existentes siguen disponibles. Las marcas no se podan automáticamente. La política posterior de archivo o nueva época de ejecución requiere un contrato separado y una decisión explícita. El índice de marcas registra versión, recuento y consistencia. Su corrupción o ausencia incoherente con intenciones A4 existentes produce503 `TASK_INTENT_CLAIM_UNAVAILABLE` y bloquea nuevas ejecuciones. Nunca se reconstruye una marca ausente ejecutando de nuevo la tarea.

Una instalación antigua sin marcas ni intenciones A4 puede inicializar su índice solo en el primer POST autorizado. Los GET conservan cero escrituras. El servidor comprueba límites y consistencia bajo la misma transacción de creación. La restauración externa de una copia antigua coherente requiere una nueva evaluación de su época y efectos. El contrato local no detecta por sí solo ese retroceso.

## Persistir, aplicar y liquidar

1. Validar forma, ámbito y permiso. Para una operación nueva leer tarea y comprobar revisión. Guardar base y parche de los campos afectados junto al ID y su huella.
2. Confirmar que la intención persistida se puede releer con el mismo contenido. Si la escritura o su acuse son dudosos, detener la ejecución de la tarea y conservar la incertidumbre de almacenamiento.
3. Revalidar permiso, contexto y revisión inmediatamente antes de llamar a `writeTaskRevision`. Comparar y aplicar siguen siendo síncronos bajo el único proceso propietario de Store.
4. Guardar el desenlace observado por el servidor mediante CAS. El acuse confirmado procede de este escritor. Un resultado `changed:false` es un no-op acreditado por el servidor y añade cero filas de cambios.
5. Si ocurre una excepción después de entrar en el escritor o falla la liquidación, releer el intento cuando sea posible y devolver incertidumbre. Un4xx anterior al escritor acredita rechazo sin efecto. Una excepción genérica posterior a entrar en él no acredita que la tarea siga intacta.

La implementación conserva las transacciones existentes. `Store.saveRecord` abre su propia transacción. Una transacción exterior que la anide exige una modificación revisada del almacén. El protocolo admite el hueco entre commit de tarea y commit de liquidación y lo prueba con reinicio.

Se mantiene un único proceso escritor por instalación con el bloqueo de arranque existente. El claim CAS de operación también protege peticiones concurrentes del proceso. Cualquier ampliación multiproceso del escritor condicionado requiere su propia garantía y prueba.

## Comprobar y aceptar

Los GET de lista, detalle y check ejecutan cero escrituras, incluida la actualización de evidencia, fechas o cobertura. `applied` significa que la lectura contiene los valores del parche. Una edición idéntica de otra persona produce esa misma comparación y conserva la incertidumbre de autoría.

Aceptar exige una decisión humana y las versiones observadas. El servidor vuelve a leer tarea e intento, comprueba `expectedSeq`, `expectedTaskRevision` y evidencia aplicada. La evidencia y el cambio a `accepted-read` se guardan en una sola mutación CAS del intento. La frontera de escritura revalida sin espera la revisión de tarea y el permiso. Si cambió cualquiera, devuelve409 y conserva el intento.

La unidad del servidor añadirá la operación atómica de aceptación necesaria al diario208 bajo reserva específica. No implementará dos llamadas independientes a recordEvidence y acceptRead que puedan adoptar otra versión entre ellas. `abandon` identifica una decisión de cerrar seguimiento, con un texto que explique que la tarea pudo aplicarse. Si hay una ejecución viva del mismo intento, devuelve409 hasta su clasificación.

## Errores y protección de la interfaz

401 retira la vista. 404 identifica intento o tarea ausentes del ámbito autorizado. 409 cubre cambio de contexto, revisión, secuencia, reutilización de ID y ejecución pendiente. 413 expresa límite de bytes. 422 expresa entrada inválida. 503 conserva fallo o incertidumbre de almacenamiento mediante códigos distintos.

El cliente considera potencialmente despachado el POST de ejecución desde que sale de su transporte. Cerrar la ficha o cancelar esa espera no deshace el cambio del servidor. `onDispatch` se coloca inmediatamente antes del POST A4 y sigue pudiendo impedir el envío si termina el propietario. El gestor conserva un UUID estable desde antes del envío. Se ampliará `SaveRequest` para transportar ese ID a la estrategia A4, con compatibilidad para estrategias anteriores.

Una confirmación de escritura y la recarga de Hoy tienen estados distintos. Un fallo de recarga conserva el acuse y ofrece reintentar solo las lecturas. Los intentos inciertos se retoman por ID exacto. Reanudar un intento no dispara la ejecución automáticamente.

## Cobertura y borradores

La primera versión cubre intentos de la estrategia A4 desde su activación acreditada. Los borradores sin guardar siguen en memoria hasta su unidad propia. Los caminos anteriores de escritura conservan su alcance previo. Por ello el resumen general mantiene `covers:false` durante esta fase. La lista A4 puede mostrar sus propios registros con el nombre de su alcance.

Activar cobertura pública requiere inventariar productores, ámbito, inicio y categorías cubiertas y revisar el contrato del resumen. Montar la ruta, abrir el componente o tener cero registros no basta para acreditar todas las categorías del trabajo local.

## Reparto de implementación

| Unidad por registrar | Dueño | Archivos propuestos y puerta |
| --- | --- | --- |
| Servidor y contrato público A4 | Codex coordinador | `shared/task-intents.ts`, `server/task-intents-api.ts`, almacenamiento de reclamo propio, pruebas de servidor y ampliación atómica de208 con su prueba. Rutas exactas registradas antes de editar |
| Estrategia y operación estable | Claude A | Cliente A4 nuevo y estrategia nueva. Ampliación de `SaveRequest` y gestor en unidad acordada para UUID estable. Espera contrato público aceptado |
| Superficie de recuperación | Claude A | `TaskRecovery.tsx`, estilos y pruebas nuevos. Espera GET aceptados y vinculación con el mismo gestor |
| Montaje y candidata | Codex coordinador con Claude A | `App.tsx`, `server/main.ts` y host según reservas seriales. SQLite de archivo y servidor compilado |
| QA de cuatro cortes | Claude A con revisión cruzada | Completar su unidad QA sobre rutas y efectos reales. Los ganchos de fallo viven en arnés o dependencias inyectadas de prueba |

Las filas fijan dueños y alcance objetivo. Cada una requiere su tarea, archivos exactos y dependencias de aceptación. La revisión de SCENARIOS la lleva el otro Codex en paralelo y no comparte estas rutas.

## Criterios de aceptación

Se prueba fallo al persistir con cero llamadas al escritor. Se reinicia después del claim y antes de aplicar y se conserva intento incierto con cero efectos. Se aplica una vez y se pierde el acuse, conservando una fila de historial. Se fuerza fallo de liquidación y se comprueba por lectura después de reiniciar. El replay de cualquier intento existente añade cero llamadas al escritor.

Se añaden mismo ID con otro cuerpo, doble envío concurrente, no-op, revisión antigua, 401 durante una espera, cambio solo de generación, tarea homónima, cuarentena y límite de diario. Abrir, comprobar y reiniciar añaden cero escrituras de tarea. La aceptación con secuencia o revisión antigua produce conflicto. La candidata final distingue cero PATCH legados y un POST A4 del único efecto de tarea persistido.

Las pruebas de retención avanzan más allá del TTL208, fuerzan poda por capacidad y reinician. El replay del mismo ID conserva cero despachos y la marca superviviente. Se comprueban límite de marcas, corrupción del índice e intención sin marca. La prueba de respuesta guarda un parche pequeño sobre una tarea válida cuyo campo ajeno al cambio produce un resultado superior a512KiB. Se acredita un único efecto y acuse compacto, con liquidación persistida y omisión explícita de payload. Detalle y check conservan accesibilidad de metadatos sin recortar valores ni dar evidencia aplicada cuando su lectura es indisponible.

Las sondas actuales de Claude A se conservan como línea base del primer404. Los pasos posteriores deberán usar identidad válida, ID de intento exacto, respuesta estrictamente validada y recuentos del nuevo camino de ejecución. Se elimina la dependencia de nombres ambiguos de botones o del primer elemento que coincide.
