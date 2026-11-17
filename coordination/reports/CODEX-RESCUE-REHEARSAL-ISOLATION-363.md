# Las pruebas de relevo identifican el destino de su propia cápsula

14/11/2026, Europe/Madrid. Los tres cortes de importación identifican staging y destino por el reclamo de su cápsula. Comprueban el marcador, la revisión y que el proceso anterior ya no está vivo. Tras una interrupción anterior a publicación, la recuperación crea un único destino nuevo. Tras publicar, el reintento consolida el reclamo del mismo destino. Se compara el digest del origen antes y después de recuperar.

El caso de exclusión observa únicamente los reclamos de la cápsula, exige una importación y dos rechazos y comprueba el destino confirmado. Se registra para limpieza solo lo propio. El barrido de los dos staging huérfanos se ejerce en subdirectorios propios, moviendo exclusivamente el staging identificado. El arnés inicializa su directorio temporal y espera el cierre de los canales de salida del proceso hijo.

**Sensibilidad.** En 362 ya fallaban los cuatro casos en paralelo. En dos copias nuevas introduje destinos ficticios de otras revisiones en los puntos de observación. La versión anterior falló 4/4 por los recuentos globales y la corregida pasó 4/4. Las sondas verifican que los marcadores ajenos siguen presentes antes de retirar sus carpetas. El primer intento del banco no preparó tests/.tmp y los casos de CLI quedaron sin reproducir. Se corrigió esa preparación y se repitió.

**Suite completa de relevo.** 35/35 sobre el archivo final sin inyección, 324 s, sin cancelaciones, omitidas ni TODO. Incluye procesos de CLI, reapertura, 10.000 registros y exclusión de escritores. tsc --noEmit limpio después del último cambio. Banco tests/.tmp/rescue363-uEpxFG, backend fijado al snapshot de 362, sin modificación de producción ni piloto. Se conserva la batería 362 como resultado anterior. Esta entrega todavía no repite el npm test global.

- SHA-256 tests/rescue-capsule-rehearsal.test.ts a497d52f1f8a3c7eab4b917f1cf9196211c44efb0af7ce14484d7a7bcbcfd6ed
