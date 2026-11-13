# 233 · Dictamen independiente de guardado condicionado

## Dictamen vigente · R2 favorable

6 de noviembre de 2026, Europe/Madrid. Se cotejaron las siete huellas de R2 con el checkout y la proyección propia. `reviewedFrom` exige que el ID declarado coincida con el registro base, tanto para guardar como para verificar. Guardar ofrece además un mensaje específico. Se conservan el token que revisó la persona y la puerta previa al PATCH.

En `tests/.tmp/review233-r2-N9zihE` pasan 117/117 pruebas, con tipos focales correctos y cero skips. Se repiten las tres sondas de Codex sin modificar sus aserciones, las quince pruebas de la estrategia y las suites de gestor, host, adopción, cliente y generación. El servidor del corte sigue siendo el aceptado de 185. Las peticiones de la estrategia se probaron contra servidores locales efímeros. Con tareas homónimas y IDs discrepantes no sale ningún PATCH, el borrador queda conservado y verificar devuelve desconocido sin petición. El control positivo confirma la tarea correcta una sola vez. No se repitió el banco más amplio de 171 casos del autor ni su fallo de entorno de clave local.

Se acepta la pieza de estrategia. Su consumidor en la ficha y la elección del host conservan su propio encargo. 220 puede reclamar la prueba de huella liberada por esta entrega. La App todavía necesita demostrar el recorrido condicionado desde su punto de entrada normal.

## Dictamen anterior · Primera presentación

6 de noviembre de 2026, Europe/Madrid. Codex. **Devuelta para R2.** La nueva presentación selló los siete archivos, incluidos informe y traspaso. Se cotejaron las huellas exactas antes del ensayo y al presentar este dictamen. El corte aislado combina la proyección revisada de 236, los bytes aceptados de 166/183/185 y la entrega de Claude. Se tomó `server/task-revision.ts` de 185 en 236 porque el checkout contiene la revisión pendiente de 206. Los dos cortes de servidor quedan separados.

## Hallazgo · Un intento puede confirmar un guardado de otra tarea

`reviewedFrom` en `src/task-revision-strategy.ts:20` reconstruye una vista a partir de `baseline` y el token sin comprobar su correspondencia con `request.taskId`. El gestor conserva y muestra el ID declarado. El cliente de revisión forma el PATCH con el ID del registro base. Si el adaptador futuro mezcla la selección actual con la lectura retenida de otra ficha, las dos capas identifican tareas distintas y el servidor puede aceptar un token válido para la segunda. La verificación comparte la misma reconstrucción y atribuye al intento una lectura de la segunda tarea. Se reprodujo en el contrato del gestor y el servidor, previo a su montaje en la ficha.

En dos tareas homónimas con IDs `task-1` y `task-2`, se leyó un token válido de `task-2` y se llamó al gestor con esa base y `taskId: 'task-1'`. El corte exacto devuelve `confirmed`, mantiene `task-1` como tarea del intento, devuelve `task-2` como registro, envía un PATCH a `/api/v7/task-revision/task-2` y crea una fila de historial. En verificación, el corte exacto devuelve `read` y la secuencia de GET incluye `/api/v7/task-revision/task-2`. En ambos casos se usó `createBaseApp({ taskRevisions: true })` con SQLite en memoria y `Fastify.inject`. El control positivo con los mismos IDs en petición y base confirma el guardado una sola vez.

La propuesta privada exige igualdad de los dos IDs en la función compartida de reconstrucción. Conserva la intención como no enviada, sin historial y sin `revised`. La verificación devuelve desconocido sin peticiones. El control positivo conserva un solo PATCH con la revisión original. La fuente propuesta se guardó aparte y se restauraron los bytes exactos de 233 dentro del propio corte después del contraste.

## Resultados

| Comprobación | Presentación exacta | Guarda privada |
| --- | --- | --- |
| Dos discrepancias de identidad y control positivo | 1 pasa, 2 fallan por la tarea observada | 3/3 |
| Estrategia, gestor, host, adopción y tres suites de cliente/generación | 110/110 | 110/110 |
| Total con la regresión y sus dos fallos causales separados | 111 pasan, 2 fallan | 113/113 |
| Tipos de la propuesta, pruebas y dependencias transitivas | — | Correctos |

No hubo skips, TODO ni cancelaciones. Las pruebas del autor con escucha HTTP se repitieron en loopback efímero con entorno permitido y bloqueo de red exterior. La prueba de identidad usa inyección local. No se ejecutaron las pruebas DOM/E2E ni el banco completo del checkout. La huella conocida del panel pertenece a 220. Los primeros intentos del arnés detectaron una diferencia de fuente 185/206 y dos problemas de tipado propios de la prueba; se separaron del corte final y se corrigieron antes de reportar los resultados.

Artefactos en `tests/.tmp/review233-IdwxyC`. `exact-target.log`, `proposed-target.log`, `exact-focals.log`, `proposed-focals.log`, `proposed-types.log` y `result.json` conservan la evidencia. `reviewed-strategy.ts` corresponde a la huella presentada `3162cb831fe72fb93b24f6796cddce47e9eb3f40e548475cc3d733b4ca1d214e`. La guarda de contraste está en `proposed-strategy.ts` y la prueba en `s/tests/review233-target.test.ts`.

El autor conserva sus siete archivos para la R2. El encargo [233 R2](../briefs/CLAUDE-TASK-REVISION-STRATEGY-233-R2.md) pide integrar la guarda y las regresiones y presentar el nuevo corte. La App 236 continúa con su estrategia anterior y conserva sus binarios. Sin montaje, despliegue, proveedor, commit ni cambios en las rutas de Claude.
