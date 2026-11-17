# Encargo para Opus · CI, caché e inventario API

Trabaja en el checkout autorizado de Plan B en este equipo. Lee AGENTS.md, CONTEXTO-PROYECTO.md y COORDINACION.md. Comprueba las reservas con el tablón antes de escribir. Continúa únicamente las unidades cuya reserva corresponda a tu sesión. Si alguna ya se presentó o cambió de dueño, deja sus archivos al responsable y sigue con las que puedas asumir. Conserva una presentación por unidad. Codex revisará cada una.

## CI local

Retoma CLAUDE-CI-LOCAL con el dictamen CODEX-CI-REVIEW-356. El ejecutor debe distinguir una prueba ejecutada que pasa o falla de una omitida, pendiente, abortada o ausente. Una corrida solo con skip o TODO debe devolver un código de error y explicar qué ocurrió. Un fallo conocido ausente del resultado se clasifica como no observado. Mantén visibles los fallos nuevos y deja evidencia del resultado por archivo y nombre, incluidos los casos anidados.

Añade pruebas sobre el CLI real con suites sintéticas que cubran éxito, fallo nuevo, fallo conocido, solo skip, solo TODO, cancelación y mezcla. Incluye dos pruebas con el mismo título en archivos distintos. Comprueba el código de salida, el informe escrito y la distinción entre ejecución de una selección explícita y batería completa. Conserva la explicación cuando el ejecutor no dispone de un resultado completo.

Acota el entorno de los procesos hijos a variables necesarias. Demuestra que reciben los valores operativos previstos y que un marcador ficticio ajeno se queda en el padre. Gestiona de forma explícita las dependencias de ensayos históricos y evita importar configuración de proveedores o de instalaciones. El comando habitual ya arranca con NODE_ENV=test desde la unidad 361.

Antes de retocar el manifiesto, lee el resultado final de la batería 369 cuando aparezca en coordination/reviews/CODEX-UNIT-BASELINE-369.md. Contrasta pruebas ejecutadas por archivo y título. La 365 ya confirma cuatro casos de relevo, tres de integridad de cápsulas y el arranque de evidencia. El nombre anterior del portátil fue reemplazado por el contrato 364. Los nombres observacionales de la ficha F1/F2 fueron sustituidos por regresiones en 366. Conserva los fallos que sigan reproduciéndose con causa y responsable. Explica qué evidencia justifica cada ajuste. Evita convertir ausencia de salida en prueba de recuperación.

## Caché del almacén

Retoma CLAUDE-PERF-STORE-RECORDS con el dictamen CODEX-STORE-REVIEW-357. Acota la caché a los caminos explícitos de lectura de registros. Si mantienes precaché para la disponibilidad de la ficha, identifica con precisión los metadatos de captura que la usan. Las lecturas genéricas, el diario, las copias y la réplica de equipo quedan fuera de la caché general. Verifica que la desvinculación retira la réplica ficticia y que su marcador ya no está en la caché.

Coteja los bytes lógicos contra un oráculo de descifrado AES-GCM de las filas SQLite que no pasa por Store.decode. Cubre frío, caliente, segunda conexión, borrado o sustitución, restauración y el límite de 10.000. Comprueba aislamiento de objetos y los topes de memoria. Usa los mismos registros y consultas al comparar rendimiento y publica las cifras, dispersión, número de repeticiones y límites. Un caso con otra conexión debe demostrar que una lectura posterior recibe el nuevo valor. Mantén los contratos de captura y recuperación, y repite de forma focal las pruebas de captura 367 y cancelación 368 contra el Store modificado.

## Inventario de rutas

Retoma CLAUDE-API-INVENTORY con el dictamen CODEX-API-REVIEW-358. Valida la línea de órdenes antes de abrir el destino o capturar rutas. Rechaza selecciones vacías, entradas desconocidas, piezas vacías, duplicados ambiguos y combinaciones contradictorias. Un inventario parcial deliberado necesita un destino explícito distinto del catálogo canónico. Comprueba que un argumento inválido conserva un archivo preexistente. Prueba también errores antes de leer un destino y que --check devuelve un código distinto de cero si la selección solicitada no coincide con el documento.

Mantén la relación de origen por punto de entrada o documenta con precisión el alcance de la representación Markdown. En una prueba con la misma ruta y dos registros en distintos módulos, cambia el origen de solo una entrada. La representación que promete atribución por entrada debe mostrar ese cambio. Ejecuta el inventario real de main, runtime y equipo demo y explica cualquier diferencia frente a 170 rutas. Verifica en particular que runtime conserva GET de evidencia local y que el inventario distingue las capacidades ausentes de las rutas condicionadas por el modo de arranque.

## Entrega

Usa únicamente datos ficticios, directorios nuevos del banco de pruebas y el alcance exacto de cada reserva. Conserva la cola, el nuevo contrato de captura y las fuentes de los agentes de interfaz. Ejecuta las pruebas focales y tipos, y documenta la diferencia frente a la última batería global. Si repites npm test completo, incluye su código de salida, conteos y comparación por archivo y título.

Por cada unidad lista archivos, SHA-256, comandos, pruebas causales, resultados y límites. Presenta cada unidad mediante submit antes de pasar a la siguiente. Deja cualquier modificación compartida adicional como propuesta concreta en tu informe. El encargo se ejecuta con el checkout y datos de ensayo, sin cuentas, instalaciones, despliegue ni llamadas a proveedores.
