# La CI local puede dar verde con todas las pruebas omitidas

14 de noviembre de 2026, Europe/Madrid. Revisión de CLAUDE-CI-LOCAL sobre las seis huellas presentadas, cotejadas de nuevo antes del dictamen. Evidencia local en tests/.tmp/ci-review356-f1w4q6.

## Resultado observado

- **F1 · CI declara CORRECTA una suite con una única prueba omitida.** Al invocar el CLI copiado con una suite sintética marcada skip, salió 0 con 1 prueba, 0 correctas y 0 fallos. Un control con una aserción ejecutada salió 0 y un control con una aserción fallida salió 1. Las tres ejecuciones usaron el mismo runner y configuración vacía de fallos conocidos.
- En tools/ci/run.mjs, unitOutputBroken comprueba que el total sea positivo y que los fallos se puedan explicar. El total de node:test incluye los skip. El informe necesita evidencia de resultados ejecutados antes de dar verde. Comprueba también TODO y suites mixtas. Si un caso conocido no se ejecutó, su ausencia del listado de fallos no acredita que pasó.
- **F2 · El proceso hijo hereda un valor de entorno ajeno a la ejecución.** Un canario ficticio falla al detectar la variable configurada solo para el proceso padre. tools/ci/run.mjs copia process.env excepto NODE_TEST_CONTEXT. Revisar las variables que realmente necesitan los hijos, acreditar su límite y ajustar el alcance documental de las comprobaciones. La prueba no mide tráfico externo ni usó valores reales.

## Pruebas y alcance

- Corrida focal inicial 56/57. La única roja pedía la existencia de un archivo de la lista de fallos conocidos que faltaba en mi banco reducido. Al incluir todos los archivos que lista el manifiesto, la suite de CI repitió 11/11. Las 46 pruebas restantes, de caché y QA052, pasaron en la corrida inicial.
- Para el siguiente envío, añadir pruebas del exit code y del informe del CLI real. Cubrir éxito, fallo nuevo, solo skip, solo TODO, mezcla con resultados observables y entorno heredado frente al permitido. Mantener la distinción entre fallos conocidos activos, ejecutados que pasan y casos sin resultado.
- Vuelve a corrección con sus propias reservas. La corrida focal no es un dictamen de caché ni del inventario API. No corrí la batería completa ni la verificación del inventario.

## Huellas examinadas

- tools/ci/run.mjs 56e13a2e47471ebd822cae291f7db8cd29dbd20db27691c2a19ed3b73f606189
- tools/ci/compare.mjs d788bd0ed50a08525f545e7662527fe510ab40431cd1e7d1e68a0382ed388985
- tools/ci/known-failures.json 7f71d3aa0776b316323a13673325e6c57d131ff91c7a9cdabc427b96523cc03b
- tools/ci/README.md 4bd3bd6c059732cd882d116021b98809f2c70a10072d15ae03bde05c76725a2a
- tests/ci-compare.test.ts 1f6a4c9959da7a5f3dbfcb8f247bb2c6d8a03fcb11af855a85d339969864408a
- coordination/reports/CLAUDE-CI-LOCAL.md a5dedac535fa7dd663e64a769325e0bbbe4ca8108b4d4835597d9a1517f8ec61
