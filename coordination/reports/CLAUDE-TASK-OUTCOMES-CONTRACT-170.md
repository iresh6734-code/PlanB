# CLAUDE-TASK-OUTCOMES-CONTRACT-170 · Contrato del gestor 136: `dispose()`, consumidor sustituido y razón segura del fallo

4/11/2026, Europe/Madrid. Unidad previa a U2. Sin navegador, MCP, proveedores, credenciales ni equipo corporativo; datos ficticios, servidor y procesos propios, red externa bloqueada por `scripts/block-external.cjs`. No se hicieron commits, despliegues ni worktrees. Esta unidad **no monta nada** en la App: solo cambia el contrato del gestor y sus pruebas.

## Problema (los tres huecos reproducidos antes de escribir)

| | Hueco en el gestor aceptado (136) | Consecuencia observada |
|---|---|---|
| A | No había forma de terminar al propietario. | Una operación en «comprobando» seguía y **enviaba su PATCH** aunque la sesión ya se hubiera descartado. |
| B | Sustituir `onConfirmed` durante una recarga. | Si la recarga del consumidor anterior rechazaba (Hoy se desmontó), la operación quedaba `failed`, el consumidor nuevo no leía, y un éxito tardío del anterior habría acreditado una vista que no se actualizó. |
| D | `queue.reason` descartaba el motivo del rechazo. | No se distinguía «falló el estado de la App» de «falló la lista de Hoy». |

(C — registrar dos veces el mismo consumidor — **no** duplicaba lecturas: queda como prueba de no regresión.)

## Cambio

`shared/task-save-outcome.ts`
- `OutcomeRefreshError(cause: 'state' | 'list')` con textos cerrados: «No se pudo actualizar el estado de la aplicación» / «No se pudo actualizar la lista de Hoy». `REFRESH_REASONS` y `refreshFailure()`. `QueueState.cause` (`state | list | timeout | unknown`).
- **Nunca se copia el mensaje de un error ajeno** (puede llevar URLs, rutas o datos). Solo se reconoce un `Error` con `name === 'OutcomeRefreshError'` y causa cerrada; cualquier otra cosa —incluido un objeto que solo imita `refreshCause`— queda `unknown` con razón vacía y el texto genérico anterior.
- `describeOperation`: para causa `state`/`list` se usa el texto controlado; `timeout`/`unknown` conservan el de 136. `canRetry` no ofrece reenviar una operación cancelada por `dispose()` (`detail.kind === 'disposed'`).

`src/task-save-outcome.ts`
- **`dispose(): { notDispatched, dispatched }`**, idempotente (la segunda llamada devuelve el mismo objeto). Después: `submit`/`retry` → `refused` («La sesión terminó…»); `verify`, `accept`, `retryQueue` y `setOnConfirmed` no hacen nada; no se notifica a suscriptores ni a consumidores.
  - Sin despachar (`checking`): pasa a `not_sent` con `detail.kind = 'disposed'`, **antes** de marcar el cierre, y se aborta la señal de la comprobación.
  - **Puerta única y síncrona en `onDispatch`**: si el propietario terminó, la operación ya no está en curso o su señal se abortó, lanza y **no entrega nada al transporte**. Es la frontera inmediata anterior al PATCH: cubre el caso en que las lecturas ya terminaron y ninguna sigue abortable.
  - Si la puerta rechazó, el resultado se fuerza a «no enviado» aunque la estrategia (como `saveTask`) haya convertido el error en «incierto» (que habría sido falso: no salió ningún PATCH).
  - Un envío **ya despachado** no se cancela ni se presenta como deshecho: su señal no se aborta, sigue su curso real y se registra (`confirmed`/`uncertain`/…), pero ya no notifica a nadie.
- **Consumidor con versiones.** Cada recarga lleva su número y la generación del consumidor con la que empezó. Si cambia el consumidor (otra función o `null`) o llega otra recarga, el resultado de la anterior —éxito o rechazo— **se descarta** y su espera se corta (sin temporizadores ni promesas colgando). Las recargas en curso se relanzan con el consumidor nuevo (una sola lectura, solo lecturas). `null` devuelve lo que se recargaba a «esperando una vista de Hoy». Registrar la misma función otra vez no hace nada. Lo ya validado (`ok`) **no** se relee al cambiar de consumidor (el siguiente montaje de Hoy lee por su cuenta); el comentario del contrato lo dice así.
- Contrato de `SaveStrategy`: `onDispatch()` se llama síncronamente justo antes de entregar la escritura al transporte y puede lanzar; una estrategia que escriba sin llamarlo queda fuera de la garantía de `dispose()` (documentado; 128 deberá respetarlo).

`tests/task-focus-outcomes.test.ts`: solo las dos huellas del gestor (la prueba de U1 conserva sus aserciones de comportamiento).

## Hashes (SHA-256)

