# Una captura fallida conserva la copia y el reintento retira el aviso

14 de noviembre de 2026, Europe/Madrid. Banco verify352-eK3552. Prueba de integración con las rutas reales de Fastify y SQLite ficticio nuevo. El importador inyectado falla la primera vez y entrega una captura conciliada la segunda. La conexión se guarda por el método real con una credencial ficticia. La barrera local bloquea conexiones salientes.

- Primer POST: trabajo fallido, aviso visible en la respuesta que consume Inicio, programación habilitada, misma copia y revisión activa con una edición local pendiente.
- Tras cerrar Fastify y reabrir la misma base, el trabajo fallido se identifica por ID y el aviso sigue presente.
- Segundo POST: ID nuevo, resultado correcto y una captura nueva. La captura anterior y sus valores siguen disponibles. La revisión activa y la edición local pendiente se conservan.
- Tras otra reapertura, se conservan ambas capturas y la hora del éxito. El error es nulo y el aviso ha desaparecido. Dos llamadas al importador y dos trabajos de captura.

Pasaron 17 pruebas focales sin omisiones y el typecheck completo de la copia. La primera preparación asumía que el trabajo fallido seguiría primero en la lista. El arranque puede programar un simulacro. Se fijó un informe técnico vigente de ficción y se buscó el trabajo por ID. En la primera pasada de tipos, se extrajo el cierre a la función que posee el estado para evitar un estrechamiento de TypeScript en finally. La suite final coteja las huellas de la prueba, servicio y avisos.

El reintento se ejecuta mediante POST porque se verifica el ciclo real de Jobs y persistencia. El temporizador no ejecuta la captura durante el ensayo. Las reaperturas se hicieron en el mismo proceso Node. El recorrido en Chromium corresponde a 351, con otro arnés. 352 no instala ni despliega un paquete.

- tests/capture-retry-continuity-352.test.ts · 526daae31b1155ec28b46bb569864f6aae26a983c05017004f05dbef3eb1a87e
- server/app.ts · b26845d21518e7371c04a80e08f26def455e0c80d81e258b5c1f8b89f28d919b
- server/continuity.ts · 2e605d95c837e80d259811bbe45152147a133d9a3848f6caebddaec260b5a9d5
- server/v2.ts · 98a4e9bc0ba81883ad7cbbb232c7aa681ac7c8f7a0a22990b990771a107b9972
- server/jobs.ts · c202f60c32b0f7dd3ac4d4dd4e51d9b056156e43e08508a55e7258131e68a876
- server/store.ts · 990baafc88e636a667fbf9848ce2bbd5f87aae318398d1ced3e5d3f19d6af12c
- src/app-shell/continuity-alerts.ts · 435ba984b3692ea101f2a1992107f218df9de944cd6dc2ee4fc90f7f1c2de587
- src/app-shell/copy-timeline.ts · 20dcf501313793426f7ac2ec19a3f3caf736457997a7b0f84baff5214f982a3d
