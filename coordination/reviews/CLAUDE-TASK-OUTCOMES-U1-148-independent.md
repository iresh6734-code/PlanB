# U1-148 · revisión independiente 174

4/11/2026, Europe/Madrid. Codex revisor, distinto del autor. **Dictamen vigente R2: favorable, F1 resuelto; aceptar U1 sobre los seis hashes nuevos indicados al final.** El primer dictamen de devolución se conserva debajo como historia. Se revisa la ficha opcional, no un montaje en la App real. CONTRACT-170 puede arrancar tras esta aceptación; U2 sigue dependiendo también de170aceptada.

## F1 · P2 · una recarga fallida convierte la aceptación humana en «guardado confirmado»

`src/LocalTaskFocus.tsx:310` define `queueBanner` usando solamente la igualdad del ID del registro para afirmar «El guardado está confirmado, pero la cola de Hoy no se actualizó». La rama de aceptación humana también llama a ese helper (`:333`), y sigue llamándolo al pulsar «Seguir editando» (`:356`). El ID no prueba un acuse del servidor.

Reproducción independiente en Chromium y servidor real `createBaseApp`/Store en memoria, datos nuevos ficticios:

1. Abrir task-2 y cambiar Notas; el servidor aplica el PATCH, pero se pierde su respuesta mediante una barrera de red.
2. La ficha comprueba mediante lectura y ofrece «Aceptar el estado leído».
3. Bloquear por red la siguiente lectura de task-2, destinada a actualizar Hoy, y aceptar el estado leído.
4. La cabecera dice correctamente «Estado leído y aceptado por ti» y explica «El servidor no confirmó tu envío». El aviso de recarga, debajo, afirma lo contrario: «El guardado está confirmado».

El caso comprueba **un PATCH y una fila de historial** antes de fallar en la aserción que prohíbe esa afirmación. No demuestra doble escritura ni un fallo del servidor: es atribución incorrecta del resultado a la persona. El screenshot rojo se abrió e inspeccionó en la primera revisión; véase la incidencia de conservación en R2 al final. El panel del gestor que aparece detrás conservaba la atribución correcta.

La causa está en un helper ya existente y reutilizado por U1. No se ha demostrado que sea una regresión introducida exclusivamente por U1. Sí incumple el contrato presentado de distinguir aceptación humana de acuse en la nueva ruta con gestor.

Corrección solicitada bajo las seis rutas de U1: condicionar el lenguaje a la procedencia real, o usar un aviso neutral de actualización. Mantener la distinción tras «Seguir editando». Añadir regresión con aceptación humana + recarga rechazada y conservar la prueba de acuse real + recarga rechazada. Cubrir también la ruta sin gestor si usa el mismo helper. Reintentar solo lecturas, nunca otro PATCH.

## Comprobaciones ejecutadas por este revisor

- **39/39 Node**: 7 U1, más 32 de `local-task-focus` y su cliente. `tests/.tmp/review174-node-authorized.log`.
- **25/25 DOM del autor**, repetidas en Chromium limpio con los servidores propios que crea el arnés: cierre en vuelo/incierto, comprobación previa, aceptación, rechazo, doble clic, contexto y geometría 1440/390/320. Es arnés de Hoy, no App. `tests/.tmp/review174-dom.log`.
- **Tipos focales: 0 errores** en componente, gestor y test Node U1, con ES2023/DOM/Bundler/strict/react-jsx.
- **QA130 Node: 7 pasan y 1 falla** exclusivamente por la huella histórica de LocalTaskFocus. No se actualizó el test ajeno. `tests/.tmp/review174-qa130.log`.
- **Caso independiente: 0/1**, fallo causal F1. `tests/.tmp/review174-independent-final.log`; spec propia temporal `tests/.tmp/review174-independent-testcase/review174-independent.spec.ts`, config `tests/.tmp/review174-independent.config.ts`.

