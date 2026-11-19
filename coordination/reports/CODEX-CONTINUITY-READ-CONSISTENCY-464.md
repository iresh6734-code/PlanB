# Lecturas coherentes en el radar y el comparador

19/11/2026, Europe/Madrid.

## Cambios

- El radar captura la versión SQLite antes de leer la copia activa, el esquema y sus registros. Si confirma una escritura otra conexión durante esas lecturas, responde 409 antes de producir tareas o procedencia. La revisión del radar incluye el portal y el origen de los datos, además del identificador, esquema y registros.
- El comparador verifica la misma versión después de leer las dos capturas y antes de calcular diferencias. Si la retención elimina una captura después de que el servidor la leyera, devuelve 409. Una petición posterior a un ID ya retirado conserva el 404.

Ambos reutilizan la comprobación de versión usada por el estado y la búsqueda del espacio. El contador de SQLite es global a la conexión de lectura. Una confirmación concurrente en otra tabla también puede producir un 409 conservador. Las rutas conservan el contrato y la política de solo lectura.

## Evidencia

- Tres regresiones nuevas. Antes del cambio hubo dos respuestas 200 durante una escritura de la segunda conexión y una revisión idéntica con dos portales distintos. Después, 3/3.
- Las pruebas ejecutan restauración y retención reales de Store, con dos conexiones al mismo SQLite recién creado y datos ficticios. El GET no aumenta el contador de escrituras de su conexión.
- 66/66 en las suites focales de Continuidad, respuesta, comparador, frontend de operaciones y estado. TypeScript sin errores.

Los registros antes y después están en «tests/.tmp/consistency464-before.log» y «tests/.tmp/consistency464-after.log». Se probó con Fastify y SQLite, con inyección HTTP local. El piloto instalado queda fuera del ensayo.
