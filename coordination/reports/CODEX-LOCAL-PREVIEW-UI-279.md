# 279 · Ficha revisada y Por decidir en la nueva app local

7/11/2026, 11:21:50, Europe/Madrid. Se compusieron y observaron en http://127.0.0.1:4601/ las funciones aceptadas de A2 y PorDecidir, sin editar fuentes compartidas.

## Composición y procedencia

Base UI263 congelada, cinco overrides de A2/PorDecidir aceptados, más cuatro dependencias199/183 bajo280 y el cliente166 transitivo bajo281. No se tomó el checkout completo. Corte preview279-g1Cnt7:163fuentes,10entradasaceptadas,15activos; tiposfocales0 yVitebuildprivado correcto. result.json lista todos los hashes de fuente y activo; served-assets.json comprueba HTTP200y SHAexacto del JSservido. Las dos preparaciones anteriores fallaron en tipos y se detuvieron antes de sustituir activos.

Los activos anteriores permanecen en installation/dist-before279. Antes de mover se comprobaron rutas reales, ausencia de enlaces, descendencia de raíces propias y hashes del corte278. PID19880 y binario277sin cambios; instancia3cb33118-1596-44cc-b78a-b2961615f4ff comprobada antes/después. Lectura real usando clientecontextual183 sobre task-2 funciona contra el mainnormal.

## Recorrido real de UI con rechazo simulado

Después de confirmar que el banco del otro chat terminó (CIMsinprocesos con su raíz), Chromiumaislado abrió la app y Hoy, abrió task-2, editó una nota ficticia y pulsóGuardar. Se observó exactamente un intento a /api/v7/task-revision/task-2 y ninguno por la ruta anterior. El navegador retuvo el intento, permitió cerrar la ficha y devolvió422SIMULADO antes de enviar nada alservidor; no se presenta como422real delbackend ni como guardado aplicado.

Resultados mostró Por decidir(1); al activarlo conEnter mantuvo foco y aria-pressed, agrupó No se aplicó y conservó el IDtask-2. A320px no hubo desbordamiento y se abrió e inspeccionó decisions-320.png. Tras recargar no queda superficie ni intento simulado, tal como corresponde a su memoria temporal.

Digest canónico de todas las tablasSQLite antes/después idéntico: e4dfc6626500435ac1eed420cd39dc2c2f669add8d2aaec05bb1a83571268aea. Cero escrituras enviadas alservidor, cero peticionesexternas y cero erroresde página. La única respuestaHTTP>=400 observada fue el422simulado, registrado como tal. Browser-result.json y check-preview279.cjs conservan las comprobaciones. La instancia sigue abierta; el navegador de prueba terminó.

## Límites y siguiente paso

La revisión independiente de esta composición sigue pendiente; no hay autoaceptación. No se repitió un guardado200real sobre esta base: los módulos tienen sus bancos previos, y esta prueba preserva62registros ficticios. No es candidata conjunta con Jornada/Radar ni persistencia tras reinicio de intenciones. La instancia nueva sigue sin contraseña local configurada (authconfigured:false); no se atribuye401aeste arranque. Mantener separadas instalación278, actualizaciónUI279 y binariohistórico263/ZIP271.

## Overrides aceptados

- src/LocalTaskFocus.tsx: 01adb2d9489d8257bbc6c61c53e487908c8457fe8bc440dc7ec949565d38d9cf
- src/TaskOutcomesHost.tsx: 209c93fb3e43dfb9d4402d0398ed78692e29daf5e89960857ac877b2ec1c180a
- src/LocalOperations.tsx: 67ab27362355cfbf32307eeb5d62a6baa8ba14713be7a7f7aac8256615a33a7e
- src/TaskSaveOutcomes.tsx: 8b9de460ecb74581ae093d67b378993fedf0d0e0286abb273425f5a1029ab3c8
- src/task-save-outcomes.css: 7f975c77e94759276466c44c0a229b78a54c5c6bc958a8a64c499088b748582c
- src/TaskConflictReview.tsx: 7d3fa3084bed44fd7f95f63ad60d87901fd98c8da8f0c4538f90c1a46dcaea43
- shared/task-conflict-review.ts: 82966dc64f9fcccdcd8ff356e8ffe60b05d3984d21e7c461d9d8237dee30d894
- src/task-conflict-review.css: be27e0dd0ebf5c77df5b1582c11f9db1e5c7cb98a44122161af656e76bddb1fc
- src/task-revision-context-client.ts: c0535a77afcbe17af938970f00dcc0385f8c6033e1a4eef769e0fa90580c70ec
- src/task-revision-client.ts: f093f7e5c23dc114637663da77075d560bb56e16f8c28a624432b9aa2431f417
