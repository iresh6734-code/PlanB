# Revisión independiente 322 · Cliente y estrategia A4

10 de noviembre de 2026, Europe/Madrid. **Dictamen: solicitar R2 por F1, F2 y F3.** Los cinco archivos de `CLAUDE-A4-CLIENT-STRATEGY` conservan su reserva.

## Hallazgos reproducidos

| Hallazgo | Resultado con los archivos presentados | Resultado esperado |
| --- | --- | --- |
| F1 · P1 · Cancelación dentro de `onDispatch` | El cliente devuelve `not-dispatched`. El transporte que ignora abort entrega un POST al servidor, que llama una vez al escritor y deja un intento y una fila en historial. | El cliente corta antes del transporte. Los cinco contadores quedan a cero. |
| F2 · P2 · 401 tardío | Una lista vence por plazo, se renueva la sesión y otro GET funciona. El 401 real de la cookie revocada emite un evento global cuando se libera la consulta anterior. | Cero eventos de la petición retirada. Un 401 real vigente sigue emitiendo un evento y devuelve `locked`. |
| F3 · P2 · Lectura atribuida a otra tarea | Un intento de `task-2` de la misma copia devuelve `read` en `asSaveStrategy().verify` para `task-1`. | El adaptador devuelve `unknown` para el par incorrecto. |

F1 nace en `exchange` de `src/local-task-intents-client.ts`. El listener de abort captura `dispatched:false` dentro de la puerta y resuelve la rama de cancelación. Al volver de la puerta, el trabajo sigue y llama a fetch. La reproducción usa el servicio real 316 R2, SQLite en memoria y un puente a Fastify inject que ignora la señal deliberadamente. El caso es un incumplimiento del contrato del cliente bajo ese transporte, sin afirmación sobre el resultado de fetch nativo en el piloto.

F2 está en la misma función. El plazo resuelve la carrera, pero la rama de trabajo sigue viva y publica el evento global antes de mirar si la señal ya caducó. El test controla el retardo del transporte y usa alta, bloqueo, login y 401 del servidor real. Mide el evento recibido, sin montar la App. El control vigente mantiene una emisión.

F3 está en `src/task-save-intent-strategy.ts`. `verify` conoce el ID de la tarea y `check` valida intento y ámbito. El adaptador pierde el vínculo con la tarea al devolver la lectura. El gestor consume ese resultado como evidencia para su operación. La sonda invoca el adaptador con un par incoherente usando dos tareas reales de la misma copia. La generación de ese par en el gestor normal queda fuera de esta reproducción.

## Corte y evidencia

- El banco toma el servidor 316 R2 del corte 319, el gestor con UUID del corte 314 y el lector acotado de la normalización LF aceptada. Conserva procedencia de las dependencias históricas y huellas de los cinco archivos presentados. Es una ejecución focal con montaje explícito de la API dentro del test.
- En `tests/.tmp/consumer322-FOipqm` se congelaron 90 entradas y se ejecutaron 16 archivos de pruebas. **250/253**, con 127 del corte API, 100 del corte UUID, 22 de Claude y el control 401 vigente aprobados. Los tres fallos son F1, F2 y F3. Typecheck limpio y cero omitidas, canceladas o pendientes. Duración 134.671 ms. Las 90 huellas se cotejaron al cierre. Las cuatro sondas se fijan por SHA-256 `c779d7f744f78d5726dfd229213127bf1de9d4c79a50093833d43038d1405498`.
- La primera copia omitió el lector acotado. Tras añadir su versión aceptada, el sandbox ordinario devolvió `EACCES` para sockets de loopback en parte de las regresiones. Las tres reproducciones por inject alcanzaron sus aserciones. La ejecución final usa loopback efímero con bloqueo de red exterior.
- En la copia causal `tests/.tmp/consumer322-causal-myKXDQ`, una guarda tras la puerta evita F1, otra tras fetch evita F2, y comprobar el ID de la operación en el adaptador evita F3. Pasan **26/26** con tipos limpios, incluidas las 22 pruebas de Claude y las cuatro sondas del revisor. Se restauraron las fuentes TypeScript de la copia y se cotejaron las huellas originales. El JavaScript derivado de ese banco conserva las guardas del experimento.
- 316 R2 separa `TASK_INTENT_NOT_DISPATCHED` de `TASK_INTENT_STORAGE_UNAVAILABLE`. El cliente actual conserva un estado incierto seguro para ambos y omite el código cerrado nuevo. El primero acredita cero invocaciones al escritor en esa petición, con posible reclamación persistida. El brief pide preservar esa distinción y comprobar por el mismo ID. Este ajuste de compatibilidad queda separado de los tres fallos reproducidos.

El adaptador sigue fuera de Hoy hasta que el gestor pueda conservar el acuse compacto sin inventar un registro. Los resultados corresponden a los bancos ficticios y no verifican la app instalada. Las guardas experimentales no cambian los cinco archivos de Claude.
