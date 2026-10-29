# Revisión independiente CODEX-HS-011

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. Dictamen provisional favorable; pendiente presentación, hashes y checks finales. No se acepta aún. Solo este informe reservado; sin fuentes o pruebas del autor modificadas, navegador/proveedor/cuentas/secretos o nuevas fuentes a Claude. Memoria/panel corresponden al coordinador que los reserva.

## Presupuesto y carreras

Opciones internas timeoutMs/requestTimeoutMs solo admiten enteros positivos hasta30000/12000ms; no se añaden parámetrosHTTP. Validación y señal ya abortada rechazan antes de acceso a credencial. El presupuesto global comienza tras access, lo que deja fuera lectura inicial/refreshOAuth según alcance declarado. La señal externa se registra después de access y se vuelve a comprobar inmediatamente para cubrir aborto durante esa espera, sin prometer cancelar access.

bounded rechaza por presupuesto o timerindividual aunque el transporte ignore AbortSignal. Registra los handlers de éxito y error en la operación desde el inicio, por lo que un rechazo tardío queda consumido. finish es idempotente, limpia timerindividual y listenerbudget; finalmente context limpia deadline y listenerexterno en éxito y error. Las señales pertenecen a cada operación, sin abortar operaciones posteriores.

Cada GET está envuelto incluyendo assertCurrent, fetch y response.json; después de cada espera se comprueba signal antes de continuar. Un fetch tardío no lee cuerpo y un cuerpo tardío no genera más GET. La última assertCurrent también está envuelta por el presupuesto global. La espera del propietario comparte plazo y no devuelve una salida parcial ante timeout. No se reinicia el deadline al omitir404; únicamente ese estado opcional conserva semántica de ausencia de HS010.

## Evidencia independiente

Ejecutado por este revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-budget.test.ts

**8/8 correctas** con PGlite separado, mocktimers sobre setTimeout y transporte sintético/redbloqueada. Comprueban plazo compartido/contacto/detalles404, timeoutindividual aunque seignoreseñal, cuerpoJSON, últimoowner, aborto previo/durantelectura, limpieza de timers/listeners, fetch yrechazos tardíos y validación de opciones. No hay sleeps largos ni dependencia de red/proveedor para el orden. Pendientes cotejo de presentación y suite/typecheck finales del autor.

## Límites

Un timerJS no interrumpe trabajoCPU síncrono o un eventloop bloqueado. bounded deja de esperar y descarta resultados; no cancela físicamente una consultaBD ya iniciada, ni garantiza detener un transporte que ignora señal. Las lecturas assertCurrent/final están acotadas para la respuesta pero su operación subyacente puede terminar después. Los GET reciben AbortSignal para transporte cooperativo. Plazo comienza después de access/refreshOAuth, sin garantía de duración total de callbackHTTP desde su inicio. No se acredita QA visual, OAuth real, cancelación distribuida o concurrenciaPostgreSQL completa. Sin problemas materiales dentro del alcance observado.

## Cierre de comprobaciones (añadido por Claude por delegación del usuario, 29/10/2026)

Los pendientes de la cabecera («presentación, hashes y checks finales») se cierran así: hashes SHA-256 (16 primeros) de lo presentado `server/team/oauth.ts` b84b34bc5b83fd66 y `tests/hubspot-context-budget.test.ts` a3076ffea4c660be; `hubspot-context-budget.test.ts` repetido 8/8; `tsc --noEmit` sin errores; `npm test` completo 539/539. No se modificó el código del autor. El dictamen y el análisis anteriores son del revisor Codex original; esta nota solo añade las comprobaciones finales.