| Archivo | Antes | Ahora |
|---|---|---|
| `shared/task-save-outcome.ts` | `1007ac93804f7ae7a075329644d589e991fca5e5272f0f1cb6e254ba3eccdd17` | `da79ae6d33777b60aacb876de55a91312eafcc026070adb8ccbc3645115c5956` |
| `src/task-save-outcome.ts` | `c356d1aa00f4af7d11417acd6f47315b80c26009a5b665b581718dbcb235b050` | `a23e099a…` (R1) → `d2aaed72add5ed8c5dcf5d804009c280010ecb861ad25c5f7e9077bcbf1634ca` (R2) |
| `tests/task-save-outcome.test.ts` | `8a27ca1f…` | `75ac140f3c3d0838f11a542a8b64460b65d41bb04f69d1cced1a7cc4d7e7f60e` |
| `tests/task-focus-outcomes.test.ts` | `132e405a…` | `41292fd47c68377f3af057f62a4a19651907edeb99a303afe5b84b4e6155da72` |

Las fuentes «antes» se reconstruyeron en una carpeta ignorada (`tests/.tmp/u170-base/`) y **coinciden byte a byte** con los hashes de la línea base del tablón. Fijas sin cambios: `LocalTaskFocus.tsx` `ac480c5f48ca7229276cc7c259157a239275eeeb3db404d1958402684eda2449`; `TaskSaveOutcomes.tsx` y `task-save-outcomes.css`, `local-task-focus-client.ts` y `shared/local-task-focus.ts` (huellas de la prueba de U1).

## Pruebas (sobre el corte final de estos hashes)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `tsx --test tests/task-save-outcome.test.ts` | **43/43** (23 de 136 y 128 intactas + **20 nuevas de 170**; el servidor es el real, `createBaseApp`, con barreras deterministas, sin esperas «para dar tiempo») |
| `tsx --test tests/task-focus-outcomes.test.ts` | 7/7 (U1 Node) |
| `tests/local-task-focus.test.ts` / `…-client.test.ts` | 11/11 y 21/21 |
| `tests/independent-task-outcomes.test.ts` | 1/1 |
| Playwright 136 (`task-save-outcome.spec.ts`) | **13/13** DOM |
| Playwright U1 (`task-focus-outcomes.spec.ts`) | **27/27** DOM |
| Playwright 123 (`local-task-focus.spec.ts`) / 140 (`task-focus-main.spec.ts`) | 26/26 y 6/6 DOM |

Las 20 nuevas cubren: dispose antes de comprobar, durante la comprobación (lectura retenida), justo antes del PATCH (puerta) y **después** de despachar con el acuse retenido-aplicado, retenido-perdido y la petición retenida antes de llegar al servidor; idempotencia y cierre total; gestor nuevo vacío frente a respuestas tardías del anterior; recarga en curso al terminar; consumidor sustituido (rechazo y éxito tardíos), retirado (`null`) y sin bucles; `OutcomeRefreshError` con URL/datos y objetos que imitan la causa; tiempo agotado; reintento que solo lee; estrategia que traga el rechazo de la puerta; textos distintos de `state`/`list`; abortos de señal; y ausencia de rechazos sin manejar.

### Baseline causal (contrapruebas)

Con las **fuentes originales** (misma prueba, con un cortafuegos de importación para que cargue): **17 de las 42 pruebas de entonces fallan, todas por la causa esperada** (la prueba de señales abortadas se añadió después y también exige `dispose`, así que falla por la misma causa): `controller.dispose is not a function` (huecos A, 9 pruebas), «lo valida el consumidor ACTUAL» / «el éxito del consumidor antiguo no cuenta» / «el rechazo del consumidor retirado» (hueco B) y `queue.cause`/razón (hueco D). La de «sin bucles» **pasa** con el original (C no era un fallo) y las 23 de 136/128 siguen pasando con el original.

### Mutaciones sobre el gestor nuevo

- Quitar el `throw` de la puerta de `onDispatch` → fallan «justo antes del PATCH» y «la estrategia que traga el rechazo».
- Quitar el reemplazo «puerta cerrada ⇒ no enviado» → falla la segunda.
- Quitar `abort()` del dispose → **sobrevivía**, porque la puerta y la guardia de estado ya impiden el PATCH; se añadió una prueba (señales abortadas / no abortadas) que la detecta. Quedan las tres detectadas.

## Límites y qué NO cubre

