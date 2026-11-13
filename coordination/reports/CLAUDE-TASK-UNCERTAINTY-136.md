# CLAUDE-TASK-UNCERTAINTY-136 · Informe (R2 tras la revisión 147)

> **R2.** La primera presentación fue devuelta a `working` por la revisión independiente `coordination/reviews/CLAUDE-TASK-UNCERTAINTY-136-independent.md` (hallazgo F1). Esta versión la corrige; las cifras, hashes y mutaciones de abajo corresponden a la R2. La sección «R2 · F1» detalla el defecto, su reproducción y la corrección.

2/11/2026 (Europe/Madrid). Agente: Claude. Entrega para revisión de Codex; no aceptada. **No está montada en la app real**: es un contrato, un gestor, una superficie y un arnés demostrable. ID elegido 136 porque 134 ya lo usa `CODEX-OPERATIONS-REVIEW-134`.

## Qué resuelve (D7) y qué no

**D7**: si la ficha se cerraba con un PATCH en vuelo y luego se perdía el acuse, nadie recibía aviso ni se actualizaba la cola. Ahora el **propietario de la operación** es un gestor independiente de la ficha:

1. `submit` registra la operación **antes** de enviar (comprobado: al primer aviso aún no había salido ninguna petición), ligada a instalación, captura (ID, fecha, cuenta, generación), ID de tarea y un intento local (`attemptId`, solo local: la API no admite claves de idempotencia).
2. Estados según evidencia: `in_flight` (con fase «comprobando»/«enviado»), `confirmed` (el PATCH devolvió el registro), `rejected` (el PATCH llegó y el servidor respondió 4xx → no escribió), `not_sent` (la comprobación previa cortó el envío), `uncertain` (el PATCH salió sin acuse utilizable) y `accepted` (decisión humana tras la lectura; el servidor no confirmó).
3. Con la ficha cerrada, el seguimiento sigue en el gestor y la superficie `TaskSaveOutcomesPanel` (que sigue montada) muestra «Guardando…», luego el resultado o la incertidumbre.
4. **Nunca reenvía por cuenta propia.** Reenviar es una llamada explícita de la persona, permitida solo si consta que no se envió (`not_sent`) o si la lectura, ligada a la copia original, muestra la tarea sin el cambio. Tras «aplicado», «divergente» o «copia cambiada» no se ofrece.
5. `verify` solo LEE (contexto antes y después, de 123). Un valor coincidente no prueba autoría: la vista lo dice y aceptar es una decisión humana que se registra como tal («Estado leído y aceptado por ti»).
6. La recarga de la cola (`onConfirmed`, equivalente a `onSaved`, con tiempo límite de 20 s) vive aparte: si falla, el guardado sigue confirmado y el aviso es persistente; «Reintentar la actualización» solo llama a la lectura. `setOnConfirmed` permite que el propietario viva **por encima de la navegación**: una confirmación sin vista de Hoy espera y, al registrarse la vista, se lee una sola vez.
7. Exclusión de doble envío: no hay dos operaciones sin resolver para la misma tarea y copia (doble clic, dos fichas): la segunda se rechaza **sin enviar**. Una operación incierta sin resolver también bloquea el siguiente envío hasta que la persona la resuelva o la descarte.

**No resuelve / límites declarados** (la superficie los muestra al usuario):
- **Solo memoria.** Recargar o cerrar la ventana pierde todo (probado: gestor nuevo vacío; tras recargar la página la superficie desaparece mientras el servidor conserva el cambio; `localStorage`, `sessionStorage` e IndexedDB quedan en 0). No se implementa persistencia: ver propuesta en el traspaso.
- **No cruza ventanas ni procesos.** Dos pestañas guardando el mismo campo: las dos confirman y gana la última (prueba «LÍMITE del gestor»). La API antigua no tiene CAS; 128 aporta comparación de revisión bajo un único escritor, no idempotencia por intención.
- **Cancelar la interfaz no deshace el PATCH**: abortar la señal tras enviar no cambia el resultado; antes de enviar da `not_sent`.
- Una ficha 123 **no usa todavía** el gestor: hasta una unidad de integración, D7 sigue abierto en la app (la ficha avisa antes de salir).

## Archivos

`shared/task-save-outcome.ts` (contrato, reglas `can*`, textos), `src/task-save-outcome.ts` (gestor con estrategia inyectable; `legacyStrategy` reutiliza **sin modificar** `saveTask`/`verifyAfterUncertain` de 123), `src/TaskSaveOutcomes.tsx` + `src/task-save-outcomes.css` (superficie), `tests/task-save-outcome.test.ts` (Node), `tests/e2e/task-save-outcome.spec.ts` (DOM). Rutas reservadas: 9 (las 7 sugeridas por el encargo más la superficie y su CSS, registradas al crear la unidad).

## Pruebas

Node v24.14.0, Playwright 1.64.1, chrome-headless-shell 1228, sin perfil; servidor hijo propio por prueba (puerto efímero 127.0.0.1, `scripts/block-external.cjs`); datos ficticios.

