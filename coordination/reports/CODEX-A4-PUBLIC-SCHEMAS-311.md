# A4 · Esquemas públicos 311

9 de noviembre de 2026, Europe/Madrid. Autor: Codex coordinador. Entrega para revisión independiente; sin autoaceptación.

## Cambio y alcance

`shared/task-intents.ts` implementa la forma pública del contrato A4 aceptado: ejecución, lista paginada, detalle, comprobación por lectura, aceptación y abandono. Reutiliza el contrato de revisión de tareas y el modelo de registros. La identidad conserva seis campos y el pin de contexto; `accountId:''` permanece distinto de `null`.

Los esquemas estrictos rechazan campos adicionales, procedencias incompatibles, fases contradictorias y resultados de otra tarea o captura. El acuse compacto conserva `changed` y revisión resultante, incluido el no-op. La ausencia de un payload se explica de forma explícita. Una lectura indisponible conserva recuentos desconocidos. Un intento pendiente no puede declarar su detalle vencido.

Se acota el JSON UTF-8 agregado a 256 KiB en ejecución y 512 KiB en respuestas. La comprobación del esquema sucede después del parseo: el futuro transporte también deberá limitar los bytes durante la lectura. Un registro válido grande no se recorta para aparentar éxito; se representa mediante acuse compacto y omisión explícita. Las validaciones relacionan lo declarado en la respuesta; no autentican por sí mismas el origen de un acuse ni implementan CAS o autorización.

No hay rutas HTTP nuevas, persistencia ni montaje en App en esta unidad. La ejecución y la superficie de recuperación siguen pendientes de sus entregas. Los consumidores necesitan la aceptación de estos bytes antes de adoptarlos.

## Verificación

Banco final congelado: `tests/.tmp/a4-schema311-final-OkI0UH`. `result.json` identifica los cinco archivos copiados y sus hashes. Node: **10/10**, cero omitidos, duración 2248,273 ms. TypeScript focal: **exit 0**, `types.log` vacío. Sin navegador, proveedor, datos de clientes ni escritura de base.

Los casos comprueban identidad, exceso agregado de UTF-8, parches inválidos, procedencia, respuesta de otra copia/revisión, registro de 600.000 caracteres con acuse compacto, no-op/replay, lista no disponible, detalle omitido, evidencia incoherente y versiones/confirmación de decisiones humanas. No se ejecutó la suite global ni se demuestra estabilidad mediante repeticiones o mutaciones.

Antes del corte final hubo una pasada 10/10 y tipos focales correctos; una revisión estática añadió después la prohibición de detalle vencido en intentos pendientes y actualizó su fixture. Los resultados publicados arriba corresponden al corte final. Un primer arranque restringido falló al preparar el entorno de procesos (HRESULT 0x80070020), sin ejecutar pruebas; el banco se ejecutó mediante la autorización local acotada. No se alteraron controles del equipo.

## Huellas de la primera presentación SHA-256

| Archivo | SHA-256 |
| --- | --- |
| shared/task-intents.ts | 21263317e619e9016352163e04ca372a86dd8a4fe574ceb479da8985845d96ab |
| tests/task-intents-contract.test.ts | 2560dafb73a7d2147d51e5190e9739fba0fc9ab76b559dba9a83b3fdc195aeb8 |
| shared/model.ts, dependencia copiada | 1276b6ac00900460abddafc054799afdebcfdfab7e1b90fa97c4e5f75563faae |
| shared/task-revision.ts, dependencia copiada | 5ece83d81336ddce7833b0f3b2e172aba0500bc3855fc11e0391068e65f211c5 |

`result.json` conserva las salidas de proceso y el manifiesto; `node.log` y `types.log` permiten contrastar sus resultados. La huella de este informe queda registrada por `submit`.

## Traspaso

El otro Codex revisa coherencia con el almacenamiento de reclamos 310. Claude A puede continuar su unidad separada de UUID estable; el cliente A4 esperará la aceptación de 311 y de las rutas. Codex coordinador implementará servicio y API en reservas nuevas. El futuro registro en servidor principal y la prueba con App compilada continúan pendientes y no se atribuyen a esta entrega.

## R2 · Evidencia y detalle vencido

La revisión independiente `CODEX-A4-SCHEMAS-INDEPENDENT-312` devolvió esta entrega por F1/P2. Es distinta de la revisión de SourceStatusRow con sufijo 312. La versión inicial admitía una comparación `applied`/`unchanged`/`diverged` pese a que `operation.detailAvailable` era false; también admitía `reason:'detail-expired'` con detalle declarado disponible.

La corrección añade esas dos implicaciones en `TaskIntentCheck`. Una comparación exige conservar base y parche. La causa de vencimiento exige metadatos de detalle vencido. Se conservan las respuestas honestas `missing`, `read-failed` y `response-too-large` con o sin detalle retenido: ninguna acredita por sí sola una comparación aplicada. La futura API fijará la prioridad de causas cuando concurran; no hay API montada en esta entrega.

Banco R2 congelado: `tests/.tmp/a4-schema311-r2-7nPXMq`. Una pasada **16/16** (13 propias y las tres sondas intactas del revisor), tipos focales **exit 0**, cero omisiones, 1624,8446 ms. La sonda independiente conserva SHA `3de2e0b17174d651e31f080cc679b06669482855c79c240409600710ab3dc02d`.

Control de sensibilidad: las dos regresiones propias de F1 fallan **0/2** contra el esquema inicial `21263317…` en una copia privada, por aceptar los dos estados contradictorios. No es un fallo de compilación. No se modificaron 310, las sondas ni dependencias para obtener este resultado. `run.mjs`, manifiesto, logs y códigos de salida quedan en el banco R2. La reproducción del banco es `node tests/.tmp/a4-schema311-r2-7nPXMq/run.mjs` desde la raíz del checkout.

Huellas vigentes R2:

| Archivo | SHA-256 |
| --- | --- |
| shared/task-intents.ts | 4413be57483b73f2135d5eec8073ce9e37f9d95fd60cfa3767593b665cdff94d |
| tests/task-intents-contract.test.ts | a2b410d5e500ad91df09bfeb7c703842dfaadc14532250c0c82213404f241f3e |

El hash del informe se registra al volver a presentar. R2 sigue pendiente de aceptación independiente; no se activa persistencia, rutas o cobertura de recuperación por corregir estos tipos.