- **No persiste nada** ni sobrevive a recargar; no toca 128/166/183/185, ni multipestaña. El gestor sigue sin idempotencia de servidor (la API antigua no la tiene).
- `dispose()` solo garantiza lo que el gestor controla: que **él** no despache. Un PATCH ya entregado al transporte llega o no según la red; se cuenta en `dispatched` y no se puede deshacer. **El resumen es solo un recuento en el instante del cierre**; el estado detallado deja de ser accesible/notificado (U2 debe decidir qué se conserva, sin texto de tareas ni borradores).
- La puerta solo protege estrategias que llamen a `onDispatch` antes de escribir (la de 123 lo hace; documentado como obligación para 128).
- El texto de `LocalTaskFocus` ante `queue.failed` sigue siendo el de U1 («No se pudo recargar la cola.» + razón): con la causa tipada la razón se ve; el afinado visual de la ficha corresponde a U2.
- Fallos **preexistentes**, no causados por 170 (no tocan el gestor): `independent-task-focus-123.test.ts` «observation F1/F2» (documentan comportamiento de 123) y la huella de `LocalTaskFocus.tsx` en `task-focus-followup.test.ts` (falla por diseño tras U1, ya registrado; requiere unidad que reserve ese archivo y repita la QA de 130).

## Traspaso para U2

1. Crear una instancia por propietario de sesión con `createTaskSaveOutcomes()` y **un único** `onConfirmed` estable por instancia.
2. `onConfirmed` debe rechazar con `new OutcomeRefreshError('state')` si falla `refresh()` de App y con `'list'` si falla la recarga de Hoy; cualquier otro error se muestra genérico.
3. Al bloquear/desmontar el host: `const { notDispatched, dispatched } = outcomes.dispose()`. Guardar **solo `dispatched`** (sin resolver) para el aviso tras desbloquear; `notDispatched` ya no saldrá nunca. Una instancia nueva empieza vacía; las respuestas tardías de la anterior no la tocan (probado).
4. Si el bloqueo ocurre con la ficha abierta: `dispose()` antes de desmontar el árbol; la ficha no debe poder reenviar.
5. Un `dispatched > 0` tras el bloqueo **no es seguimiento**: es un contador. No declarar resuelto el seguimiento de operaciones tras el bloqueo; la persistencia es otra garantía.
6. Repetir sobre el corte final: `task-focus-outcomes`, `task-save-outcome` (43), 136/U1/123/140 DOM, y 151/155/158 sobre la App real.

---

# R2 · respuesta al dictamen 195 (F1, cierre reentrante)

**Defecto confirmado** con la sonda del revisor, sin modificarla (`NODE_ENV=test node --import tsx tests/.tmp/review195-reentrant.mjs`): en R1 `dispose()` asentaba y notificaba **antes** de marcar `disposed` y de fijar el resumen; un suscriptor síncrono podía registrar otro guardado que llegaba a `onDispatch`, mientras el resumen decía `dispatched: 0`.

**Cambio (solo `dispose()` en `src/task-save-outcome.ts`).** El orden pasa a ser:
1. Se **clasifica** sin llamar a nadie y se **fija el resumen** y el cierre (`disposed`, `onConfirmed = null`, versión de consumidor, cancelación de esperas, `listeners`/`inputs`/`aborts` vaciados). Desde este punto `submit`/`retry` devuelven `refused` y la puerta de `onDispatch` rechaza.
2. Con el gestor ya cerrado se asienta «no enviado» (`disposed`) y los suscriptores reciben **un único aviso final** (copia tomada antes de vaciar; si alguno lanza no impide terminar).
3. Solo entonces se abortan las comprobaciones (los listeners de `AbortSignal` también encuentran el gestor cerrado).
Una reentrada a `dispose()` desde cualquier callback devuelve el **mismo objeto** de resumen. Contado en el resumen: sin sustituidas (`supersededBy`), incierta y en vuelo cuentan como `dispatched`; lo despachado conserva su resultado real y no se anuncia como cancelado.

**Regresiones propias (5, en `tests/task-save-outcome.test.ts`, 48 en total):** suscriptor síncrono que pide `submit` y `retry` durante el cierre (refused, cero despachos, un solo aviso); reentrada de `dispose()` desde un suscriptor con una operación sin despachar y otra ya despachada (mismo resumen `{1,1}`; la despachada sigue `uncertain`); listener de `AbortSignal` que pide `submit`/`dispose`/`retry`; suscriptor que lanza; recuento exacto con descartada/incierta/en comprobación. **Contra R1 (hash `a23e099a…` reconstruido) fallan 4 de las 5**; la quinta fija el recuento y es de no regresión.

**Comprobaciones sobre el corte R2:** sonda 195 → `{"notDispatched":1,"dispatched":0}`, `reentrantSubmission:"refused"`, `writes:0`; `tsc --noEmit` limpio; Node en una pasada con `--test-concurrency=1`: **88/88** (48 gestor + 7 U1 + 11 + 21 + 1); DOM **136 13/13** y **U1 27/27** repetidos sobre R2 (123/140 no importan el gestor y no se repitieron). Procesos propios cerrados.

**Límites sin cambio:** sigue siendo contrato (no montaje en App), sin persistencia, y un contador `dispatched` no es seguimiento detallado tras bloquear: no se declara cerrado D7 en ese escenario.
