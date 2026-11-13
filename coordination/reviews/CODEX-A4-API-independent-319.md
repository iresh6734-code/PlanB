# API A4 · revisión independiente319

10 de noviembre de2026, Europe/Madrid. **Dictamen vigente: aceptar316R2 con el baseline y límites declarados abajo. F1/P2 yF2/P2 cerradas. La devolución original se conserva como evidencia histórica.** No se editó servicio, API, pruebas o informe del autor.

## F1/P2 · el mismo503 no distingue fallo previo y resultado incierto

En server/task-intents-service.ts, requireWrite(persisted) termina en TASK_INTENT_STORAGE_UNAVAILABLE si la primera persistencia falla. execution/load usa el mismo código si no puede leer la operación después de aplicar la tarea. El contrato304, sección Errores y protección de la interfaz, exige códigos distintos para fallo e incertidumbre. El brief309 exige que el futuro consumidor solo declare sin enviar ante un código explícito que acredite cero despacho.

La sonda propia produce dos fallos reales de almacenamiento sobre Fastify/SQLite: primero falla la escritura inicial de claim dentro de la transacción, se revierte todo, escritor0 e historial0; después el escritor real aplica una vez y afterWrite daña el índice de claims, impidiendo liquidación/relectura, escritor1 e historial1. Ambas respuestas son503 con details.code=TASK_INTENT_STORAGE_UNAVAILABLE. Una clasificación que use ese código como prueba de ausencia de efecto sería falsa para la segunda. Clasificar todos los503 como inciertos evita esa falsedad, pero no cumple la distinción acordada para el fallo conocido previo. El defecto es de contrato de esta API; el cliente A4 aún no está montado y no se afirma que hoy la App anuncie falsamente sin enviar.

## F2/P2 · cero cuarentenas pese a una fila208 corrupta

El diagnóstico inicial dejó abierta la interpretación del inventario. El coordinador contrastó304 y confirmó que no excluye explícitamente las filas208 legadas. Se acordó conservar el criterio208: `quarantined` es un agregado de instalación, clasificado antes del contexto; no publica IDs ni valores de las filas dañadas. Las entradas publicables siguen siendo claimsA4 del ámbito solicitado.

Dos regresiones añadidas conservan intactas las cinco sondas originales. Con una fila208 malformada y sinclaim, el inventario completo es legible y decodeRecord acredita la corrupción; la API devuelve read/q0 en lugar de q1. Con un claimA4 válido junto a esa fila, mantiene la entrada válida pero también declara q0. Ambas pruebas verifican primero que el GET no cambia ninguna fila, que el raw se conserva y que no publica suID ni contenido. Solo fallan en el recuento0 frente1.

Banco separado quarantine319-regressions-Qb632x: tipos0; las dos pruebas nuevas fallan con esa aserción, duración5718,0098ms. Se verifica que la fuente actual empieza por las cinco sondas originales byte a byte. No se presenta la suma de ejecuciones como una pasada completa de120. El control causal118/118 descrito abajo corresponde solo aF1 y a las cinco sondas iniciales; no se atribuye aF2 una corrección privada no ejecutada.

Para un inventario verdaderamente incompleto o filas válidas sinclaim cuya atribución no se puede acreditar, el coordinador eligió unavailable/recuentosnull, sin adoptar, borrar ni ejecutar esos registros. Una corrupción contable no debe ocultar un claim válido: ese caso debe conservar su entrada y q1. Son criterios acordados paraR2, todavía no evidencia de una implementación corregida. El autor conserva sus cuatro rutas para realizarla.

## Ejecución independiente

Banco tests/.tmp/api319-c8aHNS: **117/118**, tipos focales0, duración40118,6844ms, sin omitidos. Se repiten113 pruebas del banco final316 y cinco propias. Pasan las113 anteriores y cuatro sondas nuevas; falla únicamente la distinción503. La fuente319 se mantiene idéntica entre el banco original y el causal. Manifiesto conserva fuentes, hashes, comandos, baseline y códigos de salida.

