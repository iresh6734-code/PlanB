**Autorización vigente para recorridos asíncronos · entrega 214**

5/11/2026, 21:38:13, Europe/Madrid.

createBaseApp devuelve ahora el controlador de seguridad existente. Su método captureAuthorization(cookieHeader) captura la autorización inicial y entrega una comprobación síncrona para verificar esa misma sesión tras una espera. La comprobación reutiliza el almacén de sesiones, conserva la caducidad y queda invalidada tras detectar revocación, caducidad, activación de protección o un fallo de lectura. Otra sesión válida puede continuar. Un inicio de sesión posterior conserva la invalidez de una captura rechazada.

Se modifican tres líneas de la factoría para devolver el controlador. El módulo de seguridad añade la captura. La frontera de cada operación sigue siendo responsabilidad de su consumidor. La R2 de la API212 la usa en su arnés antes del despacho y de publicar. El montaje de212 en el servidor principal sigue pendiente.

**Pruebas y controles causales**

En el corte privado tests/.tmp/a214-6b7b7b0c pasan 40 casos de autorización y rutas relacionadas. Incluyen seis pruebas nuevas de la captura, evidencia, inspección y comparación de copias. Sobre el mismo corte pasan los 58 casos de212 R2,160 y173 con proveedor ficticio en loopback. El análisis focal de tipos incluye las suites, main, runtime y el worker de ensayo y sale limpio.

Dos mutaciones privadas fallan por AssertionError en su caso previsto. Renovar el plazo durante la comprobación hace fallar la caducidad. Retirar la invalidez permanente hace fallar la recuperación tras un error de lectura. Se restauró el archivo y se cotejó el manifiesto completo. La primera versión del caso de almacén cerrado llamó directamente a Store.close y produjo un segundo cierre en el cleanup de Fastify. El caso final cierra la App y verifica la captura después, usando el cierre normal.

El análisis completo del checkout en edición devolvió dos errores TS7022/TS7024 en tests/task-intent-journal.test.ts, línea161, durante la corrección de208 por su autora. Queda pendiente repetir ese análisis sobre una entrega estable de208. Las fuentes de208 se conservan. El informe distingue esa ejecución global de los tipos focales verdes de214.

**Custodia y alcance**

Se preservó la base de app.ts a5484d9c2d15b5f0a99122cdb1242ade359395e7f567079ab5c1c7794c9ecaf5 y security.ts fcc99b664bcd76467a621548f423b1a198537661af9b48c12ef04a09aca4e309. El manifiesto conserva137 entradas y las cinco huellas de212 R2. Cotejo de las tres fuentes de214 antes de presentar. El informe es la cuarta ruta reservada. Esta entrega se presenta para revisión independiente.

Se probaron sesiones ficticias, SQLite en memoria, cookies del propio arnés y un reloj inyectado. El servidor instalado y la demo4596 conservan sus cortes anteriores. El cambio no se desplegó y todavía necesita la revisión independiente de214 y el montaje de los consumidores.

**Huellas de las fuentes**

server/security.ts 890b05cad3552f8fc57959e8ad20541f3442693cf1a457c7cdb1e655a6d5a596

server/app.ts b26845d21518e7371c04a80e08f26def455e0c80d81e258b5c1f8b89f28d919b

tests/local-authorization.test.ts 6140d4a8f48a4c138e546f6ad19a61ac87c5417f5583a71e67f09313017b1d83