```powershell
npx tsx --test tests/task-save-outcome.test.ts                                   # 23/23
$env:PLANB_TS136_ROOT="<repo>/tests/.tmp/taskuncertainty136-19303ae9-76ec-4b8c-95af-f4648688ae59"
npx playwright test -c "$env:PLANB_TS136_ROOT/pw.config.ts"                       # 13/13
npx tsc --noEmit -p .                                                             # 0 errores (árbol actual; no es regresión global)
npx tsx --test tests/local-task-focus.test.ts tests/local-task-focus-client.test.ts tests/task-focus-followup.test.ts   # 40/40 (123+130 aceptadas, repetidas)
```

**Node (23, contra el servidor real; los fallos de red se inyectan envolviendo `fetch`, nunca simulando el servidor)**: huella de las fuentes de 123; registro previo al envío; **D7**: PATCH aplicado + ficha cerrada + acuse perdido → incierto, sin reenvío (300 ms de espera), verificar no escribe, aceptar = decisión humana; PATCH confirmado tras cerrar → confirmado y cola solo por lectura; cola caída → confirmado + aviso, reintento solo lee (y cola que no responde → «tardó demasiado»); PATCH que nunca llegó → nunca «guardado», reenviar solo tras «sin cambios» y como intento nuevo; homónimas y llegada tardía con barrera; cambio de captura (misma ID, otra fecha) e instalación distinta → «contexto cambiado», sin aceptar/reenviar; doble envío / dos tareas / incierto sin resolver; contraprueba de dos propietarios; 422/409/404 (en la comprobación y en el propio PATCH)/401 (idem)/timeout; cancelar≠deshacer, desmontar, recarga; tope de operaciones; navegación (`setOnConfirmed`); y **tres pruebas con un adaptador de 128** (ver abajo).

**DOM (13, Chromium, arnés de «Hoy» con mini-ficha propia que entrega y se cierra)**: D7 completo con «Guardando…» → «No se sabe…» → «Comprobar» → «Aceptar»; confirmado tras cerrar; cola fallida y reintento de lectura; PATCH no llegado y reenvío explícito; homónimas; cambio de captura; doble envío; 409/422/404/401 con «Lo que escribiste» visible; solo memoria y recarga; y 1440/390/320 con teclado (Tab→«Comprobar ahora»→Enter), nombres únicos por tarea, sin desbordamiento y objetivos ≥32/44 px.

**Mutaciones (regresiones que detectan el problema)**, sobre copias privadas del código R2: M1 reenvío automático tras «sin cambios», M2 cola caída = guardado fallido, M3 aceptar = «confirmado» → cada una hace fallar exactamente una prueba Node y la del DOM; M4 sin la guarda de exclusión (ahora en `start`) → 6 pruebas Node y 2 DOM. (La mutación M4 de la primera versión quedó obsoleta al mover la guarda; la reescribí y la repetí.) Sin ellas «regresión» sería una etiqueta.

**Hallazgos durante la unidad**: (1) un 422 mostraba «Revisa los campos señalados» sin decir cuáles → ahora muestra campo y motivo (lo encontró mi propia prueba DOM); (2) un gestor que viva en la vista de Hoy se destruiría al navegar → `setOnConfirmed`; (3) dos fallos de mis pruebas por carreras propias (apagar la «devolución en curso» antes de que el PATCH llegara) corregidos esperando al resultado.

## Adopción de 128 (solo lectura; fuentes aceptadas sin tocar)

El gestor recibe una **estrategia**; el adaptador de 128 está en la prueba (`revisionStrategy`) como referencia ejecutable. Verificado contra `registerTaskRevision` real: guardar con `expectedRevision` confirma; un 409 de revisión (`details.code === 'TASK_REVISION_CHANGED'`) se distingue de un 409 por devolución en curso; tras un acuse perdido que sí se aplicó, reenviar con la revisión antigua da 409 y no duplica (la protección es de 128, no del gestor); una edición idéntica de otra persona produce la misma evidencia «aplicado» (no hay autoría); `changed:false` no deja historial; y una escritura por la **ruta antigua** sigue siendo posible y cambia la revisión (128 no la protege). **Incompatibilidades/huecos hallados** (ninguno impide integrar): el resultado de guardado de 123 no transporta la **nueva revisión** (el consumidor debe releerla; la cola/reapertura ya lo hace); un `changed:false` se mapea a «confirmado» y debería rotularse «sin cambios»; 128 expone `instanceId/captureId/capturedAt` pero no cuenta/generación (identidad más débil que la de 123, compensada porque su revisión resume captura, especificación y sesión). Hipótesis sin demostrar: coste de la revisión con capturas grandes (lo declara 128), y exclusión de escritor en lanzadores distintos del ensayado por 129.

## Capturas

`tests/.tmp/taskuncertainty136-19303ae9-76ec-4b8c-95af-f4648688ae59/shots/`: `superficie-1440|390|320.png` **inspeccionadas por mí** (versión final con el indicador de despliegue). `incierto-1440.png` (versión previa a ese indicador) **no la he mirado**.

## Hashes (SHA-256) y procesos

