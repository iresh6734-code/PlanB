# Restauración atómica de una copia local

## Implementación

La ruta de restauración conserva su prevalidación en memoria. La escritura se concentra en una transacción SQLite con `BEGIN IMMEDIATE`. Al adquirir el bloqueo, el almacén vuelve a comprobar su integridad, si hay una devolución activa, el portal y el permiso explícito para sustituir cambios pendientes. Lee la versión anterior dentro de ese bloqueo.

Los registros, cambios, estado de sesión, archivo anterior, recibo e historial de capturas se guardan en la misma transacción. Un error revierte el conjunto, incluida la poda de capturas. El límite de 2 GiB se comprueba al restaurar tanto con una captura nueva como con un identificador ya presente, contando primero los nuevos metadatos. Para los otros usos de `addCapture`, encontrar un identificador existente conserva su comportamiento anterior. Los llamantes de arranque que solo aportan el paquete siguen restaurando sin crear el archivo anterior y el recibo de una restauración por API.

La base de la aplicación combina la caché R2 de `CLAUDE-PERF-STORE-RECORDS` y la corrección de exportación `CODEX-EXPORT-PACKAGE-REVISION-373`. Se cotejaron las tres huellas de 373 con la evidencia 384 y 385 antes de aceptarla. El prototipo 374 queda como antecedente. La implementación actual conserva la caché R2 y sus mecanismos de invalidación.

## Oráculos y sensibilidad

Las ocho pruebas usan SQLite cifrado, paquetes ficticios y la API por `Fastify.inject`. Una conexión de solo lectura calcula una huella de todas las filas persistidas de metadatos, registros, cambios, capturas, archivos y `sqlite_sequence`. Un caso añade un cambio desde otra conexión inmediatamente antes de que la restauración adquiera el bloqueo. Tres casos provocan rechazos al escribir captura, recibo o archivo anterior. Tras eliminar esos rechazos, el reintento verifica revisión, registro, historial, recibo y copia anterior. Los dos casos de capacidad simulan el contador para alcanzar el umbral sin escribir 2 GiB.

Con la fuente previa, pasaron 2 de 8. Los otros seis fallaron por persistencia modificada tras un rechazo, sustitución implícita que devolvía 200 o capacidad excedida que devolvía 200 al reutilizar una captura. El intento exploratorio anterior al oráculo válido se conserva en `before-initial-fixture.log`. En ese intento, la misma guarda de sustitución rechazaba los casos que requerían autorización. El oráculo final aporta `replace:true` a esos casos y usa `replace:false` para la carrera.

Todas las pruebas directas pasaron con la corrección. El chequeo de tipos en la copia congelada terminó con código 0.

## Huellas verificadas

| Archivo | SHA-256 |
| --- | --- |
| `server/store.ts` | `702243232d75c5ad2cbcd83e6eac0595bd101bd1b23afd8d67f1a13b5a78f542` |
| `server/v2.ts` | `4eaa43a147c9513bba27dd2170f5b2a36e0e81de94281f050290dc010dae9400` |
| `tests/restore-transaction-388.test.ts` | `3e8e057c728c8014c4f8b024a01e67b65c9d9b01e00dc3f85d44b179abd3cfa6` |
| `tests/store-records-cache.test.ts` (R2 aceptada, sin editar) | `597d20578d91b2c7e412b6a4bac1cfc70c8ff39ddbb34570d794ecd1177a8856` |

## Entorno y evidencia

Banco `tests/.tmp/restore388-6c6aeeb3`. `inputs.json` recoge la construcción de la copia a partir de 385 y cuatro rutas sustituidas. Los resultados iniciales están en `before.log`, `current-oracle.log`, `typecheck.log` y `results.json`. El primer intento de repetir todas las suites juntas agotó 475 s en la auditoría de cobertura QA052. La candidata del árbol compartido `4e529fc4-a240-43b8-aa6a-141ce985cd44` agotó el plazo de 300 s de `typecheck`. Su manifiesto conserva `incomplete` y `ETIMEDOUT`.

