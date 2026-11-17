# La caché de registros mejora la lectura y retiene metadatos ajenos

14 de noviembre de 2026, Europe/Madrid. Dictamen sobre las tres huellas cotejadas de CLAUDE-PERF-STORE-RECORDS.

**Corrección solicitada.** Store.decode conserva en plainCache todo valor cifrado que lee. Store.get usa esa misma ruta para metadatos. TeamSyncClient.unlink lee y sustituye teamReplica. Después de desvincular, el metadato de la base se lee como nulo y la caché sigue reteniendo el texto de la réplica anterior, incluido el token de ensayo. La restauración de una copia sí limpia la caché. Usé un marcador ficticio en una base nueva y llamé a la ruta normal de desvinculación del cliente sin intercambio de red. Esto confirma retención en memoria. El ensayo no acredita exposición en API, en disco o a servicios.

Acotar la caché a records y record, y, si se conserva el beneficio documentado para ready, seleccionar explícitamente los metadatos de captura que lo necesitan. Las lecturas genéricas de metadatos, archivos y diario deben mantener su comportamiento de lectura anterior. Cubrir con una regresión la ausencia de la réplica anterior de la caché y revalidar correspondencia de resultados y rendimiento de página.

**Lecturas verificadas.** Un oráculo abre cada fila de SQLite con AES-GCM y la clave de la propia prueba, sin Store.decode. Coinciden lecturas en frío y caliente, una edición por otra conexión, la restauración y la captura con 10.000 registros. Confirmé búsqueda por el valor actualizado, objetos independientes y rechazo 413 al intentar superar el tope. Este oráculo complementa las pruebas de Opus: direct() en ellas sí comparte Store.decode y por tanto no desactiva la caché.

**Medición focal.** Cuatro bloques alternos, cuatro peticiones medidas por modo en cada uno, misma página de 50 contactos sobre 10.000 registros. Salida idéntica en ambos modos. Media 100.6 ms con caché y 284.0 ms con descifrado directo. Solo comparé la misma implementación de page con y sin caché en un proceso de ensayo. La primera construcción de datos de 10.000 renombraba destinos de referencia, la corregí conservando los destinos originales y repetí el recorrido completo.

Evidencia de ensayo en tests/.tmp/store357-y9oaBA. Batería completa y piloto instalado fuera de esta comprobación.

## Huellas revisadas

- server/store.ts e233cdd52d2a7af6c115985e10530b105a3cf82ee3ae6d36d6156b8d718ca1ad
- tests/store-records-cache.test.ts 1745ce1e1c2617c8591e10e838a1930a344e1397f54008eb7c9a5c3c9edeb9cc
- coordination/reports/CLAUDE-PERF-STORE-RECORDS.md c5c4ca328908bb023ed2cabc0b53a7860b7c29a79fa37d19383a7d0d5699a83e
