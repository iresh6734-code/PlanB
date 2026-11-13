# Dictamen independiente 258 · API de relevo 216 R2

6 de noviembre de 2026, Europe/Madrid. **Devolver para R3 con las mismas cinco reservas.** Las cinco huellas coinciden con la entrega, checkout y proyección propia. Las correcciones de exclusión física de R2 pasan. 224 R2 tiene dictamen favorable separado.

## F1 · La sesión no se revalida junto a la persistencia ni después de leer la respuesta

En `server/relay-rehearsal-api.ts`, POST espera el resultado y verifica `authorized()`. Después prepara el registro con `clock()`, valida su coherencia, ejecuta `commit`, guarda y llama a `state()`. Falta revalidar la sesión original antes de guardar y antes de enviar el estado preparado, como requiere el contrato de la dependencia.

Dos sondas propias con Fastify real, SQLite en memoria y contraseña ficticia lo reproducen.

1. El reloj avanza justo después de que el ejecutor termine y la sesión supere la comprobación, cuando se prepara la fecha del registro. La API ejecuta **una escritura** y devuelve 200. El GET inmediato de esa cookie ya devuelve 401. Esperado cero escrituras, 401 y cuerpo de error sin resultado del ensayo.
2. La sesión permanece válida al guardar. La lectura final del registro en `state()` cruza su vencimiento. El registro puede conservarse porque se guardó con permiso, pero la respuesta devuelve 200 y el resultado a la sesión ya vencida. El siguiente GET confirma 401. Esperado 401 sin resultado. Esta prueba conserva expresamente el registro confirmado antes de vencer.

En una copia causal se revalida después de preparar y validar el registro, antes de `commit` y `save`. Se prepara el estado final y se vuelve a comprobar el permiso original después de sus lecturas antes de enviar. Las mismas sondas pasan **2/2**. La propuesta privada no altera las fuentes de la entrega ni reclama sus rutas.

## Qué pasa y qué debe repetir la corrección

El banco anterior pasa **40/40**, incluidos las cuatro sondas originales de exclusión, los seis casos R2 y el ciclo del Kit real. Las pruebas de timeout, cancelación, revocación, temporizadores y cierre físico conservan su resultado. Los tipos focales son correctos. El nuevo fallo se limita a las fronteras finales de permiso, no invalida la ranura física ya comprobada.

Repetir las dos sondas de `tests/.tmp/review258-ervnfl/s/tests/independent-relay258.test.ts` sin cambiar aserciones. `auth-final.log` conserva `1 !== 0` y `200 !== 401`. La propuesta privada y sus 2/2 están en `causal` y `auth-causal-final.log`. Añadir controles positivos, mantener consentimiento, conservación del último registro válido, estado STOPPING y descarte de resultados tardíos. Revisar las salidas posteriores a `state()` para que una lectura final no devuelva resultado protegido a una sesión que ya venció. Los errores deben conservar las cabeceras de caché y el cuerpo acotado.

El paquete 254 conserva su revisión y depende de esta corrección. La reproducción usa barreras del reloj y del adaptador de almacenamiento. No se afirma que se haya medido esta caducidad en el navegador o dentro del paquete instalado.
