# El ZIP portátil muestra el resumen protegido de la copia

9 de noviembre de 2026, Europe/Madrid. Se registra el lector 283 en `server/runtime.ts` mediante la autorización de `createBaseApp`. Comparte el pin de la evidencia de Continuidad. El runtime declara `covers:false` mientras carece del escritor durable. La interfaz dice «Sin cobertura: se desconoce» y el servidor devuelve recuentos nulos. La corrección está en revisión independiente.

## Contraste del runtime

En `tests/.tmp/portable301-final-fTaqTZ`, la prueba nueva sobre el binario anterior falla con **404 en vez de 200** después de autorizar la lectura. Con los archivos finales pasan **20/20** pruebas de runtime y API, y los tipos. Se conservan las comprobaciones del editor condicionado y propietario SQLite de 270. Se añade GET con autorización, respuesta 401 antes y tras revocar la sesión, nueva autenticación con GET200, pin idéntico a evidencia, recuentos desconocidos y `no-store`. POST y HEAD devuelven 404, y un parámetro que intenta aportar cobertura devuelve 422. La base permanece igual durante las consultas. Las fuentes del lector 283 y la interfaz conservan sus huellas.

El primer banco `portable301-final-g9xldm` se detuvo por un nombre duplicado en la prueba antes de ejecutar el runtime. Se corrigió y el banco final conservó las mismas aserciones de comportamiento.

## Descarga y restauración comprobadas

`tests/.tmp/portable301-archive-0ZErVq` vuelve a componer el ZIP de 300 sustituyendo solo el binario portátil por el binario de la prueba final 301. Los 5.524 recursos se verifican. El productor y los 15 activos corresponden al corte anterior. Se vuelve a ejecutar el E2E 271 y los dos helpers **byte a byte**, con tipos correctos. Pasa **1/1 en 174,38 s**, sin reintentos, skips, errores de página o red externa.

El ZIP cifrado pesa **48.864.571 bytes** y su SHA-256 es `197150b9a99e4abbd555bf013869a2746372706cf20104e74e319272b4951fd9`. Al extraerlo se cotejan los 15 activos, el runtime probado `b5b5b6fc775a43785e92b48fb172f2c853308624de98060bbd43ac134af28e14` y launcher272 `09b04924f764f5c7987e13a544b02782f8932c519440ba4d7fc1b6f8ca304f9c`. El Node del ZIP resuelve sus dependencias locales. Contraseña errónea y cifra alterada reciben 422 y conservan la base. Restauración válida 200, 62 registros, una fila de historial. Tras reiniciar y desbloquear, misma identidad `e8d52007-23f3-4980-acb3-35ebe33f4d3a`, mismo pin y revisión del bundle. El productor y ambos PIDs del destino tienen recibos de cierre. `archive-proof.json` y `observed-portable.json` guardan la prueba.

## Comprobación visual del paquete extraído

En `diagnose-bf6FIi` se abrió ese mismo Node y runtime con otra carpeta de datos ficticios. Evidencia y resumen devuelven 200 y tienen el mismo pin. El resumen conserva `coverage:none`, `counts:null` y `quarantine:null`. En 390 px se vio el texto «Sin cobertura: se desconoce» y no se renderizó una lista de recuentos. Captura `portable-summary-390.png` abierta. Solo los 404 opcionales ya previstos de comprobación HubSpot y relevo. Cero escrituras, tráfico exterior o errores de página en el recorrido de navegador. Cierre del proceso y búsqueda CIM sin procesos de los bancos propios.

La primera sonda visual `diagnose-y9fRWe` buscó el texto abreviado «Sin cobertura» con coincidencia exacta y agotó el plazo. Su proceso cerró. El segundo pase comprueba el rótulo completo del producto. La prueba original de 300 que falló en consola y sus recibos permanecen separados.

El ensayo inicia directamente el Node empaquetado. La presencia del iniciador 272 está verificada por bytes y su comportamiento aislado consta en 272. El lanzamiento de la ventana de usuario y la protección Windows en otro equipo quedan fuera del recorrido. La cobertura A4 y el cierre de Fase 0 siguen con su coordinador. La demo 4601 no se alteró.

| Archivo de producto o prueba | SHA-256 |
| --- | --- |
| `server/runtime.ts` | `8166d68af52389ad0345742ca1833f2fd0087d3774b87b3ab92825b2723fb2e6` |
| `tests/task-revision-runtime.test.ts` | `cfe1bbbc74333acbd71d4988b9ec9d259d5a9ce721dfd1afc646b3addc6a682b` |
