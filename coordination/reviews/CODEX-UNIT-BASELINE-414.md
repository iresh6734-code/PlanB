# 414 · Batería global completada y diferencias contrastadas

## Corte y resultado

El reintento terminó el 17/11/2026 a las 21:35:56 Europe/Madrid con código 1, sin señal, tras 2.167,662 segundos de proceso. El resumen nativo registra 3.123 pruebas: 3.098 pasadas, 17 fallidas, 3 canceladas, 1 omitida y 4 pendientes (todo), 12 suites. No es una batería verde.

Se ejecutó el corte congelado tests/.tmp/u414-0wso5y/s, con 860 fuentes y 283 archivos de pruebas, tablón 2852. Se verificaron también auxiliares y referencias. changedFrozenInputs es []. Banco del reintento: tests/.tmp/u414-retry-nnzXB5. inputs.json, npm-test.log, completion.json y comparison-414.json registran entradas y resultados. Se usó un entorno reducido y el bloqueo de red externa; solo datos ficticios.

## Comparación con 397 y 381

Las dos pruebas reparadas respecto a 397 pasan explícitamente una vez cada una, sin fallo: la huella de task-focus-followup y la clasificación del plazo de task-save-outcome. No basta su ausencia de la lista de fallos: comparison-414.json registra passLines:1 para ambas.

Persisten los 12 casos históricos por archivo y nombre: cuatro de date-check-decision-independent-339, dos de independent-continuity-lab, tres de operational-date-check-independent-337 y tres de task-intent-consumer-independent-322. Las reservas de producto correspondientes se conservan; esta tarea no los corrige ni los descarta.

Hay cinco nodos de fallo adicionales en el resumen nativo y tres hijos cancelados:

- Dos comprobaciones de recovery-rehearsal obtienen status null, esperado 0, al terminar sus subprocesos tras aproximadamente 15 segundos.
- La carrera R2 de rescue-capsule-rehearsal alcanza su plazo de 280 segundos. El registro no acredita duplicados: acredita plazo agotado.
- El padre runtime de task-intents-entrypoints falla con tres hijos cancelados: initial y lost-ack agotan 50 segundos; settlement encuentra la carpeta ya abierta después de esos plazos.
- El caso TIEMPO de Zendesk obtiene unavailable cuando esperaba partial.

El lector de la sección final del reportero spec enumera 19 filas: incluye los tres hijos cancelados y omite el padre de entrypoints que sí aparece en el registro. Sus siete diferencias nominales no son siete fallos adicionales al resumen. Se conservan los totales nativos (17 fallos y 3 cancelaciones), el detalle del padre y esta limitación del lector.

## Repetición focal independiente

Banco tests/.tmp/u414-focal-kAT5tX, copia nueva de los mismos archivos congelados y huellas comprobadas, TEMP propio y procesos secuenciales. No se alteraron las aserciones, límites ni fuentes para repetir:

- timing.log: recuperación completa, ambos entrypoints y Zendesk, 46/46, cero fallos/cancelaciones, código 0 (106,810 segundos).
- race.log: solo la carrera R2, 1/1, sus 20 rondas sin más de un destino publicado, código 0 (137,896 segundos).
- completion.json: changed: [], terminado a las 21:41:09 Europe/Madrid.

Estos 47/47 prueban que las diferencias nuevas no se repiten en esas condiciones secuenciales. Son compatibles con la influencia de carga y plazos; una repetición no demuestra que nunca haya una regresión funcional. No se sustituye ni se recalcula el resultado global de 3.098 pasadas, 17 fallos y 3 cancelaciones.

## Límite del corte y siguiente paso

checkout-at-close.json conserva ocho fuentes distintas respecto al checkout al cerrar: CSV compartido, App, CsvImport, faro.css, CommitmentRadarEntry, commitment-radar.css, CommandPalette y components. 414 no acredita las versiones posteriores de CSV, Radar, 419 o D7, ni incorpora las nuevas pruebas E2E de foco. 419 y 420 documentan esa revisión separada, incluido el fallo de StrictMode de D7.

Siguiente paso: atender las correcciones reservadas de 322/337/339/099 y D7, y repetir sus pruebas focales sobre las huellas presentadas. Antes de otra batería global, contrastar los plazos de los subprocesos y sus limpiezas bajo carga; no ampliar tiempos ni clasificar fallos como conocidos a ciegas. No se ejecuta otra batería completa sin nuevos cambios que la justifiquen.

## Intento anterior conservado

El primer intento de 414 se interrumpió por causa desconocida. Al retomar el 17/11/2026 a las 20:53, la sesión ya no existía y el PID 30164 no estaba activo. Su registro había dejado de cambiar a las 17:07:08 y no dejó completion.json, clasificación ni totales. Se conserva como intento incompleto en u414-0wso5y y u414-interrupted.json; no se mezcla con el reintento terminal anterior.
