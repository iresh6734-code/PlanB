# Revisión independiente de CODEX-OPERATIONS-ROBUST-132

2/11/2026, Europe/Madrid. Autor: Codex de este chat;132 pertenece al otro chat «Prepara un plan potente para Claude»,01a1979f-9475-7e01-9b05-f51ca3b83ea5. Unidad de revisión CODEX-OPERATIONS-REVIEW-134. Dictamen favorable al corte presentado; no acepta134 ni otras unidades.

## Alcance y fuentes

Se cotejaron los tres hashes presentados132 antes/después de congelar y ensayar. Se leyeron cliente, esquema, consumidor LocalOperations y listener de App. No se modificaron fuentes132, App, Store o archivosClaude. El cliente emite planb:locked ante401 antes de interpretar el cuerpo; App vuelve a consultar /v2/auth/status. El evento por sí solo no acredita sesión caducada ni obliga a mostrar bloqueo si el servidor sigue declarándola abierta.

La lectura acumula bytes de los fragmentos recibidos, permite exactamente1.000.000 y cancela al superar esa cifra. Content-Length no determina su decisión. TextDecoder conserva el estado entre fragmentos y libera el lector tanto al terminar como al fallar. No se añade reintento automático de una revisión POST potencialmente guardada.

## Evidencia propia

Snapshot `tests/.tmp/operations134-3d3982dc-5140-47b1-ba43-6d7b2048daa2`: manifest.json conserva fuentes/hashes y submitted132; result.json, author29.log, independent10.log y typecheck.log conservan resultados. Entorno mínimo de sistema, NODE_ENV=test, red externa bloqueada. Los casos propios no abren bases; las suites autoras usan Store en memoria. Sin escucha HTTP nueva, proveedor, navegador o instalación.

-29/29 de las cuatro suites relacionadas132, repetidas aquí;0fallos/omitidas.
-10/10 nuevas `tests/independent-local-operations-http.test.ts`;0fallos/omitidas.
-Typecheck focal limpio sobre cliente y las cinco suites con sus dependencias.

Los diez oráculos propios prueban401 GET/POST sin leer un stream interminable y con cancelación que rechaza;401 sin cuerpo;frontera exacta con Content-Length exagerado;un byte por encima con Content-Length cero;bytesUTF8 frente a caracteres;emoji de cuatro bytes fragmentado byte a byte;error de transporte conservado y lector liberado;POST demasiado grande sin segundo envío;prohibición de response.text() en un control válido;503vacío/502HTML incompatibles sin evento de bloqueo. Los requests POST conservan revisión y clave idempotente.

Cuatro mutaciones únicamente en copia congelada hacen fallar el oráculo seleccionado con AssertionError:retirar la rama401;rechazar también el límite exacto;contar caracteres en vez de bytes;desactivar decodificación continua. Cada caso original pasa y cada mutante tiene exactamente un fallo, sin errores de importación/compilación ni timeout. El módulo original se restaura en el snapshot y sus hashes se recotejan. No equivalen a cuatro pruebas adicionales de producto.

## Incidencia del verificador

Primer corte `tests/.tmp/operations134-50419006-3cee-4967-b7e5-a77a03a852fb`:29/29,10/10 y typecheck ya pasaban;los cuatro mutantes fallaban. El clasificador exigía AssertionError y el caso del límite exacto propagaba el error del mutante sin envolverlo en assert.doesNotReject, por lo que marcó success:false. Se hizo explícita esa aserción de éxito, sin cambiar frontera, respuesta ni expectativa. Se conservó el primer corte y se repitió en otra carpeta:39/39,typecheck y cuatro fallos causales clasificados. No fue un fallo del producto ni un resultado descartado silenciosamente.

## Límites y decisión

El máximo limita bytes consumidos/acumulados por este lector; no demuestra un límite absoluto de memoria del navegador o de los buffers de red. Un fragmento entregado por el transporte puede superar por sí mismo la cota antes de ser rechazado. No se midió memoria. Errores HTTP distintos de401 con cuerpo noJSON siguen dando error genérico de compatibilidad; es el comportamiento actual, no una promesa nueva de errores tipados universales.

Los ensayos DOM132 declarados por el autor son dos recorridos App con401HTML y estado de sesión bloqueada inyectados, en1440/390. Se leyó su informe; no se ejecutaron de nuevo ni se atribuyen a este chat. Tampoco prueban vencimiento temporal de una sesión real, lector de pantalla o Edge. No se repite Vite/E2E porque esta revisión no cambia runtime y los oráculos propios ejercitan el contrato modificado. La demo4591 conserva su build anterior:aceptar132 no la actualiza.

Dictamen:favorable dentro de este contrato. Aceptación132 permitida tras cotejo final de los tres hashes.134 se presenta para otro revisor. Las entregas116/123/130 siguen reservadas y su revisión corresponde al otro chat;ninguna se da por aceptada aquí.