| Archivo | SHA-256 |
| --- | --- |
| shared/task-save-outcome.ts | 1007ac93804f7ae7a075329644d589e991fca5e5272f0f1cb6e254ba3eccdd17 (sin cambios en R2) |
| src/task-save-outcome.ts | c356d1aa00f4af7d11417acd6f47315b80c26009a5b665b581718dbcb235b050 |
| src/TaskSaveOutcomes.tsx | 328e2ea6cd3df7c1df8896ce13c429f3e65357265aca013b8baababf73adfc60 |
| src/task-save-outcomes.css | 14fca19177bad375db04bd20727ccec80099bfb258e6f2cdf75c8582fee3903e |
| tests/task-save-outcome.test.ts | 8a27ca1f5e4c87c69d0f7d854e7cbffd4dff128c440dd4621272809e30de81be |
| tests/e2e/task-save-outcome.spec.ts | c098246f3e3ba17ab6f163efe1d69978610f0c2aca6e1707d05a5f18bf0c243c |

Fuentes de 123 importadas sin modificar (fijadas por la prueba de huella): `src/local-task-focus-client.ts` 535177583a1defa3…, `shared/local-task-focus.ts` 40332326d058dfd5…. Todos los procesos de servidor propios cerrados (0 `node` con `taskuncertainty136`/`server.mts`). Carpeta propia: `tests/.tmp/taskuncertainty136-19303ae9-…/` (git la ignora; contiene bundle, `server.mts`, config, `mut/`, capturas, logs).

## Límites de esta evidencia

Arnés ≠ App real (barra lateral vacía, mini-ficha propia, sin `LocalOperations`); Chromium headless solo; sin lector de pantalla ni contraste calculado; sin proveedores, cuentas ni datos reales; sin prueba multiproceso ni de caducidad de sesión por tiempo; la persistencia es una propuesta no probada.

## Coordinación

Sin canal operativo con Codex desde esta sesión (el servidor MCP `codex` no conectó): el tablero y esta entrega son el aviso, y **no hay prueba de que se hayan leído**. 123 y 130 estaban `done` al cerrar; no se tocó ningún archivo de 123, 130, 128, 129, 116, App, LocalOperations ni Store. No encontré defectos nuevos en 123 durante su review; D7 es el límite ya conocido que esta unidad prepara cerrar.

## R2 · F1 de la revisión 147: `retry` eludía la exclusión

**Defecto (a, reproducido por Codex y por mí).** `submit` rechazaba una segunda operación sin resolver para la misma tarea y copia, pero `retry` llamaba directamente a `start` sin comprobarlo. Con A «no enviado», B en vuelo (PATCH retenido) y `retry(A)` salían **dos PATCH** de la misma tarea y copia y ambos se confirmaban (2 cambios reales). Es una infracción de la exclusión **dentro del mismo gestor y ventana**, no la limitación multipestaña ya declarada.

**Corrección.** La exclusión pasa a `start`, el único camino que registra y envía, y la usan `submit` **y** `retry`. Si hay otra operación sin resolver (en comprobación, enviada o incierta) para la misma clave (copia + ID de tarea) y no es el intento que se está sustituyendo, se devuelve `busy` **sin registrar un intento, sin enviar y sin tocar** ni el intento reciente ni el anterior (no se marca `supersededBy`). No bloquea otras tareas ni otras copias. La superficie ya no ignora el resultado de «Reenviar»: ante `busy` muestra «No se reenvió: esta tarea ya tiene un guardado en curso o sin resolver… este intento sigue disponible».

**Pruebas causales.** Node: A «no enviado» + B en vuelo + `retry(A)` → `busy`, un solo PATCH, A y B idénticos antes/después (se compara el estado serializado completo) y A sigue reintentable al resolverse B; con B **incierto**; dos clics de reintento y dos intentos «no enviados» de la misma tarea (solo uno avanza); otra tarea/otra copia sí avanzan (control); `retry` y `submit` en el mismo turno. DOM: la superficie explica el rechazo y conserva ambos intentos con un único PATCH. **Contra el controlador anterior (reconstruido revirtiendo solo la guarda): fallan las 3 regresiones Node que ejercitan F1 (la de control pasa en ambos) y la prueba DOM**; con la R2 pasan. La observación `tests/independent-task-outcomes.test.ts` de Codex **ahora falla a propósito** («DEFECT OBSERVATION: the retry starts despite…»): su protocolo prevé invertirla o sustituirla bajo su reserva; yo no la toco.

**Otros caminos de reintento revisados.** `accept`, `retryQueue`, `verify` y `dismiss` no escriben. `retry` de un intento incierto con «sin cambios» sigue permitido porque excluye al propio intento sustituido y no puede coexistir con otro (un `submit` posterior sería `busy`). Verificar durante un reintento solo actualiza el intento sustituido, sin efecto. Sin cambios: no hay idempotencia entre pestañas ni procesos.

Regresión: 123+130 (40/40) intactas y `tsc` 0 errores. Hashes anteriores (R1) de `task-save-outcome.ts`, `TaskSaveOutcomes.tsx`, `task-save-outcomes.css` y los dos archivos de pruebas se sustituyen por los de la tabla de arriba.
