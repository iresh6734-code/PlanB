# A4 · Claims duraderos310

9 de noviembre de 2026, Europe/Madrid. Codex. Implementación presentada para revisión independiente. Contrato acordado con el chat coordinador antes de código, con lectura de confirmación, incertidumbre de COMMIT y mantenimiento explícito. No API HTTP ni montaje.

## Qué resuelve

Cada ID de operación queda ligado a huella canónica, seis campos de identidad, pin, tarea y revisión original. Claim, raw208 y metadatos se guardan juntos en una transacción SQLite. Un fallo de persistencia o confirmación no habilita el envío208. Cambiar evidencia o liquidar usa CAS y secuencia siguiente; no se cambia parche/base ni se reclasifica una liquidación cerrada.

La poda autorizada quita solo detalle settled. Conserva tombstone, desenlace y acuse compacto real si se aportó. Replay tras TTL se identifica como expired y no vuelve a crear el intento. IDs208 anteriores sin claim no se adoptan. Índice, época, marca o detalle inconsistentes conservan los datos y devuelven indisponibilidad, sin reparación automática.

El módulo nunca llama al escritor de tareas ni ejecuta solicitudes. inspect/lookup son lecturas puras internas. La API del coordinador debe filtrar ámbito y revalidar el permiso antes de publicar datos o despachar. La guardia de escritura se ejecuta síncronamente dentro de la transacción y el adaptador captura su función original. Se rechazan retornos asíncronos; la función debe capturar realmente la autorización original, no leer una sesión nueva por accidente.

## Cuatro rutas exactas

- server/task-intent-claims.ts: c5cab43ae0d4f08938184f722b213a79dae2e384837f11b36798e1da8519912c
- tests/task-intent-claims.test.ts: 22e756948e0b3e11c380a825613aaa075a8199885a5d8f24c00cdc07417a6301
- coordination/plans/A4-DURABLE-CLAIMS-310-CONTRACT.md: 0ab8eba95aabfbcdb5a9b6411fd3214291b5d5e5fd7556b15325abf786a7cdfe
- Este informe; hash registrado por submit.

No se editan208, Store, shared/task-intents.ts311, App o main. Se exportan createTaskIntentClaims, fingerprintTaskIntent, claimDescriptorSchema, constantes de prefijos/límites y tipos internos. La identidad de cuenta vacía y null permanece distinta. El adaptador devuelve exactamente los raw208 recibidos para mantener su confirmación de bytes.

## Pruebas finales

Banco claims310-fQ5hUW:19/19nuevas,53/53regresiones208 y tipos focales0. Un corte de fuentes capturado, sin reintentos ni skips. Node y SQLite reales en memoria/archivo, raíz temporal propia, sin red externa ni proveedores. Los borrados de fixtures verifican la ruta absoluta bajo su raíz y un preload conserva los destinos. No navegador ni App compilada en esta unidad.

Las19pruebas cubren pureza de lecturas, huella canónica, replay/reuso/otro ámbito, CAS/secuencias/base, fallo parcial y set que no escribe en cada fila de la transacción, guardia revocada/falsa/Promise y guardia reemplazada después, acuse de COMMIT perdido, integración real con createIntentJournal208 y cero callbacks de envío ante fallo, TTL/tombstone, liquidación inmutable, corrupción/marcadores perdidos, ID legado, archivo sellado/reinicio y CAS desde otra conexión.

Límites físicos probados:200detalles208 con rechazo de prune ajeno y liberación explícita de uno;10000marcas con rechazo de alta antes de guardia;4096bytesUTF8 por marca;16MiB agregados con preservación de marcas existentes. Las fixtures de10000/16MiB preparan directamente representaciones persistidas coherentes; no se afirma haber ejecutado10000guardados de la App. El índice se valida completo y estas pruebas no son un benchmark de latencia de servidor.

## Sensibilidad y fallos de banco conservados

claims310-causal-vyFuGD parte de la misma implementación y pruebas finales: tres casos seleccionados pasan sin mutar; omitir guardia, quitar transacción y olvidar tombstones hacen fallar las aserciones previstas. No fallos de sintaxis/importación. La copia se restaura por hash y tipos0. La mutación de tombstones se detecta primero al devolver new en vez de expired; no se atribuye a ese mutante una comprobación posterior de doble envío que no llegó a ejecutar.

El primer preflight se detuvo al encontrar la dependencia histórica087enreview, sin ejecutar pruebas. claims310-5uj3Sv pasó15/16nuevas y53regresiones/tipos; la fixture que esperaba exceder4096bytes ASCII todavía cabía. Se corrigió para usar texto multibyte y comprobar su propio tamaño. claims310-Jvh9wR pasó17/17 y53/tipos. OJ9eNP pasó18/18 con guardia capturada. El banco final añade la composición208 ante relectura/COMMIT fallidos y otra conexión de archivo. No se suman estas repeticiones como casos únicos.

El primer observador de mutaciones q7VYDs exigía llegar a una aserción posterior de reenvío, aunque el test detectó antes new≠expired. Se preservó el log, se calibró esa observación y se repitieron las tres mutaciones sobre el corte final. No se debilitó una aserción del producto para aceptar el mutante.

## Dependencias, límites y siguiente dueño

La dependencia histórica de Store en shared/recovery-integrity.ts aa9f3456… y shared/operations.ts a2412f47… procede de la copia congelada298, y087sigue review. Se identifica en pendingBaseline del manifiesto: estos bancos no aceptan087ni adoptan una edición working. Esa revisión histórica y la de310siguen separadas del montaje. La evidencia de310 demuestra el módulo sobre el baseline indicado, no el cierre global de Fase0.

La transacción cubre claim/intent/índice; no incluye el efecto de tarea. El fallo de acuse de COMMIT se declara commit-uncertain, conciliable por lectura. No hay garantía contra una restauración externa antigua coherente de toda la época. No se implementa exclusión entre procesos: depende del candado de instalación. Dos conexiones en el ensayo verifican CAS, no un montaje multiproceso.

storage queda ligado a un ID y rechaza poda ajena. El mantenimiento debe llamar removeIntent con descriptor y permiso actuales. Los recibos changed/resultingRevision solo vienen del escritor real; pueden faltar y no se reconstruyen. La aceptación humana atómica208, el contrato público311, la API y sus cuatro cortes continúan con el coordinador. covers:false sigue intacto. No despliegue ni cambio de4601.