Sondas adicionales que pasan:

1. COMMIT inicial efectivamente aplicado, pero su acuse se pierde: respuesta503, UUID pendiente conservado, escritor0 y cero historial. GET y replay no cambian ninguna fila ni despachan.
2. COMMIT de liquidación aplicado con acuse perdido: la lectura conserva acknowledged y recibo auténtico changed:true; writeResult queda null/not-retained y no se reconstruye una tarea actual como respuesta original. Replay añade cero escritores/filas.
3. Durante afterWrite retenido, check devuelve applied sobre intento aún attempt sin escribir. Accept y abandon reciben409 mientras la ejecución sigue viva. Al liberar, queda acknowledged con un escritor y una fila.
4. Bloqueo real y otro login después del efecto: la petición original recibe401 y no publica los valores; otra sesión lee applied y acepta con procedencia person-accepted-read, sin nuevo escritor ni fila. La aceptación no fabrica server-ack.

Estas pruebas cuentan por separado POST recibidos, invocaciones al escritor real y cambios SQLite. app.inject no es una conexión TCP; la suite original conserva además su caso real de loopback. No hay navegador ni reinicio de proceso propio en319; la prueba original de archivo solo recrea App/Store y declara ese límite.

## Control causal privado

tests/.tmp/api319-causal-wT7xNy: solo en copia se añade un indicador beforeDispatch a requireWrite, usado exclusivamente al resolver la persistencia inicial de una operación nueva. Su503 pasa a un código fijo TASK_INTENT_NOT_DISPATCHED; el resto conserva el comportamiento original. **118/118 y tipos0**, duración74686,7796ms, sin omitidos. Después se restaura la copia porhash. No se integra ese nombre ni se impone como única solución; prueba que la diferencia de fase cierra F1 sin cambiar aserciones ni ampliar el protocolo a ciegas.

## Alcance y procedencia

Se congelaron52 fuentes del banco final316 y las cuatro presentadas, más el archivo propio. Los hashes del autor coinciden antes/después. Dependencias históricas de087 shared/recovery-integrity.ts yshared/operations.ts siguen pendientes; esta revisión no las acepta ni las sustituye por ediciones working. El manifiesto registra pendingBaseline. No se afirma validación exhaustiva de toda la matriz317 por los118 casos.

La revisión estática comprobó ámbito completo, registro protegido opt-in, validación de peticiones, GET puros, CAS de aceptación y guardias originales. Un ledger A4 corrupto devuelve unavailable con recuentos null. El diagnóstico quarantine319-QZYXgD conserva cuatro observaciones previas en bases nuevas: fila208 válida sinclaim conID noUUID, válida sinclaim conUUID, corrupta sinclaim y claimválido junto a fila corrupta sinclaim. Los dos primeros pasan decodeRecord208; los corruptos no. En todos devuelve read/q0; entries0/0/0/1 frente a1/1/1/2 filas208. CadaGET conserva meta byte a byte. Una fila208 sinclaim no demuestra por sí sola origenA4: no se adopta ni ejecuta. El contraste posterior con304 y el autor convirtió los dos casos de corrupción contable enF2, como se detalla arriba; los válidos sinclaim requieren clasificación conservadora de atribución, no una aceptación implícita comoA4.

El lanzador restringido falló antes de iniciar las dos primeras lecturas con CreateProcessSecurityEnvironment0x80070020. Se continuó mediante ejecución local autorizada; no se desactivó protección. Entorno de pruebas mínimo, datos ficticios nuevos, salida externa bloqueada. No se reutilizaron perfiles, credenciales, puertos4331/4334 ni equipo original. No main/runtime/App, build raíz, publicación, proveedores o cambios en4601.

## Huellas presentadas revisadas

