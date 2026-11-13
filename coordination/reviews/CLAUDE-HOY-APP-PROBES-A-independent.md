# Dictamen vigente: sondas de Hoy R2 aceptadas como arnés

7/11/2026, 11:06:03, Europe/Madrid. Se aceptan las tres huellas R2. Esto no acepta las funciones de producto que las sondas esperan.

## Repetición propia

Corte privado hoy-probes-r2-final-xJfZSN, base263 congelada y tres archivos R2 cotejados. Se repitieron ocho controles y la sondaA4 de acuse perdido/reinicio. Resultado8pasan/1falla, sin saltos ni retries; el único fallo llega exactamente a FUNCIÓN AUSENTE: Trabajo por recuperar. Antes de él pasan recepción200, una fila del IDexacto y estado completado, homónima intacta, reinicio con PIDdistinto, misma fila/total y ceroPATCHnuevos. Tiposfocales limpios. No se repitieron las otras seis sondas de capacidades ni la cifra10/15 del checkout de autora.

Ambos controles negativos del500 pasan: contar petición rechazada no acredita aplicación y el recorridoA4 se corta antes del reinicio. El control positivo guarda y acredita una fila. La copia privada comprueba manifiesto de158entradas cliente,127servidor y15activos; los procesos dejan recibos de cierre y assertAllClosed no detectó ninguno vivo. El código ya no borra frozen ni bases preexistentes; cada caso usa raíz nueva y clave ficticia nueva.

Una sonda independiente adicional (tests/independent-root266.test.ts dentro de esa proyección) pasa1/1 con una junction realWindows que sale del padre permitido hacia otra carpeta propia. claimRoot rechaza antes de crear new-root y conserva el canario ficticio y el listado de destino. Esta prueba complementa el límite que autora declaró como no ejecutado. La copia inicial UMtbAz fue rechazada al solicitar una raíz fuera del padre de la proyección: acredita el control de propiedad y queda excluida del banco final. La primera preparación de la sonda independiente usó un directorio de trabajo erróneo y no ejecutó pruebas; la posterior con ruta absoluta es la válida.

## Límites de aceptación

Aceptación del arnés y las dos correcciones266 sobre el corte263. A2 fue aceptada aparte por su revisor; esta repetición no la incorpora. El primer CONTROL fija explícitamente cero lecturas de la cola como línea base deA3: debe revisarse en una unidad nueva cuando se monteA3, y no se presenta como requisito permanente. El final deA4 tras la primera barrera sigue pendiente de probar con intento exacto y comprobación por lectura cuando exista su montaje. No es main empaquetado ni prueba de candidata completa. La normalizaciónLF posterior tiene procedencia propia276; no cambia estos hashesR2.

- tests/e2e/hoy-recuperable-harness.ts: f137dec8ca17614c7cbe36f28be2b444efec3edd7fadae9c2f120a4bd42b33f9
- tests/e2e/hoy-recuperable-240.spec.ts: 44f76ee277d5f65978b32f4441320cd9003e1c18fa0453d005f22faf74a34e16
- coordination/reports/CLAUDE-HOY-APP-PROBES-A.md: 51057d1d1e2ff9fe882fd3b01c4957ea2962d5c0dc3ba661e060b90ed2863ebc

---

# 266 · Revisión independiente de las sondas de Hoy

6 de noviembre de 2026, Europe/Madrid. Dictamen de primera entrega. **Devolver para R2.** La suite sirve como línea base de funciones pendientes. Dos puntos deben corregirse antes de usarla como puerta de aceptación.

## Reproducción

Se repitieron los once casos con las tres huellas del tablón sobre una proyección de las 277 fuentes de la candidata 263. Se usaron la App compilada con Vite, `createBaseApp` con revisiones habilitadas, un proceso local propio, SQLite ficticio y Chromium con red externa bloqueada. Pasaron cuatro controles. Los siete casos restantes se detuvieron en las mismas barreras del informe. Tipos focales limpios. La ruta propuesta del resumen sigue devolviendo 404. El registro, JSON de Playwright y salida están en `tests/.tmp/hoy-probes-review-LjGFO1`. Esta ejecución acredita las primeras barreras. Los pasos posteriores de comparación y recuperación siguen pendientes del montaje.

## F1 · Una petición rechazada satisface la comprobación de aplicación

`loseAck` incrementa el contador tras cualquier respuesta HTTP. La sonda A4 llama «el servidor APLICÓ un único PATCH» a un contador que suma peticiones de ambas rutas sin mirar su estado. No comprueba la tarea ni el historial antes de reiniciar. Inyecté solo en otra copia un 500 anterior a la escritura. El servidor registró un PATCH legado con 500 y SQLite conservó cero filas en `changes`. La prueba pasó las comprobaciones de aplicación y reinicio y volvió a fallar recién en la ausencia de «Trabajo por recuperar». Se conservan el registro de peticiones, la base ficticia y la salida en `tests/.tmp/hoy-probes-rejected-Ko4UFD`.

La barrera correcta distingue recepción, aplicación y pérdida de acuse. Debe exigir estado HTTP exitoso y comprobar una fila de historial vinculada al ID objetivo junto con el efecto esperado en la tarea. Tras reiniciar, debe cotejar la misma fila, conservar intacta la tarea homónima y verificar el intento exacto sin otro PATCH.

Una copia adicional detuvo el mismo 500 en «PRUEBA DE APLICACIÓN». Su salida está en `tests/.tmp/hoy-probes-ack-guard-MnfO7K/browser.log`. En el control con la comprobación añadida y el servidor sin el rechazo, el PATCH devolvió 200. El arnés confirmó una fila, la tarea exacta completada y la homónima pendiente antes de reiniciar. La prueba llegó a la ausencia de «Trabajo por recuperar». Se conserva en `tests/.tmp/hoy-probes-ack-positive-NO2AkV`. La R2 debe conservar esas comprobaciones y seguir la identidad de la fila a través del reinicio.

## F2 · El arnés acepta como raíz un directorio preexistente

El constructor usa `PLANB_HOY_ROOT` o el argumento del llamador sin acreditar propiedad ni destino real. `prepare()` borra `frozen` recursivamente y `reset()` borra archivos de base por nombre. Una ruta incorrecta puede reutilizar archivos ajenos. La revisión ejecutó el arnés exclusivamente con una raíz nueva creada y comprobada bajo la proyección privada. El hallazgo se obtiene del flujo de código.

Para hacer reproducible el resultado, el manifiesto debe incluir las fuentes realmente consumidas por UI y servidor y los activos públicos. El arnés presentado coteja una selección de extensiones de `src` y `shared`, mientras el proceso de servidor lee el checkout que le entrega el llamador. Nuestra repetición fijó la procedencia al ejecutar todo desde el corte privado 263. El arnés debe garantizar esa propiedad al ejecutarse desde el checkout compartido.

La siguiente revisión cotejará R2 sin dar por montadas A2, A3 ni A4. La entrega de ficha condicionada tiene su propia reserva. La comprobación final con `main` compilado se conserva en el encargo 264.