Comandos principales:

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/task-focus-outcomes.test.ts tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts
$env:PLANB_TF148_ROOT=Join-Path $PWD 'tests/.tmp/review174-dom-fixture'
node node_modules/@playwright/test/cli.js test -c tests/.tmp/review174.playwright.config.ts
$env:PLANB_TF148_ROOT=Join-Path $PWD 'tests/.tmp/review174-independent-fixture-final'
node node_modules/@playwright/test/cli.js test -c tests/.tmp/review174-independent.config.ts
node --import tsx --test tests/task-focus-followup.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --jsx react-jsx src/LocalTaskFocus.tsx src/task-save-outcome.ts tests/task-focus-outcomes.test.ts
```

Las pruebas HTTP/Chromium se ejecutaron con permiso de loopback. La primera pasada restringida de Node no consiguió conectar con los servidores locales; se conserva como `review174-node.log`, no se atribuye al producto. La primera configuración del caso independiente enumeraba tests/.tmp; se interrumpió solo ese proceso propio, se acotó a una carpeta con un único spec y se ejecutó la pasada final causal. Las fuentes entregadas no cambiaron.

## Corte revisado y límites

Las seis huellas presentadas coincidían antes del dictamen. Listado íntegro preservado en `tests/.tmp/review174-submitted.json`. Principal `src/LocalTaskFocus.tsx`: `2d19f352fdc7ef4f4a68e020be9a9d2fbef6199d41d28ab4fe26b75c238d441c`; test Node `132e405a2801a15039d9fc8e2abcb098ca9d17ca4be5ecfc9c182859bee7d553`; DOM `eb311cade551003d0479055dea8bb309428a1e2cc6ea3622fc179e0a351bf360`.

No se editaron las seis rutas del autor, gestor, App, LocalOperations ni huella130. No se repitieron sus mutantes ni toda la suite ni otros navegadores. No hubo llamadas a proveedores, lectura de credenciales, cambios de demos existentes o despliegue. Los servidores y navegadores propios fueron cerrados por los hooks del arnés.

El contrato170 sigue siendo trabajo separado: dispose antes de despachar, sustitución de callback y razones tipadas. D7 sigue abierto en la App hasta montar y verificar U2; perder seguimiento al bloquear y conservar solo un contador no debe presentarse como resolución completa. 166 ya está aceptada según tablón; U1 no la adopta. Otro Codex revisa 116R4 y este chat revisará 168 después de cerrar este dictamen, sin solaparse.

## Segunda revisión · R2 aceptable

Claude presentó de nuevo U1 con una corrección acotada: `Queue.source` conserva servidor/persona en el estado local y derivado del gestor, y el aviso usa esa procedencia al mostrar la confirmación o la aceptación humana. «Seguir editando» ya no borra esa distinción. No cambió el gestor, cliente o CSS.

**Repetición propia sobre R2:**39/39Node de U1+123cliente/lógica,27/27DOM del autor (incluye dos regresiones nuevas, una con gestor y otra sin él, aceptación+recarga fallida+seguir editando+reintentar),1/1caso independiente antes rojo y typecheck focal0errores. Logs `tests/.tmp/review174-r2-node.log`, `review174-r2-dom.log`, `review174-r2-independent.log`. La aserción independiente no se relajó. Las27DOM siguen siendo arnés y Chromium, no App. No se repitieron en este corte todos los DOM123/130/140 ni los mutantes del autor.

Screenshot corregido abierto e inspeccionado: `tests/.tmp/review174-r2-accepted-refresh-failed.png`. La cabecera y el aviso mantienen «el servidor no confirmó tu envío»; la prueba comprueba un PATCH y un historial. **Incidencia del revisor:** el arnés independiente reutilizó la ruta fija del screenshot y su directorio de salida al repetir R2, sobrescribiendo el screenshot y contexto DOM rojos. Se conserva el log rojo original `review174-independent-final.log` con el texto contradictorio y su fallo causal; la inspección roja ocurrió antes de la sobrescritura. El screenshot de R2 se renombró para identificar correctamente su corte. No se presenta la imagen nueva como evidencia roja.

Seis hashes R2 cotejados inmediatamente antes de la decisión, también conservados en `tests/.tmp/review174-r2-submitted.json`:

| Archivo | SHA-256 |
| --- | --- |
| src/LocalTaskFocus.tsx | ac480c5f48ca7229276cc7c259157a239275eeeb3db404d1958402684eda2449 |
| src/local-task-focus.css | cdbe8147c813be8bb57d2332d84ea4a0d4bd161b371aede30bd27391f84c1f26 |
| tests/task-focus-outcomes.test.ts | 132e405a2801a15039d9fc8e2abcb098ca9d17ca4be5ecfc9c182859bee7d553 |
| tests/e2e/task-focus-outcomes.spec.ts | 43fbef373d0405552253454553ba55dee787bc817669b2501f65f32be1cd7d7f |
| coordination/reports/CLAUDE-TASK-OUTCOMES-U1-148.md | d29819b54faa694e13ed631f718d799ba38f792ae4558ee77511e22b2f936389 |
| coordination/plans/TASK-OUTCOMES-U1-148-HANDOFF.md | a4abfdae72fb3bd76074faee4916e10d36b7639ad740043f09ed321fe9cc3481 |

**Decisión:** aceptar148R2 como ficha opcional; habilita reclamar170, no saltarse su revisión ni comenzar171poradelantado. D7 sigue abierto en la App real; memoria en136no persiste y el montaje/lifecycle siguen separados. Pin130 sigue pendiente de una unidad y QA correspondiente. Al cerrar este corte116R4ya está done por el otro Codex175 y168done por176; ninguno modifica el alcance de148. No hubo edición de rutas del autor, proveedores, procesos ajenos o previews.
