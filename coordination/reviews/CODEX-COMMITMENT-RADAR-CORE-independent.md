# Radar de compromisos · Dictamen independiente

## Dictamen R2 favorable

La nueva presentación corrige las cuatro fronteras. El helper comprueba el permiso después de leer el contexto y el POST lo valida después de confirmar la transacción, antes de entregar el recibo. Se cotejaron las cinco huellas. Pasan 20/20 con tipos focales limpios, dieciséis casos de autor y autorización más cuatro sondas independientes. Sustituir exclusivamente el API por el de la primera presentación hace fallar ocho, las cuatro regresiones del autor y las cuatro independientes. Se restituyó el API R2 y se cotejó de nuevo el corte.

La lectura no entrega datos a la sesión vencida. La caducidad previa a la escritura conserva cero entradas. La escritura que se confirmó antes de vencer se conserva y un reintento explícito autorizado recupera su recibo sin duplicarla. Evidencia final en `tests/.tmp/radar-core-review-WDdz6w`. El API aceptado tiene SHA-256 `23dc9bd01b3cb7cf0db33dcea73514e1a6d169d59719ccdac9814c24e38f1b13`. Quedan pendientes montaje y recorrido de navegador con el dataset de la candidata.

## Primera presentación devuelta

6 de noviembre de 2026, Europe/Madrid. **Devolver CORE para corregir la frontera de autorización.** Se cotejaron los cinco hashes presentados y una proyección privada de 284 entradas basada en la candidata 263. Las cuatro pruebas del autor y ocho de autorización pasan. Cuatro sondas adicionales reproducen entrega de datos a una sesión vencida y, en una frontera, una escritura posterior al vencimiento.

## Hallazgo

`requireContext` comprueba la sesión antes de leer `workspaceSearchIdentity(store)`. Esa lectura consulta Store y puede atravesar el vencimiento. Las rutas vuelven a llamar al helper al final, pero la comprobación precede también a esa última lectura.

- En lista y detalle, una barrera sobre la segunda lectura de contexto hace vencer la sesión después de comprobar el permiso. La respuesta sigue siendo 200 con los compromisos. El siguiente GET con la misma cookie da 401.
- En decisiones, la misma barrera antes de guardar permite una fila de historial y respuesta 200 con el permiso ya vencido. Debe responder 401 y dejar cero filas.
- Si la sesión vence durante `Store.set`, la decisión puede haberse confirmado con permiso al comenzar la escritura. CORE devuelve 200 con el recibo a la sesión vencida. Debe conservar la decisión ya confirmada y devolver 401 sin recibo. Una sesión nueva puede repetir explícitamente la misma clave y recuperar el recibo con una sola entrada.

Las cuatro sondas usan Fastify y la autorización reales, Store ficticia en memoria y un reloj controlado. La condición de caducidad se confirma con un GET independiente, sin modificar la implementación de autorización.

## Contraste

La propuesta privada vuelve a comprobar el permiso después de leer el contexto. Tras completar la transacción, vuelve a validar el contexto y el permiso antes de devolver el resultado. El banco exacto da **12/16**, con cuatro fallos `200 !== 401`. La propuesta da **16/16**, incluidos los controles de no escritura previa al vencimiento y recuperación idempotente después de la escritura confirmada. Tipos focales limpios sobre el corte exacto. Se restauró el API y los cinco hashes coinciden al terminar.

Evidencia en `tests/.tmp/radar-core-review-DbhYzN`, archivos `exact.log`, `causal.log`, `types.log`, `result.json` y `proposed-commitments.ts`. El primer contraste añadía una expectativa demasiado estrecha al cuerpo de AppError, que contiene `details: null`. La ejecución final admite ese campo y comprueba que no se publiquen items ni recibos. La escritura del puntero temporal final encontró un nombre ya existente después de guardar los resultados en la raíz nueva. Los logs y el recibo de esa raíz conservan el contraste final.

La aceptación del contrato de aislamiento, estados de cobertura, claves y persistencia ordinaria se apoya en las doce pruebas que pasan. El montaje en App/main y la prueba con navegador quedan pendientes. Conserva las cinco reservas y presenta R2 con las cuatro fronteras anteriores cubiertas. Las nuevas pruebas deben conservar la decisión ya confirmada, impedir la que llega sin permiso y demostrar un reintento explícito con una sola entrada.
