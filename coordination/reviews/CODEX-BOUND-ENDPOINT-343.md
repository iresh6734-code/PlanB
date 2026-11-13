# Plan B publica el puerto que abrió

Con puerto solicitado 0, Fastify abre un puerto libre. El archivo .endpoint.json publicaba 0 y el lanzador no podía usarlo. server/endpoint.ts toma el puerto de app.server.address() después de escuchar y rechaza publicar si todavía no hay un puerto TCP. Conserva los campos pid, url e instanceId y la limpieza existente.

## Verificación

- Código anterior sobre fuentes congeladas de la candidata 340. Pasó 1 de 3 pruebas. Fallaron la publicación con puerto automático y el intento de publicar antes de escuchar. Banco endpoint343-baseline-hmpGul.
- Con la corrección pasaron las 3 pruebas con Fastify y SQLite ficticio. Tipos limpios en ambos bancos, incluyendo los dos puntos de arranque. Banco endpoint343-fixed-eCcazA.
- Cada entrada compilada por separado superó su prueba HTTP de reapertura. Los dos procesos de cada prueba se localizaron únicamente mediante .endpoint.json. Salud, identidad del proceso y bytes del índice coincidieron. Se preservaron las tres filas de la decisión y su desenlace, con cero cambios de negocio. Repetir confirmación y desenlace devolvió HTTP 200 sin cambiar las filas.
- Servidor principal, banco endpoint343-binary-main-b8MzVm y binario SHA-256 725250e38b445a3ef40317a6852e532f7eaa6398645752dc128f0ecde1f7c3cb.
- Aplicación independiente, banco endpoint343-binary-runtime-besx8f y binario SHA-256 5a86ac0ed6ec80c89e3d9d319da5d6feff4178aa8d19ed46a1c34b474f55fd9e.

Los dos binarios se recompilaron en carpetas temporales con las fuentes de la candidata 340 y el cambio en server/endpoint.ts. Se usaron datos ficticios nuevos y puertos efímeros. Los cuatro hijos se terminaron en Windows. Quedan sin comprobar el cierre ordenado, el instalador y el navegador con estos binarios.

El mensaje de consola aún muestra el puerto solicitado. server/main.ts y server/runtime.ts están reservados por 318. El siguiente cambio es anunciar el origen efectivo después de app.listen y verificar que el tratamiento de colisiones con puertos fijos conserva su comportamiento.

Archivos probados

- server/endpoint.ts · c8b71b28f0b3b96b9007db473924a75dc63a507d2fd9934931ff07b6b730f59e
- tests/bound-endpoint-343.test.ts · 4ad23869637bc3ab2b3a83114b3f7f1701535aa4ac46aafc6f4306d2ddd18140
