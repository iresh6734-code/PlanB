# Alcance en «Despachar vencidas»

Hoy conserva el límite de tres páginas de cien tareas. El diálogo cuenta registros únicos y avisa si el alcance es parcial. Si el servidor repite filas o cambia el total entre páginas, la interfaz evita afirmar que el listado completo se ha revisado. Con una lectura parcial sin vencidas muestra «No hay tareas vencidas entre las revisadas». El aviso sigue visible al avanzar o terminar la lista.

El diálogo ofrece reintentar los errores de lectura. Cerrar cancela la consulta y detiene la paginación incluso si una petición devuelve una página después de la cancelación.

## Evidencia

- 22/22 pruebas Node de revisión, registros relacionados y lista. La suite cubre 300 de 350, filas repetidas, totales cambiantes, resultados ordenados y respuesta tardía.
- TypeScript sin errores.
- 3/3 Chromium con el diálogo real y rutas interceptadas. Las tres pruebas fallan con la fuente anterior. Comprueban aviso de alcance, un 503 seguido de reintento y cierre durante una petición activa con reapertura desde el comienzo.
- Recorrido adicional desde `/hoy` en una compilación de la candidata 444 con los archivos exactos de 449 y 450. Usa SQLite nuevo con 350 tareas ficticias. El diálogo lee los offsets 0, 100 y 200, muestra una tarea vencida y mantiene el aviso tras «Saltar». Cero escrituras, conexiones externas y errores de página. Se cerró el servidor. Banco `tests/.tmp/focus450-app-Hx180U`.

Alcance de la lectura: la API paginada no acredita una revisión común. Cambios entre páginas que mantengan el total y las filas únicas pueden pasar inadvertidos. La aplicación instalada y la demo anterior quedan fuera de este ensayo.
