# A4, Radar y «Ensayar mi semana» en el mismo servidor

10 de noviembre de 2026, Europe/Madrid. El corte `tests/.tmp/composition326-IywE3X` toma el banco de referencia de 318 y añade las versiones de `main` y `runtime` que incorporan Radar y Ensayar mi semana. Los SHA-256 comienzan por `4ef6b347` y `bb7dcb65`. Se guardó la procedencia de las 355 entradas en el manifiesto. El Radar usa 291 y su semilla aceptada. El ensayo usa la entrega de montaje de Claude y los núcleos presentados que se congelaron para 325.

Una prueba nueva monta las tres funciones en el mismo Fastify y el mismo SQLite, con sesión ficticia. Las primeras lecturas conservan todas las filas. El guardado A4 añade un acuse y una fila de historial, y conserva los datos del Radar y la revisión del modelo de ensayo. Guardar el ensayo conserva registro, historial y acuse de A4. Repetir la petición A4 con el mismo identificador deja iguales las filas y el contador del escritor sigue en uno.

Las pruebas de los puntos de entrada compilan y ejecutan ambos binarios con las rutas registradas. Los cuatro cortes de A4 comprueban la persistencia y la reapertura. La prueba conjunta comprueba el aislamiento con montaje explícito en Fastify. Las pruebas de Radar y de ensayo conservan sus propios escenarios, incluida la persistencia del ensayo en un proceso nuevo.

**Resultados.** Typecheck focal limpio. Los dos binarios superaron **10/10** casos en 153,6 s, con dos grupos y ocho cortes. Las pruebas de rutas superaron **18/18** en 152,9 s, con 12 de Radar, cinco de ensayo y una conjunta. Ambas ejecuciones terminaron sin omisiones ni cancelaciones. Las 355 entradas congeladas y los archivos de trabajo comparados coincidieron con sus huellas iniciales al cierre.

Las versiones de los dos puntos de entrada todavía difieren de los hashes presentados por 318. El autor de 318 conserva la reserva y debe conciliar las dos rutas con la entrega de Radar y Ensayar mi semana antes de presentar el montaje. El banco usa el núcleo previo a R2, y queda pendiente repetir la composición con el núcleo corregido y recorrerla desde la App compilada.