La repetición focal terminó con código 0 y 60 de 60 pruebas aprobadas. Incluye la restauración 388, la caché de registros R2, custodia, preinspección y la auditoría independiente de integridad. `focused-core.log` y `focused-core.exit` contienen los resultados. La última batería global pertenece a 381.

El banco derivado volvió a compilar `server.mjs`, `runtime.mjs` y `drill.mjs` con los cambios de restauración. Reusó el frontend 385 tras verificar las huellas de sus fuentes y de cada artefacto. En el primer intento de Chromium, el proceso de origen no emitió un recibo de arranque verificable en los 30 s del ejecutor. El proceso fue detenido y su PID desapareció. Ese intento no llegó a restaurar. El reintento cambia únicamente dos plazos en copias temporales del ejecutor y la especificación.

Con esos plazos el origen arrancó, se editaron los datos ficticios y se llegó a Exportar. La descarga normal en Chromium agotó sus 90 s y la página mostró «No hubo respuesta de tu copia local». La traza registra la solicitud sin código HTTP. El banco `tests/.tmp/r388p-UzuCT0` conserva la traza, el recibo de arranque y la confirmación de cierre. No se identificó todavía la causa de ese fallo.

Para aislar ese fallo, el banco `tests/.tmp/r388p-rveC6D` obtuvo el ZIP real con POST autenticado y comprobó HTTP 200 y el tipo de contenido. Las comprobaciones de descarga por botón se sustituyeron en esa copia por el chequeo directo del endpoint. El resto del recorrido pasó 1 de 1 en Chromium. El ZIP cifrado pesó 48.939.193 bytes. Dos restauraciones rechazadas devolvieron 422 y conservaron la base. La restauración válida devolvió 200. El arranque y el reinicio del paquete mantuvieron la identidad, la evidencia y los registros editados. La prueba del `ABRIR PLAN B.cmd` real verificó arranque, reutilización, portada 404 con salud 200 y reapertura con las mismas huellas de registros y cambios. El proceso de esa prueba confirmó el cierre.

El manifiesto derivado registró 839 fuentes y 47 artefactos. Las huellas coincidieron antes y después. El ejecutor temporal amplió los plazos de arranque y de la especificación, conservando sus demás comprobaciones. La descarga por el botón sigue pendiente de verificación. La candidata del árbol compartido y la batería global siguen pendientes. La instancia que respondió en 4331 queda fuera de la validación de 388.


## Revalidación con Store actual · 17/11/2026, Europe/Madrid

La adición autorizada de latestChange y las opciones guard/onChange en saveRecord quedó cotejada con la restauración existente. Revisión 417: 8/8 directas y 30/30 con caché y regresiones de guardado, tipos limpios. Retirar la transacción de restoreBundle en la copia hace fallar los tres controles de persistencia. El checkout conserva Store SHA-256 5842f24ea193b9f62dc6df2d6bd56bfad7f82eb2029508cd1c2cb502e2a7b457 y la presentación se actualiza con esa huella. El hallazgo de identidad de Deshacer en 399 sigue pendiente en su propia entrega. La última batería global completa sigue siendo 397.

## Composición con Deshacer R3 · 18/11/2026 Europe/Madrid

Store a4246275ef0f conserva la transacción de restauración e incluye dentro de ella la renovación de la época local. La revisión independiente 426 repite las ocho regresiones de 388 sobre esa huella. Un fallo al guardar el recibo revierte el estado y la época anterior. El Deshacer emitido antes del fallo sigue vigente. Una restauración que termina sí invalida esa etiqueta. La revisión completa pasa 140/140 y el chequeo de tipos termina con código 0. Evidencia en coordination/reviews/CODEX-UNDO-R3-REVIEW-426.md y tests/.tmp/undo426-wgthDu.

## Sustitución desde Preparación · 18/11/2026 Europe/Madrid

Store renueva la época dentro de la transacción al activar una candidata que sustituye registros. Las ocho regresiones de Restaurar siguen en verde y la batería relacionada pasa 45/45 con tipos limpios. El ensayo 428 cubre activación, reversión y cambio de solo esquema. Véase coordination/reports/CODEX-COPY-ACTIVATION-EPOCH-428.md.
