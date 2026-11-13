# QA-130 · Traspaso a Codex: integración verificable de la ficha 123 (corregida)

Complementa `coordination/plans/TASK-FOCUS-123-HANDOFF.md` (contrato y puntos de montaje). Aquí: qué verificar y qué prueba ya lo cubre en el arnés, y qué debe volver a probarse en la App real. **Este traspaso no autoriza editar `LocalOperations`/`App`**: hace falta una unidad con rutas exactas reservadas.

## Lista de integración (cada punto, con su verificación)

| # | Requisito | Verificación en la App real | Cobertura actual (arnés, NO App real) |
| --- | --- | --- | --- |
| 1 | Abrir cada tarea por ID desde Hoy sin confundir homónimas | Dos «Llamar a Ana» con IDs distintos: cada fila abre su ID (contexto muestra la ID; fecha límite distinta) | 123 DOM «abrir por ID…», 130 DOM «respuesta antigua tardía… homónimas» |
| 2 | Reservar rutas exactas antes de tocar `LocalOperations`/`App` | `node tools/coordination/board.mjs check-path …` por archivo | — (proceso) |
| 3 | `onSaved` **rechaza de verdad** si la recarga falla | Forzar fallo de `GET /api/v7/local-operations` tras un PATCH confirmado → «El guardado está confirmado, pero la cola de Hoy no se actualizó» y el acuse sigue | 130 DOM «401 en la lectura posterior de la cola», 123 DOM «guardado confirmado y recarga fallida», «D5» |
| 4 | Reintentar `onSaved` no escribe | Contar PATCH en el servidor tras varios reintentos: no cambia | 130/123 DOM (PATCH 1 tras reintentos) |
| 5 | Foco útil si el botón desaparece al completar | Guardar «Completada», volver: `document.activeElement !== document.body` | **no cubierto** (el arnés conserva la fila) |
| 6 | No cambiar `taskId` con borrador abierto sin pasar por la protección de cierre | Intentar abrir otra tarea con la ficha sucia: debe pasar por «Hay cambios sin guardar» | 123 DOM «cambio de tarea con borrador» prueba que NO se mezcla; **no** prueba la protección (no existe en el componente) |
| 7 | Barra lateral real, ficha y foco a 1440/390/320 | Sin desbordamiento; controles ≥44 px a ≤600 px; foco dentro del panel al guardar y de vuelta al cerrar | arnés con barra lateral vacía (geometría OK) |
| 8 | Tarea con fecha-hora en el DOM | Una especificación real con `datetime` en Auckland y Los Ángeles | 130 DOM «tarea con fecha-hora» (fixture ficticia modificada; no es la App) |
| 9 | Diferenciar API actual de 128 | Ver más abajo | contrapruebas de CAS (Node y DOM) |
| 10 | No mostrar «conectado/sincronizado/guardado» sin evidencia | La ficha distingue «Cambios guardados» (el servidor devolvió el registro), «Estado leído y aceptado por ti» (decisión humana) y «la cola no se actualizó» | 123 DOM «acuse perdido tras aplicar», 130 DOM D1/D5/D7 |

## Pruebas que sirven de criterio de aceptación para el montaje (ejecutables)

```powershell
npx tsx --test tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts tests/task-focus-followup.test.ts   # 40/40 en este corte
$env:PLANB_TF123_ROOT="<carpeta propia>"; npx playwright test -c "<carpeta propia>/pw.config.ts"   # 123 DOM (26) — necesita su pw.config propio (ver informe)
$env:PLANB_TF130_ROOT="<carpeta propia>"; npx playwright test -c "<carpeta propia>/pw.config.ts"   # 130 DOM (19)
```

Los specs construyen un bundle esbuild y arrancan un servidor hijo propio (puerto efímero, red externa bloqueada); no usan `npm run build`, `dist` ni demos existentes. Para repetirlos en la App real hay que sustituir el arnés por la página real y los puntos 3, 5, 6 y 7 pasan a ser pruebas nuevas.

## Cómo cambiaría el consumidor si se integra 128 (unidad futura; **no hecha**)

128 está `done` como servicio aislado, **bajo un único escritor** (la revisión 129 lo respalda para ese supuesto y no acepta montaje ni interfaz). Una unidad futura con reserva propia debería:

- Registrar `registerTaskRevision(app, store)` en `createBaseApp` (otra unidad: `server/app.ts` está reservado por 053) y verificar la exclusión de escritor del lanzador usado.
- En el cliente: leer con `GET /api/v7/task-revision/:id` y **guardar `revision`** junto al registro; enviar `PATCH` con `{ expectedRevision, values }`; interpretar `changed:false` (sin fila de historial) distinto de un guardado; distinguir el 409 de revisión (`details.code === 'TASK_REVISION_CHANGED'`: conservar el borrador y comparar «lo que viste / lo que escribiste / lo actual») de otros 409 (devolución en curso). Sin reintento automático.
- La comprobación previa de 123 (`findConflicts`) pasaría a ser del servidor; **se sigue necesitando** `/api/v2/state` para el esquema y el contexto de la copia, y el contexto ligado a instalación/captura/fecha/cuenta/generación sigue siendo válido (128 también ata la revisión a instancia, captura y especificación).
- Tras un acuse perdido, 128 no es idempotente por intención: un PATCH repetido tras un cambio exitoso da 409; la lectura posterior no demuestra autoría. La ficha seguiría tratando ese caso como incierto con decisión humana.
- No cubre las rutas antiguas ni escritores externos; no se debe presentar como CAS multiproceso.

## Lo que sigue abierto

D7 (cierre con PATCH en vuelo y respuesta perdida: sin aviso posterior; se avisa antes de salir), ventana residual entre la comprobación previa y el PATCH, y el origen del 401 intermitente original (hipótesis, ver informe). Cada uno necesita su propia unidad.
