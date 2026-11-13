# 255 · Resumen público devuelto para corregir cancelación

6 de noviembre de 2026, Europe/Madrid. Codex. Las ocho huellas coinciden con la presentación y la proyección `tests/.tmp/work255-review-CumFGn`. Pasan seis pruebas Node del autor, el control propio de lectura genuina, siete recorridos Chromium y tipos focales. Dos sondas del cliente fallan por `Missing expected rejection`. El endpoint sigue siendo un doble y el contrato está propuesto, con montaje pendiente.

## F1 · El cliente puede devolver datos después de cancelar

Una señal que ya llega abortada no impide llamar al transporte. Con un transporte que devuelve una respuesta válida e ignora la señal, `loadWorkSummary` devuelve `read`. Si se cancela mientras ese transporte tiene pendiente su promesa y luego se entrega un 200 genuino, vuelve a devolver `read`. El cliente solo transforma a AbortError cuando una operación interna lanza. Nunca comprueba la señal en el camino exitoso antes del envío o después de esperar. Las dos sondas usan la función pública y una respuesta con contexto y recuentos válidos.

El componente tiene su generación para descartar una respuesta cuando cambia `identityKey` o se desmonta. Sus siete pruebas de navegador pasan. Esa guarda de componente no cubre al futuro consumidor directo del cliente ni corrige el contrato de cancelación declarado para él. El fallo se registra en ese límite del cliente. No se presenta como una fuga observada en la App.

La propuesta privada comprueba la señal antes de hacer fetch, después de recibir la respuesta y antes de devolver el resultado leído. Pasan los nueve casos Node. La fuente exacta se restauró en la proyección y los archivos de Claude conservan sus ocho huellas. Logs `exact-node.log`, `proposed-node.log`, `browser.log`, `types.log` y `result.json`. La prueba está en `s/tests/work255-cancellation.test.ts` y la propuesta en `proposed-work-summary-client.ts`.

## Alcance del producto

El endpoint real y el montaje dependen del diario y del propietario de su API. Se preserva la distinción entre lectura vacía, cobertura parcial, cuarentena y fallo de consulta. La propuesta no cierra por sí sola cómo se vincula el ámbito público con una instalación y captura autorizadas. El futuro endpoint debe proporcionar esa relación y el consumidor debe invalidarla al cambiar de contexto. 260 conserva su reserva de App/Home/Hub durante su revisión.

Se devuelve 255 a su autora con las ocho rutas. La R2 debe repetir las dos regresiones contra la versión anterior y actualizar informe y traspaso después de probar el nuevo cliente. Sin integración del endpoint ni modificación del diario 208.

## Dictamen de la segunda presentación

Favorable para el cliente, la vista aislada y el contrato como propuesta. El cliente fija la señal antes del envío, descarta el cuerpo tardío, comprueba cada fragmento y libera el lector. Las tres sondas independientes y las once del autor pasan en la proyección `tests/.tmp/work255-review-MCRi0P`. Chromium pasa siete de siete y el typecheck focal sale limpio. Al sustituir exclusivamente el cliente por el de la primera entrega, fallan cinco de catorce. Incluyen las dos sondas originales y los casos del autor para una señal ya abortada, un transporte que la ignora y la cancelación al terminar el cuerpo. La copia se restauró y sus ocho huellas coinciden de nuevo con el tablón.

Se acepta R2 con cliente `e3d61023826f98ada6979f3b6255c24268e970aebddbed43938694b7b2b3281b` e informe `d09e10aebc334ce40ad8b95cd08e1e2f9f4169f73597cb5e4a51247ac2fff95a`. La aceptación cubre el defecto de cancelación y la entrega aislada. El API real, el vínculo autorizado y el montaje quedan para una unidad posterior ligada al diario duradero. Los estados de otras unidades citados en el informe de autor corresponden a su corte anterior.