- server/task-intents-service.ts: c6ebc3b617cbff4db0cceb469c0d1e5bb939141b592810a1f2908ea03f76f7ce
- server/task-intents-api.ts: cf125b5bcb1a7f3964a65a30cdb614ee8928124aea144d17c89edd4a12e21a93
- tests/task-intents-api.test.ts: 404b3491d1e84b026bbf7d09d163fb89ac5b032d12579ebe2dc29e9885cb721c
- coordination/reports/CODEX-A4-HTTP-SERVICE-316.md: 7d5c4089306a98c6e8088d3edbc827efd0b8aabebe92df502cef2014abb551f3

Siguiente: autor corrige la clasificación503 y el inventario de cuarentena, documenta ambos para Claude A y presenta nuevas huellas. Codex repetirá las siete sondas y suites pertinentes.318 mantiene sus puertas316/301/087; no se anticipa montaje ni cobertura pública.

## R2 · Corrección aceptada tras revisión independiente

10 de noviembre de2026, Europe/Madrid. Banco propio tests/.tmp/api319-r2-1CHArW: **127/127**, tipos focales0, duración89729,1409ms, sin omitidos ni reintentos.28API de autora+92regresiones anteriores+las siete sondas319 originales intactas SHA34741a12. Cuatro huellas cotejadas antes/después:

- server/task-intents-service.ts: 9a11c05f1158164f4a8360319d24d0f0659fd841b0696d7d3ea994c51c2e897b
- server/task-intents-api.ts: cf125b5bcb1a7f3964a65a30cdb614ee8928124aea144d17c89edd4a12e21a93
- tests/task-intents-api.test.ts: be252f591b63bf6d3ef85d587c77e02e69764c7be970f4ee8af06c0f8aba6faf
- coordination/reports/CODEX-A4-HTTP-SERVICE-316.md: fb4804ae6d4ca4354c4d0e65fceff822e4d9c877f2f2c642e400ec01e346eb24

La lectura estática de9a11c05f confirma que NOT_DISPATCHED solo se utiliza al fallar requireWrite de la primera persistencia de una operación nueva. El código expresa cero llamadas al escritor enesta petición, no ausencia de una fila: un COMMIT inicial dudoso puede conservar el UUID. Las relecturas y fallos posteriores conservan STORAGE_UNAVAILABLE incierto. Decisions humanas no adoptan la bandera previa.

El inventario recorre el prefijo208 sin adoptar registros válidos sinclaim. El agregado de instalación cuenta corrupciones legibles condecodeRecord, conserva las entradas válidas y no publicaID/bytes de filas dañadas. Válidos sinclaim o lectura incompleta devuelven unavailable/recuentosnull, según concreción acordada, no cero. Enumera máximo201para detectar el tope200; mide fila/agregado conlength(CAST(value AS BLOB)), límite1.604.096bytes/fila y64MiB. La revisión de cursor incluye el digest de208. Guardias ystamps total_changes/data_version detectan contexto o almacenamiento cambiado; no se introduceawait enlista.

Las siete sondas originales pasan: distingue los dos503 porfase, conserva UUID/recibo tras COMMIT perdido, rechaza decisiones mientrasvivo, respeta permiso original despuésdelefecto ycuentaq1sinocultar elclaim válido. Las nuevas pruebas del autor cubren atribución desconocida, recorte, UTF8, fallo deenumeración/descifrado, cursor e invalidación decontexto. Su sensibilidad0/7conla fuente anterior es evidencia atribuida alautor, no una mutación repetida por estechat. No se amplióla batería despuésdelpase por mera repetición.

Se acepta el servicio/API opt-in, no App ni runtime principal/portátil. La prueba de archivo recreaApp/Store; no se convirtió en reinicio de proceso.087 sigue pendiente y sus dos dependencias se conservaron congeladas; esta aceptación no la acepta.318 conserva puertas301/087 y su reserva futura. Sin proveedorexterno, instalación4601, credenciales, `covers` o publicación. F1 yF2 quedan cerradas enesta huella.
