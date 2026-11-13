# 260 · Continuidad montada en App y ligada a su copia

6 de noviembre de 2026, Europe/Madrid. Codex. App incorpora la navegación aceptada de 253 hacia Hoy e Integraciones y la vuelta a Continuidad con foco. Pasa al bloque la revisión de contexto que obtiene de `/api/v2/state`. El Hub usa el vínculo aceptado de 242 al consultar la evidencia. Un contexto explícitamente ausente retira esa fuente de la lectura utilizable. Los anfitriones aislados que omiten la prop conservan su contrato previo.

ContinuityHome monta el Hub con una clave ligada a esa revisión. Cuando cambia la copia, React retira juntos los resultados visibles y las peticiones pendientes del consumidor anterior. Su limpieza cancela la señal y descarta respuestas tardías. El cliente exige la confirmación de contexto del servidor. Las acciones de ensayo mantienen sus gestos explícitos.

## Recorrido verificado

La proyección `tests/.tmp/continuity-app260-Md75YU` usa las dependencias aceptadas de Continuidad y estas seis fuentes de código y pruebas. Compila la interfaz desde App y el servidor desde main. El test nuevo no aplica el parche de 253. La suite anterior admite ahora tanto el parche ya incorporado como su aplicación a un corte anterior, y conserva sus cuatro recorridos.

- 27/27 Node de mapa, cliente del Hub y montaje estático. Tipos focales correctos y comprobación de espacios limpia.
- 6/6 Chromium, sin skips ni retries. Los cuatro recorridos anteriores conservan navegación, consentimiento, persistencia de la lectura tras reinicio, teclado y geometría 1440/390/320. Se inspeccionó `home253/continuidad-320.png`.
- La App pide evidencia con la revisión exacta de su estado protegido y recibe la misma confirmación en cabecera. Retirar únicamente esa cabecera de un 200 genuino cambia la fuente a indisponible y retira la afirmación observada. Cero POST o PATCH durante esa lectura.
- Desde el formulario real de restauración se importa otra copia ficticia, se actualiza el estado y se ve la evidencia de la nueva captura. Las respuestas de la copia anterior permanecen retenidas por el transporte, que ignora AbortSignal. Tras entregarlas todas, el pasaporte conserva la captura nueva y no recupera la anterior. Solo se observa el POST explícito de restauración y cero modificaciones CRM. El estado final tiene cero cambios.
- La misma prueba de solicitud vinculada, con las tres fuentes de interfaz aceptadas anteriores en una copia privada, falla por un pin `null` frente a la revisión exigida. El test compila la App anterior y mantiene sus aserciones de navegador. Se restauraron los bytes corregidos de la proyección al terminar. Tres recibos de cierre corresponden a los dos servidores ficticios del recorrido final y al de la contraprueba.

## Preparación y alcance

La primera corrida dio 27 Node correctos y 4/6 Chromium. La prueba suponía una única consulta al abrir, pero la portada relee al conocer la conexión local. Se corrigió el arnés para comprobar que todos los pins coinciden con la revisión y retener todas las respuestas de la captura anterior. La corrección de producto no cambió entre esas dos corridas. Los resultados iniciales quedan en `continuity-app260-PIH8UR`. El corte final conserva `browser.log`, `node.log`, `types.log`, `control.log`, trazas, manifiesto y recibos de cierre. El contraste observa la falta de vínculo, sin una aserción sobre el texto del código en la prueba de navegador.

La restauración y sus bases son ficticias. El test anterior de Integraciones usa proveedor de loopback y el nuevo no configura proveedor. La API de relevo 216 sigue pendiente de R3 y no se registra con este paquete. La candidata servida 236 conserva su corte anterior. La entrega está pendiente de revisión independiente antes de preparar una candidata con estos archivos.

## Huellas

- `src/App.tsx` · `bacf2aeca8e02822b9153b5459cb1ede6690719e8c7be1b37e15bc3733b1f10b`
- `src/ContinuityHome.tsx` · `9bbbc4a153b092b4fe973f820052fcab5b878d2a9107e2fd107bb3ed3e547388`
- `src/ContinuityHub.tsx` · `65dbdd2a6c3344275c28fd70b8e1720792486a1002d8b1d06783a7e1193ad6e1`
- `tests/continuity-home-hub.test.ts` · `de0bc9e5ef448659929da2dd5d6757cc11ef014c5f1fafeaafa6808efccd6e8c`
- `tests/e2e/continuity-home-hub.spec.ts` · `b76771eb339e5156d0e1ba8e39bce5299df230cddca5121c41d82cf1816636fe`
- `tests/e2e/continuity-app-context.spec.ts` · `0d4d4803567576ab3f98f8411fe718d61db934e99b8f78c506f872797220cb4b`

Informe sellado por el tablón al presentar.
