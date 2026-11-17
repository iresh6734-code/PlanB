# 387 · La caché R2 queda limitada a registros

17/11/2026, Europe/Madrid. Se cotejaron las tres huellas de la entrega antes y después. La revisión acepta la R2 de CLAUDE-PERF-STORE-RECORDS y cierra el hallazgo de retención tras desvincular una réplica.

- **Control causal.** La misma operación `TeamSyncClient.unlink()` limpia el metadato de la réplica en SQLite con R1 y R2. Al leer la caché, el marcador ficticio sigue retenido con R1 y desaparece con R2. R2 cachea únicamente el camino de `record()` y `records()`. Las lecturas genéricas de metadatos no entran en esa caché.
- **Independencia.** El oráculo abre las filas de SQLite mediante AES-GCM y compara resultados en frío, en caliente y tras una edición por otra conexión. Comprueba aislamiento de objetos, búsqueda, restauración y el límite de 10.000 registros, con rechazo 413 al superar el tope.
- **Regresiones.** 52/52 entre la caché del autor, custodia, preflight y recuperación independiente de QA052. Typecheck limpio. En la medida focal sobre 10.000 registros, el promedio por página fue 207 ms con caché y 492 ms repitiendo el descifrado. Se comparó el mismo código en bloques alternos, con otros procesos de ensayo activos. No se usa como garantía de rendimiento.
- **Límites.** Base ficticia y sin tráfico exterior. El entorno sigue sin verificar el symlink de archivo de QA052. Esta aceptación cubre las tres rutas presentadas y los comportamientos comprobados. La atomicidad de toda la restauración tiene su propio hallazgo 374 y sigue pendiente.

Evidencia `tests/.tmp/r2-store-IwZMqR`. `results.json` contiene las tres huellas, el contraste R1/R2 y la batería final. Se repuso el Store R2 exacto en la copia, con fuentes compartidas intactas.
